// ============================================================
// GT3 Phase 4 — GT3 Task Executor
//
// Agents (LLMs) now EXECUTE tasks from gt3_action_tasks +
// gt3_channel_tasks instead of inventing generic advice.
// Each task has:
//   - keyword_id (real target)
//   - task_type (concrete action)
//   - title_he + description_he (what to do)
//   - assigned_agent (who should do it)
//
// When an agent runs, it is given a SPECIFIC task from GT3,
// not open-ended instructions. The agent's output is a
// concrete artifact (page draft, ad copy, social post, etc.)
// that cites keyword_id + mission + source.
//
// This file provides:
//   - pullNextTaskForAgent(agentSlug, clientId) → next open task
//   - executeGT3Task(taskId, agentSlug, options) → runs the task
//   - recordTaskOutcome(taskId, outcome) → writes artifacts
// ============================================================

import { getGT3Supabase, svcResult } from './supabaseClient.js';

// Pull the highest-priority open task assigned to this agent_slug.
// Optional clientId filter for multi-tenant execution.
export async function pullNextTaskForAgent(agentSlug, customerId = null, { channelOnly = false, actionOnly = false } = {}) {
  const sb = getGT3Supabase();

  // Priority: mission_critical > high_priority > strategic_support > low_priority
  const priorityOrder = ['mission_critical', 'high_priority', 'strategic_support', 'low_priority'];

  const tables = [];
  if (!channelOnly) tables.push({ table: 'gt3_action_tasks', kind: 'action' });
  if (!actionOnly) tables.push({ table: 'gt3_channel_tasks', kind: 'channel' });

  for (const p of priorityOrder) {
    for (const { table, kind } of tables) {
      let q = sb.from(table)
        .select(`*, gt3_keyword_universe:keyword_id (keyword, normalized_keyword, language, intent_type, keyword_cluster)`)
        .eq('assigned_agent', agentSlug)
        .eq('priority_label', p)
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(1);
      if (customerId) q = q.eq('customer_id', customerId);
      const { data } = await q;
      if (data && data.length > 0) {
        return { task: data[0], kind };
      }
    }
  }
  return null;
}

// Build a GROUNDED LLM context for a given task — never open-ended.
// The agent sees: the task, the target keyword, the customer business,
// the current ranking, the match against existing pages, the mission.
export async function buildTaskContext(task, kind) {
  const sb = getGT3Supabase();
  const customerId = task.customer_id;
  const keywordId = task.keyword_id;

  const [customerRes, servicesRes, locationsRes, conversionsRes, scoreRes, matchRes, strategyRes, rankingRes] = await Promise.all([
    sb.from('gt3_customers').select('*').eq('id', customerId).single(),
    sb.from('gt3_customer_services').select('*').eq('customer_id', customerId),
    sb.from('gt3_customer_locations').select('*').eq('customer_id', customerId),
    sb.from('gt3_customer_conversions').select('*').eq('customer_id', customerId),
    keywordId ? sb.from('gt3_keyword_scores').select('*').eq('keyword_id', keywordId).single() : { data: null },
    keywordId ? sb.from('gt3_keyword_page_matches').select('*, gt3_site_pages:page_id (*)').eq('keyword_id', keywordId).limit(1) : { data: [] },
    keywordId ? sb.from('gt3_keyword_channel_strategy').select('*').eq('keyword_id', keywordId).single() : { data: null },
    keywordId ? sb.from('gt3_keyword_rankings').select('*').eq('keyword_id', keywordId).order('checked_at', { ascending: false }).limit(1) : { data: [] },
  ]);

  const customer = customerRes.data;
  const score = scoreRes?.data;
  const match = matchRes?.data?.[0];
  const strategy = strategyRes?.data;
  const ranking = rankingRes?.data?.[0];
  const keyword = task.gt3_keyword_universe;

  return {
    task: {
      id: task.id,
      kind,
      task_type: task.task_type,
      title_he: task.title_he,
      description_he: task.description_he,
      priority_label: task.priority_label,
      estimated_impact_score: task.estimated_impact_score,
      target_metric: task.target_metric,
    },
    customer: {
      id: customer.id,
      name: customer.name,
      domain: customer.domain,
      business_type: customer.business_type,
      business_model: customer.business_model,
      is_local_business: customer.is_local_business,
      primary_language: customer.primary_language,
      lifecycle_stage: customer.lifecycle_stage,
    },
    services: servicesRes.data,
    locations: locationsRes.data,
    conversions: conversionsRes.data,
    keyword,
    keyword_score: score ? {
      strategic_priority_score: score.strategic_priority_score,
      output_label: score.output_label,
      recommended_action: score.recommended_action,
      target_page_type: score.target_page_type,
      explanation_he: score.explanation_he,
      intent_type: keyword?.intent_type,
      sub_scores: {
        relevance: score.relevance_score,
        business_value: score.business_value_score,
        conversion_intent: score.conversion_intent_score,
        local_intent: score.local_intent_score,
        demand: score.demand_score,
        win_probability: score.win_probability_score,
        authority_support: score.authority_support_score,
        gap_urgency: score.gap_urgency_score,
      },
    } : null,
    page_match: match ? {
      match_type: match.match_type,
      match_score: match.match_score,
      page: match.gt3_site_pages,
    } : null,
    channel_strategy: strategy,
    current_ranking: ranking ? {
      current_position: ranking.current_position,
      previous_position: ranking.previous_position,
      checked_at: ranking.checked_at,
      ranking_type: ranking.ranking_type,
    } : null,
    // Instructions to the LLM: what output is expected
    execution_contract: executionContractFor(task.task_type, kind),
  };
}

