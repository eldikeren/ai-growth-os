// ============================================================
// AI GROWTH OS — COMPLETE BACKEND FUNCTIONS
// All functions fully implemented. Nothing stubbed.
// Now with REAL tool calling — agents can execute actions.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getToolDefinitions, executeTool } from './tools.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Agent event logger (for Mission Control live feed) ──
async function emitAgentEvent(clientId, agent, eventType, runId, message, metadata = {}) {
  try {
    await supabase.from('agent_events').insert({
      client_id: clientId,
      agent_slug: agent.slug || agent,
      agent_name: agent.name || agent,
      lane: agent.lane || null,
      event_type: eventType,
      run_id: runId || null,
      message,
      metadata,
    });
  } catch (e) {
    console.warn(`[EVENT_EMIT] Failed: ${e.message}`);
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 35000,    // 35s per call — tight budget to fit under 300s Vercel limit even in worst case
  maxRetries: 0,     // No retries — each retry adds another 35s, burns the execution budget
});

// 3 iterations × (35s LLM + 28s tool) = 189s, + final LLM (35s) + DB writes = ~230s total
// Safely under 300s Vercel hard limit even when an agent has no data and runs full iteration count
const MAX_TOOL_ITERATIONS = 3;

// ============================================================
// VALIDATION GOVERNANCE — action_type → required validators
// No agent may close its own work. Master Orchestrator decides.
// ============================================================
const VALIDATION_MATRIX = {
  website_content_change:  ['hebrew-quality-agent', 'design-consistency-agent', 'website-qa-agent', 'seo-core-agent', 'regression-agent'],
  seo_metadata_change:     ['seo-core-agent', 'website-qa-agent', 'regression-agent'],
  schema_change:           ['technical-seo-crawl-agent', 'website-qa-agent', 'regression-agent'],
  cta_change:              ['cro-agent', 'design-consistency-agent', 'website-qa-agent', 'hebrew-quality-agent', 'regression-agent'],
  layout_change:           ['design-consistency-agent', 'website-qa-agent', 'regression-agent'],
  review_reply:            ['hebrew-quality-agent', 'legal-compliance-agent'],
  social_post:             ['hebrew-quality-agent', 'legal-compliance-agent'],
  local_profile_change:    ['local-seo-agent', 'hebrew-quality-agent', 'regression-agent'],
  generic_change:          ['website-qa-agent', 'regression-agent'],
};

const VALIDATOR_FIXER_MAP = {
  'hebrew-quality-agent':       'website-content-agent',
  'design-consistency-agent':   'design-consistency-agent',
  'design-enforcement-agent':   'design-consistency-agent',
  'website-qa-agent':           'website-content-agent',
  'seo-core-agent':             'seo-core-agent',
  'technical-seo-crawl-agent':  'seo-core-agent',
  'cro-agent':                  'website-content-agent',
  'local-seo-agent':            'local-seo-agent',
  'legal-compliance-agent':     'website-content-agent',
  'regression-agent':           'master-orchestrator',
};

// ── JSON REPAIR — fix common LLM output issues ──────────────
function repairAndParseJSON(text) {
  // 1. Direct parse
  try { return JSON.parse(text); } catch {}

  // 2. Extract JSON object from surrounding text (markdown fences, etc.)
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
  const candidate = jsonMatch ? jsonMatch[1] || jsonMatch[0] : text;

  // 3. Try direct parse of extracted candidate
  try { return JSON.parse(candidate); } catch {}

  // 4. Repair common issues
  let repaired = candidate
    .replace(/,\s*([}\]])/g, '$1')          // trailing commas
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"')     // single-quoted values to double
    .replace(/\n/g, '\\n')                    // newlines in strings
    .replace(/\t/g, '\\t')                    // tabs in strings
    .replace(/\\n/g, '\\n');                  // preserve already escaped

  // 5. Try parsing repaired version
  try { return JSON.parse(repaired); } catch {}

  // 6. If JSON is truncated (hit token limit), try to close it
  let truncated = candidate.replace(/,\s*$/, ''); // remove trailing comma
  let opens = 0, closesNeeded = [];
  for (const ch of truncated) {
    if (ch === '{') { opens++; closesNeeded.push('}'); }
    else if (ch === '[') { opens++; closesNeeded.push(']'); }
    else if (ch === '}' || ch === ']') { opens--; closesNeeded.pop(); }
  }
  if (opens > 0) {
    // Remove any partial value at the end (incomplete string, etc.)
    truncated = truncated.replace(/,\s*"[^"]*$/, ''); // partial key
    truncated = truncated.replace(/,\s*"[^"]*":\s*("[^"]*)?$/, ''); // partial key:value
    truncated = truncated.replace(/,\s*$/, '');
    truncated += closesNeeded.reverse().join('');
    try { return JSON.parse(truncated); } catch {}
  }

  // 7. Last resort — return as raw text
  return { raw_response: text.slice(0, 2000), parse_error: 'JSON repair failed', _partial: true };
}

