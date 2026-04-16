// ============================================================
// GT3 PHASE 2 — KEYWORD SCORING ENGINE
//
// Computes 8 sub-scores + strategic_priority_score per keyword
// using business-type-specific weights. Produces:
//   - scores (0–10 each)
//   - strategic_priority_score (0–100)
//   - output_label (mission_critical → deprioritize)
//   - recommended_action
//   - target_page_type
//   - explanation_he (Hebrew)
//
// Pure function. All decisions are deterministic given the same
// inputs. No LLM, no I/O — this is the truthful, auditable core.
// ============================================================

import { MODIFIERS, detectCity, classifyKeyword } from './intentClassifier.js';
import { matchKeywordToPages } from './pageMatching.js';

const LOW = (s) => (s || '').toLowerCase();
const hasAny = (kw, list) => list.some(t => LOW(kw).includes(LOW(t)));

// ─── 1. Relevance Score (0-10) ──────────────────────────────
// How relevant is this keyword to the customer's actual business?
export function calcRelevance(keyword, { services = [], pageMatchType = 'missing_page', location_match = false } = {}) {
  const kwLow = LOW(keyword);
  let best = 0;

  for (const s of services) {
    const heName = LOW(s.service_name_he || '');
    const enName = LOW(s.service_name || '');
    const matchesHe = heName.length > 2 && kwLow.includes(heName);
    const matchesEn = enName.length > 2 && kwLow.includes(enName);
    if (matchesHe || matchesEn) {
      // Primary service direct match
      if (s.is_primary) { best = Math.max(best, 10); continue; }
      best = Math.max(best, 8);
    }
  }

  // If no direct service match, check for supporting topic signal
  if (best === 0) {
    // Has hire/price/compare intent on an adjacent topic — partial relevance
    if (hasAny(keyword, [...MODIFIERS.hire_now, ...MODIFIERS.price])) best = 3;
    else if (hasAny(keyword, MODIFIERS.informational)) best = 2;
  }

  // Location bonus (small — location alone doesn't make it relevant)
  if (location_match) best = Math.min(10, best + 1);

  // Page match adds confidence
  if (pageMatchType === 'exact_match') best = Math.min(10, best + 1);
  else if (pageMatchType === 'close_match') best = Math.min(10, best + 0.5);

  return Number(Math.min(10, Math.max(0, best)).toFixed(2));
}

// ─── 2. Business Value Score (0-10) ─────────────────────────
// How much real money/leads this keyword represents.
export function calcBusinessValue(keyword, { services = [], conversions = [], intent_type } = {}) {
  let serviceValue = 0;
  const kwLow = LOW(keyword);
  for (const s of services) {
    const heName = LOW(s.service_name_he || '');
    const enName = LOW(s.service_name || '');
    if ((heName.length > 2 && kwLow.includes(heName)) || (enName.length > 2 && kwLow.includes(enName))) {
      serviceValue = Math.max(serviceValue, Number(s.business_value_score ?? 5));
    }
  }
  // 60% from service business value, 40% from conversion alignment
  const primaryConversion = conversions.find(c => c.is_primary) || conversions[0];
  const convValue = Number(primaryConversion?.value_score ?? 5);

  // Intent multiplier: transactional > commercial > informational
  let multiplier = 1.0;
  if (intent_type === 'transactional' || intent_type === 'urgent_local') multiplier = 1.0;
  else if (intent_type === 'commercial') multiplier = 0.75;
  else if (intent_type === 'informational') multiplier = 0.35;
  else if (intent_type === 'brand') multiplier = 0.7;

  const score = (serviceValue * 0.6 + convValue * 0.4) * multiplier;
  return Number(Math.min(10, Math.max(0, score)).toFixed(2));
}

// Profession/occupation markers — presence of these in a keyword
// indicates the searcher is looking for a professional to hire.
const HIRE_PROFESSIONS = [
  'עורך דין', 'עו"ד', 'עו״ד', 'עוד ', 'אינסטלטור', 'חשמלאי', 'מנעולן',
  'רופא', 'רופא שיניים', 'רופאה', 'פסיכולוג', 'מטפל', 'מטפלת', 'בייביסיטר',
  'יועץ', 'יועצת', 'מאמן', 'מאמנת', 'מתווך', 'מתווכת',
  'lawyer', 'attorney', 'plumber', 'electrician', 'locksmith',
  'doctor', 'dentist', 'therapist', 'consultant', 'coach', 'realtor',
];

