-- ============================================================
-- 032: MISSION CONTROL — Agent events log for live visualization
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_slug  TEXT        NOT NULL,
  agent_name  TEXT        NOT NULL,
  lane        TEXT,
  event_type  TEXT        NOT NULL CHECK (event_type IN (
    'started', 'completed', 'failed', 'queued', 'blocked',
    'reporting', 'validating', 'retrying', 'tool_call', 'approved'
  )),
  run_id      UUID        REFERENCES runs(id) ON DELETE SET NULL,
  message     TEXT,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_events_client_recent
  ON agent_events(client_id, created_at DESC);

CREATE INDEX idx_agent_events_expire
  ON agent_events(created_at);

COMMENT ON TABLE agent_events IS 'Append-only event log for Mission Control live visualization. Events auto-expire after 7 days.';
