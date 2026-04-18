import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  'https://gkzusfigajwcsfhhkvbs.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdrenVzZmlnYWp3Y3NmaGhrdmJzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTE5ODI3OCwiZXhwIjoyMDkwNzc0Mjc4fQ.izqZCav4GCbMDvbCVPm-lN5HCgjA7G_QjZyJRwlh-ws'
);

// Broader: fetch all approved, unexecuted
const { data: stuck, error } = await supabase
  .from('proposed_changes')
  .select('id, client_id, status, change_type, page_url, approved_at, executed_at, platform, platform_ref, execution_result, agent_slug, created_at, clients(name)')
  .eq('status', 'approved')
  .is('executed_at', null)
  .order('approved_at', { ascending: false });

console.log(`\n=== STUCK APPROVED CHANGES: ${stuck?.length || 0} ===\n`);
if (error) { console.error('ERR:', error); process.exit(1); }

for (const s of stuck || []) {
  console.log(`id:            ${s.id}`);
  console.log(`client:        ${s.clients?.name}  (${s.client_id})`);
  console.log(`agent_slug:    ${s.agent_slug}`);
  console.log(`change_type:   ${s.change_type}`);
  console.log(`page_url:      ${s.page_url}`);
  console.log(`created_at:    ${s.created_at}`);
  console.log(`approved_at:   ${s.approved_at}`);
  console.log(`platform:      ${s.platform}`);
  console.log(`platform_ref:  ${s.platform_ref}`);
  console.log(`execution_result:`, JSON.stringify(s.execution_result, null, 2));
  console.log('');
}

// Git config for each stuck client (unique client ids)
const uniqClients = [...new Set((stuck || []).map(s => s.client_id))];
for (const cid of uniqClients) {
  const { data: cw } = await supabase.from('client_websites')
    .select('id').eq('client_id', cid).maybeSingle();
  if (!cw?.id) { console.log(`NO client_websites row for client=${cid}`); continue; }
  const { data: git } = await supabase.from('website_git_connections')
    .select('provider, repo_owner, repo_name, repo_url, production_branch, default_branch, access_mode, installation_id')
    .eq('client_website_id', cw.id).maybeSingle();
  const { data: prof } = await supabase.from('website_access_profiles')
    .select('current_access_level').eq('client_website_id', cw.id).maybeSingle();

  console.log(`GIT config for client ${cid}:`);
  console.log(`  client_websites.id:   ${cw.id}`);
  console.log(`  git connection:       ${git ? JSON.stringify(git, null, 2) : 'NULL'}`);
  console.log(`  access profile level: ${prof?.current_access_level || 'NULL'}`);
  console.log('');
}
