-- ============================================================
-- 037: MANUS VISUAL VERIFICATION TASK TYPE
-- Adds a specific task type that uses Manus to visit a public URL
-- and extract a named metric. Results feed back into baselines
-- with source='manus_visual_verification' — the highest trust
-- tier for external metrics since it's ground-truth scraping.
-- ============================================================

-- Allow the new task type in browser_tasks
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'browser_tasks_task_type_check') THEN
    ALTER TABLE browser_tasks DROP CONSTRAINT browser_tasks_task_type_check;
  END IF;
  -- Either add the constraint with the new value, or leave unconstrained if none existed
  BEGIN
    ALTER TABLE browser_tasks ADD CONSTRAINT browser_tasks_task_type_check
      CHECK (task_type IN (
        'social_post','review_reply','gbp_update','directory_submission',
        'content_distribution','competitor_research','form_submission',
        'visual_verify_metric','page_scan','custom'
      ));
  EXCEPTION WHEN others THEN
    -- Column may not have enforced check before; just continue
    NULL;
  END;
END $$;

-- Track which metric a visual verify task is verifying, so we can write
-- the result back into baselines automatically when the task completes.
ALTER TABLE browser_tasks
  ADD COLUMN IF NOT EXISTS verify_metric_name TEXT,
  ADD COLUMN IF NOT EXISTS verify_expected_value TEXT,
  ADD COLUMN IF NOT EXISTS verify_extracted_value TEXT,
  ADD COLUMN IF NOT EXISTS verify_matches BOOLEAN;

CREATE INDEX IF NOT EXISTS idx_browser_tasks_verify
  ON browser_tasks (client_id, verify_metric_name, status);

COMMENT ON COLUMN browser_tasks.verify_metric_name IS 'When task_type=visual_verify_metric, the metric_name this task verifies. Result auto-updates baselines row.';
