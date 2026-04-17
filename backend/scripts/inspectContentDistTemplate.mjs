// Inspect content-distribution-agent template + last few runs to understand
// why it only ever produces 1 tool call (query_metrics) and stalls.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

const { data: tmpl } = await supabase
  .from('agent_templates')
  .select('id, slug, name, lane, role_type, is_active, base_prompt, action_mode_default, max_tokens, temperature, cooldown_minutes, do_rules, dont_rules, self_validation_checklist, output_contract')
  .eq('slug', 'content-distribution-agent')
  .maybeSingle();

console.log('=== content-distribution-agent template ===');
console.log('Name:', tmpl.name);
console.log('Active:', tmpl.is_active);
console.log('Lane:', tmpl.lane);
console.log('Action mode:', tmpl.action_mode_default);
console.log('Cooldown minutes:', tmpl.cooldown_minutes);
console.log('Max tokens:', tmpl.max_tokens);
console.log('Temperature:', tmpl.temperature);
console.log('do_rules count:', tmpl.do_rules?.length);
console.log('dont_rules count:', tmpl.dont_rules?.length);
console.log('\nbase_prompt length:', tmpl.base_prompt?.length);
console.log('\n--- base_prompt (first 3000 chars) ---');
console.log((tmpl.base_prompt || '').slice(0, 3000));

console.log('\n\n=== last 5 runs ===');
const { data: runs } = await supabase
  .from('runs')
  .select('id, status, created_at, updated_at, error, output, client_id')
  .eq('agent_template_id', tmpl.id)
  .order('created_at', { ascending: false })
  .limit(5);

for (const r of runs || []) {
  const o = r.output || {};
  console.log(`\nRun ${r.id.slice(0,8)}  status=${r.status}  client=${r.client_id?.slice(0,8)}`);
  console.log(`  created=${r.created_at}`);
  console.log(`  _iterations=${o._iterations}  _tool_call_count=${o._tool_call_count}`);
  console.log(`  confidence=${o._truth_gate?.confidence}`);
  if (r.error) console.log(`  ERROR: ${r.error.slice(0,200)}`);
  console.log(`  tools called: ${(o._tool_calls || []).map(c => c.tool).join(' → ')}`);
  if (o.error || o.message) console.log(`  output_msg: ${(o.error || o.message || '').slice(0,200)}`);
}
