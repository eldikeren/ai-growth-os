#!/usr/bin/env node
// Inspect today's failed runs to understand progress indicators
import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Yaniv client ID — find dynamically
const { data: clients } = await sb.from('clients').select('id, name').ilike('name', '%yaniv%');
const yaniv = clients?.[0];
if (!yaniv) { console.error('Yaniv client not found'); process.exit(1); }
console.log('Yaniv:', yaniv.id, yaniv.name);

// Israel midnight (UTC-3) - "today" starts at IL midnight
const now = new Date();
const ilOffset = 3 * 60 * 60 * 1000;
const ilMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - ilOffset);
console.log('IL midnight (UTC):', ilMidnight.toISOString());

const { data: failed } = await sb.from('runs')
  .select('id, status, error, tokens_used, output, output_text, changed_anything, created_at, updated_at, triggered_by, agent_template_id, agent_templates(slug, name)')
  .eq('client_id', yaniv.id)
  .eq('status', 'failed')
  .gte('created_at', ilMidnight.toISOString())
  .order('created_at', { ascending: false });

console.log(`\nFailed today: ${failed?.length || 0}`);

let withProgress = 0;
let withoutProgress = 0;
const byTrigger = {};
const byError = {};

for (const r of (failed || [])) {
  const tokensUsed = Number(r.tokens_used || 0);
  const hasOutput = r.output && Object.keys(r.output || {}).length > 0;
  const hasOutputText = r.output_text && r.output_text.trim().length > 0;
  const madeProgress = tokensUsed > 0 || hasOutput || hasOutputText || r.changed_anything === true;

  if (madeProgress) withProgress++;
  else withoutProgress++;

  byTrigger[r.triggered_by || 'unknown'] = (byTrigger[r.triggered_by || 'unknown'] || 0) + 1;
  const errKey = (r.error || '').slice(0, 80);
  byError[errKey] = (byError[errKey] || 0) + 1;
}

console.log(`\n  With observable progress: ${withProgress}`);
console.log(`  Without progress:        ${withoutProgress}`);
console.log('\n  By trigger:');
for (const [k, v] of Object.entries(byTrigger).sort((a, b) => b[1] - a[1])) console.log(`    ${k}: ${v}`);
console.log('\n  Top error strings:');
for (const [k, v] of Object.entries(byError).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`    ${v}x  ${k || '(empty)'}`);
}

// Show 3 recent failures with detail
console.log('\n\nRecent 3 failures in detail:');
for (const r of (failed || []).slice(0, 3)) {
  console.log(`---`);
  console.log(`  ${r.agent_templates?.slug} (${r.agent_templates?.name})`);
  console.log(`  trigger: ${r.triggered_by}`);
  console.log(`  tokens_used: ${r.tokens_used}`);
  console.log(`  created: ${r.created_at}`);
  console.log(`  updated: ${r.updated_at}`);
  console.log(`  duration: ${((new Date(r.updated_at) - new Date(r.created_at)) / 1000).toFixed(0)}s`);
  console.log(`  error: ${(r.error || '').slice(0, 200)}`);
  console.log(`  output_text present: ${!!r.output_text}`);
  console.log(`  output keys: ${r.output ? Object.keys(r.output).join(',') : 'null'}`);
}
