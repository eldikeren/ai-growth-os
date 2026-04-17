-- Per-URL GSC URL Inspection diagnostics.
-- Populated by scripts/gscBatchInspect.mjs (and eventually the technical-seo
-- agent's Phase 6 indexing repair). One row per (client_id, url).
--
-- This answers the question "why isn't this page indexed?" without the user
-- needing to log into Search Console.

CREATE TABLE IF NOT EXISTS gsc_diagnostics (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  url                  TEXT        NOT NULL,
  verdict              TEXT,            -- PASS | FAIL | NEUTRAL
  coverage_state       TEXT,            -- "Submitted and indexed", "Discovered - currently not indexed", etc.
  indexing_state       TEXT,            -- INDEXING_ALLOWED | BLOCKED_BY_META_TAG | ...
  robots_txt_state     TEXT,            -- ALLOWED | DISALLOWED | ...
  page_fetch_state     TEXT,            -- SUCCESSFUL | REDIRECT_ERROR | NOT_FOUND | ...
  last_crawl_time      TIMESTAMPTZ,     -- null / epoch means never crawled
  in_sitemap           BOOLEAN,
  user_canonical       TEXT,
  google_canonical     TEXT,
  referring_urls_count INTEGER,
  inspected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, url)
);

CREATE INDEX IF NOT EXISTS idx_gsc_diag_client_coverage
  ON gsc_diagnostics(client_id, coverage_state);
CREATE INDEX IF NOT EXISTS idx_gsc_diag_inspected
  ON gsc_diagnostics(inspected_at DESC);
