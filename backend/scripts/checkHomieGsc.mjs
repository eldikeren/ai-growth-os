// Check if Homie-Finance has a GSC property configured and OAuth token.
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

// Find Homie client
const { data: clients } = await supabase
  .from('clients')
  .select('id, name, primary_domain')
  .ilike('name', '%Homie%');
console.log('Homie clients:', clients);

if (!clients || clients.length === 0) { process.exit(0); }
const homie = clients[0];

// Check GSC property on client_gsc_properties
const { data: props } = await supabase
  .from('client_gsc_properties')
  .select('*')
  .eq('client_id', homie.id);
console.log(`\ngsc_properties (${props?.length || 0}):`, props);

// Check OAuth credentials
const { data: creds } = await supabase
  .from('oauth_credentials')
  .select('provider, account_email, scopes, created_at')
  .eq('client_id', homie.id);
console.log(`\noauth_credentials (${creds?.length || 0}):`, creds);

// Existing gsc_diagnostics for Homie
const { count } = await supabase
  .from('gsc_diagnostics')
  .select('*', { count: 'exact', head: true })
  .eq('client_id', homie.id);
console.log(`\nHomie gsc_diagnostics rows: ${count}`);
