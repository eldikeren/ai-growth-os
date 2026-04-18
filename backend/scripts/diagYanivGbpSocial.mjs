#!/usr/bin/env node
// Investigate GBP / Reviews / Social agent activity for Yaniv
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const { data: clients } = await sb.from('clients').select('id, name').ilike('name', '%yaniv%');
const yaniv = clients?.[0];
console.log('Client:', yaniv.id, yaniv.name);

const targetSlugs = [
  'reviews-gbp-authority-agent',
  'local-seo-agent',
  'facebook-agent',
  'instagram-agent',
  'content-distribution-agent',
];

// 1) Agent assignments — are they even enabled?
console.log('\n=== ASSIGNMENTS ===');
const { data: assignments } = await sb.from('client_agent_assignments')
  .select('enabled, last_run_at, run_count, agent_templates(slug, name, is_active, cooldown_minutes)')
  .eq('client_id', yaniv.id);

for (const slug of targetSlugs) {
  const a = assignments?.find(x => x.agent_templates?.slug === slug);
  if (!a) { console.log(`  ${slug}: NOT ASSIGNED`); continue; }
  console.log(`  ${slug}:`);
  console.log(`    enabled: ${a.enabled}, template_active: ${a.agent_templates.is_active}`);
  console.log(`    last_run_at: ${a.last_run_at || 'never'}`);
  console.log(`    run_count: ${a.run_count || 0}`);
  console.log(`    cooldown_min: ${a.agent_templates.cooldown_minutes || 0}`);
}

// 2) Recent runs — what happened and when?
console.log('\n=== RECENT RUNS (last 30 days) ===');
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
const { data: runs } = await sb.from('runs')
  .select('id, status, created_at, updated_at, error, tokens_used, changed_anything, triggered_by, agent_templates(slug)')
  .eq('client_id', yaniv.id)
  .gte('created_at', thirtyDaysAgo)
  .order('created_at', { ascending: false });

for (const slug of targetSlugs) {
  const slugRuns = (runs || []).filter(r => r.agent_templates?.slug === slug);
  console.log(`\n  ${slug}: ${slugRuns.length} runs`);
  const byStatus = {};
  for (const r of slugRuns) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  for (const [s, n] of Object.entries(byStatus)) console.log(`    ${s}: ${n}`);
  if (slugRuns.length > 0) {
    const latest = slugRuns[0];
    console.log(`    latest: ${latest.status} @ ${latest.created_at}`);
    console.log(`    latest error: ${(latest.error || '').slice(0, 200)}`);
  }
}

// 3) Credentials — are the APIs actually connected?
console.log('\n=== CREDENTIALS ===');
const credTypes = ['google_business', 'google_business_profile', 'gbp', 'facebook', 'instagram', 'facebook_page'];
const { data: creds } = await sb.from('credentials')
  .select('credential_type, status, updated_at, last_validated_at, last_error')
  .eq('client_id', yaniv.id);

console.log(`  Total credentials: ${creds?.length || 0}`);
for (const c of (creds || [])) {
  const interesting = /business|gbp|facebook|instagram|meta|social/i.test(c.credential_type);
  if (interesting) {
    console.log(`  ${c.credential_type}:`);
    console.log(`    status: ${c.status}`);
    console.log(`    updated: ${c.updated_at}`);
    console.log(`    last_validated: ${c.last_validated_at || 'never'}`);
    console.log(`    last_error: ${(c.last_error || '').slice(0, 200)}`);
  }
}

// 4) Proposed changes — did they propose reviews/posts that weren't executed?
console.log('\n=== PROPOSALS (last 30 days) ===');
const { data: proposals } = await sb.from('proposed_changes')
  .select('id, proposal_type, status, created_at, agent_slug, summary')
  .eq('client_id', yaniv.id)
  .gte('created_at', thirtyDaysAgo)
  .order('created_at', { ascending: false });

const byAgent = {};
for (const p of (proposals || [])) {
  const key = p.agent_slug || 'unknown';
  byAgent[key] = byAgent[key] || [];
  byAgent[key].push(p);
}
for (const slug of targetSlugs) {
  const ps = byAgent[slug] || [];
  console.log(`\n  ${slug}: ${ps.length} proposals`);
  const byStatus = {};
  for (const p of ps) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
  for (const [s, n] of Object.entries(byStatus)) console.log(`    ${s}: ${n}`);
  if (ps.length) {
    console.log(`    newest: ${ps[0].created_at} → "${(ps[0].summary || '').slice(0, 80)}"`);
  }
}

// 5) Check social_posts table for any activity
console.log('\n=== SOCIAL_POSTS TABLE ===');
const { data: socialPosts, error: spErr } = await sb.from('social_posts')
  .select('id, platform, status, scheduled_for, published_at, created_at')
  .eq('client_id', yaniv.id)
  .order('created_at', { ascending: false })
  .limit(20);
if (spErr) {
  console.log(`  Error/no table: ${spErr.message}`);
} else {
  console.log(`  Total: ${socialPosts?.length || 0}`);
  if (socialPosts?.length) {
    const byPlatform = {};
    for (const p of socialPosts) {
      byPlatform[p.platform] = byPlatform[p.platform] || { total: 0, statuses: {} };
      byPlatform[p.platform].total++;
      byPlatform[p.platform].statuses[p.status] = (byPlatform[p.platform].statuses[p.status] || 0) + 1;
    }
    for (const [plat, info] of Object.entries(byPlatform)) {
      console.log(`  ${plat}: ${info.total}  (${Object.entries(info.statuses).map(([k, v]) => `${k}=${v}`).join(', ')})`);
    }
  }
}

// 6) Reviews table — did we pull any reviews to reply to?
console.log('\n=== REVIEWS TABLE ===');
const { data: reviews, error: rvErr } = await sb.from('reviews')
  .select('id, rating, reply_text, replied_at, created_at')
  .eq('client_id', yaniv.id)
  .order('created_at', { ascending: false })
  .limit(50);
if (rvErr) {
  console.log(`  Error/no table: ${rvErr.message}`);
} else {
  console.log(`  Total reviews: ${reviews?.length || 0}`);
  const replied = (reviews || []).filter(r => r.reply_text || r.replied_at).length;
  console.log(`  Replied: ${replied}`);
  console.log(`  Unreplied: ${(reviews?.length || 0) - replied}`);
}

// 7) Agent events — any execution events recently?
console.log('\n=== AGENT_EVENTS (last 7 days, target slugs only) ===');
const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
const { data: events, error: evErr } = await sb.from('agent_events')
  .select('agent_slug, event_type, message, created_at')
  .eq('client_id', yaniv.id)
  .gte('created_at', sevenDaysAgo)
  .in('agent_slug', targetSlugs)
  .order('created_at', { ascending: false })
  .limit(50);
if (evErr) console.log(`  Error/no table: ${evErr.message}`);
else {
  console.log(`  Total events: ${events?.length || 0}`);
  for (const e of (events || []).slice(0, 20)) {
    console.log(`    ${e.created_at.slice(0, 16)} ${e.agent_slug} → ${e.event_type}  ${(e.message || '').slice(0, 60)}`);
  }
}
