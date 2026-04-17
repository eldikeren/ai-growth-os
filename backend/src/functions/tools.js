// ============================================================
// AI GROWTH OS — AGENT TOOL LIBRARY
// Real executable tools for OpenAI function calling.
// Every tool calls real APIs, real databases. No stubs.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// DALL-E 3 client for generate_premium_visual
// Uses a separate OpenAI instance with a longer image-gen timeout (image-gen is slower than chat)
const openaiImages = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
  maxRetries: 0,
});

// ============================================================
// FETCH WITH TIMEOUT — wraps all external API calls
// Prevents hanging requests from blocking the Vercel function.
// Default: 25s timeout (leaves buffer within 300s Vercel limit).
// ============================================================
async function fetchWithTimeout(url, options = {}, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// GOOGLE TOKEN HELPER — auto-refresh before every API call
// Google access tokens expire in 1 hour. This function always
// returns a valid token, refreshing silently if needed.
// ============================================================
export async function getValidGoogleToken(clientId) {
  const ENC_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!ENC_KEY || !clientId) return null;

  // Load the Google OAuth credential for this client
  const { data: cred } = await supabase.from('oauth_credentials')
    .select('id, access_token_encrypted, refresh_token_encrypted, encryption_iv, expires_at, status')
    .eq('client_id', clientId)
    .eq('provider', 'google')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cred) return null;

  // Check if the access token is still valid (with 5-minute buffer)
  const isExpired = !cred.expires_at || new Date(cred.expires_at).getTime() < Date.now() + 5 * 60 * 1000;

  if (!isExpired && cred.status === 'active') {
    // Token is valid — just decrypt and return
    try {
      const ivParts = (cred.encryption_iv || '').split(':');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), Buffer.from(ivParts[0], 'hex'));
      let token = decipher.update(cred.access_token_encrypted, 'hex', 'utf8');
      token += decipher.final('utf8');
      return token;
    } catch { return null; }
  }

  // Token is expired or expiring — refresh it now
  if (!cred.refresh_token_encrypted) {
    // No refresh token — mark as expired, must reconnect
    await supabase.from('oauth_credentials').update({ status: 'expired', last_error: 'No refresh token available' }).eq('id', cred.id);
    return null;
  }

  try {
    const ivParts = (cred.encryption_iv || '').split(':');
    if (ivParts.length < 2) return null;
    const refreshDecipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), Buffer.from(ivParts[1], 'hex'));
    let refreshToken = refreshDecipher.update(cred.refresh_token_encrypted, 'hex', 'utf8');
    refreshToken += refreshDecipher.final('utf8');

    const tokenRes = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: (process.env.GOOGLE_CLIENT_ID || '').trim(),
        client_secret: (process.env.GOOGLE_CLIENT_SECRET || '').trim(),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    }, 15000);
    const tokens = await tokenRes.json();
    if (!tokens.access_token) {
      await supabase.from('oauth_credentials').update({ status: 'expired', last_error: tokens.error_description || tokens.error || 'Refresh failed' }).eq('id', cred.id);
      return null;
    }

    // Encrypt and save the new access token
    const newIv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), newIv);
    let encAccess = cipher.update(tokens.access_token, 'utf8', 'hex');
    encAccess += cipher.final('hex');
    const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();

    await supabase.from('oauth_credentials').update({
      access_token_encrypted: encAccess,
      encryption_iv: newIv.toString('hex') + ':' + ivParts[1],
      expires_at: newExpiry,
      status: 'active',
      last_refresh_at: new Date().toISOString(),
      last_error: null,
    }).eq('client_id', clientId).eq('provider', 'google');

    console.log(`[TOKEN_AUTO_REFRESH] Refreshed Google token for client ${clientId}, expires ${newExpiry}`);
    return tokens.access_token;
  } catch (e) {
    console.error(`[TOKEN_AUTO_REFRESH] Failed for client ${clientId}:`, e.message);
    await supabase.from('oauth_credentials').update({ status: 'expired', last_error: e.message }).eq('id', cred.id);
    return null;
  }
}

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
      allowed_agents: ['technical-seo-crawl-agent', 'seo-core-agent', 'website-qa-agent', 'regression-agent', 'master-orchestrator', 'credential-health-agent', 'report-composer-agent', 'cro-agent']
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
      allowed_agents: ['seo-core-agent', 'technical-seo-crawl-agent', 'gsc-daily-monitor', 'competitor-intelligence-agent', 'local-seo-agent', 'geo-ai-visibility-agent', 'regression-agent', 'report-composer-agent', 'reviews-gbp-authority-agent', 'master-orchestrator']
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
      allowed_agents: ['seo-core-agent', 'competitor-intelligence-agent', 'report-composer-agent', 'master-orchestrator']
    },
    {
      type: 'function',
      function: {
        name: 'fetch_llm_mentions',
        description: 'Check if a domain or brand is mentioned in LLM/AI search responses (Google AI Overview, ChatGPT). Uses DataForSEO LLM Mentions API. Returns keywords where the target appears in AI-generated answers.',
        parameters: {
          type: 'object',
          properties: {
            domain: { type: 'string', description: 'Target domain to check mentions for (e.g. yanivgil.co.il)' },
            brand_keyword: { type: 'string', description: 'Optional brand name to search for in AI responses (e.g. "יניב גיל")' },
            platform: { type: 'string', enum: ['google', 'chat_gpt'], description: 'AI platform to check. Default: google' },
            location_code: { type: 'number', description: 'DataForSEO location code. Default: 2376 (Israel)' },
            language_code: { type: 'string', description: 'Language code. Default: he' },
            limit: { type: 'number', description: 'Max results. Default: 20' }
          },
          required: ['domain']
        }
      },
      allowed_agents: ['seo-core-agent', 'geo-ai-visibility-agent', 'competitor-intelligence-agent', 'report-composer-agent', 'master-orchestrator']
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
      allowed_agents: ['competitor-intelligence-agent', 'seo-core-agent', 'innovation-agent', 'geo-ai-visibility-agent', 'local-seo-agent', 'content-distribution-agent', 'website-content-agent', 'master-orchestrator', 'report-composer-agent', 'technical-seo-crawl-agent', 'regression-agent', 'reviews-gbp-authority-agent', 'facebook-agent', 'instagram-agent', 'cro-agent']
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
      allowed_agents: ['reviews-gbp-authority-agent', 'local-seo-agent', 'master-orchestrator', 'report-composer-agent']
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
      allowed_agents: ['local-seo-agent', 'seo-core-agent', 'competitor-intelligence-agent', 'reviews-gbp-authority-agent', 'report-composer-agent', 'master-orchestrator']
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
      allowed_agents: ['seo-core-agent', 'gsc-daily-monitor', 'technical-seo-crawl-agent', 'competitor-intelligence-agent', 'report-composer-agent', 'master-orchestrator', 'geo-ai-visibility-agent', 'regression-agent', 'website-content-agent', 'local-seo-agent', 'reviews-gbp-authority-agent', 'facebook-agent', 'instagram-agent', 'content-distribution-agent', 'cro-agent', 'analytics-conversion-integrity-agent', 'google-ads-campaign-agent']
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
      allowed_agents: ['competitor-intelligence-agent', 'seo-core-agent', 'innovation-agent', 'geo-ai-visibility-agent', 'master-orchestrator', 'report-composer-agent', 'local-seo-agent', 'reviews-gbp-authority-agent', 'website-content-agent', 'content-distribution-agent']
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
      allowed_agents: ['master-orchestrator', 'report-composer-agent', 'kpi-integrity-agent', 'regression-agent', 'seo-core-agent', 'gsc-daily-monitor', 'technical-seo-crawl-agent', 'website-content-agent', 'google-ads-campaign-agent', 'analytics-conversion-integrity-agent', 'local-seo-agent', 'competitor-intelligence-agent']
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
      allowed_agents: ['master-orchestrator', 'report-composer-agent', 'kpi-integrity-agent', 'seo-core-agent', 'gsc-daily-monitor', 'website-content-agent', 'technical-seo-crawl-agent']
    },
    {
      type: 'function',
      function: {
        name: 'query_credential_health',
        description: 'CANONICAL credential health reader. Reads the REAL source-of-truth tables: oauth_credentials (master OAuth grant), client_integrations (per-service connection state + discovery summary), integration_assets (discovered properties/accounts/locations). ALWAYS call this before deciding whether credentials are missing or broken — never guess. Returns a structured report with per-service status: connected | limited | missing | error. This replaces ALL guesses about credential state.',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      allowed_agents: ['credential-health-agent', 'master-orchestrator', 'kpi-integrity-agent']
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
      allowed_agents: ['technical-seo-crawl-agent', 'gsc-daily-monitor', 'seo-core-agent', 'local-seo-agent', 'reviews-gbp-authority-agent', 'credential-health-agent', 'analytics-conversion-integrity-agent', 'google-ads-campaign-agent', 'competitor-intelligence-agent', 'report-composer-agent']
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
      allowed_agents: ['seo-core-agent', 'gsc-daily-monitor', 'technical-seo-crawl-agent']
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
      allowed_agents: ['master-orchestrator', 'seo-core-agent', 'kpi-integrity-agent', 'analytics-conversion-integrity-agent', 'gsc-daily-monitor', 'technical-seo-crawl-agent', 'google-ads-campaign-agent', 'report-composer-agent']
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
      allowed_agents: ['master-orchestrator', 'seo-core-agent', 'innovation-agent', 'gsc-daily-monitor', 'technical-seo-crawl-agent', 'website-content-agent', 'cro-agent', 'regression-agent', 'google-ads-campaign-agent', 'analytics-conversion-integrity-agent', 'competitor-intelligence-agent', 'local-seo-agent', 'reviews-gbp-authority-agent', 'facebook-agent', 'instagram-agent', 'content-distribution-agent', 'report-composer-agent', 'geo-ai-visibility-agent']
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
      allowed_agents: ['master-orchestrator', 'website-qa-agent', 'regression-agent', 'credential-health-agent', 'seo-core-agent', 'technical-seo-crawl-agent', 'gsc-daily-monitor', 'google-ads-campaign-agent', 'analytics-conversion-integrity-agent']
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
      allowed_agents: ['technical-seo-crawl-agent', 'website-content-agent', 'cro-agent', 'design-consistency-agent', 'website-qa-agent', 'design-enforcement-agent', 'hebrew-quality-agent', 'seo-core-agent', 'local-seo-agent', 'master-orchestrator', 'regression-agent', 'competitor-intelligence-agent', 'report-composer-agent', 'legal-agent', 'facebook-agent', 'instagram-agent', 'content-distribution-agent']
    },
    // --- GENERATE PREMIUM VISUAL (DALL-E 3) ---
    {
      type: 'function',
      function: {
        name: 'generate_premium_visual',
        description: 'Generate a PREMIUM social-media-ready visual (image) using DALL-E 3. Use for Facebook/Instagram posts, Google Ads creatives, blog featured images, and designed text cards. Output: stored visual asset with URL ready to attach to a post proposal. MUST follow the client CONTENT SCOPE GUARDRAIL — visuals that depict forbidden topics will be rejected. Every visual must look PREMIUM: no cartoons unless explicitly requested, no childish clipart, no AI-slop aesthetic. Favor photography, editorial illustration, high-end typography, minimal brand graphics.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Detailed image prompt in English. Describe subject, style (e.g. "editorial photography", "minimal premium typography card"), composition, mood, and any text overlay. Be explicit about premium quality: studio lighting, sharp focus, magazine-grade aesthetic.' },
            aspect: { type: 'string', enum: ['square', 'portrait', 'landscape'], description: 'Aspect ratio. square = 1024x1024 (IG feed), portrait = 1024x1792 (IG story/reel), landscape = 1792x1024 (FB cover, ad). Default: square' },
            style: { type: 'string', enum: ['photo', 'illustration', 'typography_card', 'meme'], description: 'Visual style category. photo = premium photography, illustration = editorial art, typography_card = designed-text-only card, meme = tasteful high-concept meme (still premium). Default: photo' },
            purpose: { type: 'string', description: 'What this visual is for, e.g. "Instagram feed post about child custody mediation", "Google Ads landing page hero for mortgage calculator".' },
            intended_platform: { type: 'string', enum: ['instagram_feed', 'instagram_story', 'facebook_feed', 'facebook_cover', 'google_ads', 'blog_hero', 'email_header'], description: 'Where the visual will be used.' },
          },
          required: ['prompt', 'purpose', 'intended_platform']
        }
      },
      allowed_agents: ['facebook-agent', 'instagram-agent', 'google-ads-campaign-agent', 'content-distribution-agent', 'website-content-agent', 'seo-core-agent', 'cro-agent']
    },
    // --- POST TO FACEBOOK PAGE ---
    {
      type: 'function',
      function: {
        name: 'post_to_facebook',
        description: 'Publish a post to the client Facebook Business Page via the Meta Graph API. Supports text posts and photo posts with images. The post goes live immediately — use only AFTER approval. For drafts, use propose_website_change or store in content calendar.',
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Post text content (Hebrew). Include hashtags at the end.' },
            image_url: { type: 'string', description: 'Optional: public URL of an image to attach. Use the URL returned by generate_premium_visual.' },
            link: { type: 'string', description: 'Optional: URL to share as a link post (e.g. blog article link).' },
            scheduled_publish_time: { type: 'number', description: 'Optional: Unix timestamp to schedule the post for future. Must be 10min-6months in the future.' },
          },
          required: ['message']
        }
      },
      allowed_agents: ['facebook-agent', 'content-distribution-agent', 'master-orchestrator']
    },
    // --- REPLY TO GOOGLE REVIEW ---
    {
      type: 'function',
      function: {
        name: 'reply_to_review',
        description: 'Reply to a Google Business Profile review via the GBP API. Use the review name/ID from fetch_google_reviews. Responds as the business owner.',
        parameters: {
          type: 'object',
          properties: {
            review_name: { type: 'string', description: 'The review resource name from GBP API (e.g. accounts/123/locations/456/reviews/789)' },
            reply_text: { type: 'string', description: 'The reply text in Hebrew. Professional, thankful tone. Plural office voice.' },
          },
          required: ['review_name', 'reply_text']
        }
      },
      allowed_agents: ['reviews-gbp-authority-agent', 'local-seo-agent', 'master-orchestrator']
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
      allowed_agents: ['master-orchestrator', 'reviews-gbp-authority-agent', 'local-seo-agent', 'credential-health-agent', 'facebook-agent', 'instagram-agent', 'content-distribution-agent', 'seo-core-agent', 'website-content-agent']
    },
    // --- PROPOSE WEBSITE CHANGE ---
    {
      type: 'function',
      function: {
        name: 'propose_website_change',
        description: 'Propose a concrete change to the client website. Works for any platform — GitHub, WordPress, Wix, Webflow, Shopify, or manual. Creates a tracked change proposal that routes to the correct platform connector. The change is staged for approval before execution.',
        parameters: {
          type: 'object',
          properties: {
            page_url: { type: 'string', description: 'Full URL of the page to change (e.g. https://yanivgil.co.il/about)' },
            change_type: {
              type: 'string',
              enum: ['seo_title','meta_description','h1','h2','body_content','schema_markup','image_alt','canonical_url','redirect','internal_link','nav_label','cta_text','page_slug','robots_txt'],
              description: 'Type of change to make'
            },
            current_value: { type: 'string', description: 'Current value on the page (what it says now). Leave empty if adding new content.' },
            proposed_value: { type: 'string', description: 'The new value to set. Must be complete and ready to publish — no placeholders.' },
            reason: { type: 'string', description: 'Why this change improves SEO, UX, or conversions. Be specific.' },
            priority: { type: 'string', enum: ['critical','high','medium','low'], description: 'Priority level. critical = blocking issue, high = significant impact, medium = improvement, low = nice to have' }
          },
          required: ['page_url', 'change_type', 'proposed_value', 'reason']
        }
      },
      allowed_agents: ['seo-core-agent','technical-seo-crawl-agent','website-content-agent','cro-agent','local-seo-agent','master-orchestrator','hebrew-quality-agent','gsc-daily-monitor','website-qa-agent','design-enforcement-agent','regression-agent','legal-agent','google-ads-campaign-agent','competitor-intelligence-agent','geo-ai-visibility-agent']
    },
    // --- GOOGLE ADS DATA ---
    {
      type: 'function',
      function: {
        name: 'fetch_google_ads_data',
        description: 'Fetch Google Ads campaign performance, search terms, or keyword data. Requires Google Ads connected via OAuth. Use to analyze campaign ROI, find wasted spend, and identify high-performing keywords.',
        parameters: {
          type: 'object',
          properties: {
            report_type: { type: 'string', enum: ['campaign_performance', 'search_terms', 'keywords', 'ad_groups', 'ads'], description: 'Type of report. campaign_performance = top-level stats, search_terms = actual queries triggering ads, keywords = bid keywords' },
            date_range_days: { type: 'integer', description: 'Days to look back. Default: 30' },
            include_zero_impressions: { type: 'boolean', description: 'Include keywords/ads with zero impressions. Default: false' }
          },
          required: ['report_type']
        }
      },
      allowed_agents: ['google-ads-campaign-agent', 'analytics-conversion-integrity-agent', 'master-orchestrator', 'report-composer-agent', 'kpi-integrity-agent']
    },
    // --- GA4 REPORTING ---
    {
      type: 'function',
      function: {
        name: 'fetch_ga4_report',
        description: 'Fetch Google Analytics 4 data — traffic, users, sessions, conversions, bounce rate by any dimension. Requires GA4 connected via OAuth.',
        parameters: {
          type: 'object',
          properties: {
            metrics: { type: 'array', items: { type: 'string' }, description: 'GA4 metric names. Common: ["sessions","users","newUsers","bounceRate","conversions","engagementRate","averageSessionDuration"]' },
            dimensions: { type: 'array', items: { type: 'string' }, description: 'GA4 dimension names. Common: ["date","sessionDefaultChannelGroup","landingPage","deviceCategory","country","eventName"]' },
            date_range_days: { type: 'integer', description: 'Days to look back. Default: 30. Use 7 for weekly, 90 for quarterly.' },
            row_limit: { type: 'integer', description: 'Max rows to return. Default: 50.' },
            order_by_metric: { type: 'string', description: 'Metric to sort by descending. Default: sessions.' }
          },
          required: ['metrics', 'dimensions']
        }
      },
      allowed_agents: ['analytics-conversion-integrity-agent', 'google-ads-campaign-agent', 'master-orchestrator', 'report-composer-agent', 'kpi-integrity-agent', 'cro-agent']
    },
    // --- GSC SEARCH ANALYTICS ---
    {
      type: 'function',
      function: {
        name: 'fetch_gsc_search_analytics',
        description: 'Fetch real Google Search Console search analytics — queries, pages, clicks, impressions, CTR, average position. ALWAYS call this first when you need SEO performance data. Returns actual data from the connected GSC property.',
        parameters: {
          type: 'object',
          properties: {
            dimensions: { type: 'array', items: { type: 'string', enum: ['query','page','country','device','date'] }, description: 'Group by dimensions. Use ["query"] for top queries, ["page"] for top pages, ["date"] for trend. Default: ["query"]' },
            date_range_days: { type: 'integer', description: 'Days to look back. Default: 28. Use 90 for trend analysis.' },
            row_limit: { type: 'integer', description: 'Rows to return. Default: 50, max 100.' },
            filter_dimension: { type: 'string', enum: ['query','page','country','device'], description: 'Optional: filter to rows matching filter_value' },
            filter_value: { type: 'string', description: 'Value to filter by (e.g. a specific keyword or page URL)' }
          },
          required: []
        }
      },
      allowed_agents: ['seo-core-agent','gsc-daily-monitor','technical-seo-crawl-agent','competitor-intelligence-agent','report-composer-agent','master-orchestrator','website-content-agent']
    },
    // --- GSC URL INSPECTION ---
    {
      type: 'function',
      function: {
        name: 'fetch_gsc_url_inspection',
        description: 'Inspect a specific URL in Google Search Console — returns indexing status, coverage state, last crawl time, robots.txt status, and rich results. Use to check if key pages are indexed. Returns verdict: PASS (indexed) or FAIL (not indexed) with the exact reason.',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Full URL to inspect (e.g. https://example.com/page)' }
          },
          required: ['url']
        }
      },
      allowed_agents: ['seo-core-agent','gsc-daily-monitor','technical-seo-crawl-agent','master-orchestrator','website-content-agent','kpi-integrity-agent']
    },
    // --- SUBMIT SITEMAP TO GSC ---
    {
      type: 'function',
      function: {
        name: 'submit_sitemap_to_gsc',
        description: 'Submit or re-submit a sitemap URL to Google Search Console. Use this after fixing indexing issues or adding new pages to force Google to re-crawl. Always call after propose_website_change fixes that affect page availability.',
        parameters: {
          type: 'object',
          properties: {
            sitemap_url: { type: 'string', description: 'Full sitemap URL to submit (e.g. https://example.com/sitemap.xml)' }
          },
          required: ['sitemap_url']
        }
      },
      allowed_agents: ['technical-seo-crawl-agent','seo-core-agent','gsc-daily-monitor','master-orchestrator']
    },
    {
      type: 'function',
      function: {
        name: 'reply_to_review',
        description: 'Publish a reply to a Google Business Profile review using GBP OAuth. Use the review_name returned by fetch_google_reviews. The reply is posted immediately and visible publicly.',
        parameters: {
          type: 'object',
          properties: {
            review_name: { type: 'string', description: 'Full GBP review name from fetch_google_reviews (e.g. accounts/123/locations/456/reviews/789)' },
            reply_text: { type: 'string', description: 'The reply text to post. Must be in CLIENT LANGUAGE. Max 4096 chars.' }
          },
          required: ['review_name', 'reply_text']
        }
      },
      allowed_agents: ['reviews-gbp-authority-agent']
    },
    {
      type: 'function',
      function: {
        name: 'crawl_site_onpage',
        description: 'Deep multi-page site crawl via DataForSEO OnPage API (Screaming Frog replacement). Returns domain-wide SEO health: broken links, duplicate titles/metas, missing alt text, page speed issues, canonical problems, thin content. Crawls up to 20 pages by default. Cached for 24h to avoid re-crawling. Use INSTEAD of scan_website when you need site-wide analysis.',
        parameters: {
          type: 'object',
          properties: {
            target_url: { type: 'string', description: 'Root URL of site to crawl (e.g. https://example.com)' },
            max_pages: { type: 'number', description: 'Max pages to crawl (default 20, max 100)' }
          },
          required: ['target_url']
        }
      },
      allowed_agents: ['technical-seo-crawl-agent', 'seo-core-agent', 'website-content-agent', 'cro-agent', 'master-orchestrator']
    },
    {
      type: 'function',
      function: {
        name: 'ask_chatgpt_visibility',
        description: 'Test whether the client appears in ChatGPT/GPT-4 answers for a specific question. Uses the live OpenAI API. Checks if client domain or business name is mentioned in the answer. Stores result to geo_visibility_signals. Use this alongside search_perplexity to measure AI visibility across multiple platforms.',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: 'The question to ask ChatGPT (e.g. "Who is the best divorce lawyer in Tel Aviv?")' },
            client_domain: { type: 'string', description: 'Client domain to check for in the answer (e.g. yanivgil.co.il)' },
            client_name: { type: 'string', description: 'Client name to also check for (e.g. "Yaniv Gil Law Firm")' }
          },
          required: ['question', 'client_domain']
        }
      },
      allowed_agents: ['geo-ai-visibility-agent', 'competitor-intelligence-agent', 'master-orchestrator']
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
        const resp = await fetchWithTimeout(apiUrl, {}, 30000);

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

        const resp = await fetchWithTimeout('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
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
        }, 25000);

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

        const resp = await fetchWithTimeout(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        }, 25000);

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
      // fetch_llm_mentions
      // ========================================
      case 'fetch_llm_mentions': {
        const login = (process.env.DATAFORSEO_LOGIN || '').trim();
        const password = (process.env.DATAFORSEO_PASSWORD || '').trim();
        if (!login || !password) return { error: 'DataForSEO credentials not configured' };

        const domain = args.domain;
        const platform = args.platform || 'google';
        const locationCode = args.location_code || 2376;
        const languageCode = args.language_code || 'he';
        const limit = Math.min(args.limit || 20, 100);

        // Build target array — domain + optional brand keyword
        const target = [
          { domain, search_filter: 'include', search_scope: ['any'], include_subdomains: true }
        ];
        if (args.brand_keyword) {
          target.push({
            keyword: args.brand_keyword,
            search_filter: 'include',
            search_scope: ['any'],
            match_type: 'partial_match'
          });
        }

        const resp = await fetchWithTimeout(
          'https://api.dataforseo.com/v3/ai_optimization/llm_mentions/search/live',
          {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64'),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify([{ target, platform, location_code: locationCode, language_code: languageCode, limit }])
          },
          30000
        );

        if (!resp.ok) return { error: `DataForSEO LLM Mentions error: ${resp.status}` };

        const data = await resp.json();
        const task = data?.tasks?.[0];
        if (task?.status_code !== 20000) {
          return { error: `DataForSEO LLM Mentions error: ${task?.status_message}`, code: task?.status_code };
        }

        const r = task.result?.[0];
        const items = (r?.items || []).map(item => ({
          keyword: item.keyword,
          ai_search_volume: item.ai_search_volume,
          impressions: item.impressions,
          mentions_count: item.mentions_count,
          position: item.position,
          cited_sources: item.cited_sources?.slice(0, 5),
          platform: item.platform
        }));

        return {
          domain,
          platform,
          total_mentions: r?.total_count || 0,
          items,
          fetched_at: new Date().toISOString()
        };
      }

      // ========================================
      // search_perplexity
      // ========================================
      case 'search_perplexity': {
        const apiKey = process.env.PERPLEXITY_API_KEY;
        if (!apiKey) return { error: 'Perplexity API key not configured. Set PERPLEXITY_API_KEY environment variable.' };

        const resp = await fetchWithTimeout('https://api.perplexity.ai/chat/completions', {
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
            const { error: researchErr } = await supabase.from('external_research_queries').insert({
              client_id: clientId,
              run_id: runId || null,
              agent_slug: args._agent_slug || null,
              query: args.query,
              focus: args.focus || 'web',
              answer: content,
              citations: result.citations,
              raw_response: { model: data.model, usage: data.usage },
              tokens_used: data.usage?.total_tokens || null
            });
            if (researchErr) console.error('[PERPLEXITY_STORE] external_research_queries insert failed:', researchErr.message);

            // 2. Extract and upsert cited domains
            const citedUrls = citations.filter(c => typeof c === 'string');
            for (const url of citedUrls) {
              try {
                const domain = new URL(url).hostname.replace(/^www\./, '');
                const { error: domainErr } = await supabase.from('cited_domains').upsert({
                  client_id: clientId,
                  domain,
                  citation_count: 1,
                  contexts: [args.query.slice(0, 200)],
                  last_seen: new Date().toISOString(),
                }, { onConflict: 'client_id,domain' });
                if (domainErr) console.error('[PERPLEXITY_STORE] cited_domains upsert failed:', domainErr.message);
                // Increment count for existing
                const { error: rpcErr } = await supabase.rpc('increment_citation_count', { p_client_id: clientId, p_domain: domain, p_context: args.query.slice(0, 200) });
                if (rpcErr) console.error('[PERPLEXITY_STORE] increment_citation_count failed:', rpcErr.message);
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
                const { error: entityErr } = await supabase.from('repeated_entities').upsert({
                  client_id: clientId,
                  entity_name: entity.slice(0, 100),
                  entity_type: 'brand_or_org',
                  mention_count: 1,
                  source_queries: [args.query.slice(0, 200)],
                  last_seen: new Date().toISOString(),
                }, { onConflict: 'client_id,entity_name' });
                if (entityErr) console.error('[PERPLEXITY_STORE] repeated_entities upsert failed:', entityErr.message);
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

        // ── CACHE: check for a recent cached GBP response (< 10 min old) ──
        // Google Business Profile API has a very low default quota (1 req/min),
        // so we cache every successful fetch and serve from cache for 10 minutes.
        // This caps real API calls at ~6/hour/client, well under the 60/hr free limit.
        if (clientId) {
          const { data: cached } = await supabase
            .from('baselines')
            .select('metric_text, recorded_at')
            .eq('client_id', clientId)
            .eq('metric_name', 'google_reviews_cached_response')
            .gte('recorded_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
            .maybeSingle();

          if (cached?.metric_text) {
            try {
              const cachedData = JSON.parse(cached.metric_text);
              return {
                ...cachedData,
                source: 'cache',
                cached_at: cached.recorded_at,
                cache_age_seconds: Math.round((Date.now() - new Date(cached.recorded_at).getTime()) / 1000)
              };
            } catch { /* fall through to live fetch if cache is corrupted */ }
          }
        }

        // ── Strategy 1: Use GBP OAuth to fetch reviews (auto-refreshes if expired) ──
        if (clientId) {
          try {
            const accessToken = await getValidGoogleToken(clientId);

            if (accessToken) {
              // Try GBP API — list accounts, then get location reviews
              const acctResp = await fetchWithTimeout('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              }, 15000);
              const acctData = await acctResp.json();

              // Detect GBP API errors — log and fall through to DataForSEO instead of returning
              if (acctResp.status === 429 || acctData.error?.code === 429) {
                console.error('[GBP_OAUTH] 429 quota exceeded — falling through to DataForSEO');
                throw new Error('GBP 429 quota exceeded');
              }
              if (acctData.error) {
                console.error(`[GBP_OAUTH] ${acctData.error.code} error — falling through to DataForSEO`);
                throw new Error(`GBP ${acctData.error.code}: ${acctData.error.message}`);
              }
              if (!acctData.accounts?.length) {
                console.error('[GBP_OAUTH] no accounts — falling through to DataForSEO');
                throw new Error('GBP OAuth returned zero accounts');
              }

              const accountName = acctData.accounts[0].name;
              // List locations
              const locResp = await fetchWithTimeout(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,metadata`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              }, 15000);
              const locData = await locResp.json();

              if (!locData.locations?.length) {
                return {
                  error: 'GBP OAuth connected and account found, but no locations/business profiles. Make sure the business is claimed and verified.',
                  gbp_oauth_used: true,
                  gbp_account: accountName,
                  gbp_locations_found: 0
                };
              }

              const location = locData.locations[0];
              // Get reviews — include review names so reply_to_review can use them
              const reviewResp = await fetchWithTimeout(`https://mybusiness.googleapis.com/v4/${location.name}/reviews`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              }, 15000);
              const reviewData = await reviewResp.json();

              const starToNum = s => ({ FIVE: 5, FOUR: 4, THREE: 3, TWO: 2, ONE: 1 }[s] || 0);
              const successResult = {
                business_name: location.title || args.business_name,
                location_name: location.name,
                account_name: accountName,
                total_reviews: reviewData.totalReviewCount || 0,
                rating: reviewData.averageRating || null,
                recent_reviews: (reviewData.reviews || []).slice(0, 10).map(r => ({
                  review_name: r.name,  // needed for reply_to_review
                  author: r.reviewer?.displayName,
                  rating: starToNum(r.starRating),
                  text: r.comment?.slice(0, 300),
                  time: r.createTime,
                  has_reply: !!r.reviewReply,
                  reply_text: r.reviewReply?.comment?.slice(0, 200)
                })),
                unanswered_count: (reviewData.reviews || []).filter(r => !r.reviewReply).length,
                fetched_at: new Date().toISOString(),
                source: 'gbp_oauth_api'
              };

              // Write cache — 10 min TTL enforced on read side
              await supabase.from('baselines').upsert({
                client_id: clientId,
                metric_name: 'google_reviews_cached_response',
                metric_value: successResult.total_reviews,
                metric_text: JSON.stringify(successResult),
                source: 'gbp_oauth_api_cache',
                recorded_at: new Date().toISOString()
              }, { onConflict: 'client_id,metric_name' });

              return successResult;
            }
          } catch (gbpErr) {
            console.error('[GBP_OAUTH]', gbpErr.message);
            // Don't return here — fall through to DataForSEO
          }
        }

        // ── Strategy 2: DataForSEO SERP — branded search returns rating + votes in local_pack ──
        // Same proven endpoint as fetch_local_serp. We search for the business name
        // and look for it in the local_pack items, which contain rating.value and
        // rating.votes_count for each business Google shows on Maps.
        const dfsLogin = (process.env.DATAFORSEO_LOGIN || '').trim();
        const dfsPassword = (process.env.DATAFORSEO_PASSWORD || '').trim();
        if (dfsLogin && dfsPassword && args.business_name) {
          try {
            const isIsrael = ((args.location || args.domain || '').toLowerCase().includes('israel') ||
                             (args.location || '').toLowerCase().includes('tel aviv') ||
                             (args.business_name_he) || /[\u0590-\u05FF]/.test(args.business_name));

            // Search queries to try — branded first, then with location, then just domain
            const searchQueries = [args.business_name];
            if (args.location) searchQueries.push(`${args.business_name} ${args.location}`);
            if (args.domain) searchQueries.push(args.domain.replace(/^https?:\/\//, '').replace(/\/$/, ''));

            let matchedItem = null;
            let matchSourceQuery = null;
            const targetDomain = (args.domain || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();

            for (const q of searchQueries) {
              const dfsResp = await fetchWithTimeout(
                'https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
                {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${dfsLogin}:${dfsPassword}`).toString('base64'),
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify([{
                    keyword: q,
                    location_code: isIsrael ? 2376 : 2840,
                    language_code: isIsrael ? 'he' : 'en',
                    device: 'desktop',
                    os: 'windows'
                  }])
                },
                20000
              );

              if (!dfsResp.ok) continue;
              const dfsData = await dfsResp.json();
              const result = dfsData?.tasks?.[0]?.result?.[0];
              const allItems = result?.items || [];

              // Look in knowledge_graph first (best match for branded searches)
              const knowledgeGraph = allItems.find(i => i.type === 'knowledge_graph');
              if (knowledgeGraph?.rating) {
                matchedItem = knowledgeGraph;
                matchSourceQuery = q;
                break;
              }

              // Otherwise look in local_pack for entry matching domain or business name
              const localPacks = allItems.filter(i => i.type === 'local_pack' || i.type === 'maps');
              for (const lp of localPacks) {
                const entries = lp.items || [lp];
                for (const entry of entries) {
                  const entryDomain = (entry.domain || '').toLowerCase();
                  const entryTitle = (entry.title || '').toLowerCase();
                  const matchesDomain = targetDomain && entryDomain.includes(targetDomain.split('.')[0]);
                  const matchesName = args.business_name && entryTitle.includes(args.business_name.toLowerCase().split(' ')[0]);
                  if ((matchesDomain || matchesName) && entry.rating?.votes_count !== undefined) {
                    matchedItem = entry;
                    matchSourceQuery = q;
                    break;
                  }
                }
                if (matchedItem) break;
              }
              if (matchedItem) break;
            }

            if (matchedItem && matchedItem.rating) {
              const successResult = {
                business_name: matchedItem.title || args.business_name,
                total_reviews: matchedItem.rating.votes_count || 0,
                rating: matchedItem.rating.value || null,
                place_id: matchedItem.place_id || null,
                address: matchedItem.address || null,
                phone: matchedItem.phone || null,
                website: matchedItem.url || matchedItem.domain || null,
                matched_via_query: matchSourceQuery,
                fetched_at: new Date().toISOString(),
                source: 'dataforseo_serp_local_pack'
              };

              // Cache it
              if (clientId) {
                await supabase.from('baselines').upsert({
                  client_id: clientId,
                  metric_name: 'google_reviews_cached_response',
                  metric_value: successResult.total_reviews,
                  metric_text: JSON.stringify(successResult),
                  source: 'dataforseo_cache',
                  recorded_at: new Date().toISOString()
                }, { onConflict: 'client_id,metric_name' });

                // Also update the canonical baseline so the dashboard shows fresh data
                await supabase.from('baselines').upsert({
                  client_id: clientId,
                  metric_name: 'google_reviews_count',
                  metric_value: successResult.total_reviews,
                  source: 'DataForSEO Business Data',
                  recorded_at: new Date().toISOString()
                }, { onConflict: 'client_id,metric_name' });

                if (successResult.rating) {
                  await supabase.from('baselines').upsert({
                    client_id: clientId,
                    metric_name: 'google_reviews_rating',
                    metric_value: successResult.rating,
                    source: 'DataForSEO Business Data',
                    recorded_at: new Date().toISOString()
                  }, { onConflict: 'client_id,metric_name' });
                }
              }

              return successResult;
            }
          } catch (dfsErr) {
            console.error('[DATAFORSEO_GBP]', dfsErr.message);
          }
        }

        // ── Strategy 3: Google Places API (requires billing) ──
        if (!apiKey) return { error: 'All review fetch strategies failed. GBP OAuth quota exceeded AND DataForSEO returned no match. Check business_name spelling or verify DataForSEO credentials.' };

        let placeId = args.place_id;

        if (!placeId) {
          // Search for the business — try multiple queries including Hebrew
          const queries = [args.business_name];
          if (args.business_name_he) queries.push(args.business_name_he);
          if (args.location) queries.push(`${args.business_name} ${args.location}`);
          if (args.domain) queries.push(args.domain);

          let searchData = null;
          for (const query of queries) {
            const searchUrl = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name,formatted_address,rating,user_ratings_total&key=${apiKey}`;
            const searchResp = await fetchWithTimeout(searchUrl, {}, 15000);
            searchData = await searchResp.json();
            if (searchData.status === 'OK' && searchData.candidates?.length) break;
          }

          // Also try Text Search API as fallback (more flexible matching)
          if (searchData?.status !== 'OK' || !searchData?.candidates?.length) {
            const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(args.business_name)}&key=${apiKey}`;
            const textResp = await fetchWithTimeout(textSearchUrl, {}, 15000);
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
            return { error: `Business not found. Tried: ${queries.join(', ')}`, api_status: searchData?.status, hint: searchData?.status === 'REQUEST_DENIED' ? 'Google Places API billing not enabled' : 'Try providing place_id directly or business_name_he in Hebrew' };
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
        const detailResp = await fetchWithTimeout(detailUrl, {}, 15000);
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

        const resp = await fetchWithTimeout('https://api.dataforseo.com/v3/serp/google/organic/live/advanced', {
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
        }, 25000);

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
      // query_credential_health
      // Canonical credential health reader — reads REAL tables:
      //   oauth_credentials (master OAuth grant)
      //   client_integrations (per-service connection + discovery summary)
      //   integration_assets (discovered properties / accounts / locations)
      // Returns per-service state so the credential-health-agent never
      // has to guess. This replaces the stale `client_credentials` path.
      // ========================================
      case 'query_credential_health': {
        try {
          const [oauthRes, integrationsRes, assetsRes] = await Promise.all([
            supabase.from('oauth_credentials').select('provider, account_email, scopes, status, error, last_refreshed_at, expires_at').eq('client_id', clientId),
            supabase.from('client_integrations').select('provider, sub_provider, status, discovery_summary, error, connected_at').eq('client_id', clientId),
            supabase.from('integration_assets').select('provider, sub_provider, asset_type, asset_label, asset_id').eq('client_id', clientId),
          ]);

          const oauthGrants = oauthRes.data || [];
          const integrations = integrationsRes.data || [];
          const assets = assetsRes.data || [];

          // Group assets by sub_provider for summary counts
          const assetsBySubProvider = {};
          for (const a of assets) {
            const key = a.sub_provider || a.provider;
            if (!assetsBySubProvider[key]) assetsBySubProvider[key] = [];
            assetsBySubProvider[key].push(a);
          }

          // Build canonical service list
          const servicesToReport = [
            { service: 'google_search_console', provider: 'google', sub_provider: 'search_console' },
            { service: 'google_ads', provider: 'google', sub_provider: 'ads' },
            { service: 'google_analytics', provider: 'google', sub_provider: 'analytics' },
            { service: 'google_business_profile', provider: 'google', sub_provider: 'business_profile' },
            { service: 'facebook', provider: 'meta', sub_provider: 'facebook' },
            { service: 'instagram', provider: 'meta', sub_provider: 'instagram' },
            { service: 'openai', provider: 'openai', sub_provider: null },
            { service: 'perplexity', provider: 'perplexity', sub_provider: null },
            { service: 'dataforseo', provider: 'dataforseo', sub_provider: null },
            { service: 'moz', provider: 'moz', sub_provider: null },
          ];

          const credential_status = servicesToReport.map(({ service, provider, sub_provider }) => {
            const oauth = oauthGrants.find(g => g.provider === provider);
            const integration = integrations.find(i => i.provider === provider && (sub_provider ? i.sub_provider === sub_provider : true));
            const svcAssets = assetsBySubProvider[sub_provider || provider] || [];

            // Env-var-backed services (openai/perplexity/dataforseo/moz)
            if (!sub_provider && ['openai', 'perplexity', 'dataforseo', 'moz'].includes(provider)) {
              const envMap = {
                openai: process.env.OPENAI_API_KEY,
                perplexity: process.env.PERPLEXITY_API_KEY,
                dataforseo: process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD,
                moz: process.env.MOZ_API_KEY,
              };
              const hasKey = !!envMap[provider];
              return {
                service,
                is_connected: hasKey,
                health_score: hasKey ? 100 : 0,
                status: hasKey ? 'connected' : 'missing',
                error: hasKey ? null : `${provider} API key not configured in environment`,
                source: 'env',
              };
            }

            // OAuth-backed services
            if (!oauth || oauth.status !== 'active') {
              return {
                service,
                is_connected: false,
                health_score: 0,
                status: 'missing',
                error: oauth?.error || 'No active OAuth grant',
                source: 'oauth_credentials',
              };
            }

            if (!integration) {
              return {
                service,
                is_connected: false,
                health_score: 25,
                status: 'limited',
                error: 'OAuth grant exists but no integration row — run rediscovery',
                account_email: oauth.account_email,
                scopes: oauth.scopes,
                source: 'oauth_credentials',
              };
            }

            const assetCount = svcAssets.length;
            const discoverySummary = integration.discovery_summary || {};
            const discoveryCount = discoverySummary.count ?? discoverySummary.pages_found ?? assetCount;

            let health_score = 0;
            let status_label = integration.status;
            if (integration.status === 'connected' && (discoveryCount > 0 || assetCount > 0)) {
              health_score = 100;
              status_label = 'connected';
            } else if (integration.status === 'connected') {
              health_score = 60;
              status_label = 'limited';
            } else if (integration.status === 'limited') {
              health_score = 40;
            } else {
              health_score = 10;
            }

            return {
              service,
              is_connected: integration.status === 'connected' && health_score >= 60,
              health_score,
              status: status_label,
              error: integration.error || discoverySummary.error || null,
              hint: discoverySummary.hint || null,
              account_email: oauth.account_email,
              scopes: oauth.scopes,
              discovered_count: discoveryCount,
              asset_count: assetCount,
              last_connected_at: integration.connected_at,
              source: 'client_integrations + integration_assets',
            };
          });

          const overall = credential_status.length
            ? Math.round(credential_status.reduce((a, c) => a + c.health_score, 0) / credential_status.length)
            : 0;

          const critical_failures = credential_status
            .filter(c => c.status === 'missing' || c.health_score === 0)
            .map(c => ({ service: c.service, error: c.error, urgency: 'high' }));

          return {
            credential_status,
            overall_health_score: overall,
            critical_failures,
            connected_services: credential_status.filter(c => c.is_connected).map(c => c.service),
            limited_services: credential_status.filter(c => c.status === 'limited').map(c => c.service),
            missing_services: credential_status.filter(c => c.status === 'missing').map(c => c.service),
            data_sources: ['oauth_credentials', 'client_integrations', 'integration_assets'],
            note: 'This is the CANONICAL source of truth. Do NOT create missing-credential incidents for any service returned with status=connected. For status=limited, create at most ONE incident per service explaining the specific error/hint — do not duplicate.',
          };
        } catch (err) {
          return { error: `query_credential_health failed: ${err.message}` };
        }
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
      // generate_premium_visual — DALL-E 3
      // Produces a premium social/ad image, stores it in integration_assets,
      // and returns the URL so the agent can attach it to a proposal.
      // ========================================
      case 'generate_premium_visual': {
        try {
          const sizeMap = {
            square: '1024x1024',
            portrait: '1024x1792',
            landscape: '1792x1024',
          };
          const size = sizeMap[args.aspect || 'square'] || '1024x1024';

          // Premium quality stylistic wrapper — injected into every prompt
          const stylePrefix = {
            photo: 'Premium editorial photography, studio lighting, razor-sharp focus, magazine-grade composition, high dynamic range, color-graded, no text overlay unless specified. ',
            illustration: 'Editorial illustration in a premium minimalist style, sophisticated color palette, refined linework, tasteful negative space, suitable for a high-end brand. No childish or cartoonish elements. ',
            typography_card: 'Minimalist typography-only card. Premium sans-serif or modern serif, perfect kerning, elegant hierarchy, restrained color palette (max 2 colors + background), generous negative space, magazine cover quality. ',
            meme: 'Tasteful high-concept meme with premium aesthetic. Clean typography, sharp photography or illustration, clever visual punchline. No low-effort clipart, no pixelated images, no childish faces. ',
          };
          const fullPrompt = (stylePrefix[args.style || 'photo'] || stylePrefix.photo) + args.prompt;

          const result = await openaiImages.images.generate({
            model: 'dall-e-3',
            prompt: fullPrompt.slice(0, 4000),
            size,
            quality: 'hd',
            style: args.style === 'illustration' || args.style === 'typography_card' ? 'vivid' : 'natural',
            n: 1,
          });

          const url = result.data?.[0]?.url;
          const revisedPrompt = result.data?.[0]?.revised_prompt;
          if (!url) return { error: 'DALL-E returned no URL' };

          // Persist into integration_assets so visuals are tracked and re-usable
          const { data: asset } = await supabase.from('integration_assets').insert({
            client_id: clientId,
            provider: 'openai',
            sub_provider: 'dalle3',
            asset_type: 'image',
            label: args.purpose?.slice(0, 200) || 'generated visual',
            external_id: `visual_${Date.now()}`,
            url,
            metadata_json: {
              intended_platform: args.intended_platform,
              style: args.style || 'photo',
              aspect: args.aspect || 'square',
              size,
              original_prompt: args.prompt,
              revised_prompt: revisedPrompt,
              run_id: runId,
            },
          }).select().single();

          return {
            generated: true,
            url,
            size,
            intended_platform: args.intended_platform,
            style: args.style || 'photo',
            asset_id: asset?.id,
            revised_prompt: revisedPrompt,
            note: 'Visual generated and stored in integration_assets. Attach url to the post/ad proposal.',
          };
        } catch (err) {
          return { error: `generate_premium_visual failed: ${err.message}` };
        }
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
          // Language guard: reject keywords that don't match the client's primary language.
          // Hebrew clients must have Hebrew keywords, English clients must have English keywords.
          const { data: profileRow } = await supabase.from('client_profiles').select('language').eq('client_id', clientId).maybeSingle();
          const { data: ruleRow } = profileRow?.language ? { data: null } : await supabase.from('client_rules').select('language').eq('client_id', clientId).maybeSingle();
          const clientLang = profileRow?.language || ruleRow?.language || null;
          const hasHebrew = /[\u0590-\u05FF]/.test(args.keyword);
          const detectedLang = hasHebrew ? 'he' : 'en';
          if (clientLang && clientLang !== detectedLang) {
            return { skipped: true, keyword: args.keyword, reason: `wrong_language: keyword is ${detectedLang}, client is ${clientLang}` };
          }
          await supabase.from('client_keywords').insert({
            client_id: clientId,
            keyword: args.keyword,
            current_position: args.position,
            url: args.url,
            last_checked: new Date().toISOString(),
            keyword_language: detectedLang,
          });
          return { created: true, keyword: args.keyword, position: args.position, keyword_language: detectedLang };
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
        // Deduplication: check if a similar open incident already exists (same title or similar description)
        const { data: existing } = await supabase.from('incidents')
          .select('id, title, created_at')
          .eq('client_id', clientId)
          .in('status', ['open', 'investigating'])
          .ilike('title', `%${args.title.slice(0, 60)}%`)
          .limit(1);

        if (existing && existing.length > 0) {
          return { created: false, duplicate: true, existing_incident_id: existing[0].id, title: existing[0].title, message: 'Similar incident already open — not creating duplicate.' };
        }

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

      // ========================================
      // post_to_facebook
      // ========================================
      case 'post_to_facebook': {
        if (!clientId) return { error: 'No client context' };
        // Get page access token from integration_assets
        const { data: fbAsset } = await supabase.from('integration_assets')
          .select('external_id, metadata_json, label')
          .eq('client_id', clientId).eq('provider', 'meta').eq('sub_provider', 'facebook')
          .eq('is_selected', true).maybeSingle();
        if (!fbAsset?.metadata_json?.page_access_token) {
          return { error: 'No Facebook page connected or no page access token. Reconnect Meta OAuth and select the page.' };
        }
        const pageId = fbAsset.external_id;
        const pageToken = fbAsset.metadata_json.page_access_token;
        try {
          let endpoint, body;
          if (args.image_url) {
            // Photo post
            endpoint = `https://graph.facebook.com/v21.0/${pageId}/photos`;
            body = new URLSearchParams({
              url: args.image_url,
              message: args.message || '',
              access_token: pageToken,
              ...(args.scheduled_publish_time ? { scheduled_publish_time: String(args.scheduled_publish_time), published: 'false' } : {}),
            });
          } else {
            // Text/link post
            endpoint = `https://graph.facebook.com/v21.0/${pageId}/feed`;
            body = new URLSearchParams({
              message: args.message,
              access_token: pageToken,
              ...(args.link ? { link: args.link } : {}),
              ...(args.scheduled_publish_time ? { scheduled_publish_time: String(args.scheduled_publish_time), published: 'false' } : {}),
            });
          }
          const resp = await fetchWithTimeout(endpoint, { method: 'POST', body }, 20000);
          const data = await resp.json();
          if (data.error) {
            return { error: `Facebook API error: ${data.error.message}`, code: data.error.code };
          }
          return {
            success: true,
            post_id: data.id || data.post_id,
            page: fbAsset.label,
            scheduled: !!args.scheduled_publish_time,
            posted_at: new Date().toISOString()
          };
        } catch (e) {
          return { error: `Facebook post failed: ${e.message}` };
        }
      }

      // ========================================
      // reply_to_review (GBP)
      // ========================================
      case 'reply_to_review': {
        if (!clientId) return { error: 'No client context' };
        const googleToken = await getValidGoogleToken(clientId);
        if (!googleToken) return { error: 'Google OAuth not connected or token expired' };
        try {
          const resp = await fetchWithTimeout(
            `https://mybusiness.googleapis.com/v4/${args.review_name}/reply`,
            {
              method: 'PUT',
              headers: { Authorization: `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ comment: args.reply_text })
            },
            15000
          );
          const data = await resp.json();
          if (!resp.ok) {
            return { error: `GBP reply error ${resp.status}: ${data.error?.message || JSON.stringify(data)}` };
          }
          return { success: true, review_name: args.review_name, replied_at: new Date().toISOString() };
        } catch (e) {
          return { error: `GBP reply failed: ${e.message}` };
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

      case 'propose_website_change': {
        // ─── 0. APPROVAL GATE ───
        // Determine the action mode for this agent/client combination.
        // Order: client_rules.action_mode_overrides[slug] > agent_templates.action_mode_default > 'approve_then_act' default
        let actionMode = 'approve_then_act'; // safety default
        let agentSlug = null;
        if (runId) {
          const { data: run } = await supabase.from('runs')
            .select('agent_template_id, agent_templates!inner(slug, action_mode_default)')
            .eq('id', runId).maybeSingle();
          agentSlug = run?.agent_templates?.slug || null;
          const agentDefault = run?.agent_templates?.action_mode_default || 'approve_then_act';
          actionMode = agentDefault;
        }
        if (clientId) {
          const { data: rules } = await supabase.from('client_rules')
            .select('action_mode_overrides')
            .eq('client_id', clientId).maybeSingle();
          const overrides = rules?.action_mode_overrides || {};
          if (agentSlug && overrides[agentSlug]) actionMode = overrides[agentSlug];
        }

        // Report-only mode: refuse to even store the change
        if (actionMode === 'report_only') {
          return {
            status: 'skipped',
            action_mode: 'report_only',
            message: `Agent ${agentSlug || 'unknown'} is in report_only mode — no change proposed. Finding logged only.`,
            change_type: args.change_type,
            page_url: args.page_url
          };
        }

        // ─── 0b. DEDUP CHECK ───
        // Normalize URLs so www vs non-www and trailing-slash variants match.
        function normalizeUrl(url) {
          try {
            const u = new URL(url);
            // Remove www prefix for consistency
            u.hostname = u.hostname.replace(/^www\./, '');
            // Remove trailing slash except for root
            let path = u.pathname.replace(/\/+$/, '') || '/';
            return `${u.protocol}//${u.hostname}${path}`;
          } catch { return url; }
        }

        const normalizedUrl = normalizeUrl(args.page_url);

        // Query existing proposals for this client + change_type to detect duplicates
        const { data: existingChanges } = await supabase.from('proposed_changes')
          .select('id, status, proposed_value, page_url, created_at')
          .eq('client_id', clientId)
          .eq('change_type', args.change_type)
          .in('status', ['proposed', 'approved', 'executed'])
          .order('created_at', { ascending: false })
          .limit(50);

        const duplicate = existingChanges?.find(e => normalizeUrl(e.page_url) === normalizedUrl);

        if (duplicate) {
          return {
            created: false,
            duplicate: true,
            existing_change_id: duplicate.id,
            existing_status: duplicate.status,
            message: `A ${args.change_type} change for ${args.page_url} already exists (status: ${duplicate.status}, created: ${duplicate.created_at}).`
          };
        }

        // 1. Detect client's website platform
        // NOTE: column is primary_domain, NOT domain. Using the wrong name
        // causes the whole SELECT to fail silently and website stays null.
        const { data: website, error: websiteErr } = await supabase.from('client_websites')
          .select('id, website_platform_type, cms_type, primary_domain')
          .eq('client_id', clientId)
          .maybeSingle();
        if (websiteErr) console.error('[PROPOSE_CHANGE] client_websites query failed:', websiteErr.message);

        // Also check client_connectors for github (legacy table)
        const { data: connectors } = await supabase.from('client_connectors')
          .select('connector_type, config, is_active')
          .eq('client_id', clientId)
          .eq('is_active', true);

        const connectorMap = Object.fromEntries((connectors || []).map(c => [c.connector_type, c]));

        // ── NEW: check website_git_connections (the real git config table) ──
        let gitConnection = null;
        if (website?.id) {
          const { data: gitConn } = await supabase.from('website_git_connections')
            .select('provider, repo_owner, repo_name, repo_url, production_branch, default_branch, access_mode')
            .eq('client_website_id', website.id)
            .maybeSingle();
          gitConnection = gitConn;
        }

        // Determine platform — prefer the real git connection table over legacy connectors
        let platform = 'manual';
        if (gitConnection?.provider === 'github') platform = 'github';
        else if (gitConnection?.provider === 'gitlab') platform = 'gitlab';
        else if (connectorMap['github']) platform = 'github';
        else if (website?.cms_type) platform = website.cms_type; // wordpress/wix/webflow/shopify
        else if (website?.website_platform_type === 'wordpress') platform = 'wordpress';
        else if (website?.website_platform_type === 'wix') platform = 'wix';
        else if (website?.website_platform_type === 'webflow') platform = 'webflow';
        else if (website?.website_platform_type === 'shopify') platform = 'shopify';

        // 2. Save the proposed change (use normalizedUrl for consistency)
        const { data: change, error: changeErr } = await supabase.from('proposed_changes').insert({
          client_id: clientId,
          run_id: runId,
          agent_slug: agentSlug || 'agent',
          page_url: normalizedUrl,
          change_type: args.change_type,
          current_value: args.current_value || null,
          proposed_value: args.proposed_value,
          reason: args.reason,
          priority: args.priority || 'medium',
          platform,
          status: 'proposed',
        }).select().single();

        if (changeErr) return { error: `Failed to save proposed change: ${changeErr.message}` };

        // 3. If action mode is approve_then_act, STOP here — the user must approve
        //    via the app before any code is pushed. This is the safety gate.
        if (actionMode === 'approve_then_act') {
          return {
            status: 'awaiting_approval',
            action_mode: 'approve_then_act',
            change_id: change.id,
            platform,
            page_url: args.page_url,
            change_type: args.change_type,
            proposed_value: args.proposed_value,
            priority: args.priority || 'medium',
            message: `Change saved for your review. Open the Proposed Changes tab in the app to approve or reject.`
          };
        }

        // 4. Autonomous mode — execute immediately via platform connector
        let executionResult = null;

        if (platform === 'github') {
          // Build config from website_git_connections first, then fall back to client_connectors
          const gitConfig = gitConnection ? {
            repo_url: gitConnection.repo_url || `https://github.com/${gitConnection.repo_owner}/${gitConnection.repo_name}`,
            repo_owner: gitConnection.repo_owner,
            repo_name: gitConnection.repo_name,
            default_branch: gitConnection.production_branch || gitConnection.default_branch || 'main',
            access_mode: gitConnection.access_mode
          } : connectorMap['github']?.config;

          if (gitConfig?.repo_url || gitConfig?.repo_owner) {
            executionResult = await executeGitHubChange(clientId, change, gitConfig);
          }
        } else if (platform === 'wordpress') {
          executionResult = await executeWordPressChange(clientId, change);
        } else if (platform === 'webflow') {
          executionResult = await executeWebflowChange(clientId, change);
        }

        if (executionResult?.success) {
          await supabase.from('proposed_changes').update({
            status: 'executed',
            platform_ref: executionResult.ref,
            executed_at: new Date().toISOString(),
            execution_result: executionResult,
          }).eq('id', change.id);

          // ── IMMEDIATELY queue validation agents after every executed change ──
          const validationQueued = await queuePostChangeValidators(clientId, change.id, args.change_type, args.page_url, runId);

          return {
            status: 'executed',
            platform,
            change_id: change.id,
            ref: executionResult.ref,
            message: executionResult.message,
            validation_agents_queued: validationQueued,
          };
        }

        // No direct execution — staged for manual approval
        // Still queue validators so they can pre-check the page before the change goes live
        const validationQueued = await queuePostChangeValidators(clientId, change.id, args.change_type, args.page_url, runId);

        return {
          status: 'proposed',
          platform,
          change_id: change.id,
          page_url: args.page_url,
          change_type: args.change_type,
          proposed_value: args.proposed_value,
          priority: args.priority || 'medium',
          validation_agents_queued: validationQueued,
          message: platform === 'manual'
            ? 'Change staged. No platform connector configured — requires manual implementation.'
            : `Change staged for ${platform}. Platform connector found but execution pending approval.`,
        };
      }

      // ========================================
      // fetch_google_ads_data
      // ========================================
      case 'fetch_google_ads_data': {
        const token = await getValidGoogleToken(clientId);
        if (!token) return { error: 'Google OAuth token unavailable. Check Credentials page.' };

        // Get the stored Google Ads customer ID — prefer selected, fallback to first available
        let { data: asset } = await supabase.from('integration_assets')
          .select('external_id, label')
          .eq('client_id', clientId).eq('sub_provider', 'ads').eq('is_selected', true).maybeSingle();
        if (!asset?.external_id) {
          const { data: fallback } = await supabase.from('integration_assets')
            .select('external_id, label').eq('client_id', clientId).eq('sub_provider', 'ads')
            .order('created_at', { ascending: true }).limit(1).maybeSingle();
          asset = fallback;
        }
        if (!asset?.external_id) return { error: 'No Google Ads account found. Connect Google Ads in Credentials and ensure the account has been discovered.' };

        const customerId = asset.external_id.replace(/-/g, '');
        const days = args.date_range_days || 30;
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

        const reportType = args.report_type || 'campaign_performance';

        // Build GAQL query based on report type
        const queries = {
          campaign_performance: `SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status = 'ENABLED' ORDER BY metrics.cost_micros DESC LIMIT 50`,
          search_terms: `SELECT search_term_view.search_term, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr FROM search_term_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.cost_micros DESC LIMIT 100`,
          keywords: `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.average_cpc, ad_group_criterion.quality_info.quality_score FROM ad_group_criterion WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.status = 'ENABLED' ORDER BY metrics.impressions DESC LIMIT 100`,
          ad_groups: `SELECT ad_group.name, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group.status = 'ENABLED' ORDER BY metrics.cost_micros DESC LIMIT 50`,
          ads: `SELECT ad_group_ad.ad.final_urls, ad_group_ad.ad.text_ad.headline, ad_group_ad.ad.responsive_search_ad.headlines, metrics.impressions, metrics.clicks, metrics.ctr, metrics.conversions FROM ad_group_ad WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND ad_group_ad.status = 'ENABLED' ORDER BY metrics.impressions DESC LIMIT 50`
        };

        const { getGoogleAdsDeveloperToken, getGoogleAdsManagerId } = await import('./onboarding.js');
        const devToken = await getGoogleAdsDeveloperToken();
        if (!devToken) {
          return { error: 'Google Ads developer token missing — set system_settings.google_ads_developer_token or GOOGLE_ADS_DEVELOPER_TOKEN env var' };
        }
        const managerId = await getGoogleAdsManagerId();
        const adsHeaders = {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'developer-token': devToken,
          ...(managerId ? { 'login-customer-id': managerId } : {}),
        };
        const resp = await fetchWithTimeout(
          `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:search`,
          { method: 'POST', headers: adsHeaders,
            body: JSON.stringify({ query: queries[reportType] }) },
          20000
        );

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          const errMsg = err?.error?.message || err?.error?.details?.[0]?.errors?.[0]?.message || resp.statusText;
          // Common errors: developer token not approved, customer not linked
          if (resp.status === 403) return { error: `Google Ads API access denied. Check GOOGLE_ADS_DEVELOPER_TOKEN env var and customer access. Detail: ${errMsg}` };
          return { error: `Google Ads API error ${resp.status}: ${errMsg}` };
        }

        const data = await resp.json();
        const results = data.results || [];

        if (reportType === 'campaign_performance') {
          const campaigns = results.map(r => ({
            name: r.campaign?.name,
            status: r.campaign?.status,
            impressions: r.metrics?.impressions || 0,
            clicks: r.metrics?.clicks || 0,
            cost: parseFloat(((r.metrics?.costMicros || 0) / 1e6).toFixed(2)),
            conversions: parseFloat((r.metrics?.conversions || 0).toFixed(2)),
            ctr: parseFloat(((r.metrics?.ctr || 0) * 100).toFixed(2)),
            avg_cpc: parseFloat(((r.metrics?.averageCpc || 0) / 1e6).toFixed(2))
          }));
          const totals = campaigns.reduce((a, c) => ({ cost: a.cost + c.cost, clicks: a.clicks + c.clicks, conversions: a.conversions + c.conversions, impressions: a.impressions + c.impressions }), { cost: 0, clicks: 0, conversions: 0, impressions: 0 });
          return { report_type: reportType, date_range: { start: startDate, end: endDate }, totals, campaigns, fetched_at: new Date().toISOString() };
        }

        if (reportType === 'search_terms') {
          const terms = results.map(r => ({
            term: r.searchTermView?.searchTerm,
            impressions: r.metrics?.impressions || 0,
            clicks: r.metrics?.clicks || 0,
            cost: parseFloat(((r.metrics?.costMicros || 0) / 1e6).toFixed(2)),
            conversions: parseFloat((r.metrics?.conversions || 0).toFixed(2)),
            ctr: parseFloat(((r.metrics?.ctr || 0) * 100).toFixed(2))
          }));
          const wasted = terms.filter(t => t.conversions === 0 && t.cost > 0).sort((a, b) => b.cost - a.cost);
          return { report_type: reportType, date_range: { start: startDate, end: endDate }, total_terms: terms.length, terms: terms.slice(0, 50), wasted_spend_terms: wasted.slice(0, 20), total_wasted_cost: wasted.reduce((a, t) => a + t.cost, 0).toFixed(2), fetched_at: new Date().toISOString() };
        }

        if (reportType === 'keywords') {
          const keywords = results.map(r => ({
            keyword: r.adGroupCriterion?.keyword?.text,
            match_type: r.adGroupCriterion?.keyword?.matchType,
            quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore || null,
            impressions: r.metrics?.impressions || 0,
            clicks: r.metrics?.clicks || 0,
            cost: parseFloat(((r.metrics?.costMicros || 0) / 1e6).toFixed(2)),
            conversions: parseFloat((r.metrics?.conversions || 0).toFixed(2)),
            avg_cpc: parseFloat(((r.metrics?.averageCpc || 0) / 1e6).toFixed(2))
          }));
          const lowQs = keywords.filter(k => k.quality_score !== null && k.quality_score < 6);
          return { report_type: reportType, date_range: { start: startDate, end: endDate }, total_keywords: keywords.length, keywords: keywords.slice(0, 50), low_quality_score: lowQs, fetched_at: new Date().toISOString() };
        }

        return { report_type: reportType, date_range: { start: startDate, end: endDate }, results: results.slice(0, 50), fetched_at: new Date().toISOString() };
      }

      // ========================================
      // fetch_ga4_report
      // ========================================
      case 'fetch_ga4_report': {
        const token = await getValidGoogleToken(clientId);
        if (!token) return { error: 'Google OAuth token unavailable. Check Credentials page.' };

        // Get GA4 property ID from integration_assets
        const { data: asset } = await supabase.from('integration_assets')
          .select('external_id')
          .eq('client_id', clientId).eq('sub_provider', 'analytics').eq('is_selected', true).maybeSingle();
        if (!asset?.external_id) {
          const { data: fallback } = await supabase.from('integration_assets')
            .select('external_id').eq('client_id', clientId).eq('sub_provider', 'analytics')
            .order('created_at', { ascending: true }).limit(1).maybeSingle();
          asset = fallback;
        }
        if (!asset?.external_id) return { error: 'No GA4 property found. Connect Google Analytics in Credentials and ensure the property has been discovered.' };

        const propertyId = asset.external_id.startsWith('properties/') ? asset.external_id : `properties/${asset.external_id}`;
        const days = args.date_range_days || 30;
        const endDate = 'today';
        const startDate = `${days}daysAgo`;

        const body = {
          dateRanges: [{ startDate, endDate }],
          metrics: (args.metrics || ['sessions', 'users', 'conversions']).map(m => ({ name: m })),
          dimensions: (args.dimensions || ['date']).map(d => ({ name: d })),
          limit: args.row_limit || 50,
          orderBys: args.order_by_metric ? [{ metric: { metricName: args.order_by_metric }, desc: true }] : [{ metric: { metricName: args.metrics?.[0] || 'sessions' }, desc: true }]
        };

        const resp = await fetchWithTimeout(
          `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
          20000
        );

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return { error: `GA4 API error ${resp.status}: ${err?.error?.message || resp.statusText}` };
        }

        const data = await resp.json();
        const dimHeaders = (data.dimensionHeaders || []).map(h => h.name);
        const metHeaders = (data.metricHeaders || []).map(h => h.name);

        const rows = (data.rows || []).map(row => {
          const result = {};
          dimHeaders.forEach((h, i) => { result[h] = row.dimensionValues?.[i]?.value; });
          metHeaders.forEach((h, i) => {
            const val = row.metricValues?.[i]?.value;
            result[h] = isNaN(parseFloat(val)) ? val : parseFloat(parseFloat(val).toFixed(2));
          });
          return result;
        });

        // Aggregate totals
        const totals = {};
        metHeaders.forEach(h => {
          totals[h] = parseFloat(rows.reduce((a, r) => a + (parseFloat(r[h]) || 0), 0).toFixed(2));
        });

        return {
          property_id: propertyId, note: "GA4 property",
          date_range: { start: startDate, end: endDate, days },
          metrics: metHeaders,
          dimensions: dimHeaders,
          total_rows: rows.length,
          totals,
          rows,
          fetched_at: new Date().toISOString()
        };
      }

      // ========================================
      // fetch_gsc_search_analytics
      // ========================================
      case 'fetch_gsc_search_analytics': {
        const token = await getValidGoogleToken(clientId);
        if (!token) return { error: 'Google OAuth token unavailable. Check Credentials page.' };

        let { data: asset } = await supabase.from('integration_assets')
          .select('external_id').eq('client_id', clientId).eq('sub_provider', 'search_console').eq('is_selected', true).maybeSingle();
        if (!asset?.external_id) {
          const { data: fallback } = await supabase.from('integration_assets')
            .select('external_id').eq('client_id', clientId).eq('sub_provider', 'search_console')
            .order('created_at', { ascending: true }).limit(1).maybeSingle();
          asset = fallback;
        }
        if (!asset?.external_id) return { error: 'No GSC property found. Connect Google Search Console in Credentials.' };

        const siteUrl = asset.external_id;
        const days = Math.min(args.date_range_days || 28, 90);
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
        const dims = args.dimensions || ['query'];

        const body = {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          dimensions: dims,
          rowLimit: Math.min(args.row_limit || 50, 100),
          searchType: 'web',
          orderBy: [{ fieldName: 'clicks', sortOrder: 'DESCENDING' }]
        };

        if (args.filter_dimension && args.filter_value) {
          body.dimensionFilterGroups = [{
            filters: [{ dimension: args.filter_dimension, operator: 'contains', expression: args.filter_value }]
          }];
        }

        const resp = await fetchWithTimeout(
          `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
          20000
        );

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return { error: `GSC API error ${resp.status}: ${err?.error?.message || resp.statusText}` };
        }

        const data = await resp.json();
        const rows = (data.rows || []).map(row => {
          const result = { clicks: row.clicks, impressions: row.impressions, ctr: parseFloat((row.ctr * 100).toFixed(2)), position: parseFloat(row.position.toFixed(1)) };
          if (row.keys) dims.forEach((dim, i) => { result[dim] = row.keys[i]; });
          return result;
        });

        // Aggregate totals
        const totals = rows.reduce((acc, r) => ({ clicks: acc.clicks + r.clicks, impressions: acc.impressions + r.impressions }), { clicks: 0, impressions: 0 });
        const avgCtr = totals.impressions > 0 ? parseFloat(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0;
        const avgPos = rows.length > 0 ? parseFloat((rows.reduce((a, r) => a + r.position, 0) / rows.length).toFixed(1)) : 0;

        // Flag high-opportunity rows: position 4-20, impressions > 50, CTR < 5%
        const opportunities = rows.filter(r => r.position >= 4 && r.position <= 20 && r.impressions >= 50 && r.ctr < 5);

        return {
          site_url: siteUrl,
          date_range: { start: body.startDate, end: body.endDate, days },
          dimensions: dims,
          total_rows: rows.length,
          summary: { total_clicks: totals.clicks, total_impressions: totals.impressions, avg_ctr_percent: avgCtr, avg_position: avgPos },
          rows,
          opportunities: opportunities.slice(0, 10),
          fetched_at: new Date().toISOString()
        };
      }

      // ========================================
      // fetch_gsc_url_inspection
      // ========================================
      case 'fetch_gsc_url_inspection': {
        const token = await getValidGoogleToken(clientId);
        if (!token) return { error: 'Google OAuth token unavailable.' };

        const { data: asset } = await supabase.from('integration_assets')
          .select('external_id')
          .eq('client_id', clientId)
          .eq('sub_provider', 'search_console')
          .maybeSingle();

        if (!asset?.external_id) return { error: 'No GSC property selected.' };

        const resp = await fetchWithTimeout(
          'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
          { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ inspectionUrl: args.url, siteUrl: asset.external_id }) },
          20000
        );

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          return { error: `GSC Inspect API error ${resp.status}: ${err?.error?.message || resp.statusText}` };
        }

        const data = await resp.json();
        const idx = data.inspectionResult?.indexStatusResult || {};
        const rich = data.inspectionResult?.richResultsResult || {};

        return {
          url: args.url,
          verdict: idx.verdict,
          coverage_state: idx.coverageState,
          indexing_state: idx.indexingState,
          robots_txt_state: idx.robotsTxtState,
          page_fetch_state: idx.pageFetchState,
          last_crawl_time: idx.lastCrawlTime,
          crawled_as: idx.crawledAs,
          referring_urls: (idx.referringUrls || []).slice(0, 5),
          in_sitemap: (idx.sitemap || []).length > 0,
          rich_results_verdict: rich.verdict,
          rich_results_types: (rich.detectedItems || []).map(i => i.richResultType),
          fetched_at: new Date().toISOString()
        };
      }

      // ========================================
      // submit_sitemap_to_gsc
      // ========================================
      case 'submit_sitemap_to_gsc': {
        const token = await getValidGoogleToken(clientId);
        if (!token) return { error: 'Google OAuth token unavailable.' };

        const { data: asset } = await supabase.from('integration_assets')
          .select('external_id')
          .eq('client_id', clientId)
          .eq('sub_provider', 'search_console')
          .eq('is_selected', true)
          .maybeSingle()
          .then(r => r.data ? r : supabase.from('integration_assets').select('external_id').eq('client_id', clientId).eq('sub_provider', 'search_console').maybeSingle());

        if (!asset?.external_id) return { error: 'No GSC property selected.' };

        const siteUrl = encodeURIComponent(asset.external_id);
        const feedpath = encodeURIComponent(args.sitemap_url);

        const resp = await fetchWithTimeout(
          `https://www.googleapis.com/webmasters/v3/sites/${siteUrl}/sitemaps/${feedpath}`,
          { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
          20000
        );

        if (resp.status === 204 || resp.ok) {
          return {
            success: true,
            sitemap_url: args.sitemap_url,
            gsc_property: asset.external_id,
            submitted_at: new Date().toISOString(),
            message: 'Sitemap submitted to Google Search Console. Google will re-crawl and index pages from this sitemap.'
          };
        }

        const err = await resp.json().catch(() => ({}));
        return { error: `GSC Sitemap API error ${resp.status}: ${err?.error?.message || resp.statusText}` };
      }

      // ========================================
      // reply_to_review
      // ========================================
      case 'reply_to_review': {
        if (!clientId) return { error: 'clientId required to reply to reviews' };
        const token = await getValidGoogleToken(clientId);
        if (!token) return { error: 'Google OAuth token unavailable. Connect Google Business Profile in Credentials.' };

        const { review_name, reply_text } = args;
        if (!review_name) return { error: 'review_name is required (from fetch_google_reviews result)' };
        if (!reply_text) return { error: 'reply_text is required' };
        if (reply_text.length > 4096) return { error: 'reply_text exceeds 4096 character limit' };

        const replyResp = await fetchWithTimeout(
          `https://mybusiness.googleapis.com/v4/${review_name}/reply`,
          {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ comment: reply_text })
          },
          15000
        );

        if (replyResp.ok) {
          const replyData = await replyResp.json().catch(() => ({}));
          return {
            success: true,
            review_name,
            reply_published: true,
            reply_text: reply_text.slice(0, 100) + (reply_text.length > 100 ? '...' : ''),
            published_at: replyData.updateTime || new Date().toISOString(),
            message: 'Reply published to Google Business Profile.'
          };
        }

        const replyErr = await replyResp.json().catch(() => ({}));
        return { error: `GBP Reply API error ${replyResp.status}: ${replyErr?.error?.message || replyResp.statusText}`, review_name };
      }

      // ========================================
      // crawl_site_onpage — DataForSEO OnPage (non-blocking)
      // Returns cached results if available, otherwise submits a task
      // and returns immediately. A separate cron (/cron/process-onpage)
      // polls for completion and populates the cache.
      // ========================================
      case 'crawl_site_onpage': {
        if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
          return { error: 'DataForSEO credentials not configured' };
        }
        if (!args.target_url) return { error: 'target_url is required' };

        const target = args.target_url.replace(/^https?:\/\//, '').replace(/\/$/, '').split('/')[0];
        const dfsAuth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64');
        const headers = { 'Authorization': `Basic ${dfsAuth}`, 'Content-Type': 'application/json' };

        // 1. Check for cached completed results — 24h TTL
        if (clientId) {
          const { data: cached } = await supabase
            .from('baselines')
            .select('metric_text, recorded_at')
            .eq('client_id', clientId)
            .eq('metric_name', `onpage_crawl_cache:${target}`)
            .gte('recorded_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .maybeSingle();
          if (cached?.metric_text) {
            try {
              const parsed = JSON.parse(cached.metric_text);
              if (parsed.status !== 'pending') {
                return { ...parsed, source: 'cache', cached_at: cached.recorded_at };
              }
            } catch { /* fall through */ }
          }
        }

        // 2. Submit new crawl task — 10s hard cap, no polling
        const maxPages = Math.min(args.max_pages || 20, 100);
        let submitData;
        try {
          const submitResp = await fetchWithTimeout(
            'https://api.dataforseo.com/v3/on_page/task_post',
            {
              method: 'POST', headers,
              body: JSON.stringify([{
                target,
                max_crawl_pages: maxPages,
                load_resources: true,
                enable_javascript: false,
                check_spell: false,
                custom_user_agent: 'Mozilla/5.0 AIGrowthOSCrawler'
              }])
            },
            10000
          );
          submitData = await submitResp.json();
        } catch (e) {
          return { error: `DataForSEO submit failed: ${e.message}`, target };
        }

        const taskId = submitData?.tasks?.[0]?.id;
        if (!taskId) return { error: 'Failed to submit OnPage task', response: JSON.stringify(submitData).slice(0, 300) };

        // 3. Store pending task in cache for cron to pick up
        if (clientId) {
          await supabase.from('baselines').upsert({
            client_id: clientId,
            metric_name: `onpage_crawl_cache:${target}`,
            metric_value: 0,
            metric_text: JSON.stringify({
              status: 'pending',
              task_id: taskId,
              target,
              submitted_at: new Date().toISOString()
            }),
            source: 'dataforseo_onpage_pending',
            recorded_at: new Date().toISOString()
          }, { onConflict: 'client_id,metric_name' });
        }

        return {
          status: 'submitted',
          task_id: taskId,
          target,
          message: `OnPage crawl submitted for ${target}. Task ID ${taskId}. Results will be populated by the cron within 5-10 minutes. Subsequent calls to crawl_site_onpage will return cached results.`,
          next_steps: 'Proceed with other phases. Do NOT retry this tool in the same run — cache is empty until cron picks up the result.'
        };
      }

      // ========================================
      // ask_chatgpt_visibility — test GPT-4 for brand mention
      // ========================================
      case 'ask_chatgpt_visibility': {
        if (!process.env.OPENAI_API_KEY) return { error: 'OPENAI_API_KEY not configured' };
        if (!args.question || !args.client_domain) return { error: 'question and client_domain required' };

        const openaiResp = await fetchWithTimeout(
          'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'gpt-4-turbo-preview',
              messages: [
                { role: 'system', content: 'You are a helpful assistant. Answer the user question factually. If you mention specific businesses, cite real ones you know about.' },
                { role: 'user', content: args.question }
              ],
              max_tokens: 800,
              temperature: 0.3
            })
          },
          25000
        );
        const data = await openaiResp.json();
        const answer = data.choices?.[0]?.message?.content || '';
        if (!answer) return { error: 'GPT-4 returned empty answer', raw: JSON.stringify(data).slice(0, 300) };

        // Detect client mention
        const clientDomain = args.client_domain.replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
        const clientName = (args.client_name || '').toLowerCase();
        const answerLower = answer.toLowerCase();
        const domainMentioned = clientDomain && answerLower.includes(clientDomain);
        const nameMentioned = clientName && answerLower.includes(clientName);
        const mentioned = !!(domainMentioned || nameMentioned);

        // Extract competitor mentions (any domain-like patterns in the answer)
        const competitorMatches = [...answer.matchAll(/\b([a-z0-9][-a-z0-9]*\.[a-z]{2,})\b/gi)];
        const competitorDomains = [...new Set(competitorMatches.map(m => m[1].toLowerCase()))]
          .filter(d => d !== clientDomain)
          .slice(0, 10);

        if (clientId) {
          await supabase.from('geo_visibility_signals').insert({
            client_id: clientId,
            query: args.question,
            platform: 'chatgpt',
            client_mentioned: mentioned,
            client_cited: domainMentioned, // stricter: domain present = cited
            client_position: null,
            competitors_mentioned: competitorDomains,
            total_entities_mentioned: competitorDomains.length
          });
        }

        return {
          question: args.question,
          platform: 'chatgpt',
          model: 'gpt-4-turbo-preview',
          answer_preview: answer.slice(0, 500),
          client_mentioned: mentioned,
          client_cited: domainMentioned,
          mention_type: domainMentioned ? 'domain' : (nameMentioned ? 'name_only' : 'none'),
          competitors_mentioned: competitorDomains,
          stored_in: 'geo_visibility_signals'
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    console.error(`[TOOL_ERROR] ${toolName}:`, err.message);
    return { error: err.message, tool: toolName };
  }
}

// ============================================================
// POST-CHANGE VALIDATION — queue agents immediately after any change
// Fires guaranteed from inside the tool, NOT dependent on LLM output.
// Agents: hebrew-quality, design-consistency, seo-core, website-qa, website-content
// ============================================================
async function queuePostChangeValidators(clientId, changeId, changeType, pageUrl, triggerRunId) {
  const VALIDATOR_SLUGS = [
    'hebrew-quality-agent',
    'design-consistency-agent',
    'seo-core-agent',
    'website-qa-agent',
    'website-content-agent',
  ];

  try {
    // Load all 5 agent templates in one query
    const { data: agents } = await supabase
      .from('agent_templates')
      .select('id, slug')
      .in('slug', VALIDATOR_SLUGS)
      .eq('is_active', true);

    if (!agents?.length) return { queued: 0, error: 'No validator agent templates found' };

    const taskPayload = {
      trigger: 'post_change_validation',
      change_id: changeId,
      change_type: changeType,
      page_url: pageUrl,
      triggered_by_run: triggerRunId,
      instructions: `A change of type "${changeType}" was just made to ${pageUrl}. Validate the change: check Hebrew quality, design consistency, SEO impact, QA, and content quality. Report findings and flag any issues.`,
    };

    const inserts = agents.map(agent => ({
      client_id: clientId,
      agent_template_id: agent.id,
      agent_slug: agent.slug,
      status: 'queued',
      priority: 1,
      priority_score: 9.0, // High priority — validation must run right after change
      queued_by: 'post_change_auto_trigger',
      task_payload: taskPayload,
    }));

    const { data: queued, error } = await supabase.from('run_queue').insert(inserts).select('id, agent_slug');
    if (error) {
      console.error('[POST_CHANGE_VALIDATORS] Queue error:', error.message);
      return { queued: 0, error: error.message };
    }

    console.log(`[POST_CHANGE_VALIDATORS] Queued ${queued?.length} validators for change ${changeId}`);
    return {
      queued: queued?.length || 0,
      agents: queued?.map(q => q.agent_slug) || [],
    };
  } catch (e) {
    console.error('[POST_CHANGE_VALIDATORS] Fatal:', e.message);
    return { queued: 0, error: e.message };
  }
}

// ============================================================
// PLATFORM EXECUTION HELPERS
// ============================================================

export async function executeGitHubChange(clientId, change, config) {
  try {
    // Global token from Vercel env is the default for all clients
    const token = process.env.GITHUB_TOKEN;
    if (!token) return { success: false, error: 'GITHUB_TOKEN env var not set' };

    // Prefer explicit owner/repo from config (website_git_connections), else parse from URL
    let owner = config?.repo_owner;
    let repo = config?.repo_name;
    if (!owner || !repo) {
      const repoUrl = config?.repo_url || '';
      const repoMatch = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
      if (!repoMatch) return { success: false, error: `Cannot parse repo URL: ${repoUrl}` };
      owner = repoMatch[1];
      repo = repoMatch[2].replace('.git', '');
    }
    let branch = config?.default_branch || config?.production_branch || 'main';
    const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' };

    // Build a descriptive branch name and commit message
    const safePage = change.page_url.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40);
    const prBranch = `seo/${change.change_type}-${safePage}-${Date.now()}`.slice(0, 80);

    // Try configured branch first; if not found, fetch the repo's real default branch
    let refRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers }, 15000);
    let refData = await refRes.json();
    if (!refData.object?.sha) {
      // Configured branch doesn't exist — ask the GitHub API what the default branch is
      const repoRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`, { headers }, 15000);
      const repoInfo = await repoRes.json();
      if (repoInfo?.default_branch && repoInfo.default_branch !== branch) {
        branch = repoInfo.default_branch;
        refRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`, { headers }, 15000);
        refData = await refRes.json();
      }
      if (!refData.object?.sha) {
        return { success: false, error: `Cannot get SHA for branch ${branch} (or repo has no accessible default branch)` };
      }
    }

    await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
      method: 'POST', headers,
      body: JSON.stringify({ ref: `refs/heads/${prBranch}`, sha: refData.object.sha }),
    }, 15000);

    // ─── REAL CODE EDIT: try to modify the actual source file ───
    // For meta_description / seo_title / canonical_url, we know where
    // these typically live and can do a reliable find-and-replace.
    const realEdit = await tryRealCodeEdit(owner, repo, prBranch, change, headers);

    let filesChanged = 0;
    let editDetail = '';

    if (realEdit?.edited) {
      filesChanged = 1;
      editDetail = `\n\n### File Modified\n\`\`\`\n${realEdit.file_path}\n\`\`\`\n\n**Before:**\n\`\`\`\n${realEdit.before_snippet}\n\`\`\`\n\n**After:**\n\`\`\`\n${realEdit.after_snippet}\n\`\`\``;
    } else {
      // Fall back: create a markdown proposal doc describing the intended change
      const changeDoc = [
        `# SEO Change Proposal`,
        ``,
        `**Page:** ${change.page_url}`,
        `**Type:** ${change.change_type}`,
        `**Priority:** ${change.priority}`,
        `**Proposed by:** AI Growth OS`,
        `**Date:** ${new Date().toISOString()}`,
        ``,
        `## Reason`,
        change.reason,
        ``,
        `## Change`,
        ``,
        `**Current:** \`${change.current_value || '(not set)'}\``,
        ``,
        `**Proposed:** \`${change.proposed_value}\``,
        ``,
        `## Why no automatic edit?`,
        `AI Growth OS couldn't locate the target element in common source file locations for this change type. Apply manually and merge.`,
      ].join('\n');
      const filePath = `_seo_changes/${change.id}.md`;
      const contentB64 = Buffer.from(changeDoc).toString('base64');
      await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
        method: 'PUT', headers,
        body: JSON.stringify({ message: `SEO proposal: ${change.change_type} on ${safePage}`, content: contentB64, branch: prBranch }),
      }, 15000);
    }

    // Open PR
    const prTitle = realEdit?.edited
      ? `[SEO] ${change.change_type.replace(/_/g,' ')} — ${realEdit.file_path}`
      : `[SEO Proposal] ${change.change_type.replace(/_/g,' ')} — ${change.page_url}`;
    const prBody = `## SEO ${realEdit?.edited ? 'Auto-Fix' : 'Proposal'} by AI Growth OS\n\n**Page:** ${change.page_url}\n**Type:** ${change.change_type}\n**Priority:** ${change.priority}\n\n### Reason\n${change.reason}\n\n### Current Value\n\`\`\`\n${change.current_value || '(not set)'}\n\`\`\`\n\n### Proposed Value\n\`\`\`\n${change.proposed_value}\n\`\`\`${editDetail}\n\n---\n*Generated by AI Growth OS.${realEdit?.edited ? ' Review the diff and merge to deploy.' : ' Manual application required — AI could not locate the source file.'}*`;

    const prRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST', headers,
      body: JSON.stringify({ title: prTitle, body: prBody, head: prBranch, base: branch }),
    }, 15000);
    const pr = await prRes.json();

    if (!pr.html_url) {
      return { success: false, error: pr.message || 'PR creation failed' };
    }

    // ─── AUTO-MERGE when access_mode requests it ───
    // The DB column access_mode='branch_pr_and_merge' means "after opening the PR,
    // merge it immediately" — that's the whole point of auto-fix. Without this
    // step the user still has to go to GitHub and click merge.
    let merged = false;
    let mergeError = null;
    if (config?.access_mode === 'branch_pr_and_merge') {
      // Wait 2 seconds for GitHub to register the commit
      await new Promise(r => setTimeout(r, 2000));
      const mergeRes = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/merge`,
        {
          method: 'PUT', headers,
          body: JSON.stringify({
            commit_title: `SEO auto-fix: ${change.change_type} on ${change.page_url}`,
            merge_method: 'squash'
          })
        }, 15000
      );
      if (mergeRes.ok) {
        merged = true;
      } else {
        const mergeErrData = await mergeRes.json().catch(() => ({}));
        mergeError = mergeErrData.message || `merge failed with status ${mergeRes.status}`;
      }
    }

    return {
      success: true,
      ref: pr.html_url,
      message: merged
        ? `PR opened and auto-merged: ${pr.html_url}`
        : `PR opened: ${pr.html_url}${mergeError ? ` (auto-merge failed: ${mergeError})` : ''}`,
      pr_number: pr.number,
      files_changed: filesChanged,
      real_edit: !!realEdit?.edited,
      edited_file: realEdit?.file_path || null,
      merged,
      merge_error: mergeError
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── REAL CODE EDIT: find target file, apply change, commit ───
async function tryRealCodeEdit(owner, repo, branch, change, headers) {
  try {
    // Which file paths to probe for each change type
    const pathsByType = {
      meta_description: [
        'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx', 'src/app/layout.jsx',
        'pages/_app.tsx', 'pages/_app.jsx', 'pages/_document.tsx', 'pages/_document.jsx',
        'pages/index.tsx', 'pages/index.jsx', 'src/pages/index.tsx',
        'app/page.tsx', 'src/app/page.tsx', 'index.html', 'public/index.html'
      ],
      seo_title: [
        'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx', 'src/app/layout.jsx',
        'pages/_app.tsx', 'pages/_document.tsx',
        'pages/index.tsx', 'pages/index.jsx', 'src/pages/index.tsx',
        'app/page.tsx', 'src/app/page.tsx', 'index.html', 'public/index.html'
      ],
      canonical_url: [
        'app/layout.tsx', 'app/layout.jsx', 'src/app/layout.tsx',
        'pages/_document.tsx', 'pages/_app.tsx',
        'index.html', 'public/index.html'
      ]
    };

    const paths = pathsByType[change.change_type];
    if (!paths) return null; // type not supported for real edits

    for (const path of paths) {
      // Try to fetch the file
      const fileRes = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        { headers }, 10000
      );
      if (fileRes.status !== 200) continue;
      const fileData = await fileRes.json();
      if (!fileData.content || fileData.encoding !== 'base64') continue;

      const content = Buffer.from(fileData.content, 'base64').toString('utf8');
      const edited = applySEOEdit(content, change);
      if (!edited || edited === content) continue; // no change applied

      // Commit the edit
      const newContentB64 = Buffer.from(edited).toString('base64');
      const commitRes = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: 'PUT', headers,
          body: JSON.stringify({
            message: `SEO auto-fix: ${change.change_type} in ${path}`,
            content: newContentB64,
            sha: fileData.sha,
            branch
          })
        }, 15000
      );
      if (!commitRes.ok) {
        const err = await commitRes.json().catch(() => ({}));
        console.error('[GITHUB_EDIT] commit failed:', err.message || commitRes.statusText);
        continue;
      }

      // Extract short before/after snippets for the PR description
      const contextStart = Math.max(0, content.indexOf(change.current_value || '') - 40);
      const beforeSnippet = content.slice(contextStart, contextStart + 200).trim();
      const afterSnippet = edited.slice(contextStart, contextStart + 200).trim();

      return {
        edited: true,
        file_path: path,
        before_snippet: beforeSnippet.slice(0, 300),
        after_snippet: afterSnippet.slice(0, 300)
      };
    }
    return null; // no file matched
  } catch (e) {
    console.error('[REAL_EDIT]', e.message);
    return null;
  }
}

// ─── Apply a change to file contents ───
function applySEOEdit(content, change) {
  const escapeForHtml = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeForJs = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

  switch (change.change_type) {
    case 'meta_description': {
      // HTML: <meta name="description" content="...">
      if (/<meta\s+name=["']description["']\s+content=["'][^"']*["']/i.test(content)) {
        return content.replace(
          /<meta\s+name=["']description["']\s+content=["'][^"']*["']/i,
          `<meta name="description" content="${escapeForHtml(change.proposed_value)}"`
        );
      }
      // Next.js App Router metadata export
      if (/description\s*:\s*['"`][^'"`]*['"`]/.test(content)) {
        return content.replace(
          /description\s*:\s*['"`][^'"`]*['"`]/,
          `description: '${escapeForJs(change.proposed_value)}'`
        );
      }
      return null;
    }
    case 'seo_title': {
      // HTML <title>
      if (/<title>[^<]*<\/title>/i.test(content)) {
        return content.replace(
          /<title>[^<]*<\/title>/i,
          `<title>${escapeForHtml(change.proposed_value)}</title>`
        );
      }
      // Next.js App Router metadata: title: '...'
      if (/\btitle\s*:\s*['"`][^'"`]*['"`]/.test(content)) {
        return content.replace(
          /\btitle\s*:\s*['"`][^'"`]*['"`]/,
          `title: '${escapeForJs(change.proposed_value)}'`
        );
      }
      return null;
    }
    case 'canonical_url': {
      // Replace existing canonical
      if (/<link\s+rel=["']canonical["']\s+href=["'][^"']*["']/i.test(content)) {
        return content.replace(
          /<link\s+rel=["']canonical["']\s+href=["'][^"']*["']/i,
          `<link rel="canonical" href="${change.proposed_value}"`
        );
      }
      // Next.js App Router metadata.alternates.canonical
      if (/alternates\s*:\s*\{[^}]*canonical\s*:\s*['"`][^'"`]*['"`]/.test(content)) {
        return content.replace(
          /canonical\s*:\s*['"`][^'"`]*['"`]/,
          `canonical: '${change.proposed_value}'`
        );
      }
      // Inject into <head>
      if (/<head[^>]*>/i.test(content)) {
        return content.replace(
          /<head([^>]*)>/i,
          `<head$1>\n  <link rel="canonical" href="${change.proposed_value}" />`
        );
      }
      return null;
    }
    default:
      return null;
  }
}

async function executeWordPressChange(clientId, change) {
  try {
    const { data: cms } = await supabase.from('website_cms_connections')
      .select('site_url, api_token_encrypted, encryption_iv, cms_username')
      .eq('client_id', clientId).eq('cms_type', 'wordpress').maybeSingle();
    if (!cms?.api_token_encrypted) return { success: false, error: 'WordPress credentials not configured' };

    const ENC_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!ENC_KEY) return { success: false, error: 'Encryption key not set' };

    const iv = (cms.encryption_iv || '').split(':')[0];
    const decipher = (await import('crypto')).default.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), Buffer.from(iv, 'hex'));
    let appPassword = decipher.update(cms.api_token_encrypted, 'hex', 'utf8');
    appPassword += decipher.final('utf8');

    const auth = Buffer.from(`${cms.cms_username}:${appPassword}`).toString('base64');
    const baseUrl = cms.site_url.replace(/\/$/, '');

    // Find the page/post by URL slug
    const slug = change.page_url.replace(/.*\//, '').replace(/\/$/, '') || 'home';
    const searchRes = await fetchWithTimeout(`${baseUrl}/wp-json/wp/v2/pages?slug=${slug}&_fields=id,title,content,yoast_head_json`, {
      headers: { Authorization: `Basic ${auth}` }
    }, 15000);
    const pages = await searchRes.json();
    const page = pages?.[0];
    if (!page) return { success: false, error: `Page not found for slug: ${slug}` };

    // Apply the change based on type
    let updateBody = {};
    if (change.change_type === 'seo_title') updateBody = { title: { rendered: change.proposed_value } };
    else if (change.change_type === 'meta_description') updateBody = { excerpt: { rendered: change.proposed_value } };
    else if (change.change_type === 'h1') updateBody = { title: { raw: change.proposed_value } };
    else if (change.change_type === 'body_content') updateBody = { content: { raw: change.proposed_value } };
    else {
      // For other types, stage as proposed — WordPress API doesn't have direct fields
      return { success: false, error: `Change type ${change.change_type} requires manual WordPress editing` };
    }

    const updateRes = await fetchWithTimeout(`${baseUrl}/wp-json/wp/v2/pages/${page.id}`, {
      method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(updateBody),
    }, 15000);
    const updated = await updateRes.json();
    if (updated.id) {
      return { success: true, ref: `${baseUrl}/?p=${updated.id}`, message: `WordPress page ${updated.id} updated` };
    }
    return { success: false, error: updated.message || 'WordPress update failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function executeWebflowChange(clientId, change) {
  try {
    const { data: cms } = await supabase.from('website_cms_connections')
      .select('site_url, api_token_encrypted, encryption_iv, site_id')
      .eq('client_id', clientId).eq('cms_type', 'webflow').maybeSingle();
    if (!cms?.api_token_encrypted) return { success: false, error: 'Webflow credentials not configured' };

    const ENC_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY;
    const iv = (cms.encryption_iv || '').split(':')[0];
    const decipher = (await import('crypto')).default.createDecipheriv('aes-256-cbc', Buffer.from(ENC_KEY, 'hex'), Buffer.from(iv, 'hex'));
    let token = decipher.update(cms.api_token_encrypted, 'hex', 'utf8');
    token += decipher.final('utf8');

    const siteId = cms.site_id;
    const headers = { Authorization: `Bearer ${token}`, 'accept-version': '1.0.0', 'Content-Type': 'application/json' };

    // Get pages list to find matching page
    const pagesRes = await fetchWithTimeout(`https://api.webflow.com/v2/sites/${siteId}/pages`, { headers }, 15000);
    const pagesData = await pagesRes.json();
    const slug = change.page_url.replace(/.*\//, '').replace(/\/$/, '') || 'index';
    const page = pagesData?.pages?.find(p => p.slug === slug || p.slug === '');
    if (!page) return { success: false, error: `Webflow page not found for slug: ${slug}` };

    // Update SEO fields
    let updateBody = {};
    if (change.change_type === 'seo_title') updateBody = { seo: { title: change.proposed_value } };
    else if (change.change_type === 'meta_description') updateBody = { seo: { description: change.proposed_value } };
    else return { success: false, error: `Change type ${change.change_type} requires Webflow Designer access` };

    const updateRes = await fetchWithTimeout(`https://api.webflow.com/v2/pages/${page.id}`, {
      method: 'PATCH', headers, body: JSON.stringify(updateBody),
    }, 15000);
    const updated = await updateRes.json();
    if (updated.id) {
      // Publish the page
      await fetchWithTimeout(`https://api.webflow.com/v2/sites/${siteId}/publish`, {
        method: 'POST', headers, body: JSON.stringify({ publishToWebflowSubdomain: true }),
      }, 15000);
      return { success: true, ref: `https://webflow.com/design/${siteId}`, message: `Webflow page updated and published` };
    }
    return { success: false, error: updated.message || 'Webflow update failed' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
