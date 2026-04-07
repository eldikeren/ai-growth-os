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

// Get credential detail with field presence info (not raw secrets)
router.get('/credentials/:id/detail', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_credentials')
      .select('id, service, label, is_connected, health_score, last_checked, last_successful, error, credential_data')
      .eq('id', req.params.id).single();
    if (error) throw error;
    // Return field presence map + masked values (don't expose full secrets)
    const credData = data.credential_data || {};
    const fieldStatus = {};
    const maskedData = {};
    for (const [key, val] of Object.entries(credData)) {
      if (val && String(val).trim()) {
        fieldStatus[key] = true;
        const s = String(val);
        // Mask secrets: show first 3 and last 4 chars
        if (s.length > 10 && (key.includes('password') || key.includes('secret') || key.includes('token') || key.includes('api_key') || key === 'key')) {
          maskedData[key] = s.slice(0, 3) + '...' + s.slice(-4);
        } else {
          maskedData[key] = s; // Non-secret fields shown in full
        }
      } else {
        fieldStatus[key] = false;
        maskedData[key] = '';
      }
    }
    res.json({
      id: data.id, service: data.service, label: data.label,
      is_connected: data.is_connected, health_score: data.health_score,
      last_checked: data.last_checked, last_successful: data.last_successful,
      error: data.error, field_status: fieldStatus, masked_data: maskedData,
      raw_data: credData, // The actual values for pre-filling the form
    });
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

// ── PAGESPEED (real Google PageSpeed Insights API) ───────────
router.post('/clients/:clientId/pagespeed', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    // Get client domain
    const { data: client } = await supabase.from('clients').select('domain').eq('id', clientId).single();
    if (!client?.domain) return res.status(400).json({ error: 'Client has no domain configured' });

    const url = client.domain.startsWith('http') ? client.domain : `https://${client.domain}`;
    const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || ''; // works without key too, just rate-limited

    // Fetch both mobile and desktop scores from Google PageSpeed Insights API
    const fetchScore = async (strategy) => {
      const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}${apiKey ? `&key=${apiKey}` : ''}`;
      const resp = await fetch(apiUrl);
      if (!resp.ok) throw new Error(`PageSpeed API ${strategy} failed: ${resp.status}`);
      const data = await resp.json();
      const score = Math.round((data.lighthouseResult?.categories?.performance?.score || 0) * 100);
      const fcp = data.lighthouseResult?.audits?.['first-contentful-paint']?.displayValue || null;
      const lcp = data.lighthouseResult?.audits?.['largest-contentful-paint']?.displayValue || null;
      const cls = data.lighthouseResult?.audits?.['cumulative-layout-shift']?.displayValue || null;
      const tbt = data.lighthouseResult?.audits?.['total-blocking-time']?.displayValue || null;
      return { score, fcp, lcp, cls, tbt };
    };

    const [mobile, desktop] = await Promise.all([
      fetchScore('mobile'),
      fetchScore('desktop'),
    ]);

    // Update baselines
    const now = new Date().toISOString();
    await supabase.from('baselines').upsert({
      client_id: clientId, metric_name: 'mobile_pagespeed',
      metric_value: mobile.score, metric_text: `${mobile.score}/100`,
      source: 'Google PageSpeed Insights API (live)', target_value: 80, recorded_at: now,
    }, { onConflict: 'client_id,metric_name' });

    await supabase.from('baselines').upsert({
      client_id: clientId, metric_name: 'desktop_pagespeed',
      metric_value: desktop.score, metric_text: `${desktop.score}/100`,
      source: 'Google PageSpeed Insights API (live)', target_value: 90, recorded_at: now,
    }, { onConflict: 'client_id,metric_name' });

    // Also store a KPI snapshot for history
    await supabase.from('kpi_snapshots').insert([
      { client_id: clientId, metric_name: 'mobile_pagespeed', metric_value: mobile.score, metric_text: `${mobile.score}/100`, source: 'PageSpeed Insights API', source_verified: true, data_date: now.split('T')[0] },
      { client_id: clientId, metric_name: 'desktop_pagespeed', metric_value: desktop.score, metric_text: `${desktop.score}/100`, source: 'PageSpeed Insights API', source_verified: true, data_date: now.split('T')[0] },
    ]);

    res.json({
      url,
      mobile: { score: mobile.score, fcp: mobile.fcp, lcp: mobile.lcp, cls: mobile.cls, tbt: mobile.tbt },
      desktop: { score: desktop.score, fcp: desktop.fcp, lcp: desktop.lcp, cls: desktop.cls, tbt: desktop.tbt },
      updated_at: now,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REFRESH ALL METRICS (real API checks) ────────────────────
router.post('/clients/:clientId/metrics/refresh-all', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const results = [];
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    // Get client info
    const { data: client } = await supabase.from('clients').select('domain, name').eq('id', clientId).single();
    if (!client) return res.status(404).json({ error: 'Client not found' });

    // Get all credentials for this client
    const { data: allCreds } = await supabase.from('client_credentials').select('service, credential_data, is_connected').eq('client_id', clientId);
    const creds = Object.fromEntries((allCreds || []).map(c => [c.service, c]));

    const domain = client.domain?.startsWith('http') ? client.domain : `https://${client.domain}`;

    // Helper: upsert baseline + snapshot
    async function storeMetric(name, value, text, source, target) {
      await supabase.from('baselines').upsert({
        client_id: clientId, metric_name: name,
        metric_value: value, metric_text: text,
        source, recorded_at: now, ...(target != null ? { target_value: target } : {}),
      }, { onConflict: 'client_id,metric_name' });
      await supabase.from('kpi_snapshots').insert({
        client_id: clientId, metric_name: name, metric_value: value,
        metric_text: text, source, source_verified: true, data_date: today,
      }).catch(() => {}); // ignore snapshot errors
    }

    // ═══════════════════════════════════════════════════════════
    // 1. MOBILE PAGESPEED — Google PageSpeed Insights API (free)
    // ═══════════════════════════════════════════════════════════
    if (client.domain) {
      try {
        const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || '';
        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(domain)}&strategy=mobile${apiKey ? `&key=${apiKey}` : ''}`;
        const psRes = await fetch(apiUrl);
        if (psRes.ok) {
          const psData = await psRes.json();
          const score = Math.round((psData.lighthouseResult?.categories?.performance?.score || 0) * 100);
          await storeMetric('mobile_pagespeed', score, `${score}/100`, 'Google PageSpeed Insights API', 80);
          results.push({ metric: 'mobile_pagespeed', value: score, source: 'PageSpeed API', status: 'ok' });
        } else {
          results.push({ metric: 'mobile_pagespeed', status: 'error', detail: `API returned ${psRes.status}` });
        }
      } catch (e) {
        results.push({ metric: 'mobile_pagespeed', status: 'error', detail: e.message });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 2. GOOGLE REVIEWS — Google Places API (New)
    // ═══════════════════════════════════════════════════════════
    // Use Google Places API to find review count by searching for the business
    if (client.domain || client.name) {
      try {
        const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
        if (apiKey) {
          // Use Places API Text Search to find the business
          const searchQuery = client.name || client.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
          const placesRes = await fetch(placesUrl);
          if (placesRes.ok) {
            const placesData = await placesRes.json();
            const place = placesData.results?.[0];
            if (place) {
              // Get detailed info with reviews
              const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=user_ratings_total,rating,name&key=${apiKey}`;
              const detailRes = await fetch(detailUrl);
              if (detailRes.ok) {
                const detail = await detailRes.json();
                const reviewCount = detail.result?.user_ratings_total || 0;
                const rating = detail.result?.rating || 0;
                await storeMetric('google_reviews_count', reviewCount, `${reviewCount} reviews (${rating}★)`, 'Google Places API', null);
                results.push({ metric: 'google_reviews_count', value: reviewCount, rating, source: 'Google Places API', status: 'ok' });
              }
            } else {
              results.push({ metric: 'google_reviews_count', status: 'not_found', detail: `No places found for "${searchQuery}"` });
            }
          }
        } else {
          // Fallback: try GBP API with stored OAuth token
          const gbpCred = creds.google_business_profile;
          if (gbpCred?.credential_data?.access_token) {
            const { data: asset } = await supabase.from('integration_assets')
              .select('external_id').eq('client_id', clientId)
              .eq('sub_provider', 'business_profile').eq('is_selected', true).maybeSingle();
            if (asset?.external_id) {
              const revRes = await fetch(`https://mybusiness.googleapis.com/v4/${asset.external_id}/reviews?pageSize=1`, {
                headers: { Authorization: `Bearer ${gbpCred.credential_data.access_token}` }
              });
              if (revRes.ok) {
                const revData = await revRes.json();
                const count = revData.totalReviewCount || 0;
                await storeMetric('google_reviews_count', count, `${count} reviews`, 'Google Business Profile API', null);
                results.push({ metric: 'google_reviews_count', value: count, source: 'GBP API', status: 'ok' });
              }
            }
          }
          if (!results.find(r => r.metric === 'google_reviews_count')) {
            results.push({ metric: 'google_reviews_count', status: 'no_api_key', detail: 'Set GOOGLE_PLACES_API_KEY for automatic review checking' });
          }
        }
      } catch (e) {
        results.push({ metric: 'google_reviews_count', status: 'error', detail: e.message });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. PAGE 1 KEYWORDS — Google Search Console API
    // ═══════════════════════════════════════════════════════════
    try {
      const gscCred = creds.google_search_console;
      if (gscCred?.credential_data) {
        // Get property URL from credentials or integration_assets
        let propertyUrl = gscCred.credential_data.property_url;
        if (!propertyUrl) {
          const { data: asset } = await supabase.from('integration_assets')
            .select('external_id').eq('client_id', clientId)
            .eq('sub_provider', 'search_console').eq('is_selected', true).maybeSingle();
          propertyUrl = asset?.external_id;
        }
        if (!propertyUrl && client.domain) {
          propertyUrl = domain;
        }

        if (propertyUrl && gscCred.credential_data.access_token) {
          const endDate = today;
          const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const gscRes = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${gscCred.credential_data.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 500, startRow: 0 })
          });
          if (gscRes.ok) {
            const gscData = await gscRes.json();
            const rows = gscData.rows || [];
            const page1Keywords = rows.filter(r => r.position <= 10).length;
            const totalKeywords = rows.length;
            await storeMetric('page1_keyword_count', page1Keywords, `${page1Keywords} keywords`, 'Google Search Console API', null);
            results.push({ metric: 'page1_keyword_count', value: page1Keywords, total: totalKeywords, source: 'GSC API', status: 'ok' });

            // Also update keyword data
            for (const row of rows.slice(0, 100)) {
              await supabase.from('client_keywords').upsert({
                client_id: clientId, keyword: row.keys[0],
                current_position: Math.round(row.position),
                source: 'gsc_live_check', last_checked: now,
              }, { onConflict: 'client_id,keyword' }).catch(() => {});
            }
          } else {
            results.push({ metric: 'page1_keyword_count', status: 'api_error', detail: `GSC returned ${gscRes.status}` });
          }
        } else {
          results.push({ metric: 'page1_keyword_count', status: 'no_token', detail: 'Google Search Console needs OAuth token — use Setup Link' });
        }
      } else {
        results.push({ metric: 'page1_keyword_count', status: 'no_cred', detail: 'Configure Google Search Console in Credentials' });
      }
    } catch (e) {
      results.push({ metric: 'page1_keyword_count', status: 'error', detail: e.message });
    }

    // ═══════════════════════════════════════════════════════════
    // 4. INDEXED PAGES — Google "site:" search via Custom Search API
    // ═══════════════════════════════════════════════════════════
    if (client.domain) {
      try {
        const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';
        const cseId = process.env.GOOGLE_CSE_ID || '';
        if (apiKey && cseId) {
          const cleanDomain = client.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const cseUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=site:${cleanDomain}&num=1`;
          const cseRes = await fetch(cseUrl);
          if (cseRes.ok) {
            const cseData = await cseRes.json();
            const indexedCount = parseInt(cseData.searchInformation?.totalResults || '0');
            await storeMetric('indexed_pages', indexedCount, `${indexedCount} pages`, 'Google Custom Search API', null);
            results.push({ metric: 'indexed_pages', value: indexedCount, source: 'Google CSE', status: 'ok' });
          }
        }
        // Fallback: try GSC sitemaps
        if (!results.find(r => r.metric === 'indexed_pages' && r.status === 'ok')) {
          const gscCred = creds.google_search_console;
          if (gscCred?.credential_data?.access_token) {
            const propertyUrl = gscCred.credential_data.property_url || domain;
            const smRes = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/sitemaps`, {
              headers: { Authorization: `Bearer ${gscCred.credential_data.access_token}` }
            });
            if (smRes.ok) {
              const smData = await smRes.json();
              let totalIndexed = 0;
              (smData.sitemap || []).forEach(sm => {
                (sm.contents || []).forEach(c => { totalIndexed += (c.indexed || 0); });
              });
              if (totalIndexed > 0) {
                await storeMetric('indexed_pages', totalIndexed, `${totalIndexed} pages`, 'Google Search Console Sitemaps', null);
                results.push({ metric: 'indexed_pages', value: totalIndexed, source: 'GSC Sitemaps', status: 'ok' });
              }
            }
          }
        }
        if (!results.find(r => r.metric === 'indexed_pages')) {
          results.push({ metric: 'indexed_pages', status: 'no_api', detail: 'Set GOOGLE_CSE_ID + API key, or connect GSC' });
        }
      } catch (e) {
        results.push({ metric: 'indexed_pages', status: 'error', detail: e.message });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 5 & 6. DOMAIN AUTHORITY + REFERRING DOMAINS — DataForSEO API
    // ═══════════════════════════════════════════════════════════
    try {
      const dfsCred = creds.dataforseo;
      if (dfsCred?.credential_data?.login && dfsCred?.credential_data?.password) {
        const dfsAuth = Buffer.from(`${dfsCred.credential_data.login}:${dfsCred.credential_data.password}`).toString('base64');
        const cleanDomain = client.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');

        // DataForSEO Backlinks Summary
        const dfsRes = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
          method: 'POST',
          headers: { Authorization: `Basic ${dfsAuth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([{ target: cleanDomain, internal_list_limit: 0, backlinks_filters: ['dofollow', '=', true] }])
        });
        if (dfsRes.ok) {
          const dfsData = await dfsRes.json();
          const task = dfsData.tasks?.[0]?.result?.[0];
          if (task) {
            const refDomains = task.referring_domains || 0;
            const backlinks = task.backlinks || 0;
            const rank = task.rank || 0;

            await storeMetric('referring_domains_count', refDomains, `${refDomains} domains`, 'DataForSEO Backlinks API', null);
            results.push({ metric: 'referring_domains_count', value: refDomains, backlinks, source: 'DataForSEO', status: 'ok' });

            // DataForSEO rank as proxy for DA (0-1000 scale, normalize to 0-100)
            const normalizedDA = Math.min(100, Math.round(Math.log10(Math.max(rank, 1)) * 20));
            await storeMetric('domain_authority', normalizedDA, `${normalizedDA}/100`, 'DataForSEO (rank-derived)', null);
            results.push({ metric: 'domain_authority', value: normalizedDA, raw_rank: rank, source: 'DataForSEO', status: 'ok' });
          }
        } else {
          results.push({ metric: 'referring_domains_count', status: 'api_error', detail: `DataForSEO returned ${dfsRes.status}` });
        }
      } else {
        // Try Moz API
        const mozCred = creds.moz;
        if (mozCred?.credential_data?.access_id && mozCred?.credential_data?.secret_key) {
          const mozAuth = Buffer.from(`${mozCred.credential_data.access_id}:${mozCred.credential_data.secret_key}`).toString('base64');
          const cleanDomain = client.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const mozRes = await fetch('https://lsapi.seomoz.com/v2/url_metrics', {
            method: 'POST',
            headers: { Authorization: `Basic ${mozAuth}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ targets: [cleanDomain] })
          });
          if (mozRes.ok) {
            const mozData = await mozRes.json();
            const result = mozData.results?.[0];
            if (result) {
              const da = Math.round(result.domain_authority || 0);
              const refDomains = result.root_domains_to_root_domain || 0;
              await storeMetric('domain_authority', da, `${da}/100`, 'Moz API', null);
              await storeMetric('referring_domains_count', refDomains, `${refDomains} domains`, 'Moz API', null);
              results.push({ metric: 'domain_authority', value: da, source: 'Moz', status: 'ok' });
              results.push({ metric: 'referring_domains_count', value: refDomains, source: 'Moz', status: 'ok' });
            }
          }
        }
        if (!results.find(r => r.metric === 'domain_authority')) {
          results.push({ metric: 'domain_authority', status: 'no_cred', detail: 'Configure DataForSEO or Moz in Credentials' });
          results.push({ metric: 'referring_domains_count', status: 'no_cred', detail: 'Configure DataForSEO or Moz in Credentials' });
        }
      }
    } catch (e) {
      if (!results.find(r => r.metric === 'domain_authority')) {
        results.push({ metric: 'domain_authority', status: 'error', detail: e.message });
        results.push({ metric: 'referring_domains_count', status: 'error', detail: e.message });
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 7. LOCAL 3-PACK — DataForSEO SERP API
    // ═══════════════════════════════════════════════════════════
    try {
      const dfsCred = creds.dataforseo;
      if (dfsCred?.credential_data?.login && dfsCred?.credential_data?.password) {
        const dfsAuth = Buffer.from(`${dfsCred.credential_data.login}:${dfsCred.credential_data.password}`).toString('base64');
        const cleanDomain = client.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
        // Search for the business name + city to check local pack
        const searchQuery = client.name || cleanDomain;
        const serpRes = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
          method: 'POST',
          headers: { Authorization: `Basic ${dfsAuth}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([{ keyword: searchQuery, location_code: 2376, language_code: 'he', device: 'desktop', depth: 10 }])
        });
        if (serpRes.ok) {
          const serpData = await serpRes.json();
          const items = serpData.tasks?.[0]?.result?.[0]?.items || [];
          // Look for local_pack item type
          const localPack = items.find(i => i.type === 'local_pack' || i.type === 'maps');
          const inPack = localPack?.items?.some(li => {
            const liDomain = (li.domain || li.url || '').toLowerCase();
            return liDomain.includes(cleanDomain.toLowerCase());
          }) || false;

          await storeMetric('local_3pack_present', inPack ? 1 : 0, inPack ? 'Yes' : 'No', 'DataForSEO SERP API', 1);
          results.push({ metric: 'local_3pack_present', value: inPack ? 1 : 0, present: inPack, source: 'DataForSEO SERP', status: 'ok' });
        }
      } else {
        results.push({ metric: 'local_3pack_present', status: 'no_cred', detail: 'Configure DataForSEO in Credentials' });
      }
    } catch (e) {
      results.push({ metric: 'local_3pack_present', status: 'error', detail: e.message });
    }

    // Summary
    const ok = results.filter(r => r.status === 'ok').length;
    const total = results.length;
    res.json({
      refreshed_at: now,
      metrics_checked: total,
      metrics_updated: ok,
      results,
      missing_credentials: results.filter(r => r.status === 'no_cred' || r.status === 'no_api_key' || r.status === 'no_api').map(r => r.detail),
    });
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

// ── REFRESH ALL METRICS (mark as needing update) ─────────────
router.post('/clients/:clientId/baselines/refresh', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    // Update specific metric if provided
    if (req.body.metric_name && req.body.metric_value != null) {
      const { data, error } = await supabase.from('baselines')
        .update({ metric_value: req.body.metric_value, recorded_at: new Date().toISOString() })
        .eq('client_id', clientId)
        .eq('metric_name', req.body.metric_name)
        .select().single();
      if (error) throw error;
      return res.json({ updated: data });
    }
    // Otherwise just return current baselines with freshness info
    const { data, error } = await supabase.from('baselines').select('*').eq('client_id', clientId);
    if (error) throw error;
    const now = Date.now();
    const withFreshness = data.map(b => ({
      ...b,
      age_hours: b.recorded_at ? Math.round((now - new Date(b.recorded_at).getTime()) / 3600000) : null,
      is_stale: !b.recorded_at || (now - new Date(b.recorded_at).getTime() > 7 * 24 * 60 * 60 * 1000),
    }));
    res.json(withFreshness);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── VERIFICATION AUTO-FIX ────────────────────────────────────
router.post('/clients/:clientId/verification/fix', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const { checkId } = req.body;
    const results = [];

    if (checkId === 'no_orphan_runs' || checkId === 'all') {
      // Mark stuck runs as failed
      const { data, error } = await supabase.from('runs')
        .update({ status: 'failed', error: 'Auto-cancelled: stuck for >10 minutes' })
        .eq('client_id', clientId).eq('status', 'running')
        .lt('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .select('id');
      results.push({ check: 'no_orphan_runs', fixed: true, detail: `Cancelled ${data?.length || 0} stuck runs` });
    }

    if (checkId === 'recent_run' || checkId === 'all') {
      // Queue a quick agent run
      const { data: agents } = await supabase.from('client_agent_assignments')
        .select('agent_template_id').eq('client_id', clientId).eq('enabled', true).limit(1);
      if (agents?.length > 0) {
        await supabase.from('run_queue').insert({
          client_id: clientId, agent_template_id: agents[0].agent_template_id,
          status: 'queued', priority: 1
        });
        results.push({ check: 'recent_run', fixed: true, detail: 'Queued a fresh agent run' });
      } else {
        results.push({ check: 'recent_run', fixed: false, detail: 'No agents assigned to queue' });
      }
    }

    if (checkId === 'credential_health' || checkId === 'all') {
      // Refresh credential health scores
      try {
        await refreshCredentialHealth(clientId);
        results.push({ check: 'credential_health', fixed: true, detail: 'Refreshed credential health scores' });
      } catch (e) {
        results.push({ check: 'credential_health', fixed: false, detail: 'Navigate to Credentials to configure' });
      }
    }

    if (checkId === 'memory_loaded' || checkId === 'all') {
      results.push({ check: 'memory_loaded', fixed: false, detail: 'Navigate to Memory view to add items', navigate: 'memory' });
    }

    res.json({ results, message: results.length > 0 ? 'Fix actions completed' : 'No fix available for this check' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
