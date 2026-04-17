// Batch-inspect every URL in Yaniv's sitemap via GSC URL Inspection API.
// Aggregates by coverage_state + root cause, resubmits sitemap, writes
// diagnostics to DB so the UI can show the real reason pages aren't indexed.
//
// Usage (from backend/):
//   node --env-file=../.env.prod scripts/gscBatchInspect.mjs
//
// Or to limit pages:
//   LIMIT=20 node --env-file=../.env.prod scripts/gscBatchInspect.mjs

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const ENC_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
if (!ENC_KEY) {
  console.error('Missing CREDENTIAL_ENCRYPTION_KEY. Run with: node --env-file=../.env.prod scripts/gscBatchInspect.mjs');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const YANIV = '00000000-0000-0000-0000-000000000001';
const PROPERTY = 'sc-domain:yanivgil.co.il';
const DOMAIN = 'yanivgil.co.il';
const LIMIT = parseInt(process.env.LIMIT || '0', 10); // 0 = no limit

// ──────────────────────────────────────────────────────────────────
// 1. Get + refresh Google OAuth token for Yaniv
// ──────────────────────────────────────────────────────────────────
async function getToken() {
  const { data: cred } = await supabase.from('oauth_credentials')
    .select('id, access_token_encrypted, refresh_token_encrypted, encryption_iv, expires_at, status')
    .eq('client_id', YANIV).eq('provider', 'google')
    .order('connected_at', { ascending: false }).limit(1).maybeSingle();
  if (!cred) throw new Error('No Google OAuth credential for Yaniv');

  const isExpired = !cred.expires_at || new Date(cred.expires_at).getTime() < Date.now() + 5 * 60 * 1000;
  if (!isExpired && cred.status === 'active') {
    const ivParts = (cred.encryption_iv || '').split(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), Buffer.from(ivParts[0], 'hex'));
    let token = decipher.update(cred.access_token_encrypted, 'hex', 'utf8');
    token += decipher.final('utf8');
    return token;
  }

  // Refresh
  const ivParts = (cred.encryption_iv || '').split(':');
  const refreshDecipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), Buffer.from(ivParts[1], 'hex'));
  let refreshToken = refreshDecipher.update(cred.refresh_token_encrypted, 'hex', 'utf8');
  refreshToken += refreshDecipher.final('utf8');

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET.trim(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) throw new Error('Failed to refresh token: ' + JSON.stringify(tokens));
  console.log(`[token] refreshed, expires in ${tokens.expires_in}s`);
  return tokens.access_token;
}

