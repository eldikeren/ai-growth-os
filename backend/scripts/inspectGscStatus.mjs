// Inspect GSC indexing state for Yaniv.
// Step 1: Find Yaniv's GSC property.
// Step 2: Pull recent technical-seo-crawl-agent runs — see what it already reported.
// Step 3: For a handful of pages we know are pending, run URL inspection.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const YANIV = '00000000-0000-0000-0000-000000000001';

// 1. Find the GSC property
const { data: asset } = await supabase
  .from('integration_assets')
  .select('*')
  .eq('client_id', YANIV)
  .eq('sub_provider', 'search_console');
console.log('GSC assets for Yaniv:', JSON.stringify(asset, null, 2));

// 2. Recent technical-seo-crawl-agent runs
const { data: runs } = await supabase
  .from('runs')
  .select('id, status, created_at, output, agent_templates(slug, name)')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false })
  .limit(100);

const tech = (runs || []).filter(r => r.agent_templates?.slug === 'technical-seo-crawl-agent');
console.log(`\nTechnical SEO runs (last ${tech.length}):`);
for (const r of tech.slice(0, 5)) {
  const o = r.output || {};
  console.log(`  ${r.id.slice(0, 8)} status=${r.status} at=${r.created_at}`);
  if (o.indexing_repair) {
    console.log(`    indexing_repair: inspected=${o.indexing_repair.pages_inspected || '?'} non_indexed=${o.indexing_repair.non_indexed_found || '?'} fixes=${o.indexing_repair.fixes_proposed || '?'}`);
    if (o.indexing_repair.root_causes) {
      for (const rc of o.indexing_repair.root_causes.slice(0, 5)) {
        console.log(`      - ${rc.url}: ${rc.reason} → ${rc.fix_applied || '(no fix)'}`);
      }
    }
  }
  console.log(`    non_indexed_pages_count=${o.non_indexed_pages_count || '?'}`);
  console.log(`    bucket_1_indexing[0]:`, JSON.stringify(o.bucket_1_indexing?.[0] || {}).slice(0, 200));
}

// 3. Look at page_metrics for Yaniv — do we have a list of Yaniv pages?
const { data: pages } = await supabase
  .from('pages')
  .select('url, last_indexed_at, indexing_state, coverage_state')
  .eq('client_id', YANIV)
  .order('last_indexed_at', { ascending: false, nullsFirst: true })
  .limit(10);
console.log(`\nPages table sample (Yaniv, ${pages?.length || 0} rows):`);
for (const p of (pages || [])) {
  console.log(`  ${p.url} last_indexed=${p.last_indexed_at} coverage=${p.coverage_state || 'null'}`);
}
