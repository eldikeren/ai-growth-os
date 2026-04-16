// ============================================================
// TRUTH ENFORCEMENT LAYER
// Every tool output flows through this. Claims unsupported by
// valid data do not pass. The UI is never allowed to display a
// number that lacks source + timestamp + confidence.
// ============================================================

// Canonical envelope shape
// {
//   success: true|false,
//   source: 'gsc'|'ga4'|'dataforseo'|'perplexity'|'google_ads'|'pagespeed'|'scan'|'browser'|'internal',
//   source_asset_id: 'sc-domain:example.com' | GA4 property | ads customer id | url | null,
//   checked_at: ISO timestamp of when the real measurement happened,
//   data_quality: 'valid'|'empty'|'stale'|'invalid'|'misconfigured'|'unverified',
//   freshness_state: 'fresh'|'aging'|'stale'|'unknown',
//   row_count: number,
//   confidence: 0..1,  // composite
//   blocking: boolean, // true means agent MUST NOT treat this as a factual basis
//   blocking_reason: string|null,
//   data: any          // the actual payload
// }

export const DATA_QUALITY = Object.freeze({
  VALID:        'valid',
  EMPTY:        'empty',
  STALE:        'stale',
  INVALID:      'invalid',
  MISCONFIGURED:'misconfigured',
  UNVERIFIED:   'unverified',
});

export const FRESHNESS = Object.freeze({
  FRESH:   'fresh',
  AGING:   'aging',
  STALE:   'stale',
  UNKNOWN: 'unknown',
});

// Freshness thresholds per source (in hours). These control when data
// still counts as actionable truth vs merely reference.
const FRESHNESS_HOURS = {
  gsc:         { fresh: 72, aging: 168 },    // 3d / 7d
  ga4:         { fresh: 48, aging: 168 },
  dataforseo_rankings: { fresh: 168, aging: 720 }, // 7d / 30d
  dataforseo_backlinks:{ fresh: 336, aging: 720 }, // 14d / 30d
  google_ads:  { fresh: 24,  aging: 72 },
  pagespeed:   { fresh: 168, aging: 720 },
  scan:        { fresh: 24,  aging: 168 },
  perplexity:  { fresh: 168, aging: 720 },
  gbp:         { fresh: 48,  aging: 168 },
  browser:     { fresh: 24,  aging: 168 },
  default:     { fresh: 168, aging: 720 },
};

function computeFreshnessState(source, checkedAtIso) {
  if (!checkedAtIso) return FRESHNESS.UNKNOWN;
  const ageH = (Date.now() - new Date(checkedAtIso).getTime()) / 3_600_000;
  const t = FRESHNESS_HOURS[source] || FRESHNESS_HOURS.default;
  if (ageH <= t.fresh)  return FRESHNESS.FRESH;
  if (ageH <= t.aging)  return FRESHNESS.AGING;
  return FRESHNESS.STALE;
}

function computeConfidence({ dataQuality, freshnessState, rowCount, extra = 0 }) {
  if (dataQuality === DATA_QUALITY.INVALID) return 0;
  if (dataQuality === DATA_QUALITY.MISCONFIGURED) return 0;
  if (dataQuality === DATA_QUALITY.UNVERIFIED) return 0.2;
  if (dataQuality === DATA_QUALITY.EMPTY) return 0.1;

  let base = 0.5;
  if (freshnessState === FRESHNESS.FRESH) base = 0.9;
  else if (freshnessState === FRESHNESS.AGING) base = 0.6;
  else if (freshnessState === FRESHNESS.STALE) base = 0.3;

  // Reward non-trivial row counts (a ranking check with 0 rows is weaker than one with 100 rows)
  if (rowCount > 0) base = Math.min(1, base + Math.min(rowCount / 200, 0.05));

  return Math.max(0, Math.min(1, base + extra));
}

/**
 * Wrap a raw tool result in the canonical truth envelope. Every tool output
 * in the system must pass through this function before it reaches an agent
 * or the UI.
 */
