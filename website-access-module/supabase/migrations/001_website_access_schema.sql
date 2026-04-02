-- ============================================================
-- AI GROWTH OS — WEBSITE ACCESS & DEPLOYMENT MODULE
-- Complete schema: websites, access profiles, git/cms/server
-- connections, secrets vault mapping, change policies,
-- validation logs, change history
-- ============================================================

-- CLIENT WEBSITES (central registry)
CREATE TABLE IF NOT EXISTS client_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  label TEXT DEFAULT 'Primary Website',
  -- URLs
  primary_domain TEXT NOT NULL,
  canonical_domain TEXT,
  production_url TEXT,
  staging_url TEXT,
  sitemap_url TEXT,
  robots_url TEXT,
  -- Technology stack
  website_platform_type TEXT DEFAULT 'unknown' CHECK (website_platform_type IN (
    'static','nextjs','wordpress','wix','webflow','shopify',
    'squarespace','custom','unknown'
  )),
  cms_type TEXT,
  framework_type TEXT,
  -- Infrastructure
  hosting_provider TEXT,
  deployment_provider TEXT,
  dns_provider TEXT,
  cdn_provider TEXT,
  -- Build info
  build_command TEXT,
  start_command TEXT,
  -- Auto-detected
  detected_language TEXT,
  detected_platform TEXT,
  has_sitemap BOOLEAN DEFAULT false,
  has_schema BOOLEAN DEFAULT false,
  has_ga4 BOOLEAN DEFAULT false,
  has_gtm BOOLEAN DEFAULT false,
  pages_in_sitemap INTEGER DEFAULT 0,
  -- Status
  is_primary BOOLEAN DEFAULT true,
  is_reachable BOOLEAN,
  last_crawled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE ACCESS PROFILES (what level of access exists)
CREATE TABLE IF NOT EXISTS website_access_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE UNIQUE,
  -- Access flags
  read_only_enabled BOOLEAN DEFAULT true,
  git_access_enabled BOOLEAN DEFAULT false,
  cms_access_enabled BOOLEAN DEFAULT false,
  server_access_enabled BOOLEAN DEFAULT false,
  -- Computed current access level (highest available)
  current_access_level TEXT DEFAULT 'read_only' CHECK (current_access_level IN (
    'read_only','content_only','cms_edit','git_edit','server_edit','full_control'
  )),
  -- Validation
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT DEFAULT 'pending' CHECK (validation_status IN (
    'pending','valid','failed','limited','untested'
  )),
  validation_error TEXT,
  -- Secrets flags (booleans only — raw secrets never here)
  has_git_token BOOLEAN DEFAULT false,
  has_cms_token BOOLEAN DEFAULT false,
  has_server_password BOOLEAN DEFAULT false,
  has_server_private_key BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE GIT CONNECTIONS
CREATE TABLE IF NOT EXISTS website_git_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE UNIQUE,
  provider TEXT NOT NULL CHECK (provider IN ('github','gitlab','bitbucket','azure_devops','other')),
  repo_url TEXT NOT NULL,
  repo_owner TEXT,
  repo_name TEXT,
  default_branch TEXT DEFAULT 'main',
  production_branch TEXT DEFAULT 'main',
  staging_branch TEXT,
  -- What the system is allowed to do
  access_mode TEXT DEFAULT 'clone_only' CHECK (access_mode IN (
    'clone_only','branch_and_pr','branch_pr_and_merge','direct_push'
  )),
  -- Deployment platform linked to this repo
  deployment_platform TEXT CHECK (deployment_platform IN (
    'vercel','netlify','cloudflare','render','railway','custom','none'
  )),
  deployment_project_id TEXT,
  deployment_production_url TEXT,
  deployment_staging_url TEXT,
  -- Webhooks
  webhook_url TEXT,
  webhook_secret_hint TEXT,         -- last 4 chars only
  -- Connection health
  connection_status TEXT DEFAULT 'untested' CHECK (connection_status IN (
    'untested','connected','failed','limited','revoked'
  )),
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  repo_reachable BOOLEAN,
  branch_exists BOOLEAN,
  read_access_works BOOLEAN,
  write_access_works BOOLEAN,
  deploy_access_works BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE CMS CONNECTIONS
