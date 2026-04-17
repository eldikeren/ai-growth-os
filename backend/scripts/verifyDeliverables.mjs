import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = 'https://gkzusfigajwcsfhhkvbs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const YANIV = '00000000-0000-0000-0000-000000000001';

const { data: socialPosts } = await supabase
  .from('social_posts')
  .select('id, title, platform, post_type, status, created_by, created_at')
  .eq('client_id', YANIV)
  .eq('ai_generated', true)
  .order('created_at', { ascending: false })
  .limit(50);

console.log(`Social posts (Yaniv, AI-generated): ${socialPosts?.length || 0}`);
for (const p of (socialPosts || []).slice(0, 10)) {
  console.log(`  [${p.platform}] "${p.title?.slice(0, 60)}" status=${p.status}`);
}

const { data: creatives } = await supabase
  .from('campaign_creatives')
  .select('id, campaign_id, headline, format, status, image_url, created_at')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false })
  .limit(50);

console.log(`\nCampaign creatives (Yaniv): ${creatives?.length || 0}`);
for (const c of (creatives || []).slice(0, 10)) {
  console.log(`  [${c.format}] "${c.headline?.slice(0, 60)}" image=${c.image_url ? 'yes' : 'no'}`);
}

const { data: campaigns } = await supabase
  .from('campaigns')
  .select('id, name, status, platforms, created_by, created_at')
  .eq('client_id', YANIV)
  .order('created_at', { ascending: false });

console.log(`\nCampaigns (Yaniv): ${campaigns?.length || 0}`);
for (const c of (campaigns || [])) {
  console.log(`  "${c.name}" status=${c.status} platforms=${JSON.stringify(c.platforms)}`);
}
