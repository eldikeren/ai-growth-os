import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

// 1. Latest run per agent for Yaniv
const { data: runs } = await supabase
  .from('runs')
  .select('id, status, created_at, completed_at, duration_ms, error, false_success, false_success_flags, output, agent_templates(name, slug)')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false })
  .limit(80);

// Group latest per agent
const latest = {};
for (const r of runs || []) {
  const slug = r.agent_templates?.slug;
  if (!slug) continue;
  if (!latest[slug]) latest[slug] = r;
}

console.log('=== LATEST RUN PER AGENT (Yaniv) ===\n');
for (const slug of Object.keys(latest).sort()) {
  const r = latest[slug];
  const tg = r.output?._truth_gate;
  const flags = r.false_success_flags ? JSON.stringify(r.false_success_flags) : '[]';
  console.log(`${slug.padEnd(38)} ${r.status.padEnd(18)} ${r.created_at.slice(0,19)}  false=${r.false_success}  flags=${flags}`);
  if (tg) console.log(`    truth_gate: conf=${tg.confidence}  completeness=${tg.data_completeness_percent}%  missing=${(tg.missing_sources||[]).map(m=>m.source).join(',')}`);
  if (r.error) console.log(`    ERROR: ${r.error.slice(0, 200)}`);
  if (r.output?.blocking_reason) console.log(`    blocking: ${String(r.output.blocking_reason).slice(0,200)}`);
}

// 2. SEO Core specifically — latest failure
console.log('\n\n=== SEO CORE AGENT: latest 3 runs ===\n');
const seoCore = (runs || []).filter(r => r.agent_templates?.slug === 'seo-core-agent').slice(0, 3);
for (const r of seoCore) {
  console.log(`\n--- run ${r.id.slice(0,8)}  status=${r.status}  ${r.created_at} ---`);
  console.log(`  duration_ms: ${r.duration_ms}`);
  console.log(`  error: ${r.error}`);
  console.log(`  output keys: ${r.output ? Object.keys(r.output).join(', ') : 'null'}`);
  if (r.output?.message) console.log(`  output.message: ${r.output.message.slice(0, 300)}`);
  if (r.output?.openai_error) console.log(`  output.openai_error: ${r.output.openai_error.slice(0, 300)}`);
  if (r.output?.blocking_reason) console.log(`  output.blocking_reason: ${r.output.blocking_reason.slice(0, 300)}`);
  if (r.output?._tool_calls) {
    console.log(`  tool_calls: ${r.output._tool_calls.length}`);
    for (const tc of r.output._tool_calls.slice(0,6)) {
      console.log(`    - ${tc.tool || tc.name}  ${tc.envelope?.blocking_reason ? 'BLOCK:'+tc.envelope.blocking_reason.slice(0,80) : ''}`);
    }
  }
}

// 3. Local SEO Agent ?FAKE
console.log('\n\n=== LOCAL SEO AGENT: latest 2 runs ===\n');
const localSeo = (runs || []).filter(r => r.agent_templates?.slug === 'local-seo-agent').slice(0, 2);
for (const r of localSeo) {
  console.log(`\n--- run ${r.id.slice(0,8)}  status=${r.status}  false_success=${r.false_success}  flags=${JSON.stringify(r.false_success_flags)} ---`);
  console.log(`  output keys: ${r.output ? Object.keys(r.output).join(', ') : 'null'}`);
  if (r.output?.summary) console.log(`  summary: ${r.output.summary.slice(0,200)}`);
  if (r.output?.actions_taken) console.log(`  actions_taken: ${JSON.stringify(r.output.actions_taken).slice(0,400)}`);
  if (r.output?._truth_gate) console.log(`  truth_gate: ${JSON.stringify(r.output._truth_gate).slice(0, 400)}`);
}

// 4. Keyword rankings actual state
const { data: rankings } = await supabase
  .from('keyword_rankings')
  .select('keyword, current_position, target_position, is_target, country_code')
  .eq('client_id', YANIV);
const targets = (rankings || []).filter(r => r.is_target);
const top3 = targets.filter(r => r.current_position && r.current_position <= 3);
const top10 = targets.filter(r => r.current_position && r.current_position <= 10 && r.current_position > 3);
const out10 = targets.filter(r => r.current_position && r.current_position > 10);
const notrank = targets.filter(r => !r.current_position);
console.log(`\n\n=== KEYWORDS (Yaniv) ===`);
console.log(`target keywords:    ${targets.length}`);
console.log(`top 3:              ${top3.length}`);
console.log(`top 10 (4-10):      ${top10.length}`);
console.log(`outside top 10:     ${out10.length}`);
console.log(`not ranking:        ${notrank.length}`);
console.log(`\nSample non-ranking targets:`);
for (const k of notrank.slice(0, 10)) console.log(`  [NOT RANKED] ${k.keyword}`);
console.log(`\nSample stuck-outside-10 targets:`);
for (const k of out10.slice(0, 10)) console.log(`  pos=${k.current_position} → target=${k.target_position}  ${k.keyword}`);
