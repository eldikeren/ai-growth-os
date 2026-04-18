import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const tables = ['client_metrics', 'seo_data', 'backlink_intelligence', 'metric_baselines', 'keyword_rankings'];
for (const n of tables) {
  const res = await sb.from(n).select('*').limit(1);
  if (res.error) {
    console.log(`${n}: ERROR ${res.error.code || ''} ${res.error.message}`);
  } else {
    console.log(`${n}: OK, sample=${JSON.stringify(res.data)}`);
  }
}
