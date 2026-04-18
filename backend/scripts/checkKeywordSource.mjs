import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

// Full dump of client_keywords regardless of filters
const { data: all, count } = await supabase
  .from('client_keywords').select('keyword, keyword_language, is_brand, position, volume, country, is_target', { count: 'exact' })
  .eq('client_id', YANIV);

console.log(`=== client_keywords (Yaniv) — total: ${all?.length || 0} (count=${count}) ===\n`);
const byLang = {}, byBrand = {}, byTarget = {};
for (const k of all || []) {
  byLang[k.keyword_language || 'null'] = (byLang[k.keyword_language || 'null'] || 0) + 1;
  byBrand[`is_brand=${k.is_brand}`] = (byBrand[`is_brand=${k.is_brand}`] || 0) + 1;
  byTarget[`is_target=${k.is_target}`] = (byTarget[`is_target=${k.is_target}`] || 0) + 1;
}
console.log('by language:', byLang);
console.log('by brand:',    byBrand);
console.log('by target:',   byTarget);

// Profile
const { data: prof } = await supabase.from('client_profiles').select('language').eq('client_id', YANIV).maybeSingle();
const { data: rules } = await supabase.from('client_rules').select('language').eq('client_id', YANIV).maybeSingle();
console.log('\nclient_profiles.language:', prof?.language);
console.log('client_rules.language:   ', rules?.language);

// Now call the actual endpoint logic (filter)
let q = supabase.from('client_keywords').select('*').eq('client_id', YANIV).order('volume', { ascending: false }).eq('is_brand', false);
const { data: endpointReturn } = await q.eq('keyword_language', prof?.language || rules?.language || 'he');
console.log(`\nEndpoint would return (is_brand=false AND lang=${prof?.language || rules?.language || 'he'}): ${endpointReturn?.length || 0} rows`);

// With NO filters (what mission banner might show)
console.log(`\nAll non-brand regardless of language:`, (all || []).filter(k => !k.is_brand).length);
console.log(`All rows regardless of anything:       `, (all || []).length);

// Sample rows with positions
const samples = (all || []).filter(k => k.position != null).slice(0, 8);
console.log('\nSample with position:');
for (const s of samples) {
  console.log(`  pos=${s.position}  lang=${s.keyword_language}  brand=${s.is_brand}  target=${s.is_target}  vol=${s.volume}  "${s.keyword?.slice(0,60)}"`);
}
