// ============================================================
// GT3 Phase 4 — HTTP ROUTES
//
// Wires the GT3 engine into the existing Express app so the UI
// (Phase 5) and cron jobs (Phase 6) can drive it.
// ============================================================

import express from 'express';
import { runGT3Pipeline } from '../gt3/services/runPipeline.js';
import { ensureCustomerProfile, ensureAllCustomerProfiles } from '../gt3/services/CustomerOnboardingService.js';
import { crawlCustomerSite } from '../gt3/services/SiteCrawlerService.js';
import { discoverKeywords } from '../gt3/services/KeywordDiscoveryService.js';
import { scoreAllKeywords } from '../gt3/services/KeywordScoringService.js';
import { planMissions } from '../gt3/services/MissionPlannerService.js';
import { pullNextTaskForAgent, buildTaskContext, claimTask, recordTaskOutcome } from '../gt3/services/GT3TaskExecutorService.js';
import { captureBrandSignals, computeSignalTrend } from '../gt3/services/BrandDemandSignalsService.js';
import { buildWeeklyReport } from '../gt3/services/WeeklyMissionReportService.js';
import { getGT3Supabase } from '../gt3/services/supabaseClient.js';

const router = express.Router();

// Helper: resolve legacy → gt3 id at the top of any pipeline route
async function resolveOr404(req, res) {
  const sb = getGT3Supabase();
  const id = await resolveGt3Customer(sb, req.params.customerId);
  if (!id) {
    res.status(404).json({ error: 'No GT3 customer found. Legacy client needs to be onboarded to GT3 first.' });
    return null;
  }
  return id;
}

