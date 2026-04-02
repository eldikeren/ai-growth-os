-- ============================================================
-- AI GROWTH OS — YANIV GIL COMPLETE ADDITIONS (003)
-- Connectors, prompt overrides, report templates, schedules,
-- report recipients, SEO action plans, link intelligence,
-- kpi_snapshots, schedule_definitions, run_steps structure
-- ============================================================

-- CLIENT LOCATIONS (Yaniv Gil Tel Aviv office)
INSERT INTO client_locations (client_id, label, city, region, country, is_primary) VALUES
('00000000-0000-0000-0000-000000000001', 'משרד ראשי', 'תל אביב', 'מרכז', 'IL', true);

-- CLIENT CONNECTORS (all 9 connector types, initially not synced)
INSERT INTO client_connectors (
  client_id, connector_type, label, is_active,
  sync_enabled, sync_frequency, config
) VALUES
('00000000-0000-0000-0000-000000000001', 'google_search_console', 'Google Search Console', true, false, 'daily',
  '{"property_url": "https://yanivgil.co.il/", "account": "elad.d.keren@gmail.com"}'),
('00000000-0000-0000-0000-000000000001', 'google_ads', 'Google Ads', true, false, 'daily',
  '{"customer_id": "", "account": "elad.d.keren@gmail.com", "campaigns_active": true}'),
('00000000-0000-0000-0000-000000000001', 'google_analytics', 'Google Analytics 4', true, false, 'daily',
  '{"measurement_id": "", "account": "elad.d.keren@gmail.com", "allowed_events": ["Contact","form_submit","whatsapp_click","generate_lead"]}'),
('00000000-0000-0000-0000-000000000001', 'google_business_profile', 'Google Business Profile', true, false, 'weekly',
  '{"location_id": "", "account": "elad.d.keren@gmail.com"}'),
('00000000-0000-0000-0000-000000000001', 'meta_business', 'Meta Business (Facebook + Instagram)', true, false, 'weekly',
  '{"page_type": "business_page", "instagram_type": "business_profile", "language": "he"}'),
('00000000-0000-0000-0000-000000000001', 'google_sheets', 'Google Sheets SEO Staging', true, false, 'weekly',
  '{"description": "Google Sheets staging area for SEO and link intelligence imports"}'),
('00000000-0000-0000-0000-000000000001', 'website', 'yanivgil.co.il', true, false, 'manual',
  '{"url": "https://yanivgil.co.il", "framework": "Next.js", "language": "he", "rtl": true}'),
('00000000-0000-0000-0000-000000000001', 'github', 'GitHub Repository', false, false, 'manual',
  '{"repo_url": "", "branch": "main"}'),
('00000000-0000-0000-0000-000000000001', 'email_smtp', 'Report Email Delivery', true, false, 'manual',
  '{"provider": "resend", "from_name": "Elad Digital", "from_email": "reports@elad.digital"}');

-- REPORT TEMPLATES (Hebrew and English)
INSERT INTO report_templates (name, name_he, report_type, language, is_rtl, sections, is_active) VALUES
('Daily Progress Report', 'דוח התקדמות יומי', 'daily_progress', 'he', true,
  '["executive_summary","kpi_snapshot","gsc_daily_digest","ads_daily","incidents","next_actions"]', true),
('Weekly Progress Report', 'דוח התקדמות שבועי', 'weekly_progress', 'he', true,
  '["executive_summary","kpi_snapshot","seo_weekly","local_seo","ads_weekly","content_activity","social","backlinks","next_priorities"]', true),
('Monthly Progress Report', 'דוח התקדמות חודשי', 'monthly_progress', 'he', true,
  '["executive_summary","kpi_dashboard","seo_monthly","local_seo","ads_monthly","content_audit","backlinks","competitors","strategic_next_quarter"]', true),
('Weekly SEO Report', 'דוח SEO שבועי', 'weekly_seo', 'he', true,
  '["rankings_summary","top_movers","regressions","content_gaps","backlink_activity","technical_flags","action_plan"]', true),
('Weekly Paid Ads Report', 'דוח פרסום ממומן שבועי', 'weekly_paid_ads', 'he', true,
  '["spend_summary","conversion_summary","quality_score_flags","negative_keywords","bid_recommendations","compliance_flags"]', true),
('Weekly Growth Report', 'דוח צמיחה שבועי', 'weekly_growth', 'he', true,
  '["executive_summary","kpi_snapshot","top_wins","key_blockers","next_week_priorities"]', true),
