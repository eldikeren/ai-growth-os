import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const { data } = await sb.from('baselines').select('*').limit(1);
console.log('baselines columns:', Object.keys(data?.[0] || {}));
console.log('sample:', data?.[0]);

// How does Dashboard read metrics? Let's check that call
// Dashboard calls /clients/:id/baselines — let's see what that endpoint does
const { data: yanivB } = await sb.from('baselines')
  .select('metric_name, metric_value, updated_at, provenance')
  .eq('client_id', '00000000-0000-0000-0000-000000000001')
  .order('updated_at', { ascending: false });
console.log('\nYaniv baselines:');
for (const b of (yanivB || [])) console.log(`  ${b.metric_name}=${b.metric_value} @ ${b.updated_at}`);

// Check references in code
const { data: cmRefs } = { data: ['agent tool store_metric', 'agent tool query_metrics'] };
console.log('\nclient_metrics refs: agent tools store_metric + query_metrics (both broken)');

// Check store_metric from Yaniv events — does it error?
const { data: events } = await sb.from('agent_events')
  .select('message, metadata, created_at, agent_slug')
  .eq('client_id', '00000000-0000-0000-0000-000000000001')
  .ilike('message', '%store_metric%')
  .order('created_at', { ascending: false })
  .limit(10);
console.log('\nstore_metric events:');
for (const e of (events || [])) console.log(`  ${e.created_at.slice(0, 16)} ${e.agent_slug}: ${e.message}`);
