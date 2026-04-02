-- ============================================================
-- AI GROWTH OS — SCHEMA ADDITIONS (002)
-- All tables missing from 001_schema.sql per full prompt spec
-- Adding without removing anything from 001
-- ============================================================

-- ── PROFILES (Supabase Auth users) ───────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'admin' CHECK (role IN ('admin','operator','viewer')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── USER → CLIENT ACCESS MAPPING ────────────────────────────
CREATE TABLE IF NOT EXISTS user_client_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  access_level TEXT DEFAULT 'operator' CHECK (access_level IN ('admin','operator','viewer')),
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, client_id)
);

-- ── CLIENT LOCATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  label TEXT,                          -- e.g. "Main Office", "Tel Aviv Branch"
  address TEXT,
  city TEXT,
  region TEXT,
  country TEXT DEFAULT 'IL',
  postal_code TEXT,
  lat FLOAT,
  lng FLOAT,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── CLIENT CONNECTORS (per-client data source config) ────────
CREATE TABLE IF NOT EXISTS client_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  connector_type TEXT NOT NULL CHECK (connector_type IN (
    'google_search_console','google_ads','google_analytics',
    'google_business_profile','meta_business','google_sheets',
    'github','vercel','website','email_smtp','custom'
  )),
  label TEXT,
  config JSONB DEFAULT '{}',
  -- Google Sheets specific
  sheet_id TEXT,
  backlinks_tab TEXT,
  referring_domains_tab TEXT,
  competitor_link_gap_tab TEXT,
  missing_referring_domains_tab TEXT,
  authority_metrics_tab TEXT,
  keyword_rankings_tab TEXT,
  action_plan_tab TEXT,
  sync_enabled BOOLEAN DEFAULT false,
  sync_frequency TEXT DEFAULT 'manual' CHECK (sync_frequency IN ('hourly','daily','weekly','manual')),
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, connector_type)
);

-- ── CLIENT PROMPT OVERRIDES ───────────────────────────────────
CREATE TABLE IF NOT EXISTS client_prompt_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  change_notes TEXT,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, agent_template_id)
);

-- ── KEYWORD SNAPSHOTS (historical position tracking) ─────────
CREATE TABLE IF NOT EXISTS keyword_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  keyword_id UUID REFERENCES client_keywords(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  position INTEGER,
  url TEXT,
  source TEXT DEFAULT 'gsc',
  snapshot_date DATE DEFAULT CURRENT_DATE,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── COMPETITOR SNAPSHOTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  competitor_id UUID REFERENCES client_competitors(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  domain_authority FLOAT DEFAULT 0,
  referring_domains_count INTEGER DEFAULT 0,
  organic_keywords_count INTEGER DEFAULT 0,
  organic_traffic_estimate INTEGER DEFAULT 0,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── BACKLINK SNAPSHOTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS backlink_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  total_backlinks INTEGER DEFAULT 0,
  total_referring_domains INTEGER DEFAULT 0,
  dofollow_backlinks INTEGER DEFAULT 0,
  new_backlinks_period INTEGER DEFAULT 0,
  lost_backlinks_period INTEGER DEFAULT 0,
  domain_authority FLOAT DEFAULT 0,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  source TEXT DEFAULT 'google_sheets_import',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── REFERRING DOMAIN SNAPSHOTS ────────────────────────────────
CREATE TABLE IF NOT EXISTS referring_domain_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  total_referring_domains INTEGER DEFAULT 0,
  new_referring_domains INTEGER DEFAULT 0,
  lost_referring_domains INTEGER DEFAULT 0,
  avg_domain_authority FLOAT DEFAULT 0,
  snapshot_date DATE DEFAULT CURRENT_DATE,
  source TEXT DEFAULT 'google_sheets_import',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── AUTHORITY SNAPSHOTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS authority_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,           -- e.g. 'domain_authority', 'page_authority', 'trust_flow'
  metric_value FLOAT DEFAULT 0,
  source TEXT NOT NULL,                -- e.g. 'moz', 'majestic', 'ahrefs', 'dataforseo'
  -- IMPORTANT: never label as Google metric — only third-party
  snapshot_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── MISSING REFERRING DOMAINS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS missing_referring_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  competitors_that_have_it TEXT[] DEFAULT '{}',
  competitor_count INTEGER DEFAULT 0,
  domain_authority FLOAT DEFAULT 0,
  relevance_score FLOAT DEFAULT 0.5,
  category TEXT,
  priority_score FLOAT DEFAULT 0,
  recommended_acquisition_type TEXT,   -- e.g. 'guest_post', 'directory', 'pr', 'editorial'
  ai_rationale TEXT,
  status TEXT DEFAULT 'uncontacted' CHECK (status IN ('uncontacted','contacted','in_progress','acquired','rejected','dismissed')),
  contacted_at TIMESTAMPTZ,
  notes TEXT,
  imported_from_sheet BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, domain)
);

