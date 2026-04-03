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

export default router;
