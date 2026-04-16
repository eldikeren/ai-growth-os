// ============================================================
// AI GROWTH OS — ONBOARDING PORTAL BACKEND
// Real Google OAuth with offline access + incremental scopes
// Real Meta OAuth, encrypted token storage, immediate ingestion
// ============================================================

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Encryption key must be 64 hex chars (32 bytes)
const ENC_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3001');
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const META_APP_ID = (process.env.META_APP_ID || '').trim();
const META_APP_SECRET = (process.env.META_APP_SECRET || '').trim();

// ── ENCRYPTION ────────────────────────────────────────────────
function encryptToken(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENC_KEY, 'hex').slice(0, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let enc = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  return { encrypted: enc, iv: iv.toString('hex') };
}

function decryptToken(encText, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENC_KEY, 'hex').slice(0, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return decipher.update(encText, 'hex', 'utf8') + decipher.final('utf8');
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

// ── GOOGLE OAUTH SCOPES ───────────────────────────────────────
const GOOGLE_SCOPE_BUNDLES = {
  search_console: ['https://www.googleapis.com/auth/webmasters', 'https://www.googleapis.com/auth/webmasters.readonly'],
  ads: ['https://www.googleapis.com/auth/adwords'],
  business_profile: ['https://www.googleapis.com/auth/business.manage'],
  analytics: ['https://www.googleapis.com/auth/analytics', 'https://www.googleapis.com/auth/analytics.readonly', 'https://www.googleapis.com/auth/analytics.edit'],
  // Base scopes always included
  base: ['openid', 'email', 'profile']
};

// META SCOPES
// Note: ads_management + ads_read require Meta App Review approval.
// They are excluded from the default flow to avoid "Invalid Scopes" errors.
// Once your app is approved for Ads Management, add them back here.
const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'business_management',
  // 'ads_management',  // Requires App Review — uncomment when approved
  // 'ads_read',        // Requires App Review — uncomment when approved
];

// ── GLOBAL SYSTEM SETTINGS LOOKUP ─────────────────────────────
// Cache: 5-min TTL keeps Supabase load low while still picking up rotations.
const _settingsCache = new Map();
export async function getSystemSetting(key) {
  const cached = _settingsCache.get(key);
  if (cached && (Date.now() - cached.at) < 5 * 60 * 1000) return cached.value;
  const { data } = await supabase.from('system_settings').select('value').eq('key', key).maybeSingle();
  const value = data?.value || null;
  _settingsCache.set(key, { value, at: Date.now() });
  return value;
}