-- ── LINK OPPORTUNITIES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS link_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  opportunity_type TEXT NOT NULL CHECK (opportunity_type IN (
    'competitor_gap','authority_gap','missing_referring_domain',
    'editorial','directory','pr','guest_post','partnership','sponsorship'
  )),
  domain_authority FLOAT DEFAULT 0,
  relevance_score FLOAT DEFAULT 0.5,
  priority_score FLOAT DEFAULT 0,
  effort TEXT DEFAULT 'medium' CHECK (effort IN ('low','medium','high')),
  expected_impact TEXT DEFAULT 'medium' CHECK (expected_impact IN ('low','medium','high')),
  competitor_that_has_it TEXT,
  why_it_matters TEXT,
  outreach_strategy TEXT,
  owner_lane TEXT DEFAULT 'SEO Operations',
  status TEXT DEFAULT 'identified' CHECK (status IN ('identified','contacted','in_progress','acquired','rejected','dismissed')),
  ai_generated BOOLEAN DEFAULT false,
  generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── SEO ACTION PLANS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seo_action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'page1_opportunity','content_gap','technical_gap',
    'internal_linking_gap','backlink_gap','authority_gap',
    'local_visibility_gap','schema_gap','speed_gap','cro_gap'
  )),
  title TEXT NOT NULL,
  description TEXT,
  target_keyword TEXT,
  target_url TEXT,
  effort TEXT DEFAULT 'medium' CHECK (effort IN ('low','medium','high')),
  expected_impact TEXT DEFAULT 'medium' CHECK (expected_impact IN ('low','medium','high')),
  owner_lane TEXT,
  priority_score FLOAT DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','done','dismissed')),
  due_date DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── RUN STEPS (granular step-by-step tracking within a run) ──
CREATE TABLE IF NOT EXISTS run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_type TEXT DEFAULT 'processing' CHECK (step_type IN (
    'context_assembly','memory_injection','prompt_build',
    'openai_call','output_parse','validation','action','audit'
  )),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','skipped')),
  input_summary TEXT,
  output_summary TEXT,
  duration_ms INTEGER DEFAULT 0,
  error TEXT,
  metadata JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── REPORT TEMPLATES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_he TEXT,                        -- Hebrew name
  report_type TEXT NOT NULL CHECK (report_type IN (
    'daily_progress','weekly_progress','monthly_progress',
    'weekly_seo','weekly_paid_ads','weekly_growth',
    'custom'
  )),
  language TEXT DEFAULT 'he' CHECK (language IN ('he','en')),
  is_rtl BOOLEAN DEFAULT true,
  template_html TEXT,
  sections JSONB DEFAULT '[]',         -- ordered list of sections to include
  branding TEXT DEFAULT 'elad_digital',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── REPORT SCHEDULES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  language TEXT DEFAULT 'he',
  timezone TEXT DEFAULT 'Asia/Jerusalem',
  schedule_type TEXT DEFAULT 'weekly' CHECK (schedule_type IN ('daily','weekly','monthly','custom')),
  days_of_week INTEGER[] DEFAULT '{}', -- 0=Sun, 1=Mon, ... 6=Sat
  days_of_month INTEGER[] DEFAULT '{}',
  send_time TIME DEFAULT '08:00:00',
  cron_expression TEXT,
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── REPORT RECIPIENTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS report_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES report_schedules(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  language_preference TEXT DEFAULT 'he',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── GENERATED REPORTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES report_schedules(id) ON DELETE SET NULL,
  template_id UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  language TEXT DEFAULT 'he',
  title TEXT NOT NULL,
  title_he TEXT,
  period_start DATE,
  period_end DATE,
  html_content TEXT,
  json_content JSONB,
  rtl BOOLEAN DEFAULT true,
  branding TEXT DEFAULT 'elad_digital',
  quality_check_passed BOOLEAN,
  hebrew_quality_passed BOOLEAN,
  design_check_passed BOOLEAN,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','ready','sent','failed')),
  generation_duration_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── SENT REPORTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sent_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  generated_report_id UUID REFERENCES generated_reports(id) ON DELETE SET NULL,
  sent_to TEXT[] NOT NULL DEFAULT '{}',
  subject TEXT,
  sent_by TEXT DEFAULT 'system',
  provider TEXT DEFAULT 'resend',
  provider_message_id TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed','bounced')),
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── KPI SNAPSHOTS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kpi_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value FLOAT,
  metric_text TEXT,
  source TEXT NOT NULL,               -- REQUIRED — no KPI without a source
  source_verified BOOLEAN DEFAULT false,
  data_date DATE DEFAULT CURRENT_DATE,
  snapshot_date TIMESTAMPTZ DEFAULT now(),
  -- Never allow fake KPIs — verified must be true before displaying
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── SCHEDULE DEFINITIONS (generalized cron config) ────────────
CREATE TABLE IF NOT EXISTS schedule_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('agent','report','sync','health_check')),
  target_id UUID,                      -- agent_template_id, report_schedule_id, connector_id
  target_type TEXT,                    -- 'agent_template', 'report_schedule', 'connector'
  cron_expression TEXT NOT NULL,
  timezone TEXT DEFAULT 'Asia/Jerusalem',
  is_active BOOLEAN DEFAULT true,
  task_payload JSONB DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  consecutive_failures INTEGER DEFAULT 0,
  max_consecutive_failures INTEGER DEFAULT 5,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── ADD MISSING COLUMNS TO EXISTING TABLES ───────────────────

