-- ============================================================
-- 040: GT3 (Go To Top 3) ENGINE — PHASE 1 SCHEMA
--
-- This is the foundation for a business-intelligence engine that
-- scores every keyword against the client's actual business
-- (services, location, conversions, business type) and decides
-- which of 5 channels (SEO, Local, Google Ads, Meta, Social)
-- should serve each keyword, with what role, and with what KPI.
--
-- No code reads from these tables yet — this migration only
-- creates the foundation. Phase 2 adds the scoring engine,
-- Phase 3 adds the pipeline services.
--
-- Note: we use "customers" instead of re-purposing "clients" so
-- the old and new models can coexist during the transition week.
-- A view "v_customers_from_clients" backfills from clients.
-- ============================================================

-- ─── CUSTOMERS (new GT3 model) ──────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text NOT NULL,
  primary_language text NOT NULL DEFAULT 'he',
  country text DEFAULT 'IL',
  business_type text NOT NULL DEFAULT 'custom'
    CHECK (business_type IN (
      'lawyer', 'plumber', 'musician', 'babysitter', 'therapist',
      'dentist', 'realtor', 'consultant', 'ecommerce', 'restaurant',
      'electrician', 'locksmith', 'medical_clinic', 'custom'
    )),
  business_model text NOT NULL DEFAULT 'local_lead_gen'
    CHECK (business_model IN (
      'local_lead_gen', 'national_lead_gen', 'ecommerce',
      'personal_brand', 'bookings', 'subscriptions', 'marketplace'
    )),
  is_local_business boolean NOT NULL DEFAULT true,
  lifecycle_stage text NOT NULL DEFAULT 'stage_1'
    CHECK (lifecycle_stage IN ('stage_1', 'stage_2', 'stage_3')),
  brand_strength_score numeric(5,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain)
);
CREATE INDEX IF NOT EXISTS idx_gt3_customers_legacy ON gt3_customers (legacy_client_id);
CREATE INDEX IF NOT EXISTS idx_gt3_customers_type ON gt3_customers (business_type);

-- ─── CUSTOMER LOCATIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_customer_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  country text DEFAULT 'IL',
  region text,
  city text NOT NULL,
  area_label text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, city, area_label)
);
CREATE INDEX IF NOT EXISTS idx_gt3_locations_customer ON gt3_customer_locations (customer_id);

-- ─── CUSTOMER CONVERSIONS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_customer_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  conversion_type text NOT NULL
    CHECK (conversion_type IN (
      'phone_call', 'whatsapp_click', 'contact_form', 'directions_click',
      'booking', 'checkout', 'email_signup', 'demo_request', 'calendar_booking'
    )),
  is_primary boolean NOT NULL DEFAULT false,
  value_score numeric(5,2) NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, conversion_type)
);
CREATE INDEX IF NOT EXISTS idx_gt3_conversions_customer ON gt3_customer_conversions (customer_id);

-- ─── CUSTOMER SERVICES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_customer_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  service_name_he text,
  service_slug text,
  service_category text,
  is_primary boolean NOT NULL DEFAULT false,
  business_value_score numeric(5,2) NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_services_customer ON gt3_customer_services (customer_id);

-- ─── CUSTOMER STRATEGY PROFILES (JSONB for flexible rules) ──
CREATE TABLE IF NOT EXISTS gt3_customer_strategy_profiles (
  customer_id uuid PRIMARY KEY REFERENCES gt3_customers(id) ON DELETE CASCADE,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── SITE PAGES (full crawl) ────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_site_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  url text NOT NULL,
  canonical_url text,
  title text,
  meta_description text,
  h1 text,
  page_type text
    CHECK (page_type IN (
      'homepage', 'service_page', 'location_service_page',
      'article', 'faq', 'about', 'contact', 'pricing',
      'review_page', 'case_study', 'category_page', 'other'
    )),
  language text DEFAULT 'he',
  status_code int,
  word_count int,
  is_indexable boolean DEFAULT true,
  is_service_page boolean DEFAULT false,
  is_location_page boolean DEFAULT false,
  is_blog_page boolean DEFAULT false,
  page_quality_score numeric(5,2),
  conversion_readiness_score numeric(5,2),
  last_crawled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, url)
);
CREATE INDEX IF NOT EXISTS idx_gt3_pages_customer ON gt3_site_pages (customer_id);
CREATE INDEX IF NOT EXISTS idx_gt3_pages_type ON gt3_site_pages (customer_id, page_type);

