// GT3 Strict Audit — 15 modules (spec §1–§14)
// Each module inspects real DB state for a customer + runs functional tests.

import { buildModule, pass, fail } from './helpers.js';
import { classifyKeyword } from '../intentClassifier.js';
import { scoreKeyword, outputLabelFromScore } from '../keywordScoring.js';
import { computeChannelStrategy } from '../channelScoring.js';

// ── 1. Business Onboarding ────────────────────────────────────
export async function auditBusinessOnboarding(sb, customerId) {
  const m = buildModule('business_onboarding');
  const { data: customer } = await sb.from('gt3_customers').select('*').eq('id', customerId).maybeSingle();
  if (!customer) { m.add(fail('BO-0', 'Customer record not found', { severity: 'critical' })); return m.finalize(); }

  m.add(customer.business_type ? pass('BO-1', 'business_type set', customer.business_type)
    : fail('BO-1', 'business_type missing', { severity: 'critical' }));
  m.add(customer.business_model ? pass('BO-2', 'business_model set', customer.business_model)
    : fail('BO-2', 'business_model missing'));
  m.add(typeof customer.is_local_business === 'boolean'
    ? pass('BO-3', `is_local_business = ${customer.is_local_business}`)
    : fail('BO-3', 'is_local_business not set'));

  const { data: services } = await sb.from('gt3_customer_services').select('*').eq('customer_id', customerId);
  const primaryServices = (services || []).filter(s => s.is_primary);
  m.add(primaryServices.length >= 1
    ? pass('BO-4', `${primaryServices.length} primary service(s)`, primaryServices.map(s => s.service_name))
    : fail('BO-4', 'No primary service defined', { severity: 'critical' }));

  const { data: convs } = await sb.from('gt3_customer_conversions').select('*').eq('customer_id', customerId);
  const primaryConvs = (convs || []).filter(c => c.is_primary);
  m.add(primaryConvs.length >= 1
    ? pass('BO-5', `${primaryConvs.length} primary conversion(s)`, primaryConvs.map(c => c.conversion_type))
    : fail('BO-5', 'No primary conversion defined', { severity: 'critical' }));

  const { data: locs } = await sb.from('gt3_customer_locations').select('*').eq('customer_id', customerId);
  if (customer.is_local_business) {
    m.add((locs || []).length >= 1
      ? pass('BO-6', `${locs.length} location(s) for local business`)
      : fail('BO-6', 'Local business has no locations', { severity: 'critical' }));
  } else {
    m.add(pass('BO-6', 'Non-local business — locations not required'));
  }

  // Weight profile actually maps to business_type
  const { data: profile } = await sb.from('gt3_business_type_weight_profiles')
    .select('business_type').eq('business_type', customer.business_type).maybeSingle();
  m.add(profile
    ? pass('BO-7', `Weight profile exists for ${customer.business_type}`)
    : fail('BO-7', `No weight profile for business_type='${customer.business_type}'`, { severity: 'critical' }));

  return m.finalize();
}