('Weekly SEO Report (EN)', 'Weekly SEO Report', 'weekly_seo', 'en', false,
  '["rankings_summary","top_movers","regressions","content_gaps","backlink_activity","technical_flags","action_plan"]', true),
('Weekly Paid Ads Report (EN)', 'Weekly Paid Ads Report', 'weekly_paid_ads', 'en', false,
  '["spend_summary","conversion_summary","quality_score_flags","negative_keywords","bid_recommendations"]', true),
('Weekly Growth Report (EN)', 'Weekly Growth Report', 'weekly_growth', 'en', false,
  '["executive_summary","kpi_snapshot","top_wins","key_blockers","next_week_priorities"]', true);

-- REPORT SCHEDULES for Yaniv Gil
INSERT INTO report_schedules (
  client_id, report_type, language, timezone,
  schedule_type, days_of_week, send_time, is_active
) VALUES
-- Weekly Hebrew progress report — every Sunday at 8am
('00000000-0000-0000-0000-000000000001', 'weekly_progress', 'he', 'Asia/Jerusalem', 'weekly', '{0}', '08:00:00', true),
-- Monthly Hebrew report — 1st of month at 9am
('00000000-0000-0000-0000-000000000001', 'monthly_progress', 'he', 'Asia/Jerusalem', 'monthly', '{}', '09:00:00', true),
-- Weekly SEO report — every Monday at 8am
('00000000-0000-0000-0000-000000000001', 'weekly_seo', 'he', 'Asia/Jerusalem', 'weekly', '{1}', '08:00:00', false);

-- REPORT RECIPIENTS for Yaniv Gil
INSERT INTO report_recipients (client_id, email, name, language_preference, is_active)
SELECT
  '00000000-0000-0000-0000-000000000001',
  rs.email, rs.name, rs.lang, true
FROM (VALUES
  ('elad.d.keren@gmail.com', 'Elad Keren', 'he'),
  ('yaniv@yanivgil.co.il', 'יניב גיל', 'he')
) AS rs(email, name, lang);

-- KPI SNAPSHOTS — real seeded values with source verification
INSERT INTO kpi_snapshots (client_id, metric_name, metric_value, metric_text, source, source_verified, data_date) VALUES
('00000000-0000-0000-0000-000000000001', 'mobile_pagespeed', 60, '60/100', 'PageSpeed Insights manual run', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'desktop_pagespeed', 82, '82/100', 'PageSpeed Insights manual run', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'google_reviews_count', 18, '~18 reviews', 'Google Business Profile manual count', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'google_reviews_rating', 5.0, '5.0/5.0', 'Google Business Profile manual check', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'lawreviews_count', 218, '218 reviews', 'LawReviews.co.il manual count', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'lawreviews_rating', 5.0, '5.0/5.0', 'LawReviews.co.il manual check', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'contact_page_session_seconds', 22, '22 seconds avg before bounce', 'GA4 manual session analysis', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'local_3pack_present', 0, 'Not in local 3-pack for any primary term', 'Manual SERP check', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'page1_keywords', 0, 'Zero primary keywords on page 1', 'GSC + manual SERP check', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'indexed_pages', 94, '94+ pages indexed', 'GSC Index Coverage', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'referring_domains', 12, '~12 referring domains (editorial, no live dofollow)', 'Manual audit', true, CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'domain_authority', 15, 'DA ~15 (Moz estimate — NOT a Google metric)', 'Moz third-party estimate', true, CURRENT_DATE);

