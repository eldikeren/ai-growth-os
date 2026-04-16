-- ============================================================
-- 028: SOCIAL POSTS — Facebook & Instagram post management
-- ============================================================

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Content
  title TEXT,                          -- internal title/reference
  content TEXT NOT NULL,               -- post text/caption
  media_urls JSONB DEFAULT '[]',       -- [{url, type: 'image'|'video', storage_path}]
  link_url TEXT,                       -- optional link to share

  -- Platform & type
  platform TEXT NOT NULL DEFAULT 'facebook'
    CHECK (platform IN ('facebook', 'instagram', 'both')),
  post_type TEXT DEFAULT 'text'
    CHECK (post_type IN ('text', 'image', 'video', 'link', 'carousel', 'story', 'reel')),

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,

  -- Meta API response
  facebook_post_id TEXT,
  instagram_post_id TEXT,
  publish_error TEXT,

  -- Engagement metrics (synced periodically)
  engagement JSONB,                    -- {likes, comments, shares, reach, impressions}

  -- AI assistance
  ai_generated BOOLEAN DEFAULT false,
  ai_prompt TEXT,

  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_social_posts_client ON social_posts(client_id, status, created_at DESC);
CREATE INDEX idx_social_posts_scheduled ON social_posts(status, scheduled_at) WHERE status = 'scheduled';