// Prefer Vercel env var when set (operator override), fall back to Supabase.
export async function getGoogleAdsDeveloperToken() {
  const envToken = (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
  if (envToken) return envToken;
  return (await getSystemSetting('google_ads_developer_token')) || '';
}

// Manager (MCC) customer ID — required as login-customer-id header when
// querying client accounts managed through a manager account.
export async function getGoogleAdsManagerId() {
  const envId = (process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID || '').trim();
  if (envId) return envId.replace(/-/g, '');
  const val = (await getSystemSetting('google_ads_manager_customer_id')) || '';
  return val.replace(/-/g, '');
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================
export async function createOnboardingSession(clientId, options = {}) {
  const {
    language = 'he',
    requestedConnectors = [],
    customMessage = null,
    customMessageHe = null,
    notifyEmail = null,
    clientEmail = null,
    clientName = null,
    expiryHours = 72
  } = options;

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, domain, client_profiles(*)')
    .eq('id', clientId).single();
  if (!client) throw new Error('Client not found');

  // Revoke any existing active sessions
  await supabase.from('onboarding_sessions')
    .update({ status: 'revoked' })
    .eq('client_id', clientId)
    .in('status', ['pending', 'in_progress', 'awaiting_finalize']);

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

  // Try to pre-detect assets
  const preDetected = await preDetectAssets(client.domain);

  const { data: session, error } = await supabase.from('onboarding_sessions').insert({
    client_id: clientId,
    token_hash: tokenHash,
    language,
    requested_connectors: requestedConnectors,
    client_name: clientName || client.name,
    client_email: clientEmail,
    custom_message: customMessage,
    custom_message_he: customMessageHe,
    notify_email: notifyEmail,
    pre_detected: preDetected,
    expires_at: expiresAt.toISOString(),
    status: 'pending'
  }).select().single();

  if (error) throw new Error(error.message);

  return {
    session_id: session.id,
    raw_token: rawToken, // Only time we expose the raw token
    onboarding_url: `${APP_URL}/onboarding/${rawToken}`,
    expires_at: expiresAt.toISOString(),
    client_name: clientName || client.name,
    pre_detected: preDetected
  };
}

async function preDetectAssets(domain) {
  if (!domain) return {};
  const detected = {};
  try {
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      detected.website_reachable = true;
      detected.website_url = url;
      const html = await res.text();
      // Detect platform
      if (html.includes('wp-content')) detected.platform = 'WordPress';
      else if (html.includes('Shopify')) detected.platform = 'Shopify';
      else if (html.includes('wix.com')) detected.platform = 'Wix';
      else if (html.includes('next') || html.includes('__NEXT')) detected.platform = 'Next.js';
      // Detect language
      const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
      if (langMatch) detected.detected_language = langMatch[1];
      detected.has_schema = html.includes('"@type"') || html.includes("'@type'");
      detected.has_gtm = html.includes('googletagmanager.com');
      detected.has_ga4 = html.includes('gtag') || html.includes('G-');
    }
  } catch (e) { detected.website_reachable = false; }
  return detected;
}

export async function validateSession(rawToken, ip) {
  const tokenHash = hashToken(rawToken);
  const { data: session } = await supabase
    .from('onboarding_sessions')
    .select('*, clients(name, domain, client_profiles(*))')
    .eq('token_hash', tokenHash)
    .single();

  if (!session) return { valid: false, error: 'Invalid or expired link' };
  if (new Date(session.expires_at) < new Date()) {
    await supabase.from('onboarding_sessions').update({ status: 'expired' }).eq('id', session.id);
    return { valid: false, error: 'This link has expired. Please contact your account manager.' };
  }
  if (['expired', 'revoked'].includes(session.status)) {
    return { valid: false, error: `This link is no longer active (${session.status}).` };
  }

  // First open
  if (!session.first_opened_at) {
    await supabase.from('onboarding_sessions').update({
      first_opened_at: new Date().toISOString(),
      status: 'in_progress',
      ip_last_used: ip
    }).eq('id', session.id);
  } else {
    await supabase.from('onboarding_sessions').update({
      last_activity_at: new Date().toISOString(),
      ip_last_used: ip
    }).eq('id', session.id);
  }

  await supabase.from('onboarding_events').insert({
    session_id: session.id, client_id: session.client_id,
    event_type: 'session_opened', ip_address: ip
  });

  // Load current integrations
  const { data: integrations } = await supabase
    .from('client_integrations')
    .select('*')
    .eq('client_id', session.client_id);

  // Load selected assets
  const { data: assets } = await supabase
    .from('integration_assets')
    .select('*')
    .eq('client_id', session.client_id);

  // Load business truth
  const { data: truth } = await supabase
    .from('client_onboarding_truth')
    .select('*')
    .eq('client_id', session.client_id)
    .maybeSingle();

  const integrationMap = {};
  for (const i of (integrations || [])) {
    const key = i.sub_provider || i.provider;
    integrationMap[key] = i;
  }

  return {
    valid: true,
    session_id: session.id,
    client_id: session.client_id,
    client_name: session.client_name || session.clients?.name,
    client_domain: session.clients?.domain,
    language: session.language || 'he',
    status: session.status,
    pre_detected: session.pre_detected || {},
    requested_connectors: session.requested_connectors || [],
    completed_connectors: session.completed_connectors || [],
    skipped_connectors: session.skipped_connectors || [],
    step_welcome_done: session.step_welcome_done,
    step_connectors_done: session.step_connectors_done,
    step_business_truth_done: session.step_business_truth_done,
    step_finalized: session.step_finalized,
    integrations: integrationMap,
    assets: assets || [],
    business_truth: truth,
    custom_message: session.language === 'he' ? session.custom_message_he : session.custom_message,
    expires_at: session.expires_at
  };
}

// ============================================================
// GOOGLE OAUTH — REAL IMPLEMENTATION
// ============================================================
export function buildGoogleAuthUrl(sessionId, requestedSubProviders, state) {
  // Collect all scopes needed for requested sub-providers
  const scopes = [...GOOGLE_SCOPE_BUNDLES.base];
  for (const sp of requestedSubProviders) {
    const bundle = GOOGLE_SCOPE_BUNDLES[sp];
    if (bundle) scopes.push(...bundle);
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${APP_URL}/api/oauth/google/callback`,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',           // CRITICAL — gets refresh token
    prompt: 'consent',                // Forces refresh token even if previously authorized
    include_granted_scopes: 'true',   // Incremental auth
    state: JSON.stringify({ sessionId, requestedSubProviders, ...state })
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function handleGoogleCallback(code, stateStr, ip) {
  const state = JSON.parse(stateStr);
  const { sessionId, requestedSubProviders } = state;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: `${APP_URL}/api/oauth/google/callback`,
      grant_type: 'authorization_code'
    })
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = await tokenRes.json();
  const { access_token, refresh_token, expires_in, scope, id_token } = tokens;

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const userInfo = userRes.ok ? await userRes.json() : {};

  // Get session
  const { data: session } = await supabase
    .from('onboarding_sessions')
    .select('client_id, client_name')
    .eq('id', sessionId).single();
  if (!session) throw new Error('Session not found');

  const clientId = session.client_id;
  const grantedScopes = scope?.split(' ') || [];

  // Store encrypted credentials
  const { encrypted: encAccess, iv: ivAccess } = encryptToken(access_token);
  const { encrypted: encRefresh, iv: ivRefresh } = refresh_token
    ? encryptToken(refresh_token)
    : { encrypted: null, iv: null };

  await supabase.from('oauth_credentials').upsert({
    client_id: clientId,
    provider: 'google',
    sub_provider: 'google', // master credential
    access_token_encrypted: encAccess,
    refresh_token_encrypted: encRefresh,
    encryption_iv: ivAccess + ':' + (ivRefresh || ''),
    token_type: 'Bearer',
    expires_at: new Date(Date.now() + (expires_in || 3600) * 1000).toISOString(),
    scopes_granted: grantedScopes,
    external_account_email: userInfo.email,
    external_account_name: userInfo.name,
    status: 'active',
    metadata_json: { id_token_sub: userInfo.sub },
    connected_at: new Date().toISOString()
  }, { onConflict: 'client_id,provider,sub_provider' });

  // Discover assets for each requested sub-provider
  const discoveries = {};
  for (const sp of requestedSubProviders) {
    try {
      const result = await discoverGoogleAssets(access_token, sp, clientId);
      discoveries[sp] = result;
      // Update integration status
      await supabase.from('client_integrations').upsert({
        client_id: clientId,
        provider: 'google',
        sub_provider: sp,
        status: result.count > 0 ? 'connected' : 'limited',
        scopes_granted: grantedScopes,
        external_account_email: userInfo.email,
        external_account_name: userInfo.name,
        discovery_summary: result,
        connected_at: new Date().toISOString()
      }, { onConflict: 'client_id,provider,sub_provider' });
    } catch (e) {
      discoveries[sp] = { error: e.message, count: 0 };
    }
  }

  // Update session
  const completed = [...(await getSessionCompleted(sessionId))];
  for (const sp of requestedSubProviders) {
    if (!completed.includes(`google_${sp}`)) completed.push(`google_${sp}`);
  }
  await supabase.from('onboarding_sessions').update({
    completed_connectors: completed,
    last_activity_at: new Date().toISOString()
  }).eq('id', sessionId);

  // Immediately fire ingestion jobs
  for (const sp of requestedSubProviders) {
    if (discoveries[sp]?.count > 0) {
      await queueIngestionJob(clientId, 'google', sp, 'onboarding');
    }
  }

  await supabase.from('onboarding_events').insert({
    session_id: sessionId, client_id: clientId,
    event_type: 'google_connected',
    metadata: { sub_providers: requestedSubProviders, discoveries, email: userInfo.email }
  });

  return {
    success: true,
    account_email: userInfo.email,
    account_name: userInfo.name,
    sub_providers_connected: requestedSubProviders,
    discoveries,
    redirect_to: `/onboarding/${stateStr.split('"rawToken":"')[1]?.split('"')[0] || ''}`
  };
}

async function discoverGoogleAssets(accessToken, subProvider, clientId) {
  switch (subProvider) {
    case 'search_console': return await discoverSearchConsoleProperties(accessToken, clientId);
    case 'ads': return await discoverGoogleAdsAccounts(accessToken, clientId);
    case 'business_profile': return await discoverGBPLocations(accessToken, clientId);
    case 'analytics': return await discoverGA4Properties(accessToken, clientId);
    default: return { count: 0 };
  }
}

async function discoverSearchConsoleProperties(accessToken, clientId) {
  const res = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const errText = await res.text();
    return { count: 0, error: `GSC list sites failed: HTTP ${res.status} — ${errText.slice(0, 300)}` };
  }
  const data = await res.json();
  const sites = data.siteEntry || [];
  // Store as assets
  for (const site of sites) {
    await supabase.from('integration_assets').upsert({
      client_id: clientId,
      provider: 'google',
      sub_provider: 'search_console',
      asset_type: 'property',
      external_id: site.siteUrl,
      label: site.siteUrl,
      url: site.siteUrl,
      metadata_json: { permissionLevel: site.permissionLevel },
      is_selected: sites.length === 1 // Auto-select if only one
    }, { onConflict: 'client_id,provider,external_id' });
  }
  return {
    count: sites.length,
    properties: sites.map(s => ({ url: s.siteUrl, permission: s.permissionLevel })),
    label: `${sites.length} ${sites.length === 1 ? 'property' : 'properties'} found`
  };
}

async function discoverGoogleAdsAccounts(accessToken, clientId) {
  // Google Ads requires developer token + OAuth.
  // Dev token lookup: env var first, then system_settings (Supabase).
  const devToken = await getGoogleAdsDeveloperToken();
  if (!devToken) {
    return { count: 0, error: 'Google Ads developer token missing — set system_settings.google_ads_developer_token or GOOGLE_ADS_DEVELOPER_TOKEN env var' };
  }
  const managerId = await getGoogleAdsManagerId();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type': 'application/json',
    ...(managerId ? { 'login-customer-id': managerId } : {}),
  };
  try {
    const res = await fetch('https://googleads.googleapis.com/v20/customers:listAccessibleCustomers', { headers });
    if (!res.ok) {
      const errText = await res.text();
      return { count: 0, error: `Google Ads listAccessibleCustomers failed: HTTP ${res.status} — ${errText.slice(0, 400)}` };
    }
    const data = await res.json();
    const accounts = data.resourceNames || [];
    for (const resourceName of accounts) {
      const customerId = resourceName.split('/').pop();
      await supabase.from('integration_assets').upsert({
        client_id: clientId, provider: 'google', sub_provider: 'ads',
        asset_type: 'account', external_id: customerId,
        label: `Google Ads Account ${customerId}`,
        is_selected: accounts.length === 1
      }, { onConflict: 'client_id,provider,external_id' });
    }
    return { count: accounts.length, accounts: accounts.map(r => r.split('/').pop()), label: `${accounts.length} account${accounts.length !== 1 ? 's' : ''} found` };
  } catch (e) { return { count: 0, error: `Google Ads discovery exception: ${e.message}` }; }
}

async function discoverGBPLocations(accessToken, clientId) {
  // Step 1: list GBP accounts the OAuth user manages.
  const res = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const errText = await res.text();
    // 403 PERMISSION_DENIED usually means "Google My Business Account Management API"
    // is not enabled in the Cloud project. 401 means scope issue.
    return {
      count: 0,
      error: `GBP list accounts failed: HTTP ${res.status} — ${errText.slice(0, 400)}`,
      hint: res.status === 403 || res.status === 401
        ? 'Enable "My Business Account Management API" + "My Business Business Information API" in the Google Cloud project.'
        : null,
    };
  }
  const accountData = await res.json();
  const accounts = accountData.accounts || [];
  if (accounts.length === 0) {
    return { count: 0, error: 'GBP: OAuth user is not a manager of any Business Profile account' };
  }
  const perAccountErrors = [];
  let totalLocations = 0;
  for (const account of accounts) {
    const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress,websiteUri`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!locRes.ok) {
      const errText = await locRes.text();
      perAccountErrors.push(`${account.name}: HTTP ${locRes.status} — ${errText.slice(0, 200)}`);
      continue;
    }
    const locData = await locRes.json();
    for (const loc of (locData.locations || [])) {
      totalLocations++;
      await supabase.from('integration_assets').upsert({
        client_id: clientId, provider: 'google', sub_provider: 'business_profile',
        asset_type: 'location',
        external_id: loc.name,
        label: loc.title || loc.name,
        url: loc.websiteUri || null,
        metadata_json: { address: loc.storefrontAddress },
        is_selected: totalLocations === 1
      }, { onConflict: 'client_id,provider,external_id' });
    }
  }
  const result = { count: totalLocations, accounts: accounts.length, label: `${totalLocations} location${totalLocations !== 1 ? 's' : ''} found across ${accounts.length} account(s)` };
  if (totalLocations === 0) {
    result.error = `GBP: found ${accounts.length} account(s) but zero locations. Per-account errors: ${perAccountErrors.join('; ') || 'none'}`;
  }
  return result;
}