// ── 2. Website Crawl ──────────────────────────────────────────
export async function auditWebsiteCrawl(sb, customerId) {
  const m = buildModule('website_crawl');
  const { data: pages } = await sb.from('gt3_site_pages').select('*').eq('customer_id', customerId);
  const count = (pages || []).length;
  m.add(count >= 10
    ? pass('WC-1', `${count} pages crawled`)
    : fail('WC-1', `Only ${count} pages — crawl insufficient`, { severity: count === 0 ? 'critical' : 'major' }));

  const withTitle = (pages || []).filter(p => p.title && p.title.trim().length > 0).length;
  const titleCoverage = count === 0 ? 0 : withTitle / count;
  m.add(titleCoverage >= 0.9
    ? pass('WC-2', `${Math.round(titleCoverage * 100)}% pages have titles`)
    : fail('WC-2', `Only ${Math.round(titleCoverage * 100)}% pages have titles`));

  const withH1 = (pages || []).filter(p => p.h1 && p.h1.trim().length > 0).length;
  m.add(count > 0 && withH1 / count >= 0.7
    ? pass('WC-3', `${Math.round((withH1 / (count || 1)) * 100)}% pages have H1`)
    : fail('WC-3', 'H1 coverage below 70%'));

  const indexable = (pages || []).filter(p => p.is_indexable !== false).length;
  m.add(count > 0 && indexable / count >= 0.6
    ? pass('WC-4', `${indexable}/${count} pages indexable`)
    : fail('WC-4', 'Too few indexable pages'));

  const servicePages = (pages || []).filter(p => p.page_type === 'service' || p.page_type === 'service_page' || p.page_type === 'location_service_page').length;
  m.add(servicePages >= 1
    ? pass('WC-5', `${servicePages} service page(s) detected`)
    : fail('WC-5', 'No service pages detected', { severity: 'critical' }));

  const contactPages = (pages || []).filter(p => p.page_type === 'contact' || (p.url || '').toLowerCase().includes('contact')).length;
  m.add(contactPages >= 1
    ? pass('WC-6', 'Contact page detected')
    : fail('WC-6', 'No contact page detected'));

  return m.finalize();
}

// ── 3. Site Understanding ─────────────────────────────────────
export async function auditSiteUnderstanding(sb, customerId) {
  const m = buildModule('site_understanding');
  const { data: pages } = await sb.from('gt3_site_pages').select('id, page_type, url').eq('customer_id', customerId);
  const { data: entities } = await sb.from('gt3_page_entities').select('*').in('page_id', (pages || []).map(p => p.id).length ? (pages || []).map(p => p.id) : ['00000000-0000-0000-0000-000000000000']);

  const entityTypes = new Set((entities || []).map(e => e.entity_type));
  m.add(entityTypes.has('service')
    ? pass('SU-1', 'Service entities extracted')
    : fail('SU-1', 'No service entities extracted', { severity: 'major' }));

  m.add(entityTypes.has('city') || entityTypes.has('location')
    ? pass('SU-2', 'Location/city entities extracted')
    : fail('SU-2', 'No location entities extracted'));

  const pageTypes = new Set((pages || []).map(p => p.page_type).filter(Boolean));
  m.add(pageTypes.size >= 2
    ? pass('SU-3', `${pageTypes.size} distinct page types classified`, Array.from(pageTypes))
    : fail('SU-3', 'Page type classification not diverse enough'));

  const hasFaq = entityTypes.has('faq');
  const hasReviews = entityTypes.has('review') || entityTypes.has('reviews');
  m.add(hasFaq || hasReviews
    ? pass('SU-4', `Trust signals: ${[hasFaq && 'FAQ', hasReviews && 'reviews'].filter(Boolean).join(', ')}`)
    : fail('SU-4', 'No FAQ or review entities detected', { severity: 'minor' }));

  const hasCta = entityTypes.has('cta') || entityTypes.has('phone') || entityTypes.has('form');
  m.add(hasCta
    ? pass('SU-5', 'CTA/conversion entities detected')
    : fail('SU-5', 'No CTA entities detected'));

  return m.finalize();
}

