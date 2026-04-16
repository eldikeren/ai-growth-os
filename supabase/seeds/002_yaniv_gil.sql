-- ============================================================
-- AI GROWTH OS — YANIV GIL COMPLETE SEED
-- Client + Profile + Rules + Memory + Baselines + Competitors
-- Keywords + Credentials + Assignments for all 23 agents
-- ============================================================

-- CLIENT
INSERT INTO clients (id, name, domain, status) VALUES
('00000000-0000-0000-0000-000000000001', 'Yaniv Gil Law Firm', 'yanivgil.co.il', 'active');

-- PROFILE
INSERT INTO client_profiles (client_id, business_type, industry, sub_industry, language, rtl_required, brand_voice, timezone, notes) VALUES
('00000000-0000-0000-0000-000000000001',
 'law firm', 'legal services', 'family law / divorce / inheritance / insolvency / child custody',
 'he', true, 'premium, formal, authoritative, empathetic',
 'Asia/Jerusalem',
 'Tel Aviv family law attorney. Yaniv Gil, Esq. Primary digital manager: Elad Keren (elad.d.keren@gmail.com). Site built in Next.js. 94+ pages across 10 topic clusters published.');

-- RULES
INSERT INTO client_rules (
  client_id, source_of_truth, pre_run_document,
  allowed_accounts, forbidden_accounts, analytics_allowed_key_events,
  special_policies, post_change_validation_mandatory, reviews_voice, social_restrictions, custom_instructions
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Google Drive',
  'CLAUDE.md',
  ARRAY['elad.d.keren@gmail.com'],
  ARRAY['elad@netop.cloud'],
  ARRAY['Contact', 'form_submit', 'whatsapp_click', 'generate_lead'],
  '[
    "Google Drive is the sole source of truth for all client documents and assets. Never use local disk as a permanent storage location.",
    "Local disk usage is temporary only — all final outputs must be committed to Google Drive.",
    "Strict UTF-8 encoding required for all Hebrew content file operations — verify encoding on every write.",
    "No cheap stock images — all imagery must be premium, professional, and appropriate for a high-end law firm.",
    "No emojis in any professional client-facing asset — website, email, GBP posts, social posts — unless explicitly approved in writing by client.",
    "Post-change validation chain is mandatory for all website and content changes: QA → Design Enforcement → Hebrew Quality → Regression in that order.",
    "All review responses must use plural office voice: we / our firm / our team / אנחנו / המשרד שלנו. First-person singular is strictly forbidden.",
    "Facebook: Business Page only — never personal profile. Access via elad.d.keren@gmail.com only.",
    "Instagram: Business Profile only — never personal account.",
    "Legal advertising compliance: no guaranteed outcomes, no specific case results without anonymization, no comparative superlatives without evidence. Israeli Bar Association rules apply.",
    "All analytics must track only allowed key events: Contact, form_submit, whatsapp_click, generate_lead. No other events should be tracked without explicit approval.",
    "WhatsApp is a primary contact channel for Israeli users — all CTA strategies must include WhatsApp options.",
    "Hebrew content must use formal register (לשון גבוהה) throughout. No informal language, slang, or colloquialisms.",
    "RTL formatting must be verified on every content change. Hebrew text must render correctly right-to-left.",
    "Media mentions exist in Ynet, Mako, Walla, TheMarker, PsakDin — these are actual backlinks that should be tracked and monitored for SEO link value."
  ]',
  true,
  'office',
  '{"facebook": "business_page_only", "instagram": "business_profile_only", "tiktok": "not_approved", "twitter": "not_approved"}',
  'Primary goal: achieve page 1 rankings for core family law Tel Aviv keywords. Secondary goal: local 3-pack entry. Key asset: 218 LawReviews reviews at 5.0 — leverage heavily. Key gap: Google review count at ~18 vs competitor avg 40-150+. Site is Next.js — technical recommendations must be Next.js compatible. Backlink profile is thin — link building is a priority.'
);

-- MEMORY ITEMS (13 detailed operational memory items)
INSERT INTO memory_items (client_id, scope, type, content, tags, source, approved, relevance_score) VALUES

