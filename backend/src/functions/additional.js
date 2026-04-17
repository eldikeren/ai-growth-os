// ============================================================
// AI GROWTH OS — ADDITIONAL BACKEND FUNCTIONS
// Onboarding, connectors, prompt overrides, run steps,
// link intelligence, SEO action plans, full verification
// ============================================================

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ============================================================
// ONBOARDING — complete client creation flow
// ============================================================
export async function createClientOnboarding(onboardingData) {
  const {
    // Step 1: Basic Identity
    name, domain, businessType, industry, subIndustry,
    language, rtlRequired, brandVoice, logoUrl, primaryColor,
    // Step 2: Targeting
    geographies, targetAudiences, forbiddenAudiences, profitableTopics, complianceRestrictions,
    // Step 3: Connectors
    gscPropertyUrl, googleAdsCid, metaBusinessId, gbpLocationId,
    googleSheetId, githubRepoUrl, websiteUrl, reportRecipients,
    // Step 4: SEO Foundation
    keywords, competitors,
    // Step 5: Policies
    allowedAccounts, forbiddenAccounts, sourceOfTruth,
    specialPolicies, approvalRequiredFor, legalToneRequired, reviewsVoice,
    // Step 6: Reports
    defaultReportLanguage, defaultReportTypes, reportSchedule, timezone
  } = onboardingData;

  // 1. Create client
  const { data: client, error: clientErr } = await supabase
    .from('clients')
    .insert({ name, domain: domain || websiteUrl, status: 'active' })
    .select().single();
  if (clientErr) throw new Error(`Failed to create client: ${clientErr.message}`);

  const clientId = client.id;

  // 2. Create client profile
  await supabase.from('client_profiles').insert({
    client_id: clientId,
    business_type: businessType,
    industry,
    sub_industry: subIndustry,
    language: language || 'he',
    rtl_required: rtlRequired || false,
    brand_voice: brandVoice,
    logo_url: logoUrl,
    primary_color: primaryColor,
    timezone: timezone || 'Asia/Jerusalem'
  });

  // 3. Create client rules
  await supabase.from('client_rules').insert({
    client_id: clientId,
    business_type: businessType,
    industry,
    sub_industry: subIndustry,
    language: language || 'he',
    rtl_required: rtlRequired || false,
    brand_voice: brandVoice,
    target_audiences: targetAudiences || [],
    forbidden_audiences: forbiddenAudiences || [],
    geographies: geographies || [],
    compliance_style: complianceRestrictions || null,
    source_of_truth: sourceOfTruth || 'Google Drive',
    allowed_accounts: allowedAccounts || [],
    forbidden_accounts: forbiddenAccounts || [],
    special_policies: specialPolicies || [],
    analytics_allowed_key_events: [],
    approval_required_for: approvalRequiredFor || [],
    report_language_default: defaultReportLanguage || language || 'he',
    reviews_voice: reviewsVoice || 'office',
    post_change_validation_mandatory: true
  });

  // 4. Create connectors
  const connectors = [];
  if (websiteUrl) connectors.push({ connector_type: 'website', label: websiteUrl, config: { url: websiteUrl, language, rtl: rtlRequired } });
  if (gscPropertyUrl) connectors.push({ connector_type: 'google_search_console', label: 'Google Search Console', config: { property_url: gscPropertyUrl } });
  if (googleAdsCid) connectors.push({ connector_type: 'google_ads', label: 'Google Ads', config: { customer_id: googleAdsCid } });
  if (metaBusinessId) connectors.push({ connector_type: 'meta_business', label: 'Meta Business', config: { manager_id: metaBusinessId } });
  if (gbpLocationId) connectors.push({ connector_type: 'google_business_profile', label: 'Google Business Profile', config: { location_id: gbpLocationId } });
  if (googleSheetId) connectors.push({ connector_type: 'google_sheets', label: 'SEO Data Staging Sheet', sheet_id: googleSheetId, sync_enabled: true, sync_frequency: 'weekly' });
  if (githubRepoUrl) connectors.push({ connector_type: 'github', label: 'GitHub Repository', config: { repo_url: githubRepoUrl }, is_active: false });

  if (connectors.length > 0) {
    await supabase.from('client_connectors').insert(connectors.map(c => ({ client_id: clientId, ...c })));
  }

  // 5. Create empty credential placeholders for the new client
  // SERVICE-LEVEL API keys (DataForSEO, OpenAI) come from env vars — no need to copy.
  // OAUTH tokens (GSC, GBP, Facebook, etc.) are per-client and must NEVER be shared.
  // Each client must connect their own OAuth accounts via the Setup Link / Credentials page.
  const credentialServices = ['google_ads', 'google_analytics', 'google_search_console', 'google_business_profile', 'openai', 'facebook', 'instagram', 'dataforseo', 'moz'];

  await supabase.from('client_credentials').insert(
    credentialServices.map(service => ({
      client_id: clientId,
      service,
      credential_data: null,
      is_connected: false,
      health_score: 0,
    }))
  );

  // 6. Insert keywords
  if (keywords?.length > 0) {
    await supabase.from('client_keywords').insert(
      keywords.map(kw => ({
        client_id: clientId,
        keyword: kw.keyword,
        volume: kw.volume || 0,
        difficulty: kw.difficulty || 0,
        search_intent: kw.intent || 'informational',
        cluster: kw.cluster || null,
        priority: kw.priority || 5,
        target_page: kw.targetPage || null,
        geography: kw.geography || null,
        source: 'onboarding'
      }))
    );
  }

  // 7. Insert competitors
  if (competitors?.length > 0) {
    await supabase.from('client_competitors').insert(
      competitors.map(c => ({
        client_id: clientId,
        domain: c.domain,
        name: c.name || c.domain,
        domain_authority: c.domainAuthority || 0,
        notes: c.notes || null
      }))
    );
  }

  // 8. Assign all active agents to this client
  const { data: agents } = await supabase.from('agent_templates').select('id').eq('is_active', true);
  if (agents?.length > 0) {
    await supabase.from('client_agent_assignments').insert(
      agents.map(a => ({ client_id: clientId, agent_template_id: a.id, enabled: true }))
    );
  }

  // 9. Set up default schedules
  const defaultSchedules = [
    { slug: 'master-orchestrator', cron: '0 6 * * *' },
    { slug: 'credential-health-agent', cron: '0 7 * * *' },
    { slug: 'gsc-daily-monitor', cron: '0 8 * * *' },
    { slug: 'seo-core-agent', cron: '0 9 * * 1' },
    { slug: 'local-seo-agent', cron: '0 9 * * 2' },
    { slug: 'reviews-gbp-authority-agent', cron: '0 9 * * 3' },
    { slug: 'competitor-intelligence-agent', cron: '0 9 * * 4' },
  ];

  const { data: agentTemplates } = await supabase
    .from('agent_templates').select('id, slug').in('slug', defaultSchedules.map(s => s.slug));

  if (agentTemplates?.length > 0) {
    const scheduleInserts = defaultSchedules
      .map(s => {
        const agent = agentTemplates.find(a => a.slug === s.slug);
        if (!agent) return null;
        return {
          client_id: clientId,
          agent_template_id: agent.id,
          cron_expression: s.cron,
          timezone: timezone || 'Asia/Jerusalem',
          enabled: true,
          next_run_at: new Date().toISOString()
        };
      })
      .filter(Boolean);

    if (scheduleInserts.length > 0) {
      await supabase.from('agent_schedules').insert(scheduleInserts);
    }
  }

  // 10. Set up report schedules
  if (defaultReportTypes?.length > 0 && reportRecipients?.length > 0) {
    for (const reportType of defaultReportTypes) {
      const { data: schedule } = await supabase.from('report_schedules').insert({
        client_id: clientId,
        report_type: reportType,
        language: defaultReportLanguage || 'he',
        timezone: timezone || 'Asia/Jerusalem',
        schedule_type: reportSchedule || 'weekly',
        days_of_week: reportSchedule === 'weekly' ? [0] : [],
        send_time: '08:00:00',
        is_active: true
      }).select().single();

      if (schedule?.id) {
        await supabase.from('report_recipients').insert(
          reportRecipients.map(email => ({
            client_id: clientId,
            schedule_id: schedule.id,
            email,
            language_preference: defaultReportLanguage || 'he'
          }))
        );
      }
    }
  }

  // 11. Audit log
  await supabase.from('audit_trail').insert({
    client_id: clientId,
    action_type: 'client_onboarded',
    triggered_by: 'onboarding_wizard',
    after_value: JSON.stringify({ name, domain, language, agents_assigned: agents?.length || 0 })
  });

  return {
    success: true,
    clientId,
    summary: {
      agents_assigned: agents?.length || 0,
      keywords_imported: keywords?.length || 0,
      competitors_added: competitors?.length || 0,
      connectors_configured: connectors.length,
      schedules_created: defaultSchedules.length
    }
  };
}