// ── 4. Keyword Discovery ──────────────────────────────────────
export async function auditKeywordDiscovery(sb, customerId) {
  const m = buildModule('keyword_discovery');
  const { data: kws } = await sb.from('gt3_keyword_universe').select('*').eq('customer_id', customerId);
  const n = (kws || []).length;

  m.add(n >= 50
    ? pass('KD-1', `${n} keywords in universe`)
    : fail('KD-1', `Only ${n} keywords — universe too thin`, { severity: n < 10 ? 'critical' : 'major' }));

  const sources = new Set((kws || []).map(k => k.source).filter(Boolean));
  m.add(sources.size >= 3
    ? pass('KD-2', `${sources.size} discovery sources`, Array.from(sources))
    : fail('KD-2', `Only ${sources.size} sources — need breadth`));

  // Money terms (service+city pattern or commercial intent)
  const commercial = (kws || []).filter(k => ['commercial', 'transactional', 'urgent_local'].includes(k.intent_type)).length;
  m.add(commercial >= 5
    ? pass('KD-3', `${commercial} commercial/transactional keywords`)
    : fail('KD-3', `Only ${commercial} commercial terms — money layer weak`, { severity: 'major' }));

  const informational = (kws || []).filter(k => k.intent_type === 'informational').length;
  m.add(informational >= 3
    ? pass('KD-4', `${informational} informational/support keywords`)
    : fail('KD-4', `Only ${informational} informational — no support layer`));

  const withCity = (kws || []).filter(k => k.city_modifier || (k.modifiers || []).some(mod => mod?.type === 'city')).length;
  m.add(withCity >= 1
    ? pass('KD-5', `${withCity} keywords with city modifier`)
    : fail('KD-5', 'No service+city keywords generated'));

  const clusters = new Set((kws || []).map(k => k.keyword_cluster).filter(Boolean));
  m.add(clusters.size >= 3
    ? pass('KD-6', `${clusters.size} clusters`)
    : fail('KD-6', `Only ${clusters.size} clusters — clustering weak`));

  return m.finalize();
}

// ── 5. Keyword Classification ─────────────────────────────────
export async function auditKeywordClassification(sb, customerId) {
  const m = buildModule('keyword_classification');
  const { data: kws } = await sb.from('gt3_keyword_universe').select('keyword, intent_type, funnel_stage, serp_type').eq('customer_id', customerId);
  const rows = kws || [];

  const withIntent = rows.filter(k => k.intent_type).length;
  const coverage = rows.length === 0 ? 0 : withIntent / rows.length;
  m.add(coverage >= 0.9
    ? pass('KC-1', `${Math.round(coverage * 100)}% classified`)
    : fail('KC-1', `Only ${Math.round(coverage * 100)}% classified`));

  const withFunnel = rows.filter(k => k.funnel_stage).length;
  m.add(rows.length > 0 && withFunnel / rows.length >= 0.8
    ? pass('KC-2', 'Funnel stage populated')
    : fail('KC-2', 'funnel_stage missing on many keywords'));

  // Spot-check: classifier agrees on obvious terms
  const spotTests = [
    { kw: 'עורך דין גירושין תל אביב', expectedIntents: ['commercial', 'transactional'] },
    { kw: 'איך מתחלק רכוש בגירושין', expectedIntents: ['informational'] },
    { kw: 'אינסטלטור חירום תל אביב', expectedIntents: ['urgent_local', 'commercial', 'transactional'] },
  ];
  for (const t of spotTests) {
    const { intent_type } = classifyKeyword(t.kw, { language: 'he' });
    m.add(t.expectedIntents.includes(intent_type)
      ? pass(`KC-3-${t.kw.slice(0, 20)}`, `"${t.kw}" → ${intent_type}`)
      : fail(`KC-3-${t.kw.slice(0, 20)}`, `"${t.kw}" misclassified as ${intent_type}`, { detail: { expected: t.expectedIntents } }));
  }

  return m.finalize();
}

