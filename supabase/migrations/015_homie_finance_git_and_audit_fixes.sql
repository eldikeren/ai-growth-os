-- ============================================================
-- 015: Homie-Finance git setup + audit blocker fixes
--      1. Set git connection for Homie-Finance (eldikeren/Homie-Finance)
--      2. Set website_access_level in client_rules for T24
--      3. Set post_change_trigger on agents that need it (T9 verify)
--      4. Queue master-orchestrator for Homie-Finance (T5)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. HOMIE-FINANCE GIT CONNECTION
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_website_id UUID;
BEGIN
  SELECT id INTO v_website_id
  FROM client_websites
  WHERE client_id = '528107d8-6b18-4675-8469-32e648589614'
  LIMIT 1;

  IF v_website_id IS NOT NULL THEN
    -- Git connection
    INSERT INTO website_git_connections (
      client_website_id, provider, repo_owner, repo_name,
      repo_url, production_branch, access_mode, connection_status
    ) VALUES (
      v_website_id, 'github', 'eldikeren', 'Homie-Finance',
      'https://github.com/eldikeren/Homie-Finance',
      'main', 'branch_and_pr', 'untested'
    )
    ON CONFLICT (client_website_id) DO UPDATE SET
      provider            = 'github',
      repo_owner          = 'eldikeren',
      repo_name           = 'Homie-Finance',
      repo_url            = 'https://github.com/eldikeren/Homie-Finance',
      production_branch   = 'main',
      access_mode         = 'branch_and_pr',
      connection_status   = 'untested';

    -- Access profile: mark git as enabled + using global token
    INSERT INTO website_access_profiles (
      client_website_id, git_access_enabled, has_git_token, current_access_level
    ) VALUES (
      v_website_id, true, true, 'git_edit'
    )
    ON CONFLICT (client_website_id) DO UPDATE SET
      git_access_enabled  = true,
      has_git_token       = true,
      current_access_level = 'git_edit';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. T24: SET website_access_level IN client_rules
--    Stored in auth_model JSONB (no dedicated column exists)
-- ────────────────────────────────────────────────────────────
UPDATE client_rules
SET auth_model = COALESCE(auth_model, '{}') || '{"website_access_level": "read_write"}'::jsonb
WHERE auth_model->>'website_access_level' IS NULL
   OR auth_model->>'website_access_level' = '';

-- ────────────────────────────────────────────────────────────
-- 3. T9: ENSURE post_change_trigger = true ON CHANGE AGENTS
-- ────────────────────────────────────────────────────────────
UPDATE agent_templates
SET post_change_trigger = true
WHERE slug IN (
  'seo-core-agent',
  'technical-seo-crawl-agent',
  'website-content-agent',
  'local-seo-agent',
  'reviews-gbp-authority-agent',
  'cro-agent',
  'design-consistency-agent',
  'legal-agent'
)
AND post_change_trigger IS DISTINCT FROM true;

-- ────────────────────────────────────────────────────────────
-- 4. T5: QUEUE MASTER-ORCHESTRATOR FOR HOMIE-FINANCE
--    (so it runs once and starts coordinating agents)
-- ────────────────────────────────────────────────────────────
INSERT INTO run_queue (client_id, agent_template_id, priority_score, status, max_retries, task_payload)
SELECT
  '528107d8-6b18-4675-8469-32e648589614',
  at.id,
  9.5,
  'queued',
  1,
  '{"triggered_by": "admin_migration", "reason": "Initial orchestration run for Homie-Finance"}'::jsonb
FROM agent_templates at
WHERE at.slug = 'master-orchestrator'
  AND NOT EXISTS (
    SELECT 1 FROM run_queue rq
    JOIN agent_templates a ON a.id = rq.agent_template_id
    WHERE rq.client_id = '528107d8-6b18-4675-8469-32e648589614'
      AND a.slug = 'master-orchestrator'
      AND rq.status IN ('queued', 'running')
  );

-- ────────────────────────────────────────────────────────────
-- 5. VERIFY
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM website_git_connections wgc
   JOIN client_websites cw ON cw.id = wgc.client_website_id
   WHERE cw.client_id = '528107d8-6b18-4675-8469-32e648589614') AS homie_git_set,
  (SELECT COUNT(*) FROM client_rules WHERE auth_model->>'website_access_level' IS NOT NULL) AS rules_with_access_level,
  (SELECT COUNT(*) FROM agent_templates WHERE post_change_trigger = true) AS agents_with_trigger,
  (SELECT COUNT(*) FROM run_queue rq
   JOIN agent_templates at ON at.id = rq.agent_template_id
   WHERE rq.client_id = '528107d8-6b18-4675-8469-32e648589614'
     AND at.slug = 'master-orchestrator' AND rq.status = 'queued') AS orchestrator_queued;
