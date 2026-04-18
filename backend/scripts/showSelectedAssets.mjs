import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data } = await sb.from('integration_assets')
  .select('provider, sub_provider, external_id, label, clients(name, domain)')
  .eq('is_selected', true)
  .order('client_id');

console.log('Currently selected assets:');
for (const a of (data || [])) {
  console.log(`  ${a.clients.name.padEnd(25)} ${a.provider}/${a.sub_provider.padEnd(16)} ${a.external_id}  "${a.label}"`);
}

// For the ones that DON'T look right, let's also show all candidates with domain match
console.log('\n\nDomain-matched alternative candidates:');
const { data: clients } = await sb.from('clients').select('id, name, domain');
for (const c of (clients || [])) {
  const { data: assets } = await sb.from('integration_assets')
    .select('provider, sub_provider, external_id, label, is_selected')
    .eq('client_id', c.id);
  const domain = c.domain?.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const matches = (assets || []).filter(a => {
    const target = `${a.external_id} ${a.label}`.toLowerCase();
    return target.includes(domain) || target.includes(domain.split('.')[0]);
  });
  console.log(`\n${c.name} (domain: ${domain})`);
  for (const m of matches) {
    console.log(`  ${m.is_selected ? '✓' : ' '} ${m.provider}/${m.sub_provider} ${m.external_id} "${m.label}"`);
  }
}