-- Reviews
('00000000-0000-0000-0000-000000000001', 'reviews', 'social_proof',
 '218 verified reviews on LawReviews.co.il with a perfect 5.0 / 5.0 rating. This is a significant competitive advantage and must be prominently displayed on the website. The LawReviews platform is highly trusted among Israeli legal service seekers.',
 ARRAY['reviews', 'lawreviews', 'trust', 'competitive_advantage'], 'manual', true, 1.0),

('00000000-0000-0000-0000-000000000001', 'reviews', 'gap',
 'Approximately 18 Google reviews currently. This number is significantly lower than typical local 3-pack entries in family law Tel Aviv, which range from 40 to 150+ reviews. Google review count is a primary local ranking factor. Review generation is a high priority.',
 ARRAY['reviews', 'google', 'local-seo', 'gap', 'priority'], 'manual', true, 0.95),

-- Rankings
('00000000-0000-0000-0000-000000000001', 'rankings', 'status',
 'Client is not currently ranking on page 1 for any primary target keywords in family law Tel Aviv. Primary organic goal is to achieve page 1 rankings for: עורך דין גירושין תל אביב, עורך דין משפחה תל אביב, עורך דין ירושה תל אביב, עורך דין מזונות, עורך דין משמורת ילדים.',
 ARRAY['rankings', 'seo', 'goal', 'organic'], 'manual', true, 1.0),

('00000000-0000-0000-0000-000000000001', 'rankings', 'local',
 'Client is not in the Google local 3-pack for any primary family law Tel Aviv search terms. Competitor A holds strong 3-pack positions. Achieving local 3-pack placement is a primary KPI. Key factors needed: more Google reviews, stronger GBP signals, local citation building.',
 ARRAY['local-seo', '3-pack', 'goal', 'priority'], 'manual', true, 1.0),

-- Technical
('00000000-0000-0000-0000-000000000001', 'performance', 'technical',
 'Mobile PageSpeed score is approximately 60/100. Target is 80+. Primary issues: render-blocking JavaScript and CSS resources, large unoptimized images on homepage, missing next/font implementation for Hebrew font loading. Site is built on Next.js. LCP is the main bottleneck — caused by hero image loading.',
 ARRAY['pagespeed', 'mobile', 'technical', 'nextjs', 'lcp'], 'manual', true, 0.95),

('00000000-0000-0000-0000-000000000001', 'performance', 'ux',
 'Contact page average session duration is approximately 22 seconds before bounce. This indicates friction in the contact/conversion flow. The page may lack sufficient trust signals or the form may have too much friction. This is a CRO priority.',
 ARRAY['contact', 'bounce', 'cro', 'ux', 'baseline'], 'manual', true, 0.90),

-- Technical debt
('00000000-0000-0000-0000-000000000001', 'technical_debt', 'schema',
 'Missing schema markup identified: LocalBusiness schema missing on contact page, FAQ schema missing on all FAQ and service pages, LegalService schema not implemented on service pages, BreadcrumbList not on all inner pages. Schema implementation is a technical SEO priority.',
 ARRAY['schema', 'technical-debt', 'seo', 'priority'], 'manual', true, 0.90),

-- Content
('00000000-0000-0000-0000-000000000001', 'content', 'status',
 'Content build of 94+ pages across 10 topic clusters was initiated. Hebrew content covering divorce (גירושין), inheritance (ירושה), insolvency/bankruptcy (פשיטת רגל), child custody (משמורת ילדים), alimony (מזונות), prenuptial agreements (הסכם ממון), property division (חלוקת רכוש), general family law, FAQ, and local Tel Aviv content.',
 ARRAY['content', 'clusters', 'hebrew', 'published'], 'manual', true, 0.85),

-- Backlinks
('00000000-0000-0000-0000-000000000001', 'backlinks', 'status',
 'Backlink profile is thin. Actual backlinks exist from Ynet, Mako, Walla, TheMarker, PsakDin — these are real backlinks that should be tracked and monitored for SEO value. Link building from Israeli legal and media sites remains a high priority to expand the backlink profile further.',
 ARRAY['backlinks', 'link-building', 'priority', 'gap'], 'manual', true, 0.95),

