-- 043_widen_change_type_constraint.sql
--
-- CONTEXT
--   website-content-agent and several other agents produce change_type values
--   that are NOT in the existing allow-list defined in migration 036.
--   Examples observed in production:
--     - trust_signal         (Yaniv — "add award badges")
--     - layout_change        (homepage hero rearrangement)
--     - ui_copy              (button wording tweaks)
--     - hero_content         (hero section revisions)
--     - faq_section          (new FAQ schemas)
--     - cta_button           (primary CTA copy/style)
--     - product_section      (service-block layout proposals)
--     - meta_tag             (non-description meta additions — robots, viewport)
--     - resource_fix         (broken image / broken internal link)
--
--   These were silently rejected by proposed_changes_change_type_check,
--   manifesting to the user as "agent succeeded but produced 0 outputs."
--
-- FIX
--   Drop the old constraint and re-create it with the superset of all values
--   observed in real agent output, plus existing ones from migration 036.
--   This keeps the constraint as a guardrail against typos/random strings
--   while letting legitimate agent proposals persist.
--
--   The runtime tool layer (tools.js propose_website_change) gets a matching
--   coercion step so that any future unknown type falls back to 'body_content'
--   instead of blowing up the insert.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposed_changes_change_type_check') THEN
    ALTER TABLE proposed_changes DROP CONSTRAINT proposed_changes_change_type_check;
  END IF;

  ALTER TABLE proposed_changes ADD CONSTRAINT proposed_changes_change_type_check
    CHECK (change_type IN (
      -- original set (migration 036)
      'seo_title',
      'meta_description',
      'h1',
      'h2',
      'body_content',
      'schema_markup',
      'image_alt',
      'canonical_url',
      'redirect',
      'internal_link',
      'nav_label',
      'cta_text',
      'page_slug',
      'robots_txt',
      'social_post',
      'google_ads_change',
      'code_fix',
      -- additions from observed agent output
      'trust_signal',
      'layout_change',
      'ui_copy',
      'hero_content',
      'faq_section',
      'cta_button',
      'product_section',
      'meta_tag',
      'resource_fix',
      'image_replacement',
      'video_embed',
      'testimonial_section',
      'pricing_section',
      'contact_info',
      'footer_content',
      'header_content',
      'sidebar_content',
      'form_field',
      'link_target',
      'font_change',
      'color_scheme',
      'spacing_fix',
      'accessibility_fix',
      'performance_fix'
    ));
END $$;

-- Sanity log
DO $$
BEGIN
  RAISE NOTICE 'Migration 043 complete: proposed_changes_change_type_check now accepts % allowed values',
    (SELECT count(*) FROM unnest(ARRAY[
      'seo_title','meta_description','h1','h2','body_content','schema_markup','image_alt',
      'canonical_url','redirect','internal_link','nav_label','cta_text','page_slug','robots_txt',
      'social_post','google_ads_change','code_fix','trust_signal','layout_change','ui_copy',
      'hero_content','faq_section','cta_button','product_section','meta_tag','resource_fix',
      'image_replacement','video_embed','testimonial_section','pricing_section','contact_info',
      'footer_content','header_content','sidebar_content','form_field','link_target','font_change',
      'color_scheme','spacing_fix','accessibility_fix','performance_fix'
    ]));
END $$;
