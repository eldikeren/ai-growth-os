import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

// Find one run with "change_type_check" in its output
const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
const { data: runs } = await supabase
  .from('runs')
  .select('id, output, agent_templates(slug)')
  .gte('created_at', since)
  .order('created_at', { ascending: false })
  .limit(400);
const run = (runs || []).find(r => JSON.stringify(r.output || {}).includes('change_type_check'));
if (!run) { console.log('no failing run found'); process.exit(0); }
console.log('Using run:', run.id, 'agent:', run.agent_templates?.slug);

// Find where "change_type_check" appears in the serialized output
const serial = JSON.stringify(run.output, null, 2);
// Show ±300 chars around first hit
const idx = serial.indexOf('change_type_check');
console.log('Total output size:', serial.length);
console.log('First hit at offset', idx);
console.log('---context (400 chars before, 600 after)---');
console.log(serial.slice(Math.max(0, idx - 400), idx + 600));
console.log('\n---');
console.log('Top-level keys in output:');
for (const k of Object.keys(run.output || {})) {
  const v = run.output[k];
  const t = Array.isArray(v) ? `array[${v.length}]` : typeof v;
  console.log(`  ${k}: ${t}`);
}

// Show the tool calls summary
console.log('\n--- tool_calls (full) ---');
console.log(JSON.stringify(run.output._tool_calls, null, 2).slice(0, 2500));
console.log('\n--- tool_envelopes_summary ---');
console.log(JSON.stringify(run.output._tool_envelopes_summary, null, 2).slice(0, 2500));
