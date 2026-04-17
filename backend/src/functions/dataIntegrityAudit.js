// ============================================================
// DATA INTEGRITY AUDIT — cross-table contradiction detector
// ------------------------------------------------------------
// Runs as part of the self-heal cron. Each rule is a function that
// returns { ruleId, label, severity, tableName, rowCount, sample,
// description, autoFixable, autoFix }.
//
// autoFix (optional): async (supabase, clientId, meta) => { fixed: N }
// When present AND the rule is marked safely auto-fixable, the audit
// runs it and flags the finding as auto_fixed=true, status='fixed'.
//
// Add new rules by pushing to RULES below. Keep each rule cheap —
// prefer COUNT + LIMIT 5 samples over full-table scans.
// ============================================================

const SEVERITY = { INFO: 'info', WARN: 'warn', ERROR: 'error', CRITICAL: 'critical' };

// ============================================================
// RULE 1 — themarker-style: domain is in BOTH referring_domains AND missing_referring_domains
// Auto-fixable: yes (delete the stale missing row)
// ============================================================
async function ruleStaleMissingDomains(supabase, clientId) {
  const { data: ourRD } = await supabase.from('referring_domains')
    .select('domain').eq('client_id', clientId);
  const owned = new Set((ourRD || []).map(r => r.domain));
  if (owned.size === 0) return null;

  const { data: missing } = await supabase.from('missing_referring_domains')
    .select('domain, imported_from_sheet, competitors_that_have_it')
    .eq('client_id', clientId).in('domain', Array.from(owned));
  const stale = missing || [];
  if (stale.length === 0) return null;

  return {
    ruleId: 'stale_missing_domains',
    label: 'Missing-domain rows for links you already have',
    severity: SEVERITY.WARN,
    tableName: 'missing_referring_domains',
    rowCount: stale.length,
    sample: stale.slice(0, 5).map(s => ({
      domain: s.domain,
      imported_from_sheet: s.imported_from_sheet,
      competitors: s.competitors_that_have_it,
    })),
    description: 'These domains are flagged as "missing" on the Link Intelligence → Missing Domains tab, but they already appear in your referring_domains table. The UI is lying.',
    autoFixable: true,
    autoFix: async () => {
      const { error, count } = await supabase.from('missing_referring_domains')
        .delete({ count: 'exact' })
        .eq('client_id', clientId)
        .in('domain', stale.map(s => s.domain));
      if (error) throw new Error(error.message);
      return { fixed: count || stale.length };
    },
  };
}

// ============================================================
// RULE 2 — same pattern on competitor_link_gap
// ============================================================
async function ruleStaleCompetitorGap(supabase, clientId) {
  const { data: ourRD } = await supabase.from('referring_domains')
    .select('domain').eq('client_id', clientId);
  const owned = new Set((ourRD || []).map(r => r.domain));
  if (owned.size === 0) return null;

  const { data: gap } = await supabase.from('competitor_link_gap')
    .select('id, domain, competitor_domain')
    .eq('client_id', clientId).in('domain', Array.from(owned));
  if (!gap || gap.length === 0) return null;

  return {
    ruleId: 'stale_competitor_gap',
    label: 'Competitor-gap rows for links you already have',
    severity: SEVERITY.WARN,
    tableName: 'competitor_link_gap',
    rowCount: gap.length,
    sample: gap.slice(0, 5).map(g => ({ domain: g.domain, competitor: g.competitor_domain })),
    description: 'Competitor Link Gap shows you "missing" these domains, but you already have them in referring_domains.',
    autoFixable: true,
    autoFix: async () => {
      const ids = gap.map(g => g.id);
      const { error, count } = await supabase.from('competitor_link_gap')
        .delete({ count: 'exact' }).in('id', ids);
      if (error) throw new Error(error.message);
      return { fixed: count || ids.length };
    },
  };
}

