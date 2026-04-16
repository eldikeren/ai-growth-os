-- ============================================================
-- Migration 023: Global system_settings key/value store
-- ============================================================
-- Used for server-side secrets and config that are NOT per-client
-- (e.g., GOOGLE_ADS_DEVELOPER_TOKEN). Values inserted via one-off
-- admin SQL, NEVER committed to git.
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
  key         text        PRIMARY KEY,
  value       text,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Row-level security — service_role only (service key bypasses RLS anyway)
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