async function discoverGA4Properties(accessToken, clientId) {
  const res = await fetch('https://analyticsadmin.googleapis.com/v1beta/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    const errText = await res.text();
    return {
      count: 0,
      error: `GA4 list accounts failed: HTTP ${res.status} — ${errText.slice(0, 400)}`,
      hint: res.status === 403 ? 'Enable "Google Analytics Admin API" in the Google Cloud project.' : null,
    };
  }
  const data = await res.json();
  const accounts = data.accounts || [];
  // Handle the case where the properties call requires a filter instead of being nested
  // Try the nested path first, fall back to the flat filter if needed.
  let propCount = 0;
  const perAccountErrors = [];
  // If no accounts returned, the user has no GA4 access — try the flat /properties list too (filter-based)
  if (accounts.length === 0) {
    return { count: 0, error: 'GA4: OAuth user has access to zero Analytics accounts' };
  }
  for (const account of accounts.slice(0, 10)) {
    // v1beta list filters require `?filter=parent:accounts/XXX` on the properties endpoint
    const propRes = await fetch(
      `https://analyticsadmin.googleapis.com/v1beta/properties?filter=parent:${encodeURIComponent(account.name)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!propRes.ok) {
      const errText = await propRes.text();
      perAccountErrors.push(`${account.name}: HTTP ${propRes.status} — ${errText.slice(0, 200)}`);
      continue;
    }
    const propData = await propRes.json();
    for (const prop of (propData.properties || [])) {
      propCount++;
      await supabase.from('integration_assets').upsert({
        client_id: clientId, provider: 'google', sub_provider: 'analytics',
        asset_type: 'property',
        external_id: prop.name,
        label: prop.displayName || prop.name,
        metadata_json: { timeZone: prop.timeZone, currencyCode: prop.currencyCode },
        is_selected: propCount === 1
      }, { onConflict: 'client_id,provider,external_id' });
    }
  }
  const result = { count: propCount, label: `${propCount} GA4 propert${propCount !== 1 ? 'ies' : 'y'} found across ${accounts.length} account(s)` };
  if (propCount === 0) {
    result.error = `GA4: found ${accounts.length} account(s) but zero properties. Per-account errors: ${perAccountErrors.join('; ') || 'none'}`;
  }
  return result;
}

// ============================================================
// META OAUTH — REAL IMPLEMENTATION
// ============================================================
export function buildMetaAuthUrl(sessionId, rawToken, extra = {}) {
  const redirectUri = `${APP_URL}/api/oauth/meta/callback`;
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: redirectUri,
    scope: META_SCOPES.join(','),
    state: JSON.stringify({ sessionId, rawToken, ...extra }),
    response_type: 'code'
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

export async function handleMetaCallback(code, stateStr) {
  const state = JSON.parse(stateStr);
  const { sessionId } = state;

  // Exchange code for access token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&redirect_uri=${encodeURIComponent(`${APP_URL}/api/oauth/meta/callback`)}&client_secret=${META_APP_SECRET}&code=${code}`
  );
  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('Meta token exchange error:', errText);
    throw new Error(`Meta token exchange failed: ${errText}`);
  }
  const tokens = await tokenRes.json();

  // Exchange for long-lived token
  const longTokenRes = await fetch(
    `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokens.access_token}`
  );
  const longTokens = longTokenRes.ok ? await longTokenRes.json() : tokens;
  const longLivedToken = longTokens.access_token || tokens.access_token;

  // Get user info
  const meRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,email&access_token=${longLivedToken}`);
  const meData = meRes.ok ? await meRes.json() : {};

  const { data: session } = await supabase.from('onboarding_sessions').select('client_id').eq('id', sessionId).single();
  if (!session) throw new Error('Session not found');
  const clientId = session.client_id;

  // Encrypt and store
  const { encrypted, iv } = encryptToken(longLivedToken);
  await supabase.from('oauth_credentials').upsert({
    client_id: clientId, provider: 'meta', sub_provider: 'meta',
    access_token_encrypted: encrypted, encryption_iv: iv,
    refresh_token_encrypted: null,
    token_type: 'Bearer',
    expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days
    external_account_id: meData.id,
    external_account_email: meData.email,
    external_account_name: meData.name,
    scopes_granted: META_SCOPES,
    status: 'active'
  }, { onConflict: 'client_id,provider,sub_provider' });

  // Discover pages and Instagram accounts
  const discoveries = await discoverMetaAssets(longLivedToken, clientId);

  // Update integrations
  await supabase.from('client_integrations').upsert({
    client_id: clientId, provider: 'meta', sub_provider: 'facebook',
    status: 'connected', scopes_granted: META_SCOPES,
    external_account_email: meData.email, external_account_name: meData.name,
    discovery_summary: discoveries, connected_at: new Date().toISOString()
  }, { onConflict: 'client_id,provider,sub_provider' });

  // Queue ingestion
  await queueIngestionJob(clientId, 'meta', 'facebook', 'onboarding');

  return { success: true, account_name: meData.name, discoveries };
}

async function discoverMetaAssets(accessToken, clientId) {
  let pagesFound = 0;
  let instagramFound = 0;
  try {
    const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=id,name,category,instagram_business_account&access_token=${accessToken}`);
    if (pagesRes.ok) {
      const pagesData = await pagesRes.json();
      for (const page of (pagesData.data || [])) {
        pagesFound++;
        await supabase.from('integration_assets').upsert({
          client_id: clientId, provider: 'meta', sub_provider: 'facebook',
          asset_type: 'page', external_id: page.id,
          label: page.name,
          metadata_json: { category: page.category },
          is_selected: pagesFound === 1
        }, { onConflict: 'client_id,provider,external_id' });
        if (page.instagram_business_account) {
          instagramFound++;
          await supabase.from('integration_assets').upsert({
            client_id: clientId, provider: 'meta', sub_provider: 'instagram',
            asset_type: 'profile', external_id: page.instagram_business_account.id,
            label: `Instagram (connected to ${page.name})`,
            is_selected: instagramFound === 1
          }, { onConflict: 'client_id,provider,external_id' });
        }
      }
    }
  } catch (e) { console.error('Meta discovery error:', e.message); }

  // Fallback: if me/accounts returned 0 pages, try via Business Manager
  if (pagesFound === 0) {
    try {
      const bizRes = await fetch(`https://graph.facebook.com/v21.0/me/businesses?access_token=${accessToken}`);
      if (bizRes.ok) {
        const bizData = await bizRes.json();
        for (const biz of (bizData.data || [])) {
          // Try client_pages (pages the business has access to)
          for (const endpoint of ['client_pages', 'owned_pages']) {
            const pRes = await fetch(`https://graph.facebook.com/v21.0/${biz.id}/${endpoint}?fields=id,name,category,access_token,instagram_business_account{id,username}&access_token=${accessToken}`);
            if (pRes.ok) {
              const pData = await pRes.json();
              for (const page of (pData.data || [])) {
                pagesFound++;
                await supabase.from('integration_assets').upsert({
                  client_id: clientId, provider: 'meta', sub_provider: 'facebook',
                  asset_type: 'page', external_id: page.id,
                  label: page.name,
                  metadata_json: { category: page.category, page_access_token: page.access_token, source: 'business_manager' },
                  is_selected: pagesFound === 1
                }, { onConflict: 'client_id,provider,external_id' });
                if (page.instagram_business_account) {
                  instagramFound++;
                  await supabase.from('integration_assets').upsert({
                    client_id: clientId, provider: 'meta', sub_provider: 'instagram',
                    asset_type: 'profile', external_id: page.instagram_business_account.id,
                    label: page.instagram_business_account.username || `Instagram (${page.name})`,
                    is_selected: instagramFound === 1
                  }, { onConflict: 'client_id,provider,external_id' });
                }
              }
            }
          }
        }
      }
    } catch (e) { console.error('Meta business fallback error:', e.message); }
  }

  // Discover Ad Accounts (for Meta Ads management)
  let adAccountsFound = 0;
  try {
    const adAccRes = await fetch(`https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status,currency,timezone_name,business{id,name}&access_token=${accessToken}`);
    if (adAccRes.ok) {
      const adAccData = await adAccRes.json();
      for (const acc of (adAccData.data || [])) {
        adAccountsFound++;
        await supabase.from('integration_assets').upsert({
          client_id: clientId, provider: 'meta', sub_provider: 'ads',
          asset_type: 'ad_account', external_id: acc.id,
          label: acc.name || acc.id,
          metadata_json: { account_status: acc.account_status, currency: acc.currency, timezone: acc.timezone_name, business: acc.business },
          is_selected: adAccountsFound === 1
        }, { onConflict: 'client_id,provider,external_id' });
      }
    }
  } catch (e) { console.error('Meta ad accounts discovery error:', e.message); }

  return {
    pages_found: pagesFound,
    instagram_found: instagramFound,
    ad_accounts_found: adAccountsFound,
    label: `${pagesFound} page${pagesFound !== 1 ? 's' : ''}, ${instagramFound} Instagram account${instagramFound !== 1 ? 's' : ''}, ${adAccountsFound} ad account${adAccountsFound !== 1 ? 's' : ''}`
  };
}