// Every task type has a specific expected output shape.
// This is enforced so agents can't produce vague advice.
function executionContractFor(taskType, kind) {
  const contracts = {
    // SEO action tasks
    create_page: {
      expected_output: 'A concrete page draft: title_he, h1_he, meta_description_he, outline (h2s array), primary CTA, FAQ block (3-5 q&a). Every piece must be written in the client primary language.',
      required_fields: ['title_he', 'h1_he', 'meta_description_he', 'outline', 'primary_cta', 'faq'],
      cite_sources: true,
    },
    improve_page: {
      expected_output: 'Diff-style recommendations for an existing page: new title, new H1, new meta, added H2 sections, added FAQ, added internal links, new CTA. Each change must cite the issue it resolves.',
      required_fields: ['current_title', 'new_title', 'current_h1', 'new_h1', 'new_meta_description', 'h2_additions', 'faq_additions', 'internal_link_suggestions', 'cta_changes'],
      cite_sources: true,
    },
    improve_ctr: {
      expected_output: '2-3 alternative title/meta pairs with CTR-focused copy (questions, numbers, benefit hooks, year).',
      required_fields: ['variants'], // array of {title_he, meta_description_he, rationale_he}
      cite_sources: true,
    },
    add_internal_links: {
      expected_output: 'A list of 3-5 source pages from the customer site that should link to the target page, with anchor text suggestions.',
      required_fields: ['link_suggestions'], // array of {source_page_url, target_page_url, anchor_text_he, context_he}
      cite_sources: true,
    },
    add_faq: {
      expected_output: '5-7 FAQ pairs in Hebrew, formatted for FAQ schema.',
      required_fields: ['faqs'], // array of {question_he, answer_he}
      cite_sources: true,
    },
    strengthen_local_seo: {
      expected_output: 'GBP action list: categories to add, services to add, photo requests, review acquisition plan, local citation suggestions.',
      required_fields: ['gbp_categories', 'gbp_services', 'photo_plan', 'review_plan', 'citations'],
      cite_sources: true,
    },
    improve_conversion: {
      expected_output: 'Page-level conversion improvements: CTA changes, trust blocks, review placements, form simplifications.',
      required_fields: ['cta_changes', 'trust_blocks_to_add', 'form_changes'],
      cite_sources: true,
    },
    build_cluster: {
      expected_output: '3-5 supporting article ideas with H1, outline, target keyword each.',
      required_fields: ['articles'], // array of {target_keyword, h1_he, outline, internal_link_back_to}
      cite_sources: true,
    },
    defend_ranking: {
      expected_output: 'Defense plan: monitor metrics, content refresh triggers, competitor signals to watch, CTR improvements.',
      required_fields: ['monitor_metrics', 'refresh_triggers', 'competitor_signals', 'ctr_improvements'],
      cite_sources: true,
    },
    acquire_links: {
      expected_output: 'List of 5-10 authoritative domains relevant to the keyword cluster, with a realistic outreach pitch.',
      required_fields: ['targets'], // array of {domain, rationale_he, pitch_he}
      cite_sources: true,
    },
    review_gbp: {
      expected_output: 'Audit of current GBP state: missing fields, category optimization, service updates, photo gaps.',
      required_fields: ['missing_fields', 'category_recommendations', 'service_updates', 'photo_gaps'],
      cite_sources: true,
    },

    // Channel tasks
    create_search_ads: {
      expected_output: 'Google Ads search campaign spec: campaign_name, match_types, keywords[], ad_groups[], 3 headlines, 2 descriptions, landing_page_url.',
      required_fields: ['campaign_name', 'keywords', 'headlines', 'descriptions', 'landing_page_url'],
      cite_sources: true,
    },
    test_ad_copy: {
      expected_output: '2-3 ad copy variants to A/B test, each with clear hypothesis.',
      required_fields: ['variants'], // array of {headline, description, hypothesis_he}
      cite_sources: true,
    },
    create_remarketing_audience: {
      expected_output: 'Remarketing audience definition: audience_name, source_pages, recency_days, message angle.',
      required_fields: ['audience_name', 'source_pages', 'recency_days', 'creative_angle_he'],
      cite_sources: true,
    },
    publish_social_post: {
      expected_output: 'Social post draft: platform-specific caption, visual concept, hashtags, CTA.',
      required_fields: ['platform', 'caption_he', 'visual_concept_he', 'hashtags', 'cta_he'],
      cite_sources: true,
    },
    distribute_authority_content: {
      expected_output: 'Content distribution plan: 3-5 channels where this content should be promoted, format per channel, expected reach.',
      required_fields: ['channels', 'format_per_channel', 'kpi'],
      cite_sources: true,
    },
    update_gbp_services: {
      expected_output: 'Specific GBP fields to update (categories, services, hours, description), with exact new values.',
      required_fields: ['updates'], // array of {field, current_value, new_value, rationale_he}
      cite_sources: true,
    },
    request_reviews: {
      expected_output: 'Review acquisition plan: target reviewers, Hebrew request template, timing, follow-up.',
      required_fields: ['target_list', 'request_template_he', 'timing', 'follow_up_plan'],
      cite_sources: true,
    },
    improve_landing_page: {
      expected_output: 'Landing page CRO recommendations: hero change, form simplification, trust additions, copy revisions.',
      required_fields: ['hero_changes', 'form_changes', 'trust_additions', 'copy_revisions'],
      cite_sources: true,
    },
    test_headline_variants: {
      expected_output: 'Headline A/B tests with hypothesis per variant.',
      required_fields: ['variants'],
      cite_sources: true,
    },
    create_video: {
      expected_output: 'Video brief: concept, script_he, length, visual style, target platform, CTA.',
      required_fields: ['concept_he', 'script_he', 'length_sec', 'visual_style', 'platform', 'cta_he'],
      cite_sources: true,
    },
    warm_audience: {
      expected_output: 'Cold-to-warm audience plan: content sequence, frequency, creative themes.',
      required_fields: ['content_sequence', 'frequency', 'themes'],
      cite_sources: true,
    },
  };
  return contracts[taskType] || {
    expected_output: 'Structured actionable output in Hebrew. Every claim must cite the task_id and keyword_id.',
    required_fields: [],
    cite_sources: true,
  };
}

