-- ============================================================
-- 004: Priority Engine + Client Strategy + False Success Detection
-- ============================================================

-- Add priority_score (0-10 float) to run_queue for smart ordering
ALTER TABLE run_queue ADD COLUMN IF NOT EXISTS priority_score NUMERIC(4,2) DEFAULT NULL;

-- Index for priority-based queue processing
CREATE INDEX IF NOT EXISTS idx_run_queue_priority_score ON run_queue(priority_score DESC NULLS LAST, priority ASC, created_at ASC) WHERE status = 'queued';

-- Add strategy JSONB to client_rules for per-client goal/strategy context
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS strategy JSONB DEFAULT NULL;
COMMENT ON COLUMN client_rules.strategy IS 'Per-client strategy: primary_goal, secondary_goal, focus_keywords, focus_locations, authority_targets, conversion_targets';

-- Add false_success flag to runs
ALTER TABLE runs ADD COLUMN IF NOT EXISTS false_success BOOLEAN DEFAULT false;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS false_success_flags TEXT[] DEFAULT '{}';

-- KPI snapshots table for trend tracking (if not exists)
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value NUMERIC,
  source TEXT DEFAULT 'auto',
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_client_date ON kpi_snapshots(client_id, metric_name, snapshot_date DESC);

-- Unique constraint to prevent duplicate snapshots per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_snapshots_unique ON kpi_snapshots(client_id, metric_name, snapshot_date);

-- Add 'partial' status to runs for truth-gated downgrades
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE runs ADD CONSTRAINT runs_status_check CHECK (status IN ('running','success','partial','failed','pending_approval','dry_run','cancelled'));