-- MISSING REFERRING DOMAINS (imported/seeded examples)
INSERT INTO missing_referring_domains (
  client_id, domain, competitors_that_have_it, competitor_count,
  domain_authority, relevance_score, category, priority_score,
  recommended_acquisition_type, ai_rationale, imported_from_sheet
) VALUES
('00000000-0000-0000-0000-000000000001', 'psaqdin.co.il', ARRAY['competitor-a-law.co.il','competitor-c-law.co.il'], 2, 38, 0.95, 'legal_directory', 92, 'directory', 'פסק דין הוא ספריית פסיקה משפטית מרכזית בישראל. קישור משם יהיה בעל רלוונטיות גבוהה', true),
('00000000-0000-0000-0000-000000000001', 'lawguide.co.il', ARRAY['competitor-a-law.co.il','competitor-b-law.co.il','competitor-c-law.co.il'], 3, 32, 0.92, 'legal_directory', 90, 'directory', 'Law Guide הוא מדריך משפטי ישראלי מוביל. כל המתחרים מופיעים שם', true),
('00000000-0000-0000-0000-000000000001', 'ynet.co.il', ARRAY['competitor-c-law.co.il'], 1, 78, 0.75, 'news_media', 85, 'pr', 'ינט הוא אחד מאתרי החדשות הגדולים בישראל. קישור עדכני נדרש — יש ציטוט ישן ללא URL', true),
('00000000-0000-0000-0000-000000000001', 'themarker.com', ARRAY['competitor-c-law.co.il'], 1, 71, 0.70, 'business_media', 80, 'pr', 'דה מרקר — ביזנס. רלוונטי לסיפורי גירושין עסקיים ופשיטות רגל', true),
('00000000-0000-0000-0000-000000000001', 'bizportal.co.il', ARRAY['competitor-b-law.co.il'], 1, 42, 0.72, 'business_media', 72, 'guest_post', 'ביזפורטל — ניתן לפרסם תוכן מומחה על גירושין עסקיים', true),
('00000000-0000-0000-0000-000000000001', 'news1.co.il', ARRAY['competitor-a-law.co.il'], 1, 38, 0.68, 'news_media', 68, 'pr', 'ניוז 1 — כלי תקשורת מקוון ישראלי', true),
('00000000-0000-0000-0000-000000000001', 'mynet.co.il', ARRAY['competitor-a-law.co.il','competitor-b-law.co.il'], 2, 35, 0.65, 'local_directory', 65, 'directory', 'מיינט תל אביב — ספריית עסקים מקומית', true);

-- LINK OPPORTUNITIES (AI-identified)
INSERT INTO link_opportunities (
  client_id, domain, opportunity_type, domain_authority,
  relevance_score, priority_score, effort, expected_impact,
  competitor_that_has_it, why_it_matters, outreach_strategy,
  owner_lane, ai_generated, generated_at
) VALUES
('00000000-0000-0000-0000-000000000001', 'psaqdin.co.il', 'competitor_gap', 38, 0.95, 92, 'low', 'high',
  'competitor-a-law.co.il', 'ספריית פסיקה משפטית מרכזית — כל המתחרים מופיעים', 'הגש פרופיל עורך דין חינמי דרך הטופס באתר', 'SEO Operations', true, now()),
('00000000-0000-0000-0000-000000000001', 'lawguide.co.il', 'competitor_gap', 32, 0.92, 90, 'low', 'high',
  'competitor-a-law.co.il', 'מדריך משפטי ישראלי — 3 מתחרים שם', 'הירשם כעורך דין מומלץ', 'SEO Operations', true, now()),
('00000000-0000-0000-0000-000000000001', 'ynet.co.il', 'authority_gap', 78, 0.75, 85, 'high', 'high',
  'competitor-c-law.co.il', 'DA 78 — פוטנציאל סמכות גבוה מאוד', 'יחסי ציבור — הצע מומחיות לכתב משפטי', 'Innovation and Competitive Edge', true, now()),
('00000000-0000-0000-0000-000000000001', 'themarker.com', 'authority_gap', 71, 0.70, 80, 'high', 'high',
  'competitor-c-law.co.il', 'DA 71 — כלכלה ועסקים — גירושין עסקיים', 'כתיבת מאמר דעה על גירושין עסקיים', 'Innovation and Competitive Edge', true, now()),
('00000000-0000-0000-0000-000000000001', 'davar1.co.il', 'editorial', 35, 0.65, 65, 'medium', 'medium',
  NULL, 'דבר ראשון — כלי תקשורת ישראלי', 'פנייה לכתב', 'SEO Operations', true, now());

-- SEO ACTION PLANS (specific prioritized actions)
INSERT INTO seo_action_plans (
  client_id, action_type, title, description,
  target_keyword, target_url, effort, expected_impact,
  owner_lane, priority_score, status
) VALUES
('00000000-0000-0000-0000-000000000001', 'page1_opportunity', 'השג עמוד 1 — הסכם ממון',
  'מילת המפתח "הסכם ממון" מדורגת בעמדה 12-18, נפח 1800, קושי 45. שיפור תוכן + קישורים פנימיים יכולים להביא לעמוד 1.',
  'הסכם ממון', 'https://yanivgil.co.il/hesek-mamon', 'medium', 'high', 'SEO Operations', 95, 'open'),
('00000000-0000-0000-0000-000000000001', 'page1_opportunity', 'השג עמוד 1 — גירושין בהסכמה',
  'מילת המפתח "גירושין בהסכמה" נפח 1100, קושי 40. פוטנציאל גבוה לדף ייעודי מורחב.',
  'גירושין בהסכמה', 'https://yanivgil.co.il/geirushin-behaskama', 'medium', 'high', 'SEO Operations', 90, 'open'),
