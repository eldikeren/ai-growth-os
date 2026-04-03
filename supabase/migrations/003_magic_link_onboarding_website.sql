-- ============================================================
-- AI GROWTH OS — MAGIC LINK ONBOARDING SYSTEM
-- Setup links, client submissions, connector definitions
-- ============================================================

-- ALL AVAILABLE CONNECTOR TYPES (master list)
CREATE TABLE IF NOT EXISTS connector_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_he TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'analytics','advertising','social','seo','hosting','cms',
    'ecommerce','crm','email','review','other'
  )),
  auth_type TEXT NOT NULL CHECK (auth_type IN (
    'oauth_google','oauth_meta','oauth_custom',
    'api_key','username_password','webhook_url','manual'
  )),
  icon TEXT,                          -- emoji or icon name
  description TEXT,
  description_he TEXT,
  -- What fields to collect
  fields JSONB DEFAULT '[]',          -- [{key, label, label_he, type, required, placeholder, help_text}]
  -- OAuth config
  oauth_scopes TEXT[] DEFAULT '{}',
  oauth_authorize_url TEXT,
  oauth_token_url TEXT,
  -- Which agents need this connector
  required_by_agents TEXT[] DEFAULT '{}',
  -- Display
  display_order INTEGER DEFAULT 99,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SETUP LINKS (one per client, configurable)
CREATE TABLE IF NOT EXISTS setup_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Which connectors to request (admin configures this)
  requested_connectors TEXT[] DEFAULT '{}',   -- array of connector slugs
  -- Custom message to client
  custom_message TEXT,
  custom_message_he TEXT,
  -- Branding
  language TEXT DEFAULT 'he',
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','expired','cancelled')),
  -- Progress
  completed_connectors TEXT[] DEFAULT '{}',   -- connectors client has completed
  skipped_connectors TEXT[] DEFAULT '{}',     -- connectors client chose to skip
  -- Expiry
  expires_at TIMESTAMPTZ DEFAULT now() + interval '14 days',
  -- Tracking
  first_opened_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Notifications
  notify_email TEXT,                          -- email to notify when client completes
  client_email TEXT,
  client_name TEXT,
  -- Link metadata
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SETUP SUBMISSIONS (what client submitted for each connector)
CREATE TABLE IF NOT EXISTS setup_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_link_id UUID REFERENCES setup_links(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  connector_slug TEXT NOT NULL,
  -- Submission type
  submission_type TEXT DEFAULT 'credentials' CHECK (submission_type IN (
    'oauth_token','api_key','credentials','webhook_url','manual_info','skipped'
  )),
  -- Encrypted credential storage
  -- NEVER store raw passwords — encrypt before insert
  encrypted_data TEXT,                -- AES-256 encrypted JSON
  encryption_iv TEXT,                 -- IV for decryption
  -- Safe metadata (not encrypted)
  meta JSONB DEFAULT '{}',            -- {connected_email, property_count, page_name, etc.}
  -- For OAuth: readable summary
  oauth_account_email TEXT,
  oauth_scope_granted TEXT[],
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending','connected','failed','skipped','expired'
  )),
  error TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SETUP LINK EVENTS (audit trail for client activity)
