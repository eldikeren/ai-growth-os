// ============================================================
// AI GROWTH OS — WEBSITE ACCESS & DEPLOYMENT MODULE
// All backend logic: save connections, encrypt secrets,
// validate access, build agent runtime context
// ============================================================

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const ENC_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

// ── ENCRYPTION ────────────────────────────────────────────────
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENC_KEY, 'hex').slice(0, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const enc = cipher.update(text, 'utf8', 'hex') + cipher.final('hex');
  return { encrypted: enc, iv: iv.toString('hex') };
}

function decrypt(enc, ivHex) {
  const iv = Buffer.from(ivHex, 'hex');
  const key = Buffer.from(ENC_KEY, 'hex').slice(0, 32);
  const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return d.update(enc, 'hex', 'utf8') + d.final('utf8');
}

function hint(secret) {
  if (!secret || secret.length < 4) return '****';
  return '***' + secret.slice(-4);
}

// ============================================================
// WEBSITE IDENTITY — save/update basic website info
// ============================================================
export async function saveWebsiteIdentity(clientId, data) {
  const {
    label, primaryDomain, canonicalDomain, productionUrl,
    stagingUrl, sitemapUrl, robotsUrl,
    websitePlatformType, cmsType, frameworkType,
    hostingProvider, deploymentProvider, dnsDnProvider, cdnProvider,
    buildCommand, startCommand, isPrimary = true
  } = data;

  // Upsert client_website
  const existing = await supabase.from('client_websites')
    .select('id').eq('client_id', clientId).eq('is_primary', true).maybeSingle();

  let websiteId;
  if (existing.data?.id) {
    await supabase.from('client_websites').update({
      label, primary_domain: primaryDomain, canonical_domain: canonicalDomain,
      production_url: productionUrl, staging_url: stagingUrl,
      sitemap_url: sitemapUrl, robots_url: robotsUrl,
      website_platform_type: websitePlatformType, cms_type: cmsType,
      framework_type: frameworkType, hosting_provider: hostingProvider,
      deployment_provider: deploymentProvider, cdn_provider: cdnProvider,
      build_command: buildCommand, start_command: startCommand
    }).eq('id', existing.data.id);
    websiteId = existing.data.id;
  } else {
    const { data: newSite } = await supabase.from('client_websites').insert({
      client_id: clientId, label: label || 'Primary Website',
      primary_domain: primaryDomain, canonical_domain: canonicalDomain,
      production_url: productionUrl, staging_url: stagingUrl,
      sitemap_url: sitemapUrl, robots_url: robotsUrl,
      website_platform_type: websitePlatformType || 'unknown',
      cms_type: cmsType, framework_type: frameworkType,
      hosting_provider: hostingProvider, deployment_provider: deploymentProvider,
      cdn_provider: cdnProvider, build_command: buildCommand,
      start_command: startCommand, is_primary: isPrimary
    }).select().single();
    websiteId = newSite?.id;
  }

  // Ensure access profile exists
  await supabase.from('website_access_profiles').upsert({
    client_website_id: websiteId, read_only_enabled: true,
    current_access_level: 'read_only'
  }, { onConflict: 'client_website_id' });

  // Ensure default change policy
  await supabase.from('website_change_policies').upsert({
    client_website_id: websiteId,
    allow_analysis: true, allow_crawl: true,
    allow_content_edits: false, allow_code_changes: false,
    allow_direct_production_changes: false,
    require_pr: true, require_staging_first: true,
    require_manual_approval_before_publish: true
  }, { onConflict: 'client_website_id' });

  // Run discovery crawl
  const discovery = await crawlWebsiteBasic(productionUrl || `https://${primaryDomain}`);
  if (discovery.reachable) {
    await supabase.from('client_websites').update({
      is_reachable: true,
      detected_language: discovery.detectedLanguage,
      detected_platform: discovery.platform,
      has_sitemap: discovery.hasSitemap,
      has_schema: discovery.hasSchema,
      has_ga4: discovery.hasGa4,
      has_gtm: discovery.hasGtm,
      pages_in_sitemap: discovery.pagesInSitemap || 0,
      last_crawled_at: new Date().toISOString(),
      website_platform_type: discovery.platform
        ? mapPlatform(discovery.platform)
        : (websitePlatformType || 'unknown')
    }).eq('id', websiteId);
  }

  return { website_id: websiteId, discovery };
}

