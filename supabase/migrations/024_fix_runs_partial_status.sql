-- Fix: truthGate was setting status to 'partial' but it wasn't in the CHECK constraint,
-- causing all agent run DB updates to silently fail. Runs got stuck in 'running' forever.
ALTER TABLE runs DROP CONSTRAINT IF EXISTS runs_status_check;
ALTER TABLE runs ADD CONSTRAINT runs_status_check CHECK (
  status = ANY (ARRAY[
    'running', 'success', 'failed', 'pending_approval', 'dry_run',
    'cancelled', 'executed_pending_validation', 'validation_failed', 'partial'
  ])
);