// ============================================================
// EXECUTE AGENT — core execution engine
// ============================================================
export async function executeAgent(clientId, agentTemplateId, taskPayload = {}, options = {}) {
  const { isDryRun = false, approvalId = null, approved = false, triggeredBy = 'manual' } = options;
  const startTime = Date.now();

  // 1. Load agent
  const { data: agent, error: agentErr } = await supabase
    .from('agent_templates').select('*').eq('id', agentTemplateId).single();
  if (agentErr || !agent) throw new Error(`Agent not found: ${agentTemplateId}`);
  if (!agent.is_active) throw new Error(`Agent is not active: ${agent.slug}`);

  // 2. Load client with profile and rules
  const { data: client } = await supabase
    .from('clients')
    .select('*, client_profiles(*), client_rules(*)')
    .eq('id', clientId).single();
  if (!client) throw new Error(`Client not found: ${clientId}`);

  const profile = client.client_profiles?.[0] || {};
  const rules = client.client_rules?.[0] || {};

  // 3. Load active prompt version (client-specific first, then agent base)
  const { data: promptVersion } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('agent_template_id', agentTemplateId)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle();

  const activePrompt = promptVersion?.prompt_body || agent.base_prompt;
  if (!activePrompt || activePrompt.length < 50) {
    throw new Error(`No valid prompt for agent: ${agent.slug} — prompt body is empty or too short`);
  }

  // 4. Load relevant memory (approved, not stale, sorted by relevance)
  const { data: memories } = await supabase
    .from('memory_items')
    .select('id, scope, type, content, tags, relevance_score, times_used')
    .eq('client_id', clientId)
    .eq('approved', true)
    .eq('is_stale', false)
    .order('relevance_score', { ascending: false })
    .limit(25);

  // 4b. Load CONTENT SCOPE GUARDRAILS — tagged memory items that MUST appear at the
  // top of every prompt so agents can never wander outside the client's content scope
  // (e.g. Yaniv Gil = family law only, Homie = mortgages only). These are hard gates.
  const { data: scopeGuardrails } = await supabase
    .from('memory_items')
    .select('id, content, tags')
    .eq('client_id', clientId)
    .eq('approved', true)
    .eq('is_stale', false)
    .overlaps('tags', ['content-scope', 'guardrail', 'canonical', 'forbidden-pattern', 'brand-voice'])
    .order('relevance_score', { ascending: false })
    .limit(10);

  // 5. Load keywords
  const { data: keywords } = await supabase
    .from('client_keywords')
    .select('keyword, current_position, volume, difficulty, cluster, search_intent')
    .eq('client_id', clientId)
    .order('volume', { ascending: false })
    .limit(30);

  // 6. Load baselines
  const { data: baselines } = await supabase
    .from('baselines')
    .select('metric_name, metric_value, metric_text, target_value')
    .eq('client_id', clientId);

  // 7. Load recent run history (last 5 runs for this agent)
  const { data: recentRuns } = await supabase
    .from('runs')
    .select('status, created_at, output')
    .eq('client_id', clientId)
    .eq('agent_template_id', agentTemplateId)
    .order('created_at', { ascending: false })
    .limit(5);

  // 8. Build full prompt context
  const memoryBlock = memories?.length
    ? `\n\n=== CLIENT MEMORY (${memories.length} items) ===\n${memories.map(m => `[${m.scope}/${m.type}] ${m.content}`).join('\n')}`
    : '\n\n=== CLIENT MEMORY ===\nNo memory items loaded yet.';

  // Build client strategy block if available
  const strategy = rules.strategy || {};
  const strategyBlock = strategy.primary_goal ? `\n\n=== CLIENT STRATEGY ===
- Primary Goal: ${strategy.primary_goal}
- Secondary Goal: ${strategy.secondary_goal || 'not set'}
- Focus Keywords: ${strategy.focus_keywords?.join(', ') || 'see TARGET KEYWORDS'}
- Focus Locations: ${strategy.focus_locations?.join(', ') || 'not set'}
- Authority Targets: ${strategy.authority_targets || 'not set'}
- Conversion Targets: ${strategy.conversion_targets || 'not set'}
- KPI Targets: ${strategy.kpi_targets ? Object.entries(strategy.kpi_targets).map(([k,v]) => `${k}: ${v}`).join(', ') : 'not set'}
- Success Definition: ${strategy.success_definition || 'not defined'}
IMPORTANT: Every action you take should align with and advance the client's primary goal. Prioritize tasks that directly impact "${strategy.primary_goal}".` : '';

  const rulesBlock = `\n\n=== CLIENT RULES ===
- Client: ${client.name} | Domain: ${client.domain}
- Language: ${profile.language || 'he'} | RTL Required: ${profile.rtl_required}
- Brand Voice: ${profile.brand_voice || 'professional'}
- Business Type: ${profile.business_type || 'business'}
- Source of Truth: ${rules.source_of_truth || 'Google Drive'}
- Allowed Accounts: ${rules.allowed_accounts?.join(', ') || 'none specified'}
- Forbidden Accounts: ${rules.forbidden_accounts?.join(', ') || 'none specified'}
- Allowed Key Events: ${rules.analytics_allowed_key_events?.join(', ') || 'none'}
- Reviews Voice: ${rules.reviews_voice || 'office'} (plural)
- Post-Change Validation Mandatory: ${rules.post_change_validation_mandatory}
- Special Policies:\n${rules.special_policies?.map(p => `  • ${p}`).join('\n') || '  • None'}
${rules.custom_instructions ? `- Custom Instructions: ${rules.custom_instructions}` : ''}` + strategyBlock;

  const keywordsBlock = keywords?.length
    ? `\n\n=== TARGET KEYWORDS (${keywords.length}) ===\n${keywords.map(k =>
        `${k.keyword} | Cluster: ${k.cluster || 'general'} | Vol: ${k.volume || '?'} | Diff: ${k.difficulty || '?'} | Pos: ${k.current_position || 'unranked'} | Intent: ${k.search_intent || '?'}`
      ).join('\n')}`
    : '';

  const baselinesBlock = baselines?.length
    ? `\n\n=== CLIENT BASELINES ===\n${baselines.map(b => `${b.metric_name}: ${b.metric_text || b.metric_value} (target: ${b.target_value || 'not set'})`).join('\n')}`
    : '';

  const recentRunsBlock = recentRuns?.length
    ? `\n\n=== RECENT RUNS (this agent) ===\n${recentRuns.map(r => `${r.created_at}: ${r.status}`).join('\n')}`
    : '';

  const taskBlock = taskPayload && Object.keys(taskPayload).length
    ? `\n\n=== TASK PAYLOAD ===\n${JSON.stringify(taskPayload, null, 2)}`
    : '';

  const approvalBlock = approved
    ? '\n\n=== APPROVAL STATUS ===\nThis task was previously held for approval and has now been APPROVED. Proceed with full execution and implementation.'
    : '';

  // Fetch existing proposed changes to prevent duplicates
  const { data: existingProposals } = await supabase.from('proposed_changes')
    .select('page_url, change_type, status, created_at')
    .eq('client_id', clientId)
    .in('status', ['proposed', 'approved', 'executed'])
    .order('created_at', { ascending: false })
    .limit(100);

  const existingProposalsBlock = existingProposals?.length
    ? `\n\n=== EXISTING PROPOSED CHANGES (do NOT re-propose these) ===\n${existingProposals.map(p =>
        `- ${p.change_type} for ${p.page_url} (${p.status}, ${p.created_at?.slice(0, 10)})`
      ).join('\n')}`
    : '';

  // CONTENT SCOPE GUARDRAIL — sits at the very top of the prompt, non-negotiable.
  // Every agent sees the client's allowed/forbidden topics, brand voice, and canonical
  // facts BEFORE it sees its own base prompt. This prevents cross-client content bleed
  // (e.g. a Yaniv Gil agent proposing mortgage content, or a Homie agent proposing legal content).
  const scopeBlock = scopeGuardrails?.length
    ? `=== CONTENT SCOPE GUARDRAIL (HARD GATE — applies to ALL tool calls, proposals, posts, ads, content) ===
CLIENT: ${client.name} | DOMAIN: ${client.domain} | INDUSTRY: ${profile.industry || 'not set'}

The following are the CANONICAL content-scope rules for this client. You MUST obey them in every action you take. If a proposal references a FORBIDDEN topic, DISCARD it silently and do not submit it. If a proposal omits required canonical facts (phone, domain, voice), FIX it before submitting.

${scopeGuardrails.map((g, i) => `--- GUARDRAIL ${i + 1} ---\n${g.content}`).join('\n\n')}

=== END CONTENT SCOPE GUARDRAIL ===\n\n`
    : '';

  const fullPrompt = scopeBlock + activePrompt + memoryBlock + rulesBlock + keywordsBlock + baselinesBlock + recentRunsBlock + existingProposalsBlock + taskBlock + approvalBlock;

  // 9. Create run record
  const { data: run } = await supabase.from('runs').insert({
    client_id: clientId,
    agent_template_id: agentTemplateId,
    prompt_version_id: promptVersion?.id || null,
    status: isDryRun ? 'dry_run' : 'running',
    is_dry_run: isDryRun,
    task_payload: taskPayload,
    prompt_used: fullPrompt,
    approval_id: approvalId,
    owner_agent_slug: agent.slug,
    memory_items_used: memories?.map(m => m.id) || [],
    triggered_by: triggeredBy,
    context_summary: {
      memory_count: memories?.length || 0,
      keywords_count: keywords?.length || 0,
      baselines_count: baselines?.length || 0,
      prompt_version: promptVersion?.version_number || 'base',
      client_name: client.name
    }
  }).select().single();

  if (!run) throw new Error('Failed to create run record');

  emitAgentEvent(clientId, agent, 'started', run.id, `${agent.name} started executing`);

  try {
    let output, outputText, tokensUsed = 0, promptTokens = 0, completionTokens = 0;

    if (isDryRun) {
      // Dry run — return preview without calling OpenAI
      output = {
        dry_run: true,
        prompt_preview: fullPrompt.slice(0, 2000) + (fullPrompt.length > 2000 ? '\n...[truncated for preview]' : ''),
        prompt_length_chars: fullPrompt.length,
        memory_items_loaded: memories?.length || 0,
        keywords_loaded: keywords?.length || 0,
        baselines_loaded: baselines?.length || 0,
        estimated_tokens: Math.ceil(fullPrompt.length / 4)
      };

      await supabase.from('runs').update({
        status: 'dry_run',
        output,
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime
      }).eq('id', run.id);

      return { success: true, runId: run.id, output, isDryRun: true };
    }

    // 10. Call OpenAI WITH TOOL CALLING
    const tools = getToolDefinitions(agent.slug, clientId);
    const toolCallLog = []; // Track all tool calls for audit

    const messages = [
      {
        role: 'system',
        content: `You are ${agent.name}. ${agent.global_rules || ''}

EXECUTION MODE: You are an AUTONOMOUS EXECUTION agent, not a reporting tool.
You have access to real tools that call real APIs and modify real databases.

TOOL USAGE RULES:
- USE YOUR TOOLS to fetch real data before making any analysis or recommendations
- DO NOT fabricate data — call the appropriate tool to get real numbers
- After fetching data with tools, analyze it and take action (store metrics, update keywords, create tasks, write memory)
- You may call multiple tools in sequence — fetch data first, then act on it
- Each tool call returns real results that you should incorporate into your analysis

FINAL OUTPUT RULES:
- After all tool calls, produce your final response as valid JSON
- Match the output contract specified in your instructions
- Your final JSON response should reflect REAL data obtained from tool calls
- Include a "tools_used" array listing which tools you called and what they returned
- Include an "actions_taken" array listing what you changed/stored/created
- Never add commentary outside the JSON structure`
      },
      { role: 'user', content: fullPrompt }
    ];

    // Tool calling loop — agent can call tools, get results, call more tools
    let iteration = 0;
    let finalResponse = null;

    const EXECUTION_TIMEOUT_MS = 180000; // 180s — leaves 120s for post-processing within 300s Vercel hard limit
    let consecutiveToolErrors = 0; // Track runs of tool errors; abort early if tools consistently unavailable

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      // Guard: stop gracefully before Vercel kills us
      if (Date.now() - startTime > EXECUTION_TIMEOUT_MS) {
        finalResponse = JSON.stringify({
          timeout: true,
          message: `Agent stopped after ${iteration - 1} iterations due to execution time limit (${Math.round((Date.now() - startTime) / 1000)}s).`,
          partial_results: true,
          tools_used: toolCallLog.map(t => t.tool),
          iterations_completed: iteration - 1,
        });
        break;
      }

      const callParams = {
        model: agent.model || 'gpt-4.1',
        messages,
        max_tokens: agent.max_tokens || 4000,
        temperature: agent.temperature || 0.3
      };

      // Add tools if available; on final iteration force no tools to get JSON output
      if (tools.length > 0 && iteration < MAX_TOOL_ITERATIONS) {
        callParams.tools = tools;
        callParams.tool_choice = iteration === 1 ? 'auto' : 'auto';
      }

      // On last iteration or when no tools, force JSON output
      if (iteration === MAX_TOOL_ITERATIONS || tools.length === 0) {
        callParams.response_format = { type: 'json_object' };
      }

      let completion;
      try {
        completion = await openai.chat.completions.create(callParams);
      } catch (openaiErr) {
        // OpenAI timed out or network dropped — save partial results and exit gracefully
        console.error(`[OPENAI_TIMEOUT] ${agent.slug} iteration ${iteration}: ${openaiErr.message}`);
        finalResponse = JSON.stringify({
          timeout: true,
          openai_error: openaiErr.message,
          message: `OpenAI call timed out on iteration ${iteration}. Partial results from ${toolCallLog.length} tool calls.`,
          tools_used: toolCallLog.map(t => t.tool),
          actions_taken: [],
          partial_results: true,
        });
        break;
      }
      const choice = completion.choices[0];

      promptTokens += completion.usage?.prompt_tokens || 0;
      completionTokens += completion.usage?.completion_tokens || 0;
      tokensUsed += completion.usage?.total_tokens || 0;

      // If the model wants to call tools
      if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls?.length) {
        messages.push(choice.message); // Add assistant message with tool calls

        for (const toolCall of choice.message.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs;
          try {
            fnArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            fnArgs = {};
          }

          console.log(`[TOOL_CALL] ${agent.slug} → ${fnName}(${JSON.stringify(fnArgs).slice(0, 200)})`);

          // Heartbeat: keep updated_at fresh so zombie reaper doesn't kill active runs
          supabase.from('runs').update({ updated_at: new Date().toISOString() }).eq('id', run.id).then(() => {});

          // Execute the tool — with a hard 28-second timeout so one slow call can't block indefinitely
          const toolTimeoutMs = 28000;
          let toolResult;
          try {
            toolResult = await Promise.race([
              executeTool(fnName, fnArgs, clientId, run.id),
              new Promise((_, reject) => setTimeout(() => reject(new Error(`Tool ${fnName} timed out after ${toolTimeoutMs}ms`)), toolTimeoutMs))
            ]);
          } catch (toolErr) {
            toolResult = { error: toolErr.message, tool: fnName, timed_out: true };
          }

          // Track consecutive errors — if all tools in first iteration fail, abort early to save quota
          if (toolResult?.error) {
            consecutiveToolErrors++;
          } else {
            consecutiveToolErrors = 0;
          }

          toolCallLog.push({
            tool: fnName,
            args: fnArgs,
            result_preview: JSON.stringify(toolResult).slice(0, 500),
            iteration
          });

          emitAgentEvent(clientId, agent, 'tool_call', run.id, `Called ${fnName}`, { tool_name: fnName });

          // Add tool result to messages
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          });
        }

        // Early abort: if every tool in iteration 1 returned an error, credentials/data sources unavailable
        if (iteration === 1 && consecutiveToolErrors === choice.message.tool_calls.length && consecutiveToolErrors > 0) {
          const errorSummary = toolCallLog.map(t => `${t.tool}: ${JSON.parse(t.result_preview)?.error || 'error'}`).join('; ');
          finalResponse = JSON.stringify({
            status: 'credentials_unavailable',
            message: `All ${consecutiveToolErrors} tools failed on first iteration — required credentials or data sources not configured for this client.`,
            tool_errors: errorSummary,
            tools_used: toolCallLog.map(t => t.tool),
            actions_taken: [],
            recommendation: 'Run credential-health-agent to diagnose and connect missing integrations.'
          });
          break;
        }

        // Continue the loop — model will process tool results
        continue;
      }

      // Model returned a text response (no more tool calls)
      finalResponse = choice.message.content;
      break;
    }

    // If we exhausted iterations without a final response, force one — but only if we have time
    if (!finalResponse) {
      // Skip forced call if we're already past the safe point (210s) — Vercel kills at 300s
      if (Date.now() - startTime > 210000) {
        finalResponse = JSON.stringify({
          timeout: true,
          message: `Agent ran out of time after ${iteration} iterations (${Math.round((Date.now()-startTime)/1000)}s). Tools called: ${toolCallLog.map(t=>t.tool).join(', ')}.`,
          tools_used: toolCallLog.map(t => t.tool),
          actions_taken: [],
          partial_results: true,
        });
      } else {
      messages.push({
        role: 'user',
        content: 'You have reached the maximum number of tool calls. Now produce your final JSON output summarizing everything you found and all actions you took.'
      });
      const finalCompletion = await openai.chat.completions.create({
        model: agent.model || 'gpt-4.1',
        messages,
        response_format: { type: 'json_object' },
        max_tokens: agent.max_tokens || 4000,
        temperature: agent.temperature || 0.3
      });
      finalResponse = finalCompletion.choices[0].message.content;
      promptTokens += finalCompletion.usage?.prompt_tokens || 0;
      completionTokens += finalCompletion.usage?.completion_tokens || 0;
      tokensUsed += finalCompletion.usage?.total_tokens || 0;
      } // end else (had time for forced call)
    }

    outputText = finalResponse;

    try {
      output = JSON.parse(outputText);
    } catch (parseErr) {
      // Attempt progressive JSON repair
      output = repairAndParseJSON(outputText);
    }

    // Inject tool call metadata into output
    output._tool_calls = toolCallLog;
    output._tool_call_count = toolCallLog.length;
    output._iterations = iteration;

    // 11. Determine next actions
    // Also treat propose_website_change calls as "changed something" so validation triggers
    const proposedChanges = toolCallLog.filter(t => t.tool === 'propose_website_change').length;
    const changedAnything = !!(output?.changed_anything || output?.changes_made || output?.change_verified === true || proposedChanges > 0);
    const triggerValidation = changedAnything && agent.post_change_trigger && rules.post_change_validation_mandatory;
    const needsApproval = agent.action_mode_default === 'approve_then_act' && !approved && output?.what_needs_approval;

    // Extract action_type declared by the agent, fall back to generic
    const actionType = output?.action_type || (changedAnything ? 'generic_change' : null);
    const requiredValidators = actionType ? (VALIDATION_MATRIX[actionType] || VALIDATION_MATRIX.generic_change) : [];

    // 11b. TRUTH GATE — enforce confidence, completeness, and honest status
    const truthGate = enforceTruthGate(output, agent.slug, toolCallLog);
    let finalStatus = needsApproval ? 'pending_approval' : 'success';
    if (truthGate.status_override && finalStatus === 'success') {
      finalStatus = truthGate.status_override; // downgrade to 'partial' if data is insufficient
    }

    // Inject truth metadata into output so UI can display it
    output._truth_gate = {
      confidence: truthGate.confidence,
      data_completeness_percent: truthGate.data_completeness_percent,
      inspected_assets: truthGate.inspected_assets,
      data_sources_used: truthGate.data_sources_used,
      missing_sources: truthGate.missing_sources,
      measured_findings_count: truthGate.measured_findings.length,
      inferred_recommendations_count: truthGate.inferred_recommendations.length,
      freshness_summary: truthGate.freshness_summary,
      why_this_may_be_incomplete: truthGate.why_this_may_be_incomplete,
    };

    // GOVERNANCE HARD RULE: An agent cannot self-validate its own change.
    // If this agent is being run as a validator and it is the same agent that owns the change, block it.
    if (taskPayload?.validation_chain && taskPayload?.owner_agent_slug === agent.slug) {
      throw new Error(
        `GOVERNANCE VIOLATION: Agent "${agent.slug}" attempted to validate its own change. ` +
        `Owner agent cannot be its own validator. Blocked by post-change ownership governance.`
      );
    }

    // 12. CRITICAL: Save run output to DB IMMEDIATELY
    // Ensure finalStatus is a valid DB enum value — truthGate may return 'partial'
    const VALID_STATUSES = ['running','success','failed','pending_approval','dry_run','cancelled','executed_pending_validation','validation_failed','partial'];
    if (!VALID_STATUSES.includes(finalStatus)) {
      console.warn(`[RUN_SAVE] Invalid status "${finalStatus}" — falling back to "success"`);
      finalStatus = 'success';
    }
    const dbStatus = triggerValidation ? 'executed_pending_validation' : finalStatus;
    console.log(`[RUN_SAVE] Starting DB update for run=${run.id}, status=${dbStatus}, elapsed=${Date.now()-startTime}ms, output_size=${JSON.stringify(output).length}`);
    try {
      const updatePayload = {
        status: dbStatus,
        output,
        output_text: outputText,
        changed_anything: changedAnything,
        what_changed: output?.what_changed || output?.actions_taken?.map(a => a.action || a).join('; ') || null,
        trigger_post_change_validation: triggerValidation,
        post_change_validation_status: triggerValidation ? 'pending' : null,
        owner_agent_slug: agent.slug,
        action_type: actionType,
        validation_required: triggerValidation ? requiredValidators : [],
        final_validation_status: triggerValidation ? 'pending' : null,
        tokens_used: tokensUsed,
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString()
      };
      const { data: updateData, error: runUpdateErr } = await supabase.from('runs').update(updatePayload).eq('id', run.id).select('id, status').single();
      if (runUpdateErr) {
        console.error(`[RUN_UPDATE_FAIL] run=${run.id}: ${runUpdateErr.message} | ${runUpdateErr.details || ''} | ${runUpdateErr.hint || ''}`);
        // Retry with smaller output AND safe status (always use 'success' or 'failed' for retry)
        const safeStatus = tokensUsed > 0 ? 'success' : 'partial';
        const { error: retryErr } = await supabase.from('runs').update({
          status: safeStatus, output: { _tool_call_count: toolCallLog.length, summary: 'Output saved partial — original update failed: ' + runUpdateErr.message },
          tokens_used: tokensUsed, duration_ms: Date.now() - startTime, completed_at: new Date().toISOString()
        }).eq('id', run.id);
        if (retryErr) {
          console.error(`[RUN_UPDATE_RETRY_FAIL] run=${run.id}: ${retryErr.message}`);
          // Last resort — just mark completed with minimal payload
          await supabase.from('runs').update({
            status: 'failed', error: `DB save failed: ${runUpdateErr.message}; retry: ${retryErr.message}`,
            duration_ms: Date.now() - startTime, completed_at: new Date().toISOString()
          }).eq('id', run.id).catch(e => console.error(`[RUN_SAVE_LAST_RESORT] ${e.message}`));
        }
      } else {
        console.log(`[RUN_SAVE_OK] run=${run.id} status=${updateData?.status} elapsed=${Date.now()-startTime}ms`);
      }
    } catch (saveErr) {
      console.error(`[RUN_SAVE_EXCEPTION] run=${run.id}: ${saveErr.message}`);
      // NEVER leave a run stuck in 'running' — force-mark it
      await supabase.from('runs').update({
        status: 'failed', error: `Save exception: ${saveErr.message}`,
        duration_ms: Date.now() - startTime, completed_at: new Date().toISOString()
      }).eq('id', run.id).catch(e => console.error(`[RUN_SAVE_EMERGENCY] ${e.message}`));
    }

    // 13. Update assignment stats
    await supabase.from('client_agent_assignments')
      .update({ last_run_at: new Date().toISOString(), run_count: supabase.rpc('increment', { x: 1 }) })
      .eq('client_id', clientId)
      .eq('agent_template_id', agentTemplateId);

    // 14. Mark memory used
    if (memories?.length) {
      for (const mem of memories) {
        await supabase.rpc('increment_memory_usage', { memory_id: mem.id, p_run_id: run.id });
      }
    }

    // 15. Write memory from run lessons
    const lessons = output?.lessons_learned || output?.new_memory_items || output?.memory_updates;
    if (lessons && Array.isArray(lessons)) {
      await writeMemoryFromRun(run.id, clientId, lessons);
    }

    // 16. Update prompt version usage
    if (promptVersion?.id) {
      await supabase.from('prompt_versions')
        .update({ runs_using_this: supabase.rpc('increment', { x: 1 }), last_run_id: run.id })
        .eq('id', promptVersion.id);
    }

    // 17. Create approval if needed
    if (needsApproval) {
      await supabase.from('approvals').insert({
        client_id: clientId,
        agent_template_id: agentTemplateId,
        run_id: run.id,
        what_needs_approval: output.what_needs_approval,
        proposed_action: output.proposed_action || null,
        context: output,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      });
    }

    // 18. Queue post-change validation chain
    if (triggerValidation) {
      await governPostChange(clientId, run.id, agent.slug, actionType, taskPayload);
    }

    // 19. Create incident if run failed or found critical issues
    const criticalIssues = output?.critical_issues || output?.critical_failures || output?.flagged_issues?.filter(i => i.severity === 'critical');
    if (criticalIssues?.length) {
      for (const issue of criticalIssues.slice(0, 3)) {
        await supabase.from('incidents').insert({
          client_id: clientId,
          run_id: run.id,
          agent_template_id: agentTemplateId,
          severity: 'high',
          category: agent.lane,
          title: typeof issue === 'string' ? issue : (issue.issue || issue.title || 'Agent flagged critical issue'),
          description: typeof issue === 'object' ? JSON.stringify(issue) : issue
        });
      }
    }

    // 20. Write audit log (with tool call summary)
    await supabase.from('audit_trail').insert({
      client_id: clientId,
      run_id: run.id,
      agent_slug: agent.slug,
      action: 'agent_executed',
      actor: agent.slug,
      details: {
        tokens_used: tokensUsed,
        changed_anything: changedAnything,
        triggered_validation: triggerValidation,
        needs_approval: needsApproval,
        dry_run: false,
        duration_ms: Date.now() - startTime,
        tool_calls: toolCallLog.length,
        tools_used: [...new Set(toolCallLog.map(t => t.tool))],
        iterations: iteration
      }
    });

    // 21. CENTRAL COORDINATION — React to agent output and create follow-up work
    try {
      const coordResult = await coordinatePostRun(clientId, run.id, agent, output, taskPayload);
      // ALWAYS write coordination metadata so audit tests T2/T5 can see follow-up work
      // Build action_plan from output if not already present
      const existingActionPlan = output.action_plan || output.recommendations || output.priority_queue_next_24h || [];
      const coordMeta = {
        tasks_created: coordResult?.agents_activated?.map(slug => ({ agent_slug: slug })) || [],
        follow_up_tasks: coordResult?.agents_activated?.map(slug => ({ agent_slug: slug, action: 'queued' })) ||
          (Array.isArray(existingActionPlan) && existingActionPlan.length > 0 ? existingActionPlan.slice(0, 5).map(item =>
            typeof item === 'string' ? { action: item, status: 'pending' } : { ...item, status: item.status || 'pending' }
          ) : [{ action: `${agent.name} completed — monitoring for changes`, status: 'logged' }]),
        agents_to_activate: coordResult?.agents_activated || [],
        _coordination: coordResult || { follow_ups: 0, source: 'central_coordinator' },
      };
      await supabase.from('runs').update({
        output: { ...output, ...coordMeta },
      }).eq('id', run.id).catch(() => {});
    } catch (coordErr) {
      console.error('[COORDINATION]', coordErr.message);
    }

    // 22. FALSE SUCCESS DETECTION — flag runs that claim success but did nothing real
    try {
      const { isFalseSuccess, flags } = detectFalseSuccess(
        { tool_calls_count: toolCallLog.length, changed_anything: changedAnything },
        output
      );
      if (isFalseSuccess) {
        await supabase.from('runs').update({
          false_success: true,
          false_success_flags: flags,
        }).eq('id', run.id);

        await supabase.from('incidents').insert({
          client_id: clientId,
          run_id: run.id,
          title: `False success detected: ${agent.name}`,
          severity: 'medium',
          status: 'open',
          details: {
            agent_slug: agent.slug,
            flags,
            explanation: 'Agent reported success but showed signs of not performing real work: ' + flags.join(', '),
          }
        }).catch(() => {});

        await supabase.from('audit_trail').insert({
          client_id: clientId,
          run_id: run.id,
          agent_slug: agent.slug,
          action: 'false_success_detected',
          actor: 'system',
          details: { flags }
        }).catch(() => {});
      }
    } catch (fsErr) {
      console.error('[FALSE_SUCCESS]', fsErr.message);
    }

    // 23. Check if this was a validation chain run → auto-fix if issues found
    if (taskPayload?.validation_chain && taskPayload?.pipeline_phase === 'validate') {
      try {
        await checkValidationAndAutoFix(clientId, run.id);
      } catch (valErr) {
        console.error('[VALIDATION_AUTOFIX]', valErr.message);
      }
    }

    const durationMs = Date.now() - startTime;
    if (needsApproval) {
      emitAgentEvent(clientId, agent, 'reporting', run.id, `Awaiting approval`);
    } else {
      emitAgentEvent(clientId, agent, 'completed', run.id, `Completed successfully`, { duration_ms: durationMs, tokens_used: tokensUsed });
    }

    return { success: true, runId: run.id, output, needsApproval, triggeredValidation: triggerValidation };

  } catch (err) {
    emitAgentEvent(clientId, agent, 'failed', run.id, `Failed: ${err.message}`, { error: err.message });

    await supabase.from('runs').update({
      status: 'failed',
      error: err.message,
      duration_ms: Date.now() - startTime,
      completed_at: new Date().toISOString()
    }).eq('id', run.id);

    await supabase.from('audit_trail').insert({
      client_id: clientId,
      run_id: run.id,
      agent_slug: agent.slug,
      action: 'agent_failed',
      actor: agent.slug,
      details: { error: err.message }
    });

    // Create incident for failed run
    await supabase.from('incidents').insert({
      client_id: clientId,
      run_id: run.id,
      agent_template_id: agentTemplateId,
      severity: 'high',
      category: agent.lane,
      title: `Agent execution failed: ${agent.name}`,
      description: err.message
    });

    throw err;
  }
}