('00000000-0000-0000-0000-000000000001', 'technical_gap', 'הוסף LocalBusiness Schema לדף יצירת קשר',
  'דף יצירת קשר חסר LocalBusiness schema markup. זה משפיע על Local Pack ועל Knowledge Panel.',
  NULL, 'https://yanivgil.co.il/contact', 'low', 'high', 'Website Content, UX, and Design', 88, 'open'),
('00000000-0000-0000-0000-000000000001', 'technical_gap', 'הוסף FAQ Schema לדפי שירות',
  'כל דפי השירות חסרים FAQ schema. הוספה תשפר CTR ב-SERP.',
  NULL, NULL, 'medium', 'high', 'Website Content, UX, and Design', 85, 'open'),
('00000000-0000-0000-0000-000000000001', 'authority_gap', 'רשום פרופיל ב-PsakDin.co.il',
  'כל 3 המתחרים רשומים. רישום ישיר ב-DA 38 אתר משפטי רלוונטי.',
  NULL, NULL, 'low', 'high', 'SEO Operations', 92, 'open'),
('00000000-0000-0000-0000-000000000001', 'local_visibility_gap', 'הגדל Google Reviews מ-18 ל-50+',
  'מתחרה A ב-3-Pack עם 80+ ביקורות. יש 218 ביקורות ב-LawReviews — בנה מסלול לבקשת ביקורות Google מלקוחות מרוצים.',
  NULL, NULL, 'medium', 'high', 'Local Authority, Reviews, and GBP', 91, 'open'),
('00000000-0000-0000-0000-000000000001', 'content_gap', 'צור דף לייפוי כוח מתמשך',
  'נפח 600, קושי 32 — קל יחסית לדרג. אין לנו דף ייעודי.',
  'ייפוי כוח מתמשך', 'https://yanivgil.co.il/yifui-koach-mitmasech', 'low', 'medium', 'Website Content, UX, and Design', 75, 'open'),
('00000000-0000-0000-0000-000000000001', 'technical_gap', 'שפר Mobile PageSpeed מ-60 ל-80+',
  'Mobile PageSpeed 60. LCP היא הבעיה העיקרית — תמונת hero. Next.js: השתמש ב-next/image, next/font, dynamic imports.',
  NULL, 'https://yanivgil.co.il', 'high', 'high', 'Website Content, UX, and Design', 87, 'open');

-- SCHEDULE DEFINITIONS (generalized, includes reports and agents)
INSERT INTO schedule_definitions (
  client_id, schedule_type, target_type, cron_expression,
  timezone, is_active, task_payload
) VALUES
-- Daily GSC monitor at 8am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 8 * * *', 'Asia/Jerusalem', true, '{"agent_slug": "gsc-daily-monitor", "triggered_by": "scheduler"}'),
-- Daily credential health at 7am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 7 * * *', 'Asia/Jerusalem', true, '{"agent_slug": "credential-health-agent", "triggered_by": "scheduler"}'),
-- Daily master orchestrator at 6am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 6 * * *', 'Asia/Jerusalem', true, '{"agent_slug": "master-orchestrator", "triggered_by": "scheduler"}'),
-- Weekly SEO core — Monday 9am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 9 * * 1', 'Asia/Jerusalem', true, '{"agent_slug": "seo-core-agent", "triggered_by": "scheduler"}'),
-- Weekly local SEO — Tuesday 9am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 9 * * 2', 'Asia/Jerusalem', true, '{"agent_slug": "local-seo-agent", "triggered_by": "scheduler"}'),
-- Weekly reviews + GBP — Wednesday 9am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 9 * * 3', 'Asia/Jerusalem', true, '{"agent_slug": "reviews-gbp-authority-agent", "triggered_by": "scheduler"}'),
-- Weekly competitor intelligence — Thursday 9am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 9 * * 4', 'Asia/Jerusalem', true, '{"agent_slug": "competitor-intelligence-agent", "triggered_by": "scheduler"}'),
-- Weekly Facebook + Instagram — Sunday 8am
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 8 * * 0', 'Asia/Jerusalem', true, '{"agent_slug": "facebook-agent", "triggered_by": "scheduler"}'),
('00000000-0000-0000-0000-000000000001', 'agent', 'agent_template',
  '0 8 * * 0', 'Asia/Jerusalem', true, '{"agent_slug": "instagram-agent", "triggered_by": "scheduler"}'),
