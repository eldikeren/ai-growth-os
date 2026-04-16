// ============================================================
// GT3 Phase 6 — Brand Demand Signals Service
//
// Measures whether the paid + social layers are actually lifting
// brand demand. If Meta retargeting + Google Ads message testing
// are working, we should see:
//   - branded_search_growth (GSC: queries containing the brand)
//   - direct_traffic_growth (GA4: direct sessions up)
//   - returning_users_growth
//   - branded_ctr_growth (GSC CTR on brand queries)
//   - gbp_views_growth (GBP insights)
//
// Writes time-series points to gt3_brand_demand_signals so the
// mission-level dashboard can show whether campaigns are working.
// ============================================================

import { getGT3Supabase, svcResult } from './supabaseClient.js';

// Extract brand tokens from customer name + domain + brand_aliases
async function getBrandTokens(sb, customerId) {
  const { data: customer } = await sb.from('gt3_customers')
    .select('name, domain, legacy_client_id')
    .eq('id', customerId).single();
  if (!customer) return [];

  const tokens = new Set();
  // Domain stem
  const stem = customer.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('.')[0];
  if (stem.length > 2) tokens.add(stem.toLowerCase());

  // Name tokens
  for (const w of (customer.name || '').toLowerCase()
    .replace(/\b(law firm|law office|finance|consulting|agency|group|ltd|inc|llc|corp)\b/g, '')
    .split(/\s+/).filter(t => t.length > 2)) {
    tokens.add(w);
  }

  // Legacy brand_aliases (from earlier truth work on migration 034)
  if (customer.legacy_client_id) {
    const { data: legacy } = await sb.from('clients')
      .select('brand_aliases').eq('id', customer.legacy_client_id).single();
    for (const a of (legacy?.brand_aliases || [])) {
      if (a && a.length > 2) tokens.add(a.toLowerCase());
    }
  }

  return [...tokens];
}

// Compute a single point-in-time measurement from GSC + GA4 data
// already present in the project's existing tables.
export async function captureBrandSignals(customerId) {
  const sb = getGT3Supabase();

  // Resolve to legacy client_id for cross-referencing existing data sources
  const { data: customer } = await sb.from('gt3_customers')
    .select('id, legacy_client_id').eq('id', customerId).single();
  if (!customer?.legacy_client_id) {
    return svcResult({ ok: false, source: 'brand_signals', warnings: ['no_legacy_client_id'] });
  }
  const legacyId = customer.legacy_client_id;

  const brandTokens = await getBrandTokens(sb, customerId);
  if (!brandTokens.length) return svcResult({ ok: false, source: 'brand_signals', warnings: ['no_brand_tokens'] });

  const writes = { gt3_brand_demand_signals: 0 };
  const signals = [];

  // 1. BRANDED SEARCH GROWTH — count keywords matching brand tokens with rank data
  // We use existing client_keywords as the source of truth for brand searches that
  // the site surfaces for (from GSC).
  try {
    const { data: branded } = await sb.from('client_keywords')
      .select('keyword, current_position, is_brand')
      .eq('client_id', legacyId)
      .eq('is_brand', true);
    const brandedCount = branded?.length || 0;
    signals.push({ signal_type: 'branded_search_growth', signal_value: brandedCount });
  } catch {}

  // 2. RETURNING USERS / DIRECT TRAFFIC / BRANDED CTR — read from baselines if present
  try {
    const { data: baselines } = await sb.from('baselines')
      .select('metric_name, metric_value, recorded_at')
      .eq('client_id', legacyId)
      .in('metric_name', [
        'returning_users_30d', 'direct_sessions_30d',
        'branded_search_impressions', 'branded_search_clicks',
        'gbp_views_30d', 'gbp_profile_views',
      ]);
    for (const b of baselines || []) {
      const value = Number(b.metric_value);
      if (isNaN(value)) continue;
      const map = {
        returning_users_30d: 'returning_users_growth',
        direct_sessions_30d: 'direct_traffic_growth',
        branded_search_impressions: 'branded_search_growth',
        branded_search_clicks: 'branded_ctr_growth',
        gbp_views_30d: 'gbp_views_growth',
        gbp_profile_views: 'gbp_views_growth',
      };
      const signalType = map[b.metric_name];
      if (!signalType) continue;
      signals.push({ signal_type: signalType, signal_value: value });
    }
  } catch {}

  // Insert the signals (preserve history — append, don't upsert)
  if (signals.length > 0) {
    const rows = signals.map(s => ({ customer_id: customerId, ...s, measured_at: new Date().toISOString() }));
    const { error } = await sb.from('gt3_brand_demand_signals').insert(rows);
    if (!error) writes.gt3_brand_demand_signals = rows.length;
  }

  return svcResult({
    ok: true, source: 'brand_signals',
    data: {
      customer_id: customerId,
      brand_tokens: brandTokens,
      signals_captured: signals.length,
      signals_preview: signals,
    },
    writes,
  });
}

// Compute growth trend for a specific signal over the last N days
export async function computeSignalTrend(customerId, signalType, days = 30) {
  const sb = getGT3Supabase();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await sb.from('gt3_brand_demand_signals')
    .select('signal_value, measured_at')
    .eq('customer_id', customerId)
    .eq('signal_type', signalType)
    .gte('measured_at', since)
    .order('measured_at', { ascending: true });

  if (!data || data.length < 2) return { trend: 'insufficient_data', first: null, last: null, change_pct: null };
  const first = Number(data[0].signal_value);
  const last = Number(data[data.length - 1].signal_value);
  if (first === 0) return { trend: last > 0 ? 'emerging' : 'flat', first, last, change_pct: null };
  const change_pct = Number((((last - first) / first) * 100).toFixed(1));
  let trend = 'flat';
  if (change_pct >= 10) trend = 'growing';
  else if (change_pct <= -10) trend = 'declining';
  return { trend, first, last, change_pct, points: data.length };
}