// ── PLATFORM MAPPER ───────────────────────────────────────────
function mapPlatform(detected) {
  const d = detected.toLowerCase();
  if (d.includes('wordpress')) return 'wordpress';
  if (d.includes('next')) return 'nextjs';
  if (d.includes('wix')) return 'wix';
  if (d.includes('webflow')) return 'webflow';
  if (d.includes('shopify')) return 'shopify';
  if (d.includes('squarespace')) return 'squarespace';
  if (d.includes('static')) return 'static';
  return 'custom';
}

// ── WEBSITE CRAWLER (basic, no puppeteer needed) ──────────────
async function crawlWebsiteBasic(url) {
  const result = { url, reachable: false };
  try {
    const cleanUrl = url.startsWith('http') ? url : `https://${url}`;
    const res = await fetch(cleanUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'AI-Growth-OS/1.0 (SEO Analysis Bot)' }
    });
    result.reachable = res.ok;
    result.statusCode = res.status;
    if (!res.ok) return result;
    const html = await res.text();
    // Platform detection
    if (html.includes('wp-content') || html.includes('wp-includes')) result.platform = 'WordPress';
    else if (html.includes('__NEXT_DATA__') || html.includes('/_next/')) result.platform = 'Next.js';
    else if (html.includes('wix.com')) result.platform = 'Wix';
    else if (html.includes('webflow.io') || html.includes('webflow.com')) result.platform = 'Webflow';
    else if (html.includes('Shopify')) result.platform = 'Shopify';
    else if (html.includes('squarespace')) result.platform = 'Squarespace';
    // Schema
    result.hasSchema = html.includes('"@type"') || html.includes("'@type'");
    result.hasLocalBusinessSchema = html.includes('"LocalBusiness"') || html.includes('"LegalService"');
    result.hasFaqSchema = html.includes('"FAQPage"') || html.includes('"Question"');
    // Analytics
    result.hasGa4 = (html.includes('G-') && html.includes('gtag')) || html.includes('google-analytics.com/g/');
    result.hasGtm = html.includes('googletagmanager.com/gtm.js');
    result.hasPixel = html.includes('connect.facebook.net');
    // Language
    const langMatch = html.match(/<html[^>]+lang=["']([^"']+)["']/i);
    if (langMatch) result.detectedLanguage = langMatch[1];
    // Title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) result.pageTitle = titleMatch[1].trim();
    // Israeli phone
    const phoneMatch = html.match(/\b(0[2-9]\d[-.\s]?\d{3}[-.\s]?\d{4}|\+972[-.\s]?\d{1,2}[-.\s]?\d{7,8})\b/);
    if (phoneMatch) result.phoneDetected = phoneMatch[1];
    // WhatsApp link
    result.hasWhatsapp = html.includes('wa.me') || html.includes('whatsapp.com');
    // Canonical
    const canMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    if (canMatch) result.canonicalUrl = canMatch[1];
    // H1
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) result.h1 = h1Match[1].trim();
    // Sitemap check
    const sitemapRes = await fetch(`${cleanUrl.replace(/\/$/, '')}/sitemap.xml`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    result.hasSitemap = sitemapRes?.ok || false;
    if (result.hasSitemap) {
      try {
        const sitemapXml = await sitemapRes.text();
        const urlMatches = sitemapXml.match(/<loc>/g);
        result.pagesInSitemap = urlMatches?.length || 0;
        // Detect sitemap index
        result.isSitemapIndex = sitemapXml.includes('<sitemapindex');
      } catch (e) {}
    }
    // robots.txt check
    const robotsRes = await fetch(`${cleanUrl.replace(/\/$/, '')}/robots.txt`, { signal: AbortSignal.timeout(3000) }).catch(() => null);
    result.hasRobots = robotsRes?.ok || false;
    if (result.hasRobots) {
      const robotsTxt = await robotsRes.text();
      result.robotsDisallowsAll = robotsTxt.includes('Disallow: /') && !robotsTxt.includes('Allow:');
    }
    // Check for SSL
    result.hasSSL = cleanUrl.startsWith('https');
    // Mobile viewport
    result.hasMobileViewport = html.includes('viewport') && html.includes('width=device-width');
  } catch (e) {
    result.reachable = false;
    result.error = e.message;
  }
  return result;
}

