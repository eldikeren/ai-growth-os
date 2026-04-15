// ============================================================
// DEPLOY HELPERS — shared by routes and self-heal cron
// ============================================================
// Why these live in functions/ rather than routes/:
//   The self-heal cron needs to auto-retry stuck approvals without
//   going through the HTTP layer. Extracting these helpers means both
//   the /proposed-changes/*/approve endpoints AND /cron/self-heal can
//   call the same code path, so approval → deploy is the same whether
//   it's triggered by a user click or by the orchestrator entity.

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// ─── Load the git config for a client (or null) ───
// Forces access_mode='branch_pr_and_merge' because approval IS consent to deploy.
export async function loadGitConfigForClient(clientId) {
  const { data: cw } = await supabase.from('client_websites')
    .select('id').eq('client_id', clientId).maybeSingle();
  if (!cw?.id) return null;
  const { data: gitConn } = await supabase.from('website_git_connections')
    .select('provider, repo_owner, repo_name, repo_url, production_branch, default_branch, access_mode')
    .eq('client_website_id', cw.id).maybeSingle();
  if (gitConn?.provider !== 'github') return null;
  return {
    repo_url: gitConn.repo_url || `https://github.com/${gitConn.repo_owner}/${gitConn.repo_name}`,
    repo_owner: gitConn.repo_owner,
    repo_name: gitConn.repo_name,
    default_branch: gitConn.production_branch || gitConn.default_branch || 'main',
    access_mode: 'branch_pr_and_merge',
  };
}

// ─── Run the github push for a change row ───
// Re-detects the git connection at execution time, so a change stored with
// platform='manual' still deploys if the client has a git conn NOW. Backfills
// platform='github' on success to keep the audit trail honest.
export async function pushChangeToGit(change) {
  const gitConfig = await loadGitConfigForClient(change.client_id);
  if (!gitConfig) {
    return { success: true, skipped: true, deployed: false, message: 'No GitHub connection for this client — manual apply required' };
  }
  const { executeGitHubChange } = await import('./tools.js');
  const executionResult = await executeGitHubChange(change.client_id, change, gitConfig);

  if (executionResult?.success) {
    await supabase.from('proposed_changes').update({
      status: 'executed',
      platform: 'github',
      platform_ref: executionResult.ref,
      executed_at: new Date().toISOString(),
      execution_result: executionResult,
    }).eq('id', change.id);
    return { success: true, executionResult, deployed: !!executionResult.merged };
  }
  await supabase.from('proposed_changes').update({ execution_result: executionResult }).eq('id', change.id);
  return { success: false, executionResult, deployed: false, error: executionResult?.error };
}

// ─── Approve a single change and deploy it ───
export async function approveAndDeployChange(changeId, approvedBy) {
  const { data: change, error } = await supabase.from('proposed_changes')
    .update({ status: 'approved', approved_by: approvedBy, approved_at: new Date().toISOString() })
    .eq('id', changeId).select().single();
  if (error) return { success: false, error: error.message };
  const pushResult = await pushChangeToGit(change);
  return { ...pushResult, change };
}

// ─── Deploy an already-approved change (idempotent retry) ───
export async function deployApprovedChange(changeId) {
  const { data: change, error } = await supabase.from('proposed_changes')
    .select('*').eq('id', changeId).single();
  if (error) return { success: false, error: error.message };
  if (change.status === 'executed') {
    return { success: true, change, deployed: true, skipped: true, message: 'Already executed' };
  }
  if (change.status !== 'approved') {
    return { success: false, change, error: `Cannot deploy change in status '${change.status}'` };
  }
  const pushResult = await pushChangeToGit(change);
  return { ...pushResult, change };
}
