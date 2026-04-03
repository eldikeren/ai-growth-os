// ============================================================
// AI GROWTH OS — COMPLETE API ROUTES
// Every endpoint fully implemented
// ============================================================

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  executeAgent, processRunQueue, resumeApprovedTask,
  runPostChangePipeline, runLane, runAllAgentsForClient,
  retryRun, ingestDocumentToMemory,
  generateLinkRecommendations, syncGoogleSheetData,
  generateReportHtml, sendClientReport,
  refreshCredentialHealth, validateKpiSources, enqueueDueRuns
} from '../functions/core.js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── HEALTH ────────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString(), version: '2.0.0' }));

// ── CLIENTS ───────────────────────────────────────────────────
router.get('/clients', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clients').select('*, client_profiles(*), client_rules(*)').order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clients').select('*, client_profiles(*), client_rules(*)').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients', async (req, res) => {
  try {
    const { data, error } = await supabase.from('clients').insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/clients/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('clients').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/clients/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('clients').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, message: 'Client and all related data deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:id/stats', async (req, res) => {
  try {
    const clientId = req.params.id;
    const [runStats, queueStats, memCount, incidentCount] = await Promise.all([
      supabase.rpc('get_run_stats', { p_client_id: clientId }),
      supabase.rpc('get_queue_stats', { p_client_id: clientId }),
      supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('approved', true),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'open')
    ]);
    res.json({ run_stats: runStats.data, queue_stats: queueStats.data, memory_count: memCount.count, open_incidents: incidentCount.count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AGENTS ────────────────────────────────────────────────────
router.get('/agents', async (req, res) => {
  try {
    const { data, error } = await supabase.from('agent_templates').select('*').order('lane').order('role_type');
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/agents/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('agent_templates').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/agents/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('agent_templates').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/agents', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_agent_assignments')
      .select('*, agent_templates(*)')
      .eq('client_id', req.params.clientId);
    if (error) throw error;
    const byLane = {};
    for (const a of data) {
      const lane = a.agent_templates?.lane || 'Unknown';
      if (!byLane[lane]) byLane[lane] = [];
      byLane[lane].push({ ...a.agent_templates, assignment: { enabled: a.enabled, last_run_at: a.last_run_at, run_count: a.run_count } });
    }
    res.json(byLane);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/clients/:clientId/agents/:agentId', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client_agent_assignments').update(req.body)
      .eq('client_id', req.params.clientId).eq('agent_template_id', req.params.agentId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── RUNS ──────────────────────────────────────────────────────
router.post('/runs/execute', async (req, res) => {
  try {
    const { clientId, agentTemplateId, taskPayload, isDryRun, triggeredBy } = req.body;
    if (!clientId || !agentTemplateId) return res.status(400).json({ error: 'clientId and agentTemplateId required' });
    const result = await executeAgent(clientId, agentTemplateId, taskPayload || {}, { isDryRun, triggeredBy });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/runs/run-lane', async (req, res) => {
  try {
    const { clientId, laneName } = req.body;
    if (!clientId || !laneName) return res.status(400).json({ error: 'clientId and laneName required' });
    res.json(await runLane(clientId, laneName));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/runs/run-all', async (req, res) => {
  try {
    const { clientId } = req.body;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    res.json(await runAllAgentsForClient(clientId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/runs/:id/retry', async (req, res) => {
  try {
    res.json(await retryRun(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/runs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('runs')
      .select('*, agent_templates(name, slug, lane, role_type)')
      .eq('client_id', req.params.clientId)
      .order('created_at', { ascending: false })
      .limit(parseInt(req.query.limit) || 50);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/runs/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('runs').select('*, agent_templates(name, slug, lane, role_type, description)').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── QUEUE ─────────────────────────────────────────────────────
router.get('/queue', async (req, res) => {
  try {
    let query = supabase
      .from('run_queue').select('*, agent_templates(name, slug, lane), clients(name)')
      .order('priority', { ascending: true }).order('created_at', { ascending: true }).limit(100);
    if (req.query.clientId) query = query.eq('client_id', req.query.clientId);
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/queue/process', async (req, res) => {
  try { res.json(await processRunQueue()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/queue/enqueue-due', async (req, res) => {
  try { res.json(await enqueueDueRuns()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/queue/:id', async (req, res) => {
  try {
    await supabase.from('run_queue').update({ status: 'cancelled' }).eq('id', req.params.id).eq('status', 'queued');
    res.json({ cancelled: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── APPROVALS ─────────────────────────────────────────────────
router.get('/clients/:clientId/approvals', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('approvals').select('*, agent_templates(name, slug)')
      .eq('client_id', req.params.clientId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/approvals/:id/approve', async (req, res) => {
  try {
    await supabase.from('approvals').update({ status: 'approved', approved_by: req.body.approvedBy || 'admin', approved_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json(await resumeApprovedTask(req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/approvals/:id/reject', async (req, res) => {
  try {
    const { data, error } = await supabase.from('approvals').update({ status: 'rejected', rejection_reason: req.body.reason || 'Rejected', approved_at: new Date().toISOString() }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MEMORY ────────────────────────────────────────────────────
router.get('/clients/:clientId/memory', async (req, res) => {
  try {
    let query = supabase.from('memory_items').select('*').eq('client_id', req.params.clientId).order('relevance_score', { ascending: false });
    if (req.query.scope) query = query.eq('scope', req.query.scope);
    if (req.query.stale !== undefined) query = query.eq('is_stale', req.query.stale === 'true');
    const { data, error } = await query.limit(200);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/memory', async (req, res) => {
  try {
    const { data, error } = await supabase.from('memory_items').insert({ client_id: req.params.clientId, ...req.body, source: 'manual' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/memory/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('memory_items').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/memory/:id', async (req, res) => {
  try {
    await supabase.from('memory_items').delete().eq('id', req.params.id);
    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/memory/mark-stale', async (req, res) => {
  try {
    const { ids } = req.body;
    await supabase.from('memory_items').update({ is_stale: true }).in('id', ids);
    res.json({ marked_stale: ids.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DOCUMENTS ─────────────────────────────────────────────────
router.get('/clients/:clientId/documents', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_documents').select('*').eq('client_id', req.params.clientId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/documents', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_documents').insert({ client_id: req.params.clientId, ...req.body }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/documents/:id/ingest', async (req, res) => {
  try {
    const { data: doc } = await supabase.from('client_documents').select('client_id').eq('id', req.params.id).single();
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    res.json(await ingestDocumentToMemory(doc.client_id, req.params.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PROMPT VERSIONS ───────────────────────────────────────────
router.get('/agents/:agentId/prompts', async (req, res) => {
  try {
    let query = supabase.from('prompt_versions').select('*').eq('agent_template_id', req.params.agentId).order('version_number', { ascending: false });
    if (req.query.clientId) query = query.eq('client_id', req.query.clientId);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/agents/:agentId/prompts', async (req, res) => {
  try {
    const { prompt_body, client_id, change_notes } = req.body;
    const { data: existing } = await supabase.from('prompt_versions').select('version_number').eq('agent_template_id', req.params.agentId).order('version_number', { ascending: false }).limit(1);
    const nextVersion = (existing?.[0]?.version_number || 0) + 1;
    await supabase.from('prompt_versions').update({ is_active: false }).eq('agent_template_id', req.params.agentId);
    const { data, error } = await supabase.from('prompt_versions').insert({ agent_template_id: req.params.agentId, client_id: client_id || null, version_number: nextVersion, prompt_body, change_notes, is_active: true }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/prompts/:id/activate', async (req, res) => {
  try {
    const { data: version } = await supabase.from('prompt_versions').select('*').eq('id', req.params.id).single();
    if (!version) return res.status(404).json({ error: 'Version not found' });
    await supabase.from('prompt_versions').update({ is_active: false }).eq('agent_template_id', version.agent_template_id);
    const { data, error } = await supabase.from('prompt_versions').update({ is_active: true }).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SEO / LINK INTELLIGENCE ───────────────────────────────────
router.get('/clients/:clientId/backlinks', async (req, res) => {
  try {
    const { data, error } = await supabase.from('backlinks').select('*').eq('client_id', req.params.clientId).order('domain_authority', { ascending: false }).limit(200);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/referring-domains', async (req, res) => {
  try {
    const { data, error } = await supabase.from('referring_domains').select('*').eq('client_id', req.params.clientId).order('domain_authority', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/link-gap', async (req, res) => {
  try {
    const { data, error } = await supabase.from('competitor_link_gap').select('*').eq('client_id', req.params.clientId).order('domain_authority', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/keywords', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_keywords').select('*').eq('client_id', req.params.clientId).order('volume', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/link-recommendations', async (req, res) => {
  try {
    const { data, error } = await supabase.from('link_recommendations').select('*').eq('client_id', req.params.clientId).order('priority', { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/link-recommendations/generate', async (req, res) => {
  try { res.json(await generateLinkRecommendations(req.params.clientId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/link-recommendations/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('link_recommendations').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/sync-sheets', async (req, res) => {
  try {
    const { sheetUrl, syncType } = req.body;
    if (!sheetUrl || !syncType) return res.status(400).json({ error: 'sheetUrl and syncType required' });
    res.json(await syncGoogleSheetData(req.params.clientId, sheetUrl, syncType));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/sync-log', async (req, res) => {
  try {
    const { data, error } = await supabase.from('external_sync_log').select('*').eq('client_id', req.params.clientId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/clients/:clientId/competitors', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_competitors').select('*').eq('client_id', req.params.clientId);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REPORTS ───────────────────────────────────────────────────
router.get('/clients/:clientId/reports', async (req, res) => {
  try {
    const { data, error } = await supabase.from('reports').select('*').eq('client_id', req.params.clientId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/reports/generate', async (req, res) => {
  try {
    const { periodStart, periodEnd, periodType } = req.body;
    const clientId = req.params.clientId;
    const { data: client } = await supabase.from('clients').select('name').eq('id', clientId).single();
    const { data: reportAgent } = await supabase.from('agent_templates').select('id').eq('slug', 'report-composer-agent').single();
    if (!reportAgent) return res.status(404).json({ error: 'Report Composer agent not found' });
    const execResult = await executeAgent(clientId, reportAgent.id, { period_start: periodStart, period_end: periodEnd, period_type: periodType || 'monthly' }, { triggeredBy: 'report_generation' });
    const htmlContent = await generateReportHtml(execResult.output, client.name, { start: periodStart, end: periodEnd, type: periodType || 'monthly' });
    const { data: report, error } = await supabase.from('reports').insert({ client_id: clientId, run_id: execResult.runId, title: `דוח ${periodType === 'weekly' ? 'שבועי' : 'חודשי'} — ${client.name} — ${periodEnd}`, period: periodType || 'monthly', period_start: periodStart, period_end: periodEnd, html_content: htmlContent, json_content: execResult.output, status: 'ready', language: 'he' }).select().single();
    if (error) throw error;
    res.json({ report, run: execResult });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('reports').select('*').eq('id', req.params.id).single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/reports/:id/html', async (req, res) => {
  try {
    const { data } = await supabase.from('reports').select('html_content').eq('id', req.params.id).single();
    if (!data?.html_content) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(data.html_content);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/reports/:id/send', async (req, res) => {
  try {
    const { recipients } = req.body;
    if (!recipients?.length) return res.status(400).json({ error: 'recipients required' });
    res.json(await sendClientReport(req.params.id, recipients));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── INCIDENTS ─────────────────────────────────────────────────
router.get('/clients/:clientId/incidents', async (req, res) => {
  try {
    let query = supabase.from('incidents').select('*, agent_templates(name, slug)').eq('client_id', req.params.clientId).order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/incidents/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('incidents').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── AUDIT TRAIL ───────────────────────────────────────────────
router.get('/clients/:clientId/audit', async (req, res) => {
  try {
    const { data, error } = await supabase.from('audit_trail').select('*').eq('client_id', req.params.clientId).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SCHEDULES ─────────────────────────────────────────────────
router.get('/clients/:clientId/schedules', async (req, res) => {
  try {
    const { data, error } = await supabase.from('agent_schedules').select('*, agent_templates(name, slug, lane)').eq('client_id', req.params.clientId);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/schedules', async (req, res) => {
  try {
    const { data, error } = await supabase.from('agent_schedules').insert({ client_id: req.params.clientId, ...req.body }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/schedules/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('agent_schedules').update(req.body).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREDENTIALS ───────────────────────────────────────────────
router.get('/clients/:clientId/credentials', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_credentials').select('id, service, label, is_connected, health_score, last_checked, last_successful, error').eq('client_id', req.params.clientId);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/credentials/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_credentials').update(req.body).eq('id', req.params.id).select('id, service, label, is_connected, health_score').single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/credentials/refresh', async (req, res) => {
  try { res.json(await refreshCredentialHealth(req.params.clientId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── BASELINES ─────────────────────────────────────────────────
router.get('/clients/:clientId/baselines', async (req, res) => {
  try {
    const { data, error } = await supabase.from('baselines').select('*').eq('client_id', req.params.clientId);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/baselines', async (req, res) => {
  try {
    const { data, error } = await supabase.from('baselines').upsert({ client_id: req.params.clientId, ...req.body }, { onConflict: 'client_id,metric_name' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── VERIFICATION ──────────────────────────────────────────────
router.get('/clients/:clientId/verification', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const [agentCount, zeroPrompts, memCount, queueStats, lastRun, openIncidents, openApprovals, credHealth, orphanRuns] = await Promise.all([
      supabase.from('client_agent_assignments').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('enabled', true),
      supabase.from('agent_templates').select('id', { count: 'exact', head: true }).or('base_prompt.is.null,base_prompt.eq.'),
      supabase.from('memory_items').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('approved', true).eq('is_stale', false),
      supabase.rpc('get_queue_stats', { p_client_id: clientId }),
      supabase.from('runs').select('created_at, status').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'open').eq('severity', 'critical'),
      supabase.from('approvals').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'pending'),
      supabase.from('client_credentials').select('health_score').eq('client_id', clientId),
      supabase.from('runs').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'running').lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
    ]);
    const kpiIntegrity = await validateKpiSources(clientId);
    const avgCred = credHealth.data?.length ? Math.round(credHealth.data.reduce((s, c) => s + (c.health_score || 0), 0) / credHealth.data.length) : 0;
    const checks = [
      { id: 'agent_assignments', label: 'Agents assigned and enabled', pass: agentCount.count >= 20, detail: `${agentCount.count} agents enabled` },
      { id: 'prompt_quality', label: 'All agent prompts populated', pass: zeroPrompts.count === 0, detail: `${zeroPrompts.count} agents with empty prompts` },
      { id: 'memory_loaded', label: 'Memory items loaded', pass: memCount.count >= 5, detail: `${memCount.count} active memory items` },
      { id: 'queue_health', label: 'Queue not backed up', pass: (queueStats.data?.queued || 0) < 50, detail: `${queueStats.data?.queued || 0} queued, ${queueStats.data?.failed || 0} failed` },
      { id: 'recent_run', label: 'Recent successful run (48h)', pass: lastRun.data?.[0]?.status === 'success' && new Date(lastRun.data[0].created_at) > new Date(Date.now() - 48 * 60 * 60 * 1000), detail: lastRun.data?.[0]?.created_at ? `Last: ${new Date(lastRun.data[0].created_at).toLocaleString()}` : 'No runs' },
      { id: 'no_critical_incidents', label: 'No critical open incidents', pass: openIncidents.count === 0, detail: `${openIncidents.count} critical incidents open` },
      { id: 'pending_approvals', label: 'Approvals not stale', pass: openApprovals.count < 10, detail: `${openApprovals.count} pending` },
      { id: 'credential_health', label: 'Credential health ≥50%', pass: avgCred >= 50, detail: `Average: ${avgCred}%` },
      { id: 'kpi_integrity', label: 'KPI integrity verified', pass: kpiIntegrity.integrity_score >= 70, detail: `Score: ${kpiIntegrity.integrity_score}% — ${kpiIntegrity.verdict}` },
      { id: 'no_orphan_runs', label: 'No stuck runs (>10 min)', pass: orphanRuns.count === 0, detail: `${orphanRuns.count} stuck` }
    ];
    const passCount = checks.filter(c => c.pass).length;
    res.json({ checks, all_passed: passCount === checks.length, pass_count: passCount, total_checks: checks.length, health_score: Math.round((passCount / checks.length) * 100) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
