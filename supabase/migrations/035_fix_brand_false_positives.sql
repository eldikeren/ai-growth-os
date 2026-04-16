-- ============================================================
-- 035: Fix brand alias false positives
-- Standalone "גיל" (means "age" in Hebrew) was catching unrelated
-- keywords. Require the compound form "יניב גיל" or "גיל יניב".
-- ============================================================

-- Remove single-token aliases that could false-match
UPDATE clients
SET brand_aliases = ARRAY['יניב גיל', 'גיל יניב', 'yanivgil', 'yaniv gil']
WHERE name ILIKE '%yaniv%';

-- Clear existing is_brand flags and recompute
UPDATE client_keywords SET is_brand = false;

-- Re-run with corrected aliases
WITH brand_terms AS (
  SELECT c.id AS client_id, lower(token) AS token
  FROM clients c,
       regexp_split_to_table(
         regexp_replace(
           regexp_replace(lower(c.name), '\m(law firm|law office|finance|consulting|agency|group|ltd|inc|llc|corp)\M', '', 'g'),
           '[^a-z0-9 ]', ' ', 'g'
         ),
         '\s+'
       ) AS token
  WHERE length(token) > 2
  UNION
  SELECT c.id, lower(split_part(regexp_replace(c.domain, '^(https?://)?(www\.)?', ''), '.', 1))
  FROM clients c
  WHERE c.domain IS NOT NULL
    AND length(split_part(regexp_replace(c.domain, '^(https?://)?(www\.)?', ''), '.', 1)) > 2
  UNION
  SELECT c.id, lower(alias)
  FROM clients c, unnest(c.brand_aliases) AS alias
  WHERE length(alias) > 2
)
UPDATE client_keywords ck
SET is_brand = true
FROM brand_terms bt
WHERE ck.client_id = bt.client_id
  AND length(ck.keyword) < 60
  AND lower(ck.keyword) LIKE '%' || bt.token || '%';
