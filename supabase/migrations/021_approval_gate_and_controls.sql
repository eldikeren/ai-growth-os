-- ============================================================
-- 021: Approval gate + per-agent and per-client action mode controls
--
-- Before: agents in "autonomous" mode immediately pushed code via
-- propose_website_change and auto-merged. User had no gate.
--
-- After: agents default to "approve_then_act". Changes are stored
-- as "proposed" and wait for user approval. Per-client overrides
-- let the user opt specific agents into "autonomous" once they
-- trust them, or "report_only" to fully disable writes.
-- ============================================================

-- 1. Default all write-capable agents to approve_then_act
UPDATE agent_templates SET action_mode_default = 'approve_then_act'
WHERE slug IN (
  'technical-seo-crawl-agent', 'seo-core-agent', 'website-content-agent',
  'cro-agent', 'design-consistency-agent', 'local-seo-agent',
  'reviews-gbp-authority-agent', 'legal-agent', 'facebook-agent',
  'instagram-agent', 'content-distribution-agent', 'google-ads-campaign-agent',
  'regression-agent'
);

-- 2. Add client-level override column
-- JSONB: {"agent-slug": "autonomous" | "approve_then_act" | "report_only"}
ALTER TABLE client_rules
  ADD COLUMN IF NOT EXISTS action_mode_overrides JSONB DEFAULT '{}'::jsonb;

-- 3. Re-enable the 3 SEO agents we paused earlier — they are now safe
UPDATE agent_templates SET is_active = true
WHERE slug IN ('technical-seo-crawl-agent', 'seo-core-agent', 'website-content-agent');

-- 4. Also set Facebook, Instagram, Google Ads agents to approve_then_act
--    and enable them so they run (in safe mode)
UPDATE agent_templates
SET action_mode_default = 'approve_then_act', is_active = true
WHERE slug IN ('facebook-agent', 'instagram-agent', 'google-ads-campaign-agent');

-- 5. Pending changes from the 48h backlog are ALREADY either merged (done)
--    or stored as 'proposed' (awaiting review). No cleanup needed here.
--    User can review them in the new ProposedChangesView.

-- Verify
SELECT slug, is_active, action_mode_default, lane
FROM agent_templates
WHERE slug IN (
  'technical-seo-crawl-agent', 'seo-core-agent', 'website-content-agent',
  'reviews-gbp-authority-agent', 'facebook-agent', 'instagram-agent',
  'google-ads-campaign-agent'
)
ORDER BY lane, slug;