// ─── 3. Conversion Intent Score (0-10) ──────────────────────
// How close the searcher is to converting.
export function calcConversionIntent(keyword, { services = [], is_local_business = false } = {}) {
  let score = 0;
  const kwLow = LOW(keyword);

  // Service phrase detected
  const hasServicePhrase = services.some(s => {
    const heName = LOW(s.service_name_he || '');
    const enName = LOW(s.service_name || '');
    return (heName.length > 2 && kwLow.includes(heName)) || (enName.length > 2 && kwLow.includes(enName));
  });
  if (hasServicePhrase) score += 3;

  // Profession/occupation marker (strong commercial signal when combined with service/city)
  // A query like "עורך דין גירושין תל אביב" contains a profession + service + city —
  // this is strong commercial investigation, not just early commercial.
  const hasProfession = hasAny(keyword, HIRE_PROFESSIONS);
  if (hasProfession) score += 2;

  // City or near-me signal
  const city = detectCity(keyword);
  if (city && is_local_business) score += 2;

  // Service + City combo → bonus (searcher is looking for a provider at a location)
  if (hasServicePhrase && city && is_local_business) score += 1;

  // Hire-now modifiers ("מומלץ", "ייעוץ", etc.)
  if (hasAny(keyword, MODIFIERS.hire_now)) score += 3;

  // Urgent modifiers
  if (hasAny(keyword, MODIFIERS.urgent)) score += 2;

  // Price intent = moderate (investigating, not ready)
  if (hasAny(keyword, MODIFIERS.price)) score += 1;

  // Pure informational (no service/profession context) — cap it
  if (hasAny(keyword, MODIFIERS.informational) && !hasServicePhrase && !hasProfession) {
    score = Math.min(score, 2);
  }

  return Number(Math.min(10, Math.max(0, score)).toFixed(2));
}

// ─── 4. Local Intent Score (0-10) ───────────────────────────
export function calcLocalIntent(keyword, { is_local_business = false, locations = [] } = {}) {
  if (!is_local_business) {
    // National business — local intent mostly irrelevant
    const city = detectCity(keyword);
    return city ? 2 : 0;
  }

  const city = detectCity(keyword);
  if (!city) {
    // No city name but is_local_business — if the keyword is a direct service match without location, it may still get local traffic
    return 3;
  }

  if (city === 'implied_local') return 7;

  // If the city is in the customer's served locations, strongest
  const servedCities = new Set(locations.map(l => LOW(l.city)));
  if (servedCities.has(LOW(city))) return 10;

  return 7; // city named, but not the customer's primary — still local intent
}

// ─── 5. Demand Score (0-10) ─────────────────────────────────
// Search demand, normalized. We prefer relative demand over raw volume
// because many Hebrew long-tails have 0 reported volume but real demand.
export function calcDemand({ estimated_volume, traffic_potential, cluster_peers_count = 1 } = {}) {
  // Normalize volume on a log scale (0 → 0, 10 → 10000+)
  const vol = Number(estimated_volume) || 0;
  const volScore = vol > 0 ? Math.min(10, Math.log10(vol + 1) * 2.5) : 0;
  // Traffic potential (if ranked #1 — also log-scaled)
  const tp = Number(traffic_potential) || 0;
  const tpScore = tp > 0 ? Math.min(10, Math.log10(tp + 1) * 2.5) : 0;
  // Cluster boost: if the keyword is part of a meaningful cluster, demand is higher
  const clusterBoost = Math.min(2, Math.log10(cluster_peers_count + 1));

  const raw = (volScore * 0.5) + (tpScore * 0.3) + (clusterBoost * 1.0);
  // If we have no data at all, default to 3 (don't zero out unknown keywords)
  if (vol === 0 && tp === 0 && cluster_peers_count <= 1) return 3;
  return Number(Math.min(10, Math.max(0, raw)).toFixed(2));
}

// ─── 6. Win Probability Score (0-10) ────────────────────────
export function calcWinProbability({
  current_position = null,
  page_match_score = 0,
  content_gap_severity = 5,      // 0-10, where 10 = huge gap
  authority_gap_severity = 5,
  local_gap_severity = 5,
  competitor_strength = 5,
} = {}) {
  // rank proximity: closer to top 3 = higher win probability
  let rankProximity;
  if (current_position === null) rankProximity = 2;       // never ranked, unknown
  else if (current_position <= 3) rankProximity = 10;    // already winning → defend
  else if (current_position <= 10) rankProximity = 8;
  else if (current_position <= 20) rankProximity = 5;
  else if (current_position <= 50) rankProximity = 3;
  else rankProximity = 1;

  // Invert gaps (high gap = lower win probability)
  const contentInv = 10 - content_gap_severity;
  const authorityInv = 10 - authority_gap_severity;
  const localInv = 10 - local_gap_severity;
  const competitionInv = 10 - competitor_strength;
  const pageMatch = page_match_score; // already 0-10 from pageMatching.js

  const score =
    rankProximity * 0.25 +
    pageMatch * 0.15 +
    contentInv * 0.15 +
    authorityInv * 0.20 +
    localInv * 0.15 +
    competitionInv * 0.10;

  return Number(Math.min(10, Math.max(0, score)).toFixed(2));
}