CREATE TABLE IF NOT EXISTS setup_link_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setup_link_id UUID REFERENCES setup_links(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,           -- opened, connector_started, connector_completed, connector_skipped, completed
  connector_slug TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_setup_links_token ON setup_links(token) WHERE status != 'expired';
CREATE INDEX IF NOT EXISTS idx_setup_links_client ON setup_links(client_id, status);
CREATE INDEX IF NOT EXISTS idx_setup_submissions_link ON setup_submissions(setup_link_id, connector_slug);
CREATE INDEX IF NOT EXISTS idx_setup_submissions_client ON setup_submissions(client_id, connector_slug, status);

-- TRIGGER
CREATE TRIGGER trg_setup_links_updated_at BEFORE UPDATE ON setup_links FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE setup_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE setup_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE setup_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_definitions ENABLE ROW LEVEL SECURITY;

-- Connector definitions readable by all authenticated users
CREATE POLICY "connector_defs_readable" ON connector_definitions FOR SELECT USING (true);

-- Setup links: accessed via service_role key (bypasses RLS).
-- Add admin-only policies when user auth is implemented.

-- ============================================================
-- SEED: ALL CONNECTOR DEFINITIONS
-- ============================================================

INSERT INTO connector_definitions (
  slug, name, name_he, category, auth_type, icon,
  description, description_he, fields, oauth_scopes,
  required_by_agents, display_order, is_active
) VALUES

-- GOOGLE SEARCH CONSOLE
('google_search_console', 'Google Search Console', 'גוגל סרץ קונסול',
 'seo', 'oauth_google', '🔍',
 'Connect your Google Search Console to track keyword rankings, clicks, and indexing.',
 'חברו את גוגל סרץ קונסול כדי לעקוב אחר דירוג מילות המפתח, קליקים ואינדוקס.',
 '[{"key":"property_url","label":"Select Property","label_he":"בחרו נכס","type":"select_after_oauth","required":true}]',
 ARRAY['https://www.googleapis.com/auth/webmasters.readonly'],
 ARRAY['gsc-daily-monitor','seo-core-agent','technical-seo-crawl-agent'],
 1, true),

-- GOOGLE ADS
('google_ads', 'Google Ads', 'גוגל אדס',
 'advertising', 'oauth_google', '💰',
 'Connect Google Ads to monitor campaigns, keywords, and conversions.',
 'חברו את גוגל אדס לניטור קמפיינים, מילות מפתח והמרות.',
 '[{"key":"customer_id","label":"Customer ID","label_he":"מזהה לקוח","type":"select_after_oauth","required":true}]',
 ARRAY['https://www.googleapis.com/auth/adwords'],
 ARRAY['google-ads-campaign-agent'],
 2, true),

-- GOOGLE ANALYTICS 4
('google_analytics', 'Google Analytics 4', 'גוגל אנליטיקס 4',
 'analytics', 'oauth_google', '📊',
 'Connect GA4 to verify conversion tracking and funnel performance.',
 'חברו את GA4 לאימות מעקב המרות וביצועי המשפך.',
 '[{"key":"property_id","label":"GA4 Property","label_he":"נכס GA4","type":"select_after_oauth","required":true}]',
 ARRAY['https://www.googleapis.com/auth/analytics.readonly'],
 ARRAY['analytics-conversion-integrity-agent'],
 3, true),

-- GOOGLE BUSINESS PROFILE
('google_business_profile', 'Google Business Profile', 'גוגל ביזנס פרופיל',
 'seo', 'oauth_google', '📍',
 'Connect your Google Business Profile to manage reviews and local presence.',
 'חברו את גוגל ביזנס פרופיל לניהול ביקורות ונוכחות מקומית.',
 '[{"key":"location_id","label":"Business Location","label_he":"מיקום העסק","type":"select_after_oauth","required":true}]',
 ARRAY['https://www.googleapis.com/auth/business.manage'],
 ARRAY['local-seo-agent','reviews-gbp-authority-agent'],
 4, true),

-- FACEBOOK BUSINESS PAGE
('facebook_page', 'Facebook Business Page', 'דף פייסבוק עסקי',
 'social', 'oauth_meta', '📘',
 'Connect your Facebook Business Page for content publishing and monitoring.',
 'חברו את דף הפייסבוק העסקי לפרסום תוכן וניטור.',
 '[{"key":"page_id","label":"Select Page","label_he":"בחרו דף","type":"select_after_oauth","required":true,"help_text":"Business Page only — not personal profile","help_text_he":"דף עסקי בלבד — לא פרופיל אישי"}]',
 ARRAY['pages_manage_posts','pages_read_engagement','pages_show_list'],
 ARRAY['facebook-agent'],
 5, true),

-- INSTAGRAM BUSINESS PROFILE
('instagram_business', 'Instagram Business Profile', 'אינסטגרם ביזנס',
 'social', 'oauth_meta', '📸',
 'Connect your Instagram Business Profile for content publishing.',
 'חברו את פרופיל האינסטגרם העסקי לפרסום תוכן.',
 '[{"key":"instagram_account_id","label":"Select Profile","label_he":"בחרו פרופיל","type":"select_after_oauth","required":true,"help_text":"Business Profile only — not personal account","help_text_he":"פרופיל עסקי בלבד — לא חשבון אישי"}]',
 ARRAY['instagram_basic','instagram_content_publish'],
 ARRAY['instagram-agent'],
 6, true),

-- WEBSITE HOSTING
('website_hosting', 'Website Hosting Access', 'גישה לאחסון האתר',
 'hosting', 'username_password', '🌐',
 'Provide hosting access so we can make technical SEO improvements to your website.',
 'ספקו גישה לאחסון האתר כדי שנוכל לבצע שיפורי SEO טכניים.',
 '[
   {"key":"hosting_provider","label":"Hosting Provider","label_he":"ספק האחסון","type":"select","required":true,"options":["cPanel","Plesk","WordPress Admin","Wix","Webflow","Squarespace","AWS","Other"]},
   {"key":"login_url","label":"Login URL","label_he":"כתובת הכניסה","type":"url","required":true,"placeholder":"https://yourdomain.com/wp-admin"},
   {"key":"username","label":"Username","label_he":"שם משתמש","type":"text","required":true},
   {"key":"password","label":"Password","label_he":"סיסמה","type":"password","required":true,"help_text":"Stored encrypted. We never share credentials.","help_text_he":"מאוחסן מוצפן. לעולם לא נשתף פרטים."},
   {"key":"notes","label":"Notes","label_he":"הערות","type":"textarea","required":false,"placeholder":"e.g. FTP access, staging URL, etc."}
 ]',
 '{}',
 ARRAY['technical-seo-crawl-agent','website-qa-agent','regression-agent'],
 7, true),

