-- ============================================================
-- 026: CAMPAIGN CAROUSEL & AUDIENCE TARGETING ENHANCEMENTS
-- Adds multi-image carousel support and richer targeting schema
-- ============================================================

-- ── Add carousel fields to campaign_creatives ───────────────
ALTER TABLE campaign_creatives
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'single_image'
    CHECK (format IN ('single_image', 'carousel', 'video')),
  ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
  -- images: [{ url, storage_path, headline, description, destination_url }]
  -- For carousel: each item is a card; for single_image: array of 0-1 items (backward compat with image_url)

-- ── Update targeting JSONB comment/structure ────────────────
-- The campaigns.targeting JSONB now supports:
-- {
--   geo_locations: {
--     countries: ["IL"],
--     cities: [{ key: "123", name: "Tel Aviv", region: "Tel Aviv District", country: "IL" }],
--     regions: [{ key: "456", name: "Center District" }]
--   },
--   age_min: 18,
--   age_max: 65,
--   gender: "all" | "male" | "female",
--   interests: [{ id: "123", name: "Finance" }],
--   behaviors: [{ id: "456", name: "Small business owners" }],
--   custom_audiences: [{ id: "789", name: "Website Visitors" }],
--   excluded_custom_audiences: [{ id: "012", name: "Already Purchased" }],
--   lookalike_audiences: [{ id: "345", name: "Lookalike 1%" }],
--   placements: {
--     automatic: true,
--     -- OR manual:
--     publisher_platforms: ["facebook", "instagram"],
--     facebook_positions: ["feed", "right_hand_column", "marketplace", "video_feeds", "story", "reels"],
--     instagram_positions: ["stream", "story", "explore", "reels"]
--   },
--   languages: [{ key: 13, name: "Hebrew" }, { key: 6, name: "English" }],
--   excluded_geo_locations: { countries: [], cities: [] }
-- }
COMMENT ON COLUMN campaigns.targeting IS 'Rich targeting JSONB: geo_locations, age, gender, interests, behaviors, custom_audiences, placements, languages';
