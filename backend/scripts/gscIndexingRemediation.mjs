// gscIndexingRemediation.mjs
//
// Takes the gsc_diagnostics table and writes concrete, actionable
// proposed_changes rows the user can review and approve to move pages
// from "Discovered - not indexed" → "Indexed."
//
// Strategy per coverage_state:
//
// • Discovered - currently not indexed → change_type=internal_link
//     The page has ZERO Googlebot prioritization (last_crawl=NEVER,
//     referring_urls_count ≤ 2). The fix is to add inbound internal
//     links from authority pages on the same domain to signal that
//     this URL matters.
//
// • Duplicate, Google chose different canonical than user → change_type=canonical_url
//     Google has selected a different canonical than the one declared
//     on the page. Align user-declared canonical with Google's choice
//     OR add a redirect from the duplicate to the canonical.
//
// • Not found (404) → change_type=redirect OR page_slug (sitemap removal)
//     URL returns 404. Either add a redirect to the right page or
//     remove from sitemap.xml to stop Googlebot from retrying.
//
// • Alternate page with proper canonical tag → no action (working as intended)
//
// • URL is unknown to Google → change_type=internal_link (like Discovered-not-indexed)
//     Submit for crawling via the URL Inspection API's request_indexing
//     or add inbound links.
//
// Usage:
//   node --env-file=../.env.prod scripts/gscIndexingRemediation.mjs
//   DRY_RUN=1 node ... (preview only)

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

const CLIENT_ID = process.env.CLIENT_ID || '00000000-0000-0000-0000-000000000001';
const DRY_RUN = process.env.DRY_RUN === '1';

// Canonical hub pages for Yaniv Gil Law Firm — authoritative pages from which
// we can link to a weaker page to pass signals.
const YANIV_HUB_PAGES = {
  '/': 'https://www.yanivgil.co.il/',
  'divorce': 'https://www.yanivgil.co.il/gerushin',
  'family': 'https://www.yanivgil.co.il/',
  'inheritance': 'https://www.yanivgil.co.il/yerusha',
  'wills': 'https://www.yanivgil.co.il/tsava',
  'business-divorce': 'https://www.yanivgil.co.il/chalokat-esek',
  'prenup': 'https://www.yanivgil.co.il/heskem-mamon',
  'custody': 'https://www.yanivgil.co.il/mishmoret-yeladim',
  'alimony': 'https://www.yanivgil.co.il/mezonot',
  'court': 'https://www.yanivgil.co.il/beit-mishpat-mishpacha',
  'faq': 'https://www.yanivgil.co.il/shut',
};

// Heuristic: classify a URL's Hebrew slug into a topic to pick hub pages.
function classifyUrl(url) {
  const path = new URL(url).pathname.toLowerCase();
  if (path.includes('esek') || path.includes('business')) return ['/', 'business-divorce', 'divorce'];
  if (path.includes('mezonot') || path.includes('alimony') || path.includes('maint')) return ['/', 'alimony', 'divorce'];
  if (path.includes('mishmoret') || path.includes('custody') || path.includes('yeladim')) return ['/', 'custody', 'divorce'];
  if (path.includes('heskem') || path.includes('mamon') || path.includes('prenup')) return ['/', 'prenup', 'divorce'];
  if (path.includes('yerusha') || path.includes('inherit') || path.includes('chaluka')) return ['/', 'inheritance', 'family'];
  if (path.includes('tsava') || path.includes('will') || path.includes('probate')) return ['/', 'wills', 'inheritance'];
  if (path.includes('gerushin') || path.includes('divorce') || path.includes('maz')) return ['/', 'divorce', 'family'];
  if (path.includes('beit-din') || path.includes('rabani')) return ['/', 'court', 'family'];
  if (path.includes('blog') || path.includes('article')) return ['/', 'faq', 'family'];
  return ['/', 'divorce', 'family']; // default Yaniv linking hubs
}