('00000000-0000-0000-0000-000000000001', 'backlinks', 'targets',
 'Approved link target sites for outreach: News1 (news1.co.il), Bizportal (bizportal.co.il), Channel 13 (13tv.co.il), Mynet Tel Aviv (mynet.co.il/telaviv), Davar Rishon (davar1.co.il), AskMen IL, Ynet sponsored article. Budget ceiling applies per placement. Do not contact for backlinks without Elad approval.',
 ARRAY['link-targets', 'outreach', 'approved', 'israeli-media'], 'manual', true, 0.90),

-- Ads
('00000000-0000-0000-0000-000000000001', 'ads', 'status',
 'Google Ads campaigns are active for family law keywords in Tel Aviv. Major negative keyword cleanup was performed. Key conversion events configured: Contact, form_submit, whatsapp_click, generate_lead. Google Ads managed via elad.d.keren@gmail.com only.',
 ARRAY['google-ads', 'conversions', 'paid', 'active'], 'manual', true, 0.80),

-- Social
('00000000-0000-0000-0000-000000000001', 'social', 'status',
 'Facebook Business Page and Instagram Business Profile have been set up. Social management was partially handed to Yaniv Gil for direct posting with AI assistance for content drafting. All posts require approval before publishing. No personal profiles are to be used.',
 ARRAY['social', 'facebook', 'instagram', 'setup'], 'manual', true, 0.75),

-- Competitors
('00000000-0000-0000-0000-000000000001', 'competitors', 'intelligence',
 'Three known primary competitors in Tel Aviv family law: Competitor A — strong GBP presence, in local 3-pack, high Google review count, weaker content. Competitor B — high content volume across many pages, thin quality, weak backlink profile, not well-known. Competitor C — strong backlink profile from legal directories, high DA, weaker GBP and reviews.',
 ARRAY['competitors', 'family-law', 'tel-aviv', 'intelligence'], 'manual', true, 0.85);

-- BASELINES (9 key metrics)
INSERT INTO baselines (client_id, metric_name, metric_value, metric_text, source, target_value) VALUES
('00000000-0000-0000-0000-000000000001', 'mobile_pagespeed', 60, '60/100', 'PageSpeed Insights', 80),
('00000000-0000-0000-0000-000000000001', 'desktop_pagespeed', 82, '82/100', 'PageSpeed Insights', 95),
('00000000-0000-0000-0000-000000000001', 'google_reviews_count', 18, '~18 reviews', 'Google Business Profile', 100),
('00000000-0000-0000-0000-000000000001', 'google_reviews_rating', 5.0, '5.0 / 5.0', 'Google Business Profile', 5.0),
('00000000-0000-0000-0000-000000000001', 'lawreviews_count', 218, '218 reviews', 'LawReviews.co.il', 250),
('00000000-0000-0000-0000-000000000001', 'lawreviews_rating', 5.0, '5.0 / 5.0', 'LawReviews.co.il', 5.0),
('00000000-0000-0000-0000-000000000001', 'contact_page_avg_session_seconds', 22, '22 seconds avg before bounce', 'GA4', 45),
('00000000-0000-0000-0000-000000000001', 'local_3pack_present', 0, 'Not in local 3-pack', 'Manual check', 1),
('00000000-0000-0000-0000-000000000001', 'page1_keyword_count', 0, 'Zero primary keywords on page 1', 'GSC', 5),
('00000000-0000-0000-0000-000000000001', 'indexed_pages', 94, '94+ pages indexed', 'GSC', 120),
('00000000-0000-0000-0000-000000000001', 'referring_domains_count', 12, '~12 referring domains (editorial, no live URLs)', 'Manual audit', 50),
('00000000-0000-0000-0000-000000000001', 'domain_authority', 15, 'DA ~15 (estimated)', 'Moz estimate', 30);

