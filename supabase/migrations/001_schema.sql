-- ============================================================
-- AI GROWTH OS — COMPLETE SUPABASE SCHEMA
-- All tables, indexes, triggers, functions
-- ============================================================

-- CLIENTS
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  business_type TEXT,
  industry TEXT,
  sub_industry TEXT,
  language TEXT DEFAULT 'en',
  rtl_required BOOLEAN DEFAULT false,
  brand_voice TEXT,
  logo_url TEXT,
  primary_color TEXT,
  timezone TEXT DEFAULT 'Asia/Jerusalem',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  source_of_truth TEXT,
  pre_run_document TEXT,
  allowed_accounts TEXT[] DEFAULT '{}',
  forbidden_accounts TEXT[] DEFAULT '{}',
  analytics_allowed_key_events TEXT[] DEFAULT '{}',
  special_policies JSONB DEFAULT '[]',
  post_change_validation_mandatory BOOLEAN DEFAULT true,
  reviews_voice TEXT DEFAULT 'office',
  social_restrictions JSONB DEFAULT '{}',
  custom_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AGENT TEMPLATES
CREATE TABLE agent_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  lane TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN ('owner','worker','validator')),
  provider_preference TEXT DEFAULT 'openai',
  model TEXT DEFAULT 'gpt-4.1',
  description TEXT,
  base_prompt TEXT NOT NULL,
  global_rules TEXT,
  do_rules TEXT[] DEFAULT '{}',
  dont_rules TEXT[] DEFAULT '{}',
  output_contract JSONB DEFAULT '{}',
  self_validation_checklist TEXT[] DEFAULT '{}',
  action_mode_default TEXT DEFAULT 'autonomous' CHECK (action_mode_default IN ('autonomous','approve_then_act','report_only')),
  post_change_trigger BOOLEAN DEFAULT false,
  cooldown_minutes INTEGER DEFAULT 0,
  max_tokens INTEGER DEFAULT 4000,
  temperature FLOAT DEFAULT 0.3,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CLIENT-AGENT ASSIGNMENTS
CREATE TABLE client_agent_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT true,
  action_mode_override TEXT,
  custom_instructions TEXT,
  last_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, agent_template_id)
);

-- PROMPT VERSIONS
CREATE TABLE prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  version_number INTEGER NOT NULL,
  prompt_body TEXT NOT NULL,
  change_notes TEXT,
  is_active BOOLEAN DEFAULT false,
  rolled_back_from UUID REFERENCES prompt_versions(id),
  last_run_id UUID,
  runs_using_this INTEGER DEFAULT 0,
  created_by TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- MEMORY
CREATE TABLE memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'general',
  type TEXT NOT NULL DEFAULT 'fact',
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual','run','document','import')),
  source_document_id UUID,
  source_run_id UUID,
  relevance_score FLOAT DEFAULT 1.0,
  approved BOOLEAN DEFAULT true,
  is_stale BOOLEAN DEFAULT false,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  last_run_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CLIENT DOCUMENTS
CREATE TABLE client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT,
  file_size_bytes INTEGER,
  file_type TEXT,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending','processing','done','failed')),
  memory_items_created INTEGER DEFAULT 0,
  chunks_processed INTEGER DEFAULT 0,
  error TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RUN QUEUE
CREATE TABLE run_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE CASCADE,
  task_payload JSONB DEFAULT '{}',
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','executed','failed','blocked_dependency','skipped_cooldown','cancelled')),
  priority INTEGER DEFAULT 5,
  depends_on UUID[] DEFAULT '{}',
  run_id UUID,
  executed_at TIMESTAMPTZ,
  error TEXT,
  queued_by TEXT DEFAULT 'system',
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 2,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RUNS
CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE CASCADE,
  prompt_version_id UUID REFERENCES prompt_versions(id) ON DELETE SET NULL,
  queue_item_id UUID REFERENCES run_queue(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'running' CHECK (status IN ('running','success','failed','pending_approval','dry_run','cancelled')),
  is_dry_run BOOLEAN DEFAULT false,
  task_payload JSONB DEFAULT '{}',
  prompt_used TEXT,
  context_summary JSONB DEFAULT '{}',
  output JSONB,
  output_text TEXT,
  changed_anything BOOLEAN DEFAULT false,
  what_changed TEXT,
  trigger_post_change_validation BOOLEAN DEFAULT false,
  post_change_validation_status TEXT CHECK (post_change_validation_status IN ('pending','running','passed','failed')),
  memory_items_used UUID[] DEFAULT '{}',
  tokens_used INTEGER DEFAULT 0,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  error TEXT,
  approved_by TEXT,
  approval_id UUID,
  triggered_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- APPROVALS
CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE SET NULL,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  what_needs_approval TEXT NOT NULL,
  proposed_action TEXT,
  context JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approved_by TEXT,
  rejection_reason TEXT,
  approved_at TIMESTAMPTZ,
  resumed_at TIMESTAMPTZ,
  resumed_run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AGENT SCHEDULES
CREATE TABLE agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE CASCADE,
  cron_expression TEXT NOT NULL,
  timezone TEXT DEFAULT 'Asia/Jerusalem',
  enabled BOOLEAN DEFAULT true,
  task_payload JSONB DEFAULT '{}',
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, agent_template_id)
);