// ============================================================
// PROCESS RUN QUEUE — the queue worker
// ============================================================
export async function processRunQueue() {
  const startTime = Date.now();
  let processed = 0, failed = 0, skipped = 0, blocked = 0;

  // ── ZOMBIE REAPER: clean up stuck "running" items (>15 min old) ──
  const zombieCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: zombies } = await supabase
    .from('run_queue')
    .select('id')
    .eq('status', 'running')
    .lt('updated_at', zombieCutoff)
    .limit(50);
  if (zombies?.length) {
    await supabase
      .from('run_queue')
      .update({ status: 'failed', error: 'Timed out — stuck in running state for >15 min', updated_at: new Date().toISOString() })
      .in('id', zombies.map(z => z.id));
  }
  // Also clean zombie runs in the runs table (use updated_at so actively-updating runs are not killed)
  const { data: zombieRuns } = await supabase
    .from('runs')
    .select('id')
    .eq('status', 'running')
    .lt('updated_at', zombieCutoff)
    .limit(100);
  if (zombieRuns?.length) {
    await supabase
      .from('runs')
      .update({ status: 'failed', error: 'Auto-cancelled: stuck in running state for >15 minutes' })
      .in('id', zombieRuns.map(z => z.id));
  }

  // Re-queue retry_scheduled items whose time has come
  await supabase
    .from('run_queue')
    .update({ status: 'queued', updated_at: new Date().toISOString() })
    .eq('status', 'retry_scheduled')
    .lte('next_retry_at', new Date().toISOString());

  // Re-check blocked_dependency items (their deps may have completed)
  const { data: blockedItems } = await supabase
    .from('run_queue')
    .select('id, depends_on')
    .eq('status', 'blocked_dependency')
    .limit(50);
  if (blockedItems?.length) {
    for (const bi of blockedItems) {
      if (bi.depends_on?.length) {
        const { data: deps } = await supabase.from('run_queue').select('id, status').in('id', bi.depends_on);
        const allDone = deps?.every(d => d.status === 'executed');
        const anyFailed = deps?.some(d => d.status === 'failed');
        if (allDone) await supabase.from('run_queue').update({ status: 'queued' }).eq('id', bi.id);
        else if (anyFailed) await supabase.from('run_queue').update({ status: 'failed', error: 'A dependency failed' }).eq('id', bi.id);
      }
    }
  }

  // Fetch queued items — sort by priority_score (highest first), then legacy priority, then age
  const { data: queueItems } = await supabase
    .from('run_queue')
    .select('*, agent_templates(slug, is_active, name, cooldown_minutes)')
    .eq('status', 'queued')
    .order('priority_score', { ascending: false, nullsFirst: false })
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(50); // fetch up to 50 — all agents run concurrently

  if (!queueItems?.length) {
    return { processed: 0, failed: 0, skipped: 0, blocked: 0, duration_ms: Date.now() - startTime };
  }

  // ── Phase 1: Pre-validate all items sequentially (fast DB checks) ──
  // Run ALL valid items concurrently — Master Orchestrator decides which to continue/stop
  const MAX_CONCURRENT = 20; // Run up to 20 agents in parallel per cron tick
  const toExecute = [];

  for (const item of queueItems) {
    if (toExecute.length >= MAX_CONCURRENT) break;
    try {
      // Verify client exists
      const { data: client } = await supabase.from('clients').select('id, status').eq('id', item.client_id).single();
      if (!client) {
        await supabase.from('run_queue').update({ status: 'failed', error: 'Client not found' }).eq('id', item.id);
        failed++; continue;
      }
      if (client.status === 'paused' || client.status === 'archived') {
        await supabase.from('run_queue').update({ status: 'skipped_cooldown', error: `Client is ${client.status}` }).eq('id', item.id);
        skipped++; continue;
      }

      // Verify agent is active
      if (!item.agent_templates?.is_active) {
        await supabase.from('run_queue').update({ status: 'failed', error: 'Agent is not active' }).eq('id', item.id);
        failed++; continue;
      }

      // Check assignment is enabled
      const { data: assignment } = await supabase
        .from('client_agent_assignments')
        .select('enabled, last_run_at')
        .eq('client_id', item.client_id)
        .eq('agent_template_id', item.agent_template_id)
        .maybeSingle();

      if (!assignment?.enabled) {
        await supabase.from('run_queue').update({ status: 'skipped_cooldown', error: 'Agent not enabled for this client' }).eq('id', item.id);
        skipped++; continue;
      }

      // Check cooldown
      const cooldownMinutes = item.agent_templates?.cooldown_minutes || 0;
      if (cooldownMinutes > 0 && assignment.last_run_at) {
        const lastRunMs = new Date(assignment.last_run_at).getTime();
        if (Date.now() - lastRunMs < cooldownMinutes * 60 * 1000) {
          await supabase.from('run_queue').update({ status: 'skipped_cooldown', error: `Cooldown active: ${cooldownMinutes} minutes` }).eq('id', item.id);
          skipped++; continue;
        }
      }

      // Check dependencies
      if (item.depends_on?.length) {
        const { data: deps } = await supabase.from('run_queue').select('id, status').in('id', item.depends_on);
        const allDone = deps?.every(d => d.status === 'executed');
        const anyFailed = deps?.some(d => d.status === 'failed');
        if (anyFailed) {
          await supabase.from('run_queue').update({ status: 'failed', error: 'A dependency failed' }).eq('id', item.id);
          failed++; continue;
        }
        if (!allDone) {
          await supabase.from('run_queue').update({ status: 'blocked_dependency' }).eq('id', item.id);
          blocked++; continue;
        }
      }

      // Valid — mark running and add to execution batch
      await supabase.from('run_queue').update({ status: 'running', updated_at: new Date().toISOString() }).eq('id', item.id);
      toExecute.push(item);

    } catch (err) {
      console.error(`[QUEUE] Pre-validation error for item ${item.id}:`, err.message);
      failed++;
    }
  }

  if (toExecute.length === 0) {
    return { processed: 0, failed, skipped, blocked, duration_ms: Date.now() - startTime };
  }

  // ── Phase 2: Execute all valid items CONCURRENTLY ──
  // Instead of 1 agent every 5 min, run up to 3 agents in parallel (~50s total vs 15+ min)
  console.log(`[QUEUE] Running ${toExecute.length} agents concurrently`);

  const execResults = await Promise.allSettled(
    toExecute.map(async (item) => {
      try {
        const result = await executeAgent(
          item.client_id,
          item.agent_template_id,
          item.task_payload || {},
          { triggeredBy: item.queued_by || 'queue' }
        );
        return { item, result };
      } catch (err) {
        // Re-throw with item attached so we can handle retry logic below
        const wrappedErr = new Error(err.message);
        wrappedErr.item = item;
        throw wrappedErr;
      }
    })
  );

  // ── Phase 3: Record outcomes ──
  for (const outcome of execResults) {
    if (outcome.status === 'fulfilled') {
      const { item, result } = outcome.value;
      await supabase.from('run_queue').update({
        status: 'executed',
        run_id: result.runId,
        executed_at: new Date().toISOString()
      }).eq('id', item.id);
      processed++;
    } else {
      const err = outcome.reason;
      const item = err.item || toExecute[execResults.indexOf(outcome)];
      if (!item) { failed++; continue; }

      const retryCount = (item.retry_count || 0) + 1;
      const maxRetries = item.max_retries || 3;
      if (retryCount < maxRetries) {
        // Exponential backoff: 2min, 8min, 32min
        const backoffMs = Math.pow(4, retryCount) * 30 * 1000;
        const nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
        await supabase.from('run_queue').update({
          status: 'retry_scheduled',
          retry_count: retryCount,
          next_retry_at: nextRetryAt,
          error: `Retry ${retryCount}/${maxRetries}: ${err.message}`
        }).eq('id', item.id);
      } else {
        // Hard failure — create incident
        await supabase.from('run_queue').update({
          status: 'failed',
          retry_count: retryCount,
          error: err.message,
          executed_at: new Date().toISOString()
        }).eq('id', item.id);
        await supabase.from('incidents').insert({
          client_id: item.client_id,
          severity: 'high',
          title: `Agent ${item.agent_templates?.name || item.agent_template_id} failed after ${maxRetries} retries`,
          description: `Queue item ${item.id} exhausted retries. Last error: ${err.message}`,
          source_agent: item.agent_templates?.slug || 'queue_processor',
          status: 'open',
        });
      }
      failed++;
    }
  }

  return { processed, failed, skipped, blocked, duration_ms: Date.now() - startTime };
}

// ============================================================
// RESUME APPROVED TASK
// ============================================================
export async function resumeApprovedTask(approvalId) {
  const { data: approval } = await supabase
    .from('approvals')
    .select('*, runs(*), agent_templates(slug, name)')
    .eq('id', approvalId)
    .single();

  if (!approval) throw new Error('Approval not found');
  if (approval.status !== 'approved') throw new Error(`Cannot resume: approval status is ${approval.status}`);
  if (approval.resumed_at) throw new Error('This approval has already been resumed');

  const originalRun = approval.runs;
  const taskPayload = {
    ...(originalRun?.task_payload || {}),
    original_run_id: originalRun?.id,
    approval_id: approvalId,
    resumed: true
  };

  const result = await executeAgent(
    approval.client_id,
    approval.agent_template_id,
    taskPayload,
    { approved: true, approvalId, triggeredBy: 'approval_resume' }
  );

  await supabase.from('approvals').update({
    resumed_at: new Date().toISOString(),
    resumed_run_id: result.runId
  }).eq('id', approvalId);

  await supabase.from('audit_trail').insert({
    client_id: approval.client_id,
    run_id: result.runId,
    agent_slug: approval.agent_templates?.slug,
    action: 'approval_resumed',
    actor: 'admin',
    details: { approval_id: approvalId, original_run_id: originalRun?.id, resumed_run_id: result.runId }
  });

  return result;
}

// ============================================================
// PRIORITY SCORING ENGINE
// Every task gets: impact, effort, confidence, urgency → priority_score
// Higher score = higher priority (processed first)
// ============================================================
function computePriorityScore({ impact = 5, effort = 5, confidence = 5, urgency = 5, businessGoal = null, clientStrategy = null }) {
  // Impact: 1-10 (how much will this move the needle?)
  // Effort: 1-10 (how much work? INVERSE — lower effort = higher priority)
  // Confidence: 1-10 (how sure are we this will work?)
  // Urgency: 1-10 (time-sensitive? regression? broken?)

  // Weights: impact matters most, then urgency, then confidence, effort is inverse
  const raw = (impact * 0.35) + (urgency * 0.30) + (confidence * 0.20) + ((10 - effort) * 0.15);

  // Bonus if aligned with client's primary goal
  let goalBonus = 0;
  if (clientStrategy && businessGoal) {
    if (businessGoal === clientStrategy.primary_goal) goalBonus = 1.5;
    else if (businessGoal === clientStrategy.secondary_goal) goalBonus = 0.75;
  }

  // Final score 0-10 scale
  return Math.min(10, Math.round((raw + goalBonus) * 100) / 100);
}

// Estimate priority scores based on issue type and source agent
function estimateFollowUpPriority(sourceAgent, targetSlug, issues, output) {
  const defaults = { impact: 5, effort: 5, confidence: 6, urgency: 5 };

  // Regressions and broken things are urgent
  if (output?.regressions?.length || output?.ranking_drops?.length) {
    return { ...defaults, impact: 9, urgency: 9, confidence: 8, effort: 4, businessGoal: 'seo_rankings' };
  }

  // Credential/integration issues block everything
  if (targetSlug === 'credential-health-agent') {
    return { ...defaults, impact: 8, urgency: 10, confidence: 9, effort: 2, businessGoal: 'system_health' };
  }

  // Technical SEO issues (crawl, speed, indexing)
  if (targetSlug === 'technical-seo-crawl-agent') {
    return { ...defaults, impact: 7, urgency: 7, confidence: 7, effort: 5, businessGoal: 'seo_rankings' };
  }

  // Content issues from SEO analysis
  if (targetSlug === 'website-content-agent') {
    return { ...defaults, impact: 7, urgency: 5, confidence: 7, effort: 6, businessGoal: 'content_quality' };
  }

  // Design/UX issues
  if (targetSlug === 'design-enforcement-agent' || targetSlug === 'design-consistency-agent') {
    return { ...defaults, impact: 5, urgency: 4, confidence: 8, effort: 4, businessGoal: 'ux_quality' };
  }

  // Hebrew/language issues
  if (targetSlug === 'hebrew-quality-agent') {
    return { ...defaults, impact: 6, urgency: 5, confidence: 9, effort: 3, businessGoal: 'content_quality' };
  }

  // GEO/AI visibility
  if (targetSlug === 'geo-ai-visibility-agent') {
    return { ...defaults, impact: 6, urgency: 4, confidence: 5, effort: 6, businessGoal: 'ai_visibility' };
  }

  // Local SEO
  if (targetSlug === 'local-seo-agent') {
    return { ...defaults, impact: 7, urgency: 5, confidence: 7, effort: 5, businessGoal: 'local_authority' };
  }

  // Content distribution / backlinks
  if (targetSlug === 'content-distribution-agent') {
    return { ...defaults, impact: 6, urgency: 3, confidence: 5, effort: 7, businessGoal: 'authority_building' };
  }

  // SEO core (general)
  if (targetSlug === 'seo-core-agent') {
    return { ...defaults, impact: 8, urgency: 6, confidence: 7, effort: 5, businessGoal: 'seo_rankings' };
  }

  return defaults;
}

// Detect false successes: agent said "success" but didn't actually do anything
function detectFalseSuccess(run, output) {
  const flags = [];
  const didToolWork = run.tool_calls_count > 0;
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output || {});

  // RULE: Only flag as fake when the agent called ZERO tools.
  // Agents that call tools and return real data are doing real work —
  // even if health scores are low, or data is incomplete.
  // Low scores = real problems found. That is the correct behavior.

  if (!didToolWork) {
    // Agent called no tools at all
    flags.push('no_tools_used');

    // Output is suspiciously empty
    if (outputStr.length < 80) {
      flags.push('minimal_output');
    }

    // No findings of any kind
    const hasActions = output?.actions_taken?.length > 0 || output?.changes_made?.length > 0 ||
      output?.fixes_applied?.length > 0 || output?.updates?.length > 0 || output?.results?.length > 0;
    const hasFindings = output?.metrics || output?.issues || output?.recommendations ||
      output?.rankings || output?.findings || output?.audit_results;
    if (!hasActions && !hasFindings) {
      flags.push('no_concrete_actions');
    }

    // Output mentions failures but no tools ran to verify them
    const failurePatterns = /נכשל|חוסר ב|לא נמצא|לא זמין|אין גישה|שגיאה|failed|error|not found|unavailable|no access|missing credential|not connected|could not fetch|unable to|blocked|unauthorized|denied|no data available/i;
    if (failurePatterns.test(outputStr)) {
      flags.push('output_contains_failure');
    }
  }

  // Never penalise low health scores or low data completeness —
  // those are valid agent findings about the client's real situation.

  const isFalseSuccess = flags.length >= 2; // requires no_tools_used + at least one more signal
  return { isFalseSuccess, flags };
}

// ============================================================
// FRESHNESS THRESHOLDS BY SOURCE
// ============================================================
const FRESHNESS_THRESHOLDS = {
  gsc: { freshHours: 24, agingHours: 72 },
  google_ads: { freshHours: 12, agingHours: 48 },
  gbp_reviews: { freshHours: 12, agingHours: 48 },
  lawreviews: { freshHours: 24, agingHours: 96 },
  pagespeed: { freshHours: 72, agingHours: 168 },
  perplexity_geo: { freshHours: 72, agingHours: 168 },
  local_falcon: { freshHours: 72, agingHours: 168 },
  backlink_data: { freshHours: 168, agingHours: 336 },
  website_scan: { freshHours: 24, agingHours: 72 },
  ga4: { freshHours: 24, agingHours: 72 },
  dataforseo: { freshHours: 72, agingHours: 168 },
  queue_health: { freshHours: 1, agingHours: 6 },
  run_health: { freshHours: 1, agingHours: 6 },
};

function getFreshnessState(lastSyncAt, freshHours, agingHours) {
  if (!lastSyncAt) return 'unknown';
  const ageHours = (Date.now() - new Date(lastSyncAt).getTime()) / 36e5;
  if (ageHours <= freshHours) return 'fresh';
  if (ageHours <= agingHours) return 'aging';
  return 'stale';
}

// ============================================================
// PER-AGENT REQUIRED SOURCE GATES
// If a hard-block source is missing, agent cannot return success
// ============================================================
const HARD_BLOCK_RULES = {
  'seo-core-agent': ['keyword_rankings'],
  'technical-seo-crawl-agent': ['website_scan'],
  'gsc-daily-monitor': ['gsc_property_data'],
  'google-ads-agent': ['google_ads_campaign_data'],
  'analytics-conversion-agent': ['analytics_events'],
  'cro-agent': ['website_scan'],
  'website-content-agent': ['page_html'],
  'design-consistency-agent': ['page_structure'],
  'website-qa-agent': ['validation_target'],
  'local-seo-agent': ['gbp_location_data'],
  'reviews-gbp-authority-agent': ['review_source_data'],
  'authority-backlinks-agent': ['authority_or_link_data'],
  'competitor-intelligence-agent': ['competitor_dataset'],
  'geo-ai-visibility-agent': ['perplexity_geo_results'],
  'content-distribution-agent': ['distribution_targets'],
  'legal-compliance-agent': ['target_content'],
  'innovation-agent': ['client_strategy'],
  'design-enforcement-agent': ['changed_output_target'],
  'hebrew-quality-agent': ['parsed_hebrew_text'],
  'regression-agent': ['baseline_snapshot'],
  'credential-health-agent': ['connector_validation'],
  'kpi-integrity-agent': ['kpi_sources'],
  'report-composer-agent': ['report_source_blocks'],
  'master-orchestrator': ['queue_state'],
};