// Mark a task as in_progress when an agent picks it up.
export async function claimTask(taskId, kind) {
  const sb = getGT3Supabase();
  const table = kind === 'channel' ? 'gt3_channel_tasks' : 'gt3_action_tasks';
  const { error } = await sb.from(table).update({
    status: 'in_progress', updated_at: new Date().toISOString(),
  }).eq('id', taskId).eq('status', 'open'); // optimistic lock
  if (error) return svcResult({ ok: false, source: 'task_claim', errors: [error.message] });
  return svcResult({ ok: true, source: 'task_claim' });
}

// Record the outcome of a task — done / blocked / failed.
// The output artifact is stored in description_he (JSON-stringified)
// so the UI can render it.
export async function recordTaskOutcome(taskId, kind, { status, output, error_message }) {
  const sb = getGT3Supabase();
  const table = kind === 'channel' ? 'gt3_channel_tasks' : 'gt3_action_tasks';
  const update = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (output) {
    update.description_he = JSON.stringify(output); // the artifact
  }
  const { error } = await sb.from(table).update(update).eq('id', taskId);
  if (error) return svcResult({ ok: false, source: 'task_outcome', errors: [error.message] });
  return svcResult({ ok: true, source: 'task_outcome', data: { task_id: taskId, status } });
}

