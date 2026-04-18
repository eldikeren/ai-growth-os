import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

// All runs currently in "running" status
const { data: running } = await supabase
  .from('runs')
  .select('id, status, created_at, completed_at, duration_ms, agent_templates(name, slug)')
  .eq('status', 'running')
  .eq('client_id', YANIV)
  .order('created_at');

const now = Date.now();
console.log(`=== RUNNING (Yaniv): ${running?.length || 0} ===\n`);
for (const r of running || []) {
  const ageSec = Math.round((now - new Date(r.created_at).getTime()) / 1000);
  const ageMin = Math.round(ageSec / 60);
  console.log(`  ${r.agent_templates?.slug?.padEnd(40)}  started=${r.created_at.slice(11,19)}  age=${ageMin}m (${ageSec}s)`);
}

// Mission banner data sources
const { data: kw } = await supabase
  .from('client_keywords')
  .select('keyword, position, volume, is_brand, keyword_language')
  .eq('client_id', YANIV);
const kwList = kw || [];
const targets = kwList.filter(k => !k.is_brand);
const withPos = targets.filter(k => k.position != null);
const top3 = withPos.filter(k => k.position <= 3);
const top10 = withPos.filter(k => k.position <= 10 && k.position > 3);
const out10 = withPos.filter(k => k.position > 10);
const notRanking = targets.filter(k => k.position == null);
console.log(`\n=== client_keywords (Yaniv, non-brand) ===`);
console.log(`  total non-brand:  ${targets.length}`);
console.log(`  with position:    ${withPos.length}`);
console.log(`  top 3:            ${top3.length}`);
console.log(`  top 10 (4-10):    ${top10.length}`);
console.log(`  outside 10:       ${out10.length}`);
console.log(`  not ranking:      ${notRanking.length}`);

// Run Queue (is processRunQueue consuming?)
const { data: queue } = await supabase
  .from('run_queue')
  .select('status, agent_templates(slug), created_at')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false })
  .limit(50);
const qStats = {};
for (const q of queue || []) {
  qStats[q.status] = (qStats[q.status] || 0) + 1;
}
console.log(`\n=== run_queue (last 50 for Yaniv) ===`);
for (const [k,v] of Object.entries(qStats)) console.log(`  ${v}× ${k}`);