-- INCIDENTS
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  agent_template_id UUID REFERENCES agent_templates(id) ON DELETE SET NULL,
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  category TEXT DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','investigating','resolved','dismissed')),
  resolved_by TEXT,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AUDIT TRAIL
CREATE TABLE audit_trail (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  agent_slug TEXT,
  action TEXT NOT NULL,
  actor TEXT DEFAULT 'system',
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- BASELINES
CREATE TABLE baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_value FLOAT,
  metric_text TEXT,
  source TEXT,
  target_value FLOAT,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, metric_name)
);

-- SEO KEYWORDS
CREATE TABLE client_keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  volume INTEGER DEFAULT 0,
  difficulty FLOAT DEFAULT 0,
  current_position INTEGER,
  previous_position INTEGER,
  target_position INTEGER DEFAULT 1,
  featured_snippet BOOLEAN DEFAULT false,
  url TEXT,
  search_intent TEXT,
  cluster TEXT,
  last_checked TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, keyword)
);

-- COMPETITORS
CREATE TABLE client_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  name TEXT,
  domain_authority FLOAT DEFAULT 0,
  referring_domains INTEGER DEFAULT 0,
  organic_keywords INTEGER DEFAULT 0,
  organic_traffic_estimate INTEGER DEFAULT 0,
  notes TEXT,
  last_analyzed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, domain)
);

-- BACKLINKS
CREATE TABLE backlinks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  source_domain TEXT NOT NULL,
  source_url TEXT,
  target_url TEXT,
  anchor_text TEXT,
  domain_authority FLOAT DEFAULT 0,
  page_authority FLOAT DEFAULT 0,
  is_dofollow BOOLEAN DEFAULT true,
  is_sponsored BOOLEAN DEFAULT false,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, source_domain, target_url)
);

-- REFERRING DOMAINS
CREATE TABLE referring_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  domain_authority FLOAT DEFAULT 0,
  backlink_count INTEGER DEFAULT 1,
  dofollow_count INTEGER DEFAULT 0,
  is_competitor BOOLEAN DEFAULT false,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_updated TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, domain)
);

-- COMPETITOR LINK GAP
CREATE TABLE competitor_link_gap (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  competitor_domain TEXT NOT NULL,
  domain_authority FLOAT DEFAULT 0,
  relevance_score FLOAT DEFAULT 0.5,
  category TEXT,
  outreach_difficulty TEXT DEFAULT 'medium' CHECK (outreach_difficulty IN ('easy','medium','hard')),
  recommendation TEXT,
  ai_rationale TEXT,
  status TEXT DEFAULT 'uncontacted' CHECK (status IN ('uncontacted','contacted','acquired','rejected','in_progress')),
  contacted_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, domain, competitor_domain)
);

-- EXTERNAL SYNC LOG (Google Sheets imports)
CREATE TABLE external_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL,
  source TEXT DEFAULT 'google_sheets_csv',
  status TEXT DEFAULT 'success' CHECK (status IN ('success','failed','partial')),
  rows_imported INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  duration_ms INTEGER DEFAULT 0,
  sheet_url TEXT,
  error TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- REPORTS
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  period TEXT DEFAULT 'monthly',
  period_start DATE,
  period_end DATE,
  html_content TEXT,
  json_content JSONB,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','ready','sent','failed')),
  sent_at TIMESTAMPTZ,
  sent_to TEXT[] DEFAULT '{}',
  branding TEXT DEFAULT 'elad_digital',
  language TEXT DEFAULT 'he',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CLIENT CREDENTIALS
CREATE TABLE client_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  label TEXT,
  credential_data JSONB DEFAULT '{}',
  is_connected BOOLEAN DEFAULT false,
  last_checked TIMESTAMPTZ,
  last_successful TIMESTAMPTZ,
  error TEXT,
  health_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, service)
);