-- COMPETITORS
INSERT INTO client_competitors (client_id, domain, name, domain_authority, notes) VALUES
('00000000-0000-0000-0000-000000000001', 'competitor-a-law.co.il', 'Competitor A', 28, 'Strong GBP presence and local 3-pack placement. High Google review count (~80+). Weaker blog content. Focus on local pack signals.'),
('00000000-0000-0000-0000-000000000001', 'competitor-b-law.co.il', 'Competitor B', 22, 'High content volume (200+ pages) but thin quality. Weak backlink profile. Not strongly in local pack. Content gap opportunity.'),
('00000000-0000-0000-0000-000000000001', 'competitor-c-law.co.il', 'Competitor C', 35, 'Strong backlink profile from legal directories (PsakDin, Lawguide, Bar Association). Weaker GBP and fewer reviews. Link-building benchmark.');

-- TARGET KEYWORDS (25 key Hebrew family law terms)
INSERT INTO client_keywords (client_id, keyword, volume, difficulty, current_position, target_position, search_intent, cluster) VALUES
('00000000-0000-0000-0000-000000000001', 'עורך דין גירושין תל אביב', 1200, 65, NULL, 1, 'transactional', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'עורך דין משפחה תל אביב', 900, 60, NULL, 1, 'transactional', 'דיני משפחה'),
('00000000-0000-0000-0000-000000000001', 'עורך דין ירושה תל אביב', 800, 55, NULL, 1, 'transactional', 'ירושה'),
('00000000-0000-0000-0000-000000000001', 'עורך דין מזונות', 700, 58, NULL, 3, 'transactional', 'מזונות'),
('00000000-0000-0000-0000-000000000001', 'עורך דין משמורת ילדים', 650, 55, NULL, 3, 'transactional', 'משמורת'),
('00000000-0000-0000-0000-000000000001', 'עורך דין גירושין', 2100, 72, NULL, 1, 'transactional', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'עורך דין ירושה', 1500, 68, NULL, 1, 'transactional', 'ירושה'),
('00000000-0000-0000-0000-000000000001', 'הסכם ממון', 1800, 45, NULL, 5, 'informational', 'הסכם ממון'),
('00000000-0000-0000-0000-000000000001', 'גירושין בהסכמה', 1100, 40, NULL, 5, 'informational', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'דיני ירושה בישראל', 900, 42, NULL, 5, 'informational', 'ירושה'),
('00000000-0000-0000-0000-000000000001', 'פשיטת רגל', 3500, 50, NULL, 5, 'informational', 'פשיטת רגל'),
('00000000-0000-0000-0000-000000000001', 'עורך דין פשיטת רגל', 600, 58, NULL, 3, 'transactional', 'פשיטת רגל'),
('00000000-0000-0000-0000-000000000001', 'חלוקת רכוש גירושין', 750, 45, NULL, 5, 'informational', 'חלוקת רכוש'),
('00000000-0000-0000-0000-000000000001', 'ייעוץ גירושין', 500, 48, NULL, 3, 'transactional', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'עורך דין צוואה', 850, 52, NULL, 3, 'transactional', 'ירושה'),
('00000000-0000-0000-0000-000000000001', 'מזונות ילדים', 1200, 38, NULL, 5, 'informational', 'מזונות'),
('00000000-0000-0000-0000-000000000001', 'הסכם גירושין', 900, 42, NULL, 5, 'informational', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'ירושה ללא צוואה', 700, 35, NULL, 5, 'informational', 'ירושה'),
('00000000-0000-0000-0000-000000000001', 'עורך דין דיני משפחה', 450, 55, NULL, 3, 'transactional', 'דיני משפחה'),
('00000000-0000-0000-0000-000000000001', 'בית משפט לענייני משפחה', 1100, 30, NULL, 5, 'informational', 'דיני משפחה'),
('00000000-0000-0000-0000-000000000001', 'גירושין קל ומהיר', 400, 35, NULL, 5, 'informational', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'זכויות בגירושין', 850, 38, NULL, 5, 'informational', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'עורך דין ירושה מומלץ', 300, 45, NULL, 3, 'transactional', 'ירושה'),
('00000000-0000-0000-0000-000000000001', 'עורך דין גירושין מומלץ תל אביב', 350, 50, NULL, 1, 'transactional', 'גירושין'),
('00000000-0000-0000-0000-000000000001', 'ייפוי כוח מתמשך', 600, 32, NULL, 5, 'informational', 'ירושה');