// ============================================================
// GIT CONNECTION
// ============================================================
export async function saveGitConnection(clientWebsiteId, data, gitToken = null) {
  const {
    provider, repoUrl, repoOwner, repoName,
    defaultBranch, productionBranch, stagingBranch,
    accessMode, deploymentPlatform, deploymentProjectId,
    deploymentProductionUrl, deploymentStagingUrl
  } = data;

  // Parse owner/name from URL if not provided
  let owner = repoOwner, name = repoName;
  if (!owner && repoUrl) {
    const match = repoUrl.match(/(?:github|gitlab|bitbucket)\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) { owner = match[1]; name = match[2].replace('.git', ''); }
  }

  await supabase.from('website_git_connections').upsert({
    client_website_id: clientWebsiteId,
    provider, repo_url: repoUrl, repo_owner: owner, repo_name: name,
    default_branch: defaultBranch || 'main',
    production_branch: productionBranch || 'main',
    staging_branch: stagingBranch,
    access_mode: accessMode || 'clone_only',
    deployment_platform: deploymentPlatform,
    deployment_project_id: deploymentProjectId,
    deployment_production_url: deploymentProductionUrl,
    deployment_staging_url: deploymentStagingUrl,
    connection_status: 'untested'
  }, { onConflict: 'client_website_id' });

  // Store git token encrypted if provided
  if (gitToken) {
    await storeSecret(clientWebsiteId, 'git_token', gitToken, 'Git access token');
  }

  // Update access profile
  await supabase.from('website_access_profiles').upsert({
    client_website_id: clientWebsiteId,
    git_access_enabled: true,
    has_git_token: !!gitToken,
    current_access_level: 'git_edit'
  }, { onConflict: 'client_website_id' });

  // Auto-test connection
  return await validateGitConnection(clientWebsiteId);
}

// ============================================================
// CMS CONNECTION
// ============================================================
export async function saveCmsConnection(clientWebsiteId, data, cmsPassword = null, cmsApiToken = null) {
  const {
    cmsType, adminUrl, accessEmail, username,
    apiEnabled, apiBaseUrl, environmentScope
  } = data;

  await supabase.from('website_cms_connections').upsert({
    client_website_id: clientWebsiteId,
    cms_type: cmsType, admin_url: adminUrl,
    access_email: accessEmail, username,
    api_enabled: apiEnabled || false,
    api_base_url: apiBaseUrl,
    environment_scope: environmentScope || 'production',
    connection_status: 'untested'
  }, { onConflict: 'client_website_id' });

  if (cmsPassword) await storeSecret(clientWebsiteId, 'cms_password', cmsPassword, 'CMS login password');
  if (cmsApiToken) await storeSecret(clientWebsiteId, 'cms_api_token', cmsApiToken, 'CMS API token');

  await supabase.from('website_access_profiles').upsert({
    client_website_id: clientWebsiteId,
    cms_access_enabled: true,
    has_cms_token: !!cmsApiToken,
    current_access_level: 'cms_edit'
  }, { onConflict: 'client_website_id' });

  return await validateCmsConnection(clientWebsiteId);
}

