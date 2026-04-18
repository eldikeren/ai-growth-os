#!/usr/bin/env node
// Auto-select GSC property when discovery found exactly one property matching
// the client's domain. This is safe because domain is in the client record
// and we can unambiguously pick the matching GSC property.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function normalizeDomain(url) {
  if (!url) return null;
  return url.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^sc-domain:/, '')
    .replace(/\/$/, '');
}

const { data: integrations } = await sb.from('client_integrations')
  .select('id, client_id, provider, sub_provider, discovery_summary, status, selected_asset_id, clients(domain, name)')
  .eq('sub_provider', 'search_console')
  .is('selected_asset_id', null);

for (const i of (integrations || [])) {
  const clientDomain = normalizeDomain(i.clients?.domain);
  if (!clientDomain) { console.log(`  skip ${i.clients?.name}: no domain`); continue; }

  const props = i.discovery_summary?.properties || [];
  // Prefer sc-domain: over https:// (domain property has more data)
  const matches = props.filter(p => normalizeDomain(p.url) === clientDomain && p.permission === 'siteOwner');
  if (!matches.length) { console.log(`  ${i.clients.name}: no match for ${clientDomain} in ${props.length} props`); continue; }

  // Prefer sc-domain: properties (aggregated across http/https/www)
  const preferred = matches.find(m => m.url.startsWith('sc-domain:')) || matches[0];

  const { error } = await sb.from('client_integrations')
    .update({
      selected_asset_id: preferred.url,
      selected_asset_label: preferred.url,
      updated_at: new Date().toISOString(),
    })
    .eq('id', i.id);

  if (error) console.log(`  err ${i.clients.name}: ${error.message}`);
  else console.log(`  ✓ ${i.clients.name}: selected ${preferred.url}`);
}
