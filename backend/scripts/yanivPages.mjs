import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

// Indexable Yaniv pages (not sitemaps, not noindex, not 404)
const { data } = await supabase.from('gsc_diagnostics')
  .select('url, coverage_state')
  .eq('client_id', YANIV);
const pages = (data || [])
  .filter(r => r.url && !r.url.endsWith('.xml'))
  .map(r => { try { return new URL(r.url).pathname.replace(/^\/+|\/+$/g, ''); } catch { return null; } })
  .filter(Boolean);
const unique = [...new Set(pages)].sort();
console.log(`unique paths: ${unique.length}\n`);
for (const p of unique) console.log(`  /${p}`);