export function finalizeToolResult(raw, meta = {}) {
  const {
    source = 'internal',
    source_asset_id = null,
    checked_at = new Date().toISOString(),
    data_quality = null,       // caller may override, otherwise inferred
    row_count = null,
    blocking_reason = null,
    extra_confidence = 0,
  } = meta;

  // Infer data_quality if not explicitly set
  let dataQuality = data_quality;
  if (!dataQuality) {
    if (raw === null || raw === undefined) dataQuality = DATA_QUALITY.EMPTY;
    else if (raw && typeof raw === 'object' && raw.error) dataQuality = DATA_QUALITY.INVALID;
    else if (Array.isArray(raw) && raw.length === 0) dataQuality = DATA_QUALITY.EMPTY;
    else if (raw && typeof raw === 'object' && raw.data && Array.isArray(raw.data) && raw.data.length === 0) dataQuality = DATA_QUALITY.EMPTY;
    else dataQuality = DATA_QUALITY.VALID;
  }

  // Row count
  let rowCount = row_count;
  if (rowCount === null) {
    if (Array.isArray(raw)) rowCount = raw.length;
    else if (raw && Array.isArray(raw.data)) rowCount = raw.data.length;
    else if (raw && Array.isArray(raw.rows)) rowCount = raw.rows.length;
    else rowCount = dataQuality === DATA_QUALITY.VALID ? 1 : 0;
  }

  const freshnessState = computeFreshnessState(source, checked_at);

  // Overage: if we said "valid" but freshness is stale, downgrade to stale
  if (dataQuality === DATA_QUALITY.VALID && freshnessState === FRESHNESS.STALE) {
    dataQuality = DATA_QUALITY.STALE;
  }

  const confidence = computeConfidence({
    dataQuality, freshnessState, rowCount, extra: extra_confidence,
  });

  const blocking = (
    dataQuality === DATA_QUALITY.INVALID ||
    dataQuality === DATA_QUALITY.MISCONFIGURED ||
    dataQuality === DATA_QUALITY.UNVERIFIED ||
    dataQuality === DATA_QUALITY.EMPTY
  );

  const finalBlockingReason = blocking
    ? (blocking_reason || `data_quality_${dataQuality}`)
    : null;

  return {
    success: !blocking && dataQuality !== DATA_QUALITY.STALE,
    source,
    source_asset_id,
    checked_at,
    data_quality: dataQuality,
    freshness_state: freshnessState,
    row_count: rowCount,
    confidence: Number(confidence.toFixed(2)),
    blocking,
    blocking_reason: finalBlockingReason,
    data: raw,
  };
}

// ────────────────────────────────────────────────────────────
// Convenience constructors for specific failure modes
// ────────────────────────────────────────────────────────────
export function envelopeMisconfigured(source, reason, meta = {}) {
  return finalizeToolResult({ error: reason }, {
    source, data_quality: DATA_QUALITY.MISCONFIGURED, blocking_reason: reason, ...meta,
  });
}
export function envelopeInvalid(source, reason, meta = {}) {
  return finalizeToolResult({ error: reason }, {
    source, data_quality: DATA_QUALITY.INVALID, blocking_reason: reason, ...meta,
  });
}
export function envelopeEmpty(source, meta = {}) {
  return finalizeToolResult([], { source, data_quality: DATA_QUALITY.EMPTY, ...meta });
}

// ────────────────────────────────────────────────────────────
// PREFLIGHT VALIDATION
// Called BEFORE any agent run. Verifies the agent has the minimum
// verified data sources available to produce truthful output.
// If preflight fails, the agent run is blocked (no LLM call).
// ────────────────────────────────────────────────────────────
export async function runPreflight(supabase, clientId, agentSlug) {
  const required = PREFLIGHT_REQUIREMENTS[agentSlug];
  if (!required) {
    // Unknown agent — permit (non-blocking defaults)
    return { passed: true, checks: [], blockers: [] };
  }

  const checks = [];
  const blockers = [];

  // Check each required connector
  for (const conn of required.connectors || []) {
    const { data: cred } = await supabase.from('oauth_credentials')
      .select('id, provider, sub_provider, status, last_error, expires_at, selected_property, selected_account')
      .eq('client_id', clientId).eq('provider', conn.provider).maybeSingle();

    let ok = !!cred;
    let reason = null;

    if (!cred) { ok = false; reason = `no_${conn.provider}_credential`; }
    else if (cred.status === 'expired' || cred.status === 'revoked') { ok = false; reason = `${conn.provider}_${cred.status}`; }
    else if (cred.last_error) { ok = false; reason = `${conn.provider}_last_error: ${cred.last_error}`; }
    else if (conn.requires_selection && !(cred.selected_property || cred.selected_account)) {
      ok = false; reason = `${conn.provider}_no_selected_asset`;
    }

    checks.push({ type: 'connector', name: conn.provider, ok, reason });
    if (!ok) blockers.push({ kind: 'connector', provider: conn.provider, reason });
  }

  // Check required client profile fields
  if (required.profile_fields?.length) {
    const { data: profile } = await supabase.from('client_profiles')
      .select('*').eq('client_id', clientId).maybeSingle();
    for (const field of required.profile_fields) {
      const ok = !!(profile && profile[field]);
      checks.push({ type: 'profile', name: field, ok, reason: ok ? null : `missing_${field}` });
      if (!ok) blockers.push({ kind: 'profile', field, reason: `missing_${field}` });
    }
  }

  return {
    passed: blockers.length === 0,
    checks,
    blockers,
    agent_slug: agentSlug,
    client_id: clientId,
    verified_at: new Date().toISOString(),
  };
}