// ============================================================
// RULE 3 — same pattern on link_opportunities
// ============================================================
async function ruleStaleLinkOpportunities(supabase, clientId) {
  // Check if link_opportunities has a "target_domain" or "domain" column
  const { data: ourRD } = await supabase.from('referring_domains')
    .select('domain').eq('client_id', clientId);
  const owned = new Set((ourRD || []).map(r => r.domain));
  if (owned.size === 0) return null;

  const { data: opps } = await supabase.from('link_opportunities')
    .select('id, target_domain, status, opportunity_type')
    .eq('client_id', clientId)
    .in('status', ['discovered', 'researching', 'contacted']);
  if (!opps || opps.length === 0) return null;

  const stale = opps.filter(o => o.target_domain && owned.has(o.target_domain));
  if (stale.length === 0) return null;

  return {
    ruleId: 'stale_link_opportunities',
    label: 'Open link opportunities for domains you already have',
    severity: SEVERITY.WARN,
    tableName: 'link_opportunities',
    rowCount: stale.length,
    sample: stale.slice(0, 5).map(s => ({ target_domain: s.target_domain, status: s.status, type: s.opportunity_type })),
    description: 'These opportunities are still "open" but the link already exists in your backlink profile. They should be marked acquired.',
    autoFixable: true,
    autoFix: async () => {
      const ids = stale.map(s => s.id);
      const { error, count } = await supabase.from('link_opportunities')
        .update({ status: 'acquired', notes: 'Auto-closed by data-integrity audit — link already in referring_domains' }, { count: 'exact' })
        .in('id', ids);
      if (error) throw new Error(error.message);
      return { fixed: count || ids.length };
    },
  };
}

// ============================================================
// RULE 4 — zombie runs (status='running' but updated_at > 1h ago)
// ============================================================
async function ruleZombieRuns(supabase, clientId) {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: zombies } = await supabase.from('runs')
    .select('id, created_at, updated_at, agent_template_id')
    .eq('client_id', clientId).eq('status', 'running')
    .lt('updated_at', hourAgo).limit(100);
  if (!zombies || zombies.length === 0) return null;

  return {
    ruleId: 'zombie_runs',
    label: 'Runs stuck in "running" status > 1 hour',
    severity: SEVERITY.ERROR,
    tableName: 'runs',
    rowCount: zombies.length,
    sample: zombies.slice(0, 5).map(r => ({ id: r.id, started: r.created_at, last_update: r.updated_at })),
    description: 'Agent runs that never reported completion. Self-heal also cancels these after 10min, so this is a backstop.',
    autoFixable: true,
    autoFix: async () => {
      const ids = zombies.map(z => z.id);
      const { error, count } = await supabase.from('runs')
        .update({ status: 'failed', error: 'Zombie run auto-cancelled by data-integrity audit', updated_at: new Date().toISOString() }, { count: 'exact' })
        .in('id', ids);
      if (error) throw new Error(error.message);
      return { fixed: count || ids.length };
    },
  };
}

// ============================================================
// RULE 5 — placeholder competitor rows (competitor-a / competitor-b)
// ============================================================
async function rulePlaceholderCompetitors(supabase, clientId) {
  const { data: comps } = await supabase.from('client_competitors')
    .select('id, domain, name').eq('client_id', clientId)
    .or('domain.ilike.competitor-%,name.ilike.competitor-%');
  if (!comps || comps.length === 0) return null;

  return {
    ruleId: 'placeholder_competitors',
    label: 'Placeholder "competitor-a/b/c" rows from seed data',
    severity: SEVERITY.WARN,
    tableName: 'client_competitors',
    rowCount: comps.length,
    sample: comps.slice(0, 5).map(c => ({ domain: c.domain, name: c.name })),
    description: 'These are seed-data leftovers, not real competitors. They pollute competitor analysis. Replace with real competitor domains.',
    autoFixable: false, // user should pick real competitors manually
  };
}