function slugToHebrewTopic(url) {
  // Produce a Hebrew topic label from the slug for the anchor text
  const path = new URL(url).pathname.replace(/^\/+|\/+$/g, '');
  const segs = path.split('/');
  const lastSeg = segs[segs.length - 1] || '';
  // Common slug → Hebrew topic mapping
  const MAP = {
    'chalokat-esek-gerushin': 'חלוקת עסק בגירושין',
    'chalokat-hovot-gerushin': 'חלוקת חובות בגירושין',
    'chaluka-bitcoin-matbeot': 'חלוקת ביטקוין ומטבעות דיגיטליים',
    'chaluka-zchuyot-sotzialiyot': 'חלוקת זכויות סוציאליות בגירושין',
    'chavat-daat-pkidat-saad': 'חוות דעת פקידת סעד',
    'eich-beit-mishpat-machlit-mishmoret': 'איך בית המשפט מחליט על משמורת',
    'esek-lifney-nisuin': 'עסק שהוקם לפני הנישואין',
    'mezonot-yeled-holeh': 'מזונות ילד חולה',
    'hachricha-beit-din': 'הכרחה של החלטת בית דין',
    'heskem-gerushin-im-yeladim': 'הסכם גירושין עם ילדים',
    'iruv-beit-din-rabani': 'עירוב בית דין רבני',
    'horeh-menaker': 'הורה מנכר',
    'mezonot-horeh-bchutz': 'מזונות הורה בחו\"ל',
  };
  return MAP[lastSeg] || lastSeg.replace(/-/g, ' ');
}

console.log(`\n=== GSC Indexing Remediation for ${CLIENT_ID} ===`);
console.log(`DRY_RUN=${DRY_RUN}\n`);

// Fetch all gsc_diagnostics rows for this client
const { data: diags, error } = await supabase
  .from('gsc_diagnostics')
  .select('*')
  .eq('client_id', CLIENT_ID);

if (error) { console.error('Fetch error:', error); process.exit(1); }
console.log(`Loaded ${diags?.length || 0} gsc_diagnostics rows\n`);

// Bucket them
const discovered = (diags || []).filter(d => d.coverage_state === 'Discovered - currently not indexed');
const canonicalMismatch = (diags || []).filter(d => d.coverage_state === 'Duplicate, Google chose different canonical than user');
const notFound = (diags || []).filter(d => d.coverage_state === 'Not found (404)');
const unknownToGoogle = (diags || []).filter(d => d.coverage_state === 'URL is unknown to Google');

console.log('Bucket counts:');
console.log(`  Discovered - not indexed:    ${discovered.length}`);
console.log(`  Duplicate canonical:         ${canonicalMismatch.length}`);
console.log(`  Not found (404):             ${notFound.length}`);
console.log(`  Unknown to Google:           ${unknownToGoogle.length}\n`);

let inserted = 0, skipped = 0, failed = 0;

async function insertProposal(payload) {
  // Dedup
  const { data: existing } = await supabase.from('proposed_changes')
    .select('id').eq('client_id', payload.client_id)
    .eq('change_type', payload.change_type).eq('page_url', payload.page_url)
    .in('status', ['proposed', 'approved', 'executed']).limit(1);
  if (existing && existing.length > 0) { skipped++; return; }

  if (DRY_RUN) {
    console.log(`  [dry] ${payload.change_type}  ${payload.page_url}`);
    inserted++; return;
  }

  const { error: ie } = await supabase.from('proposed_changes').insert(payload);
  if (ie) { console.warn(`  [fail] ${payload.page_url}: ${ie.message}`); failed++; }
  else { inserted++; console.log(`  [ok] ${payload.change_type}  ${payload.page_url}`); }
}

// ── 1. Internal link proposals for Discovered-not-indexed ──
console.log('\n--- INTERNAL LINK PROPOSALS ---');
for (const d of discovered) {
  const hubKeys = classifyUrl(d.url);
  const hubUrls = hubKeys.map(k => YANIV_HUB_PAGES[k]).filter(Boolean);
  const anchor = slugToHebrewTopic(d.url);

  const proposed_value = JSON.stringify({
    target_page: d.url,
    inbound_links_to_add: hubUrls.map(h => ({
      from_page: h,
      anchor_text: anchor,
      context_paragraph: `הוסף קישור פנימי עם טקסט עוגן "${anchor}" המפנה אל ${d.url} בתוך פסקה רלוונטית.`,
    })),
    rationale: 'Target URL has never been crawled. Adding inbound internal links from authority hub pages signals importance and prompts Googlebot discovery.',
  }, null, 2);

  await insertProposal({
    client_id: d.client_id,
    agent_slug: 'gsc-indexing-remediation',
    page_url: d.url,
    change_type: 'internal_link',
    current_value: `GSC status: Discovered - not indexed. Last crawl: ${d.last_crawl_time || 'NEVER'}. Referring URLs: ${d.referring_urls_count ?? 0}.`,
    proposed_value,
    reason: `Page has never been crawled by Googlebot. Zero-to-low internal link signals. Adding ${hubUrls.length} inbound links from authority pages to prompt indexing within 1-2 crawl cycles.`,
    priority: 'high',
    platform: 'manual',
    status: 'proposed',
  });
}