// ─── 7. Authority Support Score (0-10) ──────────────────────
// How much this keyword supports HIGH-VALUE mission-critical keywords
// by building topical authority or cluster density.
export function calcAuthoritySupport(keyword, { intent_type, is_primary_target = false, cluster_mission_critical = false } = {}) {
  if (is_primary_target) return 0; // a primary target isn't a "supporter"
  // Informational keywords that feed a mission cluster are the strongest supporters
  if (intent_type === 'informational' && cluster_mission_critical) return 9;
  if (intent_type === 'informational') return 6;
  if (intent_type === 'commercial' && cluster_mission_critical) return 7;
  if (intent_type === 'commercial') return 4;
  if (intent_type === 'brand') return 5;
  // Transactional keywords don't "support" — they ARE targets
  return 2;
}

// ─── 8. Gap Urgency Score (0-10) ────────────────────────────
export function calcGapUrgency({
  current_position = null,
  page_match_type = 'missing_page',
  business_value_score = 0,
  competitor_is_winning = false,
} = {}) {
  let score = 0;

  // Money keyword in the 4-10 zone = urgent push opportunity
  if (current_position !== null && current_position >= 4 && current_position <= 10 && business_value_score >= 7) {
    score = 10;
  } else if (current_position !== null && current_position >= 11 && current_position <= 30 && business_value_score >= 8) {
    score = 7;
  } else if (page_match_type === 'missing_page' && business_value_score >= 7) {
    score = 8;
  } else if (page_match_type === 'weak_match' && business_value_score >= 7) {
    score = 7;
  } else if (competitor_is_winning && business_value_score >= 7) {
    score = Math.max(score, 9);
  } else if (business_value_score >= 5) {
    score = 5;
  } else {
    score = 2;
  }

  return Number(Math.min(10, Math.max(0, score)).toFixed(2));
}

// ─── FINAL: Strategic Priority Score ────────────────────────
export function computeStrategicPriority(subScores, weights) {
  const weighted =
    subScores.relevance_score * weights.relevance_weight +
    subScores.business_value_score * weights.business_value_weight +
    subScores.conversion_intent_score * weights.conversion_intent_weight +
    subScores.local_intent_score * weights.local_intent_weight +
    subScores.demand_score * weights.demand_weight +
    subScores.win_probability_score * weights.win_probability_weight +
    subScores.authority_support_score * weights.authority_support_weight +
    subScores.gap_urgency_score * weights.gap_urgency_weight;

  return Number((weighted * 10).toFixed(2));  // scale to 0-100
}

// ─── Output Label (from spec) ───────────────────────────────
export function outputLabel(strategic_priority_score) {
  if (strategic_priority_score >= 90) return 'mission_critical';
  if (strategic_priority_score >= 75) return 'high_priority';
  if (strategic_priority_score >= 60) return 'strategic_support';
  if (strategic_priority_score >= 40) return 'low_priority';
  return 'deprioritize';
}

// ─── Recommended Action (from spec's 6 decision rules) ──────
export function recommendedAction({
  output_label, current_position, page_match_type, authority_support_score,
  local_intent_score, is_local_business, has_weak_local_signals, organic_ctr_low,
  authority_gap_high,
}) {
  // Rule 1: High score + missing page → build new page
  if (['mission_critical','high_priority'].includes(output_label) && page_match_type === 'missing_page') {
    return 'build_new_page';
  }
  // Rule 2: High score + partial page → improve existing
  if (['mission_critical','high_priority'].includes(output_label) &&
      ['partial_match','weak_match','close_match'].includes(page_match_type)) {
    return 'improve_page';
  }
  // Rule 3: Rank 4-10 → push to top 3
  if (current_position !== null && current_position >= 4 && current_position <= 10) {
    return 'push_to_top_3';
  }
  // Rule 4: In top 3 → defend
  if (current_position !== null && current_position <= 3) {
    return 'defend';
  }
  // Rule 5: High authority support → expand cluster
  if (authority_support_score >= 8) {
    return 'expand_support_cluster';
  }
  // Rule 6: Local-heavy + weak local signals → strengthen local
  if (is_local_business && local_intent_score >= 7 && has_weak_local_signals) {
    return 'strengthen_local_signals';
  }
  // Rule 7: Good rank + low CTR
  if (current_position !== null && current_position <= 5 && organic_ctr_low) {
    return 'improve_ctr';
  }
  // Rule 8: High authority gap on a mission keyword
  if (authority_gap_high && ['mission_critical','high_priority'].includes(output_label)) {
    return 'earn_authority_links';
  }
  // Low priority default
  if (output_label === 'deprioritize' || output_label === 'low_priority') return 'deprioritize';
  return 'improve_page';
}