// ============================================================
// RULE 6 — proposed_changes with inconsistent status/executed state
// ============================================================
async function ruleOrphanedProposals(supabase, clientId) {
  // Proposals stuck in "approved" for > 48h without executed_at
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const { data: stuck } = await supabase.from('proposed_changes')
    .select('id, page_url, change_type, status, approved_at')
    .eq('client_id', clientId).eq('status', 'approved')
    .lt('approved_at', twoDaysAgo).is('executed_at', null).limit(100);
  if (!stuck || stuck.length === 0) return null;

  return {
    ruleId: 'orphaned_approved_proposals',
    label: 'Approved proposals never executed (>48h)',
    severity: SEVERITY.WARN,
    tableName: 'proposed_changes',
    rowCount: stuck.length,
    sample: stuck.slice(0, 5).map(p => ({ page: p.page_url, type: p.change_type, approved: p.approved_at })),
    description: 'These proposals were approved but the deploy never happened. Either the executor crashed or the page no longer exists.',
    autoFixable: false,
  };
}

// ============================================================
// RULE 7 — incidents older than 7 days still "open"
// ============================================================
async function ruleStaleIncidents(supabase, clientId) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: incidents } = await supabase.from('incidents')
    .select('id, title, severity, created_at')
    .eq('client_id', clientId).eq('status', 'open')
    .lt('created_at', weekAgo).limit(100);
  if (!incidents || incidents.length === 0) return null;

  return {
    ruleId: 'stale_open_incidents',
    label: 'Incidents stuck "open" for > 7 days',
    severity: SEVERITY.WARN,
    tableName: 'incidents',
    rowCount: incidents.length,
    sample: incidents.slice(0, 5).map(i => ({ title: i.title, severity: i.severity, created: i.created_at })),
    description: 'Old open incidents should either be acted on or resolved. Self-heal auto-resolves after 48h — if these are older, self-heal is not running or has a bug.',
    autoFixable: true,
    autoFix: async () => {
      const ids = incidents.map(i => i.id);
      const { error, count } = await supabase.from('incidents')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolution_notes: 'Auto-resolved by data-integrity audit (stale > 7 days)' }, { count: 'exact' })
        .in('id', ids);
      if (error) throw new Error(error.message);
      return { fixed: count || ids.length };
    },
  };
}

// ============================================================
// RULE 8 — social_posts stuck as draft > 30 days
// ============================================================
async function ruleDraftSocialPosts(supabase, clientId) {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: drafts } = await supabase.from('social_posts')
    .select('id, platform, created_at, caption')
    .eq('client_id', clientId).eq('status', 'draft')
    .lt('created_at', monthAgo).limit(100);
  if (!drafts || drafts.length === 0) return null;

  return {
    ruleId: 'abandoned_social_drafts',
    label: 'Social post drafts older than 30 days',
    severity: SEVERITY.INFO,
    tableName: 'social_posts',
    rowCount: drafts.length,
    sample: drafts.slice(0, 5).map(d => ({ platform: d.platform, created: d.created_at, preview: (d.caption || '').slice(0, 60) })),
    description: 'Forgotten draft posts. Either schedule them, edit them, or delete them.',
    autoFixable: false,
  };
}

// ============================================================
// RULE 9 — backlinks with nonsensical timestamps
// ============================================================
async function ruleCorruptBacklinkTimestamps(supabase, clientId) {
  const { data: bad } = await supabase.from('backlinks')
    .select('id, source_domain, first_seen, last_seen')
    .eq('client_id', clientId)
    .not('first_seen', 'is', null).not('last_seen', 'is', null)
    .limit(1000);
  const corrupt = (bad || []).filter(b => new Date(b.first_seen) > new Date(b.last_seen));
  if (corrupt.length === 0) return null;

  return {
    ruleId: 'corrupt_backlink_timestamps',
    label: 'Backlinks where first_seen > last_seen',
    severity: SEVERITY.ERROR,
    tableName: 'backlinks',
    rowCount: corrupt.length,
    sample: corrupt.slice(0, 5).map(b => ({ domain: b.source_domain, first: b.first_seen, last: b.last_seen })),
    description: 'DataForSEO sent contradictory timestamps. Harmless to UI but indicates source data quality.',
    autoFixable: true,
    autoFix: async () => {
      // Swap the timestamps
      let fixed = 0;
      for (const b of corrupt) {
        const { error } = await supabase.from('backlinks')
          .update({ first_seen: b.last_seen, last_seen: b.first_seen })
          .eq('id', b.id);
        if (!error) fixed++;
      }
      return { fixed };
    },
  };
}