// ── 2. Canonical mismatch proposals ──
console.log('\n--- CANONICAL MISMATCH PROPOSALS ---');
for (const d of canonicalMismatch) {
  const proposed_value = JSON.stringify({
    current_user_canonical: d.user_canonical,
    current_google_canonical: d.google_canonical,
    action: d.user_canonical === d.url
      ? `Google treats ${d.google_canonical} as the true canonical. Either: (a) 301-redirect ${d.url} to ${d.google_canonical}, OR (b) update the <link rel="canonical"> tag on ${d.url} to point to ${d.google_canonical}.`
      : `The page declares canonical ${d.user_canonical} but Google chose ${d.google_canonical}. Align the declaration with Google's choice by updating the canonical tag.`,
  }, null, 2);

  await insertProposal({
    client_id: d.client_id,
    agent_slug: 'gsc-indexing-remediation',
    page_url: d.url,
    change_type: 'canonical_url',
    current_value: `User-declared: ${d.user_canonical || '(none)'}, Google-chosen: ${d.google_canonical || '(unknown)'}`,
    proposed_value,
    reason: 'Canonical mismatch wastes crawl budget and confuses link equity routing. Aligning the declared canonical with Google\'s chosen one resolves duplicate-content signals.',
    priority: 'medium',
    platform: 'manual',
    status: 'proposed',
  });
}

// ── 3. 404 proposals ──
console.log('\n--- 404 PROPOSALS ---');
for (const d of notFound) {
  const proposed_value = JSON.stringify({
    action: `URL returns 404. Options: (a) 301 redirect to the most relevant existing page, OR (b) remove from sitemap.xml to stop Googlebot from retrying.`,
    suggested_redirect_target: 'https://www.yanivgil.co.il/', // default to homepage; user can refine
  }, null, 2);

  await insertProposal({
    client_id: d.client_id,
    agent_slug: 'gsc-indexing-remediation',
    page_url: d.url,
    change_type: 'redirect',
    current_value: 'HTTP 404 Not Found',
    proposed_value,
    reason: '404 URL wastes crawl budget. Remove from sitemap or redirect to a live page to preserve crawl budget and any lingering backlinks.',
    priority: 'medium',
    platform: 'manual',
    status: 'proposed',
  });
}

// ── 4. Unknown to Google proposals (same treatment as discovered-not-indexed) ──
console.log('\n--- UNKNOWN-TO-GOOGLE PROPOSALS ---');
for (const d of unknownToGoogle) {
  const hubKeys = classifyUrl(d.url);
  const hubUrls = hubKeys.map(k => YANIV_HUB_PAGES[k]).filter(Boolean);
  const anchor = slugToHebrewTopic(d.url);

  const proposed_value = JSON.stringify({
    target_page: d.url,
    inbound_links_to_add: hubUrls.map(h => ({
      from_page: h,
      anchor_text: anchor,
    })),
    request_indexing_manually: true,
    rationale: 'URL is completely unknown to Google. Add inbound internal links AND manually request indexing via GSC UI or URL Inspection API.',
  }, null, 2);

  await insertProposal({
    client_id: d.client_id,
    agent_slug: 'gsc-indexing-remediation',
    page_url: d.url,
    change_type: 'internal_link',
    current_value: 'GSC status: URL unknown to Google. No crawl history.',
    proposed_value,
    reason: 'Page is not in Google\'s index and has no crawl history. Add inbound links and submit via URL Inspection tool.',
    priority: 'high',
    platform: 'manual',
    status: 'proposed',
  });
}

console.log('\n=== REMEDIATION COMPLETE ===');
console.log(`Inserted: ${inserted}`);
console.log(`Skipped (dupes): ${skipped}`);
console.log(`Failed: ${failed}`);