// ============================================================
// WEBSITE DISCOVERY
// ============================================================
export async function connectWebsite(sessionId, websiteUrl) {
  const { data: session } = await supabase.from('onboarding_sessions').select('client_id').eq('id', sessionId).single();
  if (!session) throw new Error('Session not found');
  const clientId = session.client_id;

  const url = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  const discovery = { url, checked_at: new Date().toISOString() };

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    discovery.reachable = res.ok;
    discovery.status_code = res.status;

    if (res.ok) {
      const html = await res.text();
      // Platform detection
      if (html.includes('wp-content') || html.includes('wordpress')) discovery.platform = 'WordPress';
      else if (html.includes('Shopify')) discovery.platform = 'Shopify';
      else if (html.includes('wix.com')) discovery.platform = 'Wix';
      else if (html.includes('webflow.com')) discovery.platform = 'Webflow';
      else if (html.includes('squarespace')) discovery.platform = 'Squarespace';
      else if (html.includes('__NEXT_DATA__') || html.includes('_next')) discovery.platform = 'Next.js';
      // Schema detection
      discovery.has_local_business_schema = html.includes('"LocalBusiness"') || html.includes('"LegalService"');
      discovery.has_faq_schema = html.includes('"FAQPage"') || html.includes('"Question"');
      discovery.has_review_schema = html.includes('"AggregateRating"') || html.includes('"Review"');
      // Analytics detection
      discovery.has_gtm = html.includes('googletagmanager.com/gtm.js');
      discovery.has_ga4 = html.includes('G-') && html.includes('gtag');
      discovery.has_pixel = html.includes('connect.facebook.net');
      // Language detection
      const langMatch = html.match(/<html[^>]*lang=["']([^"']+)["']/i);
      if (langMatch) discovery.detected_language = langMatch[1];
      // Title
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) discovery.page_title = titleMatch[1].trim();
      // Phone detection (Israeli format)
      const phoneMatch = html.match(/\b(0[2-9]\d[-.\s]?\d{3}[-.\s]?\d{4}|\+972[-.\s]?\d{1,2}[-.\s]?\d{3}[-.\s]?\d{4})\b/);
      if (phoneMatch) discovery.phone_detected = phoneMatch[1];
      // Check sitemap
      const sitemapRes = await fetch(`${url}/sitemap.xml`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
      discovery.has_sitemap = sitemapRes?.ok || false;
      // Count approximate pages from sitemap
      if (discovery.has_sitemap) {
        const sitemapXml = await sitemapRes.text();
        const urlMatches = sitemapXml.match(/<loc>/g);
        discovery.pages_in_sitemap = urlMatches?.length || 0;
      }
    }
  } catch (e) {
    discovery.reachable = false;
    discovery.error = e.message;
  }

  // Save integration
  await supabase.from('client_integrations').upsert({
    client_id: clientId, provider: 'website', sub_provider: 'website',
    status: discovery.reachable ? 'connected' : 'error',
    discovery_summary: discovery, connected_at: new Date().toISOString(),
    external_account_name: url
  }, { onConflict: 'client_id,provider,sub_provider' });

  // Update client domain
  await supabase.from('clients').update({ domain: url.replace('https://', '').replace('http://', '').split('/')[0] }).eq('id', clientId);

  // Queue technical audit
  if (discovery.reachable) {
    await queueIngestionJob(clientId, 'website', 'crawl', 'onboarding');
  }

  return discovery;
}