CREATE TABLE IF NOT EXISTS website_cms_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE UNIQUE,
  cms_type TEXT NOT NULL CHECK (cms_type IN (
    'wordpress','wix','webflow','shopify','squarespace',
    'contentful','sanity','strapi','ghost','other'
  )),
  admin_url TEXT,
  access_email TEXT,               -- invited access email (no password needed)
  username TEXT,                   -- for manual login
  api_enabled BOOLEAN DEFAULT false,
  api_base_url TEXT,
  -- Scope
  environment_scope TEXT DEFAULT 'production' CHECK (environment_scope IN (
    'production','staging','both'
  )),
  -- Capabilities detected
  can_read_pages BOOLEAN DEFAULT false,
  can_edit_pages BOOLEAN DEFAULT false,
  can_publish BOOLEAN DEFAULT false,
  can_manage_media BOOLEAN DEFAULT false,
  can_manage_plugins BOOLEAN DEFAULT false,
  -- Connection health
  connection_status TEXT DEFAULT 'untested' CHECK (connection_status IN (
    'untested','connected','failed','limited','revoked'
  )),
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE SERVER CONNECTIONS
CREATE TABLE IF NOT EXISTS website_server_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE UNIQUE,
  access_type TEXT NOT NULL CHECK (access_type IN ('ssh','sftp','ftp','cpanel','plesk')),
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT,
  auth_type TEXT NOT NULL DEFAULT 'password' CHECK (auth_type IN ('password','ssh_key','api_token')),
  -- Safe path info (not secrets)
  site_root_path TEXT,
  backup_path TEXT,
  -- Commands
  deploy_command TEXT,
  build_command TEXT,
  restart_command TEXT,
  -- Connection health
  connection_status TEXT DEFAULT 'untested' CHECK (connection_status IN (
    'untested','connected','failed','limited','revoked'
  )),
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  can_read BOOLEAN DEFAULT false,
  can_write BOOLEAN DEFAULT false,
  can_execute BOOLEAN DEFAULT false,
  site_root_exists BOOLEAN DEFAULT false,
  backup_path_exists BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE SECRETS (vault mapping — raw secrets NEVER stored here)
-- This table stores only encrypted blobs and vault references
CREATE TABLE IF NOT EXISTS website_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE,
  secret_type TEXT NOT NULL CHECK (secret_type IN (
    'git_token','git_deploy_key',
    'cms_password','cms_api_token',
    'server_password','server_private_key',
    'deploy_hook','webhook_secret','custom'
  )),
  -- AES-256-CBC encrypted secret value
  encrypted_value TEXT NOT NULL,
  encryption_iv TEXT NOT NULL,
  -- Non-sensitive metadata
  label TEXT,
  hint TEXT,                       -- last 4 chars or description only
  created_by TEXT DEFAULT 'admin',
  last_rotated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE CHANGE POLICIES (what agents are allowed to do)