-- LINK RECOMMENDATIONS (AI-generated, cached)
CREATE TABLE link_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  domain_authority FLOAT DEFAULT 0,
  competitor_that_has_it TEXT,
  why_it_matters TEXT,
  outreach_strategy TEXT,
  estimated_impact TEXT,
  priority INTEGER DEFAULT 5,
  category TEXT,
  status TEXT DEFAULT 'recommended' CHECK (status IN ('recommended','contacted','acquired','rejected','dismissed')),
  generated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── INDEXES ──────────────────────────────────────────────────
CREATE INDEX idx_run_queue_status ON run_queue(status, created_at ASC);
CREATE INDEX idx_run_queue_client ON run_queue(client_id, status);
CREATE INDEX idx_runs_client_date ON runs(client_id, created_at DESC);
CREATE INDEX idx_runs_status ON runs(status, created_at DESC);
CREATE INDEX idx_memory_client_approved ON memory_items(client_id, approved, is_stale, relevance_score DESC);
CREATE INDEX idx_audit_client_date ON audit_trail(client_id, created_at DESC);
CREATE INDEX idx_backlinks_client_da ON backlinks(client_id, domain_authority DESC);
CREATE INDEX idx_competitor_gap_client_da ON competitor_link_gap(client_id, domain_authority DESC, status);
CREATE INDEX idx_keywords_client_pos ON client_keywords(client_id, current_position ASC NULLS LAST);
CREATE INDEX idx_approvals_client_status ON approvals(client_id, status, created_at DESC);
CREATE INDEX idx_incidents_client_status ON incidents(client_id, status, severity);
CREATE INDEX idx_schedules_next_run ON agent_schedules(next_run_at, enabled) WHERE enabled = true;

-- ── TRIGGERS ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON client_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rules_updated_at BEFORE UPDATE ON client_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_agents_updated_at BEFORE UPDATE ON agent_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_memory_updated_at BEFORE UPDATE ON memory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated_at BEFORE UPDATE ON client_documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_run_queue_updated_at BEFORE UPDATE ON run_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_incidents_updated_at BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_schedules_updated_at BEFORE UPDATE ON agent_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_credentials_updated_at BEFORE UPDATE ON client_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_gap_updated_at BEFORE UPDATE ON competitor_link_gap FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── SQL FUNCTIONS ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_memory_usage(memory_id UUID, p_run_id UUID)
RETURNS void AS $$
  UPDATE memory_items
  SET times_used = times_used + 1, last_used_at = now(), last_run_id = p_run_id
  WHERE id = memory_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_queue_stats(p_client_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'queued', COUNT(*) FILTER (WHERE status = 'queued'),
    'running', COUNT(*) FILTER (WHERE status = 'running'),
    'executed', COUNT(*) FILTER (WHERE status = 'executed'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'blocked', COUNT(*) FILTER (WHERE status = 'blocked_dependency'),
    'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled')
  ) FROM run_queue WHERE client_id = p_client_id AND created_at > now() - interval '24 hours';
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_run_stats(p_client_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'total_runs', COUNT(*),
    'success_rate', ROUND(COUNT(*) FILTER (WHERE status = 'success') * 100.0 / NULLIF(COUNT(*),0), 1),
    'total_tokens', SUM(tokens_used),
    'avg_duration_ms', ROUND(AVG(duration_ms))
  ) FROM runs WHERE client_id = p_client_id AND created_at > now() - interval '7 days';
$$ LANGUAGE sql SECURITY DEFINER;

-- Enqueue due scheduled runs
CREATE OR REPLACE FUNCTION enqueue_due_runs()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_schedule RECORD;
BEGIN
  FOR v_schedule IN
    SELECT s.*, at.slug
    FROM agent_schedules s
    JOIN agent_templates at ON at.id = s.agent_template_id
    WHERE s.enabled = true
    AND s.next_run_at <= now()
    AND NOT EXISTS (
      SELECT 1 FROM run_queue rq
      WHERE rq.client_id = s.client_id
      AND rq.agent_template_id = s.agent_template_id
      AND rq.status IN ('queued','running')
      AND rq.created_at > now() - interval '10 minutes'
    )
  LOOP
    INSERT INTO run_queue (client_id, agent_template_id, task_payload, status, queued_by, priority)
    VALUES (v_schedule.client_id, v_schedule.agent_template_id,
            COALESCE(v_schedule.task_payload, '{}'), 'queued', 'scheduler', 3);

    UPDATE agent_schedules
    SET last_run_at = now(),
        run_count = run_count + 1,
        next_run_at = now() + interval '1 day' -- simplified; real impl uses cron parser
    WHERE id = v_schedule.id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
