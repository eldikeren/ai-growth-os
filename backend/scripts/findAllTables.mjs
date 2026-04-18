import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Probe for many possible table names
const guesses = [
  'metric_snapshots', 'client_metric_baselines', 'client_kpis', 'kpis',
  'baselines', 'metrics', 'client_metrics', 'metric_baselines',
  'keyword_rankings', 'rankings', 'keyword_positions', 'keyword_history',
  'keywords', 'tracked_keywords', 'client_keywords',
  'seo_data', 'page_data', 'pages', 'site_pages', 'scanned_pages',
  'ga4_metrics', 'gsc_metrics', 'gbp_metrics',
  'backlink_intelligence', 'backlinks', 'referring_domains',
  'ai_visibility_metrics', 'brand_mentions', 'ai_citations',
  'runs', 'clients', 'agent_templates',
];
for (const n of guesses) {
  const res = await sb.from(n).select('*').limit(1);
  const tag = res.error ? 'MISSING' : 'EXISTS';
  console.log(`${tag.padEnd(8)} ${n}`);
}