// Per-agent requirements. Start with the most data-intensive agents.
// Agents not listed here have no hard preflight and will run best-effort.
export const PREFLIGHT_REQUIREMENTS = {
  'seo-core-agent': {
    // Needs either GSC or DataForSEO + a domain to analyze
    connectors: [{ provider: 'google', requires_selection: false }],  // GSC auth may be delegated
    profile_fields: ['language'],
  },
  'gsc-daily-monitor': {
    connectors: [{ provider: 'google', requires_selection: true }],
    profile_fields: ['language'],
  },
  'technical-seo-crawl-agent': {
    // Needs target domain. GSC is optional but highly recommended.
    connectors: [],
    profile_fields: ['language'],
  },
  'google-ads-campaign-agent': {
    connectors: [{ provider: 'google_ads', requires_selection: true }],
    profile_fields: [],
  },
  'reviews-gbp-authority-agent': {
    connectors: [{ provider: 'google', requires_selection: true }],
    profile_fields: [],
  },
  'analytics-conversion-integrity-agent': {
    connectors: [{ provider: 'google', requires_selection: true }],
    profile_fields: [],
  },
  'facebook-agent': {
    connectors: [{ provider: 'meta', requires_selection: true }],
    profile_fields: [],
  },
  'instagram-agent': {
    connectors: [{ provider: 'meta', requires_selection: true }],
    profile_fields: [],
  },
};

// ────────────────────────────────────────────────────────────
// OUTPUT VALIDATION
// Checks that the tool results collected during a run actually
// support the claims the agent made. If we have nothing but EMPTY
// and INVALID envelopes, the output should be marked invalid.
// ────────────────────────────────────────────────────────────
export function classifyRunGrounding(toolEnvelopes) {
  const envelopes = (toolEnvelopes || []).filter(e => e && typeof e === 'object');
  if (envelopes.length === 0) {
    return { grounding: 'unsupported', reality_score: 0, reason: 'no_tool_calls' };
  }

  const valid = envelopes.filter(e => e.data_quality === DATA_QUALITY.VALID && !e.blocking);
  const stale = envelopes.filter(e => e.data_quality === DATA_QUALITY.STALE);
  const empty = envelopes.filter(e => e.data_quality === DATA_QUALITY.EMPTY);
  const bad = envelopes.filter(e => [
    DATA_QUALITY.INVALID, DATA_QUALITY.MISCONFIGURED, DATA_QUALITY.UNVERIFIED,
  ].includes(e.data_quality));

  const avgConfidence = envelopes.reduce((s, e) => s + (e.confidence || 0), 0) / envelopes.length;
  const realityScore = Math.round(
    (valid.length * 100 + stale.length * 40) / envelopes.length
  );

  let grounding;
  if (valid.length === 0 && stale.length === 0) grounding = 'unsupported';
  else if (valid.length >= 1) grounding = 'supported';
  else grounding = 'weakly_supported';

  return {
    grounding,
    reality_score: realityScore,
    avg_confidence: Number(avgConfidence.toFixed(2)),
    valid_sources: valid.length,
    stale_sources: stale.length,
    empty_sources: empty.length,
    bad_sources: bad.length,
    total_sources: envelopes.length,
  };
}
