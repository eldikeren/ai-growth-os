-- Fix backlinks unique constraint to allow multiple backlinks from
-- the same domain to the same target (different source_url pages).
-- The old constraint on (client_id, source_domain, target_url) was
-- too restrictive — e.g. 3 different TheMarker articles linking to
-- the same client site should all be stored.

ALTER TABLE backlinks DROP CONSTRAINT IF EXISTS backlinks_client_id_source_domain_target_url_key;
ALTER TABLE backlinks DROP CONSTRAINT IF EXISTS backlinks_client_source_target_unique;

ALTER TABLE backlinks ADD CONSTRAINT backlinks_client_source_url_target_unique
  UNIQUE (client_id, source_url, target_url);