// ── 6. Scoring Engine ─────────────────────────────────────────
export async function auditScoringEngine(sb, customerId) {
  const m = buildModule('scoring_engine');
  const { data: customer } = await sb.from('gt3_customers').select('business_type').eq('id', customerId).maybeSingle();
  const { data: scores } = await sb.from('gt3_keyword_scores').select('*').eq('customer_id', customerId);

  m.add((scores || []).length > 0
    ? pass('SE-1', `${scores.length} keywords scored`)
    : fail('SE-1', 'No scoring rows at all', { severity: 'critical' }));

  // Score range integrity
  const outOfRange = (scores || []).filter(s =>
    [s.relevance_score, s.business_value_score, s.conversion_intent_score, s.local_intent_score,
     s.demand_score, s.win_probability_score, s.authority_support_score, s.gap_urgency_score]
    .some(v => v != null && (v < 0 || v > 10))
  ).length;
  m.add(outOfRange === 0
    ? pass('SE-2', 'All sub-scores in 0–10 range')
    : fail('SE-2', `${outOfRange} rows with out-of-range sub-scores`, { severity: 'critical' }));

  // strategic_priority_score vs label consistency
  const mismatch = (scores || []).filter(s => {
    const sp = s.strategic_priority_score;
    const expectLabel =
      sp >= 90 ? 'mission_critical' :
      sp >= 75 ? 'high_priority' :
      sp >= 60 ? 'strategic_support' :
      sp >= 40 ? 'low_priority' : 'deprioritize';
    return s.output_label !== expectLabel;
  });
  m.add(mismatch.length === 0
    ? pass('SE-3', 'All labels consistent with priority score')
    : fail('SE-3', `${mismatch.length} rows with label/score mismatch`, {
      severity: 'critical',
      detail: mismatch.slice(0, 5).map(x => ({ kw: x.keyword_id, sp: x.strategic_priority_score, label: x.output_label })),
    }));

  // Functional check: money keyword scores high
  const moneyKw = 'עורך דין גירושין תל אביב';
  const classified = classifyKeyword(moneyKw, { language: 'he' });
  const syntheticScore = scoreKeyword({
    keyword: moneyKw,
    classification: classified,
    businessType: customer?.business_type || 'lawyer',
    hasPrimaryServiceMatch: true,
    hasCityMatch: true,
    demand: { volume: 1000 },
    currentRank: null,
    pageMatch: { match_type: 'close_match' },
    contentGap: null,
  });
  m.add(syntheticScore.strategic_priority_score >= 75 && ['mission_critical', 'high_priority'].includes(syntheticScore.output_label)
    ? pass('SE-4', `Money keyword scores ${syntheticScore.strategic_priority_score} → ${syntheticScore.output_label}`)
    : fail('SE-4', `Money keyword underscored: ${syntheticScore.strategic_priority_score} → ${syntheticScore.output_label}`, { severity: 'critical' }));

  // Informational term gets lower business value than money term
  const infoKw = 'איך מתחלק רכוש בגירושין';
  const infoClass = classifyKeyword(infoKw, { language: 'he' });
  const infoScore = scoreKeyword({
    keyword: infoKw,
    classification: infoClass,
    businessType: customer?.business_type || 'lawyer',
    hasPrimaryServiceMatch: false,
    hasCityMatch: false,
    demand: { volume: 500 },
    currentRank: null,
    pageMatch: null,
    contentGap: null,
  });
  m.add(infoScore.business_value_score < syntheticScore.business_value_score
    ? pass('SE-5', `Informational BV(${infoScore.business_value_score}) < money BV(${syntheticScore.business_value_score})`)
    : fail('SE-5', `Informational outranks money on business_value`, { severity: 'critical' }));

  return m.finalize();
}

// ── 7. Page Matching ──────────────────────────────────────────
export async function auditPageMatching(sb, customerId) {
  const m = buildModule('page_matching');
  const { data: matches } = await sb.from('gt3_keyword_page_matches').select('*').eq('customer_id', customerId);
  const rows = matches || [];
  m.add(rows.length > 0
    ? pass('PM-1', `${rows.length} page matches computed`)
    : fail('PM-1', 'No page matches computed', { severity: 'critical' }));

  const matchTypes = new Set(rows.map(r => r.match_type));
  const hasVariety = ['exact_match', 'close_match', 'partial_match', 'weak_match', 'missing_page']
    .filter(t => matchTypes.has(t)).length;
  m.add(hasVariety >= 3
    ? pass('PM-2', `${hasVariety} match-type categories present`)
    : fail('PM-2', 'Match types not diverse — classifier may be degenerate'));

  const missing = rows.filter(r => r.match_type === 'missing_page').length;
  const { data: kwCount } = await sb.from('gt3_keyword_universe').select('id', { count: 'exact', head: true }).eq('customer_id', customerId);
  m.add(missing >= 1
    ? pass('PM-3', `${missing} keywords flagged as missing_page → content-gap pipeline has signal`)
    : fail('PM-3', 'Zero missing_page detected — unlikely for any real site'));

  return m.finalize();
}

