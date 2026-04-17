// backfillFailedProposals.mjs
//
// Replays every propose_website_change tool call from historical runs whose
// INSERT previously failed due to the proposed_changes_change_type_check
// constraint (before migration 043). The coercion logic mirrors what now
// lives in tools.js, so past agent outputs get persisted without needing
// to re-run the agents themselves.
//
// Usage:
//   node --env-file=../.env.prod scripts/backfillFailedProposals.mjs
//   DRY_RUN=1 node ... (log-only, no inserts)

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DRY_RUN = process.env.DRY_RUN === '1';

const ALLOWED = new Set([
  'seo_title', 'meta_description', 'h1', 'h2', 'body_content',
  'schema_markup', 'image_alt', 'canonical_url', 'redirect',
  'internal_link', 'nav_label', 'cta_text', 'page_slug', 'robots_txt',
  'social_post', 'google_ads_change', 'code_fix',
  'trust_signal', 'layout_change', 'ui_copy', 'hero_content',
  'faq_section', 'cta_button', 'product_section', 'meta_tag',
  'resource_fix', 'image_replacement', 'video_embed',
  'testimonial_section', 'pricing_section', 'contact_info',
  'footer_content', 'header_content', 'sidebar_content',
  'form_field', 'link_target', 'font_change', 'color_scheme',
  'spacing_fix', 'accessibility_fix', 'performance_fix',
]);

