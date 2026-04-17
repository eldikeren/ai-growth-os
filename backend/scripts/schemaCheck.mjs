import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const { data: yanivClient } = await supabase.from('clients').select('id, name').ilike('name', '%yaniv%').maybeSingle();
console.log('Yaniv client:', yanivClient);
if (!yanivClient) process.exit(0);

const { data: campaigns } = await supabase.from('campaigns').select('*').limit(2);
console.log('\nSample campaigns row:', JSON.stringify(campaigns, null, 2));

const { data: sample } = await supabase.from('campaign_creatives').select('*').limit(2);
console.log('\nSample campaign_creative rows:', sample?.length);
if (sample?.length) {
  console.log('Keys:', Object.keys(sample[0]).join(', '));
  console.log('Sample:', JSON.stringify(sample[0], null, 2));
}
