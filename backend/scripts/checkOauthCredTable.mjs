import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Does oauth_credentials exist? What columns?
const { data, error } = await sb.from('oauth_credentials').select('*').limit(1);
if (error) console.log('oauth_credentials table:', error.message);
else {
  console.log('oauth_credentials exists, sample cols:', Object.keys(data?.[0] || {}));
  const { count } = await sb.from('oauth_credentials').select('*', { count: 'exact', head: true });
  console.log('  row count:', count);
}

// Cross-check: client_integrations should have data
const { count: ciCount } = await sb.from('client_integrations').select('*', { count: 'exact', head: true });
console.log('client_integrations row count:', ciCount);

// What providers are in client_integrations?
const { data: providers } = await sb.from('client_integrations').select('provider, sub_provider, status');
const uniq = new Set();
for (const p of (providers || [])) uniq.add(`${p.provider}/${p.sub_provider}`);
console.log('provider/sub_provider combinations:', [...uniq].join(', '));