-- WORDPRESS (if applicable)
('wordpress', 'WordPress Admin', 'וורדפרס אדמין',
 'cms', 'username_password', '🔵',
 'WordPress admin access for technical SEO, schema, and performance improvements.',
 'גישת אדמין לוורדפרס לשיפורי SEO טכני, סכמה וביצועים.',
 '[
   {"key":"site_url","label":"WordPress Site URL","label_he":"כתובת האתר","type":"url","required":true},
   {"key":"admin_url","label":"Admin URL","label_he":"כתובת הניהול","type":"url","required":false,"placeholder":"https://yourdomain.com/wp-admin"},
   {"key":"username","label":"Admin Username","label_he":"שם משתמש אדמין","type":"text","required":true},
   {"key":"password","label":"Password / App Password","label_he":"סיסמה","type":"password","required":true},
   {"key":"has_elementor","label":"Uses Elementor?","label_he":"משתמש באלמנטור?","type":"boolean","required":false}
 ]',
 '{}',
 ARRAY['technical-seo-crawl-agent','website-content-agent','website-qa-agent'],
 8, true),

-- GOOGLE SHEETS (SEO data staging)
('google_sheets_seo', 'Google Sheets — SEO Data', 'גוגל שיטס — נתוני SEO',
 'seo', 'manual', '📋',
 'Paste your Google Sheets URL where we will import SEO and backlink data.',
 'הדביקו את כתובת גוגל שיטס ממנו נייבא נתוני SEO וקישורים.',
 '[
   {"key":"sheet_url","label":"Google Sheets URL","label_he":"קישור לגיליון","type":"url","required":true,"placeholder":"https://docs.google.com/spreadsheets/d/...","help_text":"Make sure the sheet is set to Anyone with the link can view","help_text_he":"ודאו שהגיליון מוגדר לצפייה לכל מי שיש לו קישור"}
 ]',
 '{}',
 ARRAY['seo-core-agent','competitor-intelligence-agent'],
 9, true),

-- WEBSITE URL (basic — always included)
('website_url', 'Website URL', 'כתובת האתר',
 'other', 'manual', '🌍',
 'Your website address so we can audit and monitor it.',
 'כתובת האתר שלכם כדי שנוכל לבצע ביקורת וניטור.',
 '[
   {"key":"website_url","label":"Website URL","label_he":"כתובת האתר","type":"url","required":true,"placeholder":"https://yourwebsite.com"},
   {"key":"sitemap_url","label":"Sitemap URL (optional)","label_he":"כתובת מפת האתר (אופציונלי)","type":"url","required":false,"placeholder":"https://yourwebsite.com/sitemap.xml"}
 ]',
 '{}',
 ARRAY['technical-seo-crawl-agent','seo-core-agent','regression-agent'],
 0, true),

-- REVIEW PLATFORMS
('review_platforms', 'Review Platforms', 'פלטפורמות ביקורות',
 'review', 'manual', '⭐',
 'Tell us where your reviews appear so we can monitor and respond.',
 'ספרו לנו היכן מופיעות הביקורות שלכם כדי שנוכל לנטר ולהגיב.',
 '[
   {"key":"google_maps_url","label":"Google Maps Business URL","label_he":"קישור לגוגל מפות","type":"url","required":false},
   {"key":"lawreviews_url","label":"LawReviews.co.il URL","label_he":"קישור ל-LawReviews","type":"url","required":false},
   {"key":"other_platforms","label":"Other Review Sites","label_he":"פלטפורמות נוספות","type":"textarea","required":false,"placeholder":"e.g. Facebook reviews, Zap, etc."}
 ]',
 '{}',
 ARRAY['reviews-gbp-authority-agent','local-seo-agent'],
 10, true),