-- ─── PAGE ENTITIES (what each page is about) ────────────────
CREATE TABLE IF NOT EXISTS gt3_page_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES gt3_site_pages(id) ON DELETE CASCADE,
  entity_type text NOT NULL
    CHECK (entity_type IN (
      'service', 'city', 'profession', 'legal_topic', 'emergency_intent',
      'audience', 'brand', 'pricing_signal', 'trust_signal',
      'conversion_element', 'faq_topic', 'cluster_topic'
    )),
  entity_value text NOT NULL,
  confidence_score numeric(5,2),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_entities_page ON gt3_page_entities (page_id);
CREATE INDEX IF NOT EXISTS idx_gt3_entities_type ON gt3_page_entities (entity_type, entity_value);

-- ─── KEYWORD UNIVERSE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_keyword_universe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  normalized_keyword text NOT NULL,
  language text NOT NULL DEFAULT 'he',
  keyword_cluster text,
  intent_type text
    CHECK (intent_type IN (
      'transactional', 'commercial', 'informational',
      'navigational', 'brand', 'urgent_local'
    )),
  funnel_stage text
    CHECK (funnel_stage IN ('top_of_funnel', 'middle_of_funnel', 'bottom_of_funnel')),
  serp_type text
    CHECK (serp_type IN (
      'local_pack', 'organic_services', 'informational_articles',
      'video_heavy', 'directory_heavy', 'mixed', 'ecommerce', 'brand_heavy'
    )),
  source_type text NOT NULL
    CHECK (source_type IN (
      'site_extracted', 'service_generated', 'location_generated',
      'search_console', 'manual', 'competitor_derived', 'ai_expanded'
    )),
  estimated_volume numeric(10,2),
  estimated_difficulty numeric(5,2),
  traffic_potential numeric(10,2),
  legacy_keyword_id uuid REFERENCES client_keywords(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, normalized_keyword)
);
CREATE INDEX IF NOT EXISTS idx_gt3_keywords_customer ON gt3_keyword_universe (customer_id);
CREATE INDEX IF NOT EXISTS idx_gt3_keywords_cluster ON gt3_keyword_universe (customer_id, keyword_cluster);
CREATE INDEX IF NOT EXISTS idx_gt3_keywords_intent ON gt3_keyword_universe (customer_id, intent_type);

-- ─── KEYWORD SCORES (the 8 dimensions + final priority) ─────
CREATE TABLE IF NOT EXISTS gt3_keyword_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES gt3_keyword_universe(id) ON DELETE CASCADE,
  relevance_score numeric(5,2) NOT NULL,
  business_value_score numeric(5,2) NOT NULL,
  conversion_intent_score numeric(5,2) NOT NULL,
  local_intent_score numeric(5,2) NOT NULL,
  demand_score numeric(5,2) NOT NULL,
  win_probability_score numeric(5,2) NOT NULL,
  authority_support_score numeric(5,2) NOT NULL,
  gap_urgency_score numeric(5,2) NOT NULL,
  strategic_priority_score numeric(6,2) NOT NULL,
  output_label text NOT NULL
    CHECK (output_label IN (
      'mission_critical', 'high_priority', 'strategic_support',
      'low_priority', 'deprioritize'
    )),
  recommended_action text NOT NULL
    CHECK (recommended_action IN (
      'defend', 'push_to_top_3', 'build_new_page', 'improve_page',
      'expand_support_cluster', 'improve_ctr', 'strengthen_local_signals',
      'earn_authority_links', 'merge_with_existing_topic', 'deprioritize'
    )),
  target_page_type text
    CHECK (target_page_type IN (
      'homepage', 'primary_service_page', 'location_service_page',
      'supporting_article', 'faq_page', 'comparison_page',
      'pricing_page', 'case_study_page', 'review_page', 'local_landing_page'
    )),
  explanation_he text,
  scored_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keyword_id)
);
CREATE INDEX IF NOT EXISTS idx_gt3_scores_priority ON gt3_keyword_scores (strategic_priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_gt3_scores_label ON gt3_keyword_scores (output_label);

-- ─── KEYWORD PAGE MATCHES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_keyword_page_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES gt3_keyword_universe(id) ON DELETE CASCADE,
  page_id uuid REFERENCES gt3_site_pages(id) ON DELETE SET NULL,
  match_type text NOT NULL
    CHECK (match_type IN ('exact_match', 'close_match', 'partial_match', 'weak_match', 'missing_page')),
  match_score numeric(5,2) NOT NULL,
  needs_new_page boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keyword_id, page_id)
);
CREATE INDEX IF NOT EXISTS idx_gt3_matches_keyword ON gt3_keyword_page_matches (keyword_id);

