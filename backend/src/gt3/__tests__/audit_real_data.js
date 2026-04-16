// ============================================================
// Phase 2 audit: run the scoring engine against REAL keywords
// from Supabase (Yaniv Gil + Homie-Finance) and print the
// scoring breakdown. Verify outputs are sensible.
//
// Run: node backend/src/gt3/__tests__/audit_real_data.js
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { scoreKeyword } from '../keywordScoring.js';
import { enforceKeywordInvariants, classifyMissionBucket, selectMission } from '../decisionEngine.js';
import { computeChannelStrategy } from '../channelScoring.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars');
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// Default services per business_type for the audit. Phase 3 will
// populate gt3_customer_services from actual site crawl — for now
// we use reasonable defaults to verify the engine produces sensible
// scores against real keywords.
const DEFAULT_SERVICES = {
  lawyer: [
    { service_name: 'divorce', service_name_he: 'גירושין', is_primary: true, business_value_score: 10 },
    { service_name: 'child custody', service_name_he: 'משמורת ילדים', is_primary: true, business_value_score: 9 },
    { service_name: 'inheritance', service_name_he: 'ירושה', is_primary: true, business_value_score: 9 },
    { service_name: 'inheritance', service_name_he: 'ירושות', is_primary: true, business_value_score: 9 },
    { service_name: 'alimony', service_name_he: 'מזונות', is_primary: true, business_value_score: 8 },
    { service_name: 'will', service_name_he: 'צוואה', is_primary: false, business_value_score: 8 },
    { service_name: 'will', service_name_he: 'צוואות', is_primary: false, business_value_score: 8 },
    { service_name: 'family law', service_name_he: 'דיני משפחה', is_primary: true, business_value_score: 9 },
    { service_name: 'prenup', service_name_he: 'הסכם ממון', is_primary: false, business_value_score: 7 },
    { service_name: 'guardianship', service_name_he: 'אפוטרופוסות', is_primary: false, business_value_score: 7 },
  ],
  consultant: [
    { service_name: 'mortgage', service_name_he: 'משכנתא', is_primary: true, business_value_score: 10 },
    { service_name: 'mortgage advice', service_name_he: 'ייעוץ משכנתא', is_primary: true, business_value_score: 10 },
    { service_name: 'mortgage advice', service_name_he: 'יעוץ משכנתא', is_primary: true, business_value_score: 10 },
    { service_name: 'refinance', service_name_he: 'מחזור משכנתא', is_primary: true, business_value_score: 9 },
    { service_name: 'refinance', service_name_he: 'מחזור', is_primary: false, business_value_score: 8 },
    { service_name: 'financing', service_name_he: 'מימון', is_primary: false, business_value_score: 7 },
    { service_name: 'home loan', service_name_he: 'הלוואה לדיור', is_primary: false, business_value_score: 8 },
  ],
  custom: [],
};

const DEFAULT_LOCATIONS = {
  lawyer: [
    { city: 'תל אביב', is_primary: true },
    { city: 'רמת גן', is_primary: false },
    { city: 'גוש דן', is_primary: false },
    { city: 'מרכז', is_primary: false },
  ],
  consultant: [
    { city: 'מרכז', is_primary: false }, // national lead gen, but serves center
  ],
  custom: [],
};

const DEFAULT_CONVERSIONS = [
  { conversion_type: 'phone_call', is_primary: true, value_score: 10 },
  { conversion_type: 'whatsapp_click', value_score: 8 },
  { conversion_type: 'contact_form', value_score: 7 },
];

