import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Replicate the EXACT preflight query
const { data, error } = await sb.from('oauth_credentials')
  .select('id, provider, sub_provider, status, last_error, expires_at, selected_property, selected_account')
  .eq('client_id', '00000000-0000-0000-0000-000000000001')
  .eq('provider', 'google')
  .maybeSingle();

console.log('data:', data);
console.log('error:', error);