// ============================================================
// SERVER CONNECTION
// ============================================================
export async function saveServerConnection(clientWebsiteId, data, serverPassword = null, sshPrivateKey = null) {
  const {
    accessType, host, port, username, authType,
    siteRootPath, backupPath, deployCommand, buildCommand, restartCommand
  } = data;

  await supabase.from('website_server_connections').upsert({
    client_website_id: clientWebsiteId,
    access_type: accessType, host, port: port || 22,
    username, auth_type: authType || 'password',
    site_root_path: siteRootPath, backup_path: backupPath,
    deploy_command: deployCommand, build_command: buildCommand,
    restart_command: restartCommand, connection_status: 'untested'
  }, { onConflict: 'client_website_id' });

  if (serverPassword) await storeSecret(clientWebsiteId, 'server_password', serverPassword, 'Server password');
  if (sshPrivateKey) await storeSecret(clientWebsiteId, 'server_private_key', sshPrivateKey, 'SSH private key');

  await supabase.from('website_access_profiles').upsert({
    client_website_id: clientWebsiteId,
    server_access_enabled: true,
    has_server_password: !!serverPassword,
    has_server_private_key: !!sshPrivateKey,
    current_access_level: 'server_edit'
  }, { onConflict: 'client_website_id' });

  return await validateServerConnection(clientWebsiteId);
}

// ============================================================
// SECRET STORAGE
// ============================================================
async function storeSecret(clientWebsiteId, secretType, secretValue, label) {
  const { encrypted, iv } = encrypt(secretValue);
  await supabase.from('website_secrets').upsert({
    client_website_id: clientWebsiteId,
    secret_type: secretType,
    encrypted_value: encrypted,
    encryption_iv: iv,
    label,
    hint: hint(secretValue),
    last_rotated_at: new Date().toISOString()
  }, { onConflict: 'client_website_id,secret_type' });
}

export async function getDecryptedSecret(clientWebsiteId, secretType) {
  const { data } = await supabase.from('website_secrets')
    .select('encrypted_value, encryption_iv')
    .eq('client_website_id', clientWebsiteId)
    .eq('secret_type', secretType)
    .single();
  if (!data) return null;
  return decrypt(data.encrypted_value, data.encryption_iv);
}