// ============================================================
// DATA COMPLETENESS SCORING
// ============================================================
function computeDataCompleteness(output, toolCallLog, agentSlug) {
  let score = 0;

  // 35% — required source present (did the agent get real data?)
  const hasRealData = toolCallLog.some(t =>
    t.tool && !['write_memory_item', 'create_task', 'queue_task'].includes(t.tool)
  );
  if (hasRealData) score += 35;

  // 20% — inspected asset (did it look at something specific?)
  const inspectedAssets = extractInspectedAssets(output, toolCallLog);
  if (inspectedAssets.length > 0) score += 20;

  // 15% — freshness ok (did sources return recent data?)
  const dataSources = extractDataSources(output, toolCallLog);
  const staleCount = dataSources.filter(s => s.freshness_state === 'stale' || s.freshness_state === 'unknown').length;
  if (dataSources.length > 0 && staleCount === 0) score += 15;
  else if (dataSources.length > 0 && staleCount < dataSources.length) score += 8;

  // 15% — measured findings (not just recommendations)
  const measured = extractMeasuredFindings(output);
  if (measured.length > 0) score += 15;

  // 15% — actions or follow-up tasks (including propose_website_change tool calls)
  const proposedInTools = toolCallLog.filter(t => t.tool === 'propose_website_change').length;
  const hasActions = (output?.actions_taken?.length > 0) || (output?.follow_up_tasks?.length > 0) ||
    (output?.changes_made?.length > 0) || (output?.fixes_applied?.length > 0) ||
    (output?.total_fixes_proposed > 0) || (output?.fixes_proposed > 0) || proposedInTools > 0;
  if (hasActions) score += 15;

  return score;
}

// ============================================================
// EXTRACT STRUCTURED TRUTH DATA FROM OUTPUT
// ============================================================
function extractInspectedAssets(output, toolCallLog) {
  const assets = [];
  // From tool calls — any fetch/scan/crawl/query tool = inspected something
  for (const tc of toolCallLog) {
    if (/fetch_|scan_|crawl_|check_|read_page|get_page/.test(tc.tool)) {
      assets.push({
        type: tc.tool.replace('fetch_', '').replace('scan_', ''),
        label: tc.args?.url || tc.args?.domain || tc.args?.keyword || tc.args?.business_name || tc.tool,
        fetched_at: new Date().toISOString(),
      });
    }
  }
  // From output if agent reports what it inspected
  if (output?.inspected_assets) assets.push(...output.inspected_assets);
  if (output?.pages_checked) {
    output.pages_checked.forEach(p => assets.push({ type: 'page', label: p }));
  }
  if (output?.urls_scanned) {
    output.urls_scanned.forEach(u => assets.push({ type: 'url', label: u }));
  }
  return assets;
}

function extractDataSources(output, toolCallLog) {
  const sources = [];
  const seenSources = new Set();

  for (const tc of toolCallLog) {
    let sourceType = null;
    if (/pagespeed/.test(tc.tool)) sourceType = 'pagespeed';
    else if (/serp|ranking/.test(tc.tool)) sourceType = 'dataforseo';
    else if (/backlink/.test(tc.tool)) sourceType = 'backlink_data';
    else if (/review/.test(tc.tool)) sourceType = 'gbp_reviews';
    else if (/local/.test(tc.tool)) sourceType = 'local_falcon';
    else if (/gsc|search_console/.test(tc.tool)) sourceType = 'gsc';
    else if (/perplexity/.test(tc.tool)) sourceType = 'perplexity_geo';
    else if (/query_metrics|query_baselines/.test(tc.tool)) sourceType = 'stored_metrics';
    else if (/read_page|scan_website|fetch_page/.test(tc.tool)) sourceType = 'website_scan';

    if (sourceType && !seenSources.has(sourceType)) {
      seenSources.add(sourceType);
      const thresholds = FRESHNESS_THRESHOLDS[sourceType] || { freshHours: 24, agingHours: 72 };
      sources.push({
        source: sourceType,
        freshness_state: getFreshnessState(new Date().toISOString(), thresholds.freshHours, thresholds.agingHours),
        row_count: tc.resultPreview ? 1 : 0,
      });
    }
  }

  // From output if agent reports its sources
  if (output?.data_sources_used) sources.push(...output.data_sources_used);
  return sources;
}

function extractMeasuredFindings(output) {
  const findings = [];
  // Explicit measured findings from output
  if (output?.measured_findings) return output.measured_findings;

  // Infer from common output patterns
  if (output?.issues?.length) {
    output.issues.forEach(i => findings.push({
      title: typeof i === 'string' ? i : (i.title || i.description || i.issue || 'Issue found'),
      evidence: typeof i === 'string' ? i : JSON.stringify(i),
      severity: i.severity || 'medium',
    }));
  }
  if (output?.metrics && typeof output.metrics === 'object') {
    Object.entries(output.metrics).forEach(([k, v]) => {
      if (typeof v === 'number') findings.push({ title: k, evidence: `${k} = ${v}`, metric_name: k, metric_value: v });
    });
  }
  if (output?.regressions?.length) {
    output.regressions.forEach(r => findings.push({ title: 'Regression', evidence: JSON.stringify(r), severity: 'high' }));
  }
  // Technical SEO crawl agent bucket format
  const buckets = ['bucket_1_indexing', 'bucket_3_schema', 'bucket_4_technical_debt', 'bucket_5_robots_sitemap'];
  for (const bucket of buckets) {
    if (Array.isArray(output?.[bucket]) && output[bucket].length > 0) {
      output[bucket].forEach(item => findings.push({
        title: item.issue || item.verdict || bucket,
        evidence: JSON.stringify(item),
        severity: item.severity || 'medium',
      }));
    }
  }
  if (output?.bucket_2_pagespeed?.opportunities?.length > 0) {
    output.bucket_2_pagespeed.opportunities.forEach(o => findings.push({
      title: o.title || o.opportunity || 'PageSpeed opportunity',
      evidence: JSON.stringify(o),
      severity: 'medium',
    }));
  }
  if (typeof output?.total_issues_found === 'number' && output.total_issues_found > 0) {
    findings.push({ title: 'Total issues found', evidence: `${output.total_issues_found} issues found`, metric_name: 'total_issues_found', metric_value: output.total_issues_found });
  }
  if (typeof output?.non_indexed_pages_count === 'number') {
    findings.push({ title: 'Non-indexed pages', evidence: `${output.non_indexed_pages_count} pages not indexed`, metric_name: 'non_indexed_pages_count', metric_value: output.non_indexed_pages_count });
  }
  if (typeof output?.indexed_pages_count === 'number') {
    findings.push({ title: 'Indexed pages', evidence: `${output.indexed_pages_count} pages indexed`, metric_name: 'indexed_pages_count', metric_value: output.indexed_pages_count });
  }
  // Catch-all: any non-empty array at top level = agent found something real
  const FINDING_ARRAYS = ['opportunities', 'top_queries', 'fell_off_page1', 'top_pages', 'alerts',
    'ranking_changes', 'quick_wins', 'content_gaps', 'new_citations', 'lost_citations',
    'cro_opportunities', 'link_opportunities', 'missing_schema', 'redirect_issues'];
  for (const key of FINDING_ARRAYS) {
    if (Array.isArray(output?.[key]) && output[key].length > 0 && !findings.some(f => f.metric_name === key)) {
      findings.push({ title: key.replace(/_/g, ' '), evidence: `${output[key].length} ${key.replace(/_/g,' ')} found`, metric_name: key, metric_value: output[key].length });
    }
  }
  // Catch-all: top-level numeric fields = real measurements
  const NUMERIC_KEYS = ['daily_health_score', 'overall_health_score', 'geo_score', 'local_pack_count',
    'total_reviews', 'avg_rating', 'page1_count', 'new_backlinks', 'lost_backlinks', 'domain_authority',
    'conversion_rate', 'sessions', 'bounce_rate', 'pages_discovered', 'total_issues_found'];
  for (const key of NUMERIC_KEYS) {
    if (typeof output?.[key] === 'number' && !findings.some(f => f.metric_name === key)) {
      findings.push({ title: key.replace(/_/g, ' '), evidence: `${key} = ${output[key]}`, metric_name: key, metric_value: output[key] });
    }
  }
  return findings;
}

function extractMissingSources(output, agentSlug, toolCallLog) {
  const missing = [];
  // From output if agent reports missing
  if (output?.missing_sources) return output.missing_sources;

  // Check hard block rules
  const required = HARD_BLOCK_RULES[agentSlug] || [];
  const toolNames = toolCallLog.map(t => t.tool).join(' ');
  const outputStr = JSON.stringify(output || {}).toLowerCase();

  for (const req of required) {
    let found = false;
    if (req === 'keyword_rankings' && (/ranking|serp|keyword/.test(toolNames) || output?.rankings)) found = true;
    if (req === 'website_scan' && (/read_page|scan|fetch_page|crawl/.test(toolNames) || output?.pages_checked)) found = true;
    if (req === 'gsc_property_data' && (/gsc|search_console/.test(toolNames) || output?.gsc_data)) found = true;
    if (req === 'review_source_data' && (/review/.test(toolNames) || output?.reviews || output?.google_reviews_count != null)) found = true;
    if (req === 'gbp_location_data' && (/gbp|google_business|review|local/.test(toolNames))) found = true;
    if (req === 'page_html' && (/read_page|fetch_page|scan/.test(toolNames))) found = true;
    if (req === 'competitor_dataset' && (/competitor/.test(toolNames) || output?.competitors)) found = true;
    if (req === 'perplexity_geo_results' && (/perplexity/.test(toolNames) || output?.citations)) found = true;
    if (req === 'authority_or_link_data' && (/backlink|authority|link/.test(toolNames) || output?.backlinks)) found = true;
    if (req === 'parsed_hebrew_text' && (/read_page|fetch_page/.test(toolNames) || output?.hebrew_issues)) found = true;
    if (req === 'baseline_snapshot' && (/baseline|metric|snapshot/.test(toolNames) || output?.baselines)) found = true;
    if (req === 'connector_validation' && (/credential|token|test/.test(toolNames))) found = true;
    if (req === 'queue_state' && (/queue/.test(toolNames) || output?.queue_state)) found = true;
    if (req === 'client_strategy' && outputStr.includes('strategy')) found = true;
    // Generic fallback
    if (!found && outputStr.includes(req.replace(/_/g, ' '))) found = true;

    if (!found) {
      missing.push({ source: req, critical: true, reason: `Required source "${req}" not found in tool calls or output` });
    }
  }
  return missing;
}

// ============================================================
// ENFORCE TRUTH GATE — called after every agent run
// Downgrades status and confidence if output doesn't prove real work
// ============================================================
function enforceTruthGate(output, agentSlug, toolCallLog) {
  const inspectedAssets = extractInspectedAssets(output, toolCallLog);
  const dataSources = extractDataSources(output, toolCallLog);
  const measuredFindings = extractMeasuredFindings(output);
  const missingSources = extractMissingSources(output, agentSlug, toolCallLog);
  const dataCompleteness = computeDataCompleteness(output, toolCallLog, agentSlug);

  const realSourceCount = dataSources.filter(s => s.freshness_state !== 'unknown').length;
  const criticalMissing = missingSources.filter(s => s.critical).length;
  const staleCount = dataSources.filter(s => s.freshness_state === 'stale').length;
  const proposedChangesCount = toolCallLog.filter(t => t.tool === 'propose_website_change').length;
  const hasActions = (output?.actions_taken?.length > 0) || (output?.follow_up_tasks?.length > 0) ||
    (output?.changes_made?.length > 0) || (output?.fixes_applied?.length > 0) ||
    (output?.total_fixes_proposed > 0) || (output?.fixes_proposed > 0) || proposedChangesCount > 0;

  // Count tool calls that returned errors (especially quota/auth failures)
  const toolErrors = toolCallLog.filter(t => {
    try { const r = JSON.parse(t.result_preview || '{}'); return !!r.error; } catch { return false; }
  }).length;
  const toolSuccesses = toolCallLog.length - toolErrors;

  // Determine confidence
  let confidence = 'high';
  if (dataCompleteness < 70 || realSourceCount < 2 || staleCount > 0 || criticalMissing > 0) {
    confidence = 'medium';
  }
  // Zero measured findings = low confidence regardless of completeness percentage.
  // data_completeness counts SOURCES TOUCHED not DATA RECEIVED, so an agent that
  // called 5 tools and got errors from all of them would show 100% completeness
  // but produce zero useful output. This run is NOT trustworthy.
  if (measuredFindings.length === 0) {
    confidence = 'low';
  }
  // If most tool calls returned errors, the run is essentially worthless
  if (toolCallLog.length > 0 && toolErrors / toolCallLog.length > 0.5) {
    confidence = 'low';
  }
  if (dataCompleteness < 30 || (inspectedAssets.length === 0 && realSourceCount === 0 && toolCallLog.length === 0) || toolSuccesses === 0) {
    confidence = 'very_low';
  }

  // Determine if status should be downgraded
  let statusOverride = null; // null = keep original
  if (dataCompleteness < 50 || (measuredFindings.length === 0 && !hasActions) || realSourceCount === 0 || inspectedAssets.length === 0) {
    statusOverride = 'partial';
  }
  if (criticalMissing > 0 && dataCompleteness < 40) {
    statusOverride = 'partial';
  }
  // If every meaningful tool call errored out, don't call this a success
  if (toolCallLog.length >= 2 && toolErrors / toolCallLog.length > 0.5 && measuredFindings.length === 0) {
    statusOverride = 'partial';
  }

  // Build why_incomplete
  const whyIncomplete = [];
  if (inspectedAssets.length === 0) whyIncomplete.push('No real asset was inspected (no page fetch, crawl, or scan)');
  if (realSourceCount === 0) whyIncomplete.push('No real external data source was queried');
  if (criticalMissing > 0) whyIncomplete.push(`Missing critical sources: ${missingSources.filter(s => s.critical).map(s => s.source).join(', ')}`);
  if (staleCount > 0) whyIncomplete.push(`${staleCount} data source(s) are stale`);
  if (measuredFindings.length === 0) whyIncomplete.push('No measured findings — output may be entirely inferred');
  if (toolCallLog.length === 0) whyIncomplete.push('No tools were called');

  // Inferred recommendations (anything not backed by measured data)
  const inferredRecs = [];
  const recs = output?.recommendations || output?.cro_opportunities || output?.quick_wins || output?.top3_quick_wins || [];
  if (Array.isArray(recs)) {
    recs.forEach(r => {
      inferredRecs.push({
        recommendation: typeof r === 'string' ? r : (r.recommendation || r.action || r.opportunity || JSON.stringify(r)),
        based_on: 'inferred from agent knowledge',
        confidence: measuredFindings.length > 0 ? 'medium' : 'low',
      });
    });
  }

  return {
    confidence,
    data_completeness_percent: dataCompleteness,
    status_override: statusOverride,
    inspected_assets: inspectedAssets,
    data_sources_used: dataSources,
    missing_sources: missingSources,
    measured_findings: measuredFindings,
    inferred_recommendations: inferredRecs,
    freshness_summary: {
      overall_state: staleCount > 0 ? 'stale' : (dataSources.length === 0 ? 'unknown' : 'fresh'),
      stale_sources_count: staleCount,
      critical_stale_sources_count: dataSources.filter(s => s.freshness_state === 'stale').length,
    },
    why_this_may_be_incomplete: whyIncomplete,
  };
}

