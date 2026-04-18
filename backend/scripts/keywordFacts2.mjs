import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

const { data: all } = await supabase.from('client_keywords')
  .select('keyword, current_position, target_position, volume, difficulty, last_checked, source, url, target_page, keyword_language, is_brand')
  .eq('client_id', YANIV).eq('is_brand', false).eq('keyword_language', 'he')
  .order('volume', { ascending: false });

const top3 = all.filter(k => k.current_position && k.current_position <= 3);
const top10 = all.filter(k => k.current_position && k.current_position <= 10 && k.current_position > 3);
const out10 = all.filter(k => k.current_position && k.current_position > 10);
const nr = all.filter(k => !k.current_position);

console.log(`=== Yaniv ranking breakdown (${all.length} targets) ===`);
console.log(`  top 3:        ${top3.length}`);
console.log(`  top 10:       ${top10.length}`);
console.log(`  outside 10:   ${out10.length}`);
console.log(`  not ranking:  ${nr.length}`);

// Where do ranks come from?
const bySource = {};
for (const k of all) bySource[k.source || 'null'] = (bySource[k.source || 'null'] || 0) + 1;
console.log('\nby source:', bySource);

// Freshness
const now = Date.now();
const fresh = all.filter(k => k.last_checked && (now - new Date(k.last_checked).getTime()) < 2 * 24 * 3600 * 1000);
const oldest = all.filter(k => k.last_checked).map(k => new Date(k.last_checked).getTime()).sort((a,b) => a-b)[0];
const newest = all.filter(k => k.last_checked).map(k => new Date(k.last_checked).getTime()).sort((a,b) => b-a)[0];
console.log(`\nfreshness: checked < 48h: ${fresh.length}/${all.length}`);
if (newest) console.log(`  newest: ${new Date(newest).toISOString()}`);
if (oldest) console.log(`  oldest: ${new Date(oldest).toISOString()}`);

// Top-value keywords that ARE in top 10 (4-10) — closest to mission goal
console.log('\n=== In Top 10 but NOT Top 3 (closest wins — push these to top 3): ===');
for (const k of top10.sort((a,b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10)) {
  console.log(`  pos=${k.current_position}→target=${k.target_position || '?'}  vol=${k.volume}  url="${k.url||k.target_page||''}"  "${k.keyword}"`);
}
console.log('\n=== Outside 10 with HIGHEST volume (biggest opportunity): ===');
for (const k of out10.sort((a,b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10)) {
  console.log(`  pos=${k.current_position}  vol=${k.volume}  url="${k.url||k.target_page||''}"  "${k.keyword}"`);
}
console.log('\n=== Not Ranking at all: ===');
for (const k of nr.sort((a,b) => (b.volume || 0) - (a.volume || 0)).slice(0, 10)) {
  console.log(`  vol=${k.volume}  url="${k.url||k.target_page||''}"  "${k.keyword}"`);
}