// ─── Run full pipeline for a customer ───────────────────────
router.post('/customers/:customerId/pipeline/run', async (req, res) => {
  try {
    const customerId = await resolveOr404(req, res);
    if (!customerId) return;
    const { skipCrawl, skipDiscovery, maxPages } = req.body || {};
    const report = await runGT3Pipeline(customerId, { skipCrawl, skipDiscovery, maxPages });
    res.json(report);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Individual pipeline stages ─────────────────────────────
router.post('/customers/:customerId/pipeline/onboarding', async (req, res) => {
  try {
    const id = await resolveOr404(req, res);
    if (!id) return;
    res.json(await ensureCustomerProfile(id, { refresh: !!req.body?.refresh }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers/:customerId/pipeline/crawl', async (req, res) => {
  try {
    const id = await resolveOr404(req, res);
    if (!id) return;
    res.json(await crawlCustomerSite(id, req.body || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers/:customerId/pipeline/discover', async (req, res) => {
  try {
    const id = await resolveOr404(req, res);
    if (!id) return;
    res.json(await discoverKeywords(id, req.body || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers/:customerId/pipeline/score', async (req, res) => {
  try {
    const id = await resolveOr404(req, res);
    if (!id) return;
    res.json(await scoreAllKeywords(id, req.body || {}));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/customers/:customerId/pipeline/plan', async (req, res) => {
  try {
    const id = await resolveOr404(req, res);
    if (!id) return;
    res.json(await planMissions(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Resolve legacy client_id → gt3 customer_id ─────────────
async function resolveGt3Customer(sb, id) {
  // Try as gt3 customer id first
  const { data: byId } = await sb.from('gt3_customers').select('id').eq('id', id).maybeSingle();
  if (byId) return byId.id;
  // Fallback: resolve as legacy client id
  const { data: byLegacy } = await sb.from('gt3_customers').select('id').eq('legacy_client_id', id).maybeSingle();
  return byLegacy?.id || null;
}

router.get('/gt3/resolve-customer', async (req, res) => {
  try {
    const sb = getGT3Supabase();
    const id = req.query.legacy_client_id || req.query.id;
    const customerId = await resolveGt3Customer(sb, id);
    res.json({ customer_id: customerId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Command Center data endpoints (used by Phase 5 UI) ─────
// Accepts either gt3 customer_id OR legacy client_id (resolves automatically)
router.get('/customers/:customerId/gt3/dashboard', async (req, res) => {
  try {
    const sb = getGT3Supabase();
    const resolvedId = await resolveGt3Customer(sb, req.params.customerId);
    if (!resolvedId) return res.status(404).json({ error: 'No GT3 customer found for this client. Run the onboarding pipeline first.' });
    const cid = resolvedId;
    const [customer, primary, supportClusters, missingPages, quickWins, defense, actionTasks, channelTasks] = await Promise.all([
      sb.from('gt3_customers').select('*').eq('id', cid).single(),
      sb.from('gt3_v_primary_missions').select('*').eq('customer_id', cid).order('strategic_priority_score', { ascending: false }),
      sb.from('gt3_v_support_clusters').select('*').eq('customer_id', cid).order('authority_support_score', { ascending: false }).limit(50),
      sb.from('gt3_v_missing_high_value_pages').select('*').eq('customer_id', cid).order('strategic_priority_score', { ascending: false }).limit(30),
      sb.from('gt3_v_quick_wins').select('*').eq('customer_id', cid).order('win_probability_score', { ascending: false }).limit(30),
      sb.from('gt3_v_defense_keywords').select('*').eq('customer_id', cid),
      sb.from('gt3_action_tasks').select('*').eq('customer_id', cid).in('status', ['open', 'in_progress']).order('priority_label').order('created_at', { ascending: false }),
      sb.from('gt3_channel_tasks').select('*').eq('customer_id', cid).in('status', ['open', 'in_progress']).order('priority_label').order('created_at', { ascending: false }),
    ]);
    res.json({
      customer: customer.data,
      primary_missions: primary.data || [],
      support_clusters: supportClusters.data || [],
      missing_pages: missingPages.data || [],
      quick_wins: quickWins.data || [],
      defense: defense.data || [],
      action_tasks: actionTasks.data || [],
      channel_tasks: channelTasks.data || [],
      summary: {
        primary_count: (primary.data || []).length,
        support_count: (supportClusters.data || []).length,
        missing_pages_count: (missingPages.data || []).length,
        quick_wins_count: (quickWins.data || []).length,
        defense_count: (defense.data || []).length,
        open_action_tasks: (actionTasks.data || []).filter(t => t.status === 'open').length,
        open_channel_tasks: (channelTasks.data || []).filter(t => t.status === 'open').length,
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Task execution endpoints ───────────────────────────────
router.get('/agents/:agentSlug/next-task', async (req, res) => {
  try {
    const { agentSlug } = req.params;
    const { customerId } = req.query;
    const next = await pullNextTaskForAgent(agentSlug, customerId || null);
    if (!next) return res.json({ task: null, message: 'No open tasks assigned to this agent' });
    const context = await buildTaskContext(next.task, next.kind);
    res.json({ task: next.task, kind: next.kind, context });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks/:taskId/claim', async (req, res) => {
  try {
    const { kind } = req.body; // 'action' | 'channel'
    if (!['action', 'channel'].includes(kind)) return res.status(400).json({ error: 'kind must be action or channel' });
    res.json(await claimTask(req.params.taskId, kind));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tasks/:taskId/complete', async (req, res) => {
  try {
    const { kind, status, output, error_message } = req.body;
    if (!['action', 'channel'].includes(kind)) return res.status(400).json({ error: 'kind must be action or channel' });
    if (!['done', 'blocked', 'failed', 'cancelled'].includes(status)) return res.status(400).json({ error: 'invalid status' });
    res.json(await recordTaskOutcome(req.params.taskId, kind, { status, output, error_message }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Brand Demand Signals (Phase 6) ─────────────────────────
router.post('/customers/:customerId/brand-signals/capture', async (req, res) => {
  try {
    const id = await resolveOr404(req, res); if (!id) return;
    res.json(await captureBrandSignals(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/customers/:customerId/brand-signals/trend/:signalType', async (req, res) => {
  try {
    const id = await resolveOr404(req, res); if (!id) return;
    const days = parseInt(req.query.days) || 30;
    res.json(await computeSignalTrend(id, req.params.signalType, days));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Weekly Mission Report (Phase 6) ────────────────────────
router.get('/customers/:customerId/gt3/weekly-report', async (req, res) => {
  try {
    const id = await resolveOr404(req, res); if (!id) return;
    res.json(await buildWeeklyReport(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Cron: capture brand signals daily ──────────────────────
router.get('/cron/gt3-brand-signals', async (req, res) => {
  try {
    const sb = getGT3Supabase();
    const { data: customers } = await sb.from('gt3_customers').select('id, name');
    const results = [];
    for (const c of customers || []) {
      try { results.push({ customer: c.name, ...(await captureBrandSignals(c.id)) }); }
      catch (e) { results.push({ customer: c.name, ok: false, error: e.message }); }
    }
    res.json({ ran_at: new Date().toISOString(), processed: results.length, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Cron: refresh all customers ────────────────────────────
// Re-runs the pipeline for every active customer daily so scores
// and missions stay current with fresh data.
router.get('/cron/gt3-refresh', async (req, res) => {
  try {
    const sb = getGT3Supabase();
    const { data: customers } = await sb.from('gt3_customers').select('id, name');
    const results = [];
    for (const c of customers || []) {
      try {
        // Don't re-crawl every day (expensive) — refresh weekly
        const skipCrawl = new Date().getDay() !== 0; // only on Sundays
        const report = await runGT3Pipeline(c.id, { skipCrawl, skipDiscovery: false });
        results.push({ customer: c.name, ok: report.ok, duration_ms: report.duration_ms });
      } catch (e) {
        results.push({ customer: c.name, ok: false, error: e.message });
      }
    }
    res.json({ ran_at: new Date().toISOString(), customers_processed: results.length, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