-- Monthly report — 1st of month at 10am
('00000000-0000-0000-0000-000000000001', 'report', 'report_schedule',
  '0 10 1 * *', 'Asia/Jerusalem', true, '{"report_type": "monthly_progress", "language": "he"}'),
-- Weekly Google Sheets sync — Monday 7am
('00000000-0000-0000-0000-000000000001', 'sync', 'connector',
  '0 7 * * 1', 'Asia/Jerusalem', false, '{"connector_type": "google_sheets", "sync_types": ["backlinks","referring_domains","competitor_link_gap","keyword_rankings"]}');

-- BACKLINK SNAPSHOT (initial seeded state)
INSERT INTO backlink_snapshots (
  client_id, total_backlinks, total_referring_domains,
  dofollow_backlinks, snapshot_date, source
) VALUES
('00000000-0000-0000-0000-000000000001', 12, 12, 0, CURRENT_DATE,
  'manual_audit — editorial mentions in Ynet, Mako, Walla, TheMarker, PsakDin. No live dofollow links confirmed.');

-- REFERRING DOMAIN SNAPSHOT (initial)
INSERT INTO referring_domain_snapshots (
  client_id, total_referring_domains, new_referring_domains,
  lost_referring_domains, avg_domain_authority, snapshot_date, source
) VALUES
('00000000-0000-0000-0000-000000000001', 12, 0, 0, 45.0, CURRENT_DATE,
  'manual_audit — media mentions only, no dofollow confirmed');

-- AUTHORITY SNAPSHOTS (third-party only — never labeled as Google metric)
INSERT INTO authority_snapshots (client_id, metric_name, metric_value, source, snapshot_date) VALUES
('00000000-0000-0000-0000-000000000001', 'domain_authority', 15, 'moz_estimate', CURRENT_DATE),
('00000000-0000-0000-0000-000000000001', 'spam_score', 2, 'moz_estimate', CURRENT_DATE);

-- COMPETITOR SNAPSHOTS
INSERT INTO competitor_snapshots (
  client_id, domain, domain_authority,
  referring_domains_count, snapshot_date, source
) VALUES
('00000000-0000-0000-0000-000000000001', 'competitor-a-law.co.il', 28, 45, CURRENT_DATE, 'manual_estimate'),
('00000000-0000-0000-0000-000000000001', 'competitor-b-law.co.il', 22, 28, CURRENT_DATE, 'manual_estimate'),
('00000000-0000-0000-0000-000000000001', 'competitor-c-law.co.il', 35, 62, CURRENT_DATE, 'manual_estimate');

-- CLIENT PROMPT OVERRIDE EXAMPLE (Yaniv Gil — Report Composer override for Hebrew)
INSERT INTO client_prompt_overrides (
  client_id,
  agent_template_id,
  prompt_text,
  is_active,
  change_notes,
  created_by
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM agent_templates WHERE slug = 'report-composer-agent' LIMIT 1),
  E'אתה עורך דוחות בכיר של Elad Digital. הדוח שלך מיועד ל-יניב גיל, עורך דין משפחה בתל אביב.\n\nכללים קשיחים לדוח זה:\n- הדוח כולו בעברית רשמית ומקצועית\n- RTL מלא — מימין לשמאל\n- אין אמוג''י בשום מקום\n- אין שפת ניוזלטר — שפה עסקית בלבד\n- כל נתון חייב מקור אמיתי\n- מספרים מדויקים בלבד — אין ניחושים\n- ממוגן Elad Digital בלבד\n- פנייה ישירה ל-יניב: "בתקופה זו" לא "הלקוח"\n\nמבנה הדוח המחייב:\n1. סיכום מנהלים (100-150 מילה)\n2. לוח מחוונים — נתונים אמיתיים בלבד\n3. SEO — מה עלה, מה ירד, מה הופיע\n4. SEO מקומי — ביקורות, GBP, 3-Pack\n5. גוגל אדס — הוצאה, המרות, CPA\n6. אתר — PageSpeed, בעיות טכניות, תוכן\n7. סושיאל — Facebook + Instagram\n8. פעולות שבוצעו בתקופה\n9. עדיפויות לתקופה הבאה (3-5 פעולות)\n10. הערות חשובות הדורשות תשומת לבך\n\nOutput: JSON מלא המכיל את כל הסעיפים לפי מבנה output_contract.',
  true,
  'Hebrew-first report composer override for Yaniv Gil law firm',
  'admin'
);