-- ─── KEYWORD RANKINGS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_keyword_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES gt3_keyword_universe(id) ON DELETE CASCADE,
  search_engine text NOT NULL DEFAULT 'google',
  device_type text NOT NULL DEFAULT 'mobile',
  geo_label text,
  ranking_type text NOT NULL DEFAULT 'organic'
    CHECK (ranking_type IN ('organic', 'local_pack', 'map', 'ai_overview_presence', 'featured_snippet')),
  current_position int,
  previous_position int,
  url_ranked text,
  is_in_top_3 boolean GENERATED ALWAYS AS (current_position IS NOT NULL AND current_position <= 3) STORED,
  source text DEFAULT 'gsc',
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_rankings_keyword ON gt3_keyword_rankings (keyword_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_gt3_rankings_top3 ON gt3_keyword_rankings (keyword_id) WHERE is_in_top_3;

-- ─── COMPETITOR SNAPSHOTS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_competitor_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES gt3_keyword_universe(id) ON DELETE CASCADE,
  competitor_domain text NOT NULL,
  competitor_url text,
  position int,
  page_type text,
  title text,
  has_reviews boolean,
  has_faq boolean,
  content_depth_score numeric(5,2),
  authority_score numeric(5,2),
  local_strength_score numeric(5,2),
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_competitors_keyword ON gt3_competitor_snapshots (keyword_id);

-- ─── CONTENT GAPS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gt3_content_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  keyword_id uuid REFERENCES gt3_keyword_universe(id) ON DELETE CASCADE,
  gap_type text NOT NULL
    CHECK (gap_type IN (
      'missing_service_page', 'missing_location_page', 'weak_title',
      'weak_h1', 'thin_content', 'no_internal_links', 'weak_cta',
      'weak_local_signals', 'missing_faq', 'weak_trust_signals',
      'poor_conversion_elements'
    )),
  severity_score numeric(5,2) NOT NULL,
  description_he text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_gaps_customer ON gt3_content_gaps (customer_id);

-- ─── ACTION TASKS (SEO-specific, cross-channel lives in channel_tasks) ──
CREATE TABLE IF NOT EXISTS gt3_action_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  keyword_id uuid REFERENCES gt3_keyword_universe(id) ON DELETE SET NULL,
  page_id uuid REFERENCES gt3_site_pages(id) ON DELETE SET NULL,
  task_type text NOT NULL
    CHECK (task_type IN (
      'create_page', 'improve_page', 'improve_ctr', 'add_internal_links',
      'add_faq', 'strengthen_local_seo', 'improve_conversion',
      'build_cluster', 'review_gbp', 'acquire_links', 'defend_ranking'
    )),
  priority_label text NOT NULL
    CHECK (priority_label IN ('mission_critical', 'high_priority', 'strategic_support', 'low_priority')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  title_he text NOT NULL,
  description_he text,
  estimated_impact_score numeric(5,2),
  assigned_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_tasks_customer ON gt3_action_tasks (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_gt3_tasks_keyword ON gt3_action_tasks (keyword_id);

-- ─── BUSINESS-TYPE WEIGHT PROFILES (scoring weights) ────────
CREATE TABLE IF NOT EXISTS gt3_business_type_weight_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_type text NOT NULL UNIQUE,
  relevance_weight numeric(5,4) NOT NULL,
  business_value_weight numeric(5,4) NOT NULL,
  conversion_intent_weight numeric(5,4) NOT NULL,
  local_intent_weight numeric(5,4) NOT NULL,
  demand_weight numeric(5,4) NOT NULL,
  win_probability_weight numeric(5,4) NOT NULL,
  authority_support_weight numeric(5,4) NOT NULL,
  gap_urgency_weight numeric(5,4) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- GT3 CHANNEL LAYER (multi-channel mission orchestration)
-- ═══════════════════════════════════════════════════════════

-- ─── MARKETING CHANNELS (which channels the customer uses) ──
CREATE TABLE IF NOT EXISTS gt3_marketing_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  channel_type text NOT NULL
    CHECK (channel_type IN ('seo', 'local_seo', 'google_ads', 'meta_ads', 'organic_social', 'email', 'youtube')),
  is_active boolean NOT NULL DEFAULT true,
  primary_goal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, channel_type)
);
CREATE INDEX IF NOT EXISTS idx_gt3_channels_customer ON gt3_marketing_channels (customer_id);

-- ─── CHANNEL KEYWORD TARGETS (each channel ↔ keyword role) ──
CREATE TABLE IF NOT EXISTS gt3_channel_keyword_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  channel_type text NOT NULL,
  keyword_id uuid REFERENCES gt3_keyword_universe(id) ON DELETE CASCADE,
  target_role text NOT NULL
    CHECK (target_role IN (
      'direct_rank_target', 'ranking_support', 'brand_demand_support',
      'conversion_support', 'remarketing_support', 'authority_support'
    )),
  support_weight numeric(5,2) NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, channel_type, keyword_id)
);
CREATE INDEX IF NOT EXISTS idx_gt3_chtargets_keyword ON gt3_channel_keyword_targets (keyword_id);

