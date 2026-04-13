-- ============================================================
-- AI GROWTH OS — ADD updated_at TO runs TABLE
-- Required for zombie reaper to correctly identify stale runs
-- vs. actively-running agents (heartbeat via updated_at).
-- ============================================================

ALTER TABLE runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Back-fill: set updated_at = completed_at for finished runs, else created_at
UPDATE runs SET updated_at = COALESCE(completed_at, created_at) WHERE updated_at IS NULL;

-- Trigger to auto-update on every row update
CREATE OR REPLACE FUNCTION update_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_runs_updated_at ON runs;
CREATE TRIGGER trg_runs_updated_at
  BEFORE UPDATE ON runs
  FOR EACH ROW EXECUTE FUNCTION update_runs_updated_at();

-- Index for the zombie reaper query
CREATE INDEX IF NOT EXISTS idx_runs_zombie_reaper
  ON runs(status, updated_at)
  WHERE status = 'running';