// ============================================================
// VALIDATION
// ============================================================
export async function validateGitConnection(clientWebsiteId) {
  const { data: conn } = await supabase.from('website_git_connections').select('*').eq('client_website_id', clientWebsiteId).single();
  if (!conn) return { status: 'failed', error: 'No git connection configured' };

  const startTime = Date.now();
  const results = { repo_reachable: false, branch_exists: false, read_access_works: false, write_access_works: false };
  let status = 'failed';
  let error = null;

  try {
    const token = await getDecryptedSecret(clientWebsiteId, 'git_token');
    const headers = token ? { Authorization: `token ${token}` } : {};

    if (conn.provider === 'github' && conn.repo_owner && conn.repo_name) {
      // Test repo access
      const repoRes = await fetch(`https://api.github.com/repos/${conn.repo_owner}/${conn.repo_name}`, { headers, signal: AbortSignal.timeout(8000) });
      results.repo_reachable = repoRes.ok;
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        results.is_private = repoData.private;
        results.default_branch = repoData.default_branch;
        // Test branch
        const branchRes = await fetch(`https://api.github.com/repos/${conn.repo_owner}/${conn.repo_name}/branches/${conn.production_branch || conn.default_branch}`, { headers, signal: AbortSignal.timeout(5000) });
        results.branch_exists = branchRes.ok;
        results.read_access_works = branchRes.ok;
        // Test write (check permissions from repo data)
        results.write_access_works = repoData.permissions?.push || false;
        status = results.read_access_works ? (results.write_access_works ? 'connected' : 'limited') : 'failed';
      } else {
        error = `Repository not accessible: ${repoRes.status}`;
      }
    } else if (conn.provider === 'gitlab') {
      const projectPath = encodeURIComponent(`${conn.repo_owner}/${conn.repo_name}`);
      const glRes = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}`, { headers: { 'PRIVATE-TOKEN': token || '' }, signal: AbortSignal.timeout(8000) });
      results.repo_reachable = glRes.ok;
      results.read_access_works = glRes.ok;
      status = glRes.ok ? 'connected' : 'failed';
      if (!glRes.ok) error = `GitLab access failed: ${glRes.status}`;
    } else {
      // Generic: just try to reach the URL
      const urlRes = await fetch(conn.repo_url, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      results.repo_reachable = urlRes?.ok || false;
      status = results.repo_reachable ? 'limited' : 'failed';
      if (!results.repo_reachable) error = 'Repository URL not reachable';
    }
  } catch (e) { error = e.message; }

  // Update connection
  await supabase.from('website_git_connections').update({
    connection_status: status,
    last_tested_at: new Date().toISOString(),
    last_error: error,
    ...results
  }).eq('client_website_id', clientWebsiteId);

  // Log
  await supabase.from('website_validation_logs').insert({
    client_website_id: clientWebsiteId,
    validation_type: 'git', status: status === 'connected' ? 'passed' : status === 'limited' ? 'partial' : 'failed',
    details: results, error, duration_ms: Date.now() - startTime, triggered_by: 'auto'
  });

  return { status, results, error };
}

export async function validateCmsConnection(clientWebsiteId) {
  const { data: conn } = await supabase.from('website_cms_connections').select('*').eq('client_website_id', clientWebsiteId).single();
  if (!conn) return { status: 'failed', error: 'No CMS connection configured' };

  const startTime = Date.now();
  const results = {};
  let status = 'failed';
  let error = null;

  try {
    // Test admin URL reachability
    if (conn.admin_url) {
      const adminRes = await fetch(conn.admin_url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      results.admin_url_reachable = adminRes?.ok || false;
      if (results.admin_url_reachable) status = 'limited';
    }
    // Test API if enabled
    if (conn.api_enabled && conn.api_base_url) {
      const apiToken = await getDecryptedSecret(clientWebsiteId, 'cms_api_token');
      const headers = apiToken ? { Authorization: `Bearer ${apiToken}` } : {};
      if (conn.cms_type === 'wordpress') {
        const wpRes = await fetch(`${conn.api_base_url}/wp-json/wp/v2/posts?per_page=1`, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null);
        results.api_reachable = wpRes?.ok || false;
        if (results.api_reachable) {
          results.can_read = true;
          status = 'connected';
          // Test write capability (check /wp-json/wp/v2/users/me)
          const meRes = apiToken ? await fetch(`${conn.api_base_url}/wp-json/wp/v2/users/me`, { headers, signal: AbortSignal.timeout(5000) }).catch(() => null) : null;
          if (meRes?.ok) {
            const meData = await meRes.json();
            results.can_edit = meData.capabilities?.edit_posts || false;
            results.can_publish = meData.capabilities?.publish_posts || false;
          }
        }
      } else {
        const apiRes = await fetch(conn.api_base_url, { headers, signal: AbortSignal.timeout(8000) }).catch(() => null);
        results.api_reachable = apiRes?.ok || false;
        if (results.api_reachable) status = 'connected';
      }
    }
  } catch (e) { error = e.message; }

  await supabase.from('website_cms_connections').update({
    connection_status: status, last_tested_at: new Date().toISOString(),
    last_error: error, can_read_pages: results.can_read || false,
    can_edit_pages: results.can_edit || false, can_publish: results.can_publish || false
  }).eq('client_website_id', clientWebsiteId);

  await supabase.from('website_validation_logs').insert({
    client_website_id: clientWebsiteId, validation_type: 'cms',
    status: status === 'connected' ? 'passed' : status === 'limited' ? 'partial' : 'failed',
    details: results, error, duration_ms: Date.now() - startTime
  });

  return { status, results, error };
}

export async function validateServerConnection(clientWebsiteId) {
  const { data: conn } = await supabase.from('website_server_connections').select('*').eq('client_website_id', clientWebsiteId).single();
  if (!conn) return { status: 'failed', error: 'No server connection configured' };

  const startTime = Date.now();
  const results = {};
  let status = 'failed';
  let error = null;

  try {
    // For SSH/SFTP: test TCP connectivity to the host+port
    // Full SSH auth testing requires ssh2 library — here we test TCP reach
    const net = await import('net');
    const tcpReachable = await new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);
      socket.on('connect', () => { socket.destroy(); resolve(true); });
      socket.on('timeout', () => { socket.destroy(); resolve(false); });
      socket.on('error', () => resolve(false));
      socket.connect(conn.port || 22, conn.host);
    });
    results.host_reachable = tcpReachable;
    results.port_open = tcpReachable;
    if (tcpReachable) {
      status = 'limited'; // Can reach, but can't verify auth without ssh2 library
      results.note = 'TCP connection successful. Full auth verification requires deployment.';
    } else {
      error = `Cannot reach ${conn.host}:${conn.port || 22}`;
    }
  } catch (e) { error = e.message; }

  await supabase.from('website_server_connections').update({
    connection_status: status, last_tested_at: new Date().toISOString(), last_error: error
  }).eq('client_website_id', clientWebsiteId);

  await supabase.from('website_validation_logs').insert({
    client_website_id: clientWebsiteId, validation_type: 'server',
    status: status === 'connected' ? 'passed' : status === 'limited' ? 'partial' : 'failed',
    details: results, error, duration_ms: Date.now() - startTime
  });

  return { status, results, error };
}

export async function validateAll(clientWebsiteId) {
  const results = {};
  const { data: profile } = await supabase.from('website_access_profiles').select('*').eq('client_website_id', clientWebsiteId).single();
  if (!profile) return { error: 'No access profile found' };

  if (profile.git_access_enabled) results.git = await validateGitConnection(clientWebsiteId);
  if (profile.cms_access_enabled) results.cms = await validateCmsConnection(clientWebsiteId);
  if (profile.server_access_enabled) results.server = await validateServerConnection(clientWebsiteId);

  // Crawl validation
  const { data: site } = await supabase.from('client_websites').select('production_url, primary_domain').eq('id', clientWebsiteId).single();
  const crawlUrl = site?.production_url || `https://${site?.primary_domain}`;
  const crawlResult = await crawlWebsiteBasic(crawlUrl);
  results.crawl = { status: crawlResult.reachable ? 'passed' : 'failed', details: crawlResult };
  await supabase.from('website_validation_logs').insert({
    client_website_id: clientWebsiteId, validation_type: 'crawl',
    status: crawlResult.reachable ? 'passed' : 'failed', details: crawlResult
  });

  // Update overall validation status
  const allPassed = Object.values(results).every(r => ['passed', 'limited'].includes(r.status));
  const anyFailed = Object.values(results).some(r => r.status === 'failed');
  await supabase.from('website_access_profiles').update({
    last_validated_at: new Date().toISOString(),
    validation_status: allPassed ? 'valid' : anyFailed ? 'failed' : 'limited'
  }).eq('client_website_id', clientWebsiteId);

  return results;
}

