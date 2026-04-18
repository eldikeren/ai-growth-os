import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);
const YANIV = '00000000-0000-0000-0000-000000000001';
const { data } = await supabase.from('client_keywords').select('*').eq('client_id', YANIV).limit(2);
if (data?.[0]) console.log('COLUMNS:', Object.keys(data[0]).join(', '));
if (data?.[0]) console.log('\nSAMPLE ROW:', JSON.stringify(data[0], null, 2));

// Check using actual column "current_position"
const { data: r2 } = await supabase.from('client_keywords')
  .select('keyword, current_position, position, volume, is_brand, keyword_language')
  .eq('client_id', YANIV).eq('is_brand', false).eq('keyword_language', 'he').order('volume', { ascending: false });
if (r2) {
  const withCur = r2.filter(k => k.current_position != null);
  const top3 = withCur.filter(k => k.current_position <= 3);
  const top10 = withCur.filter(k => k.current_position <= 10 && k.current_position > 3);
  const out10 = withCur.filter(k => k.current_position > 10);
  const nr = r2.length - withCur.length;
  console.log(`\nUsing current_position column:`);
  console.log(`  total: ${r2.length}  with_current_position: ${withCur.length}`);
  console.log(`  top3=${top3.length}  top10=${top10.length}  out10=${out10.length}  notRanking=${nr}`);
  console.log(`\nSample with position:`);
  for (const k of withCur.slice(0,10)) console.log(`  cur=${k.current_position}  pos=${k.position}  vol=${k.volume}  "${k.keyword?.slice(0,50)}"`);
}
