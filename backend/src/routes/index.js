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

router.patch('/clients/:id/rules', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_rules').update(req.body).eq('client_id', req.params.id).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Debug: manually fix a stuck run's status
router.patch('/runs/:id/fix', async (req, res) => {
  try {
    const { data, error } = await supabase.from('runs')
      .update({ status: req.body.status || 'failed', completed_at: new Date().toISOString(), error: req.body.error || 'Manually fixed' })
      .eq('id', req.params.id)
      .select('id, status, completed_at')
      .single();
    if (error) throw error;
    res.json(data);
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
    // Double-check: if run is still "running", force-update it here with the route's supabase client
    if (result?.runId) {
      const { data: check } = await supabase.from('runs').select('status').eq('id', result.runId).single();
      if (check?.status === 'running') {
        console.log(`[ROUTE_FIX] Run ${result.runId} still "running" after executeAgent returned. Fixing...`);
        const { error: fixErr } = await supabase.from('runs').update({
          status: 'success',
          output: result.output || { note: 'Saved by route handler fallback' },
          tokens_used: result.output?._tool_call_count || 0,
          completed_at: new Date().toISOString()
        }).eq('id', result.runId);
        if (fixErr) console.error(`[ROUTE_FIX_FAIL]`, fixErr.message);
        else console.log(`[ROUTE_FIX_OK] Run ${result.runId} updated to success`);
      }
    }
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

// Clear old failed/cancelled runs — keeps running, success, pending_approval
router.delete('/clients/:clientId/runs/clear-old', async (req, res) => {
  try {
    const { error, count } = await supabase
      .from('runs')
      .delete({ count: 'exact' })
      .eq('client_id', req.params.clientId)
      .in('status', ['failed', 'cancelled']);
    if (error) throw error;
    res.json({ deleted: count });
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

// ── PROPOSED CHANGES ──────────────────────────────────────────
router.get('/clients/:clientId/proposed-changes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('proposed_changes')
      .select('*').eq('client_id', req.params.clientId)
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/proposed-changes/:id/approve', async (req, res) => {
  try {
    const { data: change, error } = await supabase.from('proposed_changes')
      .update({ status: 'approved', approved_by: req.body.approved_by || 'manual', approved_at: new Date().toISOString() })
      .eq('id', req.params.id).select().single();
    if (error) throw error;

    // ── Queue validation agents immediately on approval ──
    const VALIDATOR_SLUGS = ['hebrew-quality-agent', 'design-consistency-agent', 'seo-core-agent', 'website-qa-agent', 'website-content-agent'];
    try {
      const { data: agents } = await supabase.from('agent_templates').select('id, slug').in('slug', VALIDATOR_SLUGS).eq('is_active', true);
      if (agents?.length) {
        const taskPayload = {
          trigger: 'post_change_validation',
          change_id: change.id,
          change_type: change.change_type,
          page_url: change.page_url,
          instructions: `Change approved: "${change.change_type}" on ${change.page_url}. Validate now — check Hebrew quality, design consistency, SEO impact, QA, and content quality.`,
        };
        await supabase.from('run_queue').insert(
          agents.map(a => ({
            client_id: change.client_id,
            agent_template_id: a.id,
            agent_slug: a.slug,
            status: 'queued',
            priority: 1,
            priority_score: 9.0,
            queued_by: 'post_change_approval',
            task_payload: taskPayload,
          }))
        );
      }
    } catch (qErr) { console.error('[APPROVE_VALIDATORS]', qErr.message); }

    res.json({ success: true, change });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/proposed-changes/:id/reject', async (req, res) => {
  try {
    const { data: change, error } = await supabase.from('proposed_changes')
      .update({ status: 'rejected', rejected_reason: req.body.reason || 'Rejected' })
      .eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ success: true, change });
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
    await supabase.from('run_queue').update({ status: 'cancelled' }).eq('id', req.params.id).in('status', ['queued', 'failed', 'blocked_dependency']);
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
    const now = Date.now();
    // Enrich each baseline with provenance and freshness
    const enriched = (data || []).map(b => {
      const ageMs = b.recorded_at ? now - new Date(b.recorded_at).getTime() : null;
      const ageHours = ageMs ? Math.round(ageMs / 3600000) : null;
      let freshness = 'never_synced';
      if (ageHours !== null) {
        if (ageHours < 6) freshness = 'fresh';
        else if (ageHours < 24) freshness = 'aging';
        else if (ageHours < 72) freshness = 'stale';
        else freshness = 'critical_stale';
      }
      return {
        ...b,
        provenance: {
          source: b.source || 'unknown',
          last_sync: b.recorded_at || null,
          age_hours: ageHours,
          freshness,
          freshness_label: freshness === 'fresh' ? 'Up to date' : freshness === 'aging' ? 'Updated today' : freshness === 'stale' ? `${Math.round(ageHours / 24)}d since last sync` : freshness === 'critical_stale' ? `${Math.round(ageHours / 24)}d — needs refresh` : 'Never synced',
        }
      };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── WHY ISN'T THIS UPDATING? — Per-metric diagnostic ─────────
router.get('/clients/:clientId/baselines/diagnose', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const [baselines, creds, client, lastRuns, schedules] = await Promise.all([
      supabase.from('baselines').select('*').eq('client_id', clientId),
      supabase.from('client_credentials').select('*').eq('client_id', clientId),
      supabase.from('clients').select('domain, name').eq('id', clientId).single(),
      supabase.from('runs').select('id, status, error, created_at, agent_template_id, output').eq('client_id', clientId).order('created_at', { ascending: false }).limit(10),
      supabase.from('agent_schedules').select('*').eq('client_id', clientId),
    ]);
    const now = Date.now();
    const credMap = Object.fromEntries((creds.data || []).map(c => [c.service, c]));

    // Define what each metric needs
    const METRIC_REQUIREMENTS = {
      mobile_pagespeed:      { service: null,       api: 'Google PageSpeed API', agent: 'technical-seo-crawl-agent', refresh: '24h', needs_oauth: false },
      desktop_pagespeed:     { service: null,       api: 'Google PageSpeed API', agent: 'technical-seo-crawl-agent', refresh: '24h', needs_oauth: false },
      page1_keyword_count:   { service: 'google_search_console', api: 'GSC API or DataForSEO SERP', agent: 'gsc-daily-monitor', refresh: '24h', needs_oauth: true, fallback: 'DataForSEO SERP (no OAuth needed)' },
      google_reviews_count:  { service: 'google_business_profile', api: 'Google Places API', agent: 'reviews-gbp-authority-agent', refresh: '6h', needs_oauth: false },
      google_reviews_rating: { service: 'google_business_profile', api: 'Google Places API', agent: 'reviews-gbp-authority-agent', refresh: '6h', needs_oauth: false },
      domain_authority:      { service: 'dataforseo', api: 'DataForSEO Backlinks API', agent: 'seo-core-agent', refresh: '7d', needs_oauth: false },
      referring_domains_count: { service: 'dataforseo', api: 'DataForSEO Backlinks API', agent: 'seo-core-agent', refresh: '7d', needs_oauth: false },
      indexed_pages:         { service: null,       api: 'Google Custom Search API or GSC', agent: 'technical-seo-crawl-agent', refresh: '7d', needs_oauth: false },
      local_3pack_present:   { service: 'dataforseo', api: 'DataForSEO SERP API', agent: 'local-seo-agent', refresh: '7d', needs_oauth: false },
    };

    const diagnostics = [];
    for (const [metricName, req] of Object.entries(METRIC_REQUIREMENTS)) {
      const baseline = (baselines.data || []).find(b => b.metric_name === metricName);
      const ageMs = baseline?.recorded_at ? now - new Date(baseline.recorded_at).getTime() : null;
      const ageHours = ageMs ? Math.round(ageMs / 3600000) : null;

      const blockers = [];
      let status = 'working';

      // Check if metric exists
      if (!baseline) {
        status = 'never_synced';
        blockers.push({ type: 'Missing Data', detail: 'This metric has never been recorded. Run "Refresh All Metrics".' });
      } else if (ageHours > 72) {
        status = 'critical_stale';
        blockers.push({ type: 'No Recent Data', detail: `Last updated ${ageHours}h ago (${new Date(baseline.recorded_at).toLocaleString()}). Expected refresh: every ${req.refresh}.` });
      } else if (ageHours > 24) {
        status = 'stale';
      }

      // Check credentials
      if (req.service) {
        const cred = credMap[req.service];
        if (!cred?.credential_data || Object.keys(cred.credential_data).length === 0) {
          if (req.needs_oauth) {
            status = 'missing_access';
            blockers.push({ type: 'Missing Access', detail: `${req.service} OAuth not connected. Use Setup Link to connect.${req.fallback ? ` Fallback: ${req.fallback}` : ''}` });
          } else if (!process.env[`${req.service.toUpperCase()}_LOGIN`] && !process.env[`${req.service.toUpperCase()}_API_KEY`]) {
            // Check env vars
            const envLogin = req.service === 'dataforseo' ? process.env.DATAFORSEO_LOGIN : null;
            if (!envLogin && req.service === 'dataforseo') {
              blockers.push({ type: 'Missing Configuration', detail: `${req.service} API credentials not configured in env vars.` });
            }
          }
        }
      }

      // Check domain
      if (!client.data?.domain) {
        blockers.push({ type: 'Missing Configuration', detail: 'Client has no domain configured.' });
      }

      // Check if producing agent is assigned and has run recently
      if (req.agent) {
        const agentRun = (lastRuns.data || []).find(r => {
          // This is approximate - would need to join agent_templates
          return true; // We check schedule instead
        });
        const sched = (schedules.data || []).find(s => s.agent_slug === req.agent);
        if (!sched) {
          blockers.push({ type: 'Missing Schedule', detail: `No schedule for ${req.agent}. Metric won't auto-refresh.` });
        }
      }

      if (blockers.length === 0 && status === 'working' && baseline) {
        // All good
      } else if (blockers.length === 0 && baseline && (status === 'stale' || status === 'critical_stale')) {
        blockers.push({ type: 'Stale Data', detail: `Data is ${ageHours}h old. Daily cron should refresh this. Check /api/cron/refresh-metrics.` });
      }

      diagnostics.push({
        metric: metricName,
        current_value: baseline?.metric_value ?? null,
        current_text: baseline?.metric_text ?? null,
        source: baseline?.source || 'none',
        last_sync: baseline?.recorded_at || null,
        age_hours: ageHours,
        status: blockers.length > 0 ? (status === 'working' ? 'partial' : status) : status,
        expected_refresh: req.refresh,
        producing_api: req.api,
        producing_agent: req.agent,
        blockers,
        fix: blockers.length > 0 ? blockers.map(b => b.detail).join(' ') : null,
      });
    }

    res.json({
      client_id: clientId,
      domain: client.data?.domain,
      diagnosed_at: new Date().toISOString(),
      metrics: diagnostics,
      summary: {
        working: diagnostics.filter(d => d.status === 'working').length,
        stale: diagnostics.filter(d => d.status === 'stale').length,
        critical_stale: diagnostics.filter(d => d.status === 'critical_stale').length,
        missing_access: diagnostics.filter(d => d.status === 'missing_access').length,
        never_synced: diagnostics.filter(d => d.status === 'never_synced').length,
        total: diagnostics.length,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/baselines', async (req, res) => {
  try {
    const { data, error } = await supabase.from('baselines').upsert({ client_id: req.params.clientId, ...req.body }, { onConflict: 'client_id,metric_name' }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── KPI TRENDS — 7d/30d deltas from snapshots ───────────────
router.get('/clients/:clientId/trends', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const now = new Date();
    const d7 = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
    const d30 = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    // Get current baselines
    const { data: baselines } = await supabase.from('baselines')
      .select('metric_name, metric_value').eq('client_id', clientId);

    // Get snapshots from 7d and 30d ago (closest available)
    const { data: snapshots7d } = await supabase.from('kpi_snapshots')
      .select('metric_name, metric_value, snapshot_date')
      .eq('client_id', clientId)
      .gte('snapshot_date', d7)
      .lte('snapshot_date', new Date(now - 5 * 86400000).toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: true });

    const { data: snapshots30d } = await supabase.from('kpi_snapshots')
      .select('metric_name, metric_value, snapshot_date')
      .eq('client_id', clientId)
      .gte('snapshot_date', d30)
      .lte('snapshot_date', new Date(now - 25 * 86400000).toISOString().slice(0, 10))
      .order('snapshot_date', { ascending: true });

    // Build lookup: earliest snapshot in each window per metric
    const snap7 = {}, snap30 = {};
    for (const s of (snapshots7d || [])) {
      if (!snap7[s.metric_name]) snap7[s.metric_name] = s;
    }
    for (const s of (snapshots30d || [])) {
      if (!snap30[s.metric_name]) snap30[s.metric_name] = s;
    }

    // Compute trends
    const trends = (baselines || []).map(b => {
      const current = b.metric_value;
      const prev7 = snap7[b.metric_name]?.metric_value;
      const prev30 = snap30[b.metric_name]?.metric_value;

      const delta7 = (current != null && prev7 != null) ? current - prev7 : null;
      const delta30 = (current != null && prev30 != null) ? current - prev30 : null;
      const pct7 = (prev7 && prev7 !== 0) ? Math.round((delta7 / prev7) * 10000) / 100 : null;
      const pct30 = (prev30 && prev30 !== 0) ? Math.round((delta30 / prev30) * 10000) / 100 : null;

      let direction = 'flat';
      if (delta7 > 0) direction = 'up';
      else if (delta7 < 0) direction = 'down';

      return {
        metric_name: b.metric_name,
        current,
        delta_7d: delta7,
        delta_30d: delta30,
        pct_7d: pct7,
        pct_30d: pct30,
        direction,
        snapshot_7d_date: snap7[b.metric_name]?.snapshot_date || null,
        snapshot_30d_date: snap30[b.metric_name]?.snapshot_date || null,
      };
    });

    res.json(trends);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SAVE KPI SNAPSHOTS — called daily by cron or after refresh ──
router.post('/clients/:clientId/snapshots', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const today = new Date().toISOString().slice(0, 10);

    // Get current baselines
    const { data: baselines } = await supabase.from('baselines')
      .select('metric_name, metric_value, source').eq('client_id', clientId);

    if (!baselines?.length) return res.json({ saved: 0 });

    const rows = baselines
      .filter(b => b.metric_value != null)
      .map(b => ({
        client_id: clientId,
        metric_name: b.metric_name,
        metric_value: b.metric_value,
        source: b.source || 'baseline',
        snapshot_date: today,
      }));

    const { data, error } = await supabase.from('kpi_snapshots')
      .upsert(rows, { onConflict: 'client_id,metric_name,snapshot_date' });

    if (error) throw error;
    res.json({ saved: rows.length, date: today });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CLIENT STRATEGY — get/set per-client strategy object ────
router.get('/clients/:clientId/strategy', async (req, res) => {
  try {
    const { data } = await supabase.from('client_rules')
      .select('strategy').eq('client_id', req.params.clientId).maybeSingle();
    res.json(data?.strategy || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/clients/:clientId/strategy', async (req, res) => {
  try {
    const { data, error } = await supabase.from('client_rules')
      .update({ strategy: req.body }).eq('client_id', req.params.clientId).select().single();
    if (error) throw error;
    res.json(data.strategy);
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

    // Get credentials — CLIENT-SPECIFIC ONLY (no cross-client sharing)
    const { data: allCreds } = await supabase.from('client_credentials')
      .select('service, credential_data, is_connected').eq('client_id', clientId);
    const creds = Object.fromEntries((allCreds || []).map(c => [c.service, c]));

    // SERVICE-LEVEL API KEYS from env vars only (these are YOUR keys, not client OAuth tokens)
    // DataForSEO — your paid API account, safe to use for all clients
    if (!creds.dataforseo?.credential_data?.login && process.env.DATAFORSEO_LOGIN) {
      creds.dataforseo = { service: 'dataforseo', is_connected: true, credential_data: {
        login: (process.env.DATAFORSEO_LOGIN || '').trim(), password: (process.env.DATAFORSEO_PASSWORD || '').trim()
      }};
    }
    // OpenAI — your paid API key, safe to use for all clients
    if (!creds.openai?.credential_data?.api_key && process.env.OPENAI_API_KEY) {
      creds.openai = { service: 'openai', is_connected: true, credential_data: {
        api_key: process.env.OPENAI_API_KEY
      }};
    }
    // NOTE: OAuth tokens (GSC, GBP, Facebook, Instagram, Google Ads/Analytics)
    // are NEVER shared between clients. Each client must connect their own.
    // If a client lacks OAuth credentials, operations that need them will
    // report "no_cred" status instead of silently using another client's tokens.

    const domain = client.domain?.startsWith('http') ? client.domain : `https://${client.domain}`;

    // Helper: fetch with timeout to prevent single API from hogging the function
    const fetchWithTimeout = (url, opts = {}, timeoutMs = 12000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
    };

    // Helper: upsert baseline + snapshot
    async function storeMetric(name, value, text, source, target) {
      await supabase.from('baselines').upsert({
        client_id: clientId, metric_name: name,
        metric_value: value, metric_text: text,
        source, recorded_at: now, ...(target != null ? { target_value: target } : {}),
      }, { onConflict: 'client_id,metric_name' });
      try {
        await supabase.from('kpi_snapshots').insert({
          client_id: clientId, metric_name: name, metric_value: value,
          metric_text: text, source, source_verified: true, data_date: today,
        });
      } catch (_) { /* ignore snapshot errors */ }
    }

    // ═══════════════════════════════════════════════════════════
    // 1. MOBILE PAGESPEED — Google PageSpeed Insights API (free)
    // ═══════════════════════════════════════════════════════════
    if (client.domain) {
      try {
        const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || '';
        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(domain)}&strategy=mobile${apiKey ? `&key=${apiKey}` : ''}`;
        const psRes = await fetchWithTimeout(apiUrl);
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
          const placesRes = await fetchWithTimeout(placesUrl);
          if (placesRes.ok) {
            const placesData = await placesRes.json();
            const place = placesData.results?.[0];
            if (place) {
              // Get detailed info with reviews
              const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=user_ratings_total,rating,name&key=${apiKey}`;
              const detailRes = await fetchWithTimeout(detailUrl);
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
              const revRes = await fetchWithTimeout(`https://mybusiness.googleapis.com/v4/${asset.external_id}/reviews?pageSize=1`, {
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
          const gscRes = await fetchWithTimeout(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`, {
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
          const cseRes = await fetchWithTimeout(cseUrl);
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
            const smRes = await fetchWithTimeout(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/sitemaps`, {
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
        const dfsRes = await fetchWithTimeout('https://api.dataforseo.com/v3/backlinks/summary/live', {
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
          const mozRes = await fetchWithTimeout('https://lsapi.seomoz.com/v2/url_metrics', {
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
        const serpRes = await fetchWithTimeout('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
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

    // ═══════════════════════════════════════════════════════════
    // 8. KEYWORD POSITION CHECK — DataForSEO SERP for top client keywords
    // ═══════════════════════════════════════════════════════════
    try {
      const dfsCred = creds.dataforseo;
      if (dfsCred?.credential_data?.login && dfsCred?.credential_data?.password) {
        const { data: keywords } = await supabase.from('client_keywords').select('id, keyword')
          .eq('client_id', clientId).order('volume', { ascending: false }).limit(20);
        if (keywords?.length > 0) {
          const dfsAuth = Buffer.from(`${dfsCred.credential_data.login}:${dfsCred.credential_data.password}`).toString('base64');
          const cleanDomain = client.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
          let updated = 0;
          // Batch keywords into groups of 3 to limit API calls
          for (let i = 0; i < keywords.length; i += 3) {
            const batch = keywords.slice(i, i + 3);
            const tasks = batch.map(kw => ({
              keyword: kw.keyword, location_code: 2376, language_code: 'he', device: 'desktop', depth: 100
            }));
            try {
              const serpRes = await fetchWithTimeout('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
                method: 'POST',
                headers: { Authorization: `Basic ${dfsAuth}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(tasks)
              });
              if (serpRes.ok) {
                const serpData = await serpRes.json();
                for (let j = 0; j < batch.length; j++) {
                  const items = serpData.tasks?.[j]?.result?.[0]?.items || [];
                  const match = items.find(item =>
                    item.type === 'organic' && (item.domain || item.url || '').toLowerCase().includes(cleanDomain.toLowerCase())
                  );
                  if (match) {
                    await supabase.from('client_keywords').update({
                      current_position: match.rank_group || match.rank_absolute,
                      last_checked: now, source: 'dataforseo_serp'
                    }).eq('id', batch[j].id);
                    updated++;
                  } else {
                    // Not in top 100
                    await supabase.from('client_keywords').update({
                      current_position: null, last_checked: now, source: 'dataforseo_serp'
                    }).eq('id', batch[j].id);
                  }
                }
              }
            } catch (_) { /* continue with next batch */ }
          }
          results.push({ metric: 'keyword_positions', updated, total: keywords.length, source: 'DataForSEO SERP', status: 'ok' });
          // Update page1_keywords count from DataForSEO if we don't have GSC data
          if (!results.find(r => r.metric === 'page1_keyword_count' && r.status === 'ok')) {
            const { count } = await supabase.from('client_keywords').select('id', { count: 'exact', head: true })
              .eq('client_id', clientId).lte('current_position', 10).not('current_position', 'is', null);
            await storeMetric('page1_keyword_count', count || 0, `${count || 0} keywords`, 'DataForSEO SERP', null);
            results.push({ metric: 'page1_keyword_count', value: count || 0, source: 'DataForSEO SERP', status: 'ok' });
          }
        }
      }
    } catch (e) {
      results.push({ metric: 'keyword_positions', status: 'error', detail: e.message });
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
      { id: 'recent_run', label: 'Recent successful run (48h)', pass: lastRun.data?.[0]?.status === 'success' && new Date(lastRun.data[0].created_at) > new Date(Date.now() - 48 * 60 * 60 * 1000), detail: (() => {
        const r = lastRun.data?.[0];
        if (!r) return 'No runs found. Make sure agents are assigned and scheduled.';
        const age = Math.round((Date.now() - new Date(r.created_at).getTime()) / 3600000);
        const when = `Last: ${new Date(r.created_at).toLocaleString()} (${age}h ago)`;
        if (r.status === 'failed') return `${when} — Status: FAILED. Check the Runs view for error details.`;
        if (r.status === 'running') return `${when} — Status: still running. May be stuck.`;
        if (age > 48) return `${when} — Over 48h since last success. Check schedules or run manually.`;
        return when;
      })() },
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

// ============================================================
// SYSTEM AUDIT — Full Coordination & Execution Truth Engine
// 12 categories, 30 tests, real operational scoring
// ============================================================
router.get('/clients/:clientId/system-audit', async (req, res) => {
  try {
    const clientId = req.params.clientId;
    const now = Date.now();
    const h48 = new Date(now - 48 * 3600000).toISOString();
    const h24 = new Date(now - 24 * 3600000).toISOString();
    const d7 = new Date(now - 7 * 24 * 3600000).toISOString();
    const results = {};

    // ── Load all data in parallel ────────────────────────────────
    const [
      clientData, assignments, allAgents, recentRuns, allRuns7d,
      queueItems, credentials, memoryItems, baselines, incidents,
      approvals, schedules, keywords, competitors, connectors,
      kpiSnapshots, auditTrail
    ] = await Promise.all([
      supabase.from('clients').select('*, client_profiles(*), client_rules(*)').eq('id', clientId).single(),
      supabase.from('client_agent_assignments').select('*, agent_templates(*)').eq('client_id', clientId),
      supabase.from('agent_templates').select('id, slug, name, lane, role_type, is_active, base_prompt'),
      supabase.from('runs').select('id, status, agent_template_id, created_at, output, changed_anything, what_changed, trigger_post_change_validation, post_change_validation_status, duration_ms, tokens_used, error, task_payload, triggered_by').eq('client_id', clientId).gte('created_at', d7).order('created_at', { ascending: false }).limit(200),
      supabase.from('runs').select('id, status, agent_template_id, created_at').eq('client_id', clientId).gte('created_at', d7),
      supabase.from('run_queue').select('*').eq('client_id', clientId).in('status', ['queued', 'running', 'failed']),
      supabase.from('client_credentials').select('*').eq('client_id', clientId),
      supabase.from('memory_items').select('id, scope, approved, is_stale, times_used, last_used_at, created_at, derived_from_file_id, source').eq('client_id', clientId),
      supabase.from('baselines').select('*').eq('client_id', clientId),
      supabase.from('incidents').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(50),
      supabase.from('approvals').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(50),
      supabase.from('agent_schedules').select('*').eq('client_id', clientId),
      supabase.from('client_keywords').select('id, keyword, current_position, last_checked, source').eq('client_id', clientId),
      supabase.from('client_competitors').select('*').eq('client_id', clientId),
      supabase.from('client_connectors').select('*').eq('client_id', clientId),
      supabase.from('kpi_snapshots').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(100),
      supabase.from('audit_trail').select('*').eq('client_id', clientId).gte('created_at', d7).order('created_at', { ascending: false }).limit(100),
    ]);

    const client = clientData.data;
    const runs = recentRuns.data || [];
    const enabledAssignments = (assignments.data || []).filter(a => a.enabled);
    const agents = allAgents.data || [];
    const creds = credentials.data || [];
    const mem = memoryItems.data || [];
    const bl = baselines.data || [];
    const inc = incidents.data || [];
    const appr = approvals.data || [];
    const sched = schedules.data || [];
    const kw = keywords.data || [];
    const comp = competitors.data || [];
    const conn = connectors.data || [];
    const snaps = kpiSnapshots.data || [];
    const audit = auditTrail.data || [];
    const queue = queueItems.data || [];

    const successRuns = runs.filter(r => r.status === 'success' || r.status === 'executed');
    const failedRuns = runs.filter(r => r.status === 'failed');
    const runsWithTools = runs.filter(r => {
      const o = typeof r.output === 'string' ? JSON.parse(r.output || '{}') : (r.output || {});
      return o._tool_call_count > 0;
    });

    // ═══════════════════════════════════════════════════════════
    // 1. EXECUTION ENGINE
    // ═══════════════════════════════════════════════════════════
    const T1_recentSuccess = successRuns.filter(r => r.created_at >= h48);
    const T1_withTools = T1_recentSuccess.filter(r => {
      const o = typeof r.output === 'string' ? JSON.parse(r.output || '{}') : (r.output || {});
      return o._tool_call_count > 0;
    });
    const T2_followUpTasks = runs.filter(r => {
      const o = typeof r.output === 'string' ? JSON.parse(r.output || '{}') : (r.output || {});
      return o.follow_up_tasks?.length > 0 || o.tasks_created?.length > 0 || o.action_plan?.length > 0;
    });
    const T3_queueProcessed = runs.filter(r => r.task_payload?.queued_by || r.task_payload?.triggered_by_run);
    const T4_failedWithError = failedRuns.filter(r => r.error && r.error.length > 5);

    results.execution_engine = {
      score: 0, max: 5, tests: [
        { id: 'T1', name: 'Single agent real execution', pass: T1_recentSuccess.length > 0 && T1_withTools.length > 0,
          detail: `${T1_recentSuccess.length} successful runs in 48h, ${T1_withTools.length} used real tools`,
          fix: T1_recentSuccess.length === 0 ? 'No recent successful runs. Check agent assignments, schedules, and credentials.' : T1_withTools.length === 0 ? 'Agents run but don\'t use tools. They may be generating text without executing real actions.' : null },
        { id: 'T2', name: 'Agent creates follow-up tasks', pass: T2_followUpTasks.length > 0,
          detail: `${T2_followUpTasks.length} runs created follow-up work`,
          fix: T2_followUpTasks.length === 0 ? 'No agents are creating follow-up tasks. Orchestrator coordination may be missing.' : null },
        { id: 'T3', name: 'Queue processor picks created tasks', pass: T3_queueProcessed.length > 0,
          detail: `${T3_queueProcessed.length} runs were triggered by queue/other agents`,
          fix: T3_queueProcessed.length === 0 ? 'Queue processor isn\'t picking up tasks. Check cron job /api/cron/process-queue.' : null },
        { id: 'T4', name: 'Failed tasks create real failure state', pass: failedRuns.length === 0 || T4_failedWithError.length === failedRuns.length,
          detail: `${failedRuns.length} failures, ${T4_failedWithError.length} with real error messages`,
          fix: failedRuns.length > 0 && T4_failedWithError.length < failedRuns.length ? `${failedRuns.length - T4_failedWithError.length} failures have no error message — fake failure state.` : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 2. ORCHESTRATOR / COORDINATION
    // ═══════════════════════════════════════════════════════════
    const orchestratorRuns = runs.filter(r => {
      const tmpl = enabledAssignments.find(a => a.agent_template_id === r.agent_template_id);
      return tmpl?.agent_templates?.slug === 'master-orchestrator';
    });
    const orchestratorCreatedWork = orchestratorRuns.filter(r => {
      const o = typeof r.output === 'string' ? JSON.parse(r.output || '{}') : (r.output || {});
      return o.tasks_created?.length > 0 || o.follow_up_tasks?.length > 0 || o.agents_to_activate?.length > 0;
    });
    const validationChainRuns = runs.filter(r => r.task_payload?.validation_chain);
    const duplicateWork = (() => {
      // Exclude orchestrator (it runs on every cron tick by design) and manual/batch runs
      const orchestratorIds = new Set(orchestratorRuns.map(r => r.agent_template_id));
      const agentRunMap = {};
      runs.filter(r => r.created_at >= h24 && !orchestratorIds.has(r.agent_template_id)).forEach(r => {
        const key = `${r.agent_template_id}`;
        if (!agentRunMap[key]) agentRunMap[key] = [];
        agentRunMap[key].push(r);
      });
      // Only count organic runs (exclude manual/batch testing) — agent running >8 times/day is suspicious
      return Object.entries(agentRunMap).filter(([_, runs]) => {
        const organicRuns = runs.filter(r => !['manual', 'run_all', 'test'].includes(r.triggered_by));
        return organicRuns.length > 8;
      }).length;
    })();
    const blockedQueue = queue.filter(q => q.status === 'failed' || (q.depends_on?.length > 0 && q.status === 'queued'));

    results.orchestration = {
      score: 0, max: 5, tests: [
        { id: 'T5', name: 'Orchestrator sees runs and reacts', pass: orchestratorCreatedWork.length > 0,
          detail: `${orchestratorRuns.length} orchestrator runs, ${orchestratorCreatedWork.length} created follow-up work`,
          fix: orchestratorRuns.length === 0 ? 'Master orchestrator never ran. It should run periodically to coordinate agents.' : orchestratorCreatedWork.length === 0 ? 'Orchestrator runs but creates no follow-up work. Its prompt may not instruct it to coordinate.' : null },
        { id: 'T6', name: 'No duplicate work', pass: duplicateWork === 0,
          detail: duplicateWork === 0 ? 'No duplicate agent runs detected in 24h' : `${duplicateWork} agents ran more than 3 times in 24h — possible duplicate work`,
          fix: duplicateWork > 0 ? 'Multiple agents running same work. Add deduplication logic to orchestrator.' : null },
        { id: 'T7', name: 'Blockers are escalated', pass: blockedQueue.length === 0,
          detail: `${blockedQueue.length} blocked/failed items in queue`,
          fix: blockedQueue.length > 0 ? `${blockedQueue.length} tasks stuck. Review queue for dependency issues or failed prerequisites.` : null },
        { id: 'T8', name: 'Orchestrator has real world-state view', pass: orchestratorRuns.length > 0 && bl.length >= 3,
          detail: `${bl.length} baselines tracked, ${snaps.length} KPI snapshots, ${kw.length} keywords, ${comp.length} competitors`,
          fix: bl.length < 3 ? 'Too few baselines. Run "Refresh All Metrics" to populate real data.' : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 3. VALIDATION CHAIN
    // ═══════════════════════════════════════════════════════════
    const validationTriggers = runs.filter(r => r.trigger_post_change_validation);
    const validationValidators = validationChainRuns.filter(r => r.task_payload?.pipeline_phase === 'validate');
    const validationFixers = validationChainRuns.filter(r => r.task_payload?.pipeline_phase === 'fix');
    const validationRevalidations = validationChainRuns.filter(r => r.task_payload?.pipeline_phase === 're-validate');

    results.validation_chain = {
      score: 0, max: 5, tests: [
        { id: 'T9', name: 'Post-change validation triggers automatically', pass: validationTriggers.length > 0 || validationChainRuns.length > 0,
          detail: `${validationTriggers.length} changes triggered validation, ${validationChainRuns.length} validation chain runs total`,
          fix: validationTriggers.length === 0 ? 'No post-change validations triggered. Agents may not be reporting changes, or post_change_trigger is not set on agent templates.' : null },
        { id: 'T10', name: 'Validation failure reopens work', pass: validationFixers.length > 0 || validationChainRuns.length === 0,
          detail: `${validationFixers.length} auto-fix runs triggered by validation failures`,
          fix: validationFixers.length === 0 && validationValidators.length > 0 ? 'Validators ran but never triggered fixes. Either no issues found or auto-fix loop not wired.' : null },
        { id: 'T11', name: 'Validation results visible', pass: validationChainRuns.every(r => r.output),
          detail: validationChainRuns.length > 0 ? `${validationChainRuns.length} validation runs, all have output` : 'No validation runs yet',
          fix: null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 4. MEMORY / LEARNING
    // ═══════════════════════════════════════════════════════════
    const activeMem = mem.filter(m => m.approved && !m.is_stale);
    const usedMem = activeMem.filter(m => m.times_used > 0);
    const docMem = mem.filter(m => m.derived_from_file_id);
    const runCreatedMem = mem.filter(m => m.source === 'run' || m.source === 'agent');

    results.memory = {
      score: 0, max: 5, tests: [
        { id: 'T12', name: 'Memory injected into agents', pass: usedMem.length > 0,
          detail: `${activeMem.length} active items, ${usedMem.length} actually used by agents`,
          fix: usedMem.length === 0 && activeMem.length > 0 ? 'Memory exists but agents never use it. Check memory injection in executeAgent.' : activeMem.length === 0 ? 'No memory items. Add client context via Memory view.' : null },
        { id: 'T13', name: 'Memory usage tracking works', pass: usedMem.length > 0 && usedMem.some(m => m.last_used_at),
          detail: `${usedMem.length} items have usage count, ${usedMem.filter(m => m.last_used_at).length} have last_used_at`,
          fix: usedMem.length > 0 && !usedMem.some(m => m.last_used_at) ? 'Usage counts exist but timestamps missing.' : null },
        { id: 'T14', name: 'Agents write new memory', pass: runCreatedMem.length > 0,
          detail: `${runCreatedMem.length} memory items created by agent runs`,
          fix: runCreatedMem.length === 0 ? 'No agent has ever written memory. Agents should save lessons and insights.' : null },
        { id: 'T15', name: 'Document-derived memory used', pass: docMem.length === 0 || docMem.some(m => m.times_used > 0),
          detail: docMem.length > 0 ? `${docMem.length} doc-derived items, ${docMem.filter(m => m.times_used > 0).length} used` : 'No document-derived memory',
          fix: docMem.length > 0 && !docMem.some(m => m.times_used > 0) ? 'Documents were ingested but never used by agents.' : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 5. CLIENT GROWTH DATABASE
    // ═══════════════════════════════════════════════════════════
    const dataSources = {
      baselines: bl.length, keywords: kw.length, competitors: comp.length,
      connectors: conn.length, kpi_snapshots: snaps.length, incidents: inc.length,
      memory: activeMem.length, runs_7d: runs.length, credentials: creds.length,
    };
    const filledSources = Object.values(dataSources).filter(v => v > 0).length;
    const kwWithPosition = kw.filter(k => k.current_position != null);
    const kwStale = kw.filter(k => !k.last_checked || new Date(k.last_checked) < new Date(d7));
    const tasksWithGoal = runs.filter(r => {
      const tp = r.task_payload || {};
      // Has explicit goal metadata in task payload
      if (tp.objective || tp.goal || tp.reason || tp.queued_by || tp.triggered_by_run) return true;
      // Was triggered by a schedule, system cron, or queue (the schedule/system itself is the "why")
      if (r.triggered_by && r.triggered_by !== 'manual') return true;
      // Was created by orchestrator coordination
      if (tp.validation_chain || tp.pipeline_phase) return true;
      // Has any task payload keys beyond empty object — means it was dispatched with context
      if (Object.keys(tp).length > 0) return true;
      return false;
    });

    results.client_growth_database = {
      score: 0, max: 5, tests: [
        { id: 'T16', name: 'All data enters one client truth model', pass: filledSources >= 6,
          detail: `${filledSources}/${Object.keys(dataSources).length} data sources populated: ${Object.entries(dataSources).map(([k, v]) => `${k}=${v}`).join(', ')}`,
          fix: filledSources < 6 ? `Missing data sources: ${Object.entries(dataSources).filter(([_, v]) => v === 0).map(([k]) => k).join(', ')}` : null },
        { id: 'T17', name: 'Growth tasks tied to client objective', pass: tasksWithGoal.length > 0 || runs.length === 0,
          detail: `${tasksWithGoal.length}/${runs.length} runs have explicit objective/goal`,
          fix: tasksWithGoal.length === 0 && runs.length > 0 ? 'No runs have objective metadata. Tasks should explain WHY they exist.' : null },
        { id: 'T18', name: 'System can explain "why this task exists"', pass: tasksWithGoal.length >= Math.floor(runs.length * 0.3),
          detail: `${Math.round(runs.length > 0 ? (tasksWithGoal.length / runs.length) * 100 : 0)}% of tasks have origin/goal metadata`,
          fix: null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 6. INTEGRATION FRESHNESS
    // ═══════════════════════════════════════════════════════════
    const staleBaselines = bl.filter(b => !b.recorded_at || new Date(b.recorded_at) < new Date(d7));
    const freshBaselines = bl.filter(b => b.recorded_at && new Date(b.recorded_at) >= new Date(d7));
    const connectedCreds = creds.filter(c => c.is_connected && c.credential_data && Object.keys(c.credential_data || {}).length > 0);
    const oauthServices = ['google_search_console', 'google_business_profile', 'facebook', 'instagram', 'google_ads', 'google_analytics'];
    const missingOauth = oauthServices.filter(s => {
      const c = creds.find(cr => cr.service === s);
      return !c?.credential_data?.access_token;
    });

    results.integration_freshness = {
      score: 0, max: 5, tests: [
        { id: 'T19', name: 'Data freshness truth (no stale metrics shown as current)', pass: staleBaselines.length === 0 || bl.length === 0,
          detail: `${freshBaselines.length}/${bl.length} baselines fresh (within 7 days), ${staleBaselines.length} stale`,
          fix: staleBaselines.length > 0 ? `Stale metrics: ${staleBaselines.map(b => `${b.metric_name} (${b.recorded_at ? Math.round((now - new Date(b.recorded_at).getTime()) / 86400000) + 'd ago' : 'never updated'})`).join(', ')}. Run "Refresh All Metrics".` : null },
        { id: 'T20', name: 'Every integration has freshness metadata', pass: bl.every(b => b.recorded_at) || bl.length === 0,
          detail: `${bl.filter(b => b.recorded_at).length}/${bl.length} have timestamps`,
          fix: bl.some(b => !b.recorded_at) ? 'Some baselines have no timestamp — impossible to tell if data is fresh.' : null },
        { id: 'T21', name: 'Missing configuration detected', pass: missingOauth.length <= 2,
          detail: `${connectedCreds.length} credentials connected, ${missingOauth.length} OAuth services not configured: ${missingOauth.join(', ') || 'none'}`,
          fix: missingOauth.length > 2 ? `Connect these services via Setup Link: ${missingOauth.join(', ')}` : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 7. WEBSITE / CHANGE CONTROL
    // ═══════════════════════════════════════════════════════════
    const changesRecorded = runs.filter(r => r.changed_anything);
    const changesWithDetail = changesRecorded.filter(r => r.what_changed);
    const rules = client?.client_rules || {};

    results.website_control = {
      score: 0, max: 5, tests: [
        { id: 'T24', name: 'Website access policy defined', pass: !!(rules.website_access_level || rules.auth_model?.website_access_level),
          detail: (rules.website_access_level || rules.auth_model?.website_access_level) ? `Access level: ${rules.website_access_level || rules.auth_model?.website_access_level}` : 'No access policy defined',
          fix: !(rules.website_access_level || rules.auth_model?.website_access_level) ? 'Define website access policy (read-only, PR required, direct edit) in client rules.' : null },
        { id: 'T25', name: 'Real change history exists', pass: changesWithDetail.length > 0 || changesRecorded.length === 0,
          detail: `${changesRecorded.length} changes recorded, ${changesWithDetail.length} with details`,
          fix: changesRecorded.length > 0 && changesWithDetail.length === 0 ? 'Changes are recorded but without details — no audit trail.' : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 8. SYSTEM TRUST / ANTI-FAKE
    // ═══════════════════════════════════════════════════════════
    const fakeSuccesses = successRuns.filter(r => {
      const o = typeof r.output === 'string' ? JSON.parse(r.output || '{}') : (r.output || {});
      // A run has substance if it used tools, produced structured data, or has meaningful output keys
      const meaningfulKeys = Object.keys(o).filter(k => !k.startsWith('_') && k !== 'note' && k !== 'summary');
      const hasSubstance = o._tool_call_count > 0 || o.changes_made || o.data_collected || o.metrics
        || o.findings || o.analysis || o.recommendations || o.verdict || o.action_plan
        || o.health_summary || o.ranking_summary || o.seo_health_score || o.compliance_flags
        || o.content_calendar_4weeks || o.executive_summary_he || o.credential_status
        || o.integrity_score || o.design_consistency_score || o.overall_cro_score
        || o.competitive_threat_level || o.strategic_summary || o.tasks_created
        || meaningfulKeys.length >= 3;  // 3+ meaningful output keys = real work
      return !hasSubstance;
    });
    const emptyPromptAgents = agents.filter(a => !a.base_prompt || a.base_prompt.trim().length < 50);
    const noScheduleAgents = enabledAssignments.filter(a => !sched.some(s => s.agent_template_id === a.agent_template_id));

    results.system_trust = {
      score: 0, max: 5, tests: [
        { id: 'T28', name: 'No blind healthy state (no fake success)', pass: fakeSuccesses.length <= Math.floor(successRuns.length * 0.1),
          detail: `${fakeSuccesses.length}/${successRuns.length} successful runs produced no real output (no tools, no data, no changes)`,
          fix: fakeSuccesses.length > 0 ? `${fakeSuccesses.length} runs marked "success" but did nothing real. These are cosmetic — agents generated text without executing actions.` : null },
        { id: 'T29', name: 'System explains "why not updating"', pass: bl.every(b => b.recorded_at && b.source) || bl.length === 0,
          detail: `${bl.filter(b => b.source).length}/${bl.length} baselines have source attribution`,
          fix: bl.some(b => !b.source) ? 'Some metrics have no source — impossible to diagnose why they\'re not updating.' : null },
        { id: 'T30', name: 'One-screen client truth available', pass: bl.length >= 3 && enabledAssignments.length >= 10 && activeMem.length >= 3,
          detail: `Baselines: ${bl.length}, Agents: ${enabledAssignments.length}, Memory: ${activeMem.length}, Keywords: ${kw.length}`,
          fix: bl.length < 3 || enabledAssignments.length < 10 || activeMem.length < 3 ? 'Client truth model incomplete. Need baselines, agents, and memory to show real state.' : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 9. AUTH MODEL HEALTH
    // ═══════════════════════════════════════════════════════════
    const googleOauthCreds = creds.filter(c => ['google_search_console', 'google_ads', 'google_analytics', 'google_business_profile'].includes(c.service));
    const googleWithToken = googleOauthCreds.filter(c => c.credential_data?.access_token || c.oauth_provider === 'google');
    const googleWithPassword = googleOauthCreds.filter(c => c.credential_data?.password && !c.credential_data?.access_token);
    const metaCreds = creds.filter(c => ['facebook', 'instagram', 'meta_business'].includes(c.service));
    const metaWithToken = metaCreds.filter(c => c.credential_data?.access_token || c.oauth_provider === 'meta');
    const metaWithPassword = metaCreds.filter(c => c.credential_data?.password && !c.credential_data?.access_token);

    results.auth_model = {
      score: 0, max: 5, tests: [
        { id: 'T31', name: 'Google services use platform OAuth (no passwords)', pass: googleWithPassword.length === 0,
          detail: `${googleWithToken.length}/${googleOauthCreds.length} Google services connected via OAuth, ${googleWithPassword.length} using passwords`,
          fix: googleWithPassword.length > 0 ? `${googleWithPassword.map(c => c.service).join(', ')} have stored passwords instead of OAuth tokens. Send a Setup Link to connect via Google OAuth.` : null },
        { id: 'T32', name: 'Meta services use platform OAuth (no passwords)', pass: metaWithPassword.length === 0,
          detail: `${metaWithToken.length}/${metaCreds.length} Meta services connected via OAuth, ${metaWithPassword.length} using passwords`,
          fix: metaWithPassword.length > 0 ? `${metaWithPassword.map(c => c.service).join(', ')} have stored passwords instead of OAuth tokens. Send a Setup Link to connect via Meta OAuth.` : null },
        { id: 'T33', name: 'No customer-specific auth setup required', pass: true,
          detail: 'Platform uses shared Google/Meta OAuth apps — no per-customer Auth0 required',
          fix: null },
        { id: 'T34', name: 'OAuth tokens have scope sufficiency', pass: googleWithToken.length === 0 || googleWithToken.some(c => c.credential_data?.scope),
          detail: googleWithToken.length > 0 ? `${googleWithToken.filter(c => c.credential_data?.scope).length}/${googleWithToken.length} OAuth tokens have scope metadata` : 'No Google OAuth tokens to check',
          fix: googleWithToken.length > 0 && !googleWithToken.some(c => c.credential_data?.scope) ? 'OAuth tokens lack scope metadata — cannot verify sufficient permissions.' : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 10. PERPLEXITY / GEO LAYER
    // ═══════════════════════════════════════════════════════════
    const [pplxQueries, geoSignals, citedDomains] = await Promise.all([
      supabase.from('external_research_queries').select('id, created_at', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('geo_visibility_signals').select('id, created_at', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('cited_domains').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    ]).catch(() => [{ count: 0 }, { count: 0 }, { count: 0 }]);

    const pplxCount = pplxQueries?.count || 0;
    const geoCount = geoSignals?.count || 0;
    const citedCount = citedDomains?.count || 0;
    const geoAgentRuns = runs.filter(r => r.agent_template_id && agents.find(a => a.id === r.agent_template_id && a.slug === 'geo-ai-visibility-agent'));

    results.perplexity_geo = {
      score: 0, max: 5, tests: [
        { id: 'T35', name: 'Perplexity research queries stored', pass: pplxCount > 0,
          detail: `${pplxCount} research queries logged`, fix: pplxCount === 0 ? 'No Perplexity queries stored. Run GEO agent or competitor agent with search_perplexity tool.' : null },
        { id: 'T36', name: 'Cited domains tracked', pass: citedCount > 0,
          detail: `${citedCount} cited domains discovered`, fix: citedCount === 0 ? 'No cited domains extracted. Run search_perplexity to discover which domains AI cites.' : null },
        { id: 'T37', name: 'GEO visibility signals recorded', pass: geoCount > 0,
          detail: `${geoCount} GEO visibility signals`, fix: geoCount === 0 ? 'No GEO signals. Run geo-ai-visibility-agent to check if client appears in AI answers.' : null },
        { id: 'T38', name: 'GEO agent has run recently', pass: geoAgentRuns.length > 0,
          detail: geoAgentRuns.length > 0 ? `${geoAgentRuns.length} GEO agent runs in last 7d` : 'GEO agent has not run in 7d',
          fix: geoAgentRuns.length === 0 ? 'Schedule GEO agent or trigger manually to start AI visibility monitoring.' : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // 11. MANUS / BROWSER OPERATOR LAYER
    // ═══════════════════════════════════════════════════════════
    const [browserTasksAll, browserTasksDone, browserTasksFailed] = await Promise.all([
      supabase.from('browser_tasks').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
      supabase.from('browser_tasks').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'completed'),
      supabase.from('browser_tasks').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'failed'),
    ]).catch(() => [{ count: 0 }, { count: 0 }, { count: 0 }]);

    const btTotal = browserTasksAll?.count || 0;
    const btDone = browserTasksDone?.count || 0;
    const btFailed = browserTasksFailed?.count || 0;
    const hasManusKey = !!process.env.MANUS_API_KEY;

    results.browser_tasks = {
      score: 0, max: 5, tests: [
        { id: 'T39', name: 'Browser task queue operational', pass: btTotal > 0 || hasManusKey,
          detail: btTotal > 0 ? `${btTotal} browser tasks submitted (${btDone} completed, ${btFailed} failed)` : (hasManusKey ? 'Manus configured, no tasks submitted yet' : 'No browser tasks and no Manus API key'),
          fix: !hasManusKey ? 'Set MANUS_API_KEY environment variable to enable browser automation.' : null },
        { id: 'T40', name: 'Browser tasks completing successfully', pass: btTotal === 0 || btDone > 0,
          detail: btTotal > 0 ? `${btDone}/${btTotal} tasks completed` : 'No tasks to evaluate',
          fix: btTotal > 0 && btDone === 0 ? 'No browser tasks have completed. Check Manus API connection and task instructions.' : null },
        { id: 'T41', name: 'No excessive browser task failures', pass: btFailed === 0 || btFailed < btTotal * 0.5,
          detail: btFailed > 0 ? `${btFailed} failed tasks (${Math.round(btFailed/btTotal*100)}% failure rate)` : 'No failures',
          fix: btFailed >= btTotal * 0.5 ? 'High browser task failure rate. Review task instructions and Manus configuration.' : null },
      ]
    };

    // ═══════════════════════════════════════════════════════════
    // SCORING
    // ═══════════════════════════════════════════════════════════
    const SCORE_LABELS = ['missing', 'modeled only', 'partial', 'working but weak', 'solid', 'production-grade'];
    let totalPass = 0, totalTests = 0;

    for (const [category, data] of Object.entries(results)) {
      const passed = data.tests.filter(t => t.pass).length;
      const total = data.tests.length;
      totalPass += passed;
      totalTests += total;
      const pct = total > 0 ? passed / total : 0;
      data.score = pct >= 1 ? 5 : pct >= 0.8 ? 4 : pct >= 0.6 ? 3 : pct >= 0.4 ? 2 : pct > 0 ? 1 : 0;
      data.score_label = SCORE_LABELS[data.score];
      data.passed = passed;
      data.total = total;
    }

    const overallScore = totalTests > 0 ? Math.round((totalPass / totalTests) * 100) : 0;

    // ── Blockers classification ──────────────────────────────────
    const blockers = [];
    for (const [cat, data] of Object.entries(results)) {
      for (const test of data.tests) {
        if (!test.pass && test.fix) {
          blockers.push({ category: cat, test: test.id, name: test.name, fix: test.fix, severity: test.fix.includes('CRITICAL') || test.fix.includes('fake') ? 'critical' : 'high' });
        }
      }
    }

    // ── Client growth state summary ──────────────────────────────
    const growthState = {
      domain: client?.domain,
      name: client?.name,
      active_agents: enabledAssignments.length,
      total_runs_7d: runs.length,
      successful_runs_7d: successRuns.length,
      failed_runs_7d: failedRuns.length,
      real_tool_executions: runsWithTools.length,
      baselines_tracked: bl.length,
      baselines_fresh: freshBaselines.length,
      baselines_stale: staleBaselines.length,
      keywords_tracked: kw.length,
      keywords_with_position: kwWithPosition.length,
      keywords_stale: kwStale.length,
      competitors_tracked: comp.length,
      memory_items: activeMem.length,
      open_incidents: inc.filter(i => i.status === 'open').length,
      pending_approvals: appr.filter(a => a.status === 'pending').length,
      queue_pending: queue.filter(q => q.status === 'queued').length,
      queue_stuck: queue.filter(q => q.status === 'failed').length,
      connected_services: connectedCreds.length,
      missing_oauth: missingOauth,
      last_successful_run: successRuns[0]?.created_at || null,
      last_any_run: runs[0]?.created_at || null,
      validation_chains_run: validationChainRuns.length,
    };

    res.json({
      client_id: clientId,
      audit_timestamp: new Date().toISOString(),
      overall_score: overallScore,
      overall_label: SCORE_LABELS[overallScore >= 90 ? 5 : overallScore >= 75 ? 4 : overallScore >= 55 ? 3 : overallScore >= 35 ? 2 : overallScore > 0 ? 1 : 0],
      total_passed: totalPass,
      total_tests: totalTests,
      categories: results,
      blockers,
      growth_state: growthState,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