// ============================================================
// RULE 10 — campaign_creatives with NULL image_url
// ============================================================
async function ruleEmptyCreatives(supabase, clientId) {
  const { data: campaigns } = await supabase.from('campaigns')
    .select('id').eq('client_id', clientId);
  const campaignIds = (campaigns || []).map(c => c.id);
  if (campaignIds.length === 0) return null;

  const { data: empty } = await supabase.from('campaign_creatives')
    .select('id, campaign_id, format, headline')
    .in('campaign_id', campaignIds)
    .is('image_url', null).limit(100);
  if (!empty || empty.length === 0) return null;

  return {
    ruleId: 'empty_creative_images',
    label: 'Campaign creatives missing image URLs',
    severity: SEVERITY.WARN,
    tableName: 'campaign_creatives',
    rowCount: empty.length,
    sample: empty.slice(0, 5).map(c => ({ format: c.format, headline: (c.headline || '').slice(0, 60) })),
    description: 'Ad creatives without images cannot run on Meta/Google. Either DALL·E generation failed or the URL was never persisted.',
    autoFixable: false,
  };
}

// ============================================================
// RULE 11 — gsc_diagnostics rows where URL now returns 200 + different state
// ------------------------------------------------------------
// Lightweight version: just counts diagnostics older than 30 days — too
// stale to trust. We don't auto-fix; user decides when to re-crawl.
// ============================================================
async function ruleStaleGscDiagnostics(supabase, clientId) {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('gsc_diagnostics')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId).lt('inspected_at', monthAgo);
  if (!count || count === 0) return null;

  return {
    ruleId: 'stale_gsc_diagnostics',
    label: 'GSC diagnostic rows older than 30 days',
    severity: SEVERITY.INFO,
    tableName: 'gsc_diagnostics',
    rowCount: count,
    sample: [],
    description: 'GSC indexing state can change daily. Diagnostics older than 30 days are likely stale. Re-run the GSC batch inspect.',
    autoFixable: false,
  };
}

// ============================================================
// RULE 12 — referring_domains where backlink_count is 0 (orphaned)
// ============================================================
async function ruleOrphanedReferringDomains(supabase, clientId) {
  const { data: orphans } = await supabase.from('referring_domains')
    .select('id, domain').eq('client_id', clientId).eq('backlink_count', 0).limit(100);
  if (!orphans || orphans.length === 0) return null;

  return {
    ruleId: 'orphaned_referring_domains',
    label: 'Referring-domain rows with zero backlinks',
    severity: SEVERITY.INFO,
    tableName: 'referring_domains',
    rowCount: orphans.length,
    sample: orphans.slice(0, 5).map(o => ({ domain: o.domain })),
    description: 'Domains in the table that have no actual backlinks attached. Usually from a failed sync or a deleted backlink. Safe to clean up.',
    autoFixable: true,
    autoFix: async () => {
      const ids = orphans.map(o => o.id);
      const { error, count } = await supabase.from('referring_domains')
        .delete({ count: 'exact' }).in('id', ids);
      if (error) throw new Error(error.message);
      return { fixed: count || ids.length };
    },
  };
}