// ============================================================
// CHANGE POLICY SAVE
// ============================================================
export async function saveChangePolicy(clientWebsiteId, policy) {
  await supabase.from('website_change_policies').upsert({
    client_website_id: clientWebsiteId, ...policy
  }, { onConflict: 'client_website_id' });
  return { success: true };
}

// ============================================================
// LOG CHANGE
// ============================================================
export async function logWebsiteChange(clientWebsiteId, runId, changeData) {
  const { data } = await supabase.from('website_change_history').insert({
    client_website_id: clientWebsiteId, run_id: runId, ...changeData
  }).select().single();
  return data;
}

// ============================================================
// GET WEBSITE RUNTIME CONTEXT FOR AGENTS
// This is what gets injected into every agent prompt
// ============================================================
export async function getWebsiteRuntimeContext(clientId) {
  const { data } = await supabase.rpc('get_website_context', { p_client_id: clientId });
  if (!data) return null;

  // Determine what agents CAN do based on access + policy
  const website = data.website;
  const policy = website.changePolicy || {};
  const access = website.accessModes || {};

  // Priority order: git > cms > server > read_only
  let preferredAccessMethod = 'read_only';
  if (access.git && website.git?.status === 'connected') preferredAccessMethod = 'git';
  else if (access.cms && website.cms?.status === 'connected') preferredAccessMethod = 'cms';
  else if (access.server) preferredAccessMethod = 'server';

  return {
    ...data,
    website: {
      ...website,
      preferredAccessMethod,
      // What agents can actually do right now
      agentCapabilities: {
        canAnalyze: policy.allowAnalysis !== false,
        canCrawl: policy.allowCrawl !== false,
        canProposeChanges: true, // always
        canEditContent: policy.allowContentEdits && access.currentLevel !== 'read_only',
        canEditSchema: policy.allowSchemaEdits && access.currentLevel !== 'read_only',
        canEditTechnicalSeo: policy.allowTechnicalSeoEdits && access.currentLevel !== 'read_only',
        canChangeCode: policy.allowCodeChanges && ['git_edit','server_edit','full_control'].includes(access.currentLevel),
        canPublishDirectly: policy.allowDirectProductionChanges && !policy.requireManualApprovalBeforePublish,
        mustUseStaging: policy.requireStagingFirst,
        mustOpenPR: policy.requirePR,
        mustWaitForApproval: policy.requireManualApprovalBeforePublish,
        autonomousSafeChangesAllowed: policy.allowAutonomousSafeChanges,
        autonomousContentAllowed: policy.allowAutonomousContentExpansion,
        autonomousMetaAllowed: policy.allowAutonomousMetaUpdates,
        autonomousSchemaAllowed: policy.allowAutonomousSchemaMarkup
      }
    }
  };
}