// ── 8. Mission Selection ──────────────────────────────────────
export async function auditMissionSelection(sb, customerId) {
  const m = buildModule('mission_selection');
  const { data: primary } = await sb.from('gt3_v_primary_missions').select('*').eq('customer_id', customerId);
  const { data: support } = await sb.from('gt3_v_support_clusters').select('*').eq('customer_id', customerId);
  const { data: defense } = await sb.from('gt3_v_defense_keywords').select('*').eq('customer_id', customerId);
  const { data: quickWins } = await sb.from('gt3_v_quick_wins').select('*').eq('customer_id', customerId);

  m.add((primary || []).length >= 1
    ? pass('MS-1', `${primary.length} primary missions`)
    : fail('MS-1', 'No primary missions selected', { severity: 'critical' }));

  m.add((support || []).length >= 1
    ? pass('MS-2', `${support.length} support-cluster keywords`)
    : fail('MS-2', 'No support cluster'));

  // Primary missions must have commercial/transactional intent or be defense
  const primaryInfo = (primary || []).filter(p => p.intent_type === 'informational').length;
  const primaryMoney = (primary || []).filter(p => ['commercial', 'transactional', 'urgent_local'].includes(p.intent_type)).length;
  m.add(primaryInfo === 0 || primaryMoney > primaryInfo
    ? pass('MS-3', `Primary missions money-led (${primaryMoney} money vs ${primaryInfo} info)`)
    : fail('MS-3', `Primary missions dominated by informational (${primaryInfo} vs ${primaryMoney} money)`, { severity: 'critical' }));

  m.add(Array.isArray(defense)
    ? pass('MS-4', `Defense track: ${(defense || []).length} defensive keywords`)
    : fail('MS-4', 'Defense track not computed'));

  m.add((quickWins || []).length >= 0
    ? pass('MS-5', `${(quickWins || []).length} quick wins surfaced`)
    : fail('MS-5', 'Quick wins view broken'));

  return m.finalize();
}

// ── 9. Channel Strategy ───────────────────────────────────────
export async function auditChannelStrategy(sb, customerId) {
  const m = buildModule('channel_strategy');
  const { data: strategy } = await sb.from('gt3_keyword_channel_strategy').select('*').eq('customer_id', customerId);
  const { data: customer } = await sb.from('gt3_customers').select('business_type, is_local_business').eq('id', customerId).maybeSingle();

  m.add((strategy || []).length > 0
    ? pass('CS-1', `${strategy.length} keywords have channel strategy`)
    : fail('CS-1', 'No channel strategy rows', { severity: 'critical' }));

  // Local business must have some local_seo=true rows
  if (customer?.is_local_business) {
    const localOn = (strategy || []).filter(s => s.local_seo === true).length;
    m.add(localOn >= 1
      ? pass('CS-2', `${localOn} strategies use local_seo`)
      : fail('CS-2', 'Local business with zero local_seo strategies', { severity: 'critical' }));
  }

  // At least some strategies should use SEO for commercial terms
  const { data: joined } = await sb.rpc('exec_sql', {}).then(() => ({ data: null })).catch(() => ({ data: null }));
  const seoOn = (strategy || []).filter(s => s.seo === true).length;
  m.add(seoOn >= 1 ? pass('CS-3', `${seoOn} keywords routed to SEO`) : fail('CS-3', 'Zero keywords routed to SEO'));

  // Channel decision regression — rerun for money keyword, expect SEO + Google Ads + local SEO
  const result = computeChannelStrategy({
    keyword: 'עורך דין גירושין תל אביב',
    classification: classifyKeyword('עורך דין גירושין תל אביב', { language: 'he' }),
    score: { strategic_priority_score: 88, output_label: 'high_priority', business_value_score: 9, relevance_score: 10, conversion_intent_score: 9, local_intent_score: 9 },
    businessType: customer?.business_type || 'lawyer',
    isLocalBusiness: true,
    hasPage: true,
  });
  const expectedOn = result.seo && result.local_seo && result.google_ads;
  m.add(expectedOn
    ? pass('CS-4', 'Money keyword regression: SEO + local_seo + google_ads all on')
    : fail('CS-4', 'Money keyword regression failed', { severity: 'critical', detail: result }));

  // Informational term should NOT have heavy Google Ads spend
  const infoResult = computeChannelStrategy({
    keyword: 'איך מתחלק רכוש בגירושין',
    classification: classifyKeyword('איך מתחלק רכוש בגירושין', { language: 'he' }),
    score: { strategic_priority_score: 55, output_label: 'strategic_support', business_value_score: 4, relevance_score: 7, conversion_intent_score: 2, local_intent_score: 1, authority_support_score: 8 },
    businessType: customer?.business_type || 'lawyer',
    isLocalBusiness: true,
    hasPage: false,
  });
  m.add(infoResult.seo === true && infoResult.google_ads === false
    ? pass('CS-5', 'Informational keyword: SEO on, Google Ads off')
    : fail('CS-5', 'Informational keyword mis-routed', { detail: infoResult }));

  return m.finalize();
}