// ============================================================
// BUSINESS TRUTH — manual form
// ============================================================
export async function saveBusinessTruth(sessionId, formData) {
  const { data: session } = await supabase.from('onboarding_sessions').select('client_id').eq('id', sessionId).single();
  if (!session) throw new Error('Session not found');
  const clientId = session.client_id;

  await supabase.from('client_onboarding_truth').upsert({
    client_id: clientId,
    ...formData,
    completed_at: new Date().toISOString()
  }, { onConflict: 'client_id' });

  // Also update client_rules with key fields
  await supabase.from('client_rules').upsert({
    client_id: clientId,
    business_type: formData.business_type,
    industry: formData.industry,
    language: formData.report_language || 'he',
    rtl_required: formData.report_language === 'he',
    brand_voice: formData.brand_voice || formData.tone,
    target_audiences: formData.target_audiences || [],
    forbidden_audiences: formData.forbidden_audiences || [],
    geographies: formData.target_locations || [],
    compliance_style: formData.compliance_notes,
    analytics_allowed_key_events: formData.analytics_key_events || []
  }, { onConflict: 'client_id' });

  // Seed initial memory from business truth
  const memoryItems = [];
  if (formData.differentiators) {
    memoryItems.push({ scope: 'strategy', type: 'insight', content: `Client differentiators: ${formData.differentiators}`, tags: ['differentiators', 'positioning'] });
  }
  if (formData.target_audiences?.length) {
    memoryItems.push({ scope: 'general', type: 'constraint', content: `Target audiences: ${formData.target_audiences.join(', ')}`, tags: ['audiences'] });
  }
  if (formData.forbidden_audiences?.length) {
    memoryItems.push({ scope: 'general', type: 'constraint', content: `Forbidden audiences (do not target): ${formData.forbidden_audiences.join(', ')}`, tags: ['audiences', 'forbidden'] });
  }
  if (formData.compliance_notes) {
    memoryItems.push({ scope: 'general', type: 'rule', content: `Compliance notes: ${formData.compliance_notes}`, tags: ['compliance', 'legal'] });
  }
  if (memoryItems.length > 0) {
    await supabase.from('memory_items').insert(memoryItems.map(m => ({ client_id: clientId, ...m, source: 'onboarding', approved: true, relevance_score: 0.9 })));
  }

  await supabase.from('onboarding_sessions').update({
    step_business_truth_done: true, last_activity_at: new Date().toISOString()
  }).eq('id', sessionId);

  await supabase.from('onboarding_events').insert({
    session_id: sessionId, client_id: clientId,
    event_type: 'business_truth_saved'
  });

  return { success: true, memory_items_created: memoryItems.length };
}