// ─── Target page type recommendation ────────────────────────
export function targetPageType({ intent_type, is_local_business, detected_city, is_brand_term }) {
  if (is_brand_term) return 'homepage';
  if (intent_type === 'informational') return 'supporting_article';
  if (intent_type === 'transactional' && is_local_business && detected_city) return 'location_service_page';
  if (intent_type === 'transactional' || intent_type === 'commercial') return 'primary_service_page';
  if (intent_type === 'urgent_local' && is_local_business) return 'local_landing_page';
  return 'primary_service_page';
}

// ─── Hebrew explanation generator ───────────────────────────
export function explanationHe({
  output_label, recommended_action, current_position,
  business_value_score, relevance_score, intent_type, detected_city, page_match_type,
}) {
  const parts = [];

  // Why this matters
  if (output_label === 'mission_critical') parts.push('ביטוי מסחרי ראשי עם חשיבות עסקית גבוהה.');
  else if (output_label === 'high_priority') parts.push('ביטוי חשוב במסלול להמרות איכותיות.');
  else if (output_label === 'strategic_support') parts.push('ביטוי תומך שמחזק את הסמכות הנושאית.');

  if (relevance_score >= 9) parts.push('התאמה ישירה לשירות הראשי.');
  else if (relevance_score >= 7) parts.push('התאמה חזקה לשירות משני.');

  if (intent_type === 'transactional') parts.push('כוונת שכירה ברורה.');
  else if (intent_type === 'urgent_local') parts.push('כוונת פעולה דחופה מקומית.');
  else if (intent_type === 'commercial') parts.push('כוונה מסחרית (בירור/השוואה).');

  if (detected_city && detected_city !== 'implied_local') parts.push(`כוונה מקומית לאזור ${detected_city}.`);

  // Current state
  if (current_position && current_position <= 3) parts.push(`כרגע בטופ 3 (מיקום ${current_position}) — דרוש שמירה.`);
  else if (current_position && current_position <= 10) parts.push(`כרגע במיקום ${current_position} — בטווח השגת טופ 3.`);
  else if (current_position && current_position > 10) parts.push(`כרגע מחוץ לעשירייה (מיקום ${current_position}) — דרוש חיזוק.`);
  else parts.push('טרם מדורג — הזדמנות לבנות מאפס.');

  // Page state
  if (page_match_type === 'missing_page') parts.push('אין עמוד ייעודי — נדרשת בניית דף יעד.');
  else if (page_match_type === 'weak_match' || page_match_type === 'partial_match') parts.push('יש עמוד חלקי — נדרש חיזוק.');
  else if (page_match_type === 'exact_match') parts.push('יש עמוד תואם — נדרש שיפור יעדים ממוקדים.');

  // Action
  const actionLabels = {
    defend: 'הגנה על המיקום ושיפור CTR/סמכות.',
    push_to_top_3: 'דחיפה לטופ 3 דרך חיזוק עמוד, קישורים פנימיים ואותות מקומיים.',
    build_new_page: 'בניית עמוד יעד ייעודי.',
    improve_page: 'שדרוג העמוד הקיים: כותרת, H1, FAQ, CTA, ביקורות.',
    expand_support_cluster: 'הרחבת אשכול תוכן תומך.',
    improve_ctr: 'שיפור כותרת ותיאור מטא ליחס הקלקה גבוה יותר.',
    strengthen_local_signals: 'חיזוק אותות מקומיים: GBP, ביקורות, עמודי אזור.',
    earn_authority_links: 'רכישת קישורים מסמכותיים ואזכורים.',
    deprioritize: 'כרגע לא בעדיפות.',
  };
  parts.push('פעולה מומלצת: ' + (actionLabels[recommended_action] || 'שדרוג והגדלת רלוונטיות.'));

  return parts.join(' ');
}

