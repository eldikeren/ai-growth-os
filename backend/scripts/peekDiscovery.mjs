import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const { data } = await sb.from('client_integrations')
  .select('provider, sub_provider, discovery_summary')
  .eq('client_id', '00000000-0000-0000-0000-000000000001');
for (const i of (data || [])) {
  console.log(`\n=== ${i.provider}/${i.sub_provider} ===`);
  console.log(JSON.stringify(i.discovery_summary, null, 2).slice(0, 2000));
}