// ============================================================
// SELECT ASSET (which property/account to use)
// ============================================================
export async function selectAsset(sessionId, assetId) {
  const { data: session } = await supabase.from('onboarding_sessions').select('client_id').eq('id', sessionId).single();
  if (!session) throw new Error('Session not found');

  const { data: asset } = await supabase.from('integration_assets').select('*').eq('id', assetId).single();
  if (!asset) throw new Error('Asset not found');

  // Deselect others for same provider/sub_provider
  await supabase.from('integration_assets')
    .update({ is_selected: false })
    .eq('client_id', session.client_id)
    .eq('provider', asset.provider)
    .eq('sub_provider', asset.sub_provider || asset.provider);

  // Select this one
  await supabase.from('integration_assets').update({ is_selected: true }).eq('id', assetId);

  // Update integration with selected asset
  await supabase.from('client_integrations')
    .update({ selected_asset_id: asset.external_id, selected_asset_label: asset.label })
    .eq('client_id', session.client_id)
    .eq('provider', asset.provider)
    .eq('sub_provider', asset.sub_provider || '');

  // Start ingestion for this specific asset
  await queueIngestionJob(session.client_id, asset.provider, asset.sub_provider || asset.provider, 'asset_selected', asset.external_id);

  return { success: true, asset };
}

// ============================================================
// FINALIZE ONBOARDING
// ============================================================
export async function finalizeOnboarding(sessionId) {
  const { data: session } = await supabase
    .from('onboarding_sessions')
    .select('*, clients(*)')
    .eq('id', sessionId).single();
  if (!session) throw new Error('Session not found');
  const clientId = session.client_id;

  // Get all integrations
  const { data: integrations } = await supabase.from('client_integrations').select('*').eq('client_id', clientId);
  const connected = integrations?.filter(i => i.status === 'connected') || [];

  // Queue first agent runs
  const agentSlugs = [];
  if (connected.find(i => i.sub_provider === 'search_console')) agentSlugs.push('seo-core-agent', 'gsc-daily-monitor');
  if (connected.find(i => i.sub_provider === 'ads')) agentSlugs.push('google-ads-campaign-agent');
  if (connected.find(i => i.sub_provider === 'business_profile')) agentSlugs.push('local-seo-agent');
  if (connected.find(i => i.sub_provider === 'facebook')) agentSlugs.push('facebook-agent');
  agentSlugs.push('master-orchestrator', 'credential-health-agent');

  const { data: agents } = await supabase.from('agent_templates').select('id, slug').in('slug', agentSlugs);
  if (agents?.length) {
    await supabase.from('run_queue').insert(agents.map(a => ({
      client_id: clientId, agent_template_id: a.id,
      task_payload: { triggered_by: 'onboarding_finalize', first_run: true },
      status: 'queued', queued_by: 'onboarding', priority: 1
    })));
  }

  // Create baselines
  await supabase.from('onboarding_sessions').update({
    status: 'completed',
    step_finalized: true,
    completed_at: new Date().toISOString()
  }).eq('id', sessionId);

  // Notify admin
  if (session.notify_email) {
    await sendAdminNotification(session.notify_email, session.client_name, connected.length, agentSlugs.length);
  }

  await supabase.from('audit_trail').insert({
    client_id: clientId, action_type: 'onboarding_completed', triggered_by: 'client',
    after_value: JSON.stringify({ connectors_connected: connected.length, agents_queued: agents?.length || 0 })
  });

  return {
    success: true,
    connectors_connected: connected.length,
    agents_queued: agents?.length || 0,
    ingestion_jobs_queued: connected.length,
    redirect_to: '/onboarding/complete'
  };
}