-- ─── KEYWORD CHANNEL STRATEGY (which channels per keyword) ──
CREATE TABLE IF NOT EXISTS gt3_keyword_channel_strategy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword_id uuid NOT NULL REFERENCES gt3_keyword_universe(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  use_seo boolean NOT NULL DEFAULT true,
  use_local_seo boolean NOT NULL DEFAULT false,
  use_google_ads boolean NOT NULL DEFAULT false,
  use_meta_ads boolean NOT NULL DEFAULT false,
  use_organic_social boolean NOT NULL DEFAULT false,
  use_remarketing boolean NOT NULL DEFAULT false,
  seo_goal_he text,
  local_seo_goal_he text,
  google_ads_goal_he text,
  meta_ads_goal_he text,
  organic_social_goal_he text,
  cross_channel_support_score numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (keyword_id)
);
CREATE INDEX IF NOT EXISTS idx_gt3_kstrategy_customer ON gt3_keyword_channel_strategy (customer_id);

-- ─── CHANNEL WEIGHT PROFILES (4 dimensions per business × channel) ──
CREATE TABLE IF NOT EXISTS gt3_channel_weight_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_type text NOT NULL,
  channel_type text NOT NULL,
  direct_ranking_impact numeric(5,2) NOT NULL,
  demand_capture_impact numeric(5,2) NOT NULL,
  brand_lift_impact numeric(5,2) NOT NULL,
  conversion_assist_impact numeric(5,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_type, channel_type)
);

