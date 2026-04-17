import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Find all in_progress gt3 tasks older than 10 min
const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
let total = 0;

for (const table of ['gt3_action_tasks', 'gt3_channel_tasks']) {
  const { data: stuck } = await s.from(table)
    .select('id, customer_id, assigned_agent, task_type, title_he, updated_at')
    .eq('status', 'in_progress').lt('updated_at', cutoff);

  for (const t of (stuck || [])) {
    // Resolve legacy client
    const { data: cust } = await s.from('gt3_customers').select('legacy_client_id, name').eq('id', t.customer_id).single();
    if (!cust?.legacy_client_id) continue;

    const taskStart = new Date(t.updated_at).getTime();
    const { data: runs } = await s.from('runs')
      .select('id, status, error, agent_templates(slug)')
      .eq('client_id', cust.legacy_client_id)
      .eq('triggered_by', 'gt3_task_executor')
      .gte('created_at', new Date(taskStart - 60 * 1000).toISOString())
      .lte('created_at', new Date(taskStart + 15 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    const match = (runs || []).find(r => r.agent_templates?.slug === t.assigned_agent);

    let newStatus, notes;
    if (match && ['success','partial','executed','executed_pending_validation','pending_approval'].includes(match.status)) {
      newStatus = 'done';
      notes = `Finalized from run ${match.id.slice(0,8)} (status=${match.status})`;
    } else if (match && ['failed','blocked'].includes(match.status)) {
      newStatus = 'failed';
      notes = `Agent run ${match.status}: ${(match.error || '').slice(0, 200)}`;
    } else {
      newStatus = 'open';  // Reopen so user can retry with the fixed code
      notes = 'Reset after Vercel killed background dispatch. Retry with the fixed code.';
    }

    const { error } = await s.from(table).update({
      status: newStatus,
      description_he: notes,
      updated_at: new Date().toISOString(),
    }).eq('id', t.id);

    console.log(`[${cust.name}] ${table} ${t.id.slice(0,8)} "${(t.title_he||'').slice(0,60)}" → ${newStatus} ${error ? '(ERR: '+error.message+')' : '✓'}`);
    total++;
  }
}
console.log(`\nFixed ${total} stuck tasks`);
