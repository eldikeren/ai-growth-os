-- ============================================================
-- 034: BRAND ALIASES
-- Add brand_aliases column to clients for Hebrew/Arabic/other
-- script brand names that can't be derived from the Latin domain.
-- Re-runs the brand flagging with these aliases included.
-- ============================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS brand_aliases TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Seed known clients with their Hebrew brand aliases
UPDATE clients
SET brand_aliases = ARRAY['יניב גיל', 'גיל יניב', 'יניב', 'גיל', 'yanivgil']
WHERE name ILIKE '%yaniv%' OR domain ILIKE '%yanivgil%';

UPDATE clients
SET brand_aliases = ARRAY['הומי', 'הומיי', 'homie', 'homie finance', 'homie-finance']
WHERE name ILIKE '%homie%' OR domain ILIKE '%homie%';

-- Re-run brand flagging using BOTH Latin and Hebrew aliases
WITH brand_terms AS (
  -- Latin tokens from clients.name
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
  -- Domain stem
  SELECT c.id, lower(split_part(regexp_replace(c.domain, '^(https?://)?(www\.)?', ''), '.', 1))
  FROM clients c
  WHERE c.domain IS NOT NULL
    AND length(split_part(regexp_replace(c.domain, '^(https?://)?(www\.)?', ''), '.', 1)) > 2
  UNION
  -- Hebrew and other-script aliases
  SELECT c.id, lower(alias)
  FROM clients c, unnest(c.brand_aliases) AS alias
  WHERE length(alias) > 1
)
UPDATE client_keywords ck
SET is_brand = true
FROM brand_terms bt
WHERE ck.client_id = bt.client_id
  AND length(ck.keyword) < 60
  AND lower(ck.keyword) LIKE '%' || bt.token || '%';

-- Report
DO $$
DECLARE brand_count INT; pos1_3_brand INT; pos1_3_real INT;
BEGIN
  SELECT count(*) INTO brand_count FROM client_keywords WHERE is_brand = true;
  SELECT count(*) INTO pos1_3_brand FROM client_keywords WHERE is_brand = true AND current_position <= 3;
  SELECT count(*) INTO pos1_3_real FROM client_keywords WHERE is_brand = false AND keyword_language = 'he' AND current_position <= 3;
  RAISE NOTICE 'Brand flagged: %; Top-3 brand: %; Top-3 REAL Hebrew non-brand: %', brand_count, pos1_3_brand, pos1_3_real;
END $$;
