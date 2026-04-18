#!/usr/bin/env node
// Backfill client_agent_assignments.run_count and last_run_at from actual run history.
// The inline-rpc-in-update bug meant these columns have been stuck at 0 / null.
import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Fetch all assignments
const { data: assignments } = await sb.from('client_agent_assignments')
  .select('client_id, agent_template_id, run_count, last_run_at');

console.log(`Assignments: ${assignments.length}`);

let fixed = 0;
let alreadyOk = 0;
let noRuns = 0;

for (const a of assignments) {
  // Count runs for this (client, agent)
  const { count: runCount } = await sb.from('runs')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', a.client_id)
    .eq('agent_template_id', a.agent_template_id);

  if (!runCount) { noRuns++; continue; }

  // Latest run for last_run_at
  const { data: latest } = await sb.from('runs')
    .select('created_at, updated_at, completed_at')
    .eq('client_id', a.client_id)
    .eq('agent_template_id', a.agent_template_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastRunAt = latest?.completed_at || latest?.updated_at || latest?.created_at;

  // Only update if there's a drift
  if (a.run_count === runCount && a.last_run_at === lastRunAt) {
    alreadyOk++;
    continue;
  }

  const { error } = await sb.from('client_agent_assignments')
    .update({ run_count: runCount, last_run_at: lastRunAt })
    .eq('client_id', a.client_id)
    .eq('agent_template_id', a.agent_template_id);

  if (error) {
    console.error(`  err ${a.client_id}/${a.agent_template_id}: ${error.message}`);
  } else {
    fixed++;
  }
}

console.log(`Fixed: ${fixed}`);
console.log(`Already OK: ${alreadyOk}`);
console.log(`No runs yet: ${noRuns}`);
