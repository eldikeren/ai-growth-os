// ============================================================
// AI GROWTH OS — ONBOARDING PORTAL ROUTES
// All routes fully implemented
// ============================================================
import express from 'express';
import {
  createOnboardingSession, validateSession, buildGoogleAuthUrl,
  handleGoogleCallback, buildMetaAuthUrl, handleMetaCallback,
  connectWebsite, saveBusinessTruth, selectAsset, finalizeOnboarding,
  queueIngestionJob, processIngestionJob, refreshGoogleToken
} from '../functions/onboarding.js';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ── CREATE ONBOARDING SESSION (admin) ─────────────────────────
router.post('/onboarding/create-link', async (req, res) => {
  try {
    const result = await createOnboardingSession(req.body.clientId, req.body);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── VALIDATE TOKEN (public) ───────────────────────────────────
router.post('/onboarding/validate-token', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const result = await validateSession(req.body.token, ip);
    if (!result.valid) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET SESSION STATE (public, by token) ─────────────────────
router.get('/onboarding/:token', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'];
    const result = await validateSession(req.params.token, ip);
    if (!result.valid) return res.status(404).json({ error: result.error });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── MARK WELCOME STEP DONE ────────────────────────────────────
router.post('/onboarding/:token/welcome-done', async (req, res) => {
  try {
    const session = await validateSession(req.params.token, req.ip);
    if (!session.valid) return res.status(404).json({ error: session.error });
    await supabase.from('onboarding_sessions').update({ step_welcome_done: true }).eq('id', session.session_id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GOOGLE OAUTH: START ───────────────────────────────────────
router.post('/oauth/google/start', async (req, res) => {
  try {
    const { token, subProviders, sessionId } = req.body;
    if (!subProviders?.length) return res.status(400).json({ error: 'subProviders required' });
    const session = await validateSession(token, req.ip);
    if (!session.valid) return res.status(401).json({ error: session.error });
    const authUrl = buildGoogleAuthUrl(session.session_id, subProviders, { rawToken: token });
    res.json({ auth_url: authUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GOOGLE OAUTH: CALLBACK ────────────────────────────────────
router.get('/oauth/google/callback', async (req, res) => {
  const stateStr = req.query.state;
  const stateObj = (() => { try { return JSON.parse(stateStr); } catch { return {}; } })();
  try {
    const { code, error } = req.query;
    if (error) {
      if (stateObj.adminFlow) return res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?view=credentials&error=${encodeURIComponent(error)}`);
      return res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/onboarding/error?reason=${error}`);
    }
    if (!code || !stateStr) return res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/onboarding/error?reason=missing_params`);
    const result = await handleGoogleCallback(code, stateStr, req.ip);
    // Admin OAuth flow — redirect back to the app (credentials page), not onboarding
    if (stateObj.adminFlow && stateObj.clientId) {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?view=credentials&connected=google&client=${stateObj.clientId}`);
    } else {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/onboarding/${stateObj.rawToken}?connected=google&providers=${stateObj.requestedSubProviders?.join(',')}`);
    }
  } catch (e) {
    console.error('Google callback error:', e.message);
    if (stateObj.adminFlow) {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?view=credentials&error=${encodeURIComponent(e.message)}`);
    } else {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/onboarding/error?reason=${encodeURIComponent(e.message)}`);
    }
  }
});

// ── META OAUTH: START ─────────────────────────────────────────
router.post('/oauth/meta/start', async (req, res) => {
  try {
    const { token } = req.body;
    const session = await validateSession(token, req.ip);
    if (!session.valid) return res.status(401).json({ error: session.error });
    const authUrl = buildMetaAuthUrl(session.session_id, token);
    res.json({ auth_url: authUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── META OAUTH: CALLBACK ──────────────────────────────────────
router.get('/oauth/meta/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    const stateObj = (() => { try { return JSON.parse(state); } catch { return {}; } })();
    if (error) {
      if (stateObj.adminFlow) return res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?view=credentials&error=${encodeURIComponent(error)}`);
      return res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/onboarding/error?reason=${error}`);
    }
    const result = await handleMetaCallback(code, state);
    if (stateObj.adminFlow && stateObj.clientId) {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?view=credentials&connected=meta&client=${stateObj.clientId}`);
    } else {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/onboarding/${stateObj.rawToken}?connected=meta`);
    }
  } catch (e) {
    console.error('Meta callback error:', e);
    const stateObj = (() => { try { return JSON.parse(req.query.state); } catch { return {}; } })();
    const errMsg = e?.message || String(e) || 'Unknown Meta OAuth error';
    if (stateObj.adminFlow) {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?view=credentials&error=${encodeURIComponent(errMsg)}`);
    } else {
      res.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/onboarding/error?reason=${encodeURIComponent(errMsg)}`);
    }
  }
});

// ── CONNECT WEBSITE ───────────────────────────────────────────
router.post('/onboarding/connect-website', async (req, res) => {
  try {
    const { token, websiteUrl } = req.body;
    const session = await validateSession(token, req.ip);
    if (!session.valid) return res.status(404).json({ error: session.error });
    const result = await connectWebsite(session.session_id, websiteUrl);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SAVE BUSINESS TRUTH ───────────────────────────────────────
router.post('/onboarding/save-business-truth', async (req, res) => {
  try {
    const { token, ...formData } = req.body;
    const session = await validateSession(token, req.ip);
    if (!session.valid) return res.status(404).json({ error: session.error });
    const result = await saveBusinessTruth(session.session_id, formData);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SELECT ASSET (property/account/location) ──────────────────
router.post('/onboarding/select-asset', async (req, res) => {
  try {
    const { token, assetId } = req.body;
    const session = await validateSession(token, req.ip);
    if (!session.valid) return res.status(404).json({ error: session.error });
    const result = await selectAsset(session.session_id, assetId);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SKIP CONNECTOR ────────────────────────────────────────────
router.post('/onboarding/skip-connector', async (req, res) => {
  try {
    const { token, connector } = req.body;
    const session = await validateSession(token, req.ip);
    if (!session.valid) return res.status(404).json({ error: session.error });
    const { data: sess } = await supabase.from('onboarding_sessions').select('skipped_connectors').eq('id', session.session_id).single();
    const skipped = [...(sess?.skipped_connectors || [])];
    if (!skipped.includes(connector)) skipped.push(connector);
    await supabase.from('onboarding_sessions').update({ skipped_connectors: skipped }).eq('id', session.session_id);
    await supabase.from('onboarding_events').insert({ session_id: session.session_id, client_id: session.client_id, event_type: 'connector_skipped', provider: connector });
    res.json({ success: true, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── FINALIZE ONBOARDING ───────────────────────────────────────
router.post('/onboarding/finalize', async (req, res) => {
  try {
    const { token } = req.body;
    const session = await validateSession(token, req.ip);
    if (!session.valid) return res.status(404).json({ error: session.error });
    const result = await finalizeOnboarding(session.session_id);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET ADMIN SESSIONS LIST ───────────────────────────────────
router.get('/onboarding-sessions', async (req, res) => {
  try {
    let query = supabase.from('onboarding_sessions')
      .select('*, clients(name, domain)')
      .order('created_at', { ascending: false });
    if (req.query.status) query = query.eq('status', req.query.status);
    const { data } = await query.limit(100);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET INTEGRATIONS FOR CLIENT (admin) ───────────────────────
router.get('/clients/:clientId/integrations', async (req, res) => {
  try {
    const { data } = await supabase.from('client_integrations').select('*').eq('client_id', req.params.clientId);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET INTEGRATION ASSETS ────────────────────────────────────
router.get('/clients/:clientId/integration-assets', async (req, res) => {
  try {
    let q = supabase.from('integration_assets').select('*').eq('client_id', req.params.clientId);
    if (req.query.provider) q = q.eq('provider', req.query.provider);
    const { data } = await q.order('discovered_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SELECT INTEGRATION ASSET (admin — no onboarding session needed) ──
// PATCH /clients/:clientId/integration-assets/:assetId/select
// Deselects all other assets of the same sub_provider and selects this one.
// Use case: choosing which GBP location, GA4 property, GSC site, etc. to use per client.
router.patch('/clients/:clientId/integration-assets/:assetId/select', async (req, res) => {
  try {
    const { clientId, assetId } = req.params;

    // Get the asset being selected
    const { data: asset, error: assetErr } = await supabase
      .from('integration_assets')
      .select('*')
      .eq('id', assetId)
      .eq('client_id', clientId)
      .single();

    if (assetErr || !asset) return res.status(404).json({ error: 'Asset not found for this client' });

    // Deselect all assets of same provider+sub_provider for this client
    await supabase
      .from('integration_assets')
      .update({ is_selected: false })
      .eq('client_id', clientId)
      .eq('provider', asset.provider)
      .eq('sub_provider', asset.sub_provider);

    // Select this one
    await supabase
      .from('integration_assets')
      .update({ is_selected: true })
      .eq('id', assetId);

    res.json({
      success: true,
      selected: { id: asset.id, label: asset.label, external_id: asset.external_id, sub_provider: asset.sub_provider },
      message: `Selected "${asset.label}" as the active ${asset.sub_provider} for this client`
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LIST GBP LOCATIONS (convenience endpoint) ─────────────────
// GET /clients/:clientId/gbp-locations
// Returns all GBP locations for this client with which one is selected
router.get('/clients/:clientId/gbp-locations', async (req, res) => {
  try {
    const { data } = await supabase
      .from('integration_assets')
      .select('id, external_id, label, url, metadata_json, is_selected, discovered_at')
      .eq('client_id', req.params.clientId)
      .eq('provider', 'google')
      .eq('sub_provider', 'business_profile')
      .order('label');

    res.json({
      locations: data || [],
      selected: data?.find(d => d.is_selected) || null,
      count: data?.length || 0
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET INGESTION JOBS ────────────────────────────────────────
router.get('/clients/:clientId/ingestion-jobs', async (req, res) => {
  try {
    const { data } = await supabase.from('ingestion_jobs').select('*')
      .eq('client_id', req.params.clientId).order('created_at', { ascending: false }).limit(50);
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PROCESS INGESTION JOBS (cron) ─────────────────────────────
router.post('/cron/process-ingestion', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data: jobs } = await supabase.from('ingestion_jobs')
      .select('id').eq('status', 'queued').order('created_at').limit(10);
    const results = [];
    for (const job of (jobs || [])) {
      try { results.push({ id: job.id, result: await processIngestionJob(job.id) }); }
      catch (e) { results.push({ id: job.id, error: e.message }); }
    }
    res.json({ processed: results.length, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REFRESH GOOGLE TOKEN (cron) ───────────────────────────────
router.post('/cron/refresh-tokens', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    // Find tokens expiring in next 10 minutes
    const { data: creds } = await supabase.from('oauth_credentials')
      .select('client_id').eq('status', 'active')
      .lt('expires_at', new Date(Date.now() + 10 * 60 * 1000).toISOString());
    const results = [];
    for (const cred of (creds || [])) {
      try { await refreshGoogleToken(cred.client_id); results.push({ client_id: cred.client_id, refreshed: true }); }
      catch (e) { results.push({ client_id: cred.client_id, error: e.message }); }
    }
    res.json({ refreshed: results.length, results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SEND REMINDER (cron) ──────────────────────────────────────
router.post('/cron/send-reminders', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // 2-hour reminder
    const { data: need2h } = await supabase.from('onboarding_sessions')
      .select('id, client_name, client_email, notify_email, token_hash')
      .eq('status', 'in_progress').is('reminder_1_sent_at', null)
      .lt('first_opened_at', twoHoursAgo).not('client_email', 'is', null);
    for (const s of (need2h || [])) {
      await sendReminder(s, 1);
      await supabase.from('onboarding_sessions').update({ reminder_1_sent_at: new Date().toISOString() }).eq('id', s.id);
    }
    // 24-hour reminder
    const { data: need24h } = await supabase.from('onboarding_sessions')
      .select('id, client_name, client_email, notify_email, token_hash')
      .eq('status', 'in_progress').is('reminder_2_sent_at', null)
      .lt('first_opened_at', twentyFourHoursAgo).not('client_email', 'is', null);
    for (const s of (need24h || [])) {
      await sendReminder(s, 2);
      await supabase.from('onboarding_sessions').update({ reminder_2_sent_at: new Date().toISOString() }).eq('id', s.id);
    }
    res.json({ reminders_sent: (need2h?.length || 0) + (need24h?.length || 0) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function sendReminder(session, reminderNumber) {
  if (!process.env.RESEND_API_KEY || !session.client_email) return;
  const subject = reminderNumber === 1
    ? `היי ${session.client_name} — עדיין ממתינים לחיבור`
    : `תזכורת אחרונה — הגדרת החשבון ממתינה`;
  const setupUrl = `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/${session.token_hash}`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Elad Digital <hello@elad.digital>',
      to: [session.client_email],
      subject,
      html: `<div dir="rtl" style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:24px;direction:rtl;text-align:right;">
        <h2 style="color:#1a1a2e;">שלום ${session.client_name} 👋</h2>
        <p style="font-size:15px;line-height:1.6;color:#374151;">
          ${reminderNumber === 1 ? 'שמנו לב שלא סיימתם את הגדרת החשבון. לוקח רק כ-5 דקות!' : 'זו תזכורת אחרונה — הקישור פג תוקף בקרוב.'}
        </p>
        <a href="${setupUrl}" style="background:#6366f1;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;font-weight:700;">המשיכו את ההגדרה →</a>
        <p style="font-size:12px;color:#9ca3af;margin-top:24px;">Elad Digital</p>
      </div>`
    })
  });
}

export default router;
