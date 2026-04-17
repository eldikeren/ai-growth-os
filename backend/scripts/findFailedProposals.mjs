// Scan runs output for the constraint failure text — locate where the
// propose_website_change calls with rejected change_types actually live.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
const { data: runs } = await supabase
  .from('runs')
  .select('id, client_id, created_at, output, agent_templates(slug)')
  .gte('created_at', since)
  .order('created_at', { ascending: false })
  .limit(400);

let hitCount = 0;
const badTypes = {};
const sampleCalls = [];

for (const run of runs || []) {
  const serialized = JSON.stringify(run.output || {});
  if (!serialized.includes('change_type_check')) continue;
  hitCount++;
  if (hitCount <= 4) {
    console.log(`\nRun ${run.id.slice(0,8)}  agent=${run.agent_templates?.slug}  ${run.created_at}`);
    // Find propose_website_change calls
    const calls = run.output?._tool_calls || [];
    for (const c of calls) {
      if (c.tool !== 'propose_website_change') continue;
      const resStr = JSON.stringify(c.result || {});
      if (!resStr.includes('change_type_check')) continue;
      const args = c.args || c.arguments || {};
      console.log(`  args.change_type=${args.change_type}  url=${args.page_url}`);
      console.log(`  result=${resStr.slice(0, 200)}`);
      badTypes[args.change_type] = (badTypes[args.change_type] || 0) + 1;
      sampleCalls.push({ runId: run.id, client: run.client_id, args });
    }
    // Also scan output.blocking_reason, output.*, etc
    if (run.output?.blocking_reason?.includes('change_type_check')) {
      console.log(`  [blocking_reason] ${run.output.blocking_reason.slice(0, 200)}`);
    }
  }
}

console.log(`\n=== ${hitCount} runs contain "change_type_check" in their output ===`);
console.log('Bad types seen:');
for (const [k, v] of Object.entries(badTypes)) console.log(`  ${v}  ${k}`);

// Also scan top-level for stringified output containing failed
let anyFailed = 0;
for (const run of runs || []) {
  const ser = JSON.stringify(run.output || {});
  if (ser.includes('Failed to save proposed change')) anyFailed++;
}
console.log(`\n"Failed to save proposed change" appears in ${anyFailed} runs`);