-- Add created_by to runs (missing from spec)
ALTER TABLE runs ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS client_prompt_override_id UUID REFERENCES client_prompt_overrides(id) ON DELETE SET NULL;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'openai';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS model TEXT DEFAULT 'gpt-4.1';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS onboarding_context_snapshot JSONB DEFAULT '{}';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS client_policy_snapshot JSONB DEFAULT '{}';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS keyword_ids_used UUID[] DEFAULT '{}';
ALTER TABLE runs ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add awaiting_approval to run_queue status
ALTER TABLE run_queue DROP CONSTRAINT IF EXISTS run_queue_status_check;
ALTER TABLE run_queue ADD CONSTRAINT run_queue_status_check CHECK (status IN (
  'queued','running','executed','failed','blocked_dependency',
  'skipped_cooldown','cancelled','awaiting_approval'
));

-- Add source, dependency_run_ids to run_queue
ALTER TABLE run_queue ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE run_queue ADD COLUMN IF NOT EXISTS dependency_run_ids UUID[] DEFAULT '{}';

-- Add created_by to client_rules
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS business_type TEXT;
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS sub_industry TEXT;
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'he';
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS rtl_required BOOLEAN DEFAULT false;
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS brand_voice TEXT;
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS target_audiences TEXT[] DEFAULT '{}';
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS forbidden_audiences TEXT[] DEFAULT '{}';
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS geographies TEXT[] DEFAULT '{}';
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS compliance_style TEXT;
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS report_language_default TEXT DEFAULT 'he';
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS report_style_default TEXT DEFAULT 'premium';
ALTER TABLE client_rules ADD COLUMN IF NOT EXISTS approval_required_for TEXT[] DEFAULT '{}';

-- Add missing columns to memory_items per spec
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS derived_from_file_id UUID REFERENCES client_documents(id) ON DELETE SET NULL;
ALTER TABLE memory_items ADD COLUMN IF NOT EXISTS stale BOOLEAN GENERATED ALWAYS AS (is_stale) STORED;

-- Add missing columns to prompt_versions per spec
ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS prompt_text TEXT GENERATED ALWAYS AS (prompt_body) STORED;
ALTER TABLE prompt_versions ADD COLUMN IF NOT EXISTS notes TEXT GENERATED ALWAYS AS (change_notes) STORED;

-- Add missing columns to approvals per spec
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE approvals ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';

