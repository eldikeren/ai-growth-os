// ============================================================
// GT3 PHASE 2 — INTENT CLASSIFIER
//
// Classifies a keyword's intent_type, funnel_stage, serp_type,
// and local presence. Works in Hebrew (primary) and English.
//
// Pure function. No I/O. No side effects.
// ============================================================

// ─── Hebrew + English intent modifiers (the real ones that mean business) ──
export const MODIFIERS = {
  // "hire now" / "contact now" — strongest commercial intent
  hire_now: [
    'מומלץ', 'יועץ', 'ייעוץ', 'פגישה', 'יצירת קשר', 'להזמנה', 'להזמין',
    'לפנייה', 'לשיחה', 'להתקשר', 'לוואטסאפ',
    'recommended', 'contact', 'hire', 'book', 'appointment', 'consultation',
  ],
  // urgent local intent
  urgent: [
    'חירום', 'דחוף', 'מיידי', 'עכשיו', '24/7', 'קרוב אליי', 'באזור',
    'emergency', 'urgent', 'now', '24/7', 'near me',
  ],
  // pricing investigation (commercial but not ready-to-buy)
  price: [
    'מחיר', 'מחירים', 'עולה', 'עלות', 'כמה', 'תעריף',
    'price', 'cost', 'how much', 'rate',
  ],
  // comparison / research
  compare: [
    'לעומת', 'הבדל בין', 'מומלצים', 'הטובים ביותר', 'איזה', 'מה עדיף',
    'vs', 'versus', 'best', 'top', 'which',
  ],
  // informational (how to / what is)
  informational: [
    'איך', 'מה זה', 'מהו', 'מהי', 'מתי', 'למה', 'האם',
    'how', 'what is', 'what are', 'why', 'when',
  ],
};

// ─── Israeli cities / regions (non-exhaustive, seed set) ──────
// Used to detect local intent. Can be enriched from gt3_customer_locations.
export const IL_CITIES_HE = [
  'תל אביב', 'ירושלים', 'חיפה', 'רמת גן', 'גבעתיים', 'הרצליה', 'רעננה',
  'פתח תקווה', 'ראשון לציון', 'חולון', 'בת ים', 'אשדוד', 'אשקלון',
  'נתניה', 'כפר סבא', 'רחובות', 'ראש העין', 'קרית אונו', 'בני ברק',
  'באר שבע', 'אילת', 'טבריה', 'צפת', 'נצרת', 'עכו', 'קריית שמונה',
  'גוש דן', 'השרון', 'מרכז', 'צפון', 'דרום',
];
export const IL_CITIES_EN = [
  'tel aviv', 'jerusalem', 'haifa', 'ramat gan', 'givatayim', 'herzliya',
  'raanana', 'petah tikva', 'rishon lezion', 'holon', 'bat yam', 'ashdod',
  'ashkelon', 'netanya', 'kfar saba', 'rehovot', 'rosh haayin', 'kiryat ono',
  'bnei brak', 'beer sheva', 'eilat', 'tiberias', 'tzfat', 'nazareth', 'akko',
  'kiryat shmona', 'gush dan',
];

// ─── Helper: detect tokens in keyword ─────────────────────────
function hasAny(kw, list) {
  const low = kw.toLowerCase();
  return list.some(t => low.includes(t.toLowerCase()));
}

export function detectCity(keyword) {
  const low = keyword.toLowerCase();
  for (const city of IL_CITIES_HE) if (keyword.includes(city)) return city;
  for (const city of IL_CITIES_EN) if (low.includes(city)) return city;
  // "near me" / "קרוב אליי" implies local intent without naming a city
  if (hasAny(keyword, MODIFIERS.urgent.filter(m => m.includes('near') || m.includes('אליי') || m.includes('באזור')))) {
    return 'implied_local';
  }
  return null;
}

// ─── Detect language (Hebrew vs Latin) ────────────────────────
export function detectLanguage(keyword) {
  if (!keyword) return 'unknown';
  if (/[\u0590-\u05FF]/.test(keyword)) return 'he';
  if (/[a-zA-Z]/.test(keyword)) return 'en';
  return 'unknown';
}

// ─── Intent type classification ───────────────────────────────
export function classifyIntent(keyword, { services = [] } = {}) {
  const servicesMatched = services.some(s => {
    const name = (s.service_name_he || s.service_name || '').toLowerCase();
    return name.length > 2 && keyword.toLowerCase().includes(name);
  });
  const city = detectCity(keyword);
  const hasHireIntent = hasAny(keyword, MODIFIERS.hire_now);
  const hasUrgent = hasAny(keyword, MODIFIERS.urgent);
  const hasPrice = hasAny(keyword, MODIFIERS.price);
  const hasInfo = hasAny(keyword, MODIFIERS.informational);

  if (hasUrgent && (city || servicesMatched)) return 'urgent_local';
  if (hasInfo) return 'informational';
  if (hasPrice || hasAny(keyword, MODIFIERS.compare)) return 'commercial';
  if (servicesMatched && (hasHireIntent || city)) return 'transactional';
  if (servicesMatched) return 'commercial';
  return 'informational'; // safe default for unknown intent
}

// ─── Funnel stage ─────────────────────────────────────────────
export function classifyFunnelStage(keyword, { intentType, services = [] } = {}) {
  const type = intentType || classifyIntent(keyword, { services });
  if (type === 'transactional' || type === 'urgent_local' || type === 'brand') return 'bottom_of_funnel';
  if (type === 'commercial') return 'middle_of_funnel';
  return 'top_of_funnel';
}

// ─── SERP type heuristic ──────────────────────────────────────
export function classifySerpType(keyword, { isLocalBusiness, intentType }) {
  const city = detectCity(keyword);
  if (isLocalBusiness && city && (intentType === 'transactional' || intentType === 'urgent_local')) return 'local_pack';
  if (intentType === 'informational') return 'informational_articles';
  if (intentType === 'brand') return 'brand_heavy';
  if (intentType === 'commercial' || intentType === 'transactional') return 'organic_services';
  return 'mixed';
}

// ─── Cluster key (group related keywords) ─────────────────────
// Lightweight: uses first matched service + city. Real cluster building
// happens in Phase 3 KeywordDiscoveryService.
export function clusterKey(keyword, { services = [] } = {}) {
  const low = keyword.toLowerCase();
  let primaryService = null;
  for (const s of services) {
    const name = (s.service_name_he || s.service_name || '').toLowerCase();
    if (name.length > 2 && low.includes(name)) { primaryService = name; break; }
  }
  const city = detectCity(keyword);
  if (primaryService && city) return `${primaryService}__${city}`;
  if (primaryService) return primaryService;
  if (city) return `generic__${city}`;
  return 'unclustered';
}

// ─── Full classification in one call ──────────────────────────
export function classifyKeyword(keyword, context = {}) {
  const language = detectLanguage(keyword);
  const intent_type = classifyIntent(keyword, context);
  const funnel_stage = classifyFunnelStage(keyword, { intentType: intent_type, ...context });
  const serp_type = classifySerpType(keyword, { intentType: intent_type, ...context });
  const keyword_cluster = clusterKey(keyword, context);
  const city = detectCity(keyword);
  return {
    language,
    intent_type,
    funnel_stage,
    serp_type,
    keyword_cluster,
    detected_city: city,
    has_hire_intent: hasAny(keyword, MODIFIERS.hire_now),
    has_urgent_intent: hasAny(keyword, MODIFIERS.urgent),
    has_price_intent: hasAny(keyword, MODIFIERS.price),
  };
}
