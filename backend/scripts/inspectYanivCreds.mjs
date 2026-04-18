#!/usr/bin/env node
// Check all credential-ish storage for Yaniv
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const yanivId = '00000000-0000-0000-0000-000000000001';

// 1) credentials table
console.log('=== credentials ===');
const { data: creds, error } = await sb.from('credentials').select('*').eq('client_id', yanivId);
if (error) console.log('  err:', error.message);
else {
  console.log(`  rows: ${creds?.length || 0}`);
  for (const c of (creds || [])) {
    console.log(`  ${c.credential_type || c.type} | status:${c.status} | expires:${c.expires_at || '-'} | err:${c.last_error || '-'}`);
  }
}

// 2) Look at all credentials across the system to see what types exist
const { data: allTypes } = await sb.from('credentials').select('credential_type, client_id');
const typeCount = {};
for (const c of (allTypes || [])) typeCount[c.credential_type] = (typeCount[c.credential_type] || 0) + 1;
console.log('\n=== all credential types in system ===');
for (const [t, n] of Object.entries(typeCount).sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);

// 3) How does Homie compare? (the other client)
const { data: clients } = await sb.from('clients').select('id, name');
console.log('\n=== credentials per client ===');
for (const c of (clients || [])) {
  const { data: cc } = await sb.from('credentials').select('credential_type, status').eq('client_id', c.id);
  const types = (cc || []).map(x => `${x.credential_type}(${x.status})`).join(', ');
  console.log(`  ${c.name}: ${cc?.length || 0}  [${types}]`);
}

// 4) Check client_settings / client_integrations / similar
console.log('\n=== client_integrations (if exists) ===');
const { data: integ, error: integErr } = await sb.from('client_integrations').select('*').eq('client_id', yanivId);
if (integErr) console.log(`  ${integErr.message}`);
else console.log(`  rows: ${integ?.length || 0}`, integ);

console.log('\n=== social_accounts (if exists) ===');
const { data: sa, error: saErr } = await sb.from('social_accounts').select('*').eq('client_id', yanivId);
if (saErr) console.log(`  ${saErr.message}`);
else console.log(`  rows: ${sa?.length || 0}`, sa);

// 5) The "success" runs — what did they actually output?
console.log('\n=== reviews-gbp sample output ===');
const { data: sampleRun } = await sb.from('runs')
  .select('status, output_text, output, summary, error, tokens_used, created_at')
  .eq('client_id', yanivId)
  .eq('owner_agent_slug', 'reviews-gbp-authority-agent')
  .eq('status', 'success')
  .order('created_at', { ascending: false })
  .limit(3);
for (const r of (sampleRun || [])) {
  console.log(`  ${r.created_at.slice(0, 16)} tokens=${r.tokens_used}`);
  console.log(`    summary: ${(r.summary || '').slice(0, 200)}`);
  console.log(`    output_text: ${(r.output_text || '').slice(0, 300)}`);
  console.log(`    output keys: ${r.output ? Object.keys(r.output).join(',') : '(null)'}`);
}

// 6) Same for facebook-agent
console.log('\n=== facebook-agent sample output ===');
const { data: fbRun } = await sb.from('runs')
  .select('status, output_text, output, summary, error, tokens_used, created_at')
  .eq('client_id', yanivId)
  .eq('owner_agent_slug', 'facebook-agent')
  .eq('status', 'success')
  .order('created_at', { ascending: false })
  .limit(3);
for (const r of (fbRun || [])) {
  console.log(`  ${r.created_at.slice(0, 16)} tokens=${r.tokens_used}`);
  console.log(`    summary: ${(r.summary || '').slice(0, 200)}`);
  console.log(`    output_text: ${(r.output_text || '').slice(0, 300)}`);
}