-- EMAIL / SMTP (for report sending)
('smtp_email', 'Email for Reports', 'אימייל לדוחות',
 'email', 'manual', '✉️',
 'Email address where you want to receive reports.',
 'כתובת האימייל לקבלת דוחות.',
 '[
   {"key":"report_email","label":"Report Email","label_he":"אימייל לדוחות","type":"email","required":true},
   {"key":"report_language","label":"Preferred Report Language","label_he":"שפת דוחות מועדפת","type":"select","required":true,"options":["עברית","English"]}
 ]',
 '{}',
 ARRAY['report-composer-agent'],
 11, true),

-- WOOCOMMERCE / ECOMMERCE (optional)
('woocommerce', 'WooCommerce / eCommerce', 'חנות מקוונת',
 'ecommerce', 'api_key', '🛒',
 'Connect your online store for conversion and revenue tracking.',
 'חברו את החנות המקוונת למעקב המרות והכנסות.',
 '[
   {"key":"store_url","label":"Store URL","label_he":"כתובת החנות","type":"url","required":true},
   {"key":"consumer_key","label":"WooCommerce Consumer Key","label_he":"מפתח צרכן","type":"text","required":true},
   {"key":"consumer_secret","label":"Consumer Secret","label_he":"סוד צרכן","type":"password","required":true}
 ]',
 '{}',
 ARRAY['analytics-conversion-integrity-agent'],
 12, true),

-- CUSTOM API KEY
('custom_api', 'Custom API / Webhook', 'API או Webhook מותאם',
 'other', 'api_key', '🔑',
 'Connect any custom API or webhook endpoint.',
 'חברו כל API מותאם אישית או נקודת webhook.',
 '[
   {"key":"api_name","label":"Service Name","label_he":"שם השירות","type":"text","required":true},
   {"key":"api_url","label":"API Base URL","label_he":"כתובת ה-API","type":"url","required":false},
   {"key":"api_key","label":"API Key","label_he":"מפתח API","type":"password","required":true}
 ]',
 '{}',
 ARRAY[]::TEXT[],
 99, true);
-- ============================================================
-- AI GROWTH OS — ONBOARDING PORTAL SCHEMA
-- onboarding_sessions, oauth_credentials, client_integrations,
-- client_onboarding_truth, integration_assets
-- ============================================================

-- ONBOARDING SESSIONS (signed tokens, time-limited)
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,   -- SHA-256 hash only — raw token never stored
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending','in_progress','awaiting_finalize','completed','expired','revoked'
  )),
  language TEXT DEFAULT 'he',
  requested_connectors TEXT[] DEFAULT '{}',
  completed_connectors TEXT[] DEFAULT '{}',
  skipped_connectors TEXT[] DEFAULT '{}',
  -- Steps completed
  step_welcome_done BOOLEAN DEFAULT false,
  step_connectors_done BOOLEAN DEFAULT false,
  step_business_truth_done BOOLEAN DEFAULT false,
  step_finalized BOOLEAN DEFAULT false,
  -- Pre-detected assets (shown to client on welcome)
  pre_detected JSONB DEFAULT '{}',
  -- Client info for the page
  client_name TEXT,
  client_email TEXT,
  custom_message TEXT,
  custom_message_he TEXT,
  -- Security
  ip_created TEXT,
  ip_last_used TEXT,
  user_agent TEXT,
  -- Notification
  notify_email TEXT,
  -- Timing
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '72 hours',
  first_opened_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  -- Reminders
  reminder_1_sent_at TIMESTAMPTZ,
  reminder_2_sent_at TIMESTAMPTZ,
  created_by TEXT DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- OAUTH CREDENTIALS (encrypted at rest, server-side only)
CREATE TABLE IF NOT EXISTS oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN (
    'google','meta','linkedin','twitter'
  )),
  -- Sub-provider specifics
  sub_provider TEXT,                  -- 'search_console','ads','business_profile','analytics','sheets'
  -- ENCRYPTED — never expose to frontend
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  encryption_iv TEXT NOT NULL,
  -- Safe metadata
  token_type TEXT DEFAULT 'Bearer',
  expires_at TIMESTAMPTZ,
  scopes_granted TEXT[] DEFAULT '{}',
  -- Account info
  external_account_id TEXT,          -- Google account ID or Meta user ID
  external_account_email TEXT,
  external_account_name TEXT,
  -- Status
  status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','revoked','limited')),
  scope_sufficiency TEXT DEFAULT 'full' CHECK (scope_sufficiency IN ('full','limited','missing')),
  -- Sync
  last_refresh_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  -- Metadata (non-sensitive: property counts, account labels, etc.)
  metadata_json JSONB DEFAULT '{}',
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, provider, sub_provider)
);

