import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

// Status breakdown for gt3_action_tasks
const { data: byStat } = await supabase.from('gt3_action_tasks').select('status, customer_id');
const sc = {};
for (const r of byStat || []) sc[`${r.customer_id.slice(0,8)}/${r.status}`] = (sc[`${r.customer_id.slice(0,8)}/${r.status}`] || 0) + 1;
console.log('ACTION tasks by customer/status:');
for (const [k,v] of Object.entries(sc).sort()) console.log(`  ${v.toString().padStart(4)}  ${k}`);

// Task "גט פיטורין"
const { data: gitt } = await supabase.from('gt3_action_tasks')
  .select('id, task_type, title_he, description_he, assigned_agent, status, priority_label, keyword_id, updated_at, created_at')
  .ilike('title_he', '%גט פיטורין%');
console.log(`\n=== Tasks matching "גט פיטורין" (${gitt?.length || 0}): ===`);
for (const t of gitt || []) {
  console.log(`\n id=${t.id}`);
  console.log(`  title:   ${t.title_he}`);
  console.log(`  agent:   ${t.assigned_agent}  type=${t.task_type}`);
  console.log(`  status:  ${t.status}  priority=${t.priority_label}  updated=${t.updated_at}`);
  console.log(`  desc:    ${(t.description_he || '').slice(0, 600)}`);
}

// In progress tasks (possibly stuck)
const { data: inProg } = await supabase.from('gt3_action_tasks')
  .select('id, title_he, assigned_agent, status, updated_at, created_at')
  .eq('status', 'in_progress').limit(20);
console.log(`\n=== IN_PROGRESS gt3_action_tasks (${inProg?.length || 0}): ===`);
for (const t of inProg || []) {
  const age = Math.round((Date.now() - new Date(t.updated_at).getTime()) / 60000);
  console.log(`  ${t.id.slice(0,8)}  agent=${String(t.assigned_agent).padEnd(32)}  age=${age}min  "${(t.title_he||'').slice(0,50)}"`);
}

// 2. Check routes/gt3.js for run endpoints
