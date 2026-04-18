// Collect all the numbers needed for the morning status report.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

const YANIV = '00000000-0000-0000-0000-000000000001';
const HOMIE = '528107d8-0000-0000-0000-000000000002';

const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

console.log('=== MORNING REPORT STATS ===\n');

// 1. Proposed changes overall breakdown
const { data: propsAll } = await supabase
  .from('proposed_changes')
  .select('client_id, status, change_type, clients!inner(name)')
  .order('created_at', { ascending: false });

const byClientStatus = {};
for (const p of propsAll || []) {
  const key = `${p.clients?.name}/${p.status}`;
  byClientStatus[key] = (byClientStatus[key] || 0) + 1;
}
console.log('PROPOSED CHANGES by client+status:');
for (const [k, v] of Object.entries(byClientStatus).sort()) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}

// 1b. Proposals in last 24h
const propsLast24 = (propsAll || []).filter(p => new Date(p.created_at || 0) > new Date(dayAgo));
console.log(`\nProposed in last 24h: ${propsLast24.length}`);

// 2. Social posts count
const { count: spYaniv } = await supabase
  .from('social_posts')
  .select('*', { count: 'exact', head: true })
  .eq('client_id', YANIV);
console.log(`\nsocial_posts (Yaniv): ${spYaniv}`);

// 2b. Social posts by channel
const { data: spByChannel } = await supabase
  .from('social_posts')
  .select('channel, status')
  .eq('client_id', YANIV);
const spCounts = {};
for (const s of spByChannel || []) {
  const k = `${s.channel || 'unknown'}/${s.status || 'unknown'}`;
  spCounts[k] = (spCounts[k] || 0) + 1;
}
for (const [k, v] of Object.entries(spCounts).sort()) console.log(`  ${v.toString().padStart(4)}  ${k}`);

// 3. Campaign creatives
const { count: ccYaniv } = await supabase
  .from('campaign_creatives')
  .select('*', { count: 'exact', head: true })
  .eq('client_id', YANIV);
console.log(`\ncampaign_creatives (Yaniv): ${ccYaniv}`);

// 4. Runs last 24h by status per agent
const { data: runs } = await supabase
  .from('runs')
  .select('status, client_id, agent_templates(slug, name), clients!inner(name)')
  .gte('created_at', dayAgo);

const runStats = {};
for (const r of runs || []) {
  const slug = r.agent_templates?.slug || 'unknown';
  const key = `${slug}::${r.status}`;
  runStats[key] = (runStats[key] || 0) + 1;
}
console.log('\nRUNS last 24h (agent::status):');
for (const [k, v] of Object.entries(runStats).sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}

// 5. GSC diagnostics by coverage_state
const { data: diag } = await supabase
  .from('gsc_diagnostics')
  .select('coverage_state, robots_txt_state, page_fetch_state')
  .eq('client_id', YANIV);
console.log(`\nGSC diagnostics rows (Yaniv): ${diag?.length || 0}`);
const covBreak = {};
for (const d of diag || []) {
  covBreak[d.coverage_state || 'null'] = (covBreak[d.coverage_state || 'null'] || 0) + 1;
}
console.log('GSC coverage breakdown:');
for (const [k, v] of Object.entries(covBreak).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}

// 6. GT3 tasks (if any)
const { data: gt3 } = await supabase
  .from('gt3_tasks')
  .select('status, task_type')
  .order('created_at', { ascending: false });
const gt3Break = {};
for (const t of gt3 || []) {
  const k = `${t.task_type}/${t.status}`;
  gt3Break[k] = (gt3Break[k] || 0) + 1;
}
console.log(`\nGT3 tasks total: ${gt3?.length || 0}`);
for (const [k, v] of Object.entries(gt3Break).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}

// 7. Campaigns
const { data: camps } = await supabase
  .from('campaigns')
  .select('name, status, client_id, clients!inner(name)')
  .order('created_at', { ascending: false });
console.log(`\nCampaigns total: ${camps?.length || 0}`);
for (const c of (camps || []).slice(0, 6)) {
  console.log(`  ${c.clients?.name}  "${c.name}"  status=${c.status}`);
}
