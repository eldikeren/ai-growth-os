import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const YANIV = '00000000-0000-0000-0000-000000000001';

const { data: runs } = await supabase
  .from('runs')
  .select('id, status, created_at, output, agent_templates(slug)')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false })
  .limit(50);

const tech = (runs || []).filter(r => r.agent_templates?.slug === 'technical-seo-crawl-agent' && r.output);
console.log(`Found ${tech.length} tech runs with output. Latest:`);

const r = tech[0];
console.log(`\n=== RUN ${r.id} (${r.status}, ${r.created_at}) ===`);
const o = r.output;
console.log('Top-level keys:', Object.keys(o).join(', '));
console.log('\nFull output:');
console.log(JSON.stringify(o, null, 2).slice(0, 8000));
