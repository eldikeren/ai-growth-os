-- ============================================================
-- Migration 007: Proposed Website Changes
-- Generic website action layer for AI SEO platform.
-- Works for any client platform: GitHub, WordPress, Wix,
-- Webflow, Shopify, or manual.
-- ============================================================

CREATE TABLE IF NOT EXISTS proposed_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  agent_slug TEXT NOT NULL,

  -- What to change
  page_url TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'seo_title','meta_description','h1','h2','body_content',
    'schema_markup','image_alt','canonical_url','redirect',
    'internal_link','nav_label','cta_text','page_slug','robots_txt'
  )),
  current_value TEXT,
  proposed_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),

  -- Platform routing
  platform TEXT,              -- github/wordpress/wix/webflow/shopify/manual
  platform_ref TEXT,          -- PR URL, post ID, page ID etc once executed

  -- Status lifecycle
  status TEXT DEFAULT 'proposed' CHECK (status IN (
    'proposed','approved','rejected','executing','executed','failed','cancelled'
  )),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  executed_at TIMESTAMPTZ,
  execution_error TEXT,
  execution_result JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposed_changes_client ON proposed_changes(client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposed_changes_run ON proposed_changes(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposed_changes_status ON proposed_changes(status) WHERE status IN ('proposed','approved','executing');