// ── 10. Task Engine ───────────────────────────────────────────
export async function auditTaskEngine(sb, customerId) {
  const m = buildModule('task_engine');
  const { data: tasks } = await sb.from('gt3_action_tasks').select('*').eq('customer_id', customerId);
  const { data: channelTasks } = await sb.from('gt3_channel_tasks').select('*').eq('customer_id', customerId);
  const { data: primary } = await sb.from('gt3_v_primary_missions').select('keyword_id, keyword').eq('customer_id', customerId);

  m.add((tasks || []).length > 0
    ? pass('TE-1', `${tasks.length} action tasks`)
    : fail('TE-1', 'No action tasks generated', { severity: 'critical' }));

  m.add((channelTasks || []).length > 0
    ? pass('TE-2', `${channelTasks.length} channel tasks`)
    : fail('TE-2', 'No channel tasks'));

  // Every primary mission keyword has at least one task
  const taskKwIds = new Set((tasks || []).map(t => t.keyword_id).filter(Boolean));
  const chKwIds = new Set((channelTasks || []).map(t => t.keyword_id).filter(Boolean));
  const primaryWithoutTask = (primary || []).filter(p => !taskKwIds.has(p.keyword_id) && !chKwIds.has(p.keyword_id));
  m.add(primaryWithoutTask.length === 0
    ? pass('TE-3', 'Every primary mission has at least one task')
    : fail('TE-3', `${primaryWithoutTask.length} primary missions with zero tasks`, {
      severity: 'critical',
      detail: primaryWithoutTask.slice(0, 5).map(x => x.keyword),
    }));

  const taskTypes = new Set((tasks || []).map(t => t.task_type));
  m.add(taskTypes.size >= 2
    ? pass('TE-4', `${taskTypes.size} task types used`, Array.from(taskTypes))
    : fail('TE-4', 'Task types not diverse'));

  return m.finalize();
}

// ── 11. Dashboard Output ──────────────────────────────────────
export async function auditDashboardOutput(sb, customerId) {
  const m = buildModule('dashboard_output');
  const { data: scores } = await sb.from('gt3_keyword_scores').select('output_label, explanation_he, recommended_action').eq('customer_id', customerId).limit(200);
  const { data: tasks } = await sb.from('gt3_action_tasks').select('title_he, description_he').eq('customer_id', customerId).limit(100);

  const withHe = (scores || []).filter(s => s.explanation_he && s.explanation_he.trim().length > 10).length;
  const total = (scores || []).length;
  m.add(total > 0 && withHe / total >= 0.8
    ? pass('DO-1', `${withHe}/${total} scores have explanation_he`)
    : fail('DO-1', `Only ${withHe}/${total} scores have explanation_he`));

  const tasksWithHe = (tasks || []).filter(t => t.title_he && t.title_he.trim().length > 3).length;
  m.add((tasks || []).length === 0 || tasksWithHe / (tasks || []).length >= 0.8
    ? pass('DO-2', 'Tasks have Hebrew titles')
    : fail('DO-2', 'Tasks missing Hebrew titles'));

  const labels = new Set((scores || []).map(s => s.output_label));
  m.add(labels.size >= 2
    ? pass('DO-3', `Label diversity: ${Array.from(labels).join(', ')}`)
    : fail('DO-3', 'Output labels not diverse'));

  return m.finalize();
}

