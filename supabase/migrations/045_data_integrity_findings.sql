-- Data Integrity Findings: a unified log of cross-table contradictions
-- Populated by the dataIntegrityAudit on every self-heal cycle (~5 min).
-- Rules that are safe to auto-apply write finding with auto_fixed=true.
-- Rules that need a human decision write status='open' and wait for a
-- "Fix" or "Dismiss" click in the Data Health view.

CREATE TABLE IF NOT EXISTS data_integrity_findings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID        REFERENCES clients(id) ON DELETE CASCADE,
  rule_id       TEXT        NOT NULL,
  rule_label    TEXT        NOT NULL,
  severity      TEXT        NOT NULL CHECK (severity IN ('info','warn','error','critical')),
  table_name    TEXT,
  row_count     INT         NOT NULL DEFAULT 0,
  sample        JSONB       DEFAULT '[]',
  description   TEXT,
  auto_fixable  BOOLEAN     NOT NULL DEFAULT false,
  auto_fixed    BOOLEAN     NOT NULL DEFAULT false,
  fixed_at      TIMESTAMPTZ,
  status        TEXT        NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','fixed','dismissed','stale')),
  dismissed_reason TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_count     INT         NOT NULL DEFAULT 1,
  UNIQUE (client_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_dif_client_status
  ON data_integrity_findings(client_id, status);
CREATE INDEX IF NOT EXISTS idx_dif_severity
  ON data_integrity_findings(severity, status);
CREATE INDEX IF NOT EXISTS idx_dif_last_seen
  ON data_integrity_findings(last_seen_at DESC);
