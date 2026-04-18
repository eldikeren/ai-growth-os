import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Check if any similarly-named tables exist
const names = ['client_metrics', 'metrics', 'metric_values', 'metric_history', 'metric_baselines'];
for (const n of names) {
  const { error, count } = await sb.from(n).select('*', { count: 'exact', head: true });
  console.log(`  ${n}: ${error ? `ERR: ${error.message.slice(0, 60)}` : `rows=${count}`}`);
}
console.log('---');
const seo = ['seo_data', 'pages', 'page_data', 'website_pages', 'site_pages', 'scanned_pages'];
for (const n of seo) {
  const { error, count } = await sb.from(n).select('*', { count: 'exact', head: true });
  console.log(`  ${n}: ${error ? `ERR: ${error.message.slice(0, 60)}` : `rows=${count}`}`);
}
console.log('---');
const bl = ['backlink_intelligence', 'backlinks', 'referring_domains', 'missing_referring_domains'];
for (const n of bl) {
  const { error, count } = await sb.from(n).select('*', { count: 'exact', head: true });
  console.log(`  ${n}: ${error ? `ERR: ${error.message.slice(0, 60)}` : `rows=${count}`}`);
}
