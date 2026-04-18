import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

// 1. Any gt3 tables?
for (const t of ['gt3_action_tasks', 'gt3_channel_tasks', 'gt3_keyword_universe', 'gt3_keyword_scores', 'gt3_customers']) {
  const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
  console.log(`  ${t}: count=${count ?? 'ERR'}  ${error?.message || ''}`);
}

// 2. Specifically failed action tasks
const { data: failed } = await supabase.from('gt3_action_tasks')
  .select('id, task_type, title_he, description_he, assigned_agent, status, priority_label, keyword_id, updated_at')
  .eq('status', 'failed')
  .order('updated_at', { ascending: false })
  .limit(10);
console.log(`\n=== FAILED gt3_action_tasks (${failed?.length || 0}) ===`);
for (const t of failed || []) {
  console.log(`\n id=${t.id.slice(0,8)}  agent=${t.assigned_agent}  task_type=${t.task_type}`);
  console.log(`  title:   ${t.title_he}`);
  console.log(`  status:  ${t.status}  priority=${t.priority_label}  updated=${t.updated_at}`);
  console.log(`  desc:    ${(t.description_he || '').slice(0, 400)}`);
}

// 3. Open tasks ready to run
const { data: open } = await supabase.from('gt3_action_tasks')
  .select('id, task_type, title_he, assigned_agent, status, priority_label')
  .eq('status', 'open').limit(10);
console.log(`\n=== OPEN gt3_action_tasks (${open?.length || 0}, showing 10) ===`);
for (const t of open || []) {
  console.log(`  ${t.id.slice(0,8)}  ${String(t.priority_label).padEnd(20)}  ${String(t.assigned_agent).padEnd(32)}  ${String(t.task_type).padEnd(22)}  "${(t.title_he||'').slice(0,60)}"`);
}

// 4. Customer mapping
const { data: custs } = await supabase.from('gt3_customers').select('id, name, legacy_client_id, primary_language');
console.log('\n=== GT3 CUSTOMERS ===');
for (const c of custs || []) console.log(`  ${c.name}  legacy=${c.legacy_client_id}  lang=${c.primary_language}`);