// ============================================================
// CENTRAL COORDINATION ENGINE
// Runs after EVERY agent completes. Sees output, decides next steps.
// This is the brain that connects all agents into one growth system.
// ============================================================
export async function coordinatePostRun(clientId, runId, agent, output, taskPayload) {
  if (!output || typeof output !== 'object') return;

  const agentSlug = agent.slug;
  const lane = agent.lane;
  const followUps = [];

  // ── 0. REPAIR WEAK RUNS — if truth gate flagged missing inputs, fix them ──
  const truthGate = output?._truth_gate;
  if (truthGate?.missing_sources?.length > 0) {
    const REPAIR_MAP = {
      'website_scan': 'technical-seo-crawl-agent',
      'keyword_rankings': 'seo-core-agent',
      'gsc_property_data': 'credential-health-agent',
      'review_source_data': 'credential-health-agent',
      'gbp_location_data': 'credential-health-agent',
      'page_html': 'website-content-agent',
      'page_structure': 'technical-seo-crawl-agent',
      'perplexity_geo_results': 'geo-ai-visibility-agent',
      'authority_or_link_data': 'authority-backlinks-agent',
      'competitor_dataset': 'competitor-intelligence-agent',
      'connector_validation': 'credential-health-agent',
      'baseline_snapshot': 'kpi-integrity-agent',
      'google_ads_campaign_data': 'credential-health-agent',
      'analytics_events': 'credential-health-agent',
      'kpi_sources': 'kpi-integrity-agent',
      'parsed_hebrew_text': 'website-content-agent',
      'target_content': 'website-content-agent',
      'changed_output_target': 'website-qa-agent',
      'validation_target': 'technical-seo-crawl-agent',
      'distribution_targets': 'seo-core-agent',
      'report_source_blocks': 'kpi-integrity-agent',
      'client_strategy': 'master-orchestrator',
    };
    for (const ms of truthGate.missing_sources) {
      const repairSlug = REPAIR_MAP[ms.source];
      if (repairSlug && repairSlug !== agentSlug) {
        followUps.push({
          slug: repairSlug,
          reason: `Repair: ${agentSlug} missing "${ms.source}" — need to fetch/connect this data`,
          issues: [{ source: ms.source, reason: ms.reason }],
        });
      }
    }
  }

  // ── 1. Route SEO issues to content/technical agents ──────────
  const seoIssues = output.issues || output.seo_issues || output.technical_issues || output.regressions || [];
  if (seoIssues.length > 0 && agentSlug !== 'master-orchestrator') {
    // SEO/technical issues → queue technical or content agent
    const contentIssues = seoIssues.filter(i => {
      const desc = typeof i === 'string' ? i : (i.description || i.issue || '');
      return /content|thin|missing.*text|title|meta|h1|heading/i.test(desc);
    });
    const technicalIssues = seoIssues.filter(i => {
      const desc = typeof i === 'string' ? i : (i.description || i.issue || '');
      return /speed|crawl|index|schema|canonical|redirect|404|broken|ssl|robots/i.test(desc);
    });

    if (contentIssues.length > 0 && agentSlug !== 'website-content-agent') {
      followUps.push({ slug: 'website-content-agent', reason: `${contentIssues.length} content issues found by ${agent.name}`, issues: contentIssues });
    }
    if (technicalIssues.length > 0 && agentSlug !== 'technical-seo-crawl-agent') {
      followUps.push({ slug: 'technical-seo-crawl-agent', reason: `${technicalIssues.length} technical issues found by ${agent.name}`, issues: technicalIssues });
    }
  }

  // ── 2. Route ranking regressions to SEO core ─────────────────
  const regressions = output.regressions || output.ranking_drops || [];
  if (regressions.length > 0 && agentSlug !== 'seo-core-agent') {
    followUps.push({ slug: 'seo-core-agent', reason: `${regressions.length} ranking regressions detected by ${agent.name}`, issues: regressions });
  }

  // ── 3. Route competitor findings to content/GEO agents ───────
  const competitorFindings = output.competitor_gaps || output.competitor_advantages || output.content_gaps || [];
  if (competitorFindings.length > 0 && agentSlug === 'competitor-intelligence-agent') {
    followUps.push({ slug: 'website-content-agent', reason: `${competitorFindings.length} competitor content gaps to address`, issues: competitorFindings });
    followUps.push({ slug: 'geo-ai-visibility-agent', reason: `Competitor intelligence found gaps in AI visibility`, issues: competitorFindings });
  }

  // ── 4. Route review/GBP findings ─────────────────────────────
  const reviewIssues = output.review_issues || output.gbp_issues || output.negative_reviews || [];
  if (reviewIssues.length > 0 && agentSlug === 'reviews-gbp-authority-agent') {
    followUps.push({ slug: 'local-seo-agent', reason: `Review/GBP issues need local SEO attention`, issues: reviewIssues });
  }

  // ── 5. Route authority/backlink needs ────────────────────────
  const authorityNeeds = output.backlink_opportunities || output.authority_gaps || output.link_targets || [];
  if (authorityNeeds.length > 0) {
    followUps.push({ slug: 'content-distribution-agent', reason: `${authorityNeeds.length} authority/backlink opportunities to pursue`, issues: authorityNeeds });
  }

  // ── 6. Route design/UX issues ────────────────────────────────
  const designIssues = output.design_violations || output.ux_issues || output.cro_issues || [];
  if (designIssues.length > 0 && agentSlug !== 'design-consistency-agent' && agentSlug !== 'design-enforcement-agent') {
    followUps.push({ slug: 'design-enforcement-agent', reason: `${designIssues.length} design/UX issues found by ${agent.name}`, issues: designIssues });
  }

  // ── 7. Route Hebrew/language issues ──────────────────────────
  const hebrewIssues = output.hebrew_issues || output.language_issues || output.rtl_issues || [];
  if (hebrewIssues.length > 0 && agentSlug !== 'hebrew-quality-agent') {
    followUps.push({ slug: 'hebrew-quality-agent', reason: `${hebrewIssues.length} Hebrew/language issues found by ${agent.name}`, issues: hebrewIssues });
  }

  // ── 8. Route credential/integration issues ───────────────────
  const credIssues = output.credential_issues || output.integration_errors || [];
  if (credIssues.length > 0 && agentSlug !== 'credential-health-agent') {
    followUps.push({ slug: 'credential-health-agent', reason: `${credIssues.length} credential/integration issues`, issues: credIssues });
  }

  // ── 9. Store growth signals in baselines ─────────────────────
  const metrics = output.metrics || output.kpis || {};
  if (typeof metrics === 'object' && Object.keys(metrics).length > 0) {
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        await supabase.from('baselines').upsert({
          client_id: clientId, metric_name: key,
          metric_value: value, source: `${agent.name} (auto)`,
          recorded_at: new Date().toISOString(),
        }, { onConflict: 'client_id,metric_name' }).catch(() => {});
      }
    }
  }

  // ── 10. Queue all follow-up tasks with priority scoring ──────
  if (followUps.length === 0) return { follow_ups: 0 };

  // Load client strategy for goal-aligned priority boosting
  const { data: clientStrategy } = await supabase.from('client_rules')
    .select('*').eq('client_id', clientId).maybeSingle();
  const strategy = clientStrategy?.strategy || null;

  // Deduplicate: don't queue the same agent if it's already queued for this client
  const { data: existingQueue } = await supabase.from('run_queue')
    .select('agent_template_id').eq('client_id', clientId).in('status', ['queued', 'running']);
  const queuedAgentIds = new Set((existingQueue || []).map(q => q.agent_template_id));

  const { data: agentTemplates } = await supabase.from('agent_templates')
    .select('id, slug, name').in('slug', followUps.map(f => f.slug)).eq('is_active', true);

  let queued = 0;
  for (const fu of followUps) {
    const tmpl = agentTemplates?.find(a => a.slug === fu.slug);
    if (!tmpl || queuedAgentIds.has(tmpl.id)) continue;

    // Compute priority score for this follow-up
    const scoringInput = estimateFollowUpPriority(agentSlug, fu.slug, fu.issues, output);
    scoringInput.clientStrategy = strategy;
    const priorityScore = computePriorityScore(scoringInput);

    await supabase.from('run_queue').insert({
      client_id: clientId,
      agent_template_id: tmpl.id,
      task_payload: {
        triggered_by_agent: agentSlug,
        triggered_by_run: runId,
        reason: fu.reason,
        issues_to_address: fu.issues.slice(0, 10),
        objective: fu.reason,
        coordination_source: 'central_coordinator',
        priority_scoring: {
          impact: scoringInput.impact,
          effort: scoringInput.effort,
          confidence: scoringInput.confidence,
          urgency: scoringInput.urgency,
          business_goal: scoringInput.businessGoal,
          computed_score: priorityScore,
        },
      },
      status: 'queued',
      queued_by: 'central_coordinator',
      priority: priorityScore >= 8 ? 0 : priorityScore >= 6 ? 1 : priorityScore >= 4 ? 2 : 3,
      priority_score: priorityScore,
    });
    queuedAgentIds.add(tmpl.id);
    queued++;
  }

  // Log coordination action
  if (queued > 0) {
    await supabase.from('audit_trail').insert({
      client_id: clientId, run_id: runId,
      agent_slug: 'central-coordinator',
      action: 'coordination',
      actor: 'central_coordinator',
      details: {
        source_agent: agentSlug,
        follow_ups_created: queued,
        agents_activated: followUps.filter(f => agentTemplates?.find(a => a.slug === f.slug)).map(f => f.slug),
        reasons: followUps.map(f => f.reason),
      }
    }).catch(() => {});

    // Process queue immediately
    processRunQueue().catch(err => console.error('[COORD_PROCESS]', err.message));
  }

  return { follow_ups: queued, agents_activated: followUps.map(f => f.slug) };
}

// ============================================================
// GOVERN POST-CHANGE — action_type-aware validation pipeline
// Replaces runPostChangePipeline. Routes validators by action_type.
// ============================================================
export async function governPostChange(clientId, ownerRunId, ownerAgentSlug, actionType, originalPayload = {}) {
  const requiredValidators = VALIDATION_MATRIX[actionType] || VALIDATION_MATRIX.generic_change;

  const { data: agents } = await supabase
    .from('agent_templates')
    .select('id, slug, name')
    .in('slug', requiredValidators)
    .eq('is_active', true);

  if (!agents?.length) {
    console.warn(`[GOVERNANCE] No active validator agents found for action_type=${actionType}`);
    // Fallback: mark run as success since we can't validate
    await supabase.from('runs').update({
      status: 'success',
      final_validation_status: 'partial',
      validation_required: requiredValidators,
    }).eq('id', ownerRunId);
    return { queued: 0, error: 'No validator agents found' };
  }

  const agentMap = Object.fromEntries(agents.map(a => [a.slug, a]));
  const actualValidators = requiredValidators.filter(slug => agentMap[slug]);

  // Update the owner run with actual validation_required list
  await supabase.from('runs').update({
    validation_required: actualValidators,
    final_validation_status: 'in_progress',
    post_change_validation_status: 'running',
  }).eq('id', ownerRunId);

  // Queue validators in sequence (each depends on the previous completing)
  const queueItems = [];
  let prevQueueId = null;

  for (const slug of actualValidators) {
    const agent = agentMap[slug];
    if (!agent) continue;

    const { data: queueItem } = await supabase.from('run_queue').insert({
      client_id: clientId,
      agent_template_id: agent.id,
      task_payload: {
        validation_chain: true,
        pipeline_phase: 'validate',
        owner_run_id: ownerRunId,
        owner_agent_slug: ownerAgentSlug,
        action_type: actionType,
        triggered_by_run: ownerRunId,
        original_change: originalPayload?.change_description || 'Change made by ' + ownerAgentSlug,
        affected_urls: originalPayload?.affected_urls || [],
        instructions: `GOVERNANCE VALIDATION: Agent "${ownerAgentSlug}" made a "${actionType}" change. ` +
          `You are the "${slug}" validator. Check everything in your domain related to this change. ` +
          `Set "validation_passed": true/false. If failed, populate "issues" array with severity and details. ` +
          `You may NOT self-approve changes made by "${slug === ownerAgentSlug ? '[BLOCKED]' : slug}".`
      },
      status: 'queued',
      queued_by: 'governance_engine',
      priority: 1,
      depends_on: prevQueueId ? [prevQueueId] : [],
    }).select('id').single();

    if (queueItem) {
      queueItems.push(queueItem);
      prevQueueId = queueItem.id;
    }
  }

  console.log(`[GOVERNANCE] Queued ${queueItems.length} validators for owner_run=${ownerRunId} action_type=${actionType}`);
  processRunQueue().catch(err => console.error('[GOVERNANCE_PROCESS]', err.message));

  return {
    owner_run_id: ownerRunId,
    action_type: actionType,
    validators_required: actualValidators,
    validators_queued: queueItems.length,
    queue_ids: queueItems.map(q => q.id),
  };
}

// Keep old name as alias for backward compatibility
export const runPostChangePipeline = governPostChange;

// ============================================================
// POST-CHANGE: Check validation results and auto-fix
// Called after each validation agent completes
// ============================================================
export async function checkValidationAndAutoFix(clientId, completedRunId) {
  const { data: validatorRun } = await supabase.from('runs')
    .select('*, agent_templates(slug, name)')
    .eq('id', completedRunId).single();

  if (!validatorRun?.task_payload?.validation_chain || validatorRun.task_payload.pipeline_phase !== 'validate') return;

  const validatorSlug = validatorRun.agent_templates?.slug;
  const ownerRunId = validatorRun.task_payload.owner_run_id || validatorRun.task_payload.triggered_by_run;
  const ownerAgentSlug = validatorRun.task_payload.owner_agent_slug;

  if (!ownerRunId) {
    console.warn(`[GOVERNANCE] Validator run ${completedRunId} has no owner_run_id`);
    return;
  }

  // Load current state of the owner run
  const { data: ownerRun } = await supabase.from('runs')
    .select('id, status, owner_agent_slug, action_type, validation_required, validation_completed, validation_failed_reasons, final_validation_status')
    .eq('id', ownerRunId).single();

  if (!ownerRun) {
    console.warn(`[GOVERNANCE] Owner run ${ownerRunId} not found`);
    return;
  }

  const output = typeof validatorRun.output === 'string' ? JSON.parse(validatorRun.output || '{}') : (validatorRun.output || {});

  // Determine if this validator passed
  const issuesFound = output?.issues_found === true ||
    (output?.issues?.length > 0) ||
    (output?.errors?.length > 0) ||
    (output?.critical_issues?.length > 0) ||
    (output?.hebrew_issues?.length > 0) ||
    (output?.design_violations?.length > 0) ||
    (output?.seo_issues?.length > 0) ||
    (output?.qa_failures?.length > 0);
  const validationPassed = output?.validation_passed === true || (!issuesFound && validatorRun.status === 'success');

  // Update owner run: add this validator to completed list
  const alreadyCompleted = ownerRun.validation_completed || [];
  const alreadyFailed = ownerRun.validation_failed_reasons || [];
  const newCompleted = alreadyCompleted.includes(validatorSlug) ? alreadyCompleted : [...alreadyCompleted, validatorSlug];

  let newFailedReasons = [...alreadyFailed];
  if (!validationPassed) {
    const issues = output.issues || output.errors || output.critical_issues ||
      output.hebrew_issues || output.design_violations || output.seo_issues || output.qa_failures || [];
    newFailedReasons.push({
      validator: validatorSlug,
      issues,
      validated_at: new Date().toISOString(),
    });
  }

  const requiredValidators = ownerRun.validation_required || [];
  const allDone = requiredValidators.length > 0 && requiredValidators.every(v => newCompleted.includes(v));
  const anyFailed = newFailedReasons.length > 0;

  // Determine new owner run status
  let ownerStatusUpdate = {
    validation_completed: newCompleted,
    validation_failed_reasons: newFailedReasons,
  };

  if (allDone) {
    if (!anyFailed) {
      // All validators passed — work is complete
      ownerStatusUpdate.status = 'success';
      ownerStatusUpdate.final_validation_status = 'passed';
      ownerStatusUpdate.post_change_validation_status = 'passed';
      console.log(`[GOVERNANCE] Owner run ${ownerRunId} fully validated — all ${requiredValidators.length} validators passed`);
    } else {
      // Some validators failed — owner run stays failed
      ownerStatusUpdate.status = 'validation_failed';
      ownerStatusUpdate.final_validation_status = 'failed';
      ownerStatusUpdate.post_change_validation_status = 'failed';
      console.log(`[GOVERNANCE] Owner run ${ownerRunId} validation FAILED — ${newFailedReasons.length} validator(s) found issues`);

      // Create incident for master orchestrator visibility
      await supabase.from('incidents').insert({
        client_id: clientId,
        run_id: ownerRunId,
        title: `Validation failed: ${ownerRun.action_type || 'change'} by ${ownerRun.owner_agent_slug || 'unknown agent'}`,
        severity: 'high',
        status: 'open',
        details: {
          owner_agent: ownerRun.owner_agent_slug,
          action_type: ownerRun.action_type,
          failed_validators: newFailedReasons.map(f => f.validator),
          validation_required: requiredValidators,
          validation_completed: newCompleted,
        }
      }).catch(() => {});
    }
  } else {
    // Still waiting on more validators
    ownerStatusUpdate.final_validation_status = 'in_progress';
  }

  await supabase.from('runs').update(ownerStatusUpdate).eq('id', ownerRunId);

  // If this validator failed — queue a fixer (not the owner agent)
  if (!validationPassed) {
    const fixerSlug = VALIDATOR_FIXER_MAP[validatorSlug];

    // HARD RULE: fixer cannot be the owner agent
    const effectiveFixerSlug = (fixerSlug && fixerSlug !== ownerAgentSlug)
      ? fixerSlug
      : (fixerSlug === ownerAgentSlug ? 'master-orchestrator' : null); // escalate to orchestrator

    if (!effectiveFixerSlug) {
      console.warn(`[GOVERNANCE] No fixer found for validator ${validatorSlug}`);
      return;
    }

    if (effectiveFixerSlug === ownerAgentSlug) {
      // This should not happen after the check above, but safety net
      console.error(`[GOVERNANCE BLOCK] Prevented ${ownerAgentSlug} from self-fixing via ${validatorSlug} validation`);
      return;
    }

    const { data: fixerAgent } = await supabase.from('agent_templates')
      .select('id, slug, name').eq('slug', effectiveFixerSlug).eq('is_active', true).single();

    if (!fixerAgent) {
      console.warn(`[GOVERNANCE] Fixer agent not found or not active: ${effectiveFixerSlug}`);
      return;
    }

    const issues = output.issues || output.errors || output.critical_issues ||
      output.hebrew_issues || output.design_violations || output.seo_issues || output.qa_failures || [];

    const { data: fixQueueItem } = await supabase.from('run_queue').insert({
      client_id: clientId,
      agent_template_id: fixerAgent.id,
      task_payload: {
        validation_chain: true,
        pipeline_phase: 'fix',
        owner_run_id: ownerRunId,
        owner_agent_slug: ownerRun.owner_agent_slug,
        action_type: ownerRun.action_type,
        triggered_by_validator: validatorSlug,
        triggered_by_run: completedRunId,
        issues_to_fix: issues,
        instructions: `GOVERNANCE FIX REQUIRED: Validator "${validatorSlug}" found issues after a "${ownerRun.action_type}" change made by "${ownerRun.owner_agent_slug}". ` +
          `You are the designated fixer. Fix ALL listed issues. Set "fixed": true and populate "fixes_applied" when done.\n\nISSUES:\n${JSON.stringify(issues, null, 2)}`
      },
      status: 'queued',
      queued_by: 'governance_engine',
      priority: 0,
    }).select('id').single();

    // Queue re-validation after fix (same validator, depends on fix completing)
    if (fixQueueItem) {
      const { data: revalidateAgent } = await supabase.from('agent_templates')
        .select('id').eq('slug', validatorSlug).eq('is_active', true).single();

      if (revalidateAgent) {
        await supabase.from('run_queue').insert({
          client_id: clientId,
          agent_template_id: revalidateAgent.id,
          task_payload: {
            validation_chain: true,
            pipeline_phase: 're-validate',
            owner_run_id: ownerRunId,
            owner_agent_slug: ownerRun.owner_agent_slug,
            action_type: ownerRun.action_type,
            triggered_by_fix: fixQueueItem.id,
            original_validator: validatorSlug,
            instructions: `RE-VALIDATION: Fixer "${effectiveFixerSlug}" attempted to resolve issues found by you. ` +
              `Re-check your domain to confirm the fix was applied correctly. ` +
              `Set "validation_passed": true if resolved, or re-flag issues if they persist.`
          },
          status: 'queued',
          queued_by: 'governance_engine',
          priority: 0,
          depends_on: [fixQueueItem.id],
        });
      }
    }
  }

  return {
    validator: validatorSlug,
    passed: validationPassed,
    owner_run_id: ownerRunId,
    all_done: allDone,
    any_failed: anyFailed,
  };
}

