import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Look at 3 auto-cancelled runs with full details  
const { data: samples } = await s.from('runs')
  .select('id, agent_template_id, created_at, updated_at, completed_at, duration_ms, prompt_used, tokens_used, prompt_tokens, completion_tokens, model, triggered_by, error, summary, output')
  .eq('status', 'failed').limit(5);

for (const r of (samples || []).filter(x => (x.error || '').includes('Auto-cancelled'))) {
  const { data: a } = await s.from('agent_templates').select('slug').eq('id', r.agent_template_id).single();
  const age = Math.round((new Date(r.updated_at) - new Date(r.created_at)) / 1000);
  console.log(`\n=== ${a?.slug} [${r.id.slice(0,8)}] ===`);
  console.log(`  created→updated = ${age}s`);
  console.log(`  duration_ms=${r.duration_ms}  completed_at=${r.completed_at}`);
  console.log(`  triggered_by=${r.triggered_by}  model=${r.model}`);
  console.log(`  tokens: prompt=${r.prompt_tokens} completion=${r.completion_tokens} total=${r.tokens_used}`);
  console.log(`  prompt length: ${(r.prompt_used || '').length} chars`);
  console.log(`  summary: ${r.summary || '(none)'}`);
  console.log(`  output: ${r.output ? JSON.stringify(r.output).slice(0, 200) : '(none)'}`);
}