// ============================================================
// RULE 13 — duplicate credential incidents
// Multiple agents raise the same "GSC credentials missing" incident with
// slightly different titles. Auto-merge: keep oldest, resolve the rest.
// ============================================================
function _serviceKeyOfIncident(title) {
  const t = (title || '').toLowerCase();
  if (t.includes('search console') || t.includes('gsc')) return 'gsc';
  if (t.includes('google ads')) return 'google_ads';
  if (t.includes('google analytics') || t.includes('ga4')) return 'ga4';
  if (t.includes('business profile') || t.includes('gbp')) return 'gbp';
  if (t.includes('instagram')) return 'instagram';
  if (t.includes('facebook')) return 'facebook';
  if (t.includes('meta ')) return 'meta';
  if (t.includes('openai')) return 'openai';
  if (t.includes('anthropic')) return 'anthropic';
  if (t.includes('dataforseo')) return 'dataforseo';
  return null;
}

async function ruleDuplicateCredentialIncidents(supabase, clientId) {
  const { data: openCrit } = await supabase.from('incidents')
    .select('id, title, created_at, severity')
    .eq('client_id', clientId).eq('status', 'open').in('severity', ['critical', 'high']);
  if (!openCrit || openCrit.length === 0) return null;

  const groups = {};
  for (const i of openCrit) {
    const k = _serviceKeyOfIncident(i.title);
    if (!k) continue;
    if (!groups[k]) groups[k] = [];
    groups[k].push(i);
  }
  const duplicates = [];
  for (const list of Object.values(groups)) {
    if (list.length < 2) continue;
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    // Keep oldest; rest are duplicates
    for (let i = 1; i < list.length; i++) duplicates.push({ ...list[i], _keeper_id: list[0].id });
  }
  if (duplicates.length === 0) return null;

  return {
    ruleId: 'duplicate_credential_incidents',
    label: 'Duplicate credential incidents (same service, different wording)',
    severity: SEVERITY.WARN,
    tableName: 'incidents',
    rowCount: duplicates.length,
    sample: duplicates.slice(0, 5).map(d => ({ title: d.title, duplicate_of: d._keeper_id })),
    description: 'Multiple agents created incidents for the same missing credential with slightly different titles. Closing the duplicates, keeping the oldest.',
    autoFixable: true,
    autoFix: async () => {
      const ids = duplicates.map(d => d.id);
      const { error, count } = await supabase.from('incidents')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolution_notes: 'Auto-merged duplicate by data-integrity audit',
        }, { count: 'exact' })
        .in('id', ids);
      if (error) throw new Error(error.message);
      return { fixed: count || ids.length };
    },
  };
}

// ============================================================
// RULE 14 — failed queue items (they pile up and trigger "T7 blocked tasks")
// A failure isn't useful after a retry has succeeded. We delete failed
// queue items older than 6 hours.
// ============================================================
async function ruleStaleFailedQueue(supabase, clientId) {
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data: failed } = await supabase.from('run_queue')
    .select('id, agent_template_id, created_at, error')
    .eq('client_id', clientId).eq('status', 'failed').lt('created_at', sixHoursAgo).limit(500);
  if (!failed || failed.length === 0) return null;

  return {
    ruleId: 'stale_failed_queue',
    label: 'Failed queue items older than 6h',
    severity: SEVERITY.INFO,
    tableName: 'run_queue',
    rowCount: failed.length,
    sample: failed.slice(0, 5).map(f => ({ created: f.created_at, error: (f.error || '').slice(0, 80) })),
    description: 'Old failed queue items accumulate and trigger false "blocked tasks" alerts in System Audit. Retries already succeeded or moved on. Safe to delete.',
    autoFixable: true,
    autoFix: async () => {
      const ids = failed.map(f => f.id);
      const { error, count } = await supabase.from('run_queue')
        .delete({ count: 'exact' }).in('id', ids);
      if (error) throw new Error(error.message);
      return { fixed: count || ids.length };
    },
  };
}

