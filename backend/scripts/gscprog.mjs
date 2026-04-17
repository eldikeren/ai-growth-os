import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://gkzusfigajwcsfhhkvbs.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws');
const YANIV = '00000000-0000-0000-0000-000000000001';
const { count } = await supabase.from('gsc_diagnostics').select('*', { count: 'exact', head: true }).eq('client_id', YANIV);
console.log('gsc_diagnostics rows for Yaniv:', count);
const { data: recent } = await supabase.from('gsc_diagnostics').select('inspected_at').eq('client_id', YANIV).order('inspected_at', {ascending: false}).limit(3);
console.log('most recent:', recent?.map(r=>r.inspected_at));
// Coverage breakdown
const { data: all } = await supabase.from('gsc_diagnostics').select('coverage_state, verdict').eq('client_id', YANIV);
const cov = {};
for (const r of (all||[])) cov[r.coverage_state||'null'] = (cov[r.coverage_state||'null']||0)+1;
console.log('coverage_state breakdown:', cov);
