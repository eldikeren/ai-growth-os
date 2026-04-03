// ============================================================
// AI GROWTH OS — WEBSITE ACCESS MODULE ROUTES
// ============================================================
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  saveWebsiteIdentity, saveGitConnection, saveCmsConnection,
  saveServerConnection, validateGitConnection, validateCmsConnection,
  validateServerConnection, validateAll, saveChangePolicy,
  logWebsiteChange, getWebsiteRuntimeContext, getFullWebsiteState
} from '../functions/website-access.js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── GET FULL WEBSITE STATE ────────────────────────────────────
router.get('/clients/:clientId/website', async (req, res) => {
  try {
    const data = await getFullWebsiteState(req.params.clientId);
    res.json(data || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SAVE WEBSITE IDENTITY ─────────────────────────────────────
router.post('/clients/:clientId/website/identity', async (req, res) => {
  try {
    const result = await saveWebsiteIdentity(req.params.clientId, req.body);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CRAWL/ANALYZE ─────────────────────────────────────────────
router.post('/clients/:clientId/website/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const result = await saveWebsiteIdentity(req.params.clientId, { primaryDomain: url.replace(/https?:\/\//, ''), productionUrl: url });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GIT CONNECTION ────────────────────────────────────────────
router.post('/website/:websiteId/git', async (req, res) => {
  try {
    const { gitToken, ...data } = req.body;
    const result = await saveGitConnection(req.params.websiteId, data, gitToken);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/website/:websiteId/git/validate', async (req, res) => {
  try { res.json(await validateGitConnection(req.params.websiteId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CMS CONNECTION ────────────────────────────────────────────
router.post('/website/:websiteId/cms', async (req, res) => {
  try {
    const { cmsPassword, cmsApiToken, ...data } = req.body;
    const result = await saveCmsConnection(req.params.websiteId, data, cmsPassword, cmsApiToken);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/website/:websiteId/cms/validate', async (req, res) => {
  try { res.json(await validateCmsConnection(req.params.websiteId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SERVER CONNECTION ─────────────────────────────────────────
router.post('/website/:websiteId/server', async (req, res) => {
  try {
    const { serverPassword, sshPrivateKey, ...data } = req.body;
    const result = await saveServerConnection(req.params.websiteId, data, serverPassword, sshPrivateKey);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/website/:websiteId/server/validate', async (req, res) => {
  try { res.json(await validateServerConnection(req.params.websiteId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VALIDATE ALL ──────────────────────────────────────────────
router.post('/website/:websiteId/validate-all', async (req, res) => {
  try { res.json(await validateAll(req.params.websiteId)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CHANGE POLICY ─────────────────────────────────────────────
router.get('/website/:websiteId/policy', async (req, res) => {
  try {
    const { data } = await supabase.from('website_change_policies').select('*').eq('client_website_id', req.params.websiteId).maybeSingle();
    res.json(data || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/website/:websiteId/policy', async (req, res) => {
  try { res.json(await saveChangePolicy(req.params.websiteId, req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── AGENT RUNTIME CONTEXT ─────────────────────────────────────
router.get('/clients/:clientId/website/runtime-context', async (req, res) => {
  try {
    const ctx = await getWebsiteRuntimeContext(req.params.clientId);
    if (!ctx) return res.json({ website: null, message: 'No website configured' });
    res.json(ctx);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VALIDATION LOGS ───────────────────────────────────────────
router.get('/website/:websiteId/validations', async (req, res) => {
  try {
    const { data } = await supabase.from('website_validation_logs').select('*').eq('client_website_id', req.params.websiteId).order('created_at', { ascending: false }).limit(50);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CHANGE HISTORY ────────────────────────────────────────────
router.get('/website/:websiteId/changes', async (req, res) => {
  try {
    const { data } = await supabase.from('website_change_history').select('*').eq('client_website_id', req.params.websiteId).order('created_at', { ascending: false }).limit(100);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/website/:websiteId/changes', async (req, res) => {
  try {
    const { runId, ...changeData } = req.body;
    res.json(await logWebsiteChange(req.params.websiteId, runId, changeData));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