// ============================================================
// Register all rules here. Order doesn't matter.
// ============================================================
const RULES = [
  ruleStaleMissingDomains,
  ruleStaleCompetitorGap,
  ruleStaleLinkOpportunities,
  ruleZombieRuns,
  rulePlaceholderCompetitors,
  ruleOrphanedProposals,
  ruleStaleIncidents,
  ruleDraftSocialPosts,
  ruleCorruptBacklinkTimestamps,
  ruleEmptyCreatives,
  ruleStaleGscDiagnostics,
  ruleOrphanedReferringDomains,
  ruleDuplicateCredentialIncidents,
  ruleStaleFailedQueue,
];

// ============================================================
// Main entry point. Runs every rule for every client (or one client).
// Writes findings to data_integrity_findings with UPSERT on
// (client_id, rule_id) so repeated runs don't duplicate rows.
// ============================================================
export async function runDataIntegrityAudit(supabase, { clientId = null, autoFix = true } = {}) {
  const started = Date.now();

  // Resolve target clients
  let clients;
  if (clientId) {
    const { data } = await supabase.from('clients').select('id, name').eq('id', clientId);
    clients = data || [];
  } else {
    const { data } = await supabase.from('clients').select('id, name');
    clients = data || [];
  }

  const report = {
    started_at: new Date(started).toISOString(),
    clients_checked: clients.length,
    rules_run: RULES.length,
    findings_per_client: {},
    total_findings: 0,
    total_auto_fixed: 0,
    errors: [],
  };

  for (const client of clients) {
    const clientFindings = [];

    for (const rule of RULES) {
      try {
        const finding = await rule(supabase, client.id);
        if (!finding) {
          // Rule passes — mark any prior finding for this rule as stale
          await supabase.from('data_integrity_findings')
            .update({ status: 'fixed', fixed_at: new Date().toISOString() })
            .eq('client_id', client.id).eq('rule_id', rule.name.replace('rule', '').toLowerCase())
            .eq('status', 'open');
          continue;
        }

        let autoFixed = false;
        let fixResult = null;
        if (autoFix && finding.autoFixable && finding.autoFix) {
          try {
            fixResult = await finding.autoFix();
            autoFixed = true;
            report.total_auto_fixed += (fixResult?.fixed || 0);
          } catch (fixErr) {
            report.errors.push({ rule: finding.ruleId, client: client.name, error: `auto-fix failed: ${fixErr.message}` });
          }
        }

        // UPSERT the finding (one row per client+rule)
        const payload = {
          client_id: client.id,
          rule_id: finding.ruleId,
          rule_label: finding.label,
          severity: finding.severity,
          table_name: finding.tableName,
          row_count: finding.rowCount,
          sample: finding.sample || [],
          description: finding.description,
          auto_fixable: finding.autoFixable,
          auto_fixed: autoFixed,
          fixed_at: autoFixed ? new Date().toISOString() : null,
          status: autoFixed ? 'fixed' : 'open',
          last_seen_at: new Date().toISOString(),
        };

        // Try UPSERT first (will fail if unique index missing — fallback to manual check)
        const { data: existing } = await supabase.from('data_integrity_findings')
          .select('id, run_count').eq('client_id', client.id).eq('rule_id', finding.ruleId).maybeSingle();

        if (existing) {
          await supabase.from('data_integrity_findings')
            .update({ ...payload, run_count: (existing.run_count || 0) + 1 })
            .eq('id', existing.id);
        } else {
          await supabase.from('data_integrity_findings').insert(payload);
        }

        clientFindings.push({
          rule: finding.ruleId,
          label: finding.label,
          severity: finding.severity,
          rowCount: finding.rowCount,
          autoFixed,
          fixedCount: fixResult?.fixed || 0,
        });
        report.total_findings++;
      } catch (e) {
        report.errors.push({ rule: rule.name, client: client.name, error: e.message });
      }
    }

    report.findings_per_client[client.name] = clientFindings;
  }

  report.duration_ms = Date.now() - started;
  report.finished_at = new Date().toISOString();
  return report;
}
