-- ============================================================
-- 030: DEDUP PROPOSED CHANGES — Remove duplicate proposals
-- ============================================================

-- For executed changes: keep the most recent per (client_id, change_type, normalized page)
-- Mark older duplicates as 'cancelled'
WITH ranked AS (
  SELECT id,
         client_id,
         page_url,
         change_type,
         status,
         ROW_NUMBER() OVER (
           PARTITION BY client_id, change_type,
             regexp_replace(regexp_replace(page_url, '^https?://www\.', 'https://'), '/+$', '')
           ORDER BY created_at DESC
         ) AS rn
  FROM proposed_changes
  WHERE status IN ('proposed', 'executed')
)
UPDATE proposed_changes
SET status = 'cancelled', rejected_reason = 'Auto-deduped: duplicate of newer proposal'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Also normalize all existing URLs (remove www, trailing slash)
UPDATE proposed_changes
SET page_url = regexp_replace(
  regexp_replace(page_url, '^(https?://)www\.', '\1'),
  '([^/])/+$', '\1'
)
WHERE page_url ~ '^https?://www\.' OR (page_url ~ '/.+/$' AND page_url != '/');

-- Add a unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_proposed_changes_dedup
ON proposed_changes (client_id, change_type, page_url)
WHERE status IN ('proposed', 'approved');
