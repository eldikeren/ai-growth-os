import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

const { data } = await supabase.from('gsc_diagnostics')
  .select('inspected_url, coverage_state')
  .eq('client_id', YANIV);
const urls = (data || []).map(r => r.inspected_url).filter(u => u && !u.endsWith('.xml'));

const slugs = urls.map(u => {
  try { return new URL(u).pathname.replace(/^\/+|\/+$/g, ''); }
  catch { return null; }
}).filter(Boolean);
const unique = [...new Set(slugs)].sort();
console.log(`Yaniv URLs: ${urls.length}, Unique path slugs: ${unique.length}\n`);
unique.forEach(s => console.log(`  /${s}`));
