import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

const { data: t } = await supabase
  .from('agent_templates')
  .select('do_rules, dont_rules, output_contract, global_rules, self_validation_checklist')
  .eq('slug', 'content-distribution-agent')
  .maybeSingle();

console.log('DO RULES:');
for (const r of t.do_rules || []) console.log(`  - ${r}`);
console.log('\nDONT RULES:');
for (const r of t.dont_rules || []) console.log(`  - ${r}`);
console.log('\nOUTPUT CONTRACT:');
console.log(JSON.stringify(t.output_contract, null, 2));
console.log('\nGLOBAL_RULES:');
console.log((t.global_rules || '').slice(0, 500));
console.log('\nSELF_VALIDATION:');
for (const r of t.self_validation_checklist || []) console.log(`  - ${r}`);
