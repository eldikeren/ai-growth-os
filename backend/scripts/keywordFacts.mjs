import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';

// Correct query: select * and filter
const { data: all, error } = await supabase.from('client_keywords')
  .select('*').eq('client_id', YANIV).eq('is_brand', false).eq('keyword_language', 'he')
  .order('volume', { ascending: false }).limit(1500);
if (error) { console.error('ERR', error); process.exit(1); }

console.log(`Yaniv non-brand Hebrew keywords: ${all.length}`);
const withPos = all.filter(k => k.position != null);
const top3 = withPos.filter(k => k.position <= 3);
const top10 = withPos.filter(k => k.position <= 10 && k.position > 3);
const out10 = withPos.filter(k => k.position > 10);
const notRanking = all.filter(k => k.position == null);

console.log(`  with position:  ${withPos.length}`);
console.log(`  top 3:          ${top3.length}`);
console.log(`  top 10 (4-10):  ${top10.length}`);
console.log(`  outside 10:     ${out10.length}`);
console.log(`  not ranking:    ${notRanking.length}`);

// Check position_last_checked_at freshness
const now = Date.now();
const checked = all.filter(k => k.position_last_checked_at);
const stale = checked.filter(k => (now - new Date(k.position_last_checked_at).getTime()) > 14*24*3600*1000);
console.log(`\n  with position_last_checked_at: ${checked.length}`);
console.log(`  checked > 14 days ago (stale): ${stale.length}`);
if (checked.length > 0) {
  const newest = checked.map(k => new Date(k.position_last_checked_at).getTime()).sort((a,b)=>b-a)[0];
  const oldest = checked.map(k => new Date(k.position_last_checked_at).getTime()).sort((a,b)=>a-b)[0];
  console.log(`  newest check: ${new Date(newest).toISOString()}`);
  console.log(`  oldest check: ${new Date(oldest).toISOString()}`);
}

// Top 10 by volume — where are they ranking?
console.log('\n=== TOP 20 highest-volume keywords (what the mission should be moving) ===');
for (const k of all.slice(0, 20)) {
  console.log(`  vol=${String(k.volume || 0).padStart(6)}  pos=${String(k.position || '—').padStart(4)}  target=${k.is_target}  "${k.keyword}"`);
}