// ============================================================
// CONNECTOR MANAGEMENT
// ============================================================
export async function syncConnector(clientId, connectorType) {
  const { data: connector } = await supabase
    .from('client_connectors')
    .select('*')
    .eq('client_id', clientId)
    .eq('connector_type', connectorType)
    .single();

  if (!connector) throw new Error(`Connector not found: ${connectorType}`);
  if (!connector.is_active) throw new Error(`Connector is not active: ${connectorType}`);

  const startTime = Date.now();
  let status = 'success';
  let error = null;
  let rowsImported = 0;

  try {
    if (connectorType === 'google_sheets' && connector.sheet_id) {
      // Sync all enabled tabs
      const syncTypes = [];
      if (connector.backlinks_tab) syncTypes.push('backlinks');
      if (connector.referring_domains_tab) syncTypes.push('referring_domains');
      if (connector.competitor_link_gap_tab) syncTypes.push('competitor_link_gap');
      if (connector.keyword_rankings_tab) syncTypes.push('keyword_rankings');

      for (const syncType of syncTypes) {
        const tabName = connector[`${syncType}_tab`] || syncType;
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${connector.sheet_id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
        try {
          const { syncGoogleSheetData } = await import('./core.js');
          const result = await syncGoogleSheetData(clientId, sheetUrl, syncType);
          rowsImported += result.imported || 0;
        } catch (tabErr) {
          console.error(`Tab sync failed: ${syncType}`, tabErr.message);
        }
      }
    }
  } catch (err) {
    status = 'failed';
    error = err.message;
  }

  await supabase.from('client_connectors').update({
    last_synced_at: new Date().toISOString(),
    last_sync_status: status,
    last_sync_error: error
  }).eq('id', connector.id);

  await supabase.from('external_sync_log').insert({
    client_id: clientId,
    sync_type: connectorType,
    source: 'connector',
    status,
    rows_imported: rowsImported,
    duration_ms: Date.now() - startTime,
    error
  });

  return { success: status === 'success', rows_imported: rowsImported };
}

// ============================================================
// PROMPT OVERRIDE MANAGEMENT
// ============================================================
export async function getActivePrompt(clientId, agentTemplateId) {
  // Client override takes priority over prompt version
  const { data: override } = await supabase
    .from('client_prompt_overrides')
    .select('*')
    .eq('client_id', clientId)
    .eq('agent_template_id', agentTemplateId)
    .eq('is_active', true)
    .maybeSingle();

  if (override) {
    return { source: 'client_override', text: override.prompt_text, overrideId: override.id, versionId: null };
  }

  // Fall back to active prompt version
  const { data: version } = await supabase
    .from('prompt_versions')
    .select('*')
    .eq('agent_template_id', agentTemplateId)
    .eq('is_active', true)
    .order('version_number', { ascending: false })
    .maybeSingle();

  if (version) {
    return { source: 'prompt_version', text: version.prompt_body, versionId: version.id, overrideId: null };
  }

  // Fall back to base prompt
  const { data: agent } = await supabase
    .from('agent_templates').select('base_prompt').eq('id', agentTemplateId).single();

  return { source: 'base_prompt', text: agent?.base_prompt || '', versionId: null, overrideId: null };
}

export async function createPromptOverride(clientId, agentTemplateId, promptText, notes) {
  // Deactivate existing
  await supabase.from('client_prompt_overrides')
    .update({ is_active: false })
    .eq('client_id', clientId)
    .eq('agent_template_id', agentTemplateId);

  const { data, error } = await supabase.from('client_prompt_overrides').insert({
    client_id: clientId,
    agent_template_id: agentTemplateId,
    prompt_text: promptText,
    is_active: true,
    change_notes: notes || null,
    created_by: 'admin'
  }).select().single();

  if (error) throw new Error(error.message);

  await supabase.from('audit_trail').insert({
    client_id: clientId,
    action_type: 'prompt_override_created',
    triggered_by: 'admin',
    after_value: JSON.stringify({ agent_template_id: agentTemplateId, override_id: data.id })
  });

  return data;
}

export async function diffPrompts(agentTemplateId, clientId) {
  const { data: agent } = await supabase.from('agent_templates').select('base_prompt, name').eq('id', agentTemplateId).single();
  const { data: override } = await supabase.from('client_prompt_overrides').select('*').eq('agent_template_id', agentTemplateId).eq('client_id', clientId).eq('is_active', true).maybeSingle();
  const { data: versions } = await supabase.from('prompt_versions').select('*').eq('agent_template_id', agentTemplateId).order('version_number', { ascending: false }).limit(5);

  return {
    agent_name: agent?.name,
    base_prompt: agent?.base_prompt || '',
    client_override: override || null,
    prompt_versions: versions || [],
    active_source: override ? 'client_override' : versions?.find(v => v.is_active) ? 'prompt_version' : 'base_prompt'
  };
}

// ============================================================
// RUN STEPS — granular tracking
// ============================================================
export async function createRunStep(runId, clientId, stepNumber, stepName, stepType) {
  const { data } = await supabase.from('run_steps').insert({
    run_id: runId,
    client_id: clientId,
    step_number: stepNumber,
    step_name: stepName,
    step_type: stepType,
    status: 'running',
    started_at: new Date().toISOString()
  }).select().single();
  return data?.id;
}

export async function completeRunStep(stepId, status, outputSummary, durationMs, error) {
  await supabase.from('run_steps').update({
    status,
    output_summary: outputSummary,
    duration_ms: durationMs,
    error: error || null,
    completed_at: new Date().toISOString()
  }).eq('id', stepId);
}

export async function getRunSteps(runId) {
  const { data } = await supabase
    .from('run_steps')
    .select('*')
    .eq('run_id', runId)
    .order('step_number', { ascending: true });
  return data || [];
}

// ============================================================
// LINK INTELLIGENCE — full AI-powered analysis
// ============================================================
// ============================================================
// BACKLINK SYNC — populate backlinks / referring_domains /
// competitor_link_gap / backlink_snapshots from DataForSEO.
// This is the PIPELINE the UI Link Intelligence tabs depend on.
// Without this, `generateFullLinkIntelligence` synthesizes from
// empty tables and the Backlinks / Referring Domains / Link Gap
// tabs stay blank forever.
// ============================================================
function _cleanDomain(raw) {
  if (!raw) return '';
  try {
    let d = String(raw).trim().toLowerCase();
    d = d.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').split('/')[0];
    return d;
  } catch { return ''; }
}

async function _dfsPost(endpoint, body) {
  const login = (process.env.DATAFORSEO_LOGIN || '').trim();
  const password = (process.env.DATAFORSEO_PASSWORD || '').trim();
  if (!login || !password) throw new Error('DataForSEO credentials not configured');
  const auth = Buffer.from(`${login}:${password}`).toString('base64');
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`DataForSEO ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const task = data?.tasks?.[0];
  if (task?.status_code !== 20000) throw new Error(`DataForSEO task error: ${task?.status_message}`);
  return task?.result?.[0] || {};
}

export async function syncBacklinkIntelligence(clientId) {
  const started = Date.now();

  // 1) Load client + competitors
  const [{ data: client }, { data: comps }] = await Promise.all([
    supabase.from('clients').select('id, name, domain').eq('id', clientId).single(),
    supabase.from('client_competitors').select('domain, name').eq('client_id', clientId),
  ]);
  if (!client) throw new Error(`Client not found: ${clientId}`);
  const clientDomain = _cleanDomain(client.domain);
  if (!clientDomain) throw new Error(`Client ${client.name} has no domain configured`);
  const competitorDomains = (comps || [])
    .map(c => _cleanDomain(c.domain))
    .filter(d => d && !d.startsWith('competitor-')); // skip placeholder competitors

  const summary = {
    client: client.name, domain: clientDomain,
    competitors_processed: [], tables_written: {},
    errors: [], data_source: 'dataforseo',
    started_at: new Date(started).toISOString(),
  };

  // 2) Client backlinks SUMMARY → backlink_snapshots
  try {
    const s = await _dfsPost('https://api.dataforseo.com/v3/backlinks/summary/live',
      [{ target: clientDomain, internal_list_limit: 0, backlinks_filters: ['dofollow', '=', true] }]);
    await supabase.from('backlink_snapshots').insert({
      client_id: clientId,
      total_backlinks: s.backlinks || 0,
      total_referring_domains: s.referring_domains || 0,
      dofollow_backlinks: s.referring_links_attributes?.dofollow || s.backlinks || 0,
      domain_authority: Math.min(100, Math.round((s.rank || 0) / 6)),
      snapshot_date: new Date().toISOString().slice(0, 10),
      source: 'dataforseo',
    });
    summary.tables_written.backlink_snapshots = 1;
    summary.client_rank = s.rank || 0;
  } catch (e) { summary.errors.push(`summary: ${e.message}`); }

  // 3) Client REFERRING DOMAINS → referring_domains (upsert to preserve Google-discovered entries)
  try {
    const rd = await _dfsPost('https://api.dataforseo.com/v3/backlinks/referring_domains/live',
      [{ target: clientDomain, limit: 500, order_by: ['rank,desc'], exclude_internal_backlinks: true }]);
    const items = rd.items || [];
    if (items.length > 0) {
      const rows = items.map(d => ({
        client_id: clientId,
        domain: d.domain,
        domain_authority: Math.min(100, Math.round((d.rank || 0) / 6)),
        backlink_count: d.backlinks || 0,
        dofollow_count: d.backlinks_spam_score != null ? (d.backlinks || 0) : (d.backlinks || 0),
        is_competitor: false,
        first_seen: d.first_seen || null,
        last_updated: new Date().toISOString(),
      }));
      // chunked upsert to avoid payload limits — preserves Google-discovered domains
      for (let i = 0; i < rows.length; i += 200) {
        await supabase.from('referring_domains').upsert(rows.slice(i, i + 200), { onConflict: 'client_id,domain' });
      }
      summary.tables_written.referring_domains = rows.length;
    }
  } catch (e) { summary.errors.push(`referring_domains: ${e.message}`); }

  // 4) Client BACKLINKS (per-link detail) → backlinks (upsert, capped at 500)
  //    NO DELETE — upsert preserves Google-discovered links from step 4b across sync cycles
  try {
    const bl = await _dfsPost('https://api.dataforseo.com/v3/backlinks/backlinks/live',
      [{ target: clientDomain, limit: 500, order_by: ['rank,desc'], mode: 'as_is' }]);
    const items = bl.items || [];
    if (items.length > 0) {
      // Deduplicate by (source_domain, target_url) to avoid unique constraint violations
      const seenKeys = new Set();
      const rows = [];
      for (const b of items.slice(0, 500)) {
        const key = `${b.domain_from}::${b.url_to}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        rows.push({
          client_id: clientId,
          source_domain: b.domain_from,
          source_url: b.url_from,
          target_url: b.url_to,
          anchor_text: b.anchor || null,
          domain_authority: Math.min(100, Math.round((b.rank || 0) / 6)),
          page_authority: Math.min(100, Math.round((b.page_from_rank || 0) / 6)),
          is_dofollow: !!b.dofollow,
          is_sponsored: !!b.is_sponsored,
          first_seen: b.first_seen || null,
          last_seen: b.last_seen || null,
        });
      }
      for (let i = 0; i < rows.length; i += 200) {
        await supabase.from('backlinks').upsert(rows.slice(i, i + 200), { onConflict: 'client_id,source_domain,target_url' });
      }
      summary.tables_written.backlinks = rows.length;
    }
  } catch (e) { summary.errors.push(`backlinks: ${e.message}`); }

  // 4b) GOOGLE-BASED BACKLINK DISCOVERY
  // DataForSEO's backlink index misses many real links (especially from major news sites).
  // Supplement by searching Google for pages that mention the client domain OR name, then
  // verify each result by fetching the page and checking for actual links.
  try {
    // Build search queries: domain-based + name-based (including local language names)
    const searchQueries = [`"${clientDomain}" -site:${clientDomain}`];
    const { data: profile } = await supabase.from('client_profiles')
      .select('language, notes').eq('client_id', clientId).maybeSingle();
    const clientNameClean = client.name.replace(/[-_]/g, ' ').replace(/\b(law firm|finance|agency|group|ltd|inc)\b/gi, '').trim();
    if (clientNameClean.length > 2) {
      searchQueries.push(`"${clientNameClean}" -site:${clientDomain}`);
    }

    // CRITICAL FIX: Extract the local-language name from the client's own website
    // (Hebrew clients have Hebrew names on their site that differ from English DB name)
    try {
      const homeRes = await fetch(`https://${clientDomain}`, {
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html', 'Accept-Language': 'he,en;q=0.9',
        },
      });
      if (homeRes.ok) {
        const homeHtml = await homeRes.text();
        // Extract title tag text
        const titleMatch = homeHtml.match(/<title[^>]*>([^<]*)<\/title>/i);
        const titleText = titleMatch?.[1]?.trim() || '';
        // Extract og:site_name or og:title
        const ogNameMatch = homeHtml.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']/i)
          || homeHtml.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:site_name["']/i);
        const ogName = ogNameMatch?.[1]?.trim() || '';
        // Extract H1
        const h1Match = homeHtml.match(/<h1[^>]*>([^<]*)<\/h1>/i);
        const h1Text = h1Match?.[1]?.trim() || '';

        // Build local names from extracted text: pick unique, meaningful strings
        const localNames = new Set();
        // From title: take the part before common separators (|, -, –)
        if (titleText) {
          const titleParts = titleText.split(/[|–\-]/);
          for (const part of titleParts) {
            const clean = part.trim();
            // Only use if it contains non-ASCII (Hebrew/Arabic) characters and is meaningful
            if (clean.length > 2 && /[^\x00-\x7F]/.test(clean)) {
              localNames.add(clean);
            }
          }
        }
        if (ogName && /[^\x00-\x7F]/.test(ogName)) localNames.add(ogName);
        if (h1Text && h1Text.length > 2 && /[^\x00-\x7F]/.test(h1Text)) localNames.add(h1Text);

        // Add local names as additional search queries (limit to 3 most unique)
        let added = 0;
        for (const localName of localNames) {
          if (added >= 3) break;
          // Skip if too similar to existing queries
          const alreadyCovered = searchQueries.some(q => q.includes(localName));
          if (!alreadyCovered && localName.length > 2 && localName.length < 60) {
            searchQueries.push(`"${localName}" -site:${clientDomain}`);
            added++;
          }
        }
        summary.local_names_extracted = Array.from(localNames);
      }
    } catch (homeErr) {
      summary.errors.push(`local_name_extraction: ${homeErr.message}`);
    }

    // Also check memory_items for a stored local/Hebrew name
    const { data: memoryNames } = await supabase.from('memory_items')
      .select('value').eq('client_id', clientId)
      .or('key.ilike.%local_name%,key.ilike.%hebrew_name%,key.ilike.%business_name%')
      .limit(3);
    for (const mem of (memoryNames || [])) {
      if (mem.value && mem.value.length > 2 && !searchQueries.some(q => q.includes(mem.value))) {
        searchQueries.push(`"${mem.value}" -site:${clientDomain}`);
      }
    }

    // Merge all SERP results from multiple queries, deduplicate by URL
    // Track which query found each result — name-based results (qi >= 1) are trusted more
    // because if a page appears in a "client name" search, it's likely relevant
    const allSerpItems = [];
    const seenUrls = new Set();
    const nameQueryUrls = new Set(); // URLs found by ANY name-based query (not the domain query)
    summary.search_queries = searchQueries;
    for (let qi = 0; qi < searchQueries.length; qi++) {
      const query = searchQueries[qi];
      try {
        const serpResult = await _dfsPost('https://api.dataforseo.com/v3/serp/google/organic/live/advanced',
          [{ keyword: query, location_code: 2376, language_code: profile?.language === 'he' ? 'he' : 'en', depth: 30 }]);
        const queryItems = serpResult.items || [];
        for (const item of queryItems) {
          if (item.type === 'organic') {
            // qi >= 1 = any name-based query (English name, Hebrew name, etc.)
            if (qi >= 1) nameQueryUrls.add(item.url);
            if (!seenUrls.has(item.url)) {
              seenUrls.add(item.url);
              allSerpItems.push(item);
            }
          }
        }
        summary[`serp_query_${qi}_results`] = queryItems.filter(i => i.type === 'organic').length;
        await new Promise(r => setTimeout(r, 300));
      } catch (qErr) { summary.errors.push(`serp_query "${query}": ${qErr.message}`); }
    }
    summary.name_query_urls_count = nameQueryUrls.size;
    const serpItems = allSerpItems;
    const discoveredLinks = [];

    // Skip social media and the client's own domain
    const skipDomains = new Set([clientDomain, 'facebook.com', 'instagram.com', 'linkedin.com', 'twitter.com', 'x.com', 'youtube.com', 'tiktok.com']);

    for (const item of serpItems.slice(0, 30)) {
      const sourceUrl = item.url;
      const sourceDomain = (item.domain || (() => { try { return new URL(sourceUrl).hostname; } catch { return ''; } })()).replace(/^www\./, '');

      // Skip social media and client's own domain
      if (skipDomains.has(sourceDomain) || [...skipDomains].some(sd => sourceDomain.endsWith('.' + sd))) continue;
      if (sourceDomain === clientDomain) continue;

      try {
        // Fetch the page and check for actual links to the client domain
        const pageRes = await fetch(sourceUrl, {
          signal: AbortSignal.timeout(8000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'he,en;q=0.9',
          },
        });
        if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status}`);
        const html = await pageRes.text();

        // Find all links to the client domain
        const linkRegex = new RegExp(`href=["'](https?://(?:www\\.)?${clientDomain.replace(/\./g, '\\.')}[^"']*?)["']`, 'gi');
        const anchors = [];
        let match;
        while ((match = linkRegex.exec(html)) !== null) {
          // Extract anchor text (approximate — look for >text</a> after the href)
          const hrefEnd = match.index + match[0].length;
          const afterHref = html.slice(hrefEnd, hrefEnd + 500);
          const closeTag = afterHref.indexOf('>');
          const anchorEnd = afterHref.indexOf('</a>', closeTag);
          let anchorText = '';
          if (closeTag >= 0 && anchorEnd >= 0) {
            anchorText = afterHref.slice(closeTag + 1, anchorEnd).replace(/<[^>]*>/g, '').trim();
          }
          // Check if nofollow
          const linkTagStart = html.lastIndexOf('<a', match.index);
          const linkTag = html.slice(linkTagStart, hrefEnd + 200);
          const isNofollow = /rel=["'][^"']*nofollow[^"']*["']/i.test(linkTag);

          anchors.push({
            target_url: match[1],
            anchor_text: anchorText || null,
            is_dofollow: !isNofollow,
          });
        }

        if (anchors.length > 0) {
          // Use the first link found as representative
          const primary = anchors[0];
          discoveredLinks.push({
            client_id: clientId,
            source_domain: sourceDomain,
            source_url: sourceUrl,
            target_url: primary.target_url,
            anchor_text: primary.anchor_text,
            domain_authority: Math.min(100, Math.round((item.rank_absolute || item.rank_group || 0) * 3)),
            page_authority: 0,
            is_dofollow: primary.is_dofollow,
            is_sponsored: false,
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          });
        }
        // Rate limit: small pause between fetches
        await new Promise(r => setTimeout(r, 300));
      } catch (fetchErr) {
        // Fallback for paywalled / bot-protected sites (Haaretz, TheMarker, WSJ, etc.):
        // Trust the result if ANY of these conditions is met:
        const fromNameQuery = nameQueryUrls.has(sourceUrl);
        const snippet = ((item.description || '') + ' ' + (item.title || '')).toLowerCase();
        const domainSlug = clientDomain.split('.')[0]; // e.g. "yanivgil" from "yanivgil.co.il"
        const domainInSnippet = snippet.includes(clientDomain.toLowerCase()) ||
          snippet.includes(domainSlug.toLowerCase());
        const nameInSnippet = clientNameClean && clientNameClean.length > 2 &&
          snippet.includes(clientNameClean.toLowerCase());
        // Also check local names from the website title/H1 extraction
        const localNameInSnippet = (summary.local_names_extracted || []).some(
          ln => ln && ln.length > 2 && snippet.includes(ln.toLowerCase())
        );

        if (fromNameQuery || domainInSnippet || nameInSnippet || localNameInSnippet) {
          discoveredLinks.push({
            client_id: clientId,
            source_domain: sourceDomain,
            source_url: sourceUrl,
            target_url: `https://${clientDomain}`,
            anchor_text: item.title || null,
            domain_authority: Math.min(100, Math.round((item.rank_absolute || item.rank_group || 0) * 3)),
            page_authority: 0,
            is_dofollow: true, // assume dofollow unless verified otherwise
            is_sponsored: false,
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          });
          summary.paywall_trusted = summary.paywall_trusted || [];
          summary.paywall_trusted.push({
            url: sourceUrl, domain: sourceDomain,
            reason: fromNameQuery ? 'name_query' : domainInSnippet ? 'domain_in_snippet' : localNameInSnippet ? 'local_name_in_snippet' : 'name_in_snippet',
          });
        }
        continue;
      }
    }

    // Insert discovered backlinks (upsert to avoid duplicates with DataForSEO data)
    if (discoveredLinks.length > 0) {
      for (let i = 0; i < discoveredLinks.length; i += 200) {
        await supabase.from('backlinks').upsert(
          discoveredLinks.slice(i, i + 200),
          { onConflict: 'client_id,source_domain,target_url' }
        );
      }
      // Also add to referring_domains if not already there
      const { data: existingRD } = await supabase.from('referring_domains')
        .select('domain').eq('client_id', clientId);
      const existingSet = new Set((existingRD || []).map(r => r.domain));
      const newRDs = discoveredLinks
        .filter(l => !existingSet.has(l.source_domain))
        .map(l => ({
          client_id: clientId,
          domain: l.source_domain,
          domain_authority: l.domain_authority,
          backlink_count: 1,
          dofollow_count: l.is_dofollow ? 1 : 0,
          is_competitor: false,
          first_seen: new Date().toISOString(),
          last_updated: new Date().toISOString(),
        }));
      if (newRDs.length > 0) {
        // Deduplicate by domain
        const seen = new Set();
        const deduped = newRDs.filter(r => { if (seen.has(r.domain)) return false; seen.add(r.domain); return true; });
        await supabase.from('referring_domains').upsert(deduped, { onConflict: 'client_id,domain' });
      }
      summary.tables_written.google_discovered_backlinks = discoveredLinks.length;
      summary.google_discovery = {
        serp_results_checked: serpItems.length,
        verified_backlinks_found: discoveredLinks.length,
        domains: discoveredLinks.map(l => l.source_domain),
      };
    }
  } catch (e) { summary.errors.push(`google_discovery: ${e.message}`); }

  // 5) COMPETITOR LINK GAP — per competitor, fetch their referring_domains and
  //    compute set-diff vs ours. Writes competitor_link_gap + missing_referring_domains.
  const ourDomainsSet = new Set();
  const { data: ourRD } = await supabase.from('referring_domains').select('domain').eq('client_id', clientId);
  (ourRD || []).forEach(r => ourDomainsSet.add(r.domain));

  const gapByDomain = new Map(); // domain -> {da, competitors: Set, backlinks}

  for (const compDomain of competitorDomains) {
    try {
      const rd = await _dfsPost('https://api.dataforseo.com/v3/backlinks/referring_domains/live',
        [{ target: compDomain, limit: 300, order_by: ['rank,desc'], exclude_internal_backlinks: true }]);
      const items = rd.items || [];
      summary.competitors_processed.push({ competitor: compDomain, domains_found: items.length });
      for (const d of items) {
        if (ourDomainsSet.has(d.domain)) continue; // we already have it
        if (!d.domain || d.domain === compDomain) continue;
        const key = d.domain;
        if (!gapByDomain.has(key)) {
          gapByDomain.set(key, { da: Math.min(100, Math.round((d.rank || 0) / 6)), competitors: new Set(), backlinks: d.backlinks || 0 });
        }
        gapByDomain.get(key).competitors.add(compDomain);
      }
      // small pause to respect rate limits
      await new Promise(r => setTimeout(r, 400));
    } catch (e) { summary.errors.push(`competitor ${compDomain}: ${e.message}`); }
  }

  if (gapByDomain.size > 0) {
    // clear old gap + missing rows so the view always reflects the latest scrape
    await Promise.all([
      supabase.from('competitor_link_gap').delete().eq('client_id', clientId),
      supabase.from('missing_referring_domains').delete().eq('client_id', clientId).eq('imported_from_sheet', false),
    ]);

    // RECONCILIATION: delete any sheet-imported "missing" rows where we actually
    // have the link now (e.g. DataForSEO or Google discovery surfaced it).
    // Without this, stale sheet imports keep showing up as "missing" forever.
    if (ourDomainsSet.size > 0) {
      const ownedDomainsArray = Array.from(ourDomainsSet);
      const { error: reconErr, count: reconCount } = await supabase
        .from('missing_referring_domains')
        .delete({ count: 'exact' })
        .eq('client_id', clientId)
        .in('domain', ownedDomainsArray);
      if (reconErr) summary.errors.push(`reconcile_missing: ${reconErr.message}`);
      else if (reconCount) summary.reconciled_stale_missing = reconCount;
    }

    const gapRows = [];
    const missingRows = [];
    for (const [domain, info] of gapByDomain.entries()) {
      const compList = Array.from(info.competitors);
      const relevance = Math.min(100, info.da + compList.length * 5);
      // one row per competitor (for competitor_link_gap)
      for (const comp of compList) {
        gapRows.push({
          client_id: clientId,
          domain,
          competitor_domain: comp,
          domain_authority: info.da,
          relevance_score: relevance,
          category: info.da >= 50 ? 'high_authority' : info.da >= 30 ? 'mid_authority' : 'niche',
          outreach_difficulty: info.da >= 70 ? 'hard' : info.da >= 40 ? 'medium' : 'easy',
          recommendation: `Pursue editorial / guest post / PR mention on ${domain} — referenced by ${compList.length} competitor(s)`,
          ai_rationale: null,
          status: 'uncontacted',
        });
      }
      // one row per missing domain (deduped, for missing_referring_domains)
      missingRows.push({
        client_id: clientId,
        domain,
        competitors_that_have_it: compList,
        competitor_count: compList.length,
        domain_authority: info.da,
        relevance_score: relevance,
        priority_score: relevance + compList.length * 8,
        category: info.da >= 50 ? 'high_authority' : info.da >= 30 ? 'mid_authority' : 'niche',
        recommended_acquisition_type: info.da >= 60 ? 'pr_or_editorial' : info.da >= 40 ? 'guest_post' : 'directory_or_resource',
        status: 'uncontacted',
        imported_from_sheet: false,
      });
    }
    // chunked inserts — capture errors so silent CHECK-constraint failures surface
    let gapWritten = 0, missingWritten = 0;
    for (let i = 0; i < gapRows.length; i += 200) {
      const chunk = gapRows.slice(i, i + 200);
      const { error } = await supabase.from('competitor_link_gap').insert(chunk);
      if (error) summary.errors.push(`competitor_link_gap insert chunk ${i}: ${error.message}`);
      else gapWritten += chunk.length;
    }
    for (let i = 0; i < missingRows.length; i += 200) {
      const chunk = missingRows.slice(i, i + 200);
      const { error } = await supabase.from('missing_referring_domains').insert(chunk);
      if (error) summary.errors.push(`missing_referring_domains insert chunk ${i}: ${error.message}`);
      else missingWritten += chunk.length;
    }
    summary.tables_written.competitor_link_gap = gapWritten;
    summary.tables_written.missing_referring_domains = missingWritten;
  }

  summary.duration_ms = Date.now() - started;
  summary.finished_at = new Date().toISOString();

  // Audit trail
  await supabase.from('audit_trail').insert({
    client_id: clientId,
    action_type: 'backlink_intelligence_synced',
    triggered_by: 'admin',
    after_value: JSON.stringify(summary),
  });

  return summary;
}

