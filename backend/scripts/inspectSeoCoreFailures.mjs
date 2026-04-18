import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

const { data: runs } = await supabase
  .from('runs')
  .select('id, status, error, client_id, created_at, output')
  .eq('status', 'failed')
  .gte('created_at', dayAgo)
  .order('created_at', { ascending: false });

// Filter to seo-core via agent_templates join
const { data: allFailed } = await supabase
  .from('runs')
  .select('id, status, error, client_id, created_at, output, agent_templates(slug)')
  .eq('status', 'failed')
  .gte('created_at', dayAgo)
  .order('created_at', { ascending: false });

const seoCore = (allFailed || []).filter(r => r.agent_templates?.slug === 'seo-core-agent');

console.log(`=== seo-core-agent failed runs in last 24h: ${seoCore.length} ===\n`);

// Group by error signature
const byErr = {};
for (const r of seoCore) {
  const sig = (r.error || 'no-error-message').slice(0, 100);
  byErr[sig] = byErr[sig] || [];
  byErr[sig].push(r);
}

for (const [sig, rs] of Object.entries(byErr)) {
  console.log(`\n[${rs.length}×] ${sig}`);
  const first = rs[0];
  console.log(`  first: ${first.id.slice(0,8)}  client=${first.client_id?.slice(0,8)}  ${first.created_at}`);
  if (first.error) console.log(`  full error: ${first.error.slice(0, 400)}`);
  if (first.output) {
    const keys = Object.keys(first.output);
    console.log(`  output keys: ${keys.join(', ')}`);
    if (first.output.message) console.log(`  output.message: ${first.output.message.slice(0,200)}`);
    if (first.output.openai_error) console.log(`  output.openai_error: ${first.output.openai_error.slice(0,200)}`);
  }
}