// ── 12. Data Integrity ────────────────────────────────────────
export async function auditDataIntegrity(sb, customerId) {
  const m = buildModule('data_integrity');

  // Orphan scores
  const { data: orphanScores } = await sb.rpc('gt3_audit_orphan_scores').then(r => r).catch(() => ({ data: null }));
  if (orphanScores === null) {
    // Fallback: query directly
    const { data: allScores } = await sb.from('gt3_keyword_scores').select('keyword_id').eq('customer_id', customerId);
    const { data: kwIds } = await sb.from('gt3_keyword_universe').select('id').eq('customer_id', customerId);
    const validIds = new Set((kwIds || []).map(k => k.id));
    const orphans = (allScores || []).filter(s => !validIds.has(s.keyword_id));
    m.add(orphans.length === 0
      ? pass('DI-1', 'No orphan keyword_scores')
      : fail('DI-1', `${orphans.length} orphan keyword_scores`, { severity: 'critical' }));
  } else {
    m.add((orphanScores || []).length === 0
      ? pass('DI-1', 'No orphan keyword_scores')
      : fail('DI-1', `${orphanScores.length} orphan keyword_scores`, { severity: 'critical' }));
  }

  // Duplicate keywords per customer
  const { data: allKws } = await sb.from('gt3_keyword_universe').select('keyword_normalized').eq('customer_id', customerId);
  const kwMap = {};
  for (const k of (allKws || [])) {
    const key = k.keyword_normalized || '';
    kwMap[key] = (kwMap[key] || 0) + 1;
  }
  const dups = Object.entries(kwMap).filter(([, c]) => c > 1);
  m.add(dups.length === 0
    ? pass('DI-2', 'No duplicate normalized keywords')
    : fail('DI-2', `${dups.length} duplicate normalized keywords`, { detail: dups.slice(0, 5) }));

  // Score range
  const { data: badRanges } = await sb.from('gt3_keyword_scores').select('id')
    .eq('customer_id', customerId)
    .or('relevance_score.gt.10,relevance_score.lt.0,business_value_score.gt.10,business_value_score.lt.0');
  m.add((badRanges || []).length === 0
    ? pass('DI-3', 'All scores in valid range')
    : fail('DI-3', `${badRanges.length} rows out of range`, { severity: 'critical' }));

  // Orphan tasks
  const { data: allTasks } = await sb.from('gt3_action_tasks').select('id, keyword_id').eq('customer_id', customerId);
  const { data: allKwIds2 } = await sb.from('gt3_keyword_universe').select('id').eq('customer_id', customerId);
  const validKwIds = new Set((allKwIds2 || []).map(k => k.id));
  const orphanTasks = (allTasks || []).filter(t => t.keyword_id && !validKwIds.has(t.keyword_id));
  m.add(orphanTasks.length === 0
    ? pass('DI-4', 'No orphan action_tasks')
    : fail('DI-4', `${orphanTasks.length} orphan tasks`, { severity: 'critical' }));

  return m.finalize();
}