// ═══════════════════════════════════════════════════════════
// TASK EXECUTION — bridge to the existing agent runtime
// ═══════════════════════════════════════════════════════════
//
// Given a GT3 task, route it to the assigned agent via the
// existing executeAgent function. Returns the run_id so the UI
// can poll for the result.
//
// GT3 tasks bypass truth-envelope preflight because the context
// is ALREADY grounded — the task ships with customer + services +
// keyword + scoring + match state baked in by Phase 3. No need
// to re-fetch Google OAuth just to draft a page in Hebrew.
export async function executeGT3Task(taskId, kind) {
  const sb = getGT3Supabase();
  const table = kind === 'channel' ? 'gt3_channel_tasks' : 'gt3_action_tasks';

  const { data: task, error: tErr } = await sb.from(table).select('*').eq('id', taskId).single();
  if (tErr || !task) return svcResult({ ok: false, source: 'execute', errors: [tErr?.message || 'task not found'] });
  if (task.status === 'done') return svcResult({ ok: true, source: 'execute', data: { already_done: true, task_id: taskId } });

  const { data: agent } = await sb.from('agent_templates')
    .select('id, name, slug').eq('slug', task.assigned_agent).maybeSingle();
  if (!agent) {
    await sb.from(table).update({
      status: 'failed',
      description_he: `Agent "${task.assigned_agent}" not found`,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);
    return svcResult({ ok: false, source: 'execute', errors: [`No agent template found for slug="${task.assigned_agent}"`] });
  }

  const { data: customer } = await sb.from('gt3_customers')
    .select('legacy_client_id, name').eq('id', task.customer_id).single();
  const legacyClientId = customer?.legacy_client_id;
  if (!legacyClientId) {
    return svcResult({ ok: false, source: 'execute', errors: ['No legacy_client_id — cannot bridge to runs'] });
  }

  // Build grounded context
  const context = await buildTaskContext(task, kind);

  // Mark task in_progress
  await sb.from(table).update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', taskId);

  // CRITICAL: actually invoke the agent runtime. Previously we just inserted
  // a 'runs' row and walked away — the row sat at 'running' forever.
  // We kick off executeAgent asynchronously (don't block the HTTP request)
  // and poll the run to update the task status.
  try {
    const { executeAgent } = await import('../../functions/core.js');

    // Fire-and-forget — the agent runtime writes its own run row.
    // We pass the GT3 context in taskPayload so the agent has grounded data
    // and skip_preflight=true to bypass Google OAuth check (not needed for
    // tasks that work with already-grounded GT3 context).
    const taskPayload = {
      triggered_by: 'gt3_task',
      gt3_task_id: taskId,
      gt3_task_kind: kind,
      gt3_task_type: task.task_type,
      gt3_skip_preflight: true,
      priority_label: task.priority_label,
      title_he: task.title_he,
      description_he: task.description_he,
      gt3_context: context,
    };

    // Kick off asynchronously — don't await (would exceed HTTP timeout for complex tasks)
    const runPromise = executeAgent(legacyClientId, agent.id, taskPayload, {
      triggeredBy: 'gt3_task_executor',
    });

    // Wait briefly so we can grab the run_id
    const result = await Promise.race([
      runPromise,
      new Promise(resolve => setTimeout(() => resolve({ __timeout: true }), 3000)),
    ]);

    if (result?.__timeout) {
      // Agent is still running — that's fine, task will complete async.
      // The gt3-auto-execute cron or a separate poller will update task status
      // when the run finishes. For now, record a provisional run_id if we can.
      runPromise.then(async (r) => {
        try {
          await finalizeTaskFromRun(sb, table, taskId, r);
        } catch {}
      }).catch(async (err) => {
        await sb.from(table).update({
          status: 'failed',
          description_he: `Agent run error: ${err.message}`,
          updated_at: new Date().toISOString(),
        }).eq('id', taskId);
      });
      return svcResult({
        ok: true, source: 'execute',
        data: {
          task_id: taskId,
          run_id: null,
          agent_slug: task.assigned_agent,
          agent_name: agent.name,
          status: 'running_async',
          message: 'Agent is running. Task will update when complete (usually 30-90s).',
        },
      });
    }

    // Agent completed inside the timeout
    await finalizeTaskFromRun(sb, table, taskId, result);
    return svcResult({
      ok: true, source: 'execute',
      data: {
        task_id: taskId,
        run_id: result?.runId,
        agent_slug: task.assigned_agent,
        agent_name: agent.name,
        status: result?.blocked ? 'blocked' : result?.success === false ? 'failed' : 'done',
        message: result?.output?.message || 'Task completed.',
      },
    });
  } catch (err) {
    // Agent invocation exploded — record the real error on the task
    await sb.from(table).update({
      status: 'failed',
      description_he: `Execute error: ${err.message}`,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId);
    return svcResult({ ok: false, source: 'execute', errors: [err.message] });
  }
}

async function finalizeTaskFromRun(sb, table, taskId, runResult) {
  const status = runResult?.blocked ? 'blocked'
    : runResult?.success === false ? 'failed'
    : 'done';
  const output = runResult?.output || null;
  const update = { status, updated_at: new Date().toISOString() };
  if (output) {
    // Store the agent's output in description_he (JSON) for UI render
    try { update.description_he = JSON.stringify(output).slice(0, 8000); } catch {}
  }
  await sb.from(table).update(update).eq('id', taskId);
}

// Auto-execute the top N open tasks across all customers.
// Called from the cron. Uses priority + created_at ordering.
export async function autoExecuteOpenTasks({ maxPerCustomer = 3, maxTotal = 20 } = {}) {
  const sb = getGT3Supabase();
  const { data: customers } = await sb.from('gt3_customers').select('id, name');
  const dispatched = [];
  let total = 0;

  for (const c of customers || []) {
    if (total >= maxTotal) break;
    let perCustomer = 0;
    // Priority order: mission_critical → high_priority → strategic_support → low_priority
    for (const priority of ['mission_critical', 'high_priority', 'strategic_support', 'low_priority']) {
      if (perCustomer >= maxPerCustomer || total >= maxTotal) break;
      for (const table of [{ name: 'gt3_action_tasks', kind: 'action' }, { name: 'gt3_channel_tasks', kind: 'channel' }]) {
        if (perCustomer >= maxPerCustomer || total >= maxTotal) break;
        const { data: tasks } = await sb.from(table.name)
          .select('id, assigned_agent, task_type')
          .eq('customer_id', c.id)
          .eq('status', 'open')
          .eq('priority_label', priority)
          .not('assigned_agent', 'is', null)
          .order('created_at', { ascending: true })
          .limit(maxPerCustomer - perCustomer);
        for (const t of tasks || []) {
          if (perCustomer >= maxPerCustomer || total >= maxTotal) break;
          const r = await executeGT3Task(t.id, table.kind);
          dispatched.push({ customer: c.name, task_id: t.id, agent: t.assigned_agent, ok: r.ok, run_id: r.data?.run_id, error: r.errors?.[0] });
          perCustomer++;
          total++;
        }
      }
    }
  }
  return { dispatched_count: dispatched.length, dispatched };
}