async function main() {
  // Load customers
  const { data: customers } = await sb.from('gt3_customers')
    .select('id, name, domain, business_type, business_model, is_local_business, primary_language');
  if (!customers || customers.length === 0) {
    console.error('No customers found. Phase 1 backfill may be missing.');
    process.exit(1);
  }

  // Load business weights (keyed by type)
  const { data: weights } = await sb.from('gt3_business_type_weight_profiles').select('*');
  const weightsByType = Object.fromEntries(weights.map(w => [w.business_type, w]));

  // Load channel profiles
  const { data: channelProfs } = await sb.from('gt3_channel_weight_profiles').select('*');
  const channelProfsByType = {};
  for (const p of channelProfs) {
    if (!channelProfsByType[p.business_type]) channelProfsByType[p.business_type] = [];
    channelProfsByType[p.business_type].push(p);
  }

  const summary = [];
  for (const c of customers) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`AUDITING: ${c.name} (${c.business_type})`);
    console.log('═'.repeat(70));

    // Load keywords for this customer (sample up to 30)
    const { data: keywords } = await sb.from('gt3_keyword_universe')
      .select('id, keyword, normalized_keyword, language, estimated_volume, estimated_difficulty')
      .eq('customer_id', c.id)
      .limit(30);

    // Load rankings (most recent per keyword)
    const { data: rankings } = await sb.from('gt3_keyword_rankings')
      .select('keyword_id, current_position, ranking_type, checked_at');
    const rankingsByKeyword = {};
    for (const r of rankings || []) {
      if (!rankingsByKeyword[r.keyword_id] || new Date(r.checked_at) > new Date(rankingsByKeyword[r.keyword_id].checked_at)) {
        rankingsByKeyword[r.keyword_id] = r;
      }
    }

    const services = DEFAULT_SERVICES[c.business_type] || DEFAULT_SERVICES.custom;
    const locations = DEFAULT_LOCATIONS[c.business_type] || DEFAULT_LOCATIONS.custom;
    const weights = weightsByType[c.business_type];
    const channelProfiles = channelProfsByType[c.business_type] || [];

    const results = [];
    for (const kw of keywords || []) {
      const ranking = rankingsByKeyword[kw.id] || {};
      const raw = scoreKeyword({
        keyword: kw.keyword,
        customer: c,
        services, locations,
        conversions: DEFAULT_CONVERSIONS,
        pages: [], // no site crawl yet
        entities: [],
        rankings: { current_position: ranking.current_position },
        market_signals: {
          estimated_volume: kw.estimated_volume,
          traffic_potential: kw.estimated_volume * 2,
          cluster_peers_count: 1,
        },
        weights,
      });
      const enforced = enforceKeywordInvariants(raw);
      const bucket = classifyMissionBucket(enforced);
      const mission = selectMission(enforced, ranking.current_position);
      const channels = computeChannelStrategy({
        keyword: kw.keyword,
        keyword_score: enforced,
        customer: c,
        channel_profiles: channelProfiles,
      });

      results.push({
        keyword: kw.keyword,
        position: ranking.current_position,
        score: enforced.strategic_priority_score,
        label: enforced.output_label,
        action: enforced.recommended_action,
        bucket: bucket.bucket,
        mission: mission.mission,
        intent: enforced.intent_type,
        relevance: enforced.relevance_score,
        business_value: enforced.business_value_score,
        conversion_intent: enforced.conversion_intent_score,
        local_intent: enforced.local_intent_score,
        channels: [
          channels.use_seo && 'SEO',
          channels.use_local_seo && 'LOCAL',
          channels.use_google_ads && 'GADS',
          channels.use_meta_ads && 'META',
          channels.use_organic_social && 'SOC',
        ].filter(Boolean).join('+'),
      });
    }

    // Sort by score DESC
    results.sort((a, b) => b.score - a.score);

    console.log(`\nTop 15 by strategic priority:`);
    console.log(`${'Score'.padEnd(6)} ${'Label'.padEnd(18)} ${'Mission'.padEnd(10)} ${'Intent'.padEnd(15)} ${'Pos'.padEnd(5)} Chan  Keyword`);
    console.log('─'.repeat(110));
    for (const r of results.slice(0, 15)) {
      console.log(
        `${String(r.score).padEnd(6)}` +
        ` ${r.label.padEnd(18)}` +
        ` ${r.mission.padEnd(10)}` +
        ` ${(r.intent || '').padEnd(15)}` +
        ` ${String(r.position ?? '-').padEnd(5)}` +
        ` ${r.channels.padEnd(20)}` +
        ` ${r.keyword}`
      );
    }

    // Stats
    const byLabel = results.reduce((acc, r) => { acc[r.label] = (acc[r.label] || 0) + 1; return acc; }, {});
    const byMission = results.reduce((acc, r) => { acc[r.mission] = (acc[r.mission] || 0) + 1; return acc; }, {});
    const byBucket = results.reduce((acc, r) => { acc[r.bucket] = (acc[r.bucket] || 0) + 1; return acc; }, {});
    console.log(`\nTotal scored: ${results.length}`);
    console.log(`By label: ${JSON.stringify(byLabel)}`);
    console.log(`By mission: ${JSON.stringify(byMission)}`);
    console.log(`By bucket: ${JSON.stringify(byBucket)}`);
    summary.push({ client: c.name, total: results.length, byLabel, byMission, byBucket });
  }

  console.log('\n\nFINAL SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
