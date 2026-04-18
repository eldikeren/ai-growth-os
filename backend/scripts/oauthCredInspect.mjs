import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Show every oauth_credentials row
const { data } = await sb.from('oauth_credentials')
  .select('client_id, provider, sub_provider, status, last_error, connected_at, expires_at');
console.log('=== oauth_credentials rows ===');
for (const r of (data || [])) console.log(`  ${r.client_id.slice(-6)} ${r.provider}/${r.sub_provider} status=${r.status} expires=${r.expires_at} err=${r.last_error || '-'}`);

// vs client_integrations
const { data: ci } = await sb.from('client_integrations')
  .select('client_id, provider, sub_provider, status, selected_asset_id, discovery_summary');
console.log('\n=== client_integrations rows ===');
for (const r of (ci || [])) console.log(`  ${r.client_id.slice(-6)} ${r.provider}/${r.sub_provider} status=${r.status} selected=${r.selected_asset_id || '-'}`);

// What provider value does preflight look up?
// preflight does: .eq('provider', 'google') — but sub_provider is 'ads', 'business_profile', etc.
// So it might be looking for a parent 'google' row that doesn't exist.
console.log('\n=== what preflight queries ===');
for (const clientId of ['00000000-0000-0000-0000-000000000001']) {
  for (const provider of ['google', 'google_ads', 'meta']) {
    const { data: cred } = await sb.from('oauth_credentials')
      .select('id, provider, sub_provider, status, expires_at')
      .eq('client_id', clientId).eq('provider', provider).maybeSingle();
    console.log(`  client=${clientId.slice(-6)} provider=${provider} → ${cred ? `FOUND(${cred.sub_provider}, ${cred.status})` : 'NOT FOUND'}`);
  }
}
