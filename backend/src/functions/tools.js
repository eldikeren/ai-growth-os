// ============================================================
// AI GROWTH OS — AGENT TOOL LIBRARY
// Real executable tools for OpenAI function calling.
// Every tool calls real APIs, real databases. No stubs.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// TOOL DEFINITIONS — OpenAI function calling format
// ============================================================
export function getToolDefinitions(agentSlug, clientId) {
  const allTools = [
    // --- DATA FETCHING TOOLS ---
    {
      type: 'function',
      function: {
        name: 'fetch_pagespeed',
        description: 'Fetch Google PageSpeed Insights score and Core Web Vitals for a URL. Returns real Lighthouse data.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to analyze (e.g. https://yanivgil.co.il)' },
            strategy: { type: 'string', enum: ['mobile', 'desktop'], description: 'Device strategy. Default: mobile' }
          },
          required: ['url']
        }
      },
      allowed_agents: ['technical-seo-crawl-agent', 'seo-core-agent', 'website-qa-agent', 'regression-agent', 'master-orchestrator', 'credential-health-agent']
    },
    {
      type: 'function',
      function: {
        name: 'fetch_serp_rankings',
        description: 'Fetch current SERP rankings for a keyword using DataForSEO. Returns top 100 organic results with positions.',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'The search keyword (can be Hebrew)' },
            location_code: { type: 'number', description: 'DataForSEO location code. Default: 2376 (Israel)' },
            language_code: { type: 'string', description: 'Language code. Default: he' },
            domain: { type: 'string', description: 'Domain to highlight in results (e.g. yanivgil.co.il)' }
          },
          required: ['keyword']
        }
      },
      allowed_agents: ['seo-core-agent', 'technical-seo-crawl-agent', 'gsc-daily-monitor', 'competitor-intelligence-agent', 'local-seo-agent', 'geo-ai-visibility-agent']
    },
    {
      type: 'function',
      function: {
        name: 'fetch_backlink_data',
        description: 'Fetch backlink profile data for a domain using DataForSEO Backlinks API. Returns referring domains, backlink count, and domain rank.',
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Target domain (e.g. yanivgil.co.il)' },
            type: { type: 'string', enum: ['summary', 'referring_domains', 'new_lost'], description: 'Type of backlink data to fetch. Default: summary' }
          },
          required: ['domain']
        }
      },
      allowed_agents: ['seo-core-agent', 'competitor-intelligence-agent']
    },
    {
      type: 'function',
      function: {
        name: 'search_perplexity',
        description: 'Search using Perplexity AI for real-time web research. Returns AI-synthesized answer with source citations. Use for competitor research, industry trends, citation discovery, and GEO analysis.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The research query. Be specific and detailed.' },
            focus: { type: 'string', enum: ['web', 'academic', 'news', 'social'], description: 'Search focus. Default: web' }
          },
          required: ['query']
        }
      },
      allowed_agents: ['competitor-intelligence-agent', 'seo-core-agent', 'innovation-agent', 'geo-ai-visibility-agent', 'local-seo-agent', 'content-distribution-agent', 'website-content-agent']
    },
    {
      type: 'function',
      function: {
        name: 'fetch_google_reviews',
        description: 'Fetch Google Business Profile reviews count and rating using Google Places API.',
        parameters: {
          type: 'object',
          properties: {
            business_name: { type: 'string', description: 'Business name to search for (try both Hebrew and English names)' },
            place_id: { type: 'string', description: 'Optional Google Place ID if already known' },
            domain: { type: 'string', description: 'Website domain to help identify the business (e.g. homie-finance.com)' },
            location: { type: 'string', description: 'City/country to narrow the search (e.g. "Tel Aviv, Israel")' }
          },
          required: ['business_name']
        }
      },
      allowed_agents: ['reviews-gbp-authority-agent', 'local-seo-agent', 'master-orchestrator']
    },
    {
      type: 'function',
      function: {
        name: 'fetch_local_serp',
        description: 'Check if a business appears in Google Local 3-Pack for a keyword+location query.',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'Search keyword (e.g. עורך דין משפחה תל אביב)' },
            location_code: { type: 'number', description: 'DataForSEO location code. Default: 2376 (Israel)' },
            business_name: { type: 'string', description: 'Business name to check for in local results' }
          },
          required: ['keyword', 'business_name']
        }
      },
      allowed_agents: ['local-seo-agent', 'seo-core-agent', 'competitor-intelligence-agent']
    },

    // --- DATABASE QUERY TOOLS ---
    {
      type: 'function',
      function: {
        name: 'query_metrics',
        description: 'Query stored metrics for this client from the database. Returns metric history with timestamps.',
        parameters: {
          type: 'object',
          properties: {
            metric_name: { type: 'string', description: 'Name of metric (e.g. mobile_pagespeed, google_reviews_count, page1_keywords, domain_authority)' },
            limit: { type: 'number', description: 'Number of recent values to return. Default: 10' }
          },
          required: ['metric_name']
        }
      },
      allowed_agents: '*'
    },
    {
      type: 'function',
      function: {
        name: 'query_keywords',
        description: 'Query tracked keywords for this client with current positions, volume, and difficulty.',
        parameters: {
          type: 'object',
          properties: {
            filter: { type: 'string', enum: ['all', 'page1', 'page2', 'unranked', 'improved', 'dropped'], description: 'Filter keywords. Default: all' },
            limit: { type: 'number', description: 'Max results. Default: 50' }
          }
        }
      },
      allowed_agents: ['seo-core-agent', 'gsc-daily-monitor', 'technical-seo-crawl-agent', 'competitor-intelligence-agent', 'report-composer-agent', 'master-orchestrator', 'geo-ai-visibility-agent']
    },
    {
      type: 'function',
      function: {
        name: 'query_competitors',
        description: 'Query competitor data for this client including domains, DA, referring domains.',
        parameters: {
          type: 'object',
          properties: {
            include_link_gap: { type: 'boolean', description: 'Include competitor link gap data. Default: false' }
          }
        }
      },
      allowed_agents: ['competitor-intelligence-agent', 'seo-core-agent', 'innovation-agent', 'geo-ai-visibility-agent']
    },
    {
      type: 'function',
      function: {
        name: 'query_recent_runs',
        description: 'Query recent agent run results for this client. Useful to see what other agents found.',
        parameters: {
          type: 'object',
          properties: {
            agent_slug: { type: 'string', description: 'Filter by specific agent slug. Optional.' },
            status: { type: 'string', enum: ['success', 'failed', 'pending_approval'], description: 'Filter by status. Optional.' },
            limit: { type: 'number', description: 'Max results. Default: 10' }
          }
        }
      },
      allowed_agents: ['master-orchestrator', 'report-composer-agent', 'kpi-integrity-agent', 'regression-agent']
    },
    {
      type: 'function',
      function: {
        name: 'query_incidents',
        description: 'Query open incidents for this client.',
        parameters: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Filter by severity. Optional.' },
            status: { type: 'string', enum: ['open', 'investigating', 'resolved'], description: 'Filter by status. Default: open' }
          }
        }
      },
      allowed_agents: ['master-orchestrator', 'report-composer-agent', 'kpi-integrity-agent']
    },

    // --- ACTION TOOLS ---
    {
      type: 'function',
      function: {
        name: 'store_metric',
        description: 'Store a metric value in the database. Use after fetching real data.',
        parameters: {
          type: 'object',
          properties: {
            metric_name: { type: 'string', description: 'Name of metric to store' },
            value: { type: 'number', description: 'Numeric metric value' },
            source: { type: 'string', description: 'Data source (e.g. pagespeed_api, dataforseo, gsc)' },
            details: { type: 'object', description: 'Additional metric details as JSON' }
          },
          required: ['metric_name', 'value', 'source']
        }
      },
      allowed_agents: ['technical-seo-crawl-agent', 'gsc-daily-monitor', 'seo-core-agent', 'local-seo-agent', 'reviews-gbp-authority-agent', 'credential-health-agent', 'analytics-conversion-integrity-agent']
    },
    {
      type: 'function',
      function: {
        name: 'update_keyword_position',
        description: 'Update the current ranking position for a tracked keyword.',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: 'The keyword to update' },
            position: { type: 'number', description: 'New ranking position (1-100, or null if not ranking)' },
            url: { type: 'string', description: 'The ranking URL for this keyword' }
          },
          required: ['keyword', 'position']
        }
      },
      allowed_agents: ['seo-core-agent', 'gsc-daily-monitor']
    },
    {
      type: 'function',
      function: {
        name: 'update_baseline',
        description: 'Update a KPI baseline value and optionally its target.',
        parameters: {
          type: 'object',
          properties: {
            metric_name: { type: 'string', description: 'The baseline metric name' },
            value: { type: 'number', description: 'New current value' },
            target_value: { type: 'number', description: 'Optional new target value' }
          },
          required: ['metric_name', 'value']
        }
      },
      allowed_agents: ['master-orchestrator', 'seo-core-agent', 'kpi-integrity-agent', 'analytics-conversion-integrity-agent']
    },
    {
      type: 'function',
      function: {
        name: 'create_task',
        description: 'Create a follow-up task by queuing another agent to run with a specific payload.',
        parameters: {
          type: 'object',
          properties: {
            agent_slug: { type: 'string', description: 'Slug of the agent to queue (e.g. technical-seo-crawl-agent)' },
            task_payload: { type: 'object', description: 'JSON payload to pass to the queued agent' },
            priority: { type: 'number', description: 'Queue priority (1=highest, 5=lowest). Default: 3' }
          },
          required: ['agent_slug', 'task_payload']
        }
      },
      allowed_agents: ['master-orchestrator', 'seo-core-agent', 'innovation-agent']
    },
    {
      type: 'function',
      function: {
        name: 'create_incident',
        description: 'Create an incident to flag a critical issue that needs attention.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short incident title' },
            description: { type: 'string', description: 'Detailed description of the issue' },
            severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'], description: 'Incident severity' },
            category: { type: 'string', description: 'Category (e.g. SEO Operations, Technical, Credentials)' }
          },
          required: ['title', 'description', 'severity']
        }
      },
      allowed_agents: '*'
    },
    {
      type: 'function',
      function: {
        name: 'write_memory_item',
        description: 'Store a new memory item for this client. Use to remember important findings, decisions, or context.',
        parameters: {
          type: 'object',
          properties: {
            scope: { type: 'string', enum: ['seo', 'reviews', 'performance', 'content', 'competitors', 'technical_debt', 'ads', 'social', 'backlinks', 'strategy', 'compliance', 'local_seo', 'general'], description: 'Memory scope' },
            type: { type: 'string', enum: ['fact', 'goal', 'constraint', 'preference', 'status', 'insight', 'warning', 'achievement'], description: 'Memory type' },
            content: { type: 'string', description: 'The memory content. Must be specific, factual, and actionable. Min 20 chars.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
            relevance_score: { type: 'number', description: 'Relevance score 0.0-1.0. Default: 0.7' }
          },
          required: ['scope', 'type', 'content']
        }
      },
      allowed_agents: '*'
    },
    {
      type: 'function',
      function: {
        name: 'resolve_incident',
        description: 'Mark an existing incident as resolved with a resolution note.',
        parameters: {
          type: 'object',
          properties: {
            incident_id: { type: 'string', description: 'UUID of the incident to resolve' },
            resolution: { type: 'string', description: 'How the incident was resolved' }
          },
          required: ['incident_id', 'resolution']
        }
      },
      allowed_agents: ['master-orchestrator', 'website-qa-agent', 'regression-agent', 'credential-health-agent']
    },
    // --- GEO VISIBILITY TRACKING ---
    {
      type: 'function',
      function: {
        name: 'store_geo_visibility',
        description: 'Store a GEO visibility signal — record whether the client appears in AI-generated answers for a query. Use after checking Perplexity or other AI search results.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'The search query tested' },
            platform: { type: 'string', enum: ['perplexity', 'chatgpt', 'gemini', 'copilot', 'claude'], description: 'AI platform tested' },
            client_mentioned: { type: 'boolean', description: 'Whether the client was mentioned in the AI answer' },
            client_cited: { type: 'boolean', description: 'Whether the client URL was cited as a source' },
            client_position: { type: 'number', description: 'Position of client mention (1=first mentioned, null=not mentioned)' },
            competitors_mentioned: { type: 'array', items: { type: 'string' }, description: 'Competitor names/domains mentioned in the answer' },
            total_entities_mentioned: { type: 'number', description: 'Total entities/brands mentioned in the answer' },
          },
          required: ['query', 'client_mentioned']
        }
      },
      allowed_agents: ['geo-ai-visibility-agent', 'competitor-intelligence-agent', 'seo-core-agent']
    },
    // --- CONTENT QUESTION PATTERN ---
    {
      type: 'function',
      function: {
        name: 'store_content_question',
        description: 'Store a content question pattern — a question people ask in the client niche that represents a content opportunity.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The question pattern (e.g. "מהו עורך דין לתעבורה?")' },
            frequency: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How often this question is asked' },
            current_answer_quality: { type: 'string', enum: ['excellent', 'good', 'weak', 'missing'], description: 'How well the client currently answers this' },
            client_has_content: { type: 'boolean', description: 'Whether the client already has content for this' },
            opportunity_score: { type: 'number', description: 'Opportunity score 0-1 (1=high opportunity)' },
          },
          required: ['question']
        }
      },
      allowed_agents: ['geo-ai-visibility-agent', 'website-content-agent', 'seo-core-agent', 'innovation-agent', 'competitor-intelligence-agent']
    },
    // --- WEBSITE SCANNING (real page inspection) ---
    {
      type: 'function',
      function: {
        name: 'scan_website',
        description: 'Fetch and analyze a web page, returning structured facts: title, meta, headings, word count, links, CTAs, forms, schema, trust signals, images. Use this to inspect any client page before making recommendations.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Full URL to scan (e.g. https://example.com/page)' },
            check_mobile: { type: 'boolean', description: 'If true, use mobile user-agent (default false)' },
          },
          required: ['url']
        }
      },
      allowed_agents: ['technical-seo-crawl-agent', 'website-content-agent', 'cro-agent', 'design-consistency-agent', 'website-qa-agent', 'design-enforcement-agent', 'hebrew-quality-agent', 'seo-core-agent', 'local-seo-agent', 'master-orchestrator']
    },
    // --- BROWSER TASK SUBMISSION (MANUS) ---
    {
      type: 'function',
      function: {
        name: 'submit_browser_task',
        description: 'Submit a browser automation task to the Browser Operator queue (Manus). Use when you need to log into a website, export data from a dashboard, or perform UI actions that cannot be done via API.',
        parameters: {
          type: 'object',
          properties: {
            task_type: { type: 'string', enum: ['screenshot', 'data_export', 'form_submission', 'login_check', 'dashboard_scrape', 'review_response', 'social_post', 'custom'], description: 'Type of browser task' },
            target_url: { type: 'string', description: 'URL to navigate to' },
            target_platform: { type: 'string', description: 'Platform name (e.g. "Google Business Profile", "Facebook")' },
            instructions: { type: 'object', description: 'Detailed task instructions including steps, expected outputs, selectors' },
          },
          required: ['task_type', 'instructions']
        }
      },
      allowed_agents: ['master-orchestrator', 'reviews-gbp-authority-agent', 'local-seo-agent', 'credential-health-agent', 'facebook-agent', 'instagram-agent']
    }
  ];

  // Filter tools based on agent slug
  return allTools
    .filter(tool => tool.allowed_agents === '*' || tool.allowed_agents.includes(agentSlug))
    .map(({ type, function: fn }) => ({ type, function: fn }));
}