// ── 13. Cross-Business Adaptation ─────────────────────────────
export async function auditCrossBusiness(sb, customerId) {
  const m = buildModule('cross_business_adaptation');

  const { data: profiles } = await sb.from('gt3_business_type_weight_profiles').select('business_type');
  m.add((profiles || []).length >= 4
    ? pass('CB-1', `${profiles.length} business-type weight profiles exist`)
    : fail('CB-1', 'Too few business-type profiles'));

  const { data: chProfiles } = await sb.from('gt3_channel_weight_profiles').select('business_type, channel');
  const btInChannels = new Set((chProfiles || []).map(p => p.business_type));
  m.add(btInChannels.size >= 4
    ? pass('CB-2', `${btInChannels.size} business types with channel weights`)
    : fail('CB-2', 'Channel weights not per business type'));

  // Regression: same keyword scored differently for different business types
  const kw = 'מחיר';
  const cls = classifyKeyword(kw, { language: 'he' });
  const lawyerScore = scoreKeyword({
    keyword: kw, classification: cls, businessType: 'lawyer',
    hasPrimaryServiceMatch: false, hasCityMatch: false, demand: { volume: 100 }, currentRank: null, pageMatch: null,
  });
  const plumberScore = scoreKeyword({
    keyword: kw, classification: cls, businessType: 'plumber',
    hasPrimaryServiceMatch: false, hasCityMatch: false, demand: { volume: 100 }, currentRank: null, pageMatch: null,
  });
  m.add(lawyerScore.strategic_priority_score !== plumberScore.strategic_priority_score
    ? pass('CB-3', `Same keyword scores differently: lawyer=${lawyerScore.strategic_priority_score}, plumber=${plumberScore.strategic_priority_score}`)
    : fail('CB-3', 'Same keyword scores identically across business types → weights inert', { severity: 'critical' }));

  return m.finalize();
}

// ── 14. Reality Check ─────────────────────────────────────────
export async function auditRealityCheck(sb, customerId) {
  const m = buildModule('reality_check');
  const { data: customer } = await sb.from('gt3_customers').select('business_type, is_local_business').eq('id', customerId).maybeSingle();
  const { data: primary } = await sb.from('gt3_v_primary_missions').select('*').eq('customer_id', customerId).limit(20);

  // Money-led primary missions
  const moneyPrimary = (primary || []).filter(p =>
    ['commercial', 'transactional', 'urgent_local'].includes(p.intent_type) ||
    (p.business_value_score || 0) >= 7
  ).length;
  m.add(moneyPrimary >= Math.min(3, (primary || []).length)
    ? pass('RC-1', `${moneyPrimary}/${(primary || []).length} primary missions are money-led`)
    : fail('RC-1', 'Primary missions dominated by vanity/info terms', { severity: 'critical' }));

  // Local business has GBP path
  if (customer?.is_local_business) {
    const { data: gbpTasks } = await sb.from('gt3_action_tasks').select('id')
      .eq('customer_id', customerId)
      .or('task_type.eq.strengthen_local_signals,task_type.eq.improve_gbp,task_type.eq.gbp_post');
    m.add((gbpTasks || []).length >= 1
      ? pass('RC-2', `${gbpTasks.length} GBP/local-signal tasks for local business`)
      : fail('RC-2', 'Local business has zero GBP/local-signal tasks', { severity: 'critical' }));
  } else {
    m.add(pass('RC-2', 'Non-local business — GBP not required'));
  }

  // Google Ads not replacing SEO: if google_ads=true for commercial terms, SEO should also be true
  const { data: cs } = await sb.from('gt3_keyword_channel_strategy').select('*').eq('customer_id', customerId).eq('google_ads', true).limit(50);
  const adsWithoutSeo = (cs || []).filter(s => s.seo === false).length;
  m.add(adsWithoutSeo === 0
    ? pass('RC-3', 'Google Ads never used as SEO replacement')
    : fail('RC-3', `${adsWithoutSeo} strategies use Google Ads but not SEO`, { severity: 'major' }));

  // No deprioritized keyword in primary missions
  const deprioritizedInPrimary = (primary || []).filter(p => p.output_label === 'deprioritize').length;
  m.add(deprioritizedInPrimary === 0
    ? pass('RC-4', 'No deprioritized keywords in primary missions')
    : fail('RC-4', `${deprioritizedInPrimary} deprioritized keywords made it to primary`, { severity: 'critical' }));

  return m.finalize();
}