-- CLIENT INTEGRATIONS (high-level status per provider)
CREATE TABLE IF NOT EXISTS client_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  sub_provider TEXT,
  status TEXT DEFAULT 'not_connected' CHECK (status IN (
    'not_connected','connecting','connected','limited','error','disconnected'
  )),
  scopes_granted TEXT[] DEFAULT '{}',
  external_account_id TEXT,
  external_account_name TEXT,
  external_account_email TEXT,
  -- Post-connection discovery summary
  discovery_summary JSONB DEFAULT '{}',  -- {properties_found, campaigns_found, reviews_found, etc}
  selected_asset_id TEXT,                -- which property/account they selected
  selected_asset_label TEXT,
  -- Timestamps
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, provider, sub_provider)
);

-- CLIENT ONBOARDING TRUTH (business profile from manual step)
CREATE TABLE IF NOT EXISTS client_onboarding_truth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  -- Identity
  business_type TEXT,
  primary_services TEXT[] DEFAULT '{}',
  -- Geography
  target_locations TEXT[] DEFAULT '{}',
  primary_city TEXT,
  primary_country TEXT DEFAULT 'IL',
  -- Audiences
  target_audiences TEXT[] DEFAULT '{}',
  forbidden_audiences TEXT[] DEFAULT '{}',
  -- Positioning
  differentiators TEXT,
  competitive_advantage TEXT,
  -- Communication
  tone TEXT DEFAULT 'professional',
  brand_voice TEXT,
  -- Compliance
  compliance_notes TEXT,
  legal_advertising_restrictions TEXT,
  -- Reporting
  report_language TEXT DEFAULT 'he',
  report_frequency TEXT DEFAULT 'weekly',
  report_recipients TEXT[] DEFAULT '{}',
  -- Goals
  primary_goal TEXT,
  secondary_goals TEXT[] DEFAULT '{}',
  monthly_budget_approx TEXT,
  -- Tracking
  analytics_key_events TEXT[] DEFAULT '{}',
  -- Social
  social_posting_hebrew_only BOOLEAN DEFAULT true,
  facebook_page_type TEXT DEFAULT 'business',
  instagram_account_type TEXT DEFAULT 'business',
  -- Completed
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- INTEGRATION ASSETS (properties, accounts, locations discovered after OAuth)
CREATE TABLE IF NOT EXISTS integration_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  sub_provider TEXT,
  asset_type TEXT NOT NULL,           -- 'property','account','location','page','profile'
  external_id TEXT NOT NULL,
  label TEXT,
  url TEXT,
  is_selected BOOLEAN DEFAULT false,
  metadata_json JSONB DEFAULT '{}',
  discovered_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, provider, external_id)
);

-- INGESTION JOBS (triggered immediately after each connection)
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  sub_provider TEXT,
  job_type TEXT NOT NULL,             -- 'keywords','campaigns','reviews','pages','rankings'
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  triggered_by TEXT DEFAULT 'onboarding',
  asset_id TEXT,                      -- which property/account to sync
  rows_synced INTEGER DEFAULT 0,
  summary JSONB DEFAULT '{}',         -- {keywords_found, campaigns_found, etc}
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ONBOARDING EVENTS (full audit trail of client actions)
CREATE TABLE IF NOT EXISTS onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  provider TEXT,
  sub_provider TEXT,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_token ON onboarding_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_client ON onboarding_sessions(client_id, status);
CREATE INDEX IF NOT EXISTS idx_oauth_creds_client ON oauth_credentials(client_id, provider, status);
CREATE INDEX IF NOT EXISTS idx_integrations_client ON client_integrations(client_id, provider);
CREATE INDEX IF NOT EXISTS idx_assets_client ON integration_assets(client_id, provider, is_selected);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_client ON ingestion_jobs(client_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_session ON onboarding_events(session_id, created_at DESC);

-- TRIGGERS
CREATE OR REPLACE FUNCTION update_updated_at_onboarding()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sessions_ua BEFORE UPDATE ON onboarding_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_onboarding();
CREATE TRIGGER trg_oauth_creds_ua BEFORE UPDATE ON oauth_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_onboarding();
CREATE TRIGGER trg_integrations_ua BEFORE UPDATE ON client_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_onboarding();
CREATE TRIGGER trg_truth_ua BEFORE UPDATE ON client_onboarding_truth FOR EACH ROW EXECUTE FUNCTION update_updated_at_onboarding();
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
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_website_id, secret_type)
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

-- RLS policies: service_role bypasses RLS. Add tenant isolation policies
-- when user auth is implemented (requires user_client_access table).
-- For now, all access is via service_role key which bypasses RLS.

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
