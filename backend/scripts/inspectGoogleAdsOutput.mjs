import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data } = await supabase
  .from('runs')
  .select('id, status, output, agent_templates(slug, name)')
  .order('created_at', { ascending: false })
  .limit(50);

const google = (data || []).filter(r => r.agent_templates?.slug === 'google-ads-campaign-agent');
console.log(`Found ${google.length} google-ads runs`);

for (const r of google.slice(0, 3)) {
  console.log('\n=== RUN', r.id.slice(0, 8), 'status:', r.status, '===');
  if (!r.output) { console.log('  (no output)'); continue; }
  const keys = Object.keys(r.output);
  console.log('  top-level keys:', keys.join(', '));
  for (const k of keys) {
    const v = r.output[k];
    if (Array.isArray(v)) {
      console.log(`    ${k}: array[${v.length}]`);
      if (v.length > 0 && typeof v[0] === 'object') {
        console.log('      item[0] keys:', Object.keys(v[0]).join(', '));
        console.log('      item[0] sample:', JSON.stringify(v[0]).slice(0, 400));
      }
    } else if (typeof v === 'object' && v !== null) {
      console.log(`    ${k}: object {${Object.keys(v).join(', ')}}`);
    } else {
      const s = typeof v === 'string' ? v.slice(0, 80) : v;
      console.log(`    ${k}: ${typeof v} = ${s}`);
    }
  }
}