function coerceChangeType(raw) {
  const ct = String(raw || '').toLowerCase().trim();
  if (ALLOWED.has(ct)) return ct;
  if (ct.includes('title')) return 'seo_title';
  if (ct.includes('meta') && ct.includes('desc')) return 'meta_description';
  if (ct.includes('meta')) return 'meta_tag';
  if (ct === 'heading_h1' || ct.startsWith('h1')) return 'h1';
  if (ct.startsWith('h2') || ct.includes('subheading')) return 'h2';
  if (ct.includes('schema') || ct.includes('jsonld') || ct.includes('json_ld') || ct.includes('structured')) return 'schema_markup';
  if (ct.includes('alt') && (ct.includes('image') || ct.includes('img'))) return 'image_alt';
  if (ct.includes('canonical')) return 'canonical_url';
  if (ct.includes('redirect')) return 'redirect';
  if (ct.includes('cta') && ct.includes('button')) return 'cta_button';
  if (ct.includes('cta')) return 'cta_text';
  if (ct.includes('nav')) return 'nav_label';
  if (ct.includes('slug') || ct.includes('url_path')) return 'page_slug';
  if (ct.includes('robots')) return 'robots_txt';
  if (ct.includes('social') || ct.endsWith('_post') || ct === 'post') return 'social_post';
  if (ct.includes('google_ads') || ct.includes('adwords') || ct.endsWith('_ad') || ct === 'ad') return 'google_ads_change';
  if (ct.includes('trust') || ct.includes('badge') || ct.includes('award') || ct.includes('certification')) return 'trust_signal';
  if (ct.includes('layout')) return 'layout_change';
  if (ct.includes('hero')) return 'hero_content';
  if (ct.includes('faq')) return 'faq_section';
  if (ct.includes('testimonial')) return 'testimonial_section';
  if (ct.includes('pricing') || ct.includes('price')) return 'pricing_section';
  if (ct.includes('contact')) return 'contact_info';
  if (ct.includes('footer')) return 'footer_content';
  if (ct.includes('header') && !ct.includes('h1') && !ct.includes('h2')) return 'header_content';
  if (ct.includes('sidebar')) return 'sidebar_content';
  if (ct.includes('form')) return 'form_field';
  if (ct.includes('font') || ct.includes('typography') || ct.includes('typeface')) return 'font_change';
  if (ct.includes('color') || ct.includes('colour')) return 'color_scheme';
  if (ct.includes('padding') || ct.includes('margin') || ct.includes('spacing')) return 'spacing_fix';
  if (ct.includes('a11y') || ct.includes('aria') || ct.includes('accessibility')) return 'accessibility_fix';
  if (ct.includes('speed') || ct.includes('perf') || ct.includes('lazy') || ct.includes('cls') || ct.includes('lcp')) return 'performance_fix';
  if (ct.includes('image') || ct.includes('img') || ct.includes('picture') || ct.includes('photo')) return 'image_replacement';
  if (ct.includes('video')) return 'video_embed';
  if (ct.includes('product') || ct.includes('service')) return 'product_section';
  if (ct.includes('link') || ct.includes('anchor')) return 'internal_link';
  if (ct.includes('resource') || ct.includes('broken')) return 'resource_fix';
  if (ct.includes('copy') || ct.includes('text') || ct.includes('wording')) return 'ui_copy';
  return 'body_content';
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.hostname}${path}`;
  } catch { return url; }
}

// Pull all runs from the last 14 days that include _tool_calls in output
console.log(`[backfill] scanning runs (dry_run=${DRY_RUN})...`);
const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
const { data: runs, error } = await supabase
  .from('runs')
  .select('id, client_id, agent_template_id, created_at, output, agent_templates(slug)')
  .gte('created_at', since)
  .in('status', ['success', 'partial', 'pending_approval', 'failed'])
  .order('created_at', { ascending: false })
  .limit(500);

if (error) { console.error('runs fetch error:', error); process.exit(1); }

let replayed = 0, alreadyExists = 0, coerced = 0, failed = 0;
const perAgent = {};

for (const run of runs || []) {
  const calls = run.output?._tool_calls || [];
  for (const call of calls) {
    if (call.tool !== 'propose_website_change') continue;
    // Only replay calls that had an error result — check BOTH envelope.blocking_reason
    // and result_preview since the actual stored shape varies
    const blockReason = String(call.envelope?.blocking_reason || '').toLowerCase();
    const resultPreview = String(call.result_preview || '').toLowerCase();
    const resultStr = JSON.stringify(call.result || {}).toLowerCase();
    const combined = `${blockReason} ${resultPreview} ${resultStr}`;
    if (!combined.includes('change_type_check') && !combined.includes('failed to save')) {
      continue; // this one already succeeded when it first ran
    }

    const args = call.args || call.arguments || {};
    if (!args.page_url || !args.proposed_value || !args.change_type) continue;

    const originalCt = args.change_type;
    const newCt = coerceChangeType(originalCt);
    if (newCt !== originalCt) coerced++;

    const normUrl = normalizeUrl(args.page_url);
    const agentSlug = run.agent_templates?.slug || 'agent';
    perAgent[agentSlug] = (perAgent[agentSlug] || 0) + 1;

    // Dedup check — is this same client+type+url already persisted?
    const { data: existing } = await supabase
      .from('proposed_changes')
      .select('id')
      .eq('client_id', run.client_id)
      .eq('change_type', newCt)
      .eq('page_url', normUrl)
      .limit(1);
    if (existing && existing.length > 0) { alreadyExists++; continue; }

    if (DRY_RUN) {
      console.log(`  [dry] ${agentSlug}  ${originalCt} → ${newCt}  ${normUrl}  (${String(args.proposed_value).slice(0, 60)})`);
      replayed++;
      continue;
    }

    const { error: insertErr } = await supabase.from('proposed_changes').insert({
      client_id: run.client_id,
      run_id: run.id,
      agent_slug: agentSlug,
      page_url: normUrl,
      change_type: newCt,
      current_value: args.current_value || null,
      proposed_value: args.proposed_value,
      reason: args.reason || 'Backfilled from previously-rejected agent proposal',
      priority: args.priority || 'medium',
      platform: 'manual',
      status: 'proposed',
    });
    if (insertErr) { console.warn(`  [fail] ${agentSlug} ${newCt} ${normUrl}: ${insertErr.message}`); failed++; }
    else { replayed++; if (replayed % 10 === 0) console.log(`  [ok] replayed ${replayed}`); }
  }
}

console.log(`\n=== BACKFILL COMPLETE ===`);
console.log(`Replayed:        ${replayed}`);
console.log(`Coerced type:    ${coerced}`);
console.log(`Already existed: ${alreadyExists}`);
console.log(`Failed:          ${failed}`);
console.log(`By agent:`);
for (const [k, v] of Object.entries(perAgent).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}
