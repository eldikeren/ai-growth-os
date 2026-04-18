-- ─────────────────────────────────────────────────────────────────────────────
-- client_metrics — time-series metric storage for agent tools
--
-- Referenced by:
--   backend/src/functions/tools.js query_metrics (read)
--   backend/src/functions/tools.js store_metric  (write)
--
-- These are exposed to agents as OpenAI-function-calling tools. Without this
-- table, every store_metric call errors silently and query_metrics returns
-- an empty set, so agents have no historical metric context.
--
-- Distinct from `baselines` which is the *canonical latest* KPI value per
-- client (one row per metric_name per client). client_metrics is the
-- time-series history agents use to see trend / prior values.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_metrics (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  metric_name     TEXT        NOT NULL,
  metric_value    NUMERIC,
  source          TEXT,
  details         JSONB       DEFAULT '{}',
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_metrics_lookup
  ON client_metrics(client_id, metric_name, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_metrics_recent
  ON client_metrics(recorded_at DESC);
