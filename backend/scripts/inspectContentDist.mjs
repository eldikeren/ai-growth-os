import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data: runs } = await supabase
  .from('runs')
  .select('id, status, created_at, error, output, agent_template_id, agent_templates(slug, name)')
  .order('created_at', { ascending: false })
  .limit(100);

const cd = (runs || []).filter(r => r.agent_templates?.slug === 'content-distribution-agent');
console.log(`Found ${cd.length} content-distribution runs:`);
for (const r of cd.slice(0, 8)) {
  console.log(`  ${r.id.slice(0, 8)}  status=${r.status}  at=${r.created_at}`);
  if (r.error) console.log(`     ERROR: ${r.error.slice(0, 200)}`);
  if (r.output) {
    const keys = Object.keys(r.output);
    console.log(`     keys: ${keys.slice(0, 12).join(', ')}`);
    if (r.output._truth_gate) {
      console.log(`     truth: confidence=${r.output._truth_gate.confidence} measured=${r.output._truth_gate.measured_findings_count} complete=${r.output._truth_gate.data_completeness_percent}%`);
    }
    if (r.output._tool_calls) {
      console.log(`     tool_calls=${r.output._tool_calls.length}: ${r.output._tool_calls.map(c => c.tool).join(', ')}`);
    }
  }
}

// Also show agent_templates row
const { data: all } = await supabase
  .from('agent_templates')
  .select('id, slug, name, is_active')
  .ilike('slug', '%distribution%');
console.log('\nTemplates matching "distribution":', JSON.stringify(all, null, 2));

// Find the exact slug of the one that ran
if (cd[0]) {
  const agentTmplId = cd[0].agent_template_id;
  const { data: tmpl } = await supabase
    .from('agent_templates')
    .select('*')
    .eq('id', agentTmplId)
    .maybeSingle();
  console.log('\nAgent template used:', tmpl?.slug, 'active=', tmpl?.is_active);
  console.log('Prompt preview:', tmpl?.prompt?.slice(0, 1500));
  console.log('Tools allowed count:', tmpl?.tools_allowed?.length);
}
