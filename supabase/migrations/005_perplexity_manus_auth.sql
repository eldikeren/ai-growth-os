-- ============================================================
-- 005: Perplexity Structured Output + Manus Browser Tasks + Auth Model
-- ============================================================

-- ═══════════════════════════════════════════════════════════════
-- 1. PERPLEXITY STRUCTURED RESEARCH TABLES
-- ═══════════════════════════════════════════════════════════════

-- External research queries log — every Perplexity call recorded
CREATE TABLE IF NOT EXISTS external_research_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  agent_slug TEXT,
  query TEXT NOT NULL,
  focus TEXT DEFAULT 'web' CHECK (focus IN ('web','academic','news','social')),
  answer TEXT,
  citations JSONB DEFAULT '[]',
  raw_response JSONB DEFAULT '{}',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ext_research_client ON external_research_queries(client_id, created_at DESC);

-- Cited domains — domains repeatedly cited by AI / search as authorities
CREATE TABLE IF NOT EXISTS cited_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  citation_count INTEGER DEFAULT 1,
  contexts TEXT[] DEFAULT '{}',
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  relevance_score NUMERIC(3,2) DEFAULT 0.5,
  domain_authority INTEGER,
  is_competitor BOOLEAN DEFAULT false,
  is_potential_backlink_target BOOLEAN DEFAULT false,
  UNIQUE(client_id, domain)
);
CREATE INDEX IF NOT EXISTS idx_cited_domains_client ON cited_domains(client_id, citation_count DESC);

-- Repeated entities — people, brands, orgs that appear in AI answers
CREATE TABLE IF NOT EXISTS repeated_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  entity_name TEXT NOT NULL,
  entity_type TEXT CHECK (entity_type IN ('person','brand','organization','product','service','location','concept')),
  mention_count INTEGER DEFAULT 1,
  contexts TEXT[] DEFAULT '{}',
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  is_competitor BOOLEAN DEFAULT false,
  is_client BOOLEAN DEFAULT false,
  UNIQUE(client_id, entity_name)
);

-- Answer pattern signals — how AI answers questions in the client's niche
CREATE TABLE IF NOT EXISTS answer_pattern_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  question_pattern TEXT NOT NULL,
  answer_structure TEXT,
  common_sources TEXT[] DEFAULT '{}',
  client_mentioned BOOLEAN DEFAULT false,
  competitor_mentioned BOOLEAN DEFAULT false,
  competitors_in_answer TEXT[] DEFAULT '{}',
  opportunity_score NUMERIC(3,2) DEFAULT 0.5,
  niche TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- GEO visibility signals — how visible the client is in generative AI answers
CREATE TABLE IF NOT EXISTS geo_visibility_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  platform TEXT DEFAULT 'perplexity' CHECK (platform IN ('perplexity','chatgpt','gemini','copilot','claude')),
  client_mentioned BOOLEAN DEFAULT false,
  client_position INTEGER,
  total_entities_mentioned INTEGER,
  competitors_mentioned TEXT[] DEFAULT '{}',
  citation_urls TEXT[] DEFAULT '{}',
  client_cited BOOLEAN DEFAULT false,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  raw_answer TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_geo_vis_client ON geo_visibility_signals(client_id, snapshot_date DESC);

-- Authority target candidates — potential backlink/citation sources discovered
CREATE TABLE IF NOT EXISTS authority_target_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  reason TEXT,
  discovered_via TEXT CHECK (discovered_via IN ('perplexity','competitor_analysis','backlink_gap','manual')),
  domain_authority INTEGER,
  relevance_score NUMERIC(3,2) DEFAULT 0.5,
  outreach_status TEXT DEFAULT 'discovered' CHECK (outreach_status IN ('discovered','researching','contacted','negotiating','acquired','rejected','stale')),
  contact_info JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, domain)
);

-- Content question patterns — questions people ask that the client should answer
CREATE TABLE IF NOT EXISTS content_question_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  frequency TEXT CHECK (frequency IN ('high','medium','low')),
  search_volume INTEGER,
  current_answer_quality TEXT CHECK (current_answer_quality IN ('excellent','good','weak','missing')),
  client_has_content BOOLEAN DEFAULT false,
  content_url TEXT,
  opportunity_score NUMERIC(3,2) DEFAULT 0.5,
  niche TEXT,
  discovered_via TEXT DEFAULT 'perplexity',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- 2. MANUS BROWSER OPERATOR TASKS
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS browser_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'screenshot','data_export','form_submission','login_check',
    'dashboard_scrape','review_response','social_post','custom'
  )),
  target_url TEXT,
  target_platform TEXT,
  instructions JSONB NOT NULL DEFAULT '{}',
  credential_id UUID REFERENCES client_credentials(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  result JSONB DEFAULT '{}',
  artifacts JSONB DEFAULT '[]',
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_browser_tasks_client ON browser_tasks(client_id, status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- 3. AUTH MODEL — ensure oauth_credentials has proper structure
-- ═══════════════════════════════════════════════════════════════

-- Add auth_model column to client_rules to track per-client auth status
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS auth_model JSONB DEFAULT '{}';
COMMENT ON COLUMN client_rules.auth_model IS 'Tracks which OAuth providers are connected, scope sufficiency, and token health per client';

-- Add oauth_provider to client_credentials for clearer OAuth tracking
ALTER TABLE client_credentials ADD COLUMN IF NOT EXISTS oauth_provider TEXT;
ALTER TABLE client_credentials ADD COLUMN IF NOT EXISTS oauth_connected_email TEXT;
ALTER TABLE client_credentials ADD COLUMN IF NOT EXISTS scope_status TEXT DEFAULT 'unknown' CHECK (scope_status IN ('full','limited','missing','unknown'));
COMMENT ON COLUMN client_credentials.oauth_provider IS 'google or meta — set when connected via platform OAuth';

-- ═══════════════════════════════════════════════════════════════
-- SQL function for incrementing citation count
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION increment_citation_count(p_client_id UUID, p_domain TEXT, p_context TEXT)
RETURNS void AS $$
BEGIN
  UPDATE cited_domains
  SET citation_count = citation_count + 1,
      last_seen = now(),
      contexts = CASE
        WHEN array_length(contexts, 1) < 20 THEN array_append(contexts, p_context)
        ELSE contexts
      END
  WHERE client_id = p_client_id AND domain = p_domain;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════
-- 4. SYSTEM AUDIT — add missing test categories tracking
-- ═══════════════════════════════════════════════════════════════

-- Track system audit results over time
CREATE TABLE IF NOT EXISTS system_audit_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  overall_score INTEGER,
  category_scores JSONB DEFAULT '{}',
  blockers_count INTEGER DEFAULT 0,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, snapshot_date)
);
