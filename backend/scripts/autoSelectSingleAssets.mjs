#!/usr/bin/env node
// For client_integrations with multiple discovered assets and no selection, DON'T
// auto-pick — the user has to choose which GA4 property / Ads account belongs
// to the client. But show a clear breakdown so the user knows what to pick.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data: integrations } = await sb.from('client_integrations')
  .select('id, client_id, provider, sub_provider, status, selected_asset_id, discovery_summary')
  .is('selected_asset_id', null)
  .eq('status', 'connected');

console.log(`Unselected connected integrations: ${integrations?.length || 0}\n`);

// Group by client
const byClient = {};
for (const i of (integrations || [])) {
  if (!byClient[i.client_id]) byClient[i.client_id] = [];
  byClient[i.client_id].push(i);
}

const { data: clients } = await sb.from('clients').select('id, name');
const clientName = Object.fromEntries((clients || []).map(c => [c.id, c.name]));

for (const [clientId, integ] of Object.entries(byClient)) {
  console.log(`=== ${clientName[clientId] || clientId} ===`);
  for (const i of integ) {
    const summary = i.discovery_summary || {};
    const accounts = summary.accounts || summary.properties || [];
    console.log(`\n  ${i.provider}/${i.sub_provider}: ${summary.label || '?'}`);
    if (Array.isArray(accounts) && accounts.length > 0) {
      for (const a of accounts.slice(0, 10)) {
        const id = a.id || a.property_id || a.account_id || a.siteUrl || a.name;
        const label = a.name || a.displayName || a.property_name || a.siteUrl || '(no name)';
        console.log(`    id=${id}  label=${label}`);
      }
    }
  }
  console.log('');
}
