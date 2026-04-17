import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Pull the very latest success
const { data: runs } = await supabase
  .from('runs')
  .select('id, status, output, agent_templates(slug)')
  .eq('status', 'success')
  .order('created_at', { ascending: false })
  .limit(100);

const wc = (runs || []).filter(r => r.agent_templates?.slug === 'website-content-agent');
if (!wc[0]) { console.log('No website-content success'); process.exit(0); }
const o = wc[0].output;
console.log('Run', wc[0].id);
console.log('Top keys:', Object.keys(o).join(', '));
console.log('\n_tool_calls:', (o._tool_calls || []).map(t => `${t.tool}`).join(', '));
console.log('\nproposals?', (o.proposals || []).length, 'content_drafts?', (o.content_drafts || []).length);
console.log('\nFull output (4k):');
console.log(JSON.stringify(o, null, 2).slice(0, 4000));

// Also: look for tables that might contain GT3-style tasks under a different name
console.log('\n\n=== Task tables ===');
for (const tbl of ['tasks', 'gt3_tasks', 'action_tasks', 'agent_tasks', 'website_content_tasks', 'growth_tasks']) {
  const { count, error } = await supabase.from(tbl).select('*', { count: 'exact', head: true });
  if (!error) console.log(`  ${tbl}: ${count} rows`);
}