// ============================================================
// INGESTION JOB QUEUE
// ============================================================
export async function queueIngestionJob(clientId, provider, subProvider, triggeredBy, assetId = null) {
  const { data } = await supabase.from('ingestion_jobs').insert({
    client_id: clientId, provider, sub_provider: subProvider,
    job_type: `${provider}_${subProvider}`,
    status: 'queued', triggered_by: triggeredBy,
    asset_id: assetId
  }).select().single();
  return data;
}

export async function processIngestionJob(jobId) {
  const { data: job } = await supabase.from('ingestion_jobs').select('*').eq('id', jobId).single();
  if (!job) throw new Error('Job not found');

  await supabase.from('ingestion_jobs').update({ status: 'running', started_at: new Date().toISOString() }).eq('id', jobId);

  try {
    // Get credential
    const { data: cred } = await supabase.from('oauth_credentials')
      .select('*').eq('client_id', job.client_id).eq('provider', job.provider).single();
    if (!cred) throw new Error('No OAuth credentials found');

    // Decrypt
    const ivParts = cred.encryption_iv.split(':');
    const accessToken = decryptToken(cred.access_token_encrypted, ivParts[0]);
    let summary = {};

    switch (`${job.provider}_${job.sub_provider}`) {
      case 'google_search_console': {
        summary = await ingestSearchConsoleData(job.client_id, accessToken, job.asset_id);
        break;
      }
      case 'google_ads': {
        summary = await ingestGoogleAdsData(job.client_id, accessToken, job.asset_id);
        break;
      }
      case 'google_business_profile': {
        summary = await ingestGBPData(job.client_id, accessToken, job.asset_id);
        break;
      }
      case 'meta_facebook': {
        summary = await ingestMetaData(job.client_id, accessToken);
        break;
      }
      case 'website_crawl': {
        summary = { note: 'Website crawl queued for technical SEO agent' };
        break;
      }
      default:
        summary = { note: `Ingestion not implemented for ${job.provider}/${job.sub_provider}` };
    }

    await supabase.from('ingestion_jobs').update({
      status: 'completed', summary, rows_synced: summary.rows_synced || 0,
      completed_at: new Date().toISOString()
    }).eq('id', jobId);

    return summary;
  } catch (e) {
    await supabase.from('ingestion_jobs').update({ status: 'failed', error: e.message }).eq('id', jobId);
    throw e;
  }
}

async function ingestSearchConsoleData(clientId, accessToken, propertyUrl) {
  if (!propertyUrl) {
    const { data: asset } = await supabase.from('integration_assets')
      .select('external_id').eq('client_id', clientId)
      .eq('sub_provider', 'search_console').eq('is_selected', true).maybeSingle();
    propertyUrl = asset?.external_id;
  }
  if (!propertyUrl) return { note: 'No property selected' };

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions: ['query'], rowLimit: 100, startRow: 0 })
  });

  if (!res.ok) return { error: await res.text() };
  const data = await res.json();
  const rows = data.rows || [];

  // Upsert keywords
  let upserted = 0;
  for (const row of rows) {
    const keyword = row.keys[0];
    const position = Math.round(row.position);
    const { error } = await supabase.from('client_keywords').upsert({
      client_id: clientId, keyword,
      current_position: position,
      baseline_position: position,
      source: 'gsc_import',
      last_checked: new Date().toISOString()
    }, { onConflict: 'client_id,keyword' });
    if (!error) upserted++;
  }

  // Store KPI snapshot
  await supabase.from('kpi_snapshots').insert({
    client_id: clientId, metric_name: 'gsc_total_clicks_28d',
    metric_value: rows.reduce((s, r) => s + (r.clicks || 0), 0),
    source: 'Google Search Console API', source_verified: true,
    data_date: endDate
  });

  return { keywords_found: rows.length, keywords_upserted: upserted, rows_synced: upserted, date_range: `${startDate} to ${endDate}` };
}

async function ingestGoogleAdsData(clientId, accessToken, customerId) {
  if (!customerId) {
    const { data: asset } = await supabase.from('integration_assets')
      .select('external_id').eq('client_id', clientId).eq('sub_provider', 'ads').eq('is_selected', true).maybeSingle();
    customerId = asset?.external_id;
  }
  if (!customerId) return { note: 'No account selected' };

  // Store the customer ID as baseline info
  await supabase.from('kpi_snapshots').insert({
    client_id: clientId, metric_name: 'google_ads_account_id',
    metric_value: 0, metric_text: `Account: ${customerId}`,
    source: 'Google Ads API', source_verified: true, data_date: new Date().toISOString().split('T')[0]
  });

  return { account_id: customerId, note: 'Account connected — campaign data requires developer token', rows_synced: 1 };
}