// ──────────────────────────────────────────────────────────────────
// 2. Fetch + parse sitemap(s)
// ──────────────────────────────────────────────────────────────────
async function fetchSitemapUrls() {
  const candidates = [
    `https://${DOMAIN}/sitemap.xml`,
    `https://${DOMAIN}/sitemap_index.xml`,
    `https://www.${DOMAIN}/sitemap.xml`,
    `https://www.${DOMAIN}/sitemap_index.xml`,
  ];
  const urls = new Set();
  let usedSitemap = null;

  async function parseOne(url, depth = 0) {
    if (depth > 2) return;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (AI-Growth-OS Sitemap Fetch)' } });
      if (!res.ok) return;
      const xml = await res.text();
      if (!usedSitemap) usedSitemap = url;

      // <sitemap><loc>...</loc></sitemap> (index)
      const subMatches = [...xml.matchAll(/<sitemap[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi)];
      for (const m of subMatches) await parseOne(m[1].trim(), depth + 1);

      // <url><loc>...</loc></url>
      const urlMatches = [...xml.matchAll(/<url[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi)];
      for (const m of urlMatches) urls.add(m[1].trim());
    } catch {}
  }

  for (const c of candidates) {
    await parseOne(c);
    if (urls.size > 0) break;
  }
  console.log(`[sitemap] ${usedSitemap || '(not found)'} → ${urls.size} URLs`);
  return { urls: [...urls], sitemapUrl: usedSitemap };
}

// ──────────────────────────────────────────────────────────────────
// 3. Fetch robots.txt
// ──────────────────────────────────────────────────────────────────
async function fetchRobots() {
  try {
    const res = await fetch(`https://${DOMAIN}/robots.txt`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return { ok: false, status: res.status, text: null };
    const text = await res.text();
    const disallows = [...text.matchAll(/Disallow:\s*(\S+)/gi)].map(m => m[1]);
    const sitemaps = [...text.matchAll(/Sitemap:\s*(\S+)/gi)].map(m => m[1]);
    return { ok: true, text, disallows, sitemaps };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ──────────────────────────────────────────────────────────────────
// 4. URL Inspection API
// ──────────────────────────────────────────────────────────────────
async function inspectUrl(token, url) {
  const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: url, siteUrl: PROPERTY }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { url, error: `HTTP ${res.status}: ${err.slice(0, 300)}` };
  }
  const data = await res.json();
  const idx = data.inspectionResult?.indexStatusResult || {};
  return {
    url,
    verdict: idx.verdict,
    coverage_state: idx.coverageState,
    indexing_state: idx.indexingState,
    robots_txt_state: idx.robotsTxtState,
    page_fetch_state: idx.pageFetchState,
    last_crawl_time: idx.lastCrawlTime || null,
    in_sitemap: (idx.sitemap || []).length > 0,
    user_canonical: idx.userCanonical || null,
    google_canonical: idx.googleCanonical || null,
    referring_urls_count: (idx.referringUrls || []).length,
  };
}

// ──────────────────────────────────────────────────────────────────
// 5. Submit sitemap
// ──────────────────────────────────────────────────────────────────
async function submitSitemap(token, sitemapUrl) {
  const siteUrl = encodeURIComponent(PROPERTY);
  const feedpath = encodeURIComponent(sitemapUrl);
  const res = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/sitemaps/${feedpath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok || res.status === 204;
}

// ──────────────────────────────────────────────────────────────────
// 6. Main
// ──────────────────────────────────────────────────────────────────
async function main() {
  const token = await getToken();
  const robots = await fetchRobots();
  console.log(`[robots] ok=${robots.ok} disallows=${robots.disallows?.length || 0} sitemaps=${robots.sitemaps?.length || 0}`);
  if (robots.disallows?.length) console.log(`[robots] disallow rules: ${robots.disallows.slice(0, 10).join(', ')}`);

  const { urls, sitemapUrl } = await fetchSitemapUrls();
  if (urls.length === 0) {
    console.error('No URLs found in sitemap — cannot proceed');
    process.exit(1);
  }

  const toInspect = LIMIT > 0 ? urls.slice(0, LIMIT) : urls;
  console.log(`[inspect] Running URL Inspection on ${toInspect.length} URLs (LIMIT=${LIMIT || 'none'})`);

  const results = [];
  let i = 0;
  for (const url of toInspect) {
    i++;
    try {
      const r = await inspectUrl(token, url);
      results.push(r);
      if (i % 10 === 0) console.log(`  [${i}/${toInspect.length}] ${r.coverage_state || r.error || '?'}  ${url.slice(0, 80)}`);
      // Rate limit: GSC allows ~600 queries/min per property. Sleep 150ms = ~400/min.
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      results.push({ url, error: e.message });
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 7. Persist diagnostics
  // ──────────────────────────────────────────────────────────────────
  const rows = results.filter(r => !r.error).map(r => ({
    client_id: YANIV,
    url: r.url,
    verdict: r.verdict,
    coverage_state: r.coverage_state,
    indexing_state: r.indexing_state,
    robots_txt_state: r.robots_txt_state,
    page_fetch_state: r.page_fetch_state,
    last_crawl_time: r.last_crawl_time,
    in_sitemap: r.in_sitemap,
    user_canonical: r.user_canonical,
    google_canonical: r.google_canonical,
    referring_urls_count: r.referring_urls_count,
    inspected_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    // Try to upsert. If the table doesn't exist, print a migration hint.
    const { error } = await supabase.from('gsc_diagnostics').upsert(rows, { onConflict: 'client_id,url' });
    if (error) {
      console.warn(`[persist] Failed to write diagnostics: ${error.message}`);
      console.warn('         Create migration 042_gsc_diagnostics.sql (see below).');
    } else {
      console.log(`[persist] Wrote ${rows.length} diagnostics to gsc_diagnostics`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 8. Aggregate
  // ──────────────────────────────────────────────────────────────────
  const byCoverage = {};
  const byRobots = {};
  const byFetch = {};
  const notInSitemap = [];
  const canonicalMismatch = [];
  const errored = [];
  for (const r of results) {
    if (r.error) { errored.push(r); continue; }
    byCoverage[r.coverage_state] = (byCoverage[r.coverage_state] || 0) + 1;
    byRobots[r.robots_txt_state] = (byRobots[r.robots_txt_state] || 0) + 1;
    byFetch[r.page_fetch_state] = (byFetch[r.page_fetch_state] || 0) + 1;
    if (!r.in_sitemap) notInSitemap.push(r.url);
    if (r.user_canonical && r.google_canonical && r.user_canonical !== r.google_canonical) {
      canonicalMismatch.push({ url: r.url, user: r.user_canonical, google: r.google_canonical });
    }
  }

  console.log('\n═══ RESULTS ═══');
  console.log('Total URLs inspected:', results.length);
  console.log('Errors:', errored.length);
  console.log('\nCoverage state breakdown:');
  for (const [k, v] of Object.entries(byCoverage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }
  console.log('\nRobots.txt state:');
  for (const [k, v] of Object.entries(byRobots).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }
  console.log('\nPage fetch state:');
  for (const [k, v] of Object.entries(byFetch).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(4)}  ${k}`);
  }

  // Flag problematic buckets
  const discovered = results.filter(r => /Discovered/i.test(r.coverage_state || ''));
  const crawledNotIndexed = results.filter(r => /Crawled.*not indexed/i.test(r.coverage_state || ''));
  const blocked = results.filter(r => r.robots_txt_state === 'DISALLOWED');
  const redirect = results.filter(r => r.page_fetch_state === 'REDIRECT_ERROR');
  const notFound = results.filter(r => r.page_fetch_state === 'NOT_FOUND');

  console.log('\n═══ ACTIONABLE BUCKETS ═══');
  console.log(`Discovered — not indexed (crawl budget / thin): ${discovered.length}`);
  console.log(`Crawled — not indexed (quality signal / dupe):  ${crawledNotIndexed.length}`);
  console.log(`Blocked by robots.txt:                           ${blocked.length}`);
  console.log(`Redirect errors:                                 ${redirect.length}`);
  console.log(`404 / not found:                                 ${notFound.length}`);
  console.log(`Not in sitemap:                                  ${notInSitemap.length}`);
  console.log(`Canonical mismatch (user ≠ google):              ${canonicalMismatch.length}`);

  // Show samples
  if (discovered.length > 0) {
    console.log('\nSample "Discovered, not indexed" URLs:');
    for (const r of discovered.slice(0, 10)) {
      console.log(`  - ${r.url}  (last_crawl=${r.last_crawl_time || 'NEVER'}, refs=${r.referring_urls_count})`);
    }
  }
  if (canonicalMismatch.length > 0) {
    console.log('\nSample canonical mismatches:');
    for (const r of canonicalMismatch.slice(0, 5)) {
      console.log(`  - ${r.url}\n    user:   ${r.user}\n    google: ${r.google}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // 9. Resubmit sitemap
  // ──────────────────────────────────────────────────────────────────
  if (sitemapUrl) {
    const ok = await submitSitemap(token, sitemapUrl);
    console.log(`\n[sitemap] resubmitted ${sitemapUrl}: ${ok ? 'OK' : 'FAILED'}`);
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
