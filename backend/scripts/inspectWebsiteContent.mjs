import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const YANIV = '00000000-0000-0000-0000-000000000001';

const { data: runs } = await supabase
  .from('runs')
  .select('id, status, created_at, error, output, agent_templates(slug)')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false })
  .limit(200);

const wc = (runs || []).filter(r => r.agent_templates?.slug === 'website-content-agent');
console.log(`Found ${wc.length} website-content-agent runs:`);
const statusCounts = {};
for (const r of wc) {
  statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
}
console.log('Status counts:', JSON.stringify(statusCounts, null, 2));

// Show recent runs with their status, error, iterations
console.log('\nRecent runs:');
for (const r of wc.slice(0, 8)) {
  const o = r.output || {};
  const iters = o._iterations;
  const toolCount = o._tool_call_count;
  const confidence = o._truth_gate?.confidence;
  const errorPrev = r.error?.slice(0, 150);
  console.log(`  ${r.id.slice(0, 8)}  status=${r.status}  iters=${iters || '?'}  tools=${toolCount || '?'}  confidence=${confidence || '?'}`);
  if (errorPrev) console.log(`     ERROR: ${errorPrev}`);
  if (o.timeout) console.log(`     TIMEOUT: ${o.message?.slice(0, 200) || ''}`);
  if (o.openai_error) console.log(`     OPENAI: ${o.openai_error.slice(0, 200)}`);
}

// Check gt3 tasks — group by task_type + status across all
const { data: gt3All } = await supabase
  .from('gt3_tasks')
  .select('id, customer_id, task_type, status, created_at, completed_at, error_message');
console.log(`\nAll GT3 tasks: ${gt3All?.length || 0}`);
const byTypeStatus = {};
for (const t of (gt3All || [])) {
  const key = `${t.task_type}::${t.status}`;
  byTypeStatus[key] = (byTypeStatus[key] || 0) + 1;
}
for (const [k, v] of Object.entries(byTypeStatus).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${v.toString().padStart(4)}  ${k}`);
}

// Recent failures
const failed = (gt3All || []).filter(t => t.status === 'failed');
console.log(`\nSample failed tasks (last 5):`);
for (const t of failed.slice(0, 5)) {
  console.log(`  ${t.task_type}  ${t.id.slice(0, 8)}  err: ${t.error_message?.slice(0, 200)}`);
}
