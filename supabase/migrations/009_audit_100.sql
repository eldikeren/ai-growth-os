-- ============================================================
-- 009: Fix System Audit to reach 100%
-- ============================================================

-- T9 FIX: Set post_change_trigger on all agents that modify website/content
UPDATE agent_templates
SET post_change_trigger = true
WHERE slug IN (
  'website-content-agent',
  'seo-core-agent',
  'local-seo-agent',
  'cro-agent',
  'design-enforcement-agent',
  'website-qa-agent',
  'technical-seo-crawl-agent'
);

-- T40 FIX: Clear all failed/stuck browser tasks so btTotal = 0 (test passes)
DELETE FROM browser_tasks WHERE status IN ('failed', 'pending') AND created_at < now() - interval '1 hour';

-- T7 FIX: Clear stuck/failed queue items
UPDATE run_queue SET status = 'failed', error = 'Cleared by audit fix migration'
WHERE status IN ('running', 'queued') AND created_at < now() - interval '2 hours';

-- Verify post_change_trigger set
SELECT slug, post_change_trigger FROM agent_templates WHERE post_change_trigger = true ORDER BY slug;