async function ingestGBPData(clientId, accessToken, locationName) {
  if (!locationName) {
    const { data: asset } = await supabase.from('integration_assets')
      .select('external_id').eq('client_id', clientId).eq('sub_provider', 'business_profile').eq('is_selected', true).maybeSingle();
    locationName = asset?.external_id;
  }
  if (!locationName) return { note: 'No location selected' };

  // Get review count from GBP
  try {
    const reviewsRes = await fetch(`https://mybusiness.googleapis.com/v4/${locationName}/reviews?pageSize=50`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (reviewsRes.ok) {
      const reviewData = await reviewsRes.json();
      const reviewCount = reviewData.totalReviewCount || 0;
      const avgRating = reviewData.averageRating || 0;
      await supabase.from('kpi_snapshots').insert({
        client_id: clientId, metric_name: 'google_reviews_count',
        metric_value: reviewCount, metric_text: `${reviewCount} reviews`,
        source: 'Google Business Profile API', source_verified: true, data_date: new Date().toISOString().split('T')[0]
      });
      await supabase.from('baselines').upsert({
        client_id: clientId, metric_name: 'google_reviews_count',
        metric_value: reviewCount, metric_text: `${reviewCount} reviews`,
        source: 'Google Business Profile API'
      }, { onConflict: 'client_id,metric_name' });
      return { reviews_found: reviewCount, avg_rating: avgRating, rows_synced: reviewCount };
    }
  } catch (e) { /* GBP API may require additional setup */ }
  return { note: 'GBP connected — review data sync requires API activation', rows_synced: 0 };
}

async function ingestMetaData(clientId, accessToken) {
  const { data: pageAsset } = await supabase.from('integration_assets')
    .select('external_id, label').eq('client_id', clientId).eq('sub_provider', 'facebook').eq('is_selected', true).maybeSingle();
  if (!pageAsset) return { note: 'No Facebook page selected' };

  // Get page token for selected page
  const pagesRes = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${accessToken}`);
  if (!pagesRes.ok) return { error: 'Could not fetch pages' };
  const pagesData = await pagesRes.json();
  const page = pagesData.data?.find(p => p.id === pageAsset.external_id);
  if (!page) return { note: 'Page not found in account' };

  // Get page insights
  const insightsRes = await fetch(`https://graph.facebook.com/v19.0/${page.id}/insights?metric=page_fans&access_token=${page.access_token}`);
  let fans = 0;
  if (insightsRes.ok) {
    const insData = await insightsRes.json();
    fans = insData.data?.[0]?.values?.[0]?.value || 0;
  }

  await supabase.from('kpi_snapshots').insert({
    client_id: clientId, metric_name: 'facebook_page_fans',
    metric_value: fans, metric_text: `${fans} page followers`,
    source: 'Meta Graph API', source_verified: true, data_date: new Date().toISOString().split('T')[0]
  });

  return { page_name: page.name, fans, rows_synced: 1 };
}

// ============================================================
// SEND ADMIN NOTIFICATION
// ============================================================
async function sendAdminNotification(toEmail, clientName, connectorsCount, agentsQueued) {
  if (!process.env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'AI Growth OS <notifications@elad.digital>',
      to: [toEmail],
      subject: `🚀 ${clientName} — Onboarding Complete!`,
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
        <h2 style="color:#6366f1;">🚀 ${clientName} is ready!</h2>
        <p><strong>${connectorsCount}</strong> connectors connected.</p>
        <p><strong>${agentsQueued}</strong> agents queued and starting.</p>
        <p>First data ingestion is running. Baselines will be set within minutes.</p>
        <a href="${APP_URL}/clients" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px;">View Client →</a>
      </div>`
    })
  });
}

// ============================================================
// REDISCOVER GOOGLE ASSETS — re-runs the 4 discovery calls
// without forcing the user through another OAuth dance.
// Uses the stored refresh_token to get a fresh access token,
// then calls each discover* function and updates client_integrations.
// ============================================================
export async function rediscoverGoogleAssets(clientId, subProviders = ['search_console', 'ads', 'business_profile', 'analytics']) {
  const accessToken = await refreshGoogleToken(clientId);
  const results = {};
  for (const sp of subProviders) {
    try {
      const result = await discoverGoogleAssets(accessToken, sp, clientId);
      results[sp] = result;
      await supabase.from('client_integrations').upsert({
        client_id: clientId,
        provider: 'google',
        sub_provider: sp,
        status: result.count > 0 ? 'connected' : 'limited',
        discovery_summary: result,
        connected_at: new Date().toISOString(),
      }, { onConflict: 'client_id,provider,sub_provider' });
    } catch (e) {
      results[sp] = { count: 0, error: `Rediscover exception: ${e.message}` };
    }
  }
  return results;
}

// ============================================================
// REDISCOVER META ASSETS (post-onboarding)
// ============================================================
export async function rediscoverMetaAssets(clientId) {
  const { data: cred } = await supabase.from('oauth_credentials')
    .select('*').eq('client_id', clientId).eq('provider', 'meta').single();
  if (!cred?.access_token_encrypted) throw new Error('No Meta credentials found for this client');

  // Meta stores a single IV (not colon-separated like Google)
  const iv = cred.encryption_iv.includes(':') ? cred.encryption_iv.split(':')[0] : cred.encryption_iv;
  const accessToken = decryptToken(cred.access_token_encrypted, iv);

  // Verify token is still valid
  const debugRes = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name&access_token=${accessToken}`);
  if (!debugRes.ok) {
    const errText = await debugRes.text();
    throw new Error(`Meta token invalid or expired: ${errText}`);
  }
  const me = await debugRes.json();

  // Discover pages and Instagram accounts
  const discoveries = await discoverMetaAssets(accessToken, clientId);

  // Update integration status
  await supabase.from('client_integrations').upsert({
    client_id: clientId, provider: 'meta', sub_provider: 'facebook',
    status: discoveries.pages_found > 0 ? 'connected' : 'limited',
    discovery_summary: discoveries,
    external_account_name: me.name,
    connected_at: new Date().toISOString()
  }, { onConflict: 'client_id,provider,sub_provider' });

  return { account_name: me.name, ...discoveries };
}

// ============================================================
// REFRESH GOOGLE TOKEN
// ============================================================
export async function refreshGoogleToken(clientId) {
  const { data: cred } = await supabase.from('oauth_credentials')
    .select('*').eq('client_id', clientId).eq('provider', 'google').single();
  if (!cred?.refresh_token_encrypted) throw new Error('No refresh token');

  const ivParts = cred.encryption_iv.split(':');
  const refreshToken = decryptToken(cred.refresh_token_encrypted, ivParts[1]);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!res.ok) throw new Error('Token refresh failed');
  const tokens = await res.json();

  const { encrypted: encAccess, iv: ivAccess } = encryptToken(tokens.access_token);
  await supabase.from('oauth_credentials').update({
    access_token_encrypted: encAccess,
    encryption_iv: ivAccess + ':' + ivParts[1],
    expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    last_refresh_at: new Date().toISOString(), status: 'active'
  }).eq('id', cred.id);

  return tokens.access_token;
}

async function getSessionCompleted(sessionId) {
  const { data } = await supabase.from('onboarding_sessions').select('completed_connectors').eq('id', sessionId).single();
  return data?.completed_connectors || [];
}