-- CREDENTIALS
INSERT INTO client_credentials (client_id, service, label, is_connected, health_score) VALUES
('00000000-0000-0000-0000-000000000001', 'google_ads', 'Google Ads', false, 0),
('00000000-0000-0000-0000-000000000001', 'google_analytics', 'Google Analytics 4', false, 0),
('00000000-0000-0000-0000-000000000001', 'google_search_console', 'Google Search Console', false, 0),
('00000000-0000-0000-0000-000000000001', 'google_business_profile', 'Google Business Profile', false, 0),
('00000000-0000-0000-0000-000000000001', 'openai', 'OpenAI API (gpt-4.1)', false, 0),
('00000000-0000-0000-0000-000000000001', 'facebook', 'Facebook Business Page', false, 0),
('00000000-0000-0000-0000-000000000001', 'instagram', 'Instagram Business Profile', false, 0),
('00000000-0000-0000-0000-000000000001', 'moz', 'Moz API (Domain Authority)', false, 0),
('00000000-0000-0000-0000-000000000001', 'dataforseo', 'DataForSEO API', false, 0);

-- ASSIGN ALL 23 AGENTS TO YANIV GIL
-- (agent_template_id will be the UUID generated at insert time)
-- This insert runs AFTER agents are seeded using slugs to find IDs
INSERT INTO client_agent_assignments (client_id, agent_template_id, enabled)
SELECT '00000000-0000-0000-0000-000000000001', id, true
FROM agent_templates
WHERE slug IN (
  'master-orchestrator', 'seo-core-agent', 'technical-seo-crawl-agent',
  'gsc-daily-monitor', 'google-ads-campaign-agent', 'analytics-conversion-integrity-agent',
  'cro-agent', 'website-content-agent', 'design-consistency-agent',
  'website-qa-agent', 'local-seo-agent', 'reviews-gbp-authority-agent',
  'competitor-intelligence-agent', 'facebook-agent', 'instagram-agent',
  'legal-agent', 'innovation-agent', 'design-enforcement-agent',
  'hebrew-quality-agent', 'regression-agent', 'credential-health-agent',
  'kpi-integrity-agent', 'report-composer-agent',
  'geo-ai-visibility-agent', 'content-distribution-agent'
);

-- DEFAULT SCHEDULES for key agents
INSERT INTO agent_schedules (client_id, agent_template_id, cron_expression, enabled, task_payload)
SELECT
  '00000000-0000-0000-0000-000000000001',
  at.id,
  s.cron_expr,
  true,
  s.payload::jsonb
FROM (VALUES
  ('gsc-daily-monitor', '0 8 * * *', '{"triggered_by": "schedule", "period": "daily"}'),
  ('seo-core-agent', '0 9 * * 1', '{"triggered_by": "schedule", "period": "weekly"}'),
  ('local-seo-agent', '0 9 * * 2', '{"triggered_by": "schedule", "period": "weekly"}'),
  ('reviews-gbp-authority-agent', '0 9 * * 3', '{"triggered_by": "schedule", "period": "weekly"}'),
  ('competitor-intelligence-agent', '0 9 * * 4', '{"triggered_by": "schedule", "period": "weekly"}'),
  ('credential-health-agent', '0 7 * * *', '{"triggered_by": "schedule", "period": "daily"}'),
  ('master-orchestrator', '0 6 * * *', '{"triggered_by": "schedule", "period": "daily"}'),
  ('report-composer-agent', '0 10 1 * *', '{"triggered_by": "schedule", "period": "monthly"}'),
  ('facebook-agent', '0 8 * * 0', '{"triggered_by": "schedule", "period": "weekly"}'),
  ('instagram-agent', '0 8 * * 0', '{"triggered_by": "schedule", "period": "weekly"}'),
  ('geo-ai-visibility-agent', '0 10 * * 3', '{"triggered_by": "schedule", "period": "weekly"}'),
  ('content-distribution-agent', '0 11 * * 0', '{"triggered_by": "schedule", "period": "weekly"}')
) AS s(slug, cron_expr, payload)
JOIN agent_templates at ON at.slug = s.slug;