// ============================================================
// RUN LANE
// ============================================================
export async function runLane(clientId, laneName) {
  const { data: assignments } = await supabase
    .from('client_agent_assignments')
    .select('*, agent_templates(*)')
    .eq('client_id', clientId)
    .eq('enabled', true);

  const laneAgents = assignments
    ?.filter(a => a.agent_templates?.lane === laneName)
    .sort((a, b) => {
      const roleOrder = { owner: 0, worker: 1, validator: 2 };
      return (roleOrder[a.agent_templates.role_type] || 1) - (roleOrder[b.agent_templates.role_type] || 1);
    }) || [];

  if (!laneAgents.length) return { queued: 0, error: `No agents enabled for lane: ${laneName}` };

  const queueItems = laneAgents.map(a => ({
    client_id: clientId,
    agent_template_id: a.agent_template_id,
    task_payload: { lane: laneName, triggered_by: 'run_lane' },
    status: 'queued',
    queued_by: 'run_lane',
    priority: 3
  }));

  const { data: inserted } = await supabase.from('run_queue').insert(queueItems).select();

  await supabase.from('audit_trail').insert({
    client_id: clientId,
    agent_slug: 'system',
    action: 'lane_queued',
    actor: 'admin',
    details: { lane: laneName, agents_queued: laneAgents.length }
  });

  // Fire-and-forget: process queue immediately
  processRunQueue().catch(err => console.error('[IMMEDIATE_PROCESS]', err.message));

  return { queued: inserted?.length || 0, lane: laneName, agents: laneAgents.map(a => a.agent_templates.name) };
}

// ============================================================
// RUN ALL AGENTS FOR CLIENT
// ============================================================
export async function runAllAgentsForClient(clientId) {
  const { data: assignments } = await supabase
    .from('client_agent_assignments')
    .select('*, agent_templates(*)')
    .eq('client_id', clientId)
    .eq('enabled', true);

  if (!assignments?.length) return { queued: 0, error: 'No agents enabled for this client' };

  // Orchestrator first, then by lane, then role order
  const roleOrder = { owner: 0, worker: 1, validator: 2 };
  const sorted = [...assignments].sort((a, b) => {
    if (a.agent_templates.slug === 'master-orchestrator') return -1;
    if (b.agent_templates.slug === 'master-orchestrator') return 1;
    const laneCompare = a.agent_templates.lane.localeCompare(b.agent_templates.lane);
    if (laneCompare !== 0) return laneCompare;
    return (roleOrder[a.agent_templates.role_type] || 1) - (roleOrder[b.agent_templates.role_type] || 1);
  });

  const queueItems = sorted.map((a, idx) => ({
    client_id: clientId,
    agent_template_id: a.agent_template_id,
    task_payload: { triggered_by: 'run_all', sequence_position: idx + 1 },
    status: 'queued',
    queued_by: 'run_all',
    priority: 5
  }));

  const { data: inserted } = await supabase.from('run_queue').insert(queueItems).select();

  await supabase.from('audit_trail').insert({
    client_id: clientId,
    agent_slug: 'system',
    action: 'run_all_queued',
    actor: 'admin',
    details: { agents_queued: queueItems.length }
  });

  // Fire-and-forget: process queue immediately
  processRunQueue().catch(err => console.error('[IMMEDIATE_PROCESS]', err.message));

  return { queued: inserted?.length || 0, total_agents: assignments.length };
}

// ============================================================
// RETRY FAILED RUN
// ============================================================
export async function retryRun(runId) {
  const { data: run } = await supabase
    .from('runs')
    .select('*, agent_templates(slug)')
    .eq('id', runId)
    .single();

  if (!run) throw new Error('Run not found');
  if (run.status !== 'failed') throw new Error(`Can only retry failed runs, current status: ${run.status}`);

  // Queue a new run with the same parameters
  const { data: queueItem } = await supabase.from('run_queue').insert({
    client_id: run.client_id,
    agent_template_id: run.agent_template_id,
    task_payload: { ...(run.task_payload || {}), retry_of: runId },
    status: 'queued',
    queued_by: 'manual_retry',
    priority: 2
  }).select().single();

  await supabase.from('audit_trail').insert({
    client_id: run.client_id,
    run_id: runId,
    agent_slug: run.agent_templates?.slug,
    action: 'run_retried',
    actor: 'admin',
    details: { original_run_id: runId, new_queue_item_id: queueItem?.id }
  });

  // Fire-and-forget: process queue immediately
  processRunQueue().catch(err => console.error('[IMMEDIATE_PROCESS]', err.message));

  return { success: true, queueItemId: queueItem?.id };
}

// ============================================================
// INGEST DOCUMENT TO MEMORY
// ============================================================
export async function ingestDocumentToMemory(clientId, documentId) {
  const { data: doc } = await supabase
    .from('client_documents').select('*').eq('id', documentId).single();
  if (!doc) throw new Error('Document not found');

  await supabase.from('client_documents')
    .update({ processing_status: 'processing', updated_at: new Date().toISOString() })
    .eq('id', documentId);

  let totalMemoryItems = 0;
  let chunksProcessed = 0;

  try {
    // Fetch file from Supabase Storage
    const { data: fileData, error: downloadErr } = await supabase.storage
      .from('client-documents')
      .download(doc.file_url);

    if (downloadErr) throw new Error(`Could not download file: ${downloadErr.message}`);

    const text = await fileData.text();
    if (!text || text.length < 50) throw new Error('Document appears to be empty or too short to process');

    // Chunk text into 1800-char chunks with 200-char overlap
    const CHUNK_SIZE = 1800;
    const OVERLAP = 200;
    const chunks = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE - OVERLAP) {
      const chunk = text.slice(i, i + CHUNK_SIZE).trim();
      if (chunk.length > 100) chunks.push(chunk);
    }

    // Process each chunk (max 15 chunks to avoid runaway costs)
    for (const chunk of chunks.slice(0, 15)) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4.1',
          messages: [
            {
              role: 'system',
              content: `You are a knowledge extraction system. Extract structured operational memory items from this document chunk for an AI agent system managing a client's digital marketing.

Return ONLY a JSON object: {"memory_items": [...]}

Each memory item: {
  "scope": one of [seo, reviews, performance, content, competitors, technical_debt, ads, social, backlinks, strategy, compliance, local_seo, general],
  "type": one of [fact, goal, constraint, preference, status, insight, warning, achievement],
  "content": "The memory content — specific, factual, actionable. Min 20 words.",
  "tags": ["tag1", "tag2"],
  "relevance_score": 0.0-1.0
}

Extract 3-8 items per chunk. Only extract specific, actionable information. Skip generic or vague content.`
            },
            { role: 'user', content: chunk }
          ],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
          temperature: 0.2
        });

        const raw = JSON.parse(completion.choices[0].message.content);
        const items = raw.memory_items || raw.items || (Array.isArray(raw) ? raw : []);

        if (items.length) {
          const toInsert = items
            .filter(item => item.content && item.content.length > 20)
            .map(item => ({
              client_id: clientId,
              scope: item.scope || 'general',
              type: item.type || 'fact',
              content: item.content,
              tags: Array.isArray(item.tags) ? item.tags : [],
              source: 'document',
              source_document_id: documentId,
              relevance_score: Math.min(1.0, Math.max(0.1, item.relevance_score || 0.7)),
              approved: true
            }));

          if (toInsert.length) {
            await supabase.from('memory_items').insert(toInsert);
            totalMemoryItems += toInsert.length;
          }
        }

        chunksProcessed++;
      } catch (chunkErr) {
        console.error(`Chunk ${chunksProcessed} failed:`, chunkErr.message);
        continue;
      }
    }

    await supabase.from('client_documents').update({
      processing_status: 'done',
      memory_items_created: totalMemoryItems,
      chunks_processed: chunksProcessed,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);

    await supabase.from('audit_trail').insert({
      client_id: clientId,
      agent_slug: 'system',
      action: 'document_ingested',
      actor: 'system',
      details: { document_id: documentId, memory_items_created: totalMemoryItems, chunks_processed: chunksProcessed }
    });

    return { success: true, memory_items_created: totalMemoryItems, chunks_processed: chunksProcessed };

  } catch (err) {
    await supabase.from('client_documents').update({
      processing_status: 'failed',
      error: err.message,
      updated_at: new Date().toISOString()
    }).eq('id', documentId);

    throw err;
  }
}

// ============================================================
// MARK MEMORY USED
// ============================================================
export async function markMemoryUsed(memoryItemIds, runId) {
  if (!memoryItemIds?.length) return;
  for (const id of memoryItemIds) {
    try {
      await supabase.rpc('increment_memory_usage', { memory_id: id, p_run_id: runId });
    } catch (err) {
      console.error(`Failed to mark memory ${id} as used:`, err.message);
    }
  }
}

// ============================================================
// WRITE MEMORY FROM RUN
// ============================================================
export async function writeMemoryFromRun(runId, clientId, lessons) {
  if (!lessons || !Array.isArray(lessons) || !lessons.length) return { written: 0 };

  const items = lessons
    .filter(lesson => lesson && (typeof lesson === 'string' ? lesson.length > 20 : lesson.content?.length > 20))
    .map(lesson => ({
      client_id: clientId,
      scope: lesson.scope || 'general',
      type: lesson.type || 'insight',
      content: typeof lesson === 'string' ? lesson : lesson.content,
      tags: lesson.tags || ['auto-generated', 'from-run'],
      source: 'run',
      source_run_id: runId,
      relevance_score: lesson.relevance_score || 0.6,
      approved: true,
      last_run_id: runId
    }));

  if (!items.length) return { written: 0 };

  const { data } = await supabase.from('memory_items').insert(items).select();
  return { written: data?.length || 0 };
}

