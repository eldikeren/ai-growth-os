-- ============================================================
-- 025: CAMPAIGN MANAGEMENT
-- Campaigns for Meta (Facebook + Instagram) and Google Ads
-- ============================================================

-- ── CAMPAIGNS TABLE ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Campaign identity
  name TEXT NOT NULL,
  objective TEXT NOT NULL DEFAULT 'TRAFFIC'
    CHECK (objective IN ('AWARENESS','TRAFFIC','ENGAGEMENT','LEADS','SALES')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','active','paused','completed','failed','archived')),

  -- Platforms
  platforms JSONB NOT NULL DEFAULT '["facebook","instagram"]',
  -- e.g. ["facebook"], ["instagram"], ["facebook","instagram"], ["google_ads"]

  -- Budget
  daily_budget_cents INTEGER, -- stored in minor currency units (agorot / cents)
  total_budget_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'ILS',

  -- Schedule
  start_date DATE,
  end_date DATE,

  -- Targeting
  targeting JSONB DEFAULT '{}',
  -- { geo: ["IL"], age_min: 25, age_max: 65, interests: [...], gender: "all", placements: ["feed","stories"] }

  -- External IDs (set after publishing to platforms)
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  google_campaign_id TEXT,

  -- Tracking
  external_status JSONB DEFAULT '{}',
  -- { meta: "ACTIVE", google: "ENABLED" }
  last_synced_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  -- Performance (latest snapshot)
  performance JSONB DEFAULT '{}',
  -- { impressions, clicks, spend_cents, ctr, cpc, conversions, reach }

  notes TEXT,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_campaigns_client ON campaigns(client_id, created_at DESC);
CREATE INDEX idx_campaigns_status ON campaigns(client_id, status);

-- ── CAMPAIGN CREATIVES ───────────────────────────────────────
-- Each campaign can have multiple creatives (ad variations / A/B testing)
CREATE TABLE IF NOT EXISTS campaign_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Creative content
  headline TEXT,
  primary_text TEXT, -- main ad copy
  description TEXT,  -- link description / secondary text
  call_to_action TEXT DEFAULT 'LEARN_MORE'
    CHECK (call_to_action IN ('LEARN_MORE','SHOP_NOW','SIGN_UP','CONTACT_US','GET_OFFER','BOOK_NOW','APPLY_NOW','DOWNLOAD','WATCH_MORE','SEE_MENU','GET_QUOTE','SUBSCRIBE')),

  -- Media
  image_url TEXT,           -- hosted image URL
  image_storage_path TEXT,  -- Supabase storage path
  video_url TEXT,
  thumbnail_url TEXT,

  -- Destination
  destination_url TEXT,     -- landing page URL
  display_url TEXT,         -- what shows in the ad (optional)

  -- Platform-specific overrides
  meta_creative JSONB DEFAULT '{}',
  -- { format: "SINGLE_IMAGE", instagram_actor_id: "...", page_id: "..." }
  google_creative JSONB DEFAULT '{}',
  -- { headlines: [...], descriptions: [...], final_urls: [...] }

  -- External IDs
  meta_creative_id TEXT,
  google_ad_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','paused','rejected','archived')),
  is_primary BOOLEAN DEFAULT false,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creatives_campaign ON campaign_creatives(campaign_id);
CREATE INDEX idx_creatives_client ON campaign_creatives(client_id);

-- ── CAMPAIGN PERFORMANCE SNAPSHOTS ───────────────────────────
-- Daily performance tracking per campaign per platform
CREATE TABLE IF NOT EXISTS campaign_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'facebook', 'instagram', 'google_ads'
  snapshot_date DATE NOT NULL,

  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  spend_cents INTEGER DEFAULT 0,
  ctr NUMERIC(6,4) DEFAULT 0,
  cpc_cents INTEGER DEFAULT 0,
  cpm_cents INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,
  video_views INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,

  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(campaign_id, platform, snapshot_date)
);

CREATE INDEX idx_snapshots_campaign ON campaign_snapshots(campaign_id, snapshot_date DESC);
CREATE INDEX idx_snapshots_client ON campaign_snapshots(client_id, snapshot_date DESC);