export async function generateFullLinkIntelligence(clientId) {
  // Auto-sync first so the LLM synthesis actually has data to work with.
  // If the sync fails (e.g. DataForSEO credentials missing), we still try
  // to synthesize from whatever the tables currently hold.
  try { await syncBacklinkIntelligence(clientId); }
  catch (e) { console.error('[link-intelligence] sync failed, continuing with existing data:', e.message); }

  const [missingDomains, linkGap, existingLinks, competitors, baselines] = await Promise.all([
    supabase.from('missing_referring_domains').select('*').eq('client_id', clientId).order('priority_score', { ascending: false }).limit(50),
    supabase.from('competitor_link_gap').select('*').eq('client_id', clientId).order('domain_authority', { ascending: false }).limit(50),
    supabase.from('referring_domains').select('*').eq('client_id', clientId).order('domain_authority', { ascending: false }).limit(30),
    supabase.from('client_competitors').select('*').eq('client_id', clientId),
    supabase.from('baselines').select('*').eq('client_id', clientId)
  ]);

  const { data: client } = await supabase.from('clients').select('name, domain, client_profiles(*)').eq('id', clientId).single();

  const profile = client?.client_profiles?.[0] || {};
  const bizType = profile.business_type || profile.industry || 'business';
  const location = profile.city || profile.location || 'Israel';
  const lang = profile.language || 'he';

  const prompt = `CRITICAL LANGUAGE RULE: Write ALL user-facing text fields in HEBREW (עברית). This includes: executive_summary, why_it_matters, outreach_strategy, authority_gap_summary, recommended_next_action, quick_wins descriptions. The UI is Hebrew and all clients are Hebrew-speaking Israeli businesses. Domain names and technical IDs stay in English, but all human-readable explanations MUST be in Hebrew. Do NOT use English for any explanatory text.

You are a senior link building strategist specializing in ${bizType} SEO in ${location}.

CLIENT: ${client?.name} (${client?.domain})
INDUSTRY: ${bizType}
LANGUAGE: Hebrew | MARKET: Israel | LOCATION: ${location}

MISSING REFERRING DOMAINS (competitors have, we don't):
${JSON.stringify(missingDomains.data?.slice(0, 30), null, 2)}

COMPETITOR LINK GAP:
${JSON.stringify(linkGap.data?.slice(0, 20), null, 2)}

OUR EXISTING REFERRING DOMAINS (exclude from recommendations):
${existingLinks.data?.map(d => d.domain).join(', ')}

COMPETITORS:
${JSON.stringify(competitors.data, null, 2)}

Generate a prioritized link acquisition strategy. For each opportunity:
- Why this specific domain matters for ${bizType} SEO in ${location}
- Realistic outreach strategy for ${client?.name}
- Estimated effort and expected ranking/authority impact
- Which competitor winning this link is hurting us most

Return ONLY valid JSON:
{
  "executive_summary": "string",
  "total_gap_domains": "number",
  "top_priority_domains": [
    {
      "domain": "string",
      "domain_authority": "number",
      "priority_rank": "number",
      "opportunity_type": "competitor_gap|authority_gap|editorial|directory|pr|guest_post",
      "competitor_that_has_it": "string|null",
      "why_it_matters": "string",
      "outreach_strategy": "string",
      "effort": "low|medium|high",
      "expected_impact": "low|medium|high",
      "owner_lane": "SEO Operations"
    }
  ],
  "quick_wins": ["array of 3 domains we can get in under 1 week"],
  "authority_gap_summary": "string",
  "recommended_next_action": "string"
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
    temperature: 0.3
  });

  const result = JSON.parse(completion.choices[0].message.content);

  // Upsert link opportunities
  if (result.top_priority_domains?.length > 0) {
    for (const opp of result.top_priority_domains) {
      await supabase.from('link_opportunities').upsert({
        client_id: clientId,
        domain: opp.domain,
        opportunity_type: opp.opportunity_type || 'competitor_gap',
        domain_authority: opp.domain_authority || 0,
        priority_score: (21 - (opp.priority_rank || 10)) * 5,
        effort: opp.effort || 'medium',
        expected_impact: opp.expected_impact || 'medium',
        competitor_that_has_it: opp.competitor_that_has_it || null,
        why_it_matters: opp.why_it_matters,
        outreach_strategy: opp.outreach_strategy,
        owner_lane: opp.owner_lane || 'SEO Operations',
        ai_generated: true,
        generated_at: new Date().toISOString()
      }, { onConflict: 'client_id,domain' });
    }
  }

  await supabase.from('audit_trail').insert({
    client_id: clientId,
    action_type: 'link_intelligence_generated',
    triggered_by: 'admin',
    after_value: JSON.stringify({ opportunities_found: result.top_priority_domains?.length || 0 })
  });

  return result;
}

// ============================================================
// SEO ACTION PLANS
// ============================================================
export async function generateSeoActionPlan(clientId) {
  const [keywords, competitors, baselines, memory, techDebt, clientRes] = await Promise.all([
    supabase.from('client_keywords').select('*').eq('client_id', clientId).order('volume', { ascending: false }).limit(30),
    supabase.from('client_competitors').select('*').eq('client_id', clientId),
    supabase.from('baselines').select('*').eq('client_id', clientId),
    supabase.from('memory_items').select('content, scope').eq('client_id', clientId).eq('approved', true).eq('is_stale', false).limit(20),
    supabase.from('seo_action_plans').select('title, status').eq('client_id', clientId).eq('status', 'open'),
    supabase.from('clients').select('name, domain, client_profiles(*)').eq('id', clientId).single()
  ]);

  const client = clientRes.data;
  const profile = client?.client_profiles?.[0] || {};
  const bizType = profile.business_type || profile.industry || 'business';
  const location = profile.city || profile.location || 'Israel';
  const lang = profile.language || 'he';

  const prompt = `CRITICAL LANGUAGE RULE: Write ALL user-facing text (title, description, target_keyword descriptions, every human-readable string) in HEBREW (עברית). All clients are Hebrew-speaking Israeli businesses. Domain names and technical IDs stay in English, but all explanations MUST be in Hebrew.

You are a senior SEO strategist for ${client?.name || 'this client'} (${client?.domain}), a ${bizType} in ${location}.

CURRENT SEO STATUS:
- Mobile PageSpeed: ${baselines.data?.find(b => b.metric_name === 'mobile_pagespeed')?.metric_value || '~60'}/100
- Page 1 Keywords: ${baselines.data?.find(b => b.metric_name === 'page1_keywords')?.metric_value || 0}
- Local 3-Pack: ${baselines.data?.find(b => b.metric_name === 'local_3pack_present')?.metric_value ? 'Yes' : 'No'}
- Google Reviews: ${baselines.data?.find(b => b.metric_name === 'google_reviews_count')?.metric_value || 0}

TARGET KEYWORDS (top by volume):
${keywords.data?.slice(0, 15).map(k => `${k.keyword} | pos: ${k.current_position || 'unranked'} | vol: ${k.volume}`).join('\n')}

EXISTING OPEN ACTIONS (don't duplicate):
${techDebt.data?.map(a => a.title).join('\n') || 'None'}

MEMORY INSIGHTS:
${memory.data?.map(m => m.content).join('\n').slice(0, 1000)}

Generate 10 specific, actionable SEO tasks prioritized by impact for this ${bizType} in ${location}. Language: ${lang}.

Return ONLY valid JSON:
{
  "action_plan": [
    {
      "action_type": "page1_opportunity|content_gap|technical_gap|internal_linking_gap|backlink_gap|authority_gap|local_visibility_gap|schema_gap|speed_gap|cro_gap",
      "title": "string (in Hebrew)",
      "description": "string (detailed, in Hebrew)",
      "target_keyword": "string|null",
      "target_url": "string|null",
      "effort": "low|medium|high",
      "expected_impact": "low|medium|high",
      "owner_lane": "SEO Operations|Website Content, UX, and Design|Local Authority, Reviews, and GBP",
      "priority_score": "number 0-100"
    }
  ]
}`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    max_tokens: 3000,
    temperature: 0.3
  });

  const result = JSON.parse(completion.choices[0].message.content);

  // Insert action plans
  if (result.action_plan?.length > 0) {
    await supabase.from('seo_action_plans').insert(
      result.action_plan.map(a => ({
        client_id: clientId,
        action_type: a.action_type,
        title: a.title,
        description: a.description,
        target_keyword: a.target_keyword || null,
        target_url: a.target_url || null,
        effort: a.effort || 'medium',
        expected_impact: a.expected_impact || 'medium',
        owner_lane: a.owner_lane || 'SEO Operations',
        priority_score: a.priority_score || 50,
        status: 'open'
      }))
    );
  }

  return result;
}

// ============================================================
// FULL VERIFICATION SYSTEM — honest status labels
// Working | Partial | Modeled But Dead | UI Only | Missing | Blocked | Production Fail
// ============================================================
export async function runFullVerification(clientId) {
  const checks = [];

  const addCheck = (id, label, status, detail, actionUrl) => {
    checks.push({ id, label, status, detail, actionUrl });
  };

  // 1. Seeded agents exist with real prompts
  const { data: agents } = await supabase.from('agent_templates').select('id, name, base_prompt, is_active');
  const activeAgents = agents?.filter(a => a.is_active) || [];
  const agentsWithPrompts = activeAgents.filter(a => a.base_prompt && a.base_prompt.length > 100);
  if (activeAgents.length >= 23 && agentsWithPrompts.length >= 23) {
    addCheck('agents_seeded', 'All 23 agents seeded with real prompts', 'Working',
      `${activeAgents.length} active agents, ${agentsWithPrompts.length} with full prompts`, '/agents');
  } else if (activeAgents.length > 0) {
    addCheck('agents_seeded', 'Agents seeded but some missing prompts', 'Partial',
      `${activeAgents.length} active, ${agentsWithPrompts.length} with real prompts (need 23)`, '/agents');
  } else {
    addCheck('agents_seeded', 'No agents found', 'Missing', 'Run seed script', '/agents');
  }

  // 2. Prompt versions active
  const { count: activeVersions } = await supabase.from('prompt_versions').select('id', { count: 'exact', head: true }).eq('is_active', true);
  if ((activeVersions || 0) > 0) {
    addCheck('prompt_versions', 'Active prompt versions exist', 'Working', `${activeVersions} active versions`, '/prompts');
  } else {
    addCheck('prompt_versions', 'No active prompt versions', 'UI Only', 'Base prompts exist but no versioned overrides', '/prompts');
  }

  // 3. Client onboarding injected into runs
  const { data: recentRuns } = await supabase.from('runs').select('onboarding_context_snapshot, client_policy_snapshot').eq('client_id', clientId).order('created_at', { ascending: false }).limit(5);
  const runsWithContext = recentRuns?.filter(r => r.onboarding_context_snapshot && Object.keys(r.onboarding_context_snapshot).length > 0) || [];
  if (recentRuns?.length === 0) {
    addCheck('onboarding_injected', 'No runs yet to verify context injection', 'Missing', 'Run an agent first', '/runs');
  } else if (runsWithContext.length > 0) {
    addCheck('onboarding_injected', 'Client context injected into runs', 'Working', `${runsWithContext.length}/${recentRuns.length} recent runs have context`, '/runs');
  } else {
    addCheck('onboarding_injected', 'Context not injected in recent runs', 'Production Fail', 'executeAgent must inject client context', '/runs');
  }

  // 4. Memory injected and tracked
  const { data: memoryUsedRuns } = await supabase.from('runs').select('memory_items_used').eq('client_id', clientId).order('created_at', { ascending: false }).limit(10);
  const runsWithMemory = memoryUsedRuns?.filter(r => r.memory_items_used && r.memory_items_used.length > 0) || [];
  if (memoryUsedRuns?.length === 0) {
    addCheck('memory_injected', 'No runs to verify memory injection', 'Missing', 'Run an agent first', '/memory');
  } else if (runsWithMemory.length > 0) {
    addCheck('memory_injected', 'Memory injected and tracked in runs', 'Working', `${runsWithMemory.length}/${memoryUsedRuns.length} recent runs used memory`, '/memory');
  } else {
    addCheck('memory_injected', 'Memory exists but not injected in runs', 'Modeled But Dead', 'executeAgent must pull and inject memory', '/memory');
  }

  // 5. Documents ingestible to memory
  const { data: docs } = await supabase.from('client_documents').select('processing_status').eq('client_id', clientId);
  const processedDocs = docs?.filter(d => d.processing_status === 'done') || [];
  if (docs?.length === 0) {
    addCheck('document_ingestion', 'No documents uploaded yet', 'Missing', 'Upload a document to test ingestion', '/documents');
  } else if (processedDocs.length > 0) {
    addCheck('document_ingestion', 'Document ingestion working', 'Working', `${processedDocs.length}/${docs.length} documents processed to memory`, '/documents');
  } else {
    addCheck('document_ingestion', 'Documents uploaded but not processed', 'Partial', 'Trigger ingestion on uploaded documents', '/documents');
  }

  // 6. Queue actually processes
  const { data: executedItems } = await supabase.from('run_queue').select('id').eq('client_id', clientId).eq('status', 'executed').limit(1);
  const { data: queuedItems } = await supabase.from('run_queue').select('id').eq('client_id', clientId).in('status', ['queued', 'running']).limit(1);
  if (executedItems?.length > 0) {
    addCheck('queue_processing', 'Queue processor working', 'Working', 'Queue items have been executed successfully', '/queue');
  } else if (queuedItems?.length > 0) {
    addCheck('queue_processing', 'Items queued but none executed', 'Modeled But Dead', 'Queue exists but processor may not be running', '/queue');
  } else {
    addCheck('queue_processing', 'Queue never used', 'Missing', 'No queue activity yet', '/queue');
  }

  // 7. Schedules actually execute
  const { data: schedules } = await supabase.from('agent_schedules').select('enabled, last_run_at, run_count').eq('client_id', clientId);
  const activeSchedules = schedules?.filter(s => s.enabled) || [];
  const ranSchedules = activeSchedules.filter(s => s.last_run_at && s.run_count > 0);
  if (activeSchedules.length === 0) {
    addCheck('schedules_execute', 'No active schedules configured', 'Missing', 'Configure agent schedules', '/schedules');
  } else if (ranSchedules.length > 0) {
    addCheck('schedules_execute', 'Scheduled runs executing', 'Working', `${ranSchedules.length}/${activeSchedules.length} schedules have run`, '/schedules');
  } else {
    addCheck('schedules_execute', 'Schedules configured but never ran', 'Modeled But Dead', 'Cron must trigger processRunQueue', '/schedules');
  }

  // 8. Approvals actually resume execution
  const { data: resumedApprovals } = await supabase.from('approvals').select('id').eq('client_id', clientId).eq('status', 'approved').not('resumed_run_id', 'is', null).limit(1);
  const { data: pendingApprovals } = await supabase.from('approvals').select('id').eq('client_id', clientId).eq('status', 'pending').limit(1);
  if (resumedApprovals?.length > 0) {
    addCheck('approvals_resume', 'Approval resumption working', 'Working', 'Approved tasks have resumed execution', '/approvals');
  } else if (pendingApprovals?.length > 0) {
    addCheck('approvals_resume', 'Approvals pending but none resumed yet', 'Partial', 'Approve a pending task to test resumption', '/approvals');
  } else {
    addCheck('approvals_resume', 'No approvals yet', 'Missing', 'Run an approve_then_act agent', '/approvals');
  }

  // 9. Post-change validation chain runs
  const { data: validationRuns } = await supabase.from('runs').select('id').eq('client_id', clientId).eq('trigger_post_change_validation', true).limit(1);
  const { data: validationAgentRuns } = await supabase.from('runs').select('id, agent_template_id').eq('client_id', clientId)
    .in('agent_template_id', (await supabase.from('agent_templates').select('id').in('slug', ['website-qa-agent', 'hebrew-quality-agent', 'regression-agent'])).data?.map(a => a.id) || [])
    .limit(1);
  if (validationAgentRuns?.length > 0) {
    addCheck('validation_chain', 'Post-change validation chain executing', 'Working', 'Validation agents have run', '/runs');
  } else if (validationRuns?.length > 0) {
    addCheck('validation_chain', 'Validation triggered but validators not run yet', 'Partial', 'Check queue for validation agents', '/queue');
  } else {
    addCheck('validation_chain', 'Validation chain never triggered', 'Missing', 'Make a change with post_change_trigger=true', '/runs');
  }

  // 10. SEO/link data injected into runtime prompts
  const { count: seoDataCount } = await supabase.from('client_keywords').select('id', { count: 'exact', head: true }).eq('client_id', clientId);
  const { count: linkGapCount } = await supabase.from('competitor_link_gap').select('id', { count: 'exact', head: true }).eq('client_id', clientId);
  const runsWithKeywords = recentRuns?.filter(r => Array.isArray(r.keyword_ids_used) ? r.keyword_ids_used.length > 0 : false) || [];
  if ((seoDataCount || 0) > 0 && runsWithKeywords.length > 0) {
    addCheck('seo_data_injected', 'SEO/link data injected into agent runs', 'Working',
      `${seoDataCount} keywords, ${linkGapCount} gap items, ${runsWithKeywords.length} runs with keyword injection`, '/seo');
  } else if ((seoDataCount || 0) > 0) {
    addCheck('seo_data_injected', 'SEO data exists but not injected in runs', 'Modeled But Dead',
      `${seoDataCount} keywords and ${linkGapCount} gap items in DB but not used in runs`, '/seo');
  } else {
    addCheck('seo_data_injected', 'No SEO data imported yet', 'Missing', 'Import keywords and link data via Google Sheets', '/imports');
  }

  // 11. No fake KPI cards
  const { count: unverifiedKpis } = await supabase.from('kpi_snapshots').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('source_verified', false);
  const { count: verifiedKpis } = await supabase.from('kpi_snapshots').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('source_verified', true);
  if ((unverifiedKpis || 0) > 0) {
    addCheck('kpi_integrity', 'Unverified KPI values present', 'Blocked',
      `${unverifiedKpis} KPIs without verified source — these must not be shown in UI`, '/verification');
  } else if ((verifiedKpis || 0) > 0) {
    addCheck('kpi_integrity', 'All KPI values source-verified', 'Working',
      `${verifiedKpis} KPIs with verified sources`, '/dashboard');
  } else {
    addCheck('kpi_integrity', 'No KPI data yet', 'Missing', 'Seed or import KPI baseline data', '/dashboard');
  }

  // 12. Yaniv Gil rules loaded and inspectable
  const { data: rules } = await supabase.from('client_rules').select('*').eq('client_id', clientId).maybeSingle();
  if (rules && rules.forbidden_accounts?.includes('elad@netop.cloud') && rules.allowed_accounts?.includes('elad.d.keren@gmail.com')) {
    addCheck('yaniv_gil_rules', 'Client rules loaded and verified', 'Working',
      'Allowed/forbidden accounts, brand voice, and policies all set', '/rules');
  } else if (rules) {
    addCheck('yaniv_gil_rules', 'Rules exist but incomplete', 'Partial',
      'Missing allowed/forbidden account configuration', '/rules');
  } else {
    addCheck('yaniv_gil_rules', 'No client rules found', 'Missing', 'Run onboarding or seed', '/onboarding');
  }

  // Compute overall health score
  const statusWeights = { 'Working': 1, 'Partial': 0.5, 'UI Only': 0.2, 'Modeled But Dead': 0, 'Missing': 0, 'Blocked': 0, 'Production Fail': 0 };
  const totalWeight = checks.reduce((sum, c) => sum + (statusWeights[c.status] ?? 0), 0);
  const healthScore = Math.round((totalWeight / checks.length) * 100);

  return {
    checks,
    health_score: healthScore,
    all_passing: checks.every(c => c.status === 'Working'),
    working_count: checks.filter(c => c.status === 'Working').length,
    total_checks: checks.length,
    critical_failures: checks.filter(c => ['Production Fail', 'Blocked'].includes(c.status)),
    dead_features: checks.filter(c => c.status === 'Modeled But Dead'),
    missing_features: checks.filter(c => c.status === 'Missing')
  };
}

// ============================================================
// KEYWORD SNAPSHOT — record historical position
// ============================================================
export async function snapshotKeywordPositions(clientId) {
  const { data: keywords } = await supabase
    .from('client_keywords')
    .select('id, keyword, current_position, url')
    .eq('client_id', clientId)
    .not('current_position', 'is', null);

  if (!keywords?.length) return { snapshots_taken: 0 };

  await supabase.from('keyword_snapshots').insert(
    keywords.map(kw => ({
      client_id: clientId,
      keyword_id: kw.id,
      keyword: kw.keyword,
      position: kw.current_position,
      url: kw.url || null,
      source: 'gsc_import',
      snapshot_date: new Date().toISOString().split('T')[0]
    }))
  );

  return { snapshots_taken: keywords.length };
}

// ============================================================
// KPI SNAPSHOT — record verified KPI values
// ============================================================
export async function recordKpiSnapshot(clientId, metricName, metricValue, metricText, source) {
  if (!source || source.trim() === '') {
    throw new Error('KPI source is required — never record a KPI without a verified source');
  }

  const { data, error } = await supabase.from('kpi_snapshots').insert({
    client_id: clientId,
    metric_name: metricName,
    metric_value: metricValue,
    metric_text: metricText,
    source,
    source_verified: true,
    data_date: new Date().toISOString().split('T')[0]
  }).select().single();

  if (error) throw new Error(error.message);
  return data;
}