// ============================================================
// GET FULL WEBSITE STATE (for UI)
// ============================================================
export async function getFullWebsiteState(clientId) {
  const { data: site } = await supabase.from('client_websites').select('*').eq('client_id', clientId).eq('is_primary', true).maybeSingle();
  if (!site) return null;

  const [profile, git, cms, server, policy, recentValidations, recentChanges] = await Promise.all([
    supabase.from('website_access_profiles').select('*').eq('client_website_id', site.id).maybeSingle(),
    supabase.from('website_git_connections').select('*').eq('client_website_id', site.id).maybeSingle(),
    supabase.from('website_cms_connections').select('*').eq('client_website_id', site.id).maybeSingle(),
    supabase.from('website_server_connections').select('*').eq('client_website_id', site.id).maybeSingle(),
    supabase.from('website_change_policies').select('*').eq('client_website_id', site.id).maybeSingle(),
    supabase.from('website_validation_logs').select('*').eq('client_website_id', site.id).order('created_at', { ascending: false }).limit(10),
    supabase.from('website_change_history').select('*').eq('client_website_id', site.id).order('created_at', { ascending: false }).limit(20)
  ]);

  // Get secret hints (never raw values)
  const { data: secrets } = await supabase.from('website_secrets').select('secret_type, hint, last_rotated_at').eq('client_website_id', site.id);
  const secretMap = {};
  for (const s of (secrets || [])) secretMap[s.secret_type] = { hint: s.hint, last_rotated_at: s.last_rotated_at };

  return {
    website: site,
    access_profile: profile.data,
    git: git.data,
    cms: cms.data,
    server: server.data,
    policy: policy.data,
    validations: recentValidations.data || [],
    changes: recentChanges.data || [],
    secrets: secretMap // hints only
  };
}