CREATE TABLE IF NOT EXISTS website_change_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE UNIQUE,
  -- Read capabilities
  allow_analysis BOOLEAN DEFAULT true,
  allow_crawl BOOLEAN DEFAULT true,
  -- Content capabilities
  allow_content_edits BOOLEAN DEFAULT false,
  allow_schema_edits BOOLEAN DEFAULT false,
  allow_technical_seo_edits BOOLEAN DEFAULT false,
  allow_code_changes BOOLEAN DEFAULT false,
  allow_media_changes BOOLEAN DEFAULT false,
  -- Deploy capabilities
  allow_direct_production_changes BOOLEAN DEFAULT false,
  allow_staging_changes BOOLEAN DEFAULT false,
  -- Workflow requirements
  require_pr BOOLEAN DEFAULT true,
  require_staging_first BOOLEAN DEFAULT true,
  require_manual_approval_before_publish BOOLEAN DEFAULT true,
  -- Autonomous permissions (no approval needed for these)
  allow_autonomous_safe_changes BOOLEAN DEFAULT false,
  allow_autonomous_content_expansion BOOLEAN DEFAULT false,
  allow_autonomous_meta_updates BOOLEAN DEFAULT false,
  allow_autonomous_internal_linking BOOLEAN DEFAULT false,
  allow_autonomous_schema_markup BOOLEAN DEFAULT false,
  -- Path protections
  forbidden_paths TEXT[] DEFAULT '{}',     -- never touch these paths
  protected_paths TEXT[] DEFAULT '{}',     -- require extra approval
  -- Notes
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE VALIDATION LOGS
CREATE TABLE IF NOT EXISTS website_validation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE,
  validation_type TEXT NOT NULL CHECK (validation_type IN (
    'git','cms','server','crawl','deploy','full'
  )),
  status TEXT NOT NULL CHECK (status IN ('passed','failed','partial','skipped')),
  details JSONB DEFAULT '{}',
  error TEXT,
  duration_ms INTEGER DEFAULT 0,
  triggered_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- WEBSITE CHANGE HISTORY
CREATE TABLE IF NOT EXISTS website_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_website_id UUID REFERENCES client_websites(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'content_edit','meta_edit','schema_edit','technical_seo',
    'code_change','deploy','media_change','config_change','revert'
  )),
  target_path TEXT,
  target_url TEXT,
  environment TEXT DEFAULT 'staging' CHECK (environment IN ('production','staging','local')),
  published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  approved_by TEXT,
  approval_required BOOLEAN DEFAULT false,
  pr_url TEXT,
  pr_number TEXT,
  commit_sha TEXT,
  summary TEXT,
  before_snapshot JSONB,
  after_snapshot JSONB,
  reverted_at TIMESTAMPTZ,
  reverted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_client_websites_client ON client_websites(client_id);
CREATE INDEX IF NOT EXISTS idx_validation_logs_website ON website_validation_logs(client_website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_change_history_website ON website_change_history(client_website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_website_secrets_website ON website_secrets(client_website_id, secret_type);

-- TRIGGERS
CREATE OR REPLACE FUNCTION update_ua_website()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_websites_ua BEFORE UPDATE ON client_websites FOR EACH ROW EXECUTE FUNCTION update_ua_website();
CREATE TRIGGER trg_access_profiles_ua BEFORE UPDATE ON website_access_profiles FOR EACH ROW EXECUTE FUNCTION update_ua_website();
CREATE TRIGGER trg_git_connections_ua BEFORE UPDATE ON website_git_connections FOR EACH ROW EXECUTE FUNCTION update_ua_website();
CREATE TRIGGER trg_cms_connections_ua BEFORE UPDATE ON website_cms_connections FOR EACH ROW EXECUTE FUNCTION update_ua_website();
CREATE TRIGGER trg_server_connections_ua BEFORE UPDATE ON website_server_connections FOR EACH ROW EXECUTE FUNCTION update_ua_website();
CREATE TRIGGER trg_change_policies_ua BEFORE UPDATE ON website_change_policies FOR EACH ROW EXECUTE FUNCTION update_ua_website();

-- RLS
ALTER TABLE client_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_git_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_cms_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_server_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_change_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_validation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_change_history ENABLE ROW LEVEL SECURITY;

-- RLS policies: users can only access data for clients they have access to
DO $$ BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'client_websites','website_access_profiles','website_git_connections',
    'website_cms_connections','website_server_connections','website_secrets',
    'website_change_policies','website_validation_logs','website_change_history'
  ]) LOOP
    EXECUTE format('CREATE POLICY "tenant_isolation_%s" ON %s FOR ALL USING (
      EXISTS (
        SELECT 1 FROM client_websites cw
        JOIN user_client_access uca ON uca.client_id = cw.client_id
        WHERE cw.id = %s.client_website_id
        AND uca.user_id = auth.uid()
      )
    )', tbl, tbl, tbl);
  END LOOP;
END $$;

