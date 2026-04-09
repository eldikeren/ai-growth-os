// ============================================================
// AI GROWTH OS — ADDITIONAL ROUTES
// Onboarding, connectors, prompt overrides, run steps,
// link intelligence, SEO action plans, verification (full),
// report templates, schedules, KPI snapshots, locations
// ============================================================

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  createClientOnboarding, syncConnector,
  getActivePrompt, createPromptOverride, diffPrompts,
  createRunStep, completeRunStep, getRunSteps,
  generateFullLinkIntelligence, generateSeoActionPlan,
  runFullVerification, snapshotKeywordPositions, recordKpiSnapshot
} from '../functions/additional.js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── ONBOARDING ────────────────────────────────────────────────
router.post('/onboarding', async (req, res) => {
  try {
    const result = await createClientOnboarding(req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/onboarding/:clientId/status', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const [profile, rules, keywords, competitors, connectors, assignments] = await Promise.all([
      supabase.from('client_profiles').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('client_rules').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('client_keywords').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('client_competitors').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('client_connectors').select('*').eq('client_id', clientId),
      supabase.from('client_agent_assignments').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('enabled', true)
    ]);
    res.json({
      step1_complete: !!(profile.data?.business_type && profile.data?.language),
      step2_complete: !!(rules.data?.geographies?.length > 0 || rules.data?.target_audiences?.length > 0),
      step3_complete: connectors.data?.length > 0,
      step4_complete: (keywords.count || 0) > 0,
      step5_complete: !!(rules.data?.allowed_accounts?.length > 0),
      step6_complete: false, // report schedules
      profile: profile.data,
      rules: rules.data,
      keyword_count: keywords.count || 0,
      competitor_count: competitors.count || 0,
      connector_count: connectors.data?.length || 0,
      agent_count: assignments.count || 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CONNECTORS ────────────────────────────────────────────────
router.get('/clients/:clientId/connectors', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_connectors').select('*')
      .eq('client_id', req.params.clientId)
      .order('connector_type');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/connectors', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_connectors').upsert({
      client_id: req.params.clientId, ...req.body
    }, { onConflict: 'client_id,connector_type' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/connectors/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_connectors').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/connectors/:type/sync', async (req, res) => {
  try {
    const result = await syncConnector(req.params.clientId, req.params.type);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PROMPT OVERRIDES ──────────────────────────────────────────
router.get('/clients/:clientId/prompt-overrides', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_prompt_overrides')
      .select('*, agent_templates(name, slug, lane)')
      .eq('client_id', req.params.clientId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/prompt-overrides', async (req, res) => {
  try {
    const { agentTemplateId, promptText, notes } = req.body;
    const result = await createPromptOverride(req.params.clientId, agentTemplateId, promptText, notes);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/prompt-overrides/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_prompt_overrides').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/agents/:agentId/active-prompt', async (req, res) => {
  try {
    const result = await getActivePrompt(req.params.clientId, req.params.agentId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/agents/:agentId/prompt-diff', async (req, res) => {
  try {
    const result = await diffPrompts(req.params.agentId, req.params.clientId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── RUN STEPS ─────────────────────────────────────────────────
router.get('/runs/:runId/steps', async (req, res) => {
  try {
    const steps = await getRunSteps(req.params.runId);
    res.json(steps);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LINK INTELLIGENCE ─────────────────────────────────────────
router.post('/clients/:clientId/link-intelligence/generate', async (req, res) => {
  try {
    const result = await generateFullLinkIntelligence(req.params.clientId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/link-opportunities', async (req, res) => {
  try {
    let query = supabase.from('link_opportunities').select('*').eq('client_id', req.params.clientId).order('priority_score', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/link-opportunities/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('link_opportunities').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/missing-domains', async (req, res) => {
  try {
    const { data, error } = await supabase.from('missing_referring_domains').select('*').eq('client_id', req.params.clientId).order('priority_score', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/missing-domains/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('missing_referring_domains').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SEO ACTION PLANS ──────────────────────────────────────────
router.get('/clients/:clientId/seo-action-plans', async (req, res) => {
  try {
    let query = supabase.from('seo_action_plans').select('*').eq('client_id', req.params.clientId).order('priority_score', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/seo-action-plans/generate', async (req, res) => {
  try {
    const result = await generateSeoActionPlan(req.params.clientId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/seo-action-plans/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('seo_action_plans').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FULL VERIFICATION (honest status labels) ──────────────────
router.get('/clients/:clientId/verification/full', async (req, res) => {
  try {
    const result = await runFullVerification(req.params.clientId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── KPI SNAPSHOTS ─────────────────────────────────────────────
router.get('/clients/:clientId/kpi-snapshots', async (req, res) => {
  try {
    const { data, error } = await supabase.from('kpi_snapshots').select('*').eq('client_id', req.params.clientId).order('data_date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/kpi-snapshots', async (req, res) => {
  try {
    const { metricName, metricValue, metricText, source } = req.body;
    const result = await recordKpiSnapshot(req.params.clientId, metricName, metricValue, metricText, source);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── KEYWORD SNAPSHOTS ─────────────────────────────────────────
router.post('/clients/:clientId/keywords/snapshot', async (req, res) => {
  try {
    const result = await snapshotKeywordPositions(req.params.clientId);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/keyword-snapshots', async (req, res) => {
  try {
    const { data, error } = await supabase.from('keyword_snapshots').select('*').eq('client_id', req.params.clientId).order('snapshot_date', { ascending: false }).limit(500);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REPORT TEMPLATES ──────────────────────────────────────────
router.get('/report-templates', async (req, res) => {
  try {
    const { data, error } = await supabase.from('report_templates').select('*').eq('is_active', true).order('language').order('report_type');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REPORT SCHEDULES ──────────────────────────────────────────
router.get('/clients/:clientId/report-schedules', async (req, res) => {
  try {
    const { data, error } = await supabase.from('report_schedules').select('*, report_recipients(*)').eq('client_id', req.params.clientId);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/report-schedules', async (req, res) => {
  try {
    const { data, error } = await supabase.from('report_schedules').insert({ client_id: req.params.clientId, ...req.body }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/report-schedules/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('report_schedules').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GENERATED REPORTS ─────────────────────────────────────────
router.get('/clients/:clientId/generated-reports', async (req, res) => {
  try {
    const { data, error } = await supabase.from('generated_reports').select('*').eq('client_id', req.params.clientId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/generated-reports/:id/html', async (req, res) => {
  try {
    const { data } = await supabase.from('generated_reports').select('html_content, rtl').eq('id', req.params.id).single();
    if (!data?.html_content) return res.status(404).send('Report not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(data.html_content);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SENT REPORTS LOG ──────────────────────────────────────────
router.get('/clients/:clientId/sent-reports', async (req, res) => {
  try {
    const { data, error } = await supabase.from('sent_reports').select('*').eq('client_id', req.params.clientId).order('sent_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CLIENT LOCATIONS ──────────────────────────────────────────
router.get('/clients/:clientId/locations', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_locations').select('*').eq('client_id', req.params.clientId);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/locations', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_locations').insert({ client_id: req.params.clientId, ...req.body }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AUTHORITY / BACKLINK SNAPSHOTS ────────────────────────────
router.get('/clients/:clientId/authority-snapshots', async (req, res) => {
  try {
    const { data, error } = await supabase.from('authority_snapshots').select('*').eq('client_id', req.params.clientId).order('snapshot_date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/backlink-snapshots', async (req, res) => {
  try {
    const { data, error } = await supabase.from('backlink_snapshots').select('*').eq('client_id', req.params.clientId).order('snapshot_date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SCHEDULE DEFINITIONS ──────────────────────────────────────
router.get('/clients/:clientId/schedule-definitions', async (req, res) => {
  try {
    const { data, error } = await supabase.from('schedule_definitions').select('*').eq('client_id', req.params.clientId).order('cron_expression');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/schedule-definitions/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('schedule_definitions').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── COMPETITOR INTELLIGENCE EXTRAS ───────────────────────────
router.get('/clients/:clientId/competitor-snapshots', async (req, res) => {
  try {
    const { data, error } = await supabase.from('competitor_snapshots').select('*').eq('client_id', req.params.clientId).order('snapshot_date', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── VERCEL CRON HANDLERS ──────────────────────────────────────
// These are triggered by vercel.json cron config

router.get('/cron/process-queue', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { processRunQueue } = await import('../functions/core.js');
    const result = await processRunQueue();
    res.json({ ok: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cron/enqueue-scheduled', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { enqueueDueRuns } = await import('../functions/core.js');
    const result = await enqueueDueRuns();
    res.json({ ok: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cron/health-check', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data: clients } = await supabase.from('clients').select('id').eq('status', 'active');
    const results = [];
    for (const client of (clients || [])) {
      const { refreshCredentialHealth } = await import('../functions/core.js');
      const result = await refreshCredentialHealth(client.id);
      results.push({ client_id: client.id, ...result });
    }
    res.json({ ok: true, clients_checked: results.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── META DATA DELETION CALLBACK ──────────────────────────────
// Required by Meta App Review — receives callback when user removes app
router.post('/meta/data-deletion', async (req, res) => {
  try {
    const { signed_request } = req.body;
    if (!signed_request) return res.status(400).json({ error: 'Missing signed_request' });

    // Parse signed request (base64url encoded)
    const parts = signed_request.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    const userId = payload.user_id;

    if (userId) {
      // Find and delete credentials linked to this Meta user
      // Meta user_id may be stored in credential_data or integration_assets
      const { data: assets } = await supabase.from('integration_assets')
        .select('client_id').eq('provider', 'meta');

      // Delete all meta-related credentials and data for matching clients
      for (const asset of (assets || [])) {
        await supabase.from('client_credentials')
          .delete().eq('client_id', asset.client_id).in('service', ['facebook', 'instagram', 'meta_business']);
        await supabase.from('integration_assets')
          .delete().eq('client_id', asset.client_id).eq('provider', 'meta');
        await supabase.from('kpi_snapshots')
          .delete().eq('client_id', asset.client_id).in('metric_name', ['facebook_page_fans', 'instagram_followers']);
      }

      console.log(`Meta data deletion callback processed for user ${userId}`);
    }

    // Meta expects a JSON response with a URL and confirmation code
    const confirmCode = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    res.json({
      url: 'https://ai-growth-os-mu.vercel.app/data-deletion',
      confirmation_code: confirmCode,
    });
  } catch (err) {
    console.error('Meta data deletion error:', err);
    res.json({ url: 'https://ai-growth-os-mu.vercel.app/data-deletion', confirmation_code: 'error' });
  }
});

// ── AI CHAT ASSISTANT ────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { messages, clientId } = req.body;
    if (!messages || !Array.isArray(messages)) throw new Error('messages array required');

    // Get OpenAI key — first from client credentials, then env
    let openaiKey = process.env.OPENAI_API_KEY;
    if (clientId) {
      const { data: cred } = await supabase.from('client_credentials')
        .select('credential_data').eq('client_id', clientId).eq('service', 'openai').single();
      if (cred?.credential_data?.api_key) openaiKey = cred.credential_data.api_key;
    }
    if (!openaiKey) throw new Error('No OpenAI API key configured. Add it in Credentials.');

    // Gather context about the current client
    let context = '';
    if (clientId) {
      const [clientRes, agentsRes, overridesRes, memoryRes, baselines, creds] = await Promise.all([
        supabase.from('clients').select('*').eq('id', clientId).single(),
        supabase.from('agent_templates').select('id, name, slug, lane, role_type, base_prompt').order('lane, name'),
        supabase.from('client_prompt_overrides').select('*, agent_templates(name, slug)').eq('client_id', clientId).eq('is_active', true),
        supabase.from('memory_items').select('scope, content, tags').eq('client_id', clientId).eq('is_stale', false).limit(20),
        supabase.from('baselines').select('metric_name, metric_value, target_value').eq('client_id', clientId),
        supabase.from('client_credentials').select('service, label, is_connected, health_score, error').eq('client_id', clientId),
      ]);

      const client = clientRes.data;
      context = `
## Current Client
Name: ${client?.name || 'Unknown'} | Domain: ${client?.domain || 'N/A'} | ID: ${clientId}

## Agents (${agentsRes.data?.length || 0} total)
${(agentsRes.data || []).map(a => `- ${a.name} [${a.lane} / ${a.role_type}] (ID: ${a.id}) — Prompt: ${a.base_prompt ? a.base_prompt.slice(0, 100) + '...' : 'EMPTY'}`).join('\n')}

## Active Prompt Overrides (${overridesRes.data?.length || 0})
${(overridesRes.data || []).map(o => `- ${o.agent_templates?.name}: "${o.prompt_text?.slice(0, 100)}..."`).join('\n') || 'None'}

## Memory Items (${memoryRes.data?.length || 0})
${(memoryRes.data || []).map(m => `- [${m.scope}] ${m.content?.slice(0, 100)}`).join('\n') || 'None'}

## Baselines/KPIs
${(baselines.data || []).map(b => `- ${b.metric_name}: ${b.metric_value} (target: ${b.target_value || 'N/A'})`).join('\n') || 'None'}

## Credentials
${(creds.data || []).map(c => `- ${c.label || c.service}: ${c.is_connected ? 'Connected' : 'Disconnected'} (Health: ${c.health_score}%)${c.error ? ' Error: ' + c.error : ''}`).join('\n') || 'None'}
`;
    }

    const systemPrompt = `You are the AI Growth OS Assistant — a helpful AI built into the AI Growth OS platform. You help the user manage their SEO agency operations, edit agent prompts, understand data, and make changes to the system.

You have access to TOOLS that let you execute actions on the system. When the user asks you to do something, use the appropriate tool.

${context}

## CAPABILITIES
You can help with:
1. **Edit Agent Prompts** — Modify what agents do by updating their prompts. Use the edit_prompt tool.
2. **Query Data** — Look up client data, run stats, memory items, baselines, credentials.
3. **Add Memory** — Add context/facts about a client that agents will use. Use add_memory tool.
4. **Update Baselines** — Change KPI targets. Use update_baseline tool.
5. **Explain** — Explain how the system works, what each agent does, what metrics mean.
6. **Troubleshoot** — Help diagnose why something isn't working.

## RULES
- Be concise and helpful
- When editing prompts, confirm what you're about to change before doing it
- Show the user the diff (before/after) when making changes
- Always explain what you did after taking an action
- Speak in the user's language (if they write in Hebrew, respond in Hebrew)`;

    // Define tools for the AI
    const tools = [
      {
        type: 'function',
        function: {
          name: 'edit_prompt',
          description: 'Edit an agent\'s prompt override for this client. Creates or updates the client-specific prompt.',
          parameters: {
            type: 'object',
            properties: {
              agent_template_id: { type: 'string', description: 'The agent template ID to edit' },
              new_prompt: { type: 'string', description: 'The full new prompt text' },
              notes: { type: 'string', description: 'Brief description of what was changed' },
            },
            required: ['agent_template_id', 'new_prompt', 'notes'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_memory',
          description: 'Add a memory item (fact, context, rule) about this client that agents will use.',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'The memory content' },
              scope: { type: 'string', enum: ['fact', 'goal', 'constraint', 'preference', 'history'], description: 'Type of memory' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
            },
            required: ['content', 'scope'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_baseline',
          description: 'Update a KPI baseline or target value for this client.',
          parameters: {
            type: 'object',
            properties: {
              metric_name: { type: 'string', description: 'The metric name (e.g. google_reviews_count, mobile_pagespeed)' },
              metric_value: { type: 'number', description: 'The current value' },
              target_value: { type: 'number', description: 'The target value' },
            },
            required: ['metric_name'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'query_data',
          description: 'Query data from the system. Returns results from the database.',
          parameters: {
            type: 'object',
            properties: {
              table: { type: 'string', enum: ['agents', 'runs', 'memory', 'baselines', 'incidents', 'approvals', 'credentials', 'schedules'], description: 'Which data to query' },
              filter: { type: 'string', description: 'Optional filter description (e.g. "last 5 runs", "open incidents")' },
            },
            required: ['table'],
          },
        },
      },
    ];

    // Call OpenAI
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: 'gpt-4.1',
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        tools,
        tool_choice: 'auto',
        max_tokens: 2000,
        temperature: 0.7,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      throw new Error(`OpenAI error: ${openaiRes.status} ${err}`);
    }

    let data = await openaiRes.json();
    let assistantMsg = data.choices?.[0]?.message;

    // Handle tool calls
    if (assistantMsg?.tool_calls?.length > 0) {
      const toolResults = [];
      for (const tc of assistantMsg.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        let result;

        try {
          switch (tc.function.name) {
            case 'edit_prompt': {
              // Create prompt override
              const { createPromptOverride: createPO } = await import('../functions/additional.js');
              result = await createPO(clientId, args.agent_template_id, args.new_prompt, args.notes);
              break;
            }
            case 'add_memory': {
              const { data: mem, error } = await supabase.from('memory_items').insert({
                client_id: clientId, content: args.content, scope: args.scope,
                tags: args.tags || [], source: 'ai_chat', approved: true,
                relevance_score: 80,
              }).select().single();
              if (error) throw error;
              result = { success: true, id: mem.id, message: `Added ${args.scope} memory item` };
              break;
            }
            case 'update_baseline': {
              const updateData = {};
              if (args.metric_value != null) updateData.metric_value = args.metric_value;
              if (args.target_value != null) updateData.target_value = args.target_value;
              updateData.recorded_at = new Date().toISOString();
              const { data: bl, error } = await supabase.from('baselines')
                .update(updateData).eq('client_id', clientId).eq('metric_name', args.metric_name).select().single();
              if (error) throw error;
              result = { success: true, metric: args.metric_name, ...updateData };
              break;
            }
            case 'query_data': {
              const tableMap = {
                agents: { table: 'agent_templates', select: 'id, name, slug, lane, role_type', limit: 50 },
                runs: { table: 'runs', select: '*, agent_templates(name, slug)', limit: 10, order: 'created_at', desc: true },
                memory: { table: 'memory_items', select: '*', limit: 20, order: 'created_at', desc: true },
                baselines: { table: 'baselines', select: '*' },
                incidents: { table: 'incidents', select: '*', limit: 20, order: 'created_at', desc: true },
                approvals: { table: 'approvals', select: '*, agent_templates(name)', limit: 20, order: 'created_at', desc: true },
                credentials: { table: 'client_credentials', select: 'service, label, is_connected, health_score, error' },
                schedules: { table: 'schedules', select: '*, agent_templates(name)', limit: 20 },
              };
              const cfg = tableMap[args.table];
              let q = supabase.from(cfg.table).select(cfg.select);
              if (cfg.table !== 'agent_templates') q = q.eq('client_id', clientId);
              if (cfg.order) q = q.order(cfg.order, { ascending: !cfg.desc });
              if (cfg.limit) q = q.limit(cfg.limit);
              const { data: rows, error } = await q;
              if (error) throw error;
              result = { count: rows.length, data: rows };
              break;
            }
            default:
              result = { error: 'Unknown tool' };
          }
        } catch (e) {
          result = { error: e.message };
        }
        toolResults.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify(result) });
      }

      // Send tool results back to OpenAI for final response
      const followUp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages,
            assistantMsg,
            ...toolResults,
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
      });

      if (!followUp.ok) {
        const err = await followUp.text();
        throw new Error(`OpenAI follow-up error: ${followUp.status}`);
      }

      const followUpData = await followUp.json();
      assistantMsg = followUpData.choices?.[0]?.message;
    }

    res.json({
      message: assistantMsg?.content || 'No response',
      tool_calls: assistantMsg?.tool_calls || [],
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