// ─── ORCHESTRATOR: score one keyword end-to-end ─────────────
// Input:  { keyword, customer, services, locations, conversions, pages, entities, rankings, weights, market_signals }
// Output: complete scoring record ready to INSERT into gt3_keyword_scores
export function scoreKeyword(input) {
  const {
    keyword,
    customer,
    services = [],
    locations = [],
    conversions = [],
    pages = [],
    entities = [],
    rankings = {},           // { current_position, organic_ctr, ... }
    market_signals = {},     // { estimated_volume, traffic_potential, competitor_strength, cluster_peers_count, content_gap, authority_gap, local_gap, has_weak_local_signals, authority_gap_high, competitor_is_winning }
    weights,                 // required: from gt3_business_type_weight_profiles
    is_brand_term = false,
  } = input;

  if (!weights) throw new Error('scoreKeyword: weights required from gt3_business_type_weight_profiles');

  const classification = classifyKeyword(keyword, { services });
  const pageMatch = matchKeywordToPages(keyword, pages, entities);
  const isLocal = !!customer?.is_local_business;

  const relevance_score = calcRelevance(keyword, { services, pageMatchType: pageMatch.match_type, location_match: !!classification.detected_city });
  const business_value_score = calcBusinessValue(keyword, { services, conversions, intent_type: classification.intent_type });
  const conversion_intent_score = calcConversionIntent(keyword, { services, is_local_business: isLocal });
  const local_intent_score = calcLocalIntent(keyword, { is_local_business: isLocal, locations });
  const demand_score = calcDemand({
    estimated_volume: market_signals.estimated_volume,
    traffic_potential: market_signals.traffic_potential,
    cluster_peers_count: market_signals.cluster_peers_count,
  });
  const win_probability_score = calcWinProbability({
    current_position: rankings.current_position,
    page_match_score: pageMatch.match_score,
    content_gap_severity: market_signals.content_gap ?? 5,
    authority_gap_severity: market_signals.authority_gap ?? 5,
    local_gap_severity: market_signals.local_gap ?? 5,
    competitor_strength: market_signals.competitor_strength ?? 5,
  });
  const authority_support_score = calcAuthoritySupport(keyword, {
    intent_type: classification.intent_type,
    is_primary_target: business_value_score >= 8,
    cluster_mission_critical: market_signals.cluster_mission_critical === true,
  });
  const gap_urgency_score = calcGapUrgency({
    current_position: rankings.current_position,
    page_match_type: pageMatch.match_type,
    business_value_score,
    competitor_is_winning: market_signals.competitor_is_winning === true,
  });

  const subScores = {
    relevance_score, business_value_score, conversion_intent_score,
    local_intent_score, demand_score, win_probability_score,
    authority_support_score, gap_urgency_score,
  };

  const strategic_priority_score = computeStrategicPriority(subScores, weights);
  const output_label = outputLabel(strategic_priority_score);
  const recommended_action = recommendedAction({
    output_label,
    current_position: rankings.current_position,
    page_match_type: pageMatch.match_type,
    authority_support_score,
    local_intent_score,
    is_local_business: isLocal,
    has_weak_local_signals: !!market_signals.has_weak_local_signals,
    organic_ctr_low: !!market_signals.organic_ctr_low,
    authority_gap_high: !!market_signals.authority_gap_high,
  });
  const target_page_type = targetPageType({
    intent_type: classification.intent_type,
    is_local_business: isLocal,
    detected_city: classification.detected_city,
    is_brand_term,
  });
  const explanation_he = explanationHe({
    output_label, recommended_action,
    current_position: rankings.current_position,
    business_value_score, relevance_score, intent_type: classification.intent_type,
    detected_city: classification.detected_city,
    page_match_type: pageMatch.match_type,
  });

  return {
    // classification
    intent_type: classification.intent_type,
    funnel_stage: classification.funnel_stage,
    serp_type: classification.serp_type,
    keyword_cluster: classification.keyword_cluster,
    language: classification.language,
    // sub-scores
    ...subScores,
    // final
    strategic_priority_score,
    output_label,
    recommended_action,
    target_page_type,
    explanation_he,
    // page match (needed by downstream systems)
    page_match: pageMatch,
    // inputs for audit trail
    inputs_snapshot: {
      rankings,
      market_signals,
      weights_used: weights,
    },
  };
}