-- Add client_keywords missing columns per spec
ALTER TABLE client_keywords ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 5;
ALTER TABLE client_keywords ADD COLUMN IF NOT EXISTS target_page TEXT;
ALTER TABLE client_keywords ADD COLUMN IF NOT EXISTS geography TEXT;
ALTER TABLE client_keywords ADD COLUMN IF NOT EXISTS baseline_position INTEGER;
ALTER TABLE client_keywords ADD COLUMN IF NOT EXISTS delta INTEGER GENERATED ALWAYS AS (
  CASE WHEN baseline_position IS NOT NULL AND current_position IS NOT NULL
  THEN baseline_position - current_position ELSE NULL END
) STORED;
ALTER TABLE client_keywords ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE client_keywords ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Add missing columns to agent_schedules for prompt spec alignment
ALTER TABLE agent_schedules ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- ── ADDITIONAL INDEXES ────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_keyword_snapshots_client_date ON keyword_snapshots(client_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_client_metric ON kpi_snapshots(client_id, metric_name, data_date DESC);
CREATE INDEX IF NOT EXISTS idx_run_steps_run ON run_steps(run_id, step_number ASC);
CREATE INDEX IF NOT EXISTS idx_generated_reports_client ON generated_reports(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sent_reports_client ON sent_reports(client_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_missing_domains_client_priority ON missing_referring_domains(client_id, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_link_opportunities_client_priority ON link_opportunities(client_id, priority_score DESC, status);
CREATE INDEX IF NOT EXISTS idx_seo_action_plans_client_status ON seo_action_plans(client_id, status, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_connectors_client ON client_connectors(client_id, connector_type);
CREATE INDEX IF NOT EXISTS idx_schedule_definitions_next ON schedule_definitions(next_run_at, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_client_access ON user_client_access(user_id, client_id);

-- ── ADDITIONAL TRIGGERS ───────────────────────────────────────
CREATE TRIGGER trg_connectors_updated_at BEFORE UPDATE ON client_connectors FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_overrides_updated_at BEFORE UPDATE ON client_prompt_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_report_schedules_updated_at BEFORE UPDATE ON report_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_generated_reports_updated_at BEFORE UPDATE ON generated_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_report_templates_updated_at BEFORE UPDATE ON report_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_seo_action_plans_updated_at BEFORE UPDATE ON seo_action_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_link_opportunities_updated_at BEFORE UPDATE ON link_opportunities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_missing_domains_updated_at BEFORE UPDATE ON missing_referring_domains FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_schedule_definitions_updated_at BEFORE UPDATE ON schedule_definitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_locations_updated_at BEFORE UPDATE ON client_locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
-- Enable RLS on ALL tenant tables

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyword_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlink_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE referring_domain_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE referring_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_link_gap ENABLE ROW LEVEL SECURITY;
ALTER TABLE missing_referring_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_agent_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_prompt_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE run_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sent_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES — users can only access clients they have been granted access to
-- Pattern: client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid())

CREATE POLICY "tenant_isolation_clients" ON clients FOR ALL
  USING (id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_client_profiles" ON client_profiles FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_client_rules" ON client_rules FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_client_locations" ON client_locations FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_client_connectors" ON client_connectors FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_client_credentials" ON client_credentials FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_keywords" ON client_keywords FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_keyword_snapshots" ON keyword_snapshots FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_competitors" ON client_competitors FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_competitor_snapshots" ON competitor_snapshots FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_backlink_snapshots" ON backlink_snapshots FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_referring_domain_snapshots" ON referring_domain_snapshots FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_authority_snapshots" ON authority_snapshots FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_backlinks" ON backlinks FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_referring_domains" ON referring_domains FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_competitor_link_gap" ON competitor_link_gap FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_missing_domains" ON missing_referring_domains FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_link_opportunities" ON link_opportunities FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_link_recommendations" ON link_recommendations FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_seo_action_plans" ON seo_action_plans FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_assignments" ON client_agent_assignments FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_prompt_overrides" ON client_prompt_overrides FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_memory" ON memory_items FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_documents" ON client_documents FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_runs" ON runs FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_run_steps" ON run_steps FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_run_queue" ON run_queue FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_approvals" ON approvals FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_incidents" ON incidents FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_report_schedules" ON report_schedules FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_report_recipients" ON report_recipients FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_generated_reports" ON generated_reports FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_sent_reports" ON sent_reports FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_sync_log" ON external_sync_log FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_audit" ON audit_trail FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_baselines" ON baselines FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_kpi_snapshots" ON kpi_snapshots FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_schedule_definitions" ON schedule_definitions FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_agent_schedules" ON agent_schedules FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_reports" ON reports FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

-- Profiles: users can only read/update their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (id = auth.uid());

-- Agent templates: readable by all authenticated users (global templates)
ALTER TABLE agent_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents_readable_by_all" ON agent_templates FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "agents_writable_by_admin" ON agent_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Prompt versions: readable by all authenticated users
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prompt_versions_readable" ON prompt_versions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "prompt_versions_writable_by_admin" ON prompt_versions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Report templates: readable by all authenticated users
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_templates_readable" ON report_templates FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── STORAGE BUCKETS ───────────────────────────────────────────
-- Run these in Supabase dashboard Storage section OR via management API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('client-documents', 'client-documents', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('client-reports', 'client-reports', false);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('client-assets', 'client-assets', false);

-- Storage RLS policies (apply after creating buckets):
-- CREATE POLICY "documents_tenant_isolation" ON storage.objects FOR ALL
--   USING (bucket_id = 'client-documents' AND (storage.foldername(name))[1] IN (
--     SELECT client_id::TEXT FROM user_client_access WHERE user_id = auth.uid()
--   ));

-- ── HELPER FUNCTIONS ──────────────────────────────────────────

-- Get client context for AI prompt assembly
CREATE OR REPLACE FUNCTION get_client_context(p_client_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'client', row_to_json(c),
    'profile', row_to_json(cp),
    'rules', row_to_json(cr),
    'baselines', (SELECT jsonb_agg(row_to_json(b)) FROM baselines b WHERE b.client_id = p_client_id),
    'keywords_count', (SELECT COUNT(*) FROM client_keywords WHERE client_id = p_client_id),
    'memory_count', (SELECT COUNT(*) FROM memory_items WHERE client_id = p_client_id AND approved = true AND is_stale = false),
    'open_incidents', (SELECT COUNT(*) FROM incidents WHERE client_id = p_client_id AND status = 'open'),
    'pending_approvals', (SELECT COUNT(*) FROM approvals WHERE client_id = p_client_id AND status = 'pending')
  )
  FROM clients c
  LEFT JOIN client_profiles cp ON cp.client_id = c.id
  LEFT JOIN client_rules cr ON cr.client_id = c.id
  WHERE c.id = p_client_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Mark KPI as verified (prevent fake KPIs from appearing)
CREATE OR REPLACE FUNCTION verify_kpi(p_kpi_id UUID)
RETURNS void AS $$
  UPDATE kpi_snapshots SET source_verified = true WHERE id = p_kpi_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Get system verification status for a client
CREATE OR REPLACE FUNCTION get_verification_status(p_client_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'agents_seeded', (SELECT COUNT(*) > 0 FROM agent_templates WHERE is_active = true),
    'agents_with_prompts', (SELECT COUNT(*) FROM agent_templates WHERE base_prompt IS NOT NULL AND length(base_prompt) > 100),
    'client_assignments', (SELECT COUNT(*) FROM client_agent_assignments WHERE client_id = p_client_id AND enabled = true),
    'memory_items', (SELECT COUNT(*) FROM memory_items WHERE client_id = p_client_id AND approved = true AND is_stale = false),
    'active_prompt_versions', (SELECT COUNT(*) FROM prompt_versions WHERE is_active = true),
    'pending_approvals', (SELECT COUNT(*) FROM approvals WHERE client_id = p_client_id AND status = 'pending'),
    'open_incidents', (SELECT COUNT(*) FROM incidents WHERE client_id = p_client_id AND status = 'open' AND severity IN ('high','critical')),
    'queue_items_today', (SELECT COUNT(*) FROM run_queue WHERE client_id = p_client_id AND created_at > now() - interval '24 hours'),
    'runs_last_48h', (SELECT COUNT(*) FROM runs WHERE client_id = p_client_id AND created_at > now() - interval '48 hours'),
    'successful_runs_last_48h', (SELECT COUNT(*) FROM runs WHERE client_id = p_client_id AND status = 'success' AND created_at > now() - interval '48 hours'),
    'connectors_active', (SELECT COUNT(*) FROM client_connectors WHERE client_id = p_client_id AND is_active = true),
    'credentials_connected', (SELECT COUNT(*) FROM client_credentials WHERE client_id = p_client_id AND is_connected = true),
    'kpi_snapshots_verified', (SELECT COUNT(*) FROM kpi_snapshots WHERE client_id = p_client_id AND source_verified = true),
    'kpi_snapshots_unverified', (SELECT COUNT(*) FROM kpi_snapshots WHERE client_id = p_client_id AND source_verified = false)
  );
$$ LANGUAGE sql SECURITY DEFINER;