// ============================================================
// TOOL EXECUTION ENGINE
// ============================================================
export async function executeTool(toolName, args, clientId, runId) {
  const startTime = Date.now();

  try {
    switch (toolName) {

      // ========================================
      // fetch_pagespeed
      // ========================================
      case 'fetch_pagespeed': {
        const url = args.url;
        const strategy = args.strategy || 'mobile';
        const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY;

        if (!apiKey) return { error: 'No Google API key configured', tool: toolName };

        const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&key=${apiKey}&category=performance&category=accessibility&category=best-practices&category=seo`;
        const resp = await fetch(apiUrl);

        if (!resp.ok) {
          const errText = await resp.text();
          return { error: `PageSpeed API error: ${resp.status}`, details: errText.slice(0, 500) };
        }

        const data = await resp.json();
        const lighthouse = data.lighthouseResult;
        const categories = lighthouse?.categories || {};
        const audits = lighthouse?.audits || {};

        return {
          url,
          strategy,
          scores: {
            performance: Math.round((categories.performance?.score || 0) * 100),
            accessibility: Math.round((categories.accessibility?.score || 0) * 100),
            best_practices: Math.round((categories['best-practices']?.score || 0) * 100),
            seo: Math.round((categories.seo?.score || 0) * 100)
          },
          core_web_vitals: {
            lcp_ms: audits['largest-contentful-paint']?.numericValue ? Math.round(audits['largest-contentful-paint'].numericValue) : null,
            cls: audits['cumulative-layout-shift']?.numericValue ?? null,
            fid_ms: audits['max-potential-fid']?.numericValue ? Math.round(audits['max-potential-fid'].numericValue) : null,
            inp_ms: audits['interaction-to-next-paint']?.numericValue ? Math.round(audits['interaction-to-next-paint'].numericValue) : null,
            ttfb_ms: audits['server-response-time']?.numericValue ? Math.round(audits['server-response-time'].numericValue) : null,
            tbt_ms: audits['total-blocking-time']?.numericValue ? Math.round(audits['total-blocking-time'].numericValue) : null,
            speed_index_ms: audits['speed-index']?.numericValue ? Math.round(audits['speed-index'].numericValue) : null
          },
          opportunities: Object.values(audits)
            .filter(a => a.details?.type === 'opportunity' && a.details?.overallSavingsMs > 0)
            .map(a => ({
              audit: a.id,
              title: a.title,
              description: a.description?.slice(0, 200),
              savings_ms: Math.round(a.details.overallSavingsMs),
              score: a.score
            }))
            .sort((a, b) => b.savings_ms - a.savings_ms)
            .slice(0, 10),
          fetched_at: new Date().toISOString(),
          duration_ms: Date.now() - startTime
        };
      }

      // ========================================
      // fetch_serp_rankings
      // ========================================
      case 'fetch_serp_rankings': {
        const login = (process.env.DATAFORSEO_LOGIN || '').trim();
        const password = (process.env.DATAFORSEO_PASSWORD || '').trim();
        if (!login || !password) return { error: 'DataForSEO credentials not configured' };

        const locationCode = args.location_code || 2376;
        const languageCode = args.language_code || 'he';
        const highlightDomain = args.domain;

        const resp = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{
            keyword: args.keyword,
            location_code: locationCode,
            language_code: languageCode,
            device: 'mobile',
            os: 'android'
          }])
        });

        if (!resp.ok) return { error: `DataForSEO API error: ${resp.status}` };

        const data = await resp.json();
        const task = data?.tasks?.[0];
        if (task?.status_code !== 20000) return { error: `DataForSEO task error: ${task?.status_message}` };

        const result = task.result?.[0];
        const items = result?.items?.filter(i => i.type === 'organic') || [];

        let clientPosition = null;
        let clientUrl = null;

        const rankings = items.slice(0, 30).map(item => {
          const isClient = highlightDomain && item.domain?.includes(highlightDomain);
          if (isClient) {
            clientPosition = item.rank_absolute;
            clientUrl = item.url;
          }
          return {
            position: item.rank_absolute,
            domain: item.domain,
            url: item.url,
            title: item.title,
            is_client: isClient || false
          };
        });

        // Check for local pack
        const localPack = result?.items?.filter(i => i.type === 'local_pack' || i.type === 'maps') || [];

        return {
          keyword: args.keyword,
          total_results: result?.se_results_count || 0,
          client_position: clientPosition,
          client_url: clientUrl,
          on_page_1: clientPosition !== null && clientPosition <= 10,
          local_pack_present: localPack.length > 0,
          local_pack_items: localPack.slice(0, 3).map(lp => ({
            title: lp.title,
            domain: lp.domain,
            rating: lp.rating?.value,
            reviews_count: lp.rating?.votes_count
          })),
          top_30_results: rankings,
          fetched_at: new Date().toISOString()
        };
      }

      // ========================================
      // fetch_backlink_data
      // ========================================
      case 'fetch_backlink_data': {
        const login = (process.env.DATAFORSEO_LOGIN || '').trim();
        const password = (process.env.DATAFORSEO_PASSWORD || '').trim();
        if (!login || !password) return { error: 'DataForSEO credentials not configured' };

        const domain = args.domain;
        const type = args.type || 'summary';

        let endpoint, body;

        if (type === 'summary') {
          endpoint = 'https://api.dataforseo.com/v3/backlinks/summary/live';
          body = [{ target: domain, internal_list_limit: 0, backlinks_filters: ['dofollow', '=', true] }];
        } else if (type === 'referring_domains') {
          endpoint = 'https://api.dataforseo.com/v3/backlinks/referring_domains/live';
          body = [{ target: domain, limit: 50, order_by: ['rank,desc'] }];
        } else {
          endpoint = 'https://api.dataforseo.com/v3/backlinks/backlinks/live';
          body = [{ target: domain, limit: 50, order_by: ['rank,desc'], mode: 'as_is' }];
        }

        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!resp.ok) return { error: `DataForSEO Backlinks error: ${resp.status}` };

        const data = await resp.json();
        const task = data?.tasks?.[0];
        if (task?.status_code !== 20000) {
          return { error: `DataForSEO error: ${task?.status_message}`, code: task?.status_code };
        }

        const result = task.result?.[0];

        if (type === 'summary') {
          return {
            domain,
            referring_domains: result?.referring_domains || 0,
            referring_domains_nofollow: result?.referring_domains_nofollow || 0,
            backlinks: result?.backlinks || 0,
            domain_rank: result?.rank || 0,
            estimated_da: Math.min(100, Math.round((result?.rank || 0) / 6)),
            broken_backlinks: result?.broken_backlinks || 0,
            fetched_at: new Date().toISOString()
          };
        } else if (type === 'referring_domains') {
          return {
            domain,
            total: result?.total_count || 0,
            domains: (result?.items || []).slice(0, 30).map(d => ({
              domain: d.domain,
              rank: d.rank,
              backlinks: d.backlinks,
              first_seen: d.first_seen
            }))
          };
        }

        return { domain, items: result?.items?.slice(0, 30) || [] };
      }

      // ========================================
      // search_perplexity
      // ========================================
      case 'search_perplexity': {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) return { error: 'Perplexity API key not configured. Set PERPLEXITY_API_KEY environment variable.' };

        const resp = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'sonar',
            messages: [
              {
                role: 'system',
                content: 'You are a digital marketing research assistant specializing in SEO, GEO (Generative Engine Optimization), and competitive analysis for Israeli businesses. Provide specific, data-rich answers with source URLs. Always cite sources.'
              },
              { role: 'user', content: args.query }
            ],
            max_tokens: 2000,
            temperature: 0.2,
            return_citations: true,
            search_domain_filter: args.focus === 'news' ? ['news'] : undefined
          })
        });

        if (!resp.ok) {
          const errText = await resp.text();
          return { error: `Perplexity API error: ${resp.status}`, details: errText.slice(0, 500) };
        }

        const data = await resp.json();
        const content = data.choices?.[0]?.message?.content || '';
        const citations = data.citations || [];

        const result = {
          query: args.query,
          answer: content,
          citations: citations.map((c, i) => ({ index: i + 1, url: c })),
          model: data.model,
          usage: data.usage,
          fetched_at: new Date().toISOString()
        };

        // ── Store structured research data (fire-and-forget) ──
        if (clientId) {
          try {
            // 1. Log the research query
            await supabase.from('external_research_queries').insert({
              client_id: clientId,
              run_id: runId || null,
              agent_slug: args._agent_slug || null,
              query: args.query,
              focus: args.focus || 'web',
              answer: content,
              citations: result.citations,
              raw_response: { model: data.model, usage: data.usage },
              tokens_used: data.usage?.total_tokens || null
            }).catch(() => {});

            // 2. Extract and upsert cited domains
            const citedUrls = citations.filter(c => typeof c === 'string');
            for (const url of citedUrls) {
              try {
                const domain = new URL(url).hostname.replace(/^www\./, '');
                await supabase.from('cited_domains').upsert({
                  client_id: clientId,
                  domain,
                  citation_count: 1,
                  contexts: [args.query.slice(0, 200)],
                  last_seen: new Date().toISOString(),
                }, { onConflict: 'client_id,domain' });
                // Increment count for existing
                await supabase.rpc('increment_citation_count', { p_client_id: clientId, p_domain: domain, p_context: args.query.slice(0, 200) }).catch(() => {});
              } catch {}
            }
            // 3. Extract entities (brands, companies, people) from answer
            const entityPatterns = [
              /(?:(?:חברת|משרד|סוכנות|ארגון|עמותת)\s+)([\u0590-\u05FF\w\s]{2,30})/g,
              /(?:(?:company|firm|agency|brand|organization)\s+)([\w\s]{2,40})/gi,
            ];
            const entities = new Set();
            for (const pattern of entityPatterns) {
              let match;
              while ((match = pattern.exec(content)) !== null) {
                entities.add(match[1].trim());
              }
            }
            // Also extract from citations — domain names as entities
            for (const url of citedUrls) {
              try {
                const domain = new URL(url).hostname.replace(/^www\./, '');
                const name = domain.split('.')[0];
                if (name.length > 2 && !['com', 'org', 'net', 'gov', 'co'].includes(name)) {
                  entities.add(name);
                }
              } catch {}
            }
            if (entities.size > 0) {
              for (const entity of entities) {
                await supabase.from('repeated_entities').upsert({
                  client_id: clientId,
                  entity_name: entity.slice(0, 100),
                  entity_type: 'brand_or_org',
                  mention_count: 1,
                  source_queries: [args.query.slice(0, 200)],
                  last_seen: new Date().toISOString(),
                }, { onConflict: 'client_id,entity_name' }).catch(() => {});
              }
            }
          } catch (e) { console.error('Perplexity structured storage error:', e.message); }
        }

        return result;
      }

      // ========================================
      // fetch_google_reviews
      // ========================================
      case 'fetch_google_reviews': {
        const apiKey = process.env.GOOGLE_PLACES_API_KEY;
        if (!apiKey) return { error: 'Google Places API key not configured' };

        let placeId = args.place_id;

        if (!placeId) {
          // Search for the business — try multiple queries for better match
          const queries = [args.business_name];
          if (args.location) queries.push(`${args.business_name} ${args.location}`);
          if (args.domain) queries.push(args.domain);

          let searchData = null;
          for (const query of queries) {
            const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,rating,user_ratings_total&key=${apiKey}`;
            const searchResp = await fetch(searchUrl);
            searchData = await searchResp.json();
            if (searchData.status === 'OK' && searchData.candidates?.length) break;
          }

          // Also try Text Search API as fallback (more flexible matching)
          if (searchData?.status !== 'OK' || !searchData?.candidates?.length) {
            const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(args.business_name)}&key=${apiKey}`;
            const textResp = await fetch(textSearchUrl);
            const textData = await textResp.json();
            if (textData.status === 'OK' && textData.results?.length) {
              const r = textData.results[0];
              return {
                business_name: r.name,
                place_id: r.place_id,
                address: r.formatted_address,
                rating: r.rating,
                total_reviews: r.user_ratings_total,
                fetched_at: new Date().toISOString(),
                search_method: 'text_search',
              };
            }
            return { error: `Business not found with any method. Tried: ${queries.join(', ')}`, api_status: searchData?.status };
          }

          placeId = searchData.candidates[0].place_id;

          return {
            business_name: searchData.candidates[0].name,
            place_id: placeId,
            address: searchData.candidates[0].formatted_address,
            rating: searchData.candidates[0].rating,
            total_reviews: searchData.candidates[0].user_ratings_total,
            fetched_at: new Date().toISOString()
          };
        }

        // Get details with reviews
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&key=${apiKey}`;
        const detailResp = await fetch(detailUrl);
        const detailData = await detailResp.json();

        if (detailData.status !== 'OK') {
          return { error: `Place details error: ${detailData.status}` };
        }

        const place = detailData.result;
        return {
          business_name: place.name,
          place_id: placeId,
          rating: place.rating,
          total_reviews: place.user_ratings_total,
          recent_reviews: (place.reviews || []).slice(0, 5).map(r => ({
            author: r.author_name,
            rating: r.rating,
            text: r.text?.slice(0, 300),
            time: r.relative_time_description
          })),
          fetched_at: new Date().toISOString()
        };
      }

      // ========================================
      // fetch_local_serp
      // ========================================
      case 'fetch_local_serp': {
        const login = (process.env.DATAFORSEO_LOGIN || '').trim();
        const password = (process.env.DATAFORSEO_PASSWORD || '').trim();
        if (!login || !password) return { error: 'DataForSEO credentials not configured' };

        const resp = await fetch('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify([{
            keyword: args.keyword,
            location_code: args.location_code || 2376,
            language_code: 'he',
            device: 'mobile',
            os: 'android'
          }])
        });

        if (!resp.ok) return { error: `DataForSEO error: ${resp.status}` };

        const data = await resp.json();
        const result = data?.tasks?.[0]?.result?.[0];
        const allItems = result?.items || [];

        const localPack = allItems.filter(i => i.type === 'local_pack' || i.type === 'maps');
        const organic = allItems.filter(i => i.type === 'organic');

        let inLocalPack = false;
        let localPackPosition = null;
        const localPackEntries = [];

        for (const lp of localPack) {
          const entries = lp.items || [lp];
          for (const entry of entries) {
            const entryData = {
              title: entry.title,
              domain: entry.domain,
              rating: entry.rating?.value,
              reviews_count: entry.rating?.votes_count,
              address: entry.address
            };
            localPackEntries.push(entryData);
            if (entry.title?.includes(args.business_name) || entry.domain?.includes(args.business_name)) {
              inLocalPack = true;
              localPackPosition = localPackEntries.length;
            }
          }
        }

        return {
          keyword: args.keyword,
          in_local_pack: inLocalPack,
          local_pack_position: localPackPosition,
          local_pack_entries: localPackEntries.slice(0, 5),
          organic_results_count: organic.length,
          fetched_at: new Date().toISOString()
        };
      }

      // ========================================
      // query_metrics
      // ========================================
      case 'query_metrics': {
        const { data } = await supabase
          .from('client_metrics')
          .select('metric_name, metric_value, source, details, recorded_at')
          .eq('client_id', clientId)
          .eq('metric_name', args.metric_name)
          .order('recorded_at', { ascending: false })
          .limit(args.limit || 10);

        return {
          metric_name: args.metric_name,
          count: data?.length || 0,
          values: data || [],
          latest: data?.[0] || null
        };
      }

      // ========================================
      // query_keywords
      // ========================================
      case 'query_keywords': {
        let query = supabase
          .from('client_keywords')
          .select('keyword, current_position, previous_position, volume, difficulty, cluster, search_intent, url, last_checked')
          .eq('client_id', clientId);

        switch (args.filter) {
          case 'page1':
            query = query.lte('current_position', 10).gt('current_position', 0);
            break;
          case 'page2':
            query = query.gt('current_position', 10).lte('current_position', 20);
            break;
          case 'unranked':
            query = query.is('current_position', null);
            break;
        }

        const { data } = await query
          .order('volume', { ascending: false })
          .limit(args.limit || 50);

        const improved = data?.filter(k => k.previous_position && k.current_position && k.current_position < k.previous_position) || [];
        const dropped = data?.filter(k => k.previous_position && k.current_position && k.current_position > k.previous_position) || [];

        return {
          total: data?.length || 0,
          on_page_1: data?.filter(k => k.current_position && k.current_position <= 10).length || 0,
          improved_count: improved.length,
          dropped_count: dropped.length,
          keywords: data || []
        };
      }

      // ========================================
      // query_competitors
      // ========================================
      case 'query_competitors': {
        const { data: competitors } = await supabase
          .from('client_competitors')
          .select('*')
          .eq('client_id', clientId);

        let linkGap = null;
        if (args.include_link_gap) {
          const { data } = await supabase
            .from('competitor_link_gap')
            .select('*')
            .eq('client_id', clientId)
            .order('domain_authority', { ascending: false })
            .limit(50);
          linkGap = data;
        }

        return {
          competitors: competitors || [],
          link_gap: linkGap,
          count: competitors?.length || 0
        };
      }

      // ========================================
      // query_recent_runs
      // ========================================
      case 'query_recent_runs': {
        let query = supabase
          .from('runs')
          .select('id, status, created_at, completed_at, duration_ms, tokens_used, changed_anything, what_changed, error, agent_template_id, agent_templates(slug, name)')
          .eq('client_id', clientId);

        if (args.agent_slug) {
          const { data: agent } = await supabase
            .from('agent_templates')
            .select('id')
            .eq('slug', args.agent_slug)
            .single();
          if (agent) query = query.eq('agent_template_id', agent.id);
        }

        if (args.status) query = query.eq('status', args.status);

        const { data } = await query
          .order('created_at', { ascending: false })
          .limit(args.limit || 10);

        return {
          count: data?.length || 0,
          runs: (data || []).map(r => ({
            id: r.id,
            agent: r.agent_templates?.name,
            agent_slug: r.agent_templates?.slug,
            status: r.status,
            created_at: r.created_at,
            duration_ms: r.duration_ms,
            tokens_used: r.tokens_used,
            changed_anything: r.changed_anything,
            what_changed: r.what_changed,
            error: r.error
          }))
        };
      }

      // ========================================
      // query_incidents
      // ========================================
      case 'query_incidents': {
        let query = supabase
          .from('incidents')
          .select('id, title, description, severity, category, status, created_at, resolved_at, resolution')
          .eq('client_id', clientId);

        if (args.severity) query = query.eq('severity', args.severity);
        query = query.eq('status', args.status || 'open');

        const { data } = await query.order('created_at', { ascending: false }).limit(20);

        return {
          count: data?.length || 0,
          incidents: data || []
        };
      }

      // ========================================
      // store_metric
      // ========================================
      case 'store_metric': {
        try {
          const { data, error } = await supabase.from('client_metrics').insert({
            client_id: clientId,
            metric_name: args.metric_name,
            metric_value: args.value,
            source: args.source,
            details: args.details || {},
            recorded_at: new Date().toISOString()
          }).select().single();

          if (error) return { error: error.message };
          return { stored: true, metric_name: args.metric_name, value: args.value, id: data?.id };
        } catch (err) {
          return { error: err.message };
        }
      }

      // ========================================
      // update_keyword_position
      // ========================================
      case 'update_keyword_position': {
        const { data: existing } = await supabase
          .from('client_keywords')
          .select('id, current_position')
          .eq('client_id', clientId)
          .eq('keyword', args.keyword)
          .maybeSingle();

        if (existing) {
          await supabase.from('client_keywords').update({
            previous_position: existing.current_position,
            current_position: args.position,
            url: args.url || undefined,
            last_checked: new Date().toISOString()
          }).eq('id', existing.id);

          return {
            updated: true,
            keyword: args.keyword,
            old_position: existing.current_position,
            new_position: args.position,
            change: existing.current_position ? existing.current_position - args.position : null
          };
        } else {
          await supabase.from('client_keywords').insert({
            client_id: clientId,
            keyword: args.keyword,
            current_position: args.position,
            url: args.url,
            last_checked: new Date().toISOString()
          });
          return { created: true, keyword: args.keyword, position: args.position };
        }
      }

      // ========================================
      // update_baseline
      // ========================================
      case 'update_baseline': {
        const { error } = await supabase.from('baselines').upsert({
          client_id: clientId,
          metric_name: args.metric_name,
          metric_value: args.value,
          target_value: args.target_value || undefined,
          updated_at: new Date().toISOString()
        }, { onConflict: 'client_id,metric_name' });

        if (error) return { error: error.message };
        return { updated: true, metric_name: args.metric_name, value: args.value, target: args.target_value };
      }

      // ========================================
      // create_task
      // ========================================
      case 'create_task': {
        const { data: agent } = await supabase
          .from('agent_templates')
          .select('id, slug, name')
          .eq('slug', args.agent_slug)
          .single();

        if (!agent) return { error: `Agent not found: ${args.agent_slug}` };

        const { data: queueItem, error } = await supabase.from('run_queue').insert({
          client_id: clientId,
          agent_template_id: agent.id,
          task_payload: { ...args.task_payload, created_by_run: runId },
          status: 'queued',
          queued_by: `agent:${runId}`,
          priority: args.priority || 3
        }).select().single();

        if (error) return { error: error.message };
        return { queued: true, queue_id: queueItem?.id, agent: agent.name };
      }

      // ========================================
      // create_incident
      // ========================================
      case 'create_incident': {
        const { data, error } = await supabase.from('incidents').insert({
          client_id: clientId,
          run_id: runId,
          severity: args.severity,
          category: args.category || 'General',
          title: args.title,
          description: args.description,
          status: 'open'
        }).select().single();

        if (error) return { error: error.message };
        return { created: true, incident_id: data?.id, title: args.title };
      }

      // ========================================
      // write_memory_item
      // ========================================
      case 'write_memory_item': {
        if (!args.content || args.content.length < 20) {
          return { error: 'Memory content must be at least 20 characters' };
        }

        const { data, error } = await supabase.from('memory_items').insert({
          client_id: clientId,
          scope: args.scope,
          type: args.type,
          content: args.content,
          tags: args.tags || ['auto-generated', 'from-tool-call'],
          source: 'run',
          source_run_id: runId,
          relevance_score: Math.min(1.0, Math.max(0.1, args.relevance_score || 0.7)),
          approved: true,
          last_run_id: runId
        }).select().single();

        if (error) return { error: error.message };
        return { stored: true, memory_id: data?.id, scope: args.scope, type: args.type };
      }

      // ========================================
      // resolve_incident
      // ========================================
      case 'resolve_incident': {
        const { error } = await supabase.from('incidents').update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution: args.resolution
        }).eq('id', args.incident_id).eq('client_id', clientId);

        if (error) return { error: error.message };
        return { resolved: true, incident_id: args.incident_id };
      }

      // ========================================
      // store_geo_visibility
      // ========================================
      case 'store_geo_visibility': {
        if (!clientId) return { error: 'No client context for GEO visibility storage' };
        const { error } = await supabase.from('geo_visibility_signals').insert({
          client_id: clientId,
          query: args.query,
          platform: args.platform || 'perplexity',
          client_mentioned: args.client_mentioned || false,
          client_cited: args.client_cited || false,
          client_position: args.client_position || null,
          competitors_mentioned: args.competitors_mentioned || [],
          total_entities_mentioned: args.total_entities_mentioned || null,
        });
        if (error) return { error: `Failed to store GEO signal: ${error.message}` };
        return { stored: true, query: args.query, client_mentioned: args.client_mentioned };
      }

      // ========================================
      // store_content_question
      // ========================================
      case 'store_content_question': {
        if (!clientId) return { error: 'No client context for content question storage' };
        const { error } = await supabase.from('content_question_patterns').insert({
          client_id: clientId,
          question: args.question,
          frequency: args.frequency || 'medium',
          current_answer_quality: args.current_answer_quality || null,
          client_has_content: args.client_has_content || false,
          opportunity_score: args.opportunity_score || 0.5,
        });
        if (error) return { error: `Failed to store question: ${error.message}` };
        return { stored: true, question: args.question };
      }

      // ========================================
      // submit_browser_task (Manus queue)
      // ========================================
      // ========================================
      // scan_website — real page inspection
      // ========================================
      case 'scan_website': {
        const url = args.url;
        if (!url) return { error: 'url is required' };
        const ua = args.check_mobile
          ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 15000);
          const res = await fetch(url, {
            headers: { 'User-Agent': ua, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'he,en;q=0.9' },
            redirect: 'follow',
            signal: controller.signal,
          });
          clearTimeout(timeout);
          const status_code = res.status;
          const finalUrl = res.url;
          const html = await res.text();
          const htmlLower = html.toLowerCase();

          // Title
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
          const title = titleMatch ? titleMatch[1].trim().replace(/\s+/g, ' ') : null;

          // Meta description
          const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([\s\S]*?)["']/i)
            || html.match(/<meta[^>]*content=["']([\s\S]*?)["'][^>]*name=["']description["']/i);
          const meta_description = metaDescMatch ? metaDescMatch[1].trim() : null;

          // Canonical
          const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["'](.*?)["']/i);
          const canonical = canonicalMatch ? canonicalMatch[1] : null;

          // Robots / indexability
          const robotsMatch = html.match(/<meta[^>]*name=["']robots["'][^>]*content=["'](.*?)["']/i);
          const robots_content = robotsMatch ? robotsMatch[1] : null;
          const indexable = !robots_content || (!robots_content.includes('noindex'));

          // Headings
          const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim()).filter(Boolean);
          const h2s = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim()).filter(Boolean);
          const h3s = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim()).filter(Boolean);

          // Body text and word count
          const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          const bodyText = bodyMatch ? bodyMatch[1].replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
          const word_count = bodyText.split(/\s+/).filter(w => w.length > 1).length;

          // Links
          const allLinks = [...html.matchAll(/<a[^>]*href=["'](.*?)["']/gi)].map(m => m[1]);
          const internal_links = allLinks.filter(l => l.startsWith('/') || l.includes(new URL(url).hostname)).length;
          const external_links = allLinks.filter(l => /^https?:\/\//i.test(l) && !l.includes(new URL(url).hostname)).length;

          // Schema / structured data
          const schemaBlocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
          const schema_types = [];
          for (const block of schemaBlocks) {
            try { const j = JSON.parse(block[1]); schema_types.push(j['@type'] || (Array.isArray(j) ? j.map(x => x['@type']).filter(Boolean) : [])); } catch {}
          }

          // CTAs
          const buttons = [...html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi), ...html.matchAll(/<a[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
          const cta_buttons = buttons.map(m => (m[1] || m[2] || '').replace(/<[^>]*>/g, '').trim()).filter(t => t.length > 0 && t.length < 100).slice(0, 20);

          // WhatsApp / Phone
          const whatsapp_links = [...html.matchAll(/href=["'](https?:\/\/(?:wa\.me|api\.whatsapp\.com)[^"']*)/gi)].map(m => m[1]);
          const phone_links = [...html.matchAll(/href=["'](tel:[^"']+)/gi)].map(m => m[1]);

          // Forms
          const forms = [...html.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi)];
          const forms_detected = forms.length;
          const form_field_count = forms.reduce((sum, f) => sum + (f[1].match(/<input|<textarea|<select/gi) || []).length, 0);

          // Trust signals
          const privacy_text_present = /פרטיות|privacy|confidential|סודיות/i.test(bodyText);
          const review_section_present = /ביקורות|reviews|testimonials|חוות דעת|ממליצים/i.test(bodyText);
          const address_present = /רחוב|כתובת|address|street/i.test(bodyText) || phone_links.length > 0;

          // Images
          const images = [...html.matchAll(/<img[^>]*>/gi)];
          const images_with_alt = images.filter(i => /alt=["'][^"']+/i.test(i[0])).length;
          const image_alt_coverage = images.length > 0 ? Math.round((images_with_alt / images.length) * 100) : 100;

          // Open Graph
          const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["'](.*?)["']/i);
          const ogTitle = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["'](.*?)["']/i);

          // Hreflang
          const hreflangs = [...html.matchAll(/<link[^>]*hreflang=["'](.*?)["']/gi)].map(m => m[1]);

          return {
            page_url: url,
            final_url: finalUrl !== url ? finalUrl : undefined,
            status_code,
            title,
            meta_description,
            canonical,
            indexable,
            robots_content,
            h1: h1s,
            h2: h2s.slice(0, 15),
            h3: h3s.slice(0, 15),
            word_count,
            internal_links,
            external_links,
            schema_types: schema_types.flat(),
            cta_buttons: cta_buttons.slice(0, 10),
            whatsapp_links,
            phone_links,
            forms_detected,
            form_field_count,
            privacy_text_present,
            review_section_present,
            address_present,
            image_count: images.length,
            image_alt_coverage,
            og_image: ogImage?.[1] || null,
            og_title: ogTitle?.[1] || null,
            hreflangs,
            mobile_scan: !!args.check_mobile,
            scanned_at: new Date().toISOString(),
          };
        } catch (e) {
          return { error: `Failed to scan ${url}: ${e.message}`, page_url: url };
        }
      }

      case 'submit_browser_task': {
        if (!clientId) return { error: 'No client context for browser task' };
        const { data, error } = await supabase.from('browser_tasks').insert({
          client_id: clientId,
          run_id: runId || null,
          task_type: args.task_type,
          target_url: args.target_url || null,
          target_platform: args.target_platform || null,
          instructions: args.instructions,
          status: 'pending',
        }).select('id').single();
        if (error) return { error: `Failed to create browser task: ${error.message}` };
        return { task_id: data.id, status: 'pending', message: 'Browser task queued for Manus execution' };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`[TOOL_ERROR] ${toolName}:`, err.message);
    return { error: err.message, tool: toolName };
  }
}
