import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data } = await sb.from('integration_assets')
  .select('client_id, provider, sub_provider, external_id, label, is_selected, clients(name, domain)')
  .order('client_id');

console.log(`Total assets: ${data?.length || 0}\n`);
const byKey = {};
for (const a of (data || [])) {
  const key = `${a.clients?.name}/${a.provider}/${a.sub_provider}`;
  if (!byKey[key]) byKey[key] = [];
  byKey[key].push(a);
}
for (const [key, assets] of Object.entries(byKey)) {
  const selected = assets.filter(a => a.is_selected);
  console.log(`${key}: ${assets.length} assets, ${selected.length} selected`);
  for (const a of assets.slice(0, 5)) {
    console.log(`  ${a.is_selected ? '✓' : ' '} ${a.external_id} — ${a.label || '(no label)'}`);
  }
}
