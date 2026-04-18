import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const YANIV = '00000000-0000-0000-0000-000000000001';

// Look at a sample of the auto-cancelled runs — how long did they actually run?
const { data: killed } = await s.from('runs')
  .select('id, agent_template_id, status, created_at, updated_at, completed_at, duration_ms, error, agent_templates(slug)')
  .eq('client_id', YANIV).eq('status', 'failed').eq('error', 'Auto-cancelled: stuck in running state for >10 minutes')
  .order('created_at', { ascending: false }).limit(10);

console.log('=== AUTO-CANCELLED RUNS — actual durations ===');
for (const r of (killed || [])) {
  const t0 = new Date(r.created_at).getTime();
  const t1 = new Date(r.updated_at).getTime();
  const mins = ((t1 - t0) / 60000).toFixed(1);
  console.log(`[${r.agent_templates?.slug}] created→updated = ${mins} min  (duration_ms=${r.duration_ms})`);
}

// Run counts over last 4 hours — are things still failing after the fix?
const fourHrAgo = new Date(Date.now() - 4*3600*1000).toISOString();
const { data: recent } = await s.from('runs')
  .select('status, created_at').eq('client_id', YANIV).gte('created_at', fourHrAgo);
const sc = {};
for (const r of (recent || [])) sc[r.status] = (sc[r.status] || 0) + 1;
console.log('\n=== LAST 4H STATUS ===');
Object.entries(sc).forEach(([k,v]) => console.log(`  ${v}x  ${k}`));

// Currently running
const { data: running } = await s.from('runs')
  .select('id, created_at, updated_at, agent_templates(slug)').eq('client_id', YANIV).eq('status', 'running');
console.log('\n=== CURRENTLY RUNNING ===');
for (const r of (running || [])) {
  const age = ((Date.now() - new Date(r.created_at).getTime()) / 60000).toFixed(1);
  console.log(`  ${r.agent_templates?.slug} — age ${age}min  updated ${r.updated_at}`);
}
