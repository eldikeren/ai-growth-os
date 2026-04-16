// ============================================================
// GT3 Phase 3 — KeywordScoringService
//
// Orchestrates the Phase 2 pure scoring functions against real
// DB data. For each keyword:
//   1. Loads customer + services + locations + conversions
//   2. Loads pages + entities for page matching
//   3. Loads latest ranking
//   4. Loads business-type weights
//   5. Calls scoreKeyword() + enforceKeywordInvariants()
//   6. UPSERTs gt3_keyword_scores
//   7. UPSERTs gt3_keyword_page_matches with the best match
//   8. Computes channel strategy + UPSERTs gt3_keyword_channel_strategy
// ============================================================

import { getGT3Supabase, svcResult } from './supabaseClient.js';
import { scoreKeyword } from '../keywordScoring.js';
import { enforceKeywordInvariants } from '../decisionEngine.js';
import { computeChannelStrategy } from '../channelScoring.js';

export async function scoreAllKeywords(customerId, { limit = null } = {}) {
  const sb = getGT3Supabase();

  // Load customer context (once)
  const [customer, services, locations, conversions, weights, channelProfs, pages, entities] = await Promise.all([
    sb.from('gt3_customers').select('*').eq('id', customerId).single().then(r => r.data),
    sb.from('gt3_customer_services').select('*').eq('customer_id', customerId).then(r => r.data || []),
    sb.from('gt3_customer_locations').select('*').eq('customer_id', customerId).then(r => r.data || []),
    sb.from('gt3_customer_conversions').select('*').eq('customer_id', customerId).then(r => r.data || []),
    null,
    null,
    sb.from('gt3_site_pages').select('*').eq('customer_id', customerId).then(r => r.data || []),
    sb.from('gt3_page_entities').select('*').then(r => r.data || []),
  ]);

  if (!customer) return svcResult({ ok: false, source: 'scoring', errors: ['customer not found'] });

  const [weightsRes, channelProfsRes] = await Promise.all([
    sb.from('gt3_business_type_weight_profiles').select('*').eq('business_type', customer.business_type).single(),
    sb.from('gt3_channel_weight_profiles').select('*').eq('business_type', customer.business_type),
  ]);
  const businessWeights = weightsRes.data;
  const channelProfiles = channelProfsRes.data || [];

  if (!businessWeights) return svcResult({ ok: false, source: 'scoring', errors: ['no weights for business_type ' + customer.business_type] });

  // Scope entities to this customer's pages only
  const pageIds = new Set(pages.map(p => p.id));
  const scopedEntities = entities.filter(e => pageIds.has(e.page_id));

  // Load keywords (optionally limited for smoke test)
  let q = sb.from('gt3_keyword_universe').select('*').eq('customer_id', customerId);
  if (limit) q = q.limit(limit);
  const { data: keywords } = await q;
  if (!keywords || keywords.length === 0) return svcResult({ ok: true, source: 'scoring', data: { scored: 0 } });

  // Load latest ranking per keyword
  const { data: rankings } = await sb.from('gt3_keyword_rankings')
    .select('keyword_id, current_position, ranking_type, checked_at')
    .in('keyword_id', keywords.map(k => k.id));
  const latestRanking = {};
  for (const r of rankings || []) {
    if (!latestRanking[r.keyword_id] || new Date(r.checked_at) > new Date(latestRanking[r.keyword_id].checked_at)) {
      latestRanking[r.keyword_id] = r;
    }
  }

  // Pre-compute cluster peers (rough: keywords per normalized cluster key)
  // Phase 2 intent classifier already assigns keyword_cluster; we group by that after scoring.

  const scoreRows = [];
  const matchRows = [];
  const strategyRows = [];
  const stats = { scored: 0, errors: [] };

  for (const kw of keywords) {
    try {
      const ranking = latestRanking[kw.id] || {};
      const raw = scoreKeyword({
        keyword: kw.keyword,
        customer,
        services, locations, conversions,
        pages, entities: scopedEntities,
        rankings: { current_position: ranking.current_position },
        market_signals: {
          estimated_volume: kw.estimated_volume,
          traffic_potential: kw.estimated_volume ? Number(kw.estimated_volume) * 2 : null,
          cluster_peers_count: 1, // enriched later
        },
        weights: businessWeights,
      });
      const enforced = enforceKeywordInvariants(raw);

      // Write classification back to gt3_keyword_universe (if changed)
      if (kw.intent_type !== enforced.intent_type || kw.funnel_stage !== enforced.funnel_stage
          || kw.serp_type !== enforced.serp_type || kw.keyword_cluster !== enforced.keyword_cluster) {
        await sb.from('gt3_keyword_universe').update({
          intent_type: enforced.intent_type,
          funnel_stage: enforced.funnel_stage,
          serp_type: enforced.serp_type,
          keyword_cluster: enforced.keyword_cluster,
          updated_at: new Date().toISOString(),
        }).eq('id', kw.id);
      }

      // Score row
      scoreRows.push({
        keyword_id: kw.id,
        relevance_score: enforced.relevance_score,
        business_value_score: enforced.business_value_score,
        conversion_intent_score: enforced.conversion_intent_score,
        local_intent_score: enforced.local_intent_score,
        demand_score: enforced.demand_score,
        win_probability_score: enforced.win_probability_score,
        authority_support_score: enforced.authority_support_score,
        gap_urgency_score: enforced.gap_urgency_score,
        strategic_priority_score: enforced.strategic_priority_score,
        output_label: enforced.output_label,
        recommended_action: enforced.recommended_action,
        target_page_type: enforced.target_page_type,
        explanation_he: enforced.explanation_he,
        scored_at: new Date().toISOString(),
      });

      // Page match row
      if (enforced.page_match) {
        matchRows.push({
          keyword_id: kw.id,
          page_id: enforced.page_match.best_page_id,
          match_type: enforced.page_match.match_type,
          match_score: enforced.page_match.match_score,
          needs_new_page: enforced.page_match.needs_new_page,
        });
      }

      // Channel strategy
      const strategy = computeChannelStrategy({
        keyword: kw.keyword,
        keyword_score: enforced,
        customer,
        channel_profiles: channelProfiles,
      });
      strategyRows.push({
        keyword_id: kw.id,
        customer_id: customerId,
        use_seo: strategy.use_seo,
        use_local_seo: strategy.use_local_seo,
        use_google_ads: strategy.use_google_ads,
        use_meta_ads: strategy.use_meta_ads,
        use_organic_social: strategy.use_organic_social,
        use_remarketing: strategy.use_remarketing,
        seo_goal_he: strategy.seo_goal_he,
        local_seo_goal_he: strategy.local_seo_goal_he,
        google_ads_goal_he: strategy.google_ads_goal_he,
        meta_ads_goal_he: strategy.meta_ads_goal_he,
        organic_social_goal_he: strategy.organic_social_goal_he,
        cross_channel_support_score: strategy.cross_channel_support_score,
        updated_at: new Date().toISOString(),
      });

      stats.scored++;
    } catch (e) {
      stats.errors.push({ keyword: kw.keyword, error: e.message });
    }
  }

  // Batch upserts
  const writes = {};
  for (let i = 0; i < scoreRows.length; i += 100) {
    const batch = scoreRows.slice(i, i + 100);
    await sb.from('gt3_keyword_scores').upsert(batch, { onConflict: 'keyword_id' });
  }
  writes.gt3_keyword_scores = scoreRows.length;

  for (let i = 0; i < matchRows.length; i += 100) {
    const batch = matchRows.slice(i, i + 100);
    await sb.from('gt3_keyword_page_matches').upsert(batch, { onConflict: 'keyword_id,page_id' });
  }
  writes.gt3_keyword_page_matches = matchRows.length;

  for (let i = 0; i < strategyRows.length; i += 100) {
    const batch = strategyRows.slice(i, i + 100);
    await sb.from('gt3_keyword_channel_strategy').upsert(batch, { onConflict: 'keyword_id' });
  }
  writes.gt3_keyword_channel_strategy = strategyRows.length;

  return svcResult({
    ok: true, source: 'scoring',
    data: {
      customer_id: customerId,
      total_keywords: keywords.length,
      scored: stats.scored,
      errors: stats.errors.length,
      business_type: customer.business_type,
    },
    writes,
    errors: stats.errors.slice(0, 10),
  });
}
