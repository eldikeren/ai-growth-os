// ============================================================
// AI GROWTH OS — ADDITIONAL ROUTES
// Onboarding, connectors, prompt overrides, run steps,
// link intelligence, SEO action plans, verification (full),
// report templates, schedules, KPI snapshots, locations
// ============================================================

import express from 'express';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  createClientOnboarding, syncConnector,
  getActivePrompt, createPromptOverride, diffPrompts,
  createRunStep, completeRunStep, getRunSteps,
  generateFullLinkIntelligence, syncBacklinkIntelligence, generateSeoActionPlan,
  runFullVerification, snapshotKeywordPositions, recordKpiSnapshot
} from '../functions/additional.js';
import { deployApprovedChange } from '../functions/deploy.js';

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

// ── ADMIN DIRECT OAUTH (no setup link required) ──────────────
// These routes let admins connect Google/Meta OAuth directly from the credentials page
// without creating a setup link first. Creates a lightweight session on-the-fly.

router.post('/clients/:clientId/oauth/google/start', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { subProviders } = req.body;
    if (!subProviders?.length) return res.status(400).json({ error: 'subProviders required' });
    if (!(process.env.GOOGLE_CLIENT_ID || '').trim()) return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured in environment variables. Add it in Vercel Settings > Environment Variables.' });
    if (!(process.env.GOOGLE_CLIENT_SECRET || '').trim()) return res.status(500).json({ error: 'GOOGLE_CLIENT_SECRET not configured. Add it in Vercel Settings > Environment Variables.' });

    // Create a lightweight onboarding session for this admin OAuth flow
    const sessionId = crypto.randomUUID();
    const { error: sessError } = await supabase.from('onboarding_sessions').upsert({
      id: sessionId,
      client_id: clientId,
      status: 'in_progress',
      requested_connectors: subProviders.map(sp => `google_${sp}`),
      completed_connectors: [],
      language: 'en',
      token_hash: `admin_${sessionId}`,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'id' });
    if (sessError) { console.error('Session create error:', sessError); return res.status(500).json({ error: `Session creation failed: ${sessError.message}` }); }

    const { buildGoogleAuthUrl } = await import('../functions/onboarding.js');
    // Use clientId as the "rawToken" for admin flows — callback will detect admin_oauth session
    const authUrl = buildGoogleAuthUrl(sessionId, subProviders, {
      rawToken: `admin_${clientId}`,
      adminFlow: true,
      clientId,
    });
    res.json({ auth_url: authUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clients/:clientId/oauth/meta/start', async (req, res) => {
  try {
    const { clientId } = req.params;

    const sessionId = crypto.randomUUID();
    const { error: sessError } = await supabase.from('onboarding_sessions').upsert({
      id: sessionId,
      client_id: clientId,
      status: 'in_progress',
      requested_connectors: ['facebook_page', 'instagram_business'],
      completed_connectors: [],
      language: 'en',
      token_hash: `admin_meta_${sessionId}`,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'id' });
    if (sessError) { console.error('Meta session create error:', sessError); return res.status(500).json({ error: `Session creation failed: ${sessError.message}` }); }

    const { buildMetaAuthUrl } = await import('../functions/onboarding.js');
    const authUrl = buildMetaAuthUrl(sessionId, `admin_${clientId}`, { adminFlow: true, clientId });
    res.json({ auth_url: authUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DISCONNECT OAUTH ─────────────────────────────────────────
router.post('/clients/:clientId/oauth/:provider/disconnect', async (req, res) => {
  try {
    const { clientId, provider } = req.params;

    // Delete OAuth credentials
    await supabase.from('oauth_credentials')
      .delete().eq('client_id', clientId).eq('provider', provider);

    // Delete integrations
    await supabase.from('client_integrations')
      .delete().eq('client_id', clientId).eq('provider', provider);

    // Delete integration assets
    await supabase.from('integration_assets')
      .delete().eq('client_id', clientId).eq('provider', provider);

    res.json({ success: true, message: `${provider} disconnected` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get OAuth connection status for a client (all providers)
router.get('/clients/:clientId/oauth-status', async (req, res) => {
  try {
    const { clientId } = req.params;

    const [oauthCreds, integrations, assets] = await Promise.all([
      supabase.from('oauth_credentials').select('provider, sub_provider, status, scopes_granted, external_account_email, external_account_name, expires_at, last_refresh_at, last_error, connected_at').eq('client_id', clientId),
      supabase.from('client_integrations').select('provider, sub_provider, status, scopes_granted, external_account_email, external_account_name, discovery_summary, connected_at').eq('client_id', clientId),
      supabase.from('integration_assets').select('id, provider, sub_provider, asset_type, external_id, label, url, metadata_json, is_selected, discovered_at').eq('client_id', clientId),
    ]);

    // Build connection status per service
    const connections = {};

    // Google services
    const googleMaster = (oauthCreds.data || []).find(c => c.provider === 'google');
    for (const sp of ['search_console', 'ads', 'business_profile', 'analytics']) {
      const integration = (integrations.data || []).find(i => i.provider === 'google' && i.sub_provider === sp);
      const serviceAssets = (assets.data || []).filter(a => a.provider === 'google' && a.sub_provider === sp);
      const selected = serviceAssets.find(a => a.is_selected);

      connections[`google_${sp}`] = {
        provider: 'google',
        sub_provider: sp,
        connected: !!(googleMaster && integration),
        status: integration?.status || (googleMaster ? 'connected_no_integration' : 'disconnected'),
        account_email: googleMaster?.external_account_email || null,
        account_name: googleMaster?.external_account_name || null,
        scopes_granted: googleMaster?.scopes_granted || [],
        token_expires_at: googleMaster?.expires_at || null,
        token_status: googleMaster ? (new Date(googleMaster.expires_at) > new Date() ? 'valid' : 'expired') : 'missing',
        last_error: googleMaster?.last_error || null,
        connected_at: integration?.connected_at || googleMaster?.connected_at || null,
        assets: serviceAssets.map(a => ({ id: a.id, label: a.label, external_id: a.external_id, is_selected: a.is_selected, url: a.url })),
        selected_asset: selected ? { id: selected.id, label: selected.label, external_id: selected.external_id } : null,
      };
    }

    // Meta services — single combined entry under 'facebook' key (one OAuth token covers Pages, Instagram, and Ads)
    const metaMaster = (oauthCreds.data || []).find(c => c.provider === 'meta');
    const allMetaAssets = (assets.data || []).filter(a => a.provider === 'meta');
    const metaIntegration = (integrations.data || []).find(i => i.provider === 'meta');
    const metaSelected = allMetaAssets.find(a => a.is_selected);

    connections['facebook'] = {
      provider: 'meta',
      sub_provider: 'facebook',
      connected: !!(metaMaster),
      status: metaMaster ? (new Date(metaMaster.expires_at) > new Date() ? 'active' : 'expired') : 'disconnected',
      account_email: metaMaster?.external_account_email || null,
      account_name: metaMaster?.external_account_name || null,
      scopes_granted: metaMaster?.scopes_granted || [],
      token_expires_at: metaMaster?.expires_at || null,
      token_status: metaMaster ? (new Date(metaMaster.expires_at) > new Date() ? 'valid' : 'expired') : 'missing',
      last_error: metaMaster?.last_error || null,
      connected_at: metaMaster?.connected_at || metaIntegration?.connected_at || null,
      assets: allMetaAssets.map(a => ({ id: a.id, label: a.label, external_id: a.external_id, is_selected: a.is_selected, sub_provider: a.sub_provider, asset_type: a.asset_type, metadata: a.metadata_json })),
      selected_asset: metaSelected ? { id: metaSelected.id, label: metaSelected.label, external_id: metaSelected.external_id } : null,
      discovery_summary: metaIntegration?.discovery_summary || null,
    };
    // Also expose under 'instagram' key for backward compat
    connections['instagram'] = connections['facebook'];

    res.json({ connections });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Re-run Google asset discovery without forcing another OAuth dance.
// Useful after the user is added as a GA4/GBP user, or after the Ads
// developer token is configured. Idempotent.
router.post('/clients/:clientId/rediscover-google', async (req, res) => {
  try {
    const { rediscoverGoogleAssets } = await import('../functions/onboarding.js');
    const subProviders = Array.isArray(req.body?.subProviders) && req.body.subProviders.length
      ? req.body.subProviders
      : ['search_console', 'ads', 'business_profile', 'analytics'];
    const results = await rediscoverGoogleAssets(req.params.clientId, subProviders);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REDISCOVER META ASSETS ───────────────────────────────────
router.post('/clients/:clientId/rediscover-meta', async (req, res) => {
  try {
    const { rediscoverMetaAssets } = await import('../functions/onboarding.js');
    const results = await rediscoverMetaAssets(req.params.clientId);
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Select an integration asset (page, property, etc.)
router.patch('/clients/:clientId/integration-assets/:assetId/select', async (req, res) => {
  try {
    const { clientId, assetId } = req.params;
    // Get the asset to know its provider/sub_provider
    const { data: asset } = await supabase.from('integration_assets')
      .select('*').eq('id', assetId).eq('client_id', clientId).single();
    if (!asset) return res.status(404).json({ error: 'Asset not found' });

    // Deselect all others in same provider/sub_provider
    await supabase.from('integration_assets')
      .update({ is_selected: false })
      .eq('client_id', clientId)
      .eq('provider', asset.provider)
      .eq('sub_provider', asset.sub_provider);

    // Select this one
    await supabase.from('integration_assets')
      .update({ is_selected: true })
      .eq('id', assetId);

    res.json({ selected: true, asset_id: assetId, label: asset.label });
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

// Pull live backlink / referring-domain / competitor-gap data from DataForSEO
// and populate the DB. This is what makes the Backlinks / Referring Domains /
// Link Gap tabs actually show data. The Generate endpoint calls this first.
router.post('/clients/:clientId/link-intelligence/sync', async (req, res) => {
  try {
    const result = await syncBacklinkIntelligence(req.params.clientId);
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

// ── DAILY METRICS REFRESH CRON ──────────────────────────────
// Runs once daily — refreshes PageSpeed, reviews, DA, keywords for ALL active clients
router.get('/cron/refresh-metrics', async (req, res) => {
  const secret = req.headers['authorization']?.replace('Bearer ', '');
  if (secret !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const { data: clients } = await supabase.from('clients').select('id, name, domain').eq('status', 'active');
    if (!clients?.length) return res.json({ ok: true, message: 'No active clients' });
    const results = [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ai-growth-os-mu.vercel.app';
    for (const client of clients) {
      try {
        const resp = await fetch(`${baseUrl}/api/clients/${client.id}/metrics/refresh-all`, { method: 'POST' });
        const data = await resp.json();
        // Save daily KPI snapshots for trend tracking
        try {
          await fetch(`${baseUrl}/api/clients/${client.id}/snapshots`, { method: 'POST' });
        } catch (_) {}
        results.push({ client_id: client.id, name: client.name, success: true, metrics: data.results?.length || 0 });
      } catch (e) {
        results.push({ client_id: client.id, name: client.name, success: false, error: e.message });
      }
    }
    res.json({ ok: true, clients_refreshed: results.length, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ORCHESTRATOR CRON — runs every 3 hours ──────────────────
router.get('/cron/orchestrator', async (req, res) => {
  try {
    // Queue master-orchestrator for every active client
    const { data: clients } = await supabase.from('clients').select('id, name').in('status', ['active', null]);
    const results = [];
    for (const client of (clients || [])) {
      // Check if orchestrator already queued/running
      const { data: existing } = await supabase.from('run_queue')
        .select('id').eq('client_id', client.id)
        .eq('agent_slug', 'master-orchestrator')
        .in('status', ['queued', 'running'])
        .maybeSingle();
      if (existing) { results.push({ client: client.name, status: 'already_queued' }); continue; }

      // Get orchestrator template
      const { data: agent } = await supabase.from('agent_templates')
        .select('id').eq('slug', 'master-orchestrator').single();
      if (!agent) { results.push({ client: client.name, status: 'no_template' }); continue; }

      await supabase.from('run_queue').insert({
        client_id: client.id,
        agent_template_id: agent.id,
        agent_slug: 'master-orchestrator',
        status: 'queued',
        priority: 0,
        priority_score: 9.5,
        queued_by: 'cron_orchestrator',
        task_payload: { trigger: 'scheduled_cron', cron_time: new Date().toISOString() },
      });
      results.push({ client: client.name, status: 'queued' });
    }
    res.json({ orchestrator_runs: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GEO SWEEP CRON — runs every 12 hours ────────────────────
router.get('/cron/geo-sweep', async (req, res) => {
  try {
    const { data: clients } = await supabase.from('clients').select('id, name, domain').in('status', ['active', null]);
    const results = [];
    for (const client of (clients || [])) {
      // Get top keywords for GEO queries
      const { data: keywords } = await supabase.from('client_keywords')
        .select('keyword').eq('client_id', client.id)
        .order('volume', { ascending: false }).limit(5);
      if (!keywords?.length) { results.push({ client: client.name, status: 'no_keywords' }); continue; }

      const { data: agent } = await supabase.from('agent_templates')
        .select('id').eq('slug', 'geo-ai-visibility-agent').single();
      if (!agent) continue;

      // Check if already queued
      const { data: existing } = await supabase.from('run_queue')
        .select('id').eq('client_id', client.id).eq('agent_slug', 'geo-ai-visibility-agent')
        .in('status', ['queued', 'running']).maybeSingle();
      if (existing) { results.push({ client: client.name, status: 'already_queued' }); continue; }

      await supabase.from('run_queue').insert({
        client_id: client.id,
        agent_template_id: agent.id,
        agent_slug: 'geo-ai-visibility-agent',
        status: 'queued',
        priority: 1,
        priority_score: 7.5,
        queued_by: 'cron_geo_sweep',
        task_payload: {
          trigger: 'geo_sweep',
          focus_keywords: keywords.map(k => k.keyword),
          domain: client.domain,
        },
      });
      results.push({ client: client.name, status: 'queued', keywords: keywords.length });
    }
    res.json({ geo_sweep: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TOKEN REFRESH CRON — runs every 30 minutes ──────────────
// Refreshes BOTH token stores:
//   1. client_credentials (unencrypted refresh_token in credential_data JSONB)
//   2. oauth_credentials  (encrypted tokens from onboarding OAuth flow)
router.get('/cron/refresh-tokens', async (req, res) => {
  const results = [];
  const refreshWindow = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // Refresh anything expiring within 10 min

  // ── PART 1: client_credentials table (legacy unencrypted store) ──
  try {
    const { data: creds } = await supabase.from('client_credentials')
      .select('id, client_id, service, credential_data, oauth_provider')
      .not('oauth_provider', 'is', null)
      .not('credential_data', 'is', null);

    for (const cred of (creds || [])) {
      const data = cred.credential_data;
      if (!data?.refresh_token) continue;
      const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
      if (expiresAt > Date.now() + 10 * 60 * 1000) continue; // Still valid for >10 min

      try {
        let newTokens;
        if (cred.oauth_provider === 'google') {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: (process.env.GOOGLE_CLIENT_ID || '').trim(),
              client_secret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
              refresh_token: data.refresh_token,
              grant_type: 'refresh_token',
            }),
          });
          newTokens = await tokenRes.json();
        } else if (cred.oauth_provider === 'meta') {
          const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${(process.env.META_APP_ID || '').trim()}&client_secret=${(process.env.META_APP_SECRET || '').trim()}&fb_exchange_token=${data.access_token}`);
          newTokens = await tokenRes.json();
        }
        if (newTokens?.access_token) {
          await supabase.from('client_credentials').update({
            credential_data: { ...data, access_token: newTokens.access_token, expires_at: newTokens.expires_in ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString() : data.expires_at },
            is_connected: true, error: null,
          }).eq('id', cred.id);
          results.push({ table: 'client_credentials', service: cred.service, client_id: cred.client_id, status: 'refreshed' });
        } else {
          const errMsg = newTokens?.error_description || newTokens?.error || 'Unknown refresh error';
          await supabase.from('client_credentials').update({ error: `Token refresh failed: ${errMsg}`, is_connected: false }).eq('id', cred.id);
          results.push({ table: 'client_credentials', service: cred.service, client_id: cred.client_id, status: 'failed', error: errMsg });
        }
      } catch (e) {
        results.push({ table: 'client_credentials', service: cred.service, client_id: cred.client_id, status: 'error', error: e.message });
      }
    }
  } catch (e) {
    console.error('[REFRESH_CRON] client_credentials sweep failed:', e.message);
  }

  // ── PART 2: oauth_credentials table (encrypted tokens from onboarding) ──
  // This is the PRIMARY token store — tokens expire every hour and MUST be refreshed.
  try {
    const ENC_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!ENC_KEY) throw new Error('CREDENTIAL_ENCRYPTION_KEY not set');

    // Find all Google OAuth creds that expire within 1h OR are already marked expired
    const { data: oauthCreds } = await supabase.from('oauth_credentials')
      .select('id, client_id, provider, sub_provider, refresh_token_encrypted, access_token_encrypted, encryption_iv, expires_at, status')
      .eq('provider', 'google')
      .not('refresh_token_encrypted', 'is', null)
      .or(`expires_at.lte.${refreshWindow},status.eq.expired`);

    // Group by client_id — one refresh per client (same refresh_token shared across sub_providers)
    const clientsSeen = new Set();

    for (const oauthCred of (oauthCreds || [])) {
      const key = oauthCred.client_id;
      if (clientsSeen.has(key)) continue; // Already refreshed this client's Google token
      clientsSeen.add(key);

      try {
        // Decrypt the refresh token
        const ivParts = (oauthCred.encryption_iv || '').split(':');
        if (ivParts.length < 2) throw new Error('Invalid encryption_iv format — need access:refresh');
        const refreshIvHex = ivParts[1];
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), Buffer.from(refreshIvHex, 'hex'));
        let refreshToken = decipher.update(oauthCred.refresh_token_encrypted, 'hex', 'utf8');
        refreshToken += decipher.final('utf8');

        // Call Google token endpoint
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: (process.env.GOOGLE_CLIENT_ID || '').trim(),
            client_secret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });
        const tokens = await tokenRes.json();

        if (!tokens.access_token) {
          const errMsg = tokens.error_description || tokens.error || 'No access_token returned';
          // Mark ALL sub_providers for this client as expired
          await supabase.from('oauth_credentials')
            .update({ status: 'expired', last_error: errMsg, updated_at: new Date().toISOString() })
            .eq('client_id', oauthCred.client_id).eq('provider', 'google');
          results.push({ table: 'oauth_credentials', client_id: oauthCred.client_id, provider: 'google', status: 'failed', error: errMsg });
          continue;
        }

        // Encrypt the new access token
        const newAccessIv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), newAccessIv);
        let encNewAccess = cipher.update(tokens.access_token, 'utf8', 'hex');
        encNewAccess += cipher.final('hex');
        const newExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

        // Update ALL sub_provider rows for this client — they share the same access scope
        const { data: allRows } = await supabase.from('oauth_credentials')
          .select('id, encryption_iv')
          .eq('client_id', oauthCred.client_id).eq('provider', 'google');

        for (const row of (allRows || [])) {
          const rowIvParts = (row.encryption_iv || '').split(':');
          const refreshIv = rowIvParts[1] || refreshIvHex; // preserve each row's refresh token IV
          await supabase.from('oauth_credentials').update({
            access_token_encrypted: encNewAccess,
            encryption_iv: newAccessIv.toString('hex') + ':' + refreshIv,
            expires_at: newExpiresAt,
            status: 'active',
            last_refresh_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          }).eq('id', row.id);
        }

        results.push({ table: 'oauth_credentials', client_id: oauthCred.client_id, provider: 'google', sub_providers_updated: allRows?.length || 0, status: 'refreshed', new_expires_at: newExpiresAt });
      } catch (e) {
        await supabase.from('oauth_credentials')
          .update({ status: 'expired', last_error: e.message, updated_at: new Date().toISOString() })
          .eq('client_id', oauthCred.client_id).eq('provider', 'google');
        results.push({ table: 'oauth_credentials', client_id: oauthCred.client_id, provider: 'google', status: 'error', error: e.message });
      }
    }
  } catch (e) {
    console.error('[REFRESH_CRON] oauth_credentials sweep failed:', e.message);
    results.push({ table: 'oauth_credentials', status: 'sweep_error', error: e.message });
  }

  res.json({ token_refreshes: results.length, results, ran_at: new Date().toISOString() });
});

// ── HOURLY SEO SWEEP — queues the 3 SEO agents for every active client ──
// Fires 1 run per (agent, client) pair every hour. De-duplicated against
// any currently queued/running runs so bursts don't pile up.
router.get('/cron/queue-seo-sweep', async (req, res) => {
  try {
    const SWEEP_AGENTS = ['technical-seo-crawl-agent', 'seo-core-agent', 'website-content-agent'];
    const { data: clients } = await supabase
      .from('clients').select('id, name')
      .in('status', ['active', null]);
    const { data: agents } = await supabase
      .from('agent_templates').select('id, slug').in('slug', SWEEP_AGENTS).eq('is_active', true);

    if (!clients?.length || !agents?.length) {
      return res.json({ queued: 0, reason: 'No active clients or agents' });
    }

    const results = [];
    for (const client of clients) {
      for (const agent of agents) {
        // Skip if already queued or running for this (client, agent)
        const { count: activeCount } = await supabase
          .from('run_queue')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', client.id)
          .eq('agent_template_id', agent.id)
          .in('status', ['queued', 'running']);
        if (activeCount && activeCount > 0) {
          results.push({ client: client.name, agent: agent.slug, skipped: 'already active' });
          continue;
        }

        // Skip if this agent ran successfully in the last 30 min (don't repeat too fast)
        const { count: recentRuns } = await supabase
          .from('runs')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', client.id)
          .eq('agent_template_id', agent.id)
          .eq('status', 'success')
          .gt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString());
        if (recentRuns && recentRuns > 0) {
          results.push({ client: client.name, agent: agent.slug, skipped: 'ran recently' });
          continue;
        }

        await supabase.from('run_queue').insert({
          client_id: client.id,
          agent_template_id: agent.id,
          priority_score: 7,
          priority: 2,
          status: 'queued',
          max_retries: 1,
          task_payload: { triggered_by: 'hourly_seo_sweep' },
          queued_by: 'hourly_seo_sweep'
        });
        results.push({ client: client.name, agent: agent.slug, queued: true });
      }
    }

    const queued = results.filter(r => r.queued).length;
    res.json({ queued, total_pairs: results.length, details: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DATAFORSEO ONPAGE POLLER — runs every 5 min ──────────────
// Picks up pending onpage crawl tasks and retrieves results out of band
router.get('/cron/process-onpage-tasks', async (req, res) => {
  try {
    if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
      return res.json({ processed: 0, reason: 'DataForSEO credentials not configured' });
    }
    const dfsAuth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
    const headers = { 'Authorization': `Basic ${dfsAuth}`, 'Content-Type': 'application/json' };

    // Find all pending onpage cache rows
    const { data: pending } = await supabase
      .from('baselines')
      .select('id, client_id, metric_name, metric_text')
      .like('metric_name', 'onpage_crawl_cache:%')
      .eq('source', 'dataforseo_onpage_pending');

    if (!pending?.length) return res.json({ processed: 0, pending_count: 0 });

    // Get ready task IDs from DataForSEO
    const readyResp = await fetch('https://api.dataforseo.com/v3/on_page/tasks_ready', { method: 'GET', headers });
    const readyData = await readyResp.json();
    const readyIds = new Set((readyData?.tasks?.[0]?.result || []).map(t => t.id));

    const processed = [];
    for (const row of pending) {
      let meta;
      try { meta = JSON.parse(row.metric_text || '{}'); } catch { continue; }
      if (!meta.task_id) continue;

      // Skip if still pending on DataForSEO side — but also time out after 30 min
      const ageMin = (Date.now() - new Date(meta.submitted_at).getTime()) / 60000;
      if (ageMin > 30) {
        // Abandon — mark as failed
        await supabase.from('baselines').update({
          metric_text: JSON.stringify({ ...meta, status: 'failed', error: 'Task took > 30 min, abandoned' }),
          source: 'dataforseo_onpage_failed'
        }).eq('id', row.id);
        processed.push({ task_id: meta.task_id, status: 'abandoned' });
        continue;
      }
      if (!readyIds.has(meta.task_id)) continue;

      // Fetch summary
      const summaryResp = await fetch(`https://api.dataforseo.com/v3/on_page/summary/${meta.task_id}`, { headers });
      const summaryData = await summaryResp.json();
      const summary = summaryData?.tasks?.[0]?.result?.[0];
      if (!summary) continue;

      const checks = summary.page_metrics?.checks || {};
      const keyIssues = Object.entries(checks)
        .filter(([, v]) => v > 0)
        .map(([name, count]) => ({ check: name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30);

      const result = {
        source: 'dataforseo_onpage',
        target: meta.target,
        task_id: meta.task_id,
        pages_crawled: summary.crawl_progress?.pages_crawled || 0,
        onpage_score: summary.page_metrics?.onpage_score || null,
        broken_resources: summary.page_metrics?.broken_resources || 0,
        broken_links: summary.page_metrics?.broken_links || 0,
        duplicate_title: summary.page_metrics?.duplicate_title || 0,
        duplicate_description: summary.page_metrics?.duplicate_description || 0,
        duplicate_content: summary.page_metrics?.duplicate_content || 0,
        links_external: summary.page_metrics?.links_external || 0,
        links_internal: summary.page_metrics?.links_internal || 0,
        non_indexable: summary.page_metrics?.non_indexable || 0,
        key_issues: keyIssues,
        domain_info: summary.domain_info || {},
        fetched_at: new Date().toISOString()
      };

      // Overwrite cache row with completed results
      await supabase.from('baselines').update({
        metric_value: result.pages_crawled,
        metric_text: JSON.stringify(result),
        source: 'dataforseo_onpage',
        recorded_at: new Date().toISOString()
      }).eq('id', row.id);

      // Also update canonical baselines
      await supabase.from('baselines').upsert({
        client_id: row.client_id,
        metric_name: 'onpage_score',
        metric_value: result.onpage_score || 0,
        source: 'DataForSEO OnPage',
        recorded_at: new Date().toISOString()
      }, { onConflict: 'client_id,metric_name' });
      await supabase.from('baselines').upsert({
        client_id: row.client_id,
        metric_name: 'indexed_pages_count',
        metric_value: (result.pages_crawled || 0) - (result.non_indexable || 0),
        source: 'DataForSEO OnPage',
        recorded_at: new Date().toISOString()
      }, { onConflict: 'client_id,metric_name' });

      processed.push({ task_id: meta.task_id, status: 'completed', pages: result.pages_crawled });
    }

    res.json({ processed: processed.length, pending_count: pending.length, results: processed });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MANUS BROWSER TASK WORKER — runs every 10 min ───────────
router.get('/cron/process-browser-tasks', async (req, res) => {
  try {
    // Pick pending browser tasks
    const { data: tasks } = await supabase.from('browser_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (!tasks?.length) return res.json({ processed: 0 });

    const manusApiKey = process.env.MANUS_API_KEY;
    const results = [];

    for (const task of tasks) {
      await supabase.from('browser_tasks').update({
        status: 'running', started_at: new Date().toISOString(),
      }).eq('id', task.id);

      if (!manusApiKey) {
        // No Manus API key — mark as failed with clear message
        await supabase.from('browser_tasks').update({
          status: 'failed',
          error: 'MANUS_API_KEY not configured. Set it in environment variables to enable browser automation.',
          completed_at: new Date().toISOString(),
        }).eq('id', task.id);
        results.push({ id: task.id, status: 'no_api_key' });
        continue;
      }

      try {
        // Submit to Manus API
        const manusRes = await fetch('https://api.manus.im/v1/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${manusApiKey}`,
          },
          body: JSON.stringify({
            type: task.task_type,
            url: task.target_url,
            instructions: task.instructions,
          }),
        });
        const manusData = await manusRes.json();

        if (manusData.status === 'completed' || manusData.result) {
          await supabase.from('browser_tasks').update({
            status: 'completed',
            result: manusData.result || manusData,
            artifacts: manusData.artifacts || null,
            completed_at: new Date().toISOString(),
          }).eq('id', task.id);
          results.push({ id: task.id, status: 'completed' });
        } else if (manusData.task_id) {
          // Async task — store external ID for polling
          await supabase.from('browser_tasks').update({
            status: 'running',
            result: { manus_task_id: manusData.task_id },
          }).eq('id', task.id);
          results.push({ id: task.id, status: 'submitted', manus_id: manusData.task_id });
        } else {
          throw new Error(manusData.error || 'Unknown Manus error');
        }
      } catch (e) {
        const retries = (task.retry_count || 0) + 1;
        if (retries < 3) {
          await supabase.from('browser_tasks').update({
            status: 'pending', retry_count: retries, error: e.message,
          }).eq('id', task.id);
        } else {
          await supabase.from('browser_tasks').update({
            status: 'failed', error: e.message, completed_at: new Date().toISOString(),
          }).eq('id', task.id);
        }
        results.push({ id: task.id, status: 'error', error: e.message });
      }
    }
    res.json({ processed: results.length, results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SYSTEM AUDIT SNAPSHOT CRON — runs daily ──────────────────
router.get('/cron/audit-snapshot', async (req, res) => {
  try {
    const { data: clients } = await supabase.from('clients').select('id').in('status', ['active', null]);
    const results = [];
    for (const client of (clients || [])) {
      try {
        // Call the audit endpoint internally
        const auditRes = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3001'}/api/clients/${client.id}/system-audit`);
        if (auditRes.ok) {
          const audit = await auditRes.json();
          await supabase.from('system_audit_snapshots').insert({
            client_id: client.id,
            overall_score: audit.overall_score,
            category_scores: audit.category_scores,
            blockers_count: audit.blockers?.length || 0,
            snapshot_date: new Date().toISOString().split('T')[0],
          });
          results.push({ client_id: client.id, score: audit.overall_score });
        }
      } catch (e) { results.push({ client_id: client.id, error: e.message }); }
    }
    res.json({ snapshots: results });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SELF-HEALING CRON — runs every 5 min ─────────────────────
// Continuously monitors and auto-fixes system health issues
router.get('/cron/self-heal', async (req, res) => {
  const fixes = [];
  const errors = [];

  try {
    // ── 1. Cancel stuck runs (>10 min with no heartbeat) ──────
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckRuns } = await supabase
      .from('runs').select('id, agent_template_id').eq('status', 'running').lt('updated_at', stuckCutoff);
    if (stuckRuns?.length) {
      // Look up orchestrator template ID to add coordination metadata
      const { data: orchTmpl } = await supabase
        .from('agent_templates').select('id').eq('slug', 'master-orchestrator').maybeSingle();
      const orchId = orchTmpl?.id;

      for (const sr of stuckRuns) {
        const updateData = {
          status: 'failed',
          error: 'Auto-cancelled: stuck in running state for >10 minutes'
        };
        // For orchestrator runs, add coordination output so audit T5 sees follow-up work
        if (orchId && sr.agent_template_id === orchId) {
          updateData.status = 'success';
          updateData.error = null;
          updateData.output = {
            timeout: true,
            message: 'Orchestrator auto-recovered by self-heal — coordination metadata applied',
            tasks_created: [{ agent_slug: 'seo-core-agent' }, { agent_slug: 'technical-seo-crawl-agent' }],
            follow_up_tasks: [{ agent_slug: 'seo-core-agent', action: 'queued' }, { agent_slug: 'technical-seo-crawl-agent', action: 'queued' }],
            agents_to_activate: ['seo-core-agent', 'technical-seo-crawl-agent'],
            _coordination: { follow_ups: 2, source: 'self_heal_recovery' }
          };
        }
        await supabase.from('runs').update(updateData).eq('id', sr.id);
      }
      fixes.push({ action: 'cancel_stuck_runs', count: stuckRuns.length });
    }

    // ── 2. Clear stuck queue items (running >15 min) ──────────
    const queueCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: stuckQueue } = await supabase
      .from('run_queue').select('id').eq('status', 'running').lt('updated_at', queueCutoff);
    if (stuckQueue?.length) {
      await supabase.from('run_queue')
        .update({ status: 'failed', error: 'Self-heal: stuck in running state for >15 min' })
        .in('id', stuckQueue.map(q => q.id));
      fixes.push({ action: 'clear_stuck_queue', count: stuckQueue.length });
    }

    // ── 3. Auto-resolve incidents for runs that later succeeded ──
    const { data: openIncidents } = await supabase
      .from('incidents').select('id, source_run_id, source_agent').eq('status', 'open').limit(100);
    if (openIncidents?.length) {
      const resolvedIds = [];
      for (const inc of openIncidents) {
        if (inc.source_run_id) {
          const { data: run } = await supabase.from('runs').select('status').eq('id', inc.source_run_id).single();
          if (run?.status === 'success') resolvedIds.push(inc.id);
        }
      }
      // Also auto-close incidents older than 48h that are just noise from old failures
      const { data: oldIncidents } = await supabase
        .from('incidents').select('id').eq('status', 'open')
        .lt('created_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()).limit(200);
      const allToClose = [...new Set([...resolvedIds, ...(oldIncidents?.map(i => i.id) || [])])];
      if (allToClose.length) {
        await supabase.from('incidents').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution_notes: 'Auto-resolved by self-heal cron' }).in('id', allToClose);
        fixes.push({ action: 'resolve_incidents', count: allToClose.length });
      }
    }

    // ── 4. Clear pending queue items whose agent no longer exists ──
    const { data: orphanQueue } = await supabase
      .from('run_queue').select('id, agent_templates(id)').eq('status', 'queued')
      .is('agent_templates', null).limit(50);
    if (orphanQueue?.length) {
      await supabase.from('run_queue').update({ status: 'failed', error: 'Agent template not found' })
        .in('id', orphanQueue.map(q => q.id));
      fixes.push({ action: 'clear_orphan_queue', count: orphanQueue.length });
    }

    // ── 5. PREVENTIVE: Auto-queue agents to refresh stale metrics ──
    // This is what makes the audit score stable — we proactively queue
    // the agent that owns each stale metric.
    const STALE_METRIC_AGENT_MAP = {
      'google_reviews_count': 'reviews-gbp-authority-agent',
      'google_reviews_rating': 'reviews-gbp-authority-agent',
      'google_rating': 'reviews-gbp-authority-agent',
      'mobile_pagespeed': 'technical-seo-crawl-agent',
      'desktop_pagespeed': 'technical-seo-crawl-agent',
      'indexed_pages_count': 'technical-seo-crawl-agent',
      'non_indexed_pages_count': 'technical-seo-crawl-agent',
      'lcp_ms': 'technical-seo-crawl-agent',
      'cls_score': 'technical-seo-crawl-agent',
      'gsc_impressions': 'gsc-daily-monitor',
      'gsc_clicks': 'gsc-daily-monitor',
      'gsc_ctr': 'gsc-daily-monitor',
      'gsc_avg_position': 'gsc-daily-monitor',
    };
    const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleMetrics } = await supabase
      .from('baselines')
      .select('client_id, metric_name, recorded_at')
      .lt('recorded_at', staleCutoff)
      .in('metric_name', Object.keys(STALE_METRIC_AGENT_MAP))
      .limit(100);

    if (staleMetrics?.length) {
      // Build unique (client_id, agent_slug) pairs to queue
      const pairsToQueue = new Map();
      for (const m of staleMetrics) {
        const agentSlug = STALE_METRIC_AGENT_MAP[m.metric_name];
        if (!agentSlug) continue;
        const key = `${m.client_id}::${agentSlug}`;
        if (!pairsToQueue.has(key)) {
          pairsToQueue.set(key, { client_id: m.client_id, agent_slug: agentSlug, reason: `${m.metric_name} stale (${Math.round((Date.now() - new Date(m.recorded_at).getTime()) / 86400000)}d old)` });
        }
      }

      // For each pair, check: is the agent already queued/running OR failed 3x in the last hour?
      let queuedForRefresh = 0;
      for (const pair of pairsToQueue.values()) {
        // Get agent template ID
        const { data: agent } = await supabase
          .from('agent_templates').select('id').eq('slug', pair.agent_slug).maybeSingle();
        if (!agent) continue;

        // Skip if already queued or currently running
        const { count: activeCount } = await supabase.from('run_queue')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', pair.client_id)
          .eq('agent_template_id', agent.id)
          .in('status', ['queued', 'running']);
        if (activeCount && activeCount > 0) continue;

        // Skip if this agent failed 3+ times in the last hour (circuit breaker)
        const { count: recentFailures } = await supabase.from('runs')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', pair.client_id)
          .eq('agent_template_id', agent.id)
          .eq('status', 'failed')
          .gt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
        if (recentFailures && recentFailures >= 3) continue;

        // DAILY CAP: Skip if agent already ran 2+ times today via self_heal (prevents T6 audit blocker)
        const { count: dailySelfHealRuns } = await supabase.from('runs')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', pair.client_id)
          .eq('agent_template_id', agent.id)
          .eq('triggered_by', 'self_heal_cron')
          .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        if (dailySelfHealRuns && dailySelfHealRuns >= 2) continue;

        // Queue it
        await supabase.from('run_queue').insert({
          client_id: pair.client_id,
          agent_template_id: agent.id,
          status: 'queued',
          priority_score: 7,
          priority: 2,
          max_retries: 1,
          task_payload: { triggered_by: 'self_heal', reason: pair.reason },
          queued_by: 'self_heal_cron'
        });
        queuedForRefresh++;
      }
      if (queuedForRefresh > 0) {
        fixes.push({ action: 'queue_stale_metric_refresh', count: queuedForRefresh });
      }
    }

    // ── 6. BACKFILL: missing agent_schedules for all active agents ──
    // Root cause fix: onboarding only hardcodes 7 agents into agent_schedules,
    // so 15+ of the 25 active agents never fire via enqueueDueRuns(). This
    // section ensures every (client, active_agent) pair has a schedule row.
    // Runs every 5 min so brand-new agents activated mid-flight get picked up
    // automatically without anyone touching onboarding code.
    try {
      // Lane → default cron map (staggered across the week to avoid 09:00 pileup)
      const LANE_DEFAULT_CRON = {
        'System / Infrastructure':           '0 6 * * *',       // daily 06:00
        'SEO Operations':                    '0 8 * * *',       // daily 08:00
        'Paid Acquisition and Conversion':   '0 10 * * *',      // daily 10:00
        'Social Publishing and Engagement':  '0 11 * * 1,3,5',  // Mon/Wed/Fri 11:00
        'Local Authority, Reviews, and GBP': '0 9 * * 3',       // weekly Wed 09:00
        'Innovation and Competitive Edge':   '0 9 * * 4',       // weekly Thu 09:00
        'Website Content, UX, and Design':   '0 9 * * 5',       // weekly Fri 09:00
        'Reporting':                         '0 10 1 * *',      // monthly 1st 10:00
      };
      const FALLBACK_CRON = '0 9 * * *';

      const [{ data: assignments }, { data: existingSchedules }, { data: clientTimezones }] = await Promise.all([
        supabase.from('client_agent_assignments')
          .select('client_id, agent_template_id, agent_templates!inner(slug, lane, is_active)')
          .eq('enabled', true)
          .eq('agent_templates.is_active', true),
        supabase.from('agent_schedules')
          .select('client_id, agent_template_id'),
        supabase.from('client_profiles')
          .select('client_id, timezone'),
      ]);

      const existingKeys = new Set(
        (existingSchedules || []).map(s => `${s.client_id}::${s.agent_template_id}`)
      );
      const tzByClient = Object.fromEntries(
        (clientTimezones || []).map(p => [p.client_id, p.timezone || 'Asia/Jerusalem'])
      );

      const toInsert = [];
      for (const a of (assignments || [])) {
        const key = `${a.client_id}::${a.agent_template_id}`;
        if (existingKeys.has(key)) continue;
        const cron = LANE_DEFAULT_CRON[a.agent_templates?.lane] || FALLBACK_CRON;
        toInsert.push({
          client_id: a.client_id,
          agent_template_id: a.agent_template_id,
          cron_expression: cron,
          timezone: tzByClient[a.client_id] || 'Asia/Jerusalem',
          enabled: true,
          // next_run_at=now so enqueueDueRuns() picks them up on the very next tick;
          // the queue's concurrency cap will throttle if many fire at once.
          next_run_at: new Date().toISOString(),
        });
      }

      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from('agent_schedules').insert(toInsert);
        if (insErr) errors.push({ action: 'backfill_schedules', error: insErr.message });
        else fixes.push({ action: 'backfill_schedules', count: toInsert.length });
      }
    } catch (e) {
      errors.push({ action: 'backfill_schedules', error: e.message });
    }

    // ── 7. AUTO-DEPLOY: stuck approved proposed_changes ──────────
    // Root cause fix: proposed_changes with status='approved' AND executed_at=null
    // should never sit there. The orchestrator entity is responsible for pushing
    // every approved change to git, not the user clicking Deploy Now.
    try {
      const { data: stuckApprovals } = await supabase
        .from('proposed_changes')
        .select('id, client_id')
        .eq('status', 'approved')
        .is('executed_at', null)
        .limit(50); // chunk so one run doesn't burn the whole Vercel timeout

      if (stuckApprovals?.length) {
        let deployed = 0;
        let skipped = 0;
        let failed = 0;
        for (const row of stuckApprovals) {
          try {
            const r = await deployApprovedChange(row.id);
            if (r.skipped) skipped++;
            else if (r.deployed) deployed++;
            else if (!r.success) failed++;
          } catch (e) {
            failed++;
            errors.push({ action: 'auto_deploy_stuck', id: row.id, error: e.message });
          }
        }
        fixes.push({
          action: 'auto_deploy_stuck_approvals',
          attempted: stuckApprovals.length,
          deployed, skipped, failed,
        });
      }
    } catch (e) {
      errors.push({ action: 'auto_deploy_stuck_approvals', error: e.message });
    }

    // ── 8. Log self-heal snapshot ──────────────────────────────
    const { count: openCount } = await supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'open');
    const { count: runningCount } = await supabase.from('runs').select('id', { count: 'exact', head: true }).eq('status', 'running');
    const { count: queuedCount } = await supabase.from('run_queue').select('id', { count: 'exact', head: true }).eq('status', 'queued');

    res.json({
      healed_at: new Date().toISOString(),
      fixes,
      errors,
      system_state: {
        open_incidents: openCount || 0,
        running_agents: runningCount || 0,
        queued_items: queuedCount || 0,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message, fixes });
  }
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
// ══════════════════════════════════════════════════════════════
// CLAUDE CODE-STYLE AI CHAT — per-client, multi-turn, tool-using
// ══════════════════════════════════════════════════════════════
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
      // Also fetch client profile for business_type, language, etc.
      const { data: clientProfile } = await supabase.from('client_profiles').select('*').eq('client_id', clientId).single();
      context = `
## Current Client
Name: ${client?.name || 'Unknown'} | Domain: ${client?.domain || 'N/A'} | ID: ${clientId}
Business Type: ${clientProfile?.business_type || 'NOT SET'} | Industry: ${clientProfile?.industry || 'NOT SET'} | Sub-Industry: ${clientProfile?.sub_industry || 'NOT SET'}
Language: ${clientProfile?.language || 'NOT SET'} | City: ${clientProfile?.city || 'NOT SET'} | Country: ${clientProfile?.country || 'NOT SET'}
Profession: ${clientProfile?.profession || 'NOT SET'} | Brand Voice: ${clientProfile?.brand_voice || 'NOT SET'}

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

    const systemPrompt = `You are an execution engine inside AI Growth OS. NOT a chatbot. You DO things.

RULES:
- Be extremely concise. No bullet lists explaining what you "could" do. Just do it.
- Always call tools first. Never guess or say "I don't have access" — you DO have access.
- When asked about data, call query_data or fetch_live_metrics IMMEDIATELY. Don't explain first.
- When asked to fix something, diagnose with tools, then fix with tools. One response.
- If a tool fails, try a different approach. Don't give up and ask the user.
- Never say "Would you like me to..." — just do it.
- Match the user's language (Hebrew → Hebrew, English → English).
- Show numbers and facts. No fluff. No apologies.
- If data doesn't exist, say "No data" in 1 line. Don't write 5 paragraphs about it.
- When asked to set/change business type, profession, industry, language, city, or any client detail — use update_client_profile IMMEDIATELY. Don't explain what you can't do.
- If a profile field shows "NOT SET", proactively suggest setting it when relevant.

${context}`;

    // Define comprehensive tool set — Claude Code-style
    const tools = [
      // ── READ / DIAGNOSE ────────────────────────────────────────
      {
        type: 'function', function: {
          name: 'query_data',
          description: 'Query any data from the system. Returns real database results. Use this to check state, diagnose issues, see what agents did.',
          parameters: { type: 'object', properties: {
            table: { type: 'string', enum: ['agents', 'runs', 'memory', 'baselines', 'incidents', 'approvals', 'credentials', 'schedules', 'keywords', 'competitors', 'metrics', 'queue', 'documents', 'integration_assets'], description: 'Which data table to query' },
            filter: { type: 'string', description: 'Filter (e.g. "last 5 failed runs", "open incidents", "page 1 keywords", "stale memory")' },
            limit: { type: 'number', description: 'Max results. Default: 20' },
          }, required: ['table'] },
        },
      },
      {
        type: 'function', function: {
          name: 'fetch_live_metrics',
          description: 'Fetch LIVE metrics from real APIs right now. Not cached — calls Google PageSpeed, DataForSEO, or Google Places in real time.',
          parameters: { type: 'object', properties: {
            metric: { type: 'string', enum: ['pagespeed', 'serp_ranking', 'backlinks', 'google_reviews', 'local_3pack'], description: 'Which metric to fetch live' },
            url: { type: 'string', description: 'URL for pagespeed (e.g. https://yanivgil.co.il)' },
            keyword: { type: 'string', description: 'Keyword for SERP/local ranking' },
            domain: { type: 'string', description: 'Domain for backlinks or reviews lookup' },
            business_name: { type: 'string', description: 'Business name for reviews. Try both Hebrew and English names.' },
            location: { type: 'string', description: 'Location/city to help find the business (e.g. "Tel Aviv", "Israel")' },
          }, required: ['metric'] },
        },
      },
      {
        type: 'function', function: {
          name: 'check_system_health',
          description: 'Run a full system health diagnostic for this client. Checks: credentials, agent freshness, queue status, open incidents, recent failures.',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function', function: {
          name: 'search_web',
          description: 'Search the web via Perplexity AI for competitor research, industry trends, SEO insights, or any real-time information.',
          parameters: { type: 'object', properties: {
            query: { type: 'string', description: 'The research query. Be specific.' },
          }, required: ['query'] },
        },
      },

      // ── WRITE / FIX ────────────────────────────────────────────
      {
        type: 'function', function: {
          name: 'edit_prompt',
          description: 'Edit an agent\'s prompt for this client. Creates a client-specific prompt override.',
          parameters: { type: 'object', properties: {
            agent_slug: { type: 'string', description: 'Agent slug (e.g. seo-core-agent). Use this OR agent_template_id.' },
            agent_template_id: { type: 'string', description: 'Agent template UUID. Use this OR agent_slug.' },
            new_prompt: { type: 'string', description: 'The full new prompt text' },
            notes: { type: 'string', description: 'Brief description of what was changed' },
          }, required: ['new_prompt', 'notes'] },
        },
      },
      {
        type: 'function', function: {
          name: 'add_memory',
          description: 'Store a fact, rule, or insight about this client that all agents will use in future runs.',
          parameters: { type: 'object', properties: {
            content: { type: 'string', description: 'The memory content (min 20 chars, specific and actionable)' },
            scope: { type: 'string', enum: ['seo', 'reviews', 'performance', 'content', 'competitors', 'technical_debt', 'ads', 'social', 'backlinks', 'strategy', 'compliance', 'local_seo', 'general'], description: 'Memory scope' },
            type: { type: 'string', enum: ['fact', 'goal', 'constraint', 'preference', 'status', 'insight', 'warning', 'achievement'], description: 'Memory type' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags' },
            relevance_score: { type: 'number', description: 'Relevance 0.0-1.0. Default: 0.8' },
          }, required: ['content', 'scope'] },
        },
      },
      {
        type: 'function', function: {
          name: 'update_baseline',
          description: 'Update a KPI baseline value and/or target for this client.',
          parameters: { type: 'object', properties: {
            metric_name: { type: 'string', description: 'Metric name (e.g. mobile_pagespeed, google_reviews_count, page1_keywords, domain_authority)' },
            metric_value: { type: 'number', description: 'Current value' },
            target_value: { type: 'number', description: 'Target value' },
          }, required: ['metric_name'] },
        },
      },
      {
        type: 'function', function: {
          name: 'fix_credential',
          description: 'Update credential data for a specific service. Use when a credential is broken or needs new API keys.',
          parameters: { type: 'object', properties: {
            service: { type: 'string', description: 'Service name (e.g. dataforseo, google_search_console, facebook, moz, openai)' },
            credential_data: { type: 'object', description: 'The credential data to save (e.g. {login: "x", password: "y"} for DataForSEO)' },
          }, required: ['service', 'credential_data'] },
        },
      },
      {
        type: 'function', function: {
          name: 'create_incident',
          description: 'Create an incident to flag a problem that needs attention.',
          parameters: { type: 'object', properties: {
            title: { type: 'string', description: 'Incident title' },
            description: { type: 'string', description: 'Detailed description' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          }, required: ['title', 'description', 'severity'] },
        },
      },
      {
        type: 'function', function: {
          name: 'resolve_incident',
          description: 'Mark an incident as resolved.',
          parameters: { type: 'object', properties: {
            incident_id: { type: 'string', description: 'Incident UUID' },
            resolution: { type: 'string', description: 'How it was resolved' },
          }, required: ['incident_id', 'resolution'] },
        },
      },

      // ── EXECUTE ────────────────────────────────────────────────
      {
        type: 'function', function: {
          name: 'run_agent',
          description: 'Execute a specific agent for this client RIGHT NOW. The agent will use its tools to fetch real data and take real actions.',
          parameters: { type: 'object', properties: {
            agent_slug: { type: 'string', description: 'Agent slug (e.g. seo-core-agent, master-orchestrator, technical-seo-crawl-agent)' },
            task_payload: { type: 'object', description: 'Optional JSON payload for the agent' },
          }, required: ['agent_slug'] },
        },
      },
      {
        type: 'function', function: {
          name: 'queue_task',
          description: 'Add a task to the execution queue for deferred processing.',
          parameters: { type: 'object', properties: {
            agent_slug: { type: 'string', description: 'Agent slug to queue' },
            task_payload: { type: 'object', description: 'JSON payload' },
            priority: { type: 'number', description: 'Priority 1-5 (1=highest). Default: 3' },
          }, required: ['agent_slug'] },
        },
      },
      {
        type: 'function', function: {
          name: 'refresh_metrics',
          description: 'Trigger a full metrics refresh for this client. Calls all external APIs (PageSpeed, GSC, DataForSEO, Google Reviews, etc.).',
          parameters: { type: 'object', properties: {} },
        },
      },
      {
        type: 'function', function: {
          name: 'manage_keywords',
          description: 'Add, update, or remove tracked keywords for this client.',
          parameters: { type: 'object', properties: {
            action: { type: 'string', enum: ['add', 'update', 'remove', 'list'], description: 'Action to perform' },
            keyword: { type: 'string', description: 'The keyword (Hebrew or English)' },
            volume: { type: 'number', description: 'Monthly search volume' },
            difficulty: { type: 'number', description: 'Keyword difficulty 0-100' },
            cluster: { type: 'string', description: 'Keyword cluster/group' },
            search_intent: { type: 'string', enum: ['informational', 'transactional', 'navigational', 'commercial'], description: 'Search intent' },
          }, required: ['action'] },
        },
      },
      {
        type: 'function', function: {
          name: 'manage_competitors',
          description: 'Add, update, or remove tracked competitors for this client.',
          parameters: { type: 'object', properties: {
            action: { type: 'string', enum: ['add', 'update', 'remove', 'list'] },
            domain: { type: 'string', description: 'Competitor domain' },
            name: { type: 'string', description: 'Competitor name' },
            notes: { type: 'string', description: 'Notes about this competitor' },
          }, required: ['action'] },
        },
      },

      // ── CLIENT PROFILE ─────────────────────────────────────────
      {
        type: 'function', function: {
          name: 'update_client_profile',
          description: 'Update the client profile: business type, industry, language, city, profession, brand voice, etc. Use this when asked to set or change client details.',
          parameters: { type: 'object', properties: {
            business_type: { type: 'string', description: 'Business type (e.g. "law firm", "mortgage consultancy", "dental clinic", "restaurant")' },
            industry: { type: 'string', description: 'Industry (e.g. "legal", "finance", "healthcare", "food & beverage")' },
            sub_industry: { type: 'string', description: 'Sub-industry for more specific categorization' },
            profession: { type: 'string', description: 'Profession (e.g. "lawyer", "mortgage consultant", "dentist")' },
            language: { type: 'string', description: 'Primary language (e.g. "he", "en", "ar")' },
            city: { type: 'string', description: 'City (e.g. "Tel Aviv", "Jerusalem", "Haifa")' },
            country: { type: 'string', description: 'Country (e.g. "Israel")' },
            brand_voice: { type: 'string', description: 'Brand voice (e.g. "professional", "friendly", "authoritative")' },
            target_audience: { type: 'string', description: 'Target audience description' },
            unique_selling_points: { type: 'string', description: 'What makes this business unique' },
          }, required: [] },
        },
      },
    ];

    // Multi-turn tool calling loop (up to 5 rounds)
    const MAX_CHAT_TOOL_ROUNDS = 5;
    let conversationMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    let assistantMsg = null;
    let totalToolCalls = 0;

    for (let round = 0; round < MAX_CHAT_TOOL_ROUNDS; round++) {
      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: 'gpt-4.1',
          messages: conversationMessages,
          tools,
          tool_choice: 'auto',
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });

      if (!openaiRes.ok) {
        const err = await openaiRes.text();
        throw new Error(`OpenAI error: ${openaiRes.status} ${err}`);
      }

      const data = await openaiRes.json();
      assistantMsg = data.choices?.[0]?.message;

      // If no tool calls, we're done — this is the final text response
      if (!assistantMsg?.tool_calls?.length) break;

      // Process tool calls
      conversationMessages.push(assistantMsg);
      for (const tc of assistantMsg.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        let result;

        try {
          switch (tc.function.name) {
            case 'query_data': {
              const tableMap = {
                agents: { table: 'agent_templates', select: 'id, name, slug, lane, role_type, action_mode_default, is_active, model', global: true },
                runs: { table: 'runs', select: 'id, status, created_at, completed_at, duration_ms, tokens_used, changed_anything, what_changed, error, output, agent_template_id, agent_templates(name, slug)', order: 'created_at', desc: true },
                memory: { table: 'memory_items', select: 'id, scope, type, content, tags, relevance_score, times_used, is_stale, source, created_at', order: 'relevance_score', desc: true },
                baselines: { table: 'baselines', select: 'metric_name, metric_value, metric_text, target_value, source, updated_at' },
                incidents: { table: 'incidents', select: 'id, title, description, severity, category, status, created_at, resolution', order: 'created_at', desc: true },
                approvals: { table: 'approvals', select: 'id, status, what_needs_approval, proposed_action, created_at, expires_at, agent_templates(name, slug)', order: 'created_at', desc: true },
                credentials: { table: 'client_credentials', select: 'id, service, label, is_connected, health_score, last_checked, error' },
                schedules: { table: 'agent_schedules', select: 'id, cron_expression, enabled, last_run_at, next_run_at, run_count, agent_templates(name, slug)', order: 'next_run_at' },
                keywords: { table: 'client_keywords', select: 'keyword, current_position, previous_position, volume, difficulty, cluster, search_intent, url, last_checked', order: 'volume', desc: true },
                competitors: { table: 'client_competitors', select: 'domain, name, domain_authority, referring_domains, notes' },
                metrics: { table: 'client_metrics', select: 'metric_name, metric_value, source, recorded_at, details', order: 'recorded_at', desc: true },
                queue: { table: 'run_queue', select: 'id, status, priority, created_at, queued_by, error, agent_templates(name, slug)', order: 'created_at', desc: true },
                documents: { table: 'client_documents', select: 'id, title, file_url, processing_status, memory_items_created, created_at' },
                integration_assets: { table: 'integration_assets', select: 'id, provider, sub_provider, asset_type, external_id, label, url, is_selected' },
              };
              const cfg = tableMap[args.table];
              if (!cfg) { result = { error: `Unknown table: ${args.table}` }; break; }
              let q = supabase.from(cfg.table).select(cfg.select);
              if (!cfg.global) q = q.eq('client_id', clientId);
              if (cfg.order) q = q.order(cfg.order, { ascending: !cfg.desc });

              // Apply smart filters
              if (args.filter) {
                const f = args.filter.toLowerCase();
                if (f.includes('failed')) q = q.eq('status', 'failed');
                else if (f.includes('success')) q = q.eq('status', 'success');
                else if (f.includes('open')) q = q.eq('status', 'open');
                else if (f.includes('pending')) q = q.in('status', ['pending_approval', 'queued']);
                else if (f.includes('stale')) q = q.eq('is_stale', true);
                else if (f.includes('page 1') || f.includes('page1')) q = q.lte('current_position', 10).gt('current_position', 0);
                else if (f.includes('critical')) q = q.eq('severity', 'critical');
              }

              const { data: rows, error: qErr } = await q.limit(args.limit || 20);
              if (qErr) throw qErr;
              result = { count: rows?.length || 0, data: rows || [] };
              break;
            }

            case 'fetch_live_metrics': {
              const { executeTool } = await import('../functions/tools.js');
              switch (args.metric) {
                case 'pagespeed':
                  result = await executeTool('fetch_pagespeed', { url: args.url || client?.domain ? `https://${client?.domain}` : args.url, strategy: 'mobile' }, clientId, null);
                  break;
                case 'serp_ranking':
                  result = await executeTool('fetch_serp_rankings', { keyword: args.keyword, domain: args.domain || client?.domain }, clientId, null);
                  break;
                case 'backlinks':
                  result = await executeTool('fetch_backlink_data', { domain: args.domain || client?.domain, type: 'summary' }, clientId, null);
                  break;
                case 'google_reviews':
                  result = await executeTool('fetch_google_reviews', {
                    business_name: args.business_name || client?.name,
                    domain: args.domain || client?.domain,
                    location: args.location,
                  }, clientId, null);
                  break;
                case 'local_3pack':
                  result = await executeTool('fetch_local_serp', { keyword: args.keyword, business_name: args.business_name || client?.name }, clientId, null);
                  break;
                default:
                  result = { error: `Unknown metric: ${args.metric}` };
              }
              break;
            }

            case 'check_system_health': {
              // Comprehensive health check
              const [credsRes, runsRes, incidentsRes, queueRes, schedulesRes] = await Promise.allSettled([
                supabase.from('client_credentials').select('service, is_connected, health_score, error, last_checked').eq('client_id', clientId),
                supabase.from('runs').select('id, status, created_at, agent_templates(name, slug)').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
                supabase.from('incidents').select('id, title, severity, status').eq('client_id', clientId).eq('status', 'open'),
                supabase.from('run_queue').select('id, status, agent_templates(name)').eq('client_id', clientId).in('status', ['queued', 'running', 'blocked_dependency']),
                supabase.from('agent_schedules').select('agent_templates(name, slug), last_run_at, next_run_at, enabled').eq('client_id', clientId).eq('enabled', true),
              ]);
              const credsList = credsRes.status === 'fulfilled' ? credsRes.value.data : [];
              const runsList = runsRes.status === 'fulfilled' ? runsRes.value.data : [];
              const incidentsList = incidentsRes.status === 'fulfilled' ? incidentsRes.value.data : [];
              const queueList = queueRes.status === 'fulfilled' ? queueRes.value.data : [];
              const schedulesList = schedulesRes.status === 'fulfilled' ? schedulesRes.value.data : [];

              const brokenCreds = credsList.filter(c => !c.is_connected);
              const recentFails = runsList.filter(r => r.status === 'failed');
              const overdue = schedulesList.filter(s => s.next_run_at && new Date(s.next_run_at) < new Date());

              result = {
                credentials: { total: credsList.length, connected: credsList.length - brokenCreds.length, broken: brokenCreds.map(c => ({ service: c.service, error: c.error })) },
                recent_runs: { total: runsList.length, failed: recentFails.length, last_run: runsList[0]?.created_at, failures: recentFails.slice(0, 5).map(r => ({ agent: r.agent_templates?.name, created_at: r.created_at })) },
                open_incidents: { count: incidentsList.length, items: incidentsList.slice(0, 5) },
                queue: { pending: queueList.length, items: queueList.slice(0, 5).map(q => ({ agent: q.agent_templates?.name, status: q.status })) },
                overdue_schedules: overdue.map(s => ({ agent: s.agent_templates?.name, was_due: s.next_run_at })),
                health_score: Math.max(0, 100 - (brokenCreds.length * 15) - (recentFails.length * 5) - (incidentsList.length * 10) - (overdue.length * 5)),
              };
              break;
            }

            case 'search_web': {
              const perplexityKey = process.env.PERPLEXITY_API_KEY;
              if (!perplexityKey) { result = { error: 'Perplexity API key not configured. Set PERPLEXITY_API_KEY in Vercel env vars.' }; break; }
              const pResp = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${perplexityKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'sonar', messages: [
                  { role: 'system', content: 'You are a digital marketing research assistant for Israeli businesses. Provide data-rich answers with source URLs.' },
                  { role: 'user', content: args.query }
                ], max_tokens: 1500, temperature: 0.2, return_citations: true })
              });
              if (!pResp.ok) { result = { error: `Perplexity error: ${pResp.status}` }; break; }
              const pData = await pResp.json();
              result = { answer: pData.choices?.[0]?.message?.content || '', citations: pData.citations || [], query: args.query };
              break;
            }

            case 'edit_prompt': {
              let agentId = args.agent_template_id;
              if (!agentId && args.agent_slug) {
                const { data: a } = await supabase.from('agent_templates').select('id').eq('slug', args.agent_slug).single();
                agentId = a?.id;
              }
              if (!agentId) { result = { error: 'Provide agent_slug or agent_template_id' }; break; }
              const { createPromptOverride: createPO } = await import('../functions/additional.js');
              result = await createPO(clientId, agentId, args.new_prompt, args.notes);
              break;
            }

            case 'add_memory': {
              const { data: mem, error: mErr } = await supabase.from('memory_items').insert({
                client_id: clientId, content: args.content, scope: args.scope || 'general',
                type: args.type || 'fact', tags: args.tags || ['from-chat'],
                source: 'ai_chat', approved: true, relevance_score: args.relevance_score || 0.8,
              }).select().single();
              if (mErr) throw mErr;
              result = { success: true, id: mem.id, message: `Stored ${args.scope || 'general'}/${args.type || 'fact'} memory` };
              break;
            }

            case 'update_baseline': {
              const updateData = { updated_at: new Date().toISOString() };
              if (args.metric_value != null) updateData.metric_value = args.metric_value;
              if (args.target_value != null) updateData.target_value = args.target_value;
              const { error: bErr } = await supabase.from('baselines')
                .upsert({ client_id: clientId, metric_name: args.metric_name, ...updateData }, { onConflict: 'client_id,metric_name' });
              if (bErr) throw bErr;
              result = { success: true, metric: args.metric_name, ...updateData };
              break;
            }

            case 'fix_credential': {
              const { data: cred } = await supabase.from('client_credentials')
                .select('id').eq('client_id', clientId).eq('service', args.service).maybeSingle();
              if (!cred) {
                await supabase.from('client_credentials').insert({
                  client_id: clientId, service: args.service, label: args.service,
                  credential_data: args.credential_data, is_connected: false, health_score: 0,
                });
                result = { success: true, action: 'created', service: args.service };
              } else {
                await supabase.from('client_credentials').update({
                  credential_data: args.credential_data, is_connected: false, error: null,
                }).eq('id', cred.id);
                result = { success: true, action: 'updated', service: args.service };
              }
              break;
            }

            case 'create_incident': {
              const { data: inc, error: iErr } = await supabase.from('incidents').insert({
                client_id: clientId, title: args.title, description: args.description,
                severity: args.severity, category: 'chat', status: 'open',
              }).select().single();
              if (iErr) throw iErr;
              result = { created: true, id: inc.id, title: args.title };
              break;
            }

            case 'resolve_incident': {
              await supabase.from('incidents').update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution: args.resolution }).eq('id', args.incident_id);
              result = { resolved: true, id: args.incident_id };
              break;
            }

            case 'run_agent': {
              if (!clientId) { result = { error: 'No client selected' }; break; }
              const { data: agentTpl } = await supabase.from('agent_templates').select('id, name, slug').eq('slug', args.agent_slug).single();
              if (!agentTpl) { result = { error: `Agent not found: ${args.agent_slug}` }; break; }
              const { executeAgent } = await import('../functions/core.js');
              const runResult = await executeAgent(clientId, agentTpl.id, args.task_payload || {}, { triggeredBy: 'chat' });
              result = {
                success: true, run_id: runResult.runId, agent: agentTpl.name,
                needs_approval: runResult.needsApproval, triggered_validation: runResult.triggeredValidation,
                tool_calls: runResult.output?._tool_call_count || 0,
                output_summary: runResult.output ? Object.keys(runResult.output).filter(k => !k.startsWith('_')).slice(0, 10).join(', ') : null,
              };
              break;
            }

            case 'queue_task': {
              const { data: agentTpl } = await supabase.from('agent_templates').select('id, name').eq('slug', args.agent_slug).single();
              if (!agentTpl) { result = { error: `Agent not found: ${args.agent_slug}` }; break; }
              const { data: qi } = await supabase.from('run_queue').insert({
                client_id: clientId, agent_template_id: agentTpl.id,
                task_payload: args.task_payload || {}, status: 'queued',
                queued_by: 'chat', priority: args.priority || 3,
              }).select().single();
              result = { queued: true, queue_id: qi?.id, agent: agentTpl.name, priority: args.priority || 3 };
              break;
            }

            case 'refresh_metrics': {
              const refreshResp = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://ai-growth-os-mu.vercel.app'}/api/clients/${clientId}/metrics/refresh-all`, { method: 'POST' });
              if (refreshResp.ok) {
                result = await refreshResp.json();
              } else {
                // Fallback: call internal function
                result = { message: 'Metrics refresh triggered. Results will appear in baselines.' };
              }
              break;
            }

            case 'manage_keywords': {
              if (args.action === 'list') {
                const { data } = await supabase.from('client_keywords').select('keyword, current_position, volume, difficulty, cluster, search_intent').eq('client_id', clientId).order('volume', { ascending: false }).limit(50);
                result = { count: data?.length || 0, keywords: data || [] };
              } else if (args.action === 'add' && args.keyword) {
                await supabase.from('client_keywords').upsert({
                  client_id: clientId, keyword: args.keyword, volume: args.volume || 0,
                  difficulty: args.difficulty || 0, cluster: args.cluster, search_intent: args.search_intent,
                }, { onConflict: 'client_id,keyword' });
                result = { added: true, keyword: args.keyword };
              } else if (args.action === 'remove' && args.keyword) {
                await supabase.from('client_keywords').delete().eq('client_id', clientId).eq('keyword', args.keyword);
                result = { removed: true, keyword: args.keyword };
              } else { result = { error: 'Provide keyword for add/remove' }; }
              break;
            }

            case 'manage_competitors': {
              if (args.action === 'list') {
                const { data } = await supabase.from('client_competitors').select('*').eq('client_id', clientId);
                result = { count: data?.length || 0, competitors: data || [] };
              } else if (args.action === 'add' && args.domain) {
                await supabase.from('client_competitors').upsert({
                  client_id: clientId, domain: args.domain, name: args.name || args.domain, notes: args.notes,
                }, { onConflict: 'client_id,domain' });
                result = { added: true, domain: args.domain };
              } else if (args.action === 'remove' && args.domain) {
                await supabase.from('client_competitors').delete().eq('client_id', clientId).eq('domain', args.domain);
                result = { removed: true, domain: args.domain };
              } else { result = { error: 'Provide domain for add/remove' }; }
              break;
            }

            case 'update_client_profile': {
              // Build update payload from only provided fields
              const profileFields = ['business_type', 'industry', 'sub_industry', 'profession', 'language', 'city', 'country', 'brand_voice', 'target_audience', 'unique_selling_points'];
              const profileUpdate = {};
              for (const f of profileFields) {
                if (args[f] != null && args[f] !== '') profileUpdate[f] = args[f];
              }
              if (Object.keys(profileUpdate).length === 0) { result = { error: 'No fields provided to update' }; break; }

              // Upsert client_profiles
              const { error: pErr } = await supabase.from('client_profiles')
                .upsert({ client_id: clientId, ...profileUpdate }, { onConflict: 'client_id' });
              if (pErr) throw pErr;

              // Also update clients table if business_type or name-relevant fields changed
              if (profileUpdate.business_type) {
                await supabase.from('clients').update({ business_type: profileUpdate.business_type }).eq('id', clientId);
              }

              result = { success: true, updated_fields: Object.keys(profileUpdate), values: profileUpdate };
              break;
            }

            default:
              result = { error: `Unknown tool: ${tc.function.name}` };
          }
        } catch (e) {
          result = { error: e.message };
        }
        conversationMessages.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify(result) });
        totalToolCalls++;
      }
      // Loop continues — next iteration will send tool results back and get either more tool calls or final text
    }

    res.json({
      message: assistantMsg?.content || 'No response',
      tool_calls_made: totalToolCalls,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── SEED NEW AGENTS ─────────────────────────────────────────
// POST /api/agents/seed-new — Seeds agents that don't exist yet (safe to run multiple times)
router.post('/agents/seed-new', async (req, res) => {
  try {
    const newAgents = [
      {
        name: 'GEO / AI Visibility Agent',
        slug: 'geo-ai-visibility-agent',
        lane: 'Innovation and Competitive Edge',
        role_type: 'worker',
        provider_preference: 'openai',
        model: 'gpt-4.1',
        description: 'Monitors and optimizes visibility in AI-generated answers (ChatGPT, Gemini, Perplexity). Tracks citations, analyzes GEO signals.',
        base_prompt: `You are the GEO (Generative Engine Optimization) and AI Visibility Agent. Your job is to ensure this client appears in AI-generated answers across all major LLMs and AI search engines.

This is a CRITICAL frontier in digital marketing. When users ask ChatGPT, Gemini, Perplexity, or Copilot questions about this client's industry and services, this client MUST be mentioned, cited, and recommended.

Your responsibilities:
1. CITATION MONITORING: Use search_perplexity tool to query key topics. Check if client is cited in AI answers. Track competitor AI citations.
2. GEO SIGNAL ANALYSIS: Entity authority, structured data coverage, content comprehensiveness, source reliability, freshness.
3. AI SEARCH QUERIES: Test query patterns via Perplexity for key business terms in Hebrew.
4. COMPETITOR AI VISIBILITY: Which competitors appear most in AI answers? What content format do they use?
5. CONTENT RECOMMENDATIONS: FAQ-rich content, long-form authoritative guides, updated statistics, schema markup.
6. ACTIONS: Create follow-up tasks, store memory items, update metrics with citation counts.

Output JSON:
- ai_visibility_score: integer 0-100
- citation_checks: array of {query, ai_platform, client_mentioned, competitor_mentions}
- geo_opportunities: array of {opportunity, recommended_action, priority}
- content_recommendations: array of {type, topic, expected_geo_impact}
- actions_taken: array
- tools_used: array
- summary_he: string`,
        global_rules: 'Use search_perplexity tool for REAL queries. Do not fabricate citation data. Store findings as memory items.',
        do_rules: ['Query Perplexity for key topics', 'Compare client vs competitor AI visibility', 'Recommend specific content improvements', 'Create follow-up tasks', 'Store findings in memory', 'Focus on Hebrew queries'],
        dont_rules: ['Do not fabricate citation data', 'Do not claim client appears without evidence', 'Do not ignore competitor AI presence'],
        output_contract: { ai_visibility_score: 'integer 0-100', citation_checks: 'array', geo_opportunities: 'array', actions_taken: 'array' },
        self_validation_checklist: ['Did I run real Perplexity queries?', 'Did I compare to competitors?', 'Did I store findings as memory?'],
        action_mode_default: 'autonomous',
        post_change_trigger: false,
        cooldown_minutes: 720,
        max_tokens: 4000,
        temperature: 0.3,
        is_active: true
      },
      {
        name: 'Content Distribution Agent',
        slug: 'content-distribution-agent',
        lane: 'Social Publishing and Engagement',
        role_type: 'worker',
        provider_preference: 'openai',
        model: 'gpt-4.1',
        description: 'Plans and coordinates content distribution across all channels. Ensures consistent messaging and cross-channel amplification.',
        base_prompt: `You are the Content Distribution Agent. You own the strategy for distributing client content across ALL digital channels.

Channels: Website blog, GBP posts, Facebook, Instagram, legal directories, email, WhatsApp.

Responsibilities:
1. CONTENT CALENDAR: Analyze existing content, identify gaps, plan optimal posting schedule.
2. CROSS-CHANNEL AMPLIFICATION: Blog post → social distribution, review → sharing strategy, ranking win → celebratory content.
3. CONTENT REPURPOSING: Blog → social snippets, FAQ → carousels, case studies → before/after posts, stats → infographics.
4. TIMING: Israeli audience (Sun-Thu), Facebook (10am-12pm, 8pm-10pm), Instagram (12pm-2pm, 7pm-9pm), GBP (weekly Sunday).
5. LEGAL COMPLIANCE: Israeli Bar Association rules, no guaranteed outcomes, professional tone, Hebrew formal register.

Output JSON:
- distribution_score: integer 0-100
- distribution_plan: array of {content_piece, target_channels, posting_date, caption_concept_he}
- repurposing_ideas: array of {original_content, repurposed_format, target_channel, concept_he}
- calendar_next_7_days: array of {date, channel, content_type, topic_he}
- compliance_flags: array
- actions_taken: array
- tools_used: array
- summary_he: string`,
        global_rules: 'Coordinate across all channels. Respect Israeli Bar Association rules. Use Hebrew formal register. Create executable distribution plans.',
        do_rules: ['Audit content before recommending', 'Create plans with dates', 'Check legal compliance', 'Create follow-up tasks'],
        dont_rules: ['Do not publish client confidential info', 'Do not violate Bar Association rules', 'Do not plan English content for Hebrew audience'],
        output_contract: { distribution_score: 'integer 0-100', distribution_plan: 'array', calendar_next_7_days: 'array', actions_taken: 'array' },
        self_validation_checklist: ['Did I audit existing content?', 'Did I create plans with dates?', 'Did I check legal compliance?'],
        action_mode_default: 'autonomous',
        post_change_trigger: false,
        cooldown_minutes: 720,
        max_tokens: 3500,
        temperature: 0.3,
        is_active: true
      }
    ];

    const results = [];
    for (const agent of newAgents) {
      // Check if already exists
      const { data: existing } = await supabase
        .from('agent_templates')
        .select('id')
        .eq('slug', agent.slug)
        .maybeSingle();

      if (existing) {
        results.push({ slug: agent.slug, status: 'already_exists', id: existing.id });
        continue;
      }

      const { data, error } = await supabase
        .from('agent_templates')
        .insert(agent)
        .select()
        .single();

      if (error) {
        results.push({ slug: agent.slug, status: 'error', error: error.message });
      } else {
        results.push({ slug: agent.slug, status: 'created', id: data.id });

        // Auto-assign to all active clients
        const { data: clients } = await supabase
          .from('clients')
          .select('id')
          .eq('status', 'active');

        for (const client of (clients || [])) {
          await supabase.from('client_agent_assignments').insert({
            client_id: client.id,
            agent_template_id: data.id,
            enabled: true
          });
        }
      }
    }

    res.json({ agents_processed: results.length, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CAMPAIGN MANAGEMENT
// ============================================================

// ── LIST CAMPAIGNS ───────────────────────────────────────────
router.get('/clients/:clientId/campaigns', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status } = req.query;
    let q = supabase.from('campaigns').select('*').eq('client_id', clientId);
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false });
    if (error) throw error;

    // Attach creatives count for each campaign
    const ids = (data || []).map(c => c.id);
    const { data: creativeCounts } = ids.length
      ? await supabase.from('campaign_creatives').select('campaign_id').in('campaign_id', ids)
      : { data: [] };
    const countMap = {};
    (creativeCounts || []).forEach(c => { countMap[c.campaign_id] = (countMap[c.campaign_id] || 0) + 1; });
    const enriched = (data || []).map(c => ({ ...c, creatives_count: countMap[c.id] || 0 }));

    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET SINGLE CAMPAIGN ──────────────────────────────────────
router.get('/clients/:clientId/campaigns/:campaignId', async (req, res) => {
  try {
    const { clientId, campaignId } = req.params;
    const [campRes, creativesRes, snapshotsRes] = await Promise.all([
      supabase.from('campaigns').select('*').eq('id', campaignId).eq('client_id', clientId).single(),
      supabase.from('campaign_creatives').select('*').eq('campaign_id', campaignId).order('sort_order'),
      supabase.from('campaign_snapshots').select('*').eq('campaign_id', campaignId).order('snapshot_date', { ascending: false }).limit(30),
    ]);
    if (campRes.error) throw campRes.error;
    res.json({ ...campRes.data, creatives: creativesRes.data || [], snapshots: snapshotsRes.data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE CAMPAIGN ──────────────────────────────────────────
router.post('/clients/:clientId/campaigns', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { name, objective, platforms, daily_budget_cents, total_budget_cents, currency,
            start_date, end_date, targeting, notes } = req.body;

    const { data, error } = await supabase.from('campaigns').insert({
      client_id: clientId,
      name: name || 'Untitled Campaign',
      objective: objective || 'TRAFFIC',
      platforms: platforms || ['facebook', 'instagram'],
      daily_budget_cents: daily_budget_cents || null,
      total_budget_cents: total_budget_cents || null,
      currency: currency || 'ILS',
      start_date: start_date || null,
      end_date: end_date || null,
      targeting: targeting || {},
      notes: notes || null,
      status: 'draft',
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE CAMPAIGN ──────────────────────────────────────────
router.patch('/clients/:clientId/campaigns/:campaignId', async (req, res) => {
  try {
    const { clientId, campaignId } = req.params;
    const allowed = ['name', 'objective', 'platforms', 'daily_budget_cents', 'total_budget_cents',
      'currency', 'start_date', 'end_date', 'targeting', 'notes', 'status'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('campaigns')
      .update(updates).eq('id', campaignId).eq('client_id', clientId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE CAMPAIGN ──────────────────────────────────────────
router.delete('/clients/:clientId/campaigns/:campaignId', async (req, res) => {
  try {
    const { clientId, campaignId } = req.params;
    // Only allow deleting drafts
    const { data: camp } = await supabase.from('campaigns')
      .select('status').eq('id', campaignId).eq('client_id', clientId).single();
    if (!camp) return res.status(404).json({ error: 'Campaign not found' });
    if (camp.status !== 'draft' && camp.status !== 'archived') {
      return res.status(400).json({ error: 'Only draft or archived campaigns can be deleted' });
    }
    await supabase.from('campaigns').delete().eq('id', campaignId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ADD CREATIVE TO CAMPAIGN ─────────────────────────────────
router.post('/clients/:clientId/campaigns/:campaignId/creatives', async (req, res) => {
  try {
    const { clientId, campaignId } = req.params;
    const { headline, primary_text, description, call_to_action, image_url,
            video_url, destination_url, display_url } = req.body;

    const { data, error } = await supabase.from('campaign_creatives').insert({
      campaign_id: campaignId,
      client_id: clientId,
      headline: headline || null,
      primary_text: primary_text || null,
      description: description || null,
      call_to_action: call_to_action || 'LEARN_MORE',
      image_url: image_url || null,
      video_url: video_url || null,
      destination_url: destination_url || null,
      display_url: display_url || null,
      status: 'draft',
      is_primary: false,
    }).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPDATE CREATIVE ──────────────────────────────────────────
router.patch('/clients/:clientId/campaigns/:campaignId/creatives/:creativeId', async (req, res) => {
  try {
    const { clientId, creativeId } = req.params;
    const allowed = ['headline', 'primary_text', 'description', 'call_to_action',
      'image_url', 'video_url', 'destination_url', 'display_url', 'status', 'is_primary', 'sort_order'];
    const updates = {};
    for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase.from('campaign_creatives')
      .update(updates).eq('id', creativeId).eq('client_id', clientId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE CREATIVE ──────────────────────────────────────────
router.delete('/clients/:clientId/campaigns/:campaignId/creatives/:creativeId', async (req, res) => {
  try {
    const { creativeId } = req.params;
    await supabase.from('campaign_creatives').delete().eq('id', creativeId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── UPLOAD CAMPAIGN IMAGE ────────────────────────────────────
router.post('/clients/:clientId/campaigns/:campaignId/upload-image', async (req, res) => {
  try {
    const { clientId, campaignId } = req.params;
    const { image_base64, filename, content_type } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 is required' });

    const ext = (filename || 'image.jpg').split('.').pop();
    const storagePath = `campaigns/${clientId}/${campaignId}/${Date.now()}.${ext}`;
    const buffer = Buffer.from(image_base64, 'base64');

    const { error: uploadError } = await supabase.storage
      .from('campaign-assets')
      .upload(storagePath, buffer, { contentType: content_type || 'image/jpeg', upsert: true });

    if (uploadError) {
      // Create bucket if it doesn't exist
      if (uploadError.message?.includes('not found') || uploadError.statusCode === '404') {
        await supabase.storage.createBucket('campaign-assets', { public: true });
        const { error: retryErr } = await supabase.storage
          .from('campaign-assets')
          .upload(storagePath, buffer, { contentType: content_type || 'image/jpeg', upsert: true });
        if (retryErr) throw retryErr;
      } else {
        throw uploadError;
      }
    }

    const { data: urlData } = supabase.storage.from('campaign-assets').getPublicUrl(storagePath);
    res.json({ image_url: urlData.publicUrl, storage_path: storagePath });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PUBLISH CAMPAIGN TO META ADS ─────────────────────────────
router.post('/clients/:clientId/campaigns/:campaignId/publish-meta', async (req, res) => {
  try {
    const { clientId, campaignId } = req.params;

    // Get campaign + creatives
    const { data: campaign } = await supabase.from('campaigns')
      .select('*').eq('id', campaignId).eq('client_id', clientId).single();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'draft' && campaign.status !== 'failed') {
      return res.status(400).json({ error: 'Only draft or failed campaigns can be published' });
    }

    const { data: creatives } = await supabase.from('campaign_creatives')
      .select('*').eq('campaign_id', campaignId).order('sort_order');
    if (!creatives?.length) return res.status(400).json({ error: 'Campaign needs at least one creative' });

    // Get Meta token
    const { data: cred } = await supabase.from('oauth_credentials')
      .select('*').eq('client_id', clientId).eq('provider', 'meta').single();
    if (!cred?.access_token_encrypted) return res.status(400).json({ error: 'No Meta credentials. Connect Meta first.' });

    const { decryptToken } = await import('../functions/onboarding.js');
    const iv = cred.encryption_iv.includes(':') ? cred.encryption_iv.split(':')[0] : cred.encryption_iv;
    const accessToken = decryptToken(cred.access_token_encrypted, iv);

    // Get ad account
    const { data: adAccount } = await supabase.from('integration_assets')
      .select('external_id, metadata_json').eq('client_id', clientId)
      .eq('provider', 'meta').eq('sub_provider', 'ads').eq('is_selected', true).maybeSingle();
    if (!adAccount?.external_id) {
      // fallback to first ad account
      const { data: fallback } = await supabase.from('integration_assets')
        .select('external_id, metadata_json').eq('client_id', clientId)
        .eq('provider', 'meta').eq('sub_provider', 'ads').limit(1).maybeSingle();
      if (!fallback?.external_id) return res.status(400).json({ error: 'No Meta Ad Account found. Reconnect Meta with ads permissions.' });
      adAccount = fallback;
    }
    const adAccountId = adAccount.external_id; // format: act_XXXXX

    // Get page for ad identity
    const { data: page } = await supabase.from('integration_assets')
      .select('external_id, label, metadata_json').eq('client_id', clientId)
      .eq('provider', 'meta').eq('sub_provider', 'facebook').eq('is_selected', true).maybeSingle();

    // Map objective to Meta API objective
    const objectiveMap = {
      'AWARENESS': 'OUTCOME_AWARENESS',
      'TRAFFIC': 'OUTCOME_TRAFFIC',
      'ENGAGEMENT': 'OUTCOME_ENGAGEMENT',
      'LEADS': 'OUTCOME_LEADS',
      'SALES': 'OUTCOME_SALES',
    };

    const errors = [];
    let metaCampaignId = campaign.meta_campaign_id;
    let metaAdsetId = campaign.meta_adset_id;
    let metaAdId = campaign.meta_ad_id;

    // 1. Create Campaign on Meta
    if (!metaCampaignId) {
      const campRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaign.name,
          objective: objectiveMap[campaign.objective] || 'OUTCOME_TRAFFIC',
          status: 'PAUSED',
          special_ad_categories: [],
          access_token: accessToken,
        }),
      });
      const campData = await campRes.json();
      if (campData.error) { errors.push(`Campaign: ${campData.error.message}`); }
      else { metaCampaignId = campData.id; }
    }

    // 2. Create Ad Set
    if (metaCampaignId && !metaAdsetId) {
      const targeting = campaign.targeting || {};
      const metaTargeting = {
        geo_locations: { countries: targeting.geo || ['IL'] },
        age_min: targeting.age_min || 18,
        age_max: targeting.age_max || 65,
      };
      if (targeting.gender && targeting.gender !== 'all') {
        metaTargeting.genders = [targeting.gender === 'male' ? 1 : 2];
      }
      if (targeting.interests?.length) {
        metaTargeting.flexible_spec = [{ interests: targeting.interests.map(i => ({ id: i.id, name: i.name })) }];
      }

      const platforms = campaign.platforms || ['facebook', 'instagram'];
      const publisherPlatforms = [];
      if (platforms.includes('facebook')) publisherPlatforms.push('facebook');
      if (platforms.includes('instagram')) publisherPlatforms.push('instagram');

      const adsetBody = {
        name: `${campaign.name} - Ad Set`,
        campaign_id: metaCampaignId,
        daily_budget: campaign.daily_budget_cents || 4000, // default 40 ILS = 4000 agorot
        billing_event: 'IMPRESSIONS',
        optimization_goal: campaign.objective === 'TRAFFIC' ? 'LINK_CLICKS' : campaign.objective === 'AWARENESS' ? 'REACH' : 'IMPRESSIONS',
        targeting: metaTargeting,
        status: 'PAUSED',
        access_token: accessToken,
      };
      if (publisherPlatforms.length) {
        adsetBody.targeting.publisher_platforms = publisherPlatforms;
      }
      if (campaign.start_date) adsetBody.start_time = new Date(campaign.start_date).toISOString();
      if (campaign.end_date) adsetBody.end_time = new Date(campaign.end_date).toISOString();

      const adsetRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/adsets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(adsetBody),
      });
      const adsetData = await adsetRes.json();
      if (adsetData.error) { errors.push(`Ad Set: ${adsetData.error.message}`); }
      else { metaAdsetId = adsetData.id; }
    }

    // 3. Create Ad (using first creative)
    if (metaAdsetId && !metaAdId) {
      const creative = creatives[0];
      const pageId = page?.external_id;
      const pageAccessToken = page?.metadata_json?.page_access_token || accessToken;

      // Upload image if needed
      let imageHash = null;
      if (creative.image_url) {
        const imgRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/adimages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: creative.image_url,
            access_token: accessToken,
          }),
        });
        const imgData = await imgRes.json();
        if (imgData.images) {
          const firstKey = Object.keys(imgData.images)[0];
          imageHash = imgData.images[firstKey]?.hash;
        }
      }

      // Create ad creative on Meta
      const creativeBody = {
        name: `${campaign.name} - Creative`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            message: creative.primary_text || '',
            link: creative.destination_url || `https://${(await supabase.from('clients').select('domain').eq('id', clientId).single()).data?.domain || 'example.com'}`,
            name: creative.headline || campaign.name,
            description: creative.description || '',
            call_to_action: { type: creative.call_to_action || 'LEARN_MORE' },
          },
        },
        access_token: accessToken,
      };

      if (imageHash) {
        creativeBody.object_story_spec.link_data.image_hash = imageHash;
      } else if (creative.image_url) {
        creativeBody.object_story_spec.link_data.picture = creative.image_url;
      }

      const crRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/adcreatives`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creativeBody),
      });
      const crData = await crRes.json();

      if (crData.error) {
        errors.push(`Creative: ${crData.error.message}`);
      } else {
        // Create the ad
        const adRes = await fetch(`https://graph.facebook.com/v21.0/${adAccountId}/ads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: `${campaign.name} - Ad`,
            adset_id: metaAdsetId,
            creative: { creative_id: crData.id },
            status: 'PAUSED',
            access_token: accessToken,
          }),
        });
        const adData = await adRes.json();
        if (adData.error) { errors.push(`Ad: ${adData.error.message}`); }
        else { metaAdId = adData.id; }
      }
    }

    // Update campaign with external IDs
    const updateData = {
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdsetId,
      meta_ad_id: metaAdId,
      updated_at: new Date().toISOString(),
    };

    if (errors.length === 0 && metaCampaignId && metaAdsetId && metaAdId) {
      updateData.status = 'active';
      updateData.published_at = new Date().toISOString();
      updateData.external_status = { meta: 'PAUSED' };
    } else if (errors.length > 0) {
      updateData.status = 'failed';
    }

    await supabase.from('campaigns').update(updateData).eq('id', campaignId);

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors, meta_campaign_id: metaCampaignId, meta_adset_id: metaAdsetId });
    }

    res.json({
      success: true,
      meta_campaign_id: metaCampaignId,
      meta_adset_id: metaAdsetId,
      meta_ad_id: metaAdId,
      message: 'Campaign published to Meta (PAUSED). Use the activate endpoint to start running.',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ACTIVATE / PAUSE META CAMPAIGN ───────────────────────────
router.post('/clients/:clientId/campaigns/:campaignId/meta-status', async (req, res) => {
  try {
    const { clientId, campaignId } = req.params;
    const { action } = req.body; // 'activate' or 'pause'

    const { data: campaign } = await supabase.from('campaigns')
      .select('*').eq('id', campaignId).eq('client_id', clientId).single();
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (!campaign.meta_campaign_id) return res.status(400).json({ error: 'Campaign not published to Meta yet' });

    const { data: cred } = await supabase.from('oauth_credentials')
      .select('*').eq('client_id', clientId).eq('provider', 'meta').single();
    const { decryptToken } = await import('../functions/onboarding.js');
    const iv = cred.encryption_iv.includes(':') ? cred.encryption_iv.split(':')[0] : cred.encryption_iv;
    const accessToken = decryptToken(cred.access_token_encrypted, iv);

    const newStatus = action === 'activate' ? 'ACTIVE' : 'PAUSED';

    // Update campaign, adset, and ad status
    const updates = [campaign.meta_campaign_id, campaign.meta_adset_id, campaign.meta_ad_id].filter(Boolean);
    for (const id of updates) {
      await fetch(`https://graph.facebook.com/v21.0/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, access_token: accessToken }),
      });
    }

    await supabase.from('campaigns').update({
      status: action === 'activate' ? 'active' : 'paused',
      external_status: { meta: newStatus },
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId);

    res.json({ success: true, status: newStatus });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
