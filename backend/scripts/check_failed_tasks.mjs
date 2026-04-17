import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const YANIV = '00000000-0000-0000-0000-000000000001';

// ALL recent runs, no filter on agent
const { data: allRuns } = await s.from('runs')
  .select('id, status, error, created_at, trigger_reason, agent_templates(slug)')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false })
  .limit(10);

console.log('=== YANIV MOST RECENT 10 RUNS ===');
for (const r of (allRuns || [])) {
  console.log(`[${r.created_at?.slice(0,19)}] ${r.status.padEnd(20)} ${r.agent_templates?.slug || '?'} trig=${r.trigger_reason || '-'}`);
  if (r.error) console.log(`  ERR: ${r.error.slice(0, 300)}`);
}

// Runs triggered by GT3
const { data: gt3Runs } = await s.from('runs')
  .select('id, status, error, created_at, trigger_reason, input_payload, agent_templates(slug)')
  .ilike('trigger_reason', '%gt3%')
  .order('created_at', { ascending: false })
  .limit(10);

console.log('\n=== GT3-TRIGGERED RUNS (ALL CLIENTS) ===');
for (const r of (gt3Runs || [])) {
  console.log(`[${r.created_at?.slice(0,19)}] ${r.status.padEnd(20)} ${r.agent_templates?.slug} trig=${r.trigger_reason}`);
  if (r.error) console.log(`  ERR: ${r.error.slice(0, 300)}`);
}

// The two stuck in_progress tasks
const { data: stuck } = await s.from('gt3_action_tasks')
  .select('*')
  .eq('status', 'in_progress')
  .order('updated_at', { ascending: false });
console.log('\n=== IN-PROGRESS ACTION TASKS ===');
for (const t of (stuck || [])) {
  console.log(`\n[${t.updated_at?.slice(0,19)}] ${t.task_type} → ${t.assigned_agent}`);
  console.log(`  id: ${t.id}`);
  console.log(`  customer: ${t.customer_id}`);
  console.log(`  title: ${(t.title_he || '').slice(0, 120)}`);
  console.log(`  desc_he: ${(t.description_he || '').slice(0, 500)}`);
}