-- client_websites: direct client_id check
CREATE POLICY "tenant_isolation_client_websites" ON client_websites FOR ALL
  USING (client_id IN (SELECT client_id FROM user_client_access WHERE user_id = auth.uid()));

-- SQL HELPER: get website runtime context for agents
CREATE OR REPLACE FUNCTION get_website_context(p_client_id UUID)
RETURNS JSONB AS $$
  SELECT jsonb_build_object(
    'website', jsonb_build_object(
      'id', cw.id,
      'label', cw.label,
      'platformType', cw.website_platform_type,
      'primaryDomain', cw.primary_domain,
      'productionUrl', cw.production_url,
      'stagingUrl', cw.staging_url,
      'sitemapUrl', cw.sitemap_url,
      'framework', cw.framework_type,
      'cms', cw.cms_type,
      'hosting', cw.hosting_provider,
      'deployment', cw.deployment_provider,
      'isReachable', cw.is_reachable,
      'accessModes', jsonb_build_object(
        'readOnly', COALESCE(ap.read_only_enabled, true),
        'git', COALESCE(ap.git_access_enabled, false),
        'cms', COALESCE(ap.cms_access_enabled, false),
        'server', COALESCE(ap.server_access_enabled, false),
        'currentLevel', COALESCE(ap.current_access_level, 'read_only')
      ),
      'git', CASE WHEN gc.id IS NOT NULL THEN jsonb_build_object(
        'provider', gc.provider,
        'repoUrl', gc.repo_url,
        'repoOwner', gc.repo_owner,
        'repoName', gc.repo_name,
        'defaultBranch', gc.default_branch,
        'productionBranch', gc.production_branch,
        'stagingBranch', gc.staging_branch,
        'accessMode', gc.access_mode,
        'deploymentPlatform', gc.deployment_platform,
        'status', gc.connection_status
      ) ELSE NULL END,
      'cms', CASE WHEN cc.id IS NOT NULL THEN jsonb_build_object(
        'type', cc.cms_type,
        'adminUrl', cc.admin_url,
        'apiEnabled', cc.api_enabled,
        'canEdit', cc.can_edit_pages,
        'canPublish', cc.can_publish,
        'status', cc.connection_status
      ) ELSE NULL END,
      'changePolicy', CASE WHEN cp.id IS NOT NULL THEN jsonb_build_object(
        'allowAnalysis', cp.allow_analysis,
        'allowContentEdits', cp.allow_content_edits,
        'allowSchemaEdits', cp.allow_schema_edits,
        'allowTechnicalSeoEdits', cp.allow_technical_seo_edits,
        'allowCodeChanges', cp.allow_code_changes,
        'allowDirectProductionChanges', cp.allow_direct_production_changes,
        'requirePR', cp.require_pr,
        'requireStagingFirst', cp.require_staging_first,
        'requireManualApprovalBeforePublish', cp.require_manual_approval_before_publish,
        'allowAutonomousSafeChanges', cp.allow_autonomous_safe_changes,
        'allowAutonomousContentExpansion', cp.allow_autonomous_content_expansion,
        'allowAutonomousMetaUpdates', cp.allow_autonomous_meta_updates,
        'allowAutonomousInternalLinking', cp.allow_autonomous_internal_linking,
        'allowAutonomousSchemaMarkup', cp.allow_autonomous_schema_markup,
        'forbiddenPaths', cp.forbidden_paths,
        'protectedPaths', cp.protected_paths
      ) ELSE jsonb_build_object(
        'allowAnalysis', true,
        'allowContentEdits', false,
        'allowCodeChanges', false,
        'allowDirectProductionChanges', false,
        'requireManualApprovalBeforePublish', true
      ) END
    )
  )
  FROM client_websites cw
  LEFT JOIN website_access_profiles ap ON ap.client_website_id = cw.id
  LEFT JOIN website_git_connections gc ON gc.client_website_id = cw.id
  LEFT JOIN website_cms_connections cc ON cc.client_website_id = cw.id
  LEFT JOIN website_change_policies cp ON cp.client_website_id = cw.id
  WHERE cw.client_id = p_client_id AND cw.is_primary = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;
