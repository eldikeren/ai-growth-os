-- ============================================================
-- AI GROWTH OS — VALIDATION GOVERNANCE MIGRATION
-- Post-change ownership tracking, action_type routing,
-- full validation lifecycle columns, and constraint updates.
-- ============================================================

-- ── 1. ADD GOVERNANCE COLUMNS TO runs ────────────────────────
ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS owner_agent_slug TEXT,
  ADD COLUMN IF NOT EXISTS action_type TEXT CHECK (action_type IN (
    'website_content_change','seo_metadata_change','schema_change','cta_change',
    'layout_change','review_reply','social_post','local_profile_change','generic_change'
  )),
  ADD COLUMN IF NOT EXISTS validation_required TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_completed TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS validation_failed_reasons JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS final_validation_status TEXT CHECK (
    final_validation_status IN ('pending','in_progress','passed','failed','partial')
  );

-- ── 2. UPDATE runs STATUS CONSTRAINT ─────────────────────────
-- Drop old constraint, re-add with new statuses
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE runs
  ADD CONSTRAINT runs_status_check CHECK (status IN (
    'running','success','failed','pending_approval','dry_run','cancelled',
    'executed_pending_validation','validation_failed'
  ));

-- ── 3. UPDATE run_queue STATUS CONSTRAINT ────────────────────
-- Drop old constraint, re-add with retry_scheduled + new governance statuses
ALTER TABLE run_queue DROP CONSTRAINT IF EXISTS run_queue_status_check;
ALTER TABLE run_queue
  ADD CONSTRAINT run_queue_status_check CHECK (status IN (
    'queued','running','executed','failed','blocked_dependency',
    'skipped_cooldown','cancelled','retry_scheduled',
    'executed_pending_validation','validation_failed'
  ));

-- ── 4. INDEXES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_runs_pending_validation
  ON runs(client_id, final_validation_status)
  WHERE status = 'executed_pending_validation';

CREATE INDEX IF NOT EXISTS idx_runs_owner_agent
  ON runs(owner_agent_slug)
  WHERE owner_agent_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_runs_action_type
  ON runs(action_type)
  WHERE action_type IS NOT NULL;
