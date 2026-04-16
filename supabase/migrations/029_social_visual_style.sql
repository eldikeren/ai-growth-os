-- ============================================================
-- 029: SOCIAL VISUAL STYLE — Brand visual preferences for AI posts
-- ============================================================

ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS social_visual_style JSONB DEFAULT '{}'::jsonb;
-- Structure: {
--   "image_style": "professional_photo|illustration|minimalist|meme|branded|realistic|artistic",
--   "color_palette": ["#hex1", "#hex2"],
--   "include_logo": true/false,
--   "logo_url": "https://...",
--   "mood": "professional|friendly|playful|serious|inspiring|warm",
--   "avoid": ["text on images", "stock photos"],
--   "custom_instructions": "Always use blue tones, include scales of justice imagery"
-- }

COMMENT ON COLUMN client_profiles.social_visual_style IS 'Brand visual preferences for AI-generated social media images: style, colors, mood, logo settings, custom instructions';