-- ─── CAMPAIGN ASSETS (ad copy, posts, videos, landing variants) ──
CREATE TABLE IF NOT EXISTS gt3_campaign_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  channel_type text NOT NULL,
  asset_type text NOT NULL
    CHECK (asset_type IN (
      'ad_copy', 'headline', 'description', 'social_post',
      'video_script', 'carousel', 'landing_page_variant',
      'faq_block', 'review_snippet', 'blog_distribution_post'
    )),
  title_he text,
  description_he text,
  target_url text,
  related_keyword_id uuid REFERENCES gt3_keyword_universe(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'published', 'paused', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_assets_customer ON gt3_campaign_assets (customer_id, channel_type);

-- ─── CAMPAIGN PERFORMANCE (feeds back to SEO via message learning) ──
CREATE TABLE IF NOT EXISTS gt3_campaign_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  channel_type text NOT NULL,
  campaign_name text,
  keyword_id uuid REFERENCES gt3_keyword_universe(id) ON DELETE SET NULL,
  impressions numeric(12,2),
  clicks numeric(12,2),
  ctr numeric(8,4),
  conversions numeric(12,2),
  conversion_rate numeric(8,4),
  cost numeric(12,2),
  cost_per_conversion numeric(12,2),
  quality_metric numeric(8,2),
  measured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_perf_customer ON gt3_campaign_performance (customer_id, channel_type, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_gt3_perf_keyword ON gt3_campaign_performance (keyword_id, measured_at DESC);

-- ─── BRAND DEMAND SIGNALS (measure if paid lifts brand) ─────
CREATE TABLE IF NOT EXISTS gt3_brand_demand_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  signal_type text NOT NULL
    CHECK (signal_type IN (
      'branded_search_growth', 'direct_traffic_growth',
      'returning_users_growth', 'branded_ctr_growth', 'gbp_views_growth'
    )),
  signal_value numeric(12,2),
  measured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_brand_customer ON gt3_brand_demand_signals (customer_id, signal_type, measured_at DESC);

-- ─── CHANNEL TASKS (cross-channel action items) ─────────────
CREATE TABLE IF NOT EXISTS gt3_channel_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES gt3_customers(id) ON DELETE CASCADE,
  keyword_id uuid REFERENCES gt3_keyword_universe(id) ON DELETE SET NULL,
  channel_type text NOT NULL,
  task_type text NOT NULL
    CHECK (task_type IN (
      'create_search_ads', 'test_ad_copy', 'create_remarketing_audience',
      'publish_social_post', 'distribute_authority_content',
      'request_reviews', 'update_gbp_services', 'improve_landing_page',
      'test_headline_variants', 'create_video', 'warm_audience'
    )),
  priority_label text NOT NULL
    CHECK (priority_label IN ('mission_critical', 'high_priority', 'strategic_support', 'low_priority')),
  title_he text NOT NULL,
  description_he text,
  target_metric text,
  due_strategy text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  assigned_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gt3_ctasks_customer ON gt3_channel_tasks (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_gt3_ctasks_channel ON gt3_channel_tasks (customer_id, channel_type);

-- ═══════════════════════════════════════════════════════════
-- SEED DATA: business type weight profiles
-- ═══════════════════════════════════════════════════════════

INSERT INTO gt3_business_type_weight_profiles
  (business_type, relevance_weight, business_value_weight, conversion_intent_weight,
   local_intent_weight, demand_weight, win_probability_weight,
   authority_support_weight, gap_urgency_weight)
VALUES
  ('lawyer',          0.18, 0.22, 0.17, 0.12, 0.10, 0.12, 0.05, 0.04),
  ('plumber',         0.17, 0.20, 0.20, 0.18, 0.08, 0.10, 0.02, 0.05),
  ('electrician',     0.17, 0.20, 0.20, 0.18, 0.08, 0.10, 0.02, 0.05),
  ('locksmith',       0.17, 0.20, 0.20, 0.18, 0.08, 0.10, 0.02, 0.05),
  ('musician',        0.20, 0.16, 0.14, 0.10, 0.14, 0.12, 0.08, 0.06),
  ('babysitter',      0.18, 0.18, 0.18, 0.18, 0.08, 0.12, 0.04, 0.04),
  ('therapist',       0.18, 0.20, 0.15, 0.15, 0.10, 0.12, 0.06, 0.04),
  ('dentist',         0.18, 0.20, 0.16, 0.16, 0.10, 0.11, 0.05, 0.04),
  ('medical_clinic',  0.18, 0.20, 0.16, 0.16, 0.10, 0.11, 0.05, 0.04),
  ('realtor',         0.18, 0.20, 0.16, 0.15, 0.10, 0.12, 0.05, 0.04),
  ('consultant',      0.20, 0.20, 0.14, 0.08, 0.12, 0.12, 0.08, 0.06),
  ('restaurant',      0.18, 0.18, 0.18, 0.18, 0.12, 0.10, 0.02, 0.04),
  ('ecommerce',       0.18, 0.22, 0.15, 0.05, 0.16, 0.14, 0.06, 0.04),
  ('custom',          0.18, 0.20, 0.15, 0.10, 0.12, 0.15, 0.05, 0.05)
ON CONFLICT (business_type) DO UPDATE SET
  relevance_weight = EXCLUDED.relevance_weight,
  business_value_weight = EXCLUDED.business_value_weight,
  conversion_intent_weight = EXCLUDED.conversion_intent_weight,
  local_intent_weight = EXCLUDED.local_intent_weight,
  demand_weight = EXCLUDED.demand_weight,
  win_probability_weight = EXCLUDED.win_probability_weight,
  authority_support_weight = EXCLUDED.authority_support_weight,
  gap_urgency_weight = EXCLUDED.gap_urgency_weight;

-- ═══════════════════════════════════════════════════════════
-- SEED DATA: channel weight profiles (5 channels × business types)
-- ═══════════════════════════════════════════════════════════

INSERT INTO gt3_channel_weight_profiles
  (business_type, channel_type,
   direct_ranking_impact, demand_capture_impact, brand_lift_impact, conversion_assist_impact)
VALUES
  -- Lawyer: trust-heavy, high-consideration
  ('lawyer',     'seo',            10, 8, 6, 8),
  ('lawyer',     'local_seo',      10, 8, 5, 8),
  ('lawyer',     'google_ads',      3, 10, 6, 9),
  ('lawyer',     'meta_ads',        2, 5, 8, 8),
  ('lawyer',     'organic_social',  3, 4, 8, 5),
  -- Plumber: urgent local
  ('plumber',    'seo',             9, 7, 4, 7),
  ('plumber',    'local_seo',      10, 9, 4, 8),
  ('plumber',    'google_ads',      3, 10, 4, 10),
  ('plumber',    'meta_ads',        1, 3, 5, 6),
  ('plumber',    'organic_social',  1, 2, 4, 3),
  -- Electrician: same as plumber
  ('electrician','seo',             9, 7, 4, 7),
  ('electrician','local_seo',      10, 9, 4, 8),
  ('electrician','google_ads',      3, 10, 4, 10),
  ('electrician','meta_ads',        1, 3, 5, 6),
  ('electrician','organic_social',  1, 2, 4, 3),
  -- Locksmith: urgent local
  ('locksmith',  'seo',             9, 7, 4, 7),
  ('locksmith',  'local_seo',      10, 9, 4, 8),
  ('locksmith',  'google_ads',      3, 10, 4, 10),
  ('locksmith',  'meta_ads',        1, 3, 5, 6),
  ('locksmith',  'organic_social',  1, 2, 4, 3),
  -- Musician: brand-driven, visual
  ('musician',   'seo',             8, 6, 7, 6),
  ('musician',   'local_seo',       4, 4, 4, 4),
  ('musician',   'google_ads',      4, 8, 6, 7),
  ('musician',   'meta_ads',        3, 6, 10, 8),
  ('musician',   'organic_social',  4, 5, 10, 7),
  -- Babysitter: trust + local
  ('babysitter', 'seo',             8, 6, 5, 7),
  ('babysitter', 'local_seo',       9, 8, 5, 7),
  ('babysitter', 'google_ads',      3, 8, 5, 8),
  ('babysitter', 'meta_ads',        2, 5, 8, 7),
  ('babysitter', 'organic_social',  3, 4, 8, 5),
  -- Therapist / Dentist / Medical: trust-heavy
  ('therapist',     'seo',            10, 8, 6, 8),
  ('therapist',     'local_seo',      10, 8, 5, 8),
  ('therapist',     'google_ads',      3, 9, 6, 9),
  ('therapist',     'meta_ads',        2, 5, 8, 7),
  ('therapist',     'organic_social',  3, 4, 8, 5),
  ('dentist',       'seo',            10, 8, 6, 8),
  ('dentist',       'local_seo',      10, 9, 5, 8),
  ('dentist',       'google_ads',      3, 9, 6, 9),
  ('dentist',       'meta_ads',        2, 5, 8, 7),
  ('dentist',       'organic_social',  3, 4, 8, 5),
  ('medical_clinic','seo',            10, 8, 6, 8),
  ('medical_clinic','local_seo',      10, 9, 5, 8),
  ('medical_clinic','google_ads',      3, 9, 6, 9),
  ('medical_clinic','meta_ads',        2, 5, 8, 7),
  ('medical_clinic','organic_social',  3, 4, 8, 5),
  -- Realtor: trust + local + visual
  ('realtor',    'seo',             9, 7, 6, 7),
  ('realtor',    'local_seo',       9, 8, 5, 7),
  ('realtor',    'google_ads',      3, 9, 6, 9),
  ('realtor',    'meta_ads',        3, 6, 9, 8),
  ('realtor',    'organic_social',  3, 4, 9, 5),
  -- Consultant: authority-driven national
  ('consultant', 'seo',            10, 7, 7, 7),
  ('consultant', 'local_seo',       3, 3, 3, 3),
  ('consultant', 'google_ads',      3, 8, 7, 8),
  ('consultant', 'meta_ads',        3, 6, 9, 7),
  ('consultant', 'organic_social',  4, 5, 9, 6),
  -- Restaurant: local + visual
  ('restaurant', 'seo',             8, 6, 5, 6),
  ('restaurant', 'local_seo',      10, 9, 5, 8),
  ('restaurant', 'google_ads',      3, 8, 5, 8),
  ('restaurant', 'meta_ads',        2, 6, 9, 7),
  ('restaurant', 'organic_social',  3, 4, 9, 5),
  -- Ecommerce: national, conversion-driven
  ('ecommerce',  'seo',            10, 8, 6, 8),
  ('ecommerce',  'local_seo',       2, 2, 2, 2),
  ('ecommerce',  'google_ads',      4, 10, 6, 10),
  ('ecommerce',  'meta_ads',        3, 7, 8, 9),
  ('ecommerce',  'organic_social',  3, 5, 8, 6),
  -- Custom: balanced default
  ('custom',     'seo',             9, 7, 6, 7),
  ('custom',     'local_seo',       8, 7, 5, 7),
  ('custom',     'google_ads',      3, 9, 6, 9),
  ('custom',     'meta_ads',        2, 5, 8, 7),
  ('custom',     'organic_social',  3, 4, 8, 5)
ON CONFLICT (business_type, channel_type) DO UPDATE SET
  direct_ranking_impact = EXCLUDED.direct_ranking_impact,
  demand_capture_impact = EXCLUDED.demand_capture_impact,
  brand_lift_impact = EXCLUDED.brand_lift_impact,
  conversion_assist_impact = EXCLUDED.conversion_assist_impact;

-- ═══════════════════════════════════════════════════════════
-- VIEWS — frontend reads from here, NOT from raw tables
-- ═══════════════════════════════════════════════════════════

-- Primary Missions (top of the dashboard)
CREATE OR REPLACE VIEW gt3_v_primary_missions AS
SELECT
  ku.customer_id,
  ku.id AS keyword_id,
  ku.keyword,
  ku.normalized_keyword,
  ku.intent_type,
  ku.funnel_stage,
  ku.serp_type,
  ku.keyword_cluster,
  ks.strategic_priority_score,
  ks.output_label,
  ks.recommended_action,
  ks.target_page_type,
  ks.explanation_he,
  ks.relevance_score,
  ks.business_value_score,
  ks.conversion_intent_score,
  ks.local_intent_score,
  ks.demand_score,
  ks.win_probability_score,
  ks.authority_support_score,
  ks.gap_urgency_score,
  (SELECT current_position FROM gt3_keyword_rankings r
     WHERE r.keyword_id = ku.id AND r.ranking_type = 'organic'
     ORDER BY r.checked_at DESC LIMIT 1) AS current_organic_rank,
  cs.use_seo,
  cs.use_local_seo,
  cs.use_google_ads,
  cs.use_meta_ads,
  cs.use_organic_social,
  cs.use_remarketing,
  cs.seo_goal_he,
  cs.local_seo_goal_he,
  cs.google_ads_goal_he,
  cs.meta_ads_goal_he,
  cs.organic_social_goal_he,
  cs.cross_channel_support_score
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
LEFT JOIN gt3_keyword_channel_strategy cs ON cs.keyword_id = ku.id
WHERE ks.output_label IN ('mission_critical', 'high_priority');

-- Support Clusters (authority content that reinforces missions)
CREATE OR REPLACE VIEW gt3_v_support_clusters AS
SELECT
  ku.customer_id, ku.id AS keyword_id, ku.keyword,
  ku.keyword_cluster, ku.intent_type,
  ks.strategic_priority_score, ks.output_label, ks.recommended_action,
  ks.authority_support_score, ks.explanation_he
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
WHERE ks.authority_support_score >= 8
  AND ks.output_label IN ('strategic_support', 'high_priority');

-- Missing High-Value Pages
CREATE OR REPLACE VIEW gt3_v_missing_high_value_pages AS
SELECT
  ku.customer_id, ku.id AS keyword_id, ku.keyword,
  ks.strategic_priority_score, ks.output_label, ks.recommended_action,
  ks.target_page_type, ks.explanation_he
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
LEFT JOIN gt3_keyword_page_matches m ON m.keyword_id = ku.id
WHERE ks.strategic_priority_score >= 70
  AND (m.id IS NULL OR m.match_type IN ('missing_page', 'weak_match'));

-- Defense: already in Top 3 — must be maintained
CREATE OR REPLACE VIEW gt3_v_defense_keywords AS
SELECT
  ku.customer_id, ku.id AS keyword_id, ku.keyword,
  ks.strategic_priority_score, ks.output_label,
  r.current_position, r.ranking_type, r.checked_at
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
JOIN LATERAL (
  SELECT current_position, ranking_type, checked_at
  FROM gt3_keyword_rankings rr
  WHERE rr.keyword_id = ku.id
  ORDER BY rr.checked_at DESC LIMIT 1
) r ON TRUE
WHERE r.current_position IS NOT NULL AND r.current_position <= 3;

-- Quick Wins: currently rank 4-10 with high win_probability
CREATE OR REPLACE VIEW gt3_v_quick_wins AS
SELECT
  ku.customer_id, ku.id AS keyword_id, ku.keyword,
  ks.strategic_priority_score, ks.win_probability_score, ks.output_label,
  ks.recommended_action, ks.explanation_he,
  r.current_position
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
JOIN LATERAL (
  SELECT current_position FROM gt3_keyword_rankings rr
  WHERE rr.keyword_id = ku.id AND rr.ranking_type = 'organic'
  ORDER BY rr.checked_at DESC LIMIT 1
) r ON TRUE
WHERE r.current_position BETWEEN 4 AND 10
  AND ks.win_probability_score >= 6;

-- Keyword Priority Dashboard (everything, for the main GT3 view)
CREATE OR REPLACE VIEW gt3_v_keyword_priority_dashboard AS
SELECT
  c.id AS customer_id, c.name AS customer_name, c.domain, c.business_type,
  ku.id AS keyword_id, ku.keyword, ku.keyword_cluster, ku.intent_type, ku.funnel_stage,
  ks.strategic_priority_score, ks.output_label, ks.recommended_action,
  ks.target_page_type, ks.explanation_he,
  cs.use_seo, cs.use_local_seo, cs.use_google_ads, cs.use_meta_ads, cs.use_organic_social
FROM gt3_customers c
JOIN gt3_keyword_universe ku ON ku.customer_id = c.id
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
LEFT JOIN gt3_keyword_channel_strategy cs ON cs.keyword_id = ku.id
ORDER BY c.id, ks.strategic_priority_score DESC;

COMMENT ON TABLE gt3_customers IS 'GT3 Phase 1: core customer identity. Replaces client_profiles business fields.';
COMMENT ON TABLE gt3_keyword_universe IS 'GT3 Phase 1: universe of keywords from 6 sources. Replaces client_keywords.';
COMMENT ON TABLE gt3_keyword_scores IS 'GT3 Phase 1: 8 dimensions + strategic_priority_score per keyword.';
COMMENT ON TABLE gt3_business_type_weight_profiles IS 'GT3 Phase 1: scoring weights per business type.';
COMMENT ON TABLE gt3_channel_weight_profiles IS 'GT3 Phase 1: 4-dimension impact per business × channel.';
COMMENT ON VIEW gt3_v_primary_missions IS 'GT3 Phase 1: mission_critical + high_priority keywords with channel strategy. Read from this, not raw tables.';