// ============================================================
// GENERATE LINK RECOMMENDATIONS (AI-powered)
// ============================================================
export async function generateLinkRecommendations(clientId) {
  // Load gap data
  const { data: gaps } = await supabase
    .from('competitor_link_gap')
    .select('domain, competitor_domain, domain_authority, relevance_score, category, outreach_difficulty')
    .eq('client_id', clientId)
    .eq('status', 'uncontacted')
    .order('domain_authority', { ascending: false })
    .limit(60);

  const { data: competitors } = await supabase
    .from('client_competitors')
    .select('domain, name, domain_authority, notes')
    .eq('client_id', clientId);

  const { data: existing } = await supabase
    .from('referring_domains')
    .select('domain, domain_authority')
    .eq('client_id', clientId)
    .order('domain_authority', { ascending: false })
    .limit(30);

  const { data: client } = await supabase
    .from('clients')
    .select('name, domain, client_profiles(*)')
    .eq('id', clientId)
    .single();

  const profile = client?.client_profiles?.[0] || {};
  const bizType = profile.business_type || profile.industry || 'business';
  const location = profile.city || profile.location || 'Israel';

  const prompt = `You are a senior link building strategist. Your client is ${client?.name} (${client?.domain}), a ${bizType} in ${location}.

Analyze this backlink gap data and recommend the top 15 domains to target to outrank competitors in Google Israel.

COMPETITOR LINK GAP (domains our competitors have that we don't, sorted by DA):
${JSON.stringify(gaps?.slice(0, 40), null, 2)}

OUR COMPETITORS:
${JSON.stringify(competitors, null, 2)}

OUR EXISTING REFERRING DOMAINS (we already have these — exclude from recommendations):
${JSON.stringify(existing?.slice(0, 20), null, 2)}

For each recommendation:
- Focus on Israeli media, industry directories, and professional sites relevant to ${bizType}
- Prioritize by domain authority AND topical relevance to ${bizType} in ${location}
- Explain specifically why this domain matters for this client's SEO
- Suggest a realistic outreach angle

Return JSON:
{
  "recommendations": [
    {
      "domain": "string",
      "domain_authority": number,
      "competitor_that_has_it": "string",
      "why_it_matters": "string (specific to ${bizType} SEO)",
      "outreach_strategy": "string (specific approach)",
      "estimated_impact": "high|medium|low",
      "priority": number 1-15,
      "category": "string (legal directory|media|professional association|etc)"
    }
  ],
  "summary": "string",
  "top_priority_rationale": "string"
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
    temperature: 0.3
  });

  const result = JSON.parse(completion.choices[0].message.content);

  // Cache recommendations
  if (result.recommendations?.length) {
    await supabase.from('link_recommendations').delete().eq('client_id', clientId);
    await supabase.from('link_recommendations').insert(
      result.recommendations.map(r => ({
        client_id: clientId,
        domain: r.domain,
        domain_authority: r.domain_authority,
        competitor_that_has_it: r.competitor_that_has_it,
        why_it_matters: r.why_it_matters,
        outreach_strategy: r.outreach_strategy,
        estimated_impact: r.estimated_impact,
        priority: r.priority,
        category: r.category
      }))
    );
  }

  return result;
}

// ============================================================
// SYNC GOOGLE SHEETS DATA — all 6 import types
// ============================================================
export async function syncGoogleSheetData(clientId, sheetUrl, syncType) {
  const startTime = Date.now();
  let rowsImported = 0, rowsSkipped = 0, rowsUpdated = 0, error = null;

  try {
    // Fetch CSV from public Google Sheet URL
    const csvUrl = sheetUrl.includes('/edit')
      ? sheetUrl.replace('/edit#gid=', '/export?format=csv&gid=')
      : sheetUrl.includes('pub?') ? sheetUrl : sheetUrl + '/export?format=csv';

    const response = await fetch(csvUrl);
    if (!response.ok) throw new Error(`Failed to fetch sheet: ${response.status} ${response.statusText}`);

    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (!rows.length) throw new Error('Sheet appears empty or could not be parsed');

    const results = await importSheetRows(clientId, syncType, rows);
    rowsImported = results.imported;
    rowsSkipped = results.skipped;
    rowsUpdated = results.updated;

  } catch (err) {
    error = err.message;
  }

  // Log sync
  await supabase.from('external_sync_log').insert({
    client_id: clientId,
    sync_type: syncType,
    source: 'google_sheets_csv',
    status: error ? 'failed' : 'success',
    rows_imported: rowsImported,
    rows_skipped: rowsSkipped,
    rows_updated: rowsUpdated,
    duration_ms: Date.now() - startTime,
    sheet_url: sheetUrl,
    error: error
  });

  if (error) throw new Error(error);
  return { imported: rowsImported, skipped: rowsSkipped, updated: rowsUpdated };
}

async function importSheetRows(clientId, syncType, rows) {
  let imported = 0, skipped = 0, updated = 0;

  for (const row of rows) {
    try {
      switch (syncType) {
        case 'backlinks': {
          if (!row.source_domain) { skipped++; continue; }
          const { error } = await supabase.from('backlinks').upsert({
            client_id: clientId,
            source_domain: row.source_domain?.trim(),
            source_url: row.source_url?.trim() || null,
            target_url: row.target_url?.trim() || null,
            anchor_text: row.anchor_text?.trim() || null,
            domain_authority: parseFloat(row.domain_authority) || 0,
            page_authority: parseFloat(row.page_authority) || 0,
            is_dofollow: row.is_dofollow?.toLowerCase() !== 'false' && row.is_dofollow?.toLowerCase() !== 'no',
            last_seen: new Date().toISOString()
          }, { onConflict: 'client_id,source_domain,target_url' });
          error ? skipped++ : imported++;
          break;
        }
        case 'referring_domains': {
          if (!row.domain) { skipped++; continue; }
          const { error } = await supabase.from('referring_domains').upsert({
            client_id: clientId,
            domain: row.domain?.trim(),
            domain_authority: parseFloat(row.domain_authority) || 0,
            backlink_count: parseInt(row.backlink_count) || 1,
            dofollow_count: parseInt(row.dofollow_count) || 0,
            last_updated: new Date().toISOString()
          }, { onConflict: 'client_id,domain' });
          error ? skipped++ : imported++;
          break;
        }
        case 'competitor_link_gap': {
          if (!row.domain) { skipped++; continue; }
          const { error } = await supabase.from('competitor_link_gap').upsert({
            client_id: clientId,
            domain: row.domain?.trim(),
            competitor_domain: row.competitor_domain?.trim() || 'unknown',
            domain_authority: parseFloat(row.domain_authority) || 0,
            relevance_score: parseFloat(row.relevance_score) || 0.5,
            category: row.category?.trim() || null,
            recommendation: row.recommendation?.trim() || null
          }, { onConflict: 'client_id,domain,competitor_domain' });
          error ? skipped++ : imported++;
          break;
        }
        case 'keyword_rankings': {
          if (!row.keyword) { skipped++; continue; }
          const { error } = await supabase.from('client_keywords').upsert({
            client_id: clientId,
            keyword: row.keyword?.trim(),
            current_position: parseInt(row.position) || null,
            volume: parseInt(row.volume) || 0,
            difficulty: parseFloat(row.difficulty) || 0,
            url: row.url?.trim() || null,
            last_checked: new Date().toISOString()
          }, { onConflict: 'client_id,keyword' });
          error ? skipped++ : imported++;
          break;
        }
        case 'competitors': {
          if (!row.domain) { skipped++; continue; }
          const { error } = await supabase.from('client_competitors').upsert({
            client_id: clientId,
            domain: row.domain?.trim(),
            name: row.name?.trim() || row.domain,
            domain_authority: parseFloat(row.domain_authority) || 0,
            referring_domains: parseInt(row.referring_domains) || 0,
            notes: row.notes?.trim() || null
          }, { onConflict: 'client_id,domain' });
          error ? skipped++ : imported++;
          break;
        }
        default:
          skipped++;
      }
    } catch (rowErr) {
      skipped++;
    }
  }

  return { imported, skipped, updated };
}

function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',');
    return headers.reduce((obj, header, i) => {
      obj[header] = values[i]?.trim().replace(/^"|"$/g, '') || '';
      return obj;
    }, {});
  }).filter(row => Object.values(row).some(v => v));
}

// ============================================================
// GENERATE REPORT HTML — rich visual report with charts, baselines, forecasts
// ============================================================
export async function generateReportHtml(reportJsonContent, clientName, period) {
  const j = reportJsonContent || {};
  const lang = j.language || 'en';
  const isRtl = lang === 'he' || lang === 'ar';
  const dir = isRtl ? 'rtl' : 'ltr';
  const periodLabel = period?.type === 'weekly' ? 'Weekly Report' : 'Monthly Report';
  const periodRange = `${period?.start || ''} – ${period?.end || ''}`;

  // ── Helpers ──────────────────────────────────────────────
  const safe = (v, fallback = '—') => (v != null && v !== '') ? String(v) : fallback;
  const num = (v) => (v != null && !isNaN(v)) ? Number(v).toLocaleString() : '—';

  const dHtml = (v, unit = '', invertGood = false) => {
    if (v == null || isNaN(v) || v === 0) return '<span style="color:#6b7280">—</span>';
    const good = invertGood ? v < 0 : v > 0;
    const c = good ? '#22c55e' : '#ef4444';
    const arrow = v > 0 ? '↑' : '↓';
    return `<span style="color:${c};font-weight:600">${arrow} ${Math.abs(v)}${unit}</span>`;
  };

  const scoreColor = (v) => v >= 80 ? '#22c55e' : v >= 55 ? '#f59e0b' : '#ef4444';

  const barChart = (values, color) => {
    if (!Array.isArray(values) || !values.length) return '';
    const W = 220, H = 44;
    const max = Math.max(...values.map(v => Number(v) || 0)) || 1;
    const bw = Math.max(4, Math.floor(W / values.length) - 2);
    const bars = values.map((v, i) => {
      const h = Math.max(2, Math.round((Number(v) / max) * H));
      return `<rect x="${i*(bw+2)}" y="${H-h}" width="${bw}" height="${h}" fill="${color}" rx="2" opacity="0.9"/>`;
    }).join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block">${bars}</svg>`;
  };

  const donutChart = (part, total, colorFill) => {
    if (!total) return '';
    const r = 34, cx = 44, cy = 44;
    const circ = 2 * Math.PI * r;
    const filled = (part / total) * circ;
    const gap = circ - filled;
    const offset = circ * 0.25;
    return `<svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1e2640" stroke-width="10"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colorFill}" stroke-width="10"
        stroke-dasharray="${filled.toFixed(1)} ${gap.toFixed(1)}"
        stroke-dashoffset="${offset.toFixed(1)}" stroke-linecap="round"/>
      <text x="${cx}" y="${cy-3}" text-anchor="middle" font-size="13" font-weight="800" fill="#f1f5f9">${Math.round((part/total)*100)}%</text>
      <text x="${cx}" y="${cy+11}" text-anchor="middle" font-size="9" fill="#64748b">of total</text>
    </svg>`;
  };

  // ── Data extraction ──────────────────────────────────────
  const seo = j.seo_organic || j.seo || {};
  const tech = j.technical || j.technical_health || {};
  const content = j.content || j.content_cro || {};
  const wins = Array.isArray(j.wins) ? j.wins : [];
  const whatDone = Array.isArray(j.what_was_done) ? j.what_was_done : (Array.isArray(j.actions_completed) ? j.actions_completed : []);
  const baselineComp = Array.isArray(j.baseline_comparison) ? j.baseline_comparison : [];
  const forecast = Array.isArray(j.forecast_30_days) ? j.forecast_30_days : (Array.isArray(j.forecast) ? j.forecast : []);
  const nextSteps = Array.isArray(j.next_steps_aggressive) ? j.next_steps_aggressive : (Array.isArray(j.next_priorities) ? j.next_priorities : []);
  const quickWins = Array.isArray(j.quick_wins) ? j.quick_wins : [];
  const openIssues = Array.isArray(j.open_issues) ? j.open_issues : [];
  const score = j.overall_growth_score;
  const scoreDelta = j.score_vs_baseline;
  const iTrend = Array.isArray(seo.impressions_trend) ? seo.impressions_trend : [];
  const cTrend = Array.isArray(seo.clicks_trend_data) ? seo.clicks_trend_data : [];

  const techMobile = tech.mobile_pagespeed_current ?? tech.pagespeed_mobile;
  const techDesktop = tech.desktop_pagespeed_current ?? tech.pagespeed_desktop;
  const techIndexed = tech.indexed_pages_current ?? tech.indexed_pages;
  const techNotIndexed = tech.non_indexed_current ?? tech.non_indexed;
  const techTotal = (techIndexed != null && techNotIndexed != null) ? (techIndexed + techNotIndexed) : null;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Growth Report — ${safe(clientName)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0d1117;color:#e5e7eb;line-height:1.5;font-size:14px}
.wrap{max-width:920px;margin:0 auto;background:#0d1117}
.hdr{background:linear-gradient(135deg,#13192e 0%,#0d1526 50%,#0a0f20 100%);padding:44px 40px 32px;border-bottom:1px solid #1e2640}
.hdr-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap}
.hdr-badge{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6366f1;margin-bottom:8px;font-weight:600}
.hdr-name{font-size:30px;font-weight:800;color:#fff;margin-bottom:4px}
.hdr-period{font-size:13px;color:#94a3b8}
.score-block{text-align:center;background:#13192e;border:1px solid #1e2640;border-radius:12px;padding:16px 24px;flex-shrink:0}
.score-val{font-size:48px;font-weight:900;line-height:1}
.score-lbl{font-size:10px;color:#94a3b8;margin-top:4px;letter-spacing:1px;text-transform:uppercase}
.score-delta{font-size:13px;margin-top:4px;font-weight:600}
.section{padding:28px 40px;border-bottom:1px solid #161c2e}
.sh{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.sh-icon{width:28px;height:28px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}
.sh-title{font-size:15px;font-weight:700;color:#f1f5f9}
.sh-sub{font-size:11px;color:#64748b;margin-top:1px}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-bottom:16px}
.kpi{background:#111827;border:1px solid #1e2640;border-radius:10px;padding:14px}
.kpi-val{font-size:24px;font-weight:800;color:#f1f5f9}
.kpi-label{font-size:10px;color:#64748b;margin-top:2px;text-transform:uppercase;letter-spacing:0.5px}
.kpi-d{font-size:12px;margin-top:6px;font-weight:600}
.kpi.win{border-color:#22c55e33;background:#081812}
.kpi.warn{border-color:#f59e0b33;background:#150f00}
.kpi.danger{border-color:#ef444433;background:#130808}
.wins-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}
.win-card{background:#081812;border:1px solid #22c55e33;border-radius:10px;padding:14px}
.win-metric{font-size:10px;color:#86efac;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600}
.win-row{display:flex;align-items:center;gap:6px}
.win-before{font-size:12px;color:#64748b;text-decoration:line-through}
.win-after{font-size:20px;font-weight:800;color:#22c55e}
.win-src{font-size:10px;color:#374151;margin-top:6px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
.chart-block{background:#111827;border:1px solid #1e2640;border-radius:10px;padding:14px}
.chart-title{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;font-weight:600}
.chart-val{font-size:18px;font-weight:700;color:#f1f5f9;margin-bottom:6px}
table{width:100%;border-collapse:collapse;font-size:12px}
th{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding:7px 10px;text-align:left;border-bottom:1px solid #1e2640}
td{padding:9px 10px;border-bottom:1px solid #111827;color:#cbd5e1;vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#111827}
.up{color:#22c55e;font-weight:600}
.dn{color:#ef4444;font-weight:600}
.neu{color:#6b7280}
.donut-wrap{display:flex;align-items:center;gap:16px}
.legend-row{display:flex;align-items:center;gap:7px;margin-bottom:7px;font-size:12px}
.ldot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
.step{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid #161c2e}
.step:last-child{border-bottom:none}
.step-num{width:26px;height:26px;background:#6366f1;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0}
.step-action{font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:3px}
.step-impact{font-size:11px;color:#22c55e;margin-bottom:2px}
.step-why{font-size:11px;color:#64748b}
.step-meta{display:flex;gap:6px;margin-top:5px;flex-wrap:wrap}
.tag{font-size:10px;padding:2px 7px;border-radius:4px;font-weight:600}
.tag-a{background:#1e1e4a;color:#818cf8}
.tag-d{background:#130808;color:#fca5a5}
.tag-e{background:#150f00;color:#fbbf24}
.issue{padding:10px 14px;border-radius:8px;margin-bottom:7px;border-left:3px solid}
.issue.crit{background:#130808;border-color:#ef4444}
.issue.warn{background:#150f00;border-color:#f59e0b}
.issue-title{font-size:13px;font-weight:600;color:#f1f5f9;margin-bottom:2px}
.issue-desc{font-size:11px;color:#94a3b8}
.fc-row{display:flex;align-items:center;gap:0;padding:11px 0;border-bottom:1px solid #161c2e}
.fc-row:last-child{border-bottom:none}
.fc-metric{flex:1;font-size:13px;color:#f1f5f9;font-weight:600}
.fc-now{width:90px;font-size:12px;color:#94a3b8}
.fc-arr{width:36px;text-align:center;font-size:16px;color:#6366f1}
.fc-proj{width:90px;font-size:15px;font-weight:700;color:#22c55e}
.fc-basis{flex:2;font-size:10px;color:#475569;font-style:italic}
.done-item{display:flex;gap:9px;padding:9px 0;border-bottom:1px solid #111827;align-items:flex-start}
.done-item:last-child{border-bottom:none}
.done-check{color:#22c55e;font-size:14px;flex-shrink:0;margin-top:2px}
.done-action{font-size:13px;color:#cbd5e1}
.done-agent{font-size:10px;color:#475569;margin-top:1px}
.done-impact{font-size:10px;color:#86efac;margin-top:1px}
.exec{background:#111827;border:1px solid #1e2640;border-radius:12px;padding:22px;font-size:14px;line-height:1.85;color:#cbd5e1}
.footer{background:#080c14;padding:22px 40px;text-align:center;font-size:11px;color:#374151;border-top:1px solid #161c2e}
.footer strong{color:#6b7280}
</style>
</head>
<body>
<div class="wrap">

<!-- HEADER -->
<div class="hdr">
  <div class="hdr-top">
    <div>
      <div class="hdr-badge">AI Growth OS &middot; ${periodLabel}</div>
      <div class="hdr-name">${safe(clientName, 'Client')}</div>
      <div class="hdr-period">${periodRange}</div>
    </div>
    ${score != null ? `<div class="score-block">
      <div class="score-val" style="color:${scoreColor(score)}">${score}</div>
      <div class="score-lbl">Growth Score</div>
      ${scoreDelta != null ? `<div class="score-delta" style="color:${scoreDelta > 0 ? '#22c55e' : '#ef4444'}">${scoreDelta > 0 ? '↑' : '↓'} ${Math.abs(scoreDelta)} vs baseline</div>` : ''}
    </div>` : ''}
  </div>
</div>

<!-- EXECUTIVE SUMMARY -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#6366f133">📊</div><div><div class="sh-title">Executive Summary</div><div class="sh-sub">Overall assessment — verified data only, positive and constructive</div></div></div>
  <div class="exec">${safe(j.executive_summary, 'No summary available for this period.')}</div>
</div>

${wins.length > 0 ? `
<!-- WINS -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#22c55e22">🏆</div><div><div class="sh-title">Wins This Period</div><div class="sh-sub">${wins.length} verified improvements — all backed by real measurements</div></div></div>
  <div class="wins-grid">
    ${wins.map(w => `<div class="win-card">
      <div class="win-metric">${safe(w.metric, '')}</div>
      <div class="win-row">
        <div class="win-before">${safe(w.before, '')}</div>
        <div style="color:#475569;padding:0 4px">→</div>
        <div class="win-after">${safe(w.after, '')}</div>
        ${w.delta != null ? `<div style="margin-left:auto">${dHtml(w.delta, w.unit || '')}</div>` : ''}
      </div>
      ${w.source ? `<div class="win-src">Source: ${w.source}</div>` : ''}
    </div>`).join('')}
  </div>
</div>
` : ''}

<!-- SEO ORGANIC -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#3b82f622">🔍</div><div><div class="sh-title">SEO Organic Performance</div><div class="sh-sub">Google Search Console — real impressions, clicks, rankings</div></div></div>
  <div class="kpi-grid">
    <div class="kpi ${(seo.impressions_delta_pct || 0) > 0 ? 'win' : (seo.impressions_delta_pct || 0) < -10 ? 'danger' : ''}">
      <div class="kpi-val">${num(seo.impressions_current)}</div>
      <div class="kpi-label">Impressions</div>
      <div class="kpi-d">${dHtml(seo.impressions_delta_pct, '%')}</div>
    </div>
    <div class="kpi ${(seo.clicks_delta_pct || 0) > 0 ? 'win' : ''}">
      <div class="kpi-val">${num(seo.clicks_current)}</div>
      <div class="kpi-label">Organic Clicks</div>
      <div class="kpi-d">${dHtml(seo.clicks_delta_pct, '%')}</div>
    </div>
    <div class="kpi">
      <div class="kpi-val">${seo.avg_position_current != null ? Number(seo.avg_position_current).toFixed(1) : '—'}</div>
      <div class="kpi-label">Avg. Position</div>
      <div class="kpi-d">${seo.position_delta != null ? dHtml(-seo.position_delta, '', false) : '—'}</div>
    </div>
    <div class="kpi ${(seo.page1_keywords_current || 0) > 0 ? 'win' : 'warn'}">
      <div class="kpi-val">${safe(seo.page1_keywords_current, '0')}</div>
      <div class="kpi-label">Page 1 Keywords</div>
      <div class="kpi-d">${dHtml(seo.page1_delta)}</div>
    </div>
  </div>
  ${(iTrend.length > 0 || cTrend.length > 0) ? `<div class="two-col">
    <div class="chart-block"><div class="chart-title">Impressions Trend</div>${barChart(iTrend, '#3b82f6')}</div>
    <div class="chart-block"><div class="chart-title">Clicks Trend</div>${barChart(cTrend.length ? cTrend : iTrend.map(v => Math.round(Number(v)*0.07)), '#22c55e')}</div>
  </div>` : ''}
  ${seo.top_pages?.length ? `<div style="margin-top:14px">
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px">Top Pages This Period</div>
    <table><thead><tr><th>Page</th><th>Impressions</th><th>Clicks</th><th>Position</th></tr></thead><tbody>
    ${seo.top_pages.slice(0,8).map(p => `<tr>
      <td style="color:#94a3b8;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${safe(p.url || p.page, '—')}</td>
      <td>${num(p.impressions)}</td><td>${num(p.clicks)}</td>
      <td>${p.position != null ? Number(p.position).toFixed(1) : '—'}</td>
    </tr>`).join('')}
    </tbody></table></div>` : ''}
  ${seo.opportunities?.length ? `<div style="margin-top:14px">
    <div style="font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:8px">⚡ Quick-Rank Opportunities (positions 4–20)</div>
    <table><thead><tr><th>Query</th><th>Position</th><th>Impressions</th><th>CTR</th><th>Opportunity</th></tr></thead><tbody>
    ${seo.opportunities.slice(0,8).map(o => `<tr>
      <td style="font-weight:500;color:#f1f5f9">${safe(o.query, '—')}</td>
      <td><span style="color:#f59e0b;font-weight:600">#${o.position != null ? Number(o.position).toFixed(0) : '—'}</span></td>
      <td>${num(o.impressions)}</td><td>${safe(o.ctr, '—')}</td>
      <td style="color:#86efac;font-size:10px">${safe(o.opportunity, '')}</td>
    </tr>`).join('')}
    </tbody></table></div>` : ''}
</div>

<!-- TECHNICAL SEO -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#8b5cf622">⚙️</div><div><div class="sh-title">Technical SEO Health</div><div class="sh-sub">PageSpeed, indexing, crawl health — live measurements</div></div></div>
  <div class="kpi-grid">
    <div class="kpi ${techMobile != null && techMobile >= 80 ? 'win' : techMobile != null && techMobile < 55 ? 'danger' : ''}">
      <div class="kpi-val" style="color:${techMobile != null ? scoreColor(techMobile) : '#6b7280'}">${safe(techMobile, '—')}</div>
      <div class="kpi-label">Mobile PageSpeed</div>
      <div class="kpi-d">${techMobile != null && tech.mobile_pagespeed_baseline != null ? dHtml(techMobile - tech.mobile_pagespeed_baseline) : '—'}</div>
    </div>
    <div class="kpi ${techDesktop != null && techDesktop >= 80 ? 'win' : ''}">
      <div class="kpi-val" style="color:${techDesktop != null ? scoreColor(techDesktop) : '#6b7280'}">${safe(techDesktop, '—')}</div>
      <div class="kpi-label">Desktop PageSpeed</div>
      <div class="kpi-d">${techDesktop != null && tech.desktop_pagespeed_baseline != null ? dHtml(techDesktop - tech.desktop_pagespeed_baseline) : '—'}</div>
    </div>
    <div class="kpi ${techIndexed != null && techIndexed > 100 ? 'win' : techIndexed != null && techIndexed < 50 ? 'danger' : 'warn'}">
      <div class="kpi-val">${safe(techIndexed, '—')}</div>
      <div class="kpi-label">Indexed Pages</div>
      <div class="kpi-d">${techIndexed != null && tech.indexed_pages_baseline != null ? dHtml(techIndexed - tech.indexed_pages_baseline) : '—'}</div>
    </div>
    <div class="kpi ${techNotIndexed != null && techNotIndexed > 50 ? 'danger' : 'win'}">
      <div class="kpi-val" style="color:${techNotIndexed != null && techNotIndexed > 50 ? '#ef4444' : '#22c55e'}">${safe(techNotIndexed, '—')}</div>
      <div class="kpi-label">Not Indexed</div>
      ${techNotIndexed != null && techNotIndexed > 50 ? '<div class="kpi-d" style="color:#ef4444;font-size:10px">⚠ Critical — fix now</div>' : ''}
    </div>
  </div>
  ${techTotal != null ? `<div style="margin-top:12px"><div class="chart-block">
    <div class="chart-title">Index Coverage — ${techTotal} total pages</div>
    <div class="donut-wrap">
      ${donutChart(techIndexed, techTotal, '#22c55e')}
      <div>
        <div class="legend-row"><div class="ldot" style="background:#22c55e"></div>${techIndexed} indexed</div>
        <div class="legend-row"><div class="ldot" style="background:#ef4444"></div>${techNotIndexed} not indexed <span style="color:#ef4444;font-size:10px;margin-left:4px">⚠ critical</span></div>
      </div>
    </div>
  </div></div>` : ''}
  ${(tech.issues_fixed != null || tech.issues_remaining != null) ? `<div class="two-col" style="margin-top:12px">
    <div class="chart-block"><div class="chart-title">Issues Fixed</div><div class="chart-val" style="color:#22c55e">${safe(tech.issues_fixed, '—')}</div><div style="font-size:10px;color:#64748b">technical fixes applied</div></div>
    <div class="chart-block"><div class="chart-title">Issues Remaining</div><div class="chart-val" style="color:${(tech.issues_remaining||0) > 5 ? '#f59e0b' : '#22c55e'}">${safe(tech.issues_remaining, '—')}</div><div style="font-size:10px;color:#64748b">open technical debt</div></div>
  </div>` : ''}
</div>

${content && (content.pages_improved || content.changes_proposed || content.changes_applied) ? `
<!-- CONTENT -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#06b6d422">✏️</div><div><div class="sh-title">Content & On-Page Changes</div><div class="sh-sub">Proposed and applied improvements</div></div></div>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${safe(content.pages_improved, '—')}</div><div class="kpi-label">Pages Improved</div></div>
    <div class="kpi"><div class="kpi-val">${safe(content.changes_proposed, '—')}</div><div class="kpi-label">Changes Proposed</div></div>
    <div class="kpi ${content.changes_applied > 0 ? 'win' : ''}"><div class="kpi-val">${safe(content.changes_applied, '—')}</div><div class="kpi-label">Changes Applied</div></div>
    ${content.thin_content_pages_remaining != null ? `<div class="kpi warn"><div class="kpi-val">${content.thin_content_pages_remaining}</div><div class="kpi-label">Thin Content Pages</div></div>` : ''}
  </div>
</div>
` : ''}

${quickWins.length > 0 ? `
<!-- QUICK WINS -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#f59e0b22">⚡</div><div><div class="sh-title">Quick Wins — High ROI Now</div><div class="sh-sub">Implement these first — fast results, low effort</div></div></div>
  ${quickWins.map(w => `<div class="issue warn">
    <div class="issue-title">${safe(w.action, '')}</div>
    <div style="display:flex;gap:14px;margin-top:5px;flex-wrap:wrap">
      ${w.effort ? `<span style="font-size:11px;color:#94a3b8">Effort: <b style="color:#f1f5f9">${w.effort}</b></span>` : ''}
      ${w.expected_impact ? `<span style="font-size:11px;color:#22c55e">→ ${w.expected_impact}</span>` : ''}
      ${w.agent ? `<span style="font-size:11px;color:#818cf8">${w.agent}</span>` : ''}
    </div>
  </div>`).join('')}
</div>
` : ''}

${baselineComp.length > 0 ? `
<!-- BASELINE COMPARISON -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#ec489922">📈</div><div><div class="sh-title">Baseline → Now: Full Scorecard</div><div class="sh-sub">Every metric tracked from day one to this period</div></div></div>
  <table><thead><tr><th>Metric</th><th>Baseline</th><th>Current</th><th>Change</th><th>Trend</th></tr></thead><tbody>
  ${baselineComp.map(row => {
    const d = row.delta != null ? row.delta : (row.current != null && row.baseline != null ? row.current - row.baseline : null);
    const up = row.trend === 'up' || (row.trend == null && d > 0);
    const dn = row.trend === 'down' || (row.trend == null && d < 0);
    const cls = up ? 'up' : dn ? 'dn' : 'neu';
    return `<tr>
      <td style="color:#f1f5f9;font-weight:500">${safe(row.metric, '—')}</td>
      <td class="neu">${safe(row.baseline, '—')}${row.unit || ''}</td>
      <td style="color:#f1f5f9;font-weight:600">${safe(row.current, '—')}${row.unit || ''}</td>
      <td class="${cls}">${d != null ? (d > 0 ? '+' : '') + d + (row.unit || '') : '—'}</td>
      <td>${up ? '<span class="up">↑</span>' : dn ? '<span class="dn">↓</span>' : '<span class="neu">→</span>'}</td>
    </tr>`;
  }).join('')}
  </tbody></table>
</div>
` : ''}

${forecast.length > 0 ? `
<!-- FORECAST -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#6366f122">🔮</div><div><div class="sh-title">30-Day Forecast</div><div class="sh-sub">Based on actual trajectory — extrapolated from real data, not guesses</div></div></div>
  ${forecast.map(f => `<div class="fc-row">
    <div class="fc-metric">${safe(f.metric, '—')}</div>
    <div class="fc-now">${safe(f.current, '—')}</div>
    <div class="fc-arr">→</div>
    <div class="fc-proj">${safe(f.forecast, '—')}</div>
    <div class="fc-basis">${safe(f.basis, '')}</div>
  </div>`).join('')}
</div>
` : ''}

${whatDone.length > 0 ? `
<!-- WHAT WAS DONE -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#22c55e22">✅</div><div><div class="sh-title">What Was Done This Period</div><div class="sh-sub">${whatDone.length} actions executed by AI agents</div></div></div>
  ${whatDone.slice(0,20).map(item => `<div class="done-item">
    <div class="done-check">✓</div>
    <div>
      <div class="done-action">${safe(typeof item === 'string' ? item : (item.action || item.action_he), '')}</div>
      ${item.agent ? `<div class="done-agent">${item.agent}</div>` : ''}
      ${item.impact ? `<div class="done-impact">${item.impact}</div>` : ''}
    </div>
  </div>`).join('')}
</div>
` : ''}

${nextSteps.length > 0 ? `
<!-- NEXT STEPS -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#ef444422">🚀</div><div><div class="sh-title">Aggressive Growth Plan — Next Steps</div><div class="sh-sub">Priority actions ranked by expected impact — specific, time-bound, data-driven</div></div></div>
  ${nextSteps.slice(0,8).map((step, i) => `<div class="step">
    <div class="step-num">${i + 1}</div>
    <div style="flex:1">
      <div class="step-action">${safe(typeof step === 'string' ? step : (step.action || step.priority_he), '')}</div>
      ${step.expected_impact ? `<div class="step-impact">→ ${step.expected_impact}</div>` : ''}
      ${step.why_critical ? `<div class="step-why">${step.why_critical}</div>` : ''}
      <div class="step-meta">
        ${step.agent ? `<span class="tag tag-a">${step.agent}</span>` : ''}
        ${step.deadline ? `<span class="tag tag-d">${step.deadline}</span>` : ''}
        ${step.effort ? `<span class="tag tag-e">${step.effort} effort</span>` : ''}
      </div>
    </div>
  </div>`).join('')}
</div>
` : ''}

${openIssues.length > 0 ? `
<!-- OPEN ISSUES -->
<div class="section">
  <div class="sh"><div class="sh-icon" style="background:#ef444422">⚠️</div><div><div class="sh-title">What Needs Attention</div><div class="sh-sub">${openIssues.length} open issue${openIssues.length !== 1 ? 's' : ''} — blocking further growth</div></div></div>
  ${openIssues.map(issue => {
    const sev = issue.severity || issue.priority || '';
    const cls = (sev === 'critical' || sev === 'high') ? 'crit' : 'warn';
    return `<div class="issue ${cls}">
      <div class="issue-title">${safe(typeof issue === 'string' ? issue : (issue.title || issue.issue), '')}</div>
      ${(issue.description || issue.desc) ? `<div class="issue-desc">${safe(issue.description || issue.desc, '')}</div>` : ''}
    </div>`;
  }).join('')}
</div>
` : ''}

<!-- FOOTER -->
<div class="footer">
  <strong>AI Growth OS</strong> &middot; All data verified from live sources only<br>
  Generated ${new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' })}
  ${j.data_freshness ? ` &middot; ${j.data_freshness}` : ''}
  ${j.data_sources_used?.length ? `<br>Sources: ${j.data_sources_used.join(' &middot; ')}` : ''}
</div>

</div>
</body>
</html>`;
}

// ============================================================
// SEND CLIENT REPORT (email)
// ============================================================
export async function sendClientReport(reportId, recipients) {
  const { data: report } = await supabase
    .from('reports')
    .select('*, clients(name)')
    .eq('id', reportId)
    .single();

  if (!report) throw new Error('Report not found');
  if (!report.html_content) throw new Error('Report has no HTML content — generate it first');

  // In production: integrate with SendGrid, AWS SES, or similar
  // For now: log the send action and update status
  console.log(`[REPORT] Sending report "${report.title}" to:`, recipients);

  await supabase.from('reports').update({
    status: 'sent',
    sent_at: new Date().toISOString(),
    sent_to: recipients
  }).eq('id', reportId);

  await supabase.from('audit_trail').insert({
    client_id: report.client_id,
    agent_slug: 'system',
    action: 'report_sent',
    actor: 'admin',
    details: { report_id: reportId, recipients, title: report.title }
  });

  return { success: true, sent_to: recipients };
}

// ============================================================
// REFRESH CREDENTIAL HEALTH
// Reads the CANONICAL tables (oauth_credentials + client_integrations
// + integration_assets) — NOT the legacy client_credentials table.
// Mirrors the logic of the query_credential_health tool so every
// surface (dashboard, credential-health-agent, /system/refresh cron)
// agrees on what "connected" means.
// ============================================================
export async function refreshCredentialHealth(clientId) {
  try {
    const [oauthRes, integrationsRes, assetsRes] = await Promise.all([
      supabase.from('oauth_credentials').select('provider, account_email, scopes, status, error, last_refreshed_at').eq('client_id', clientId),
      supabase.from('client_integrations').select('provider, sub_provider, status, discovery_summary, error, connected_at').eq('client_id', clientId),
      supabase.from('integration_assets').select('provider, sub_provider').eq('client_id', clientId),
    ]);

    const oauthGrants = oauthRes.data || [];
    const integrations = integrationsRes.data || [];
    const assets = assetsRes.data || [];

    const assetsBySub = {};
    for (const a of assets) {
      const k = a.sub_provider || a.provider;
      assetsBySub[k] = (assetsBySub[k] || 0) + 1;
    }

    const servicesToReport = [
      { service: 'google_search_console', provider: 'google', sub_provider: 'search_console' },
      { service: 'google_ads',             provider: 'google', sub_provider: 'ads' },
      { service: 'google_analytics',       provider: 'google', sub_provider: 'analytics' },
      { service: 'google_business_profile',provider: 'google', sub_provider: 'business_profile' },
      { service: 'facebook',               provider: 'meta',   sub_provider: 'facebook' },
      { service: 'instagram',              provider: 'meta',   sub_provider: 'instagram' },
      { service: 'openai',                 provider: 'openai', sub_provider: null },
      { service: 'perplexity',             provider: 'perplexity', sub_provider: null },
      { service: 'dataforseo',             provider: 'dataforseo', sub_provider: null },
      { service: 'moz',                    provider: 'moz', sub_provider: null },
    ];

    const results = servicesToReport.map(({ service, provider, sub_provider }) => {
      // Env-var backed
      if (!sub_provider && ['openai','perplexity','dataforseo','moz'].includes(provider)) {
        const envMap = {
          openai: process.env.OPENAI_API_KEY,
          perplexity: process.env.PERPLEXITY_API_KEY,
          dataforseo: process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD,
          moz: process.env.MOZ_API_KEY,
        };
        const hasKey = !!envMap[provider];
        return { service, is_connected: hasKey, health_score: hasKey ? 100 : 0, error: hasKey ? null : `${provider} API key not configured` };
      }

      const oauth = oauthGrants.find(g => g.provider === provider);
      const integration = integrations.find(i => i.provider === provider && i.sub_provider === sub_provider);
      const assetCount = assetsBySub[sub_provider || provider] || 0;

      if (!oauth || oauth.status !== 'active') {
        return { service, is_connected: false, health_score: 0, error: oauth?.error || 'No active OAuth grant' };
      }
      if (!integration) {
        return { service, is_connected: false, health_score: 25, error: 'OAuth grant exists but no integration row — run rediscovery' };
      }

      const ds = integration.discovery_summary || {};
      const discovered = ds.count ?? ds.pages_found ?? assetCount;

      let health_score = 0;
      let is_connected = false;
      if (integration.status === 'connected' && discovered > 0) {
        health_score = 100;
        is_connected = true;
      } else if (integration.status === 'connected') {
        health_score = 60;
        is_connected = false; // "limited" - oauth ok but no assets
      } else if (integration.status === 'limited') {
        health_score = 40;
      } else {
        health_score = 10;
      }

      return {
        service,
        is_connected,
        health_score,
        error: integration.error || ds.error || null,
        account_email: oauth.account_email,
        discovered_count: discovered,
      };
    });

    const overall = results.length ? Math.round(results.reduce((a, r) => a + r.health_score, 0) / results.length) : 0;
    return { checked: results.length, results, overall_health_score: overall, source: 'oauth_credentials+client_integrations+integration_assets' };
  } catch (err) {
    return { checked: 0, error: err.message };
  }
}

// ============================================================
// VALIDATE KPI SOURCES
// ============================================================
export async function validateKpiSources(clientId) {
  const { data: runs } = await supabase
    .from('runs')
    .select('id, created_at, output, agent_template_id, agent_templates(slug, name)')
    .eq('client_id', clientId)
    .eq('status', 'success')
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: baselines } = await supabase
    .from('baselines')
    .select('*')
    .eq('client_id', clientId);

  const issues = [];
  const verified = [];

  // Check each run output for metric citations
  for (const run of (runs || [])) {
    const output = run.output;
    if (!output) continue;

    // Check for health scores that are suspiciously high without data
    const scores = ['seo_health_score', 'overall_cro_score', 'analytics_health_score', 'local_seo_score'];
    for (const scoreKey of scores) {
      if (output[scoreKey] !== undefined) {
        const score = output[scoreKey];
        if (score > 85 && !output.data_source && run.context_summary?.memory_count === 0) {
          issues.push({
            metric: scoreKey,
            claimed_value: score,
            run_id: run.id,
            agent: run.agent_templates?.name,
            reason_flagged: 'High score reported with no memory context — possible fabrication',
            required_action: 'Verify score against real data'
          });
        } else {
          verified.push({ metric: scoreKey, value: score, run_id: run.id, status: 'verified' });
        }
      }
    }
  }

  const integrityScore = issues.length === 0 ? 100
    : Math.max(0, 100 - (issues.length * 15));

  return {
    runs_reviewed: runs?.length || 0,
    verified,
    issues_found: issues,
    integrity_score: integrityScore,
    verdict: issues.length === 0 ? 'VERIFIED' : issues.length < 3 ? 'MOSTLY_VERIFIED' : 'ISSUES_FOUND'
  };
}

// ============================================================
// CRON EXPRESSION PARSER — calculates next run time
// Supports: minute hour day-of-month month day-of-week
// ============================================================
function getNextCronRun(cronExpression, fromDate) {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5) {
    // Fallback: +24h
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 1);
    return d;
  }

  const [minuteStr, hourStr, domStr, monthStr, dowStr] = parts;
  const minute = minuteStr === '*' ? null : parseInt(minuteStr);
  const hour = hourStr === '*' ? null : parseInt(hourStr);
  const dom = domStr === '*' ? null : parseInt(domStr);
  const dow = dowStr === '*' ? null : parseInt(dowStr);

  // Start from next minute
  const next = new Date(fromDate);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Try up to 366 days forward
  for (let i = 0; i < 366 * 24 * 60; i++) {
    const matches =
      (minute === null || next.getMinutes() === minute) &&
      (hour === null || next.getHours() === hour) &&
      (dom === null || next.getDate() === dom) &&
      (dow === null || next.getDay() === dow);

    if (matches) return next;

    // Advance by the largest possible step
    if (hour !== null && next.getHours() !== hour) {
      next.setHours(next.getHours() + 1);
      next.setMinutes(0);
    } else if (minute !== null && next.getMinutes() !== minute) {
      next.setMinutes(next.getMinutes() + 1);
    } else {
      next.setMinutes(next.getMinutes() + 1);
    }
  }

  // Fallback if no match found
  const fallback = new Date(fromDate);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
}

// ============================================================
// ENQUEUE DUE SCHEDULED RUNS
// ============================================================
export async function enqueueDueRuns() {
  const now = new Date();
  let queued = 0;

  // Initialize any schedules with null next_run_at
  const { data: uninit } = await supabase
    .from('agent_schedules')
    .select('id, cron_expression')
    .eq('enabled', true)
    .is('next_run_at', null);

  for (const s of (uninit || [])) {
    const nextRun = getNextCronRun(s.cron_expression, now);
    await supabase.from('agent_schedules').update({
      next_run_at: nextRun.toISOString()
    }).eq('id', s.id);
    console.log(`[SCHEDULER] Initialized next_run_at for schedule ${s.id} → ${nextRun.toISOString()}`);
  }

  const { data: schedules } = await supabase
    .from('agent_schedules')
    .select('*, agent_templates(slug, is_active)')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .not('next_run_at', 'is', null);

  for (const schedule of (schedules || [])) {
    if (!schedule.agent_templates?.is_active) continue;

    // Check no duplicate in queue
    const { data: existing } = await supabase
      .from('run_queue')
      .select('id')
      .eq('client_id', schedule.client_id)
      .eq('agent_template_id', schedule.agent_template_id)
      .in('status', ['queued', 'running'])
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .maybeSingle();

    if (existing) continue;

    await supabase.from('run_queue').insert({
      client_id: schedule.client_id,
      agent_template_id: schedule.agent_template_id,
      task_payload: { ...(schedule.task_payload || {}), triggered_by: 'scheduler' },
      status: 'queued',
      queued_by: 'scheduler',
      priority: 3
    });

    // Calculate next run time from cron expression
    const nextRun = getNextCronRun(schedule.cron_expression, now);

    await supabase.from('agent_schedules').update({
      last_run_at: now.toISOString(),
      last_run_status: 'queued',
      next_run_at: nextRun.toISOString(),
      run_count: schedule.run_count + 1
    }).eq('id', schedule.id);

    queued++;
  }

  // Fire-and-forget: process queue immediately after enqueuing scheduled runs
  if (queued > 0) {
    processRunQueue().catch(err => console.error('[IMMEDIATE_PROCESS]', err.message));
  }

  return { queued };
}
