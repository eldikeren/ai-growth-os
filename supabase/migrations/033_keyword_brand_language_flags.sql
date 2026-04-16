-- ============================================================
-- 033: KEYWORD QUALITY FLAGS
-- Add is_brand and keyword_language flags to client_keywords so
-- brand terms (e.g. "יניב גיל" for yanivgil.co.il) and wrong-
-- language keywords (e.g. "legal guardian" on a Hebrew site) can
-- be excluded from Top-3 wins and other displays.
-- ============================================================

ALTER TABLE client_keywords
  ADD COLUMN IF NOT EXISTS is_brand BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS keyword_language TEXT;

-- Backfill: detect Hebrew characters to populate keyword_language
UPDATE client_keywords
SET keyword_language = CASE
  WHEN keyword ~ '[\u0590-\u05FF]' THEN 'he'
  WHEN keyword ~ '[a-zA-Z]' THEN 'en'
  ELSE NULL
END
WHERE keyword_language IS NULL;

-- Backfill: mark brand terms. A keyword is considered "brand" when
-- it contains a token derived from the client's name or domain.
--
-- We build brand_tokens per client from:
--   - tokens of clients.name (lowercased, strip common stopwords)
--   - the domain stem (e.g. "yanivgil" from "yanivgil.co.il")
-- and flag any client_keywords row where the keyword (lowercased,
-- trimmed) contains any token longer than 2 chars.
WITH brand_terms AS (
  SELECT
    c.id AS client_id,
    lower(token) AS token
  FROM clients c,
       regexp_split_to_table(
         regexp_replace(
           regexp_replace(lower(c.name), '\m(law firm|law office|finance|consulting|agency|group|ltd|inc|llc|corp)\M', '', 'g'),
           '[^a-z0-9\u0590-\u05FF ]', ' ', 'g'
         ),
         '\s+'
       ) AS token
  WHERE length(token) > 2
  UNION
  SELECT
    c.id AS client_id,
    lower(split_part(regexp_replace(c.domain, '^(https?://)?(www\.)?', ''), '.', 1)) AS token
  FROM clients c
  WHERE c.domain IS NOT NULL
    AND length(split_part(regexp_replace(c.domain, '^(https?://)?(www\.)?', ''), '.', 1)) > 2
)
UPDATE client_keywords ck
SET is_brand = true
FROM brand_terms bt
WHERE ck.client_id = bt.client_id
  AND length(ck.keyword) < 60
  AND lower(ck.keyword) LIKE '%' || bt.token || '%';

-- Report what got flagged
DO $$
DECLARE
  brand_count INT;
  lang_he_count INT;
  lang_en_count INT;
BEGIN
  SELECT count(*) INTO brand_count FROM client_keywords WHERE is_brand = true;
  SELECT count(*) INTO lang_he_count FROM client_keywords WHERE keyword_language = 'he';
  SELECT count(*) INTO lang_en_count FROM client_keywords WHERE keyword_language = 'en';
  RAISE NOTICE 'Flagged % brand keywords, % Hebrew keywords, % English keywords', brand_count, lang_he_count, lang_en_count;
END $$;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_client_keywords_quality
  ON client_keywords (client_id, is_brand, keyword_language);
