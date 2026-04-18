import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

// Check table/columns
const { data: sample } = await supabase.from('gsc_diagnostics').select('*').eq('client_id', YANIV).limit(3);
if (sample?.[0]) {
  console.log('gsc_diagnostics columns:', Object.keys(sample[0]).join(', '));
  console.log('\nsample row:\n', JSON.stringify(sample[0], null, 2));
}
const { count } = await supabase.from('gsc_diagnostics').select('*', { count: 'exact', head: true }).eq('client_id', YANIV);
console.log(`\ngsc_diagnostics count for Yaniv: ${count}`);
