// ============================================================
// GT3 Phase 3 — KeywordDiscoveryService
//
// Builds the keyword universe from 6 sources:
//   1. Site-extracted (titles, H1s, meta)
//   2. Service-generated
//   3. Service + City combinations
//   4. Service + intent modifier
//   5. Informational support (how to / what is)
//   6. Search Console queries (if available)
//
// Writes to gt3_keyword_universe with source_type labeled.
// De-dupes by normalized_keyword.
// ============================================================

import { getGT3Supabase, svcResult } from './supabaseClient.js';
import { MODIFIERS } from '../intentClassifier.js';

function normalize(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Hebrew intent modifier patterns for variation generation
const HE_MODIFIERS = {
  hire: ['מומלץ', 'מומלצים', 'טוב', 'הטובים ביותר'],
  price: ['מחיר', 'מחירים', 'עלות', 'כמה עולה'],
  local: ['באזור', 'קרוב אליי', 'בסביבה'],
  urgent: ['חירום', 'דחוף', 'עכשיו', '24/7'],
  how: ['איך', 'איך בוחרים'],
  what: ['מה זה', 'מהו', 'מהי'],
};

// Common Hebrew profession markers
const HE_PROFESSION_BY_TYPE = {
  lawyer: ['עורך דין', 'עו"ד', 'עו״ד'],
  plumber: ['אינסטלטור'],
  electrician: ['חשמלאי'],
  locksmith: ['מנעולן'],
  therapist: ['מטפל', 'מטפלת', 'פסיכולוג'],
  dentist: ['רופא שיניים'],
  medical_clinic: ['רופא', 'רופאה'],
  realtor: ['מתווך', 'מתווכת'],
  consultant: ['יועץ', 'יועצת'],
  babysitter: ['בייביסיטר', 'מטפלת'],
  musician: ['זמר', 'זמרת', 'להקה'],
  restaurant: ['מסעדה'],
};

export async function discoverKeywords(customerId, { maxPerSource = 50 } = {}) {
  const sb = getGT3Supabase();
  const writes = { gt3_keyword_universe: 0 };
  const stats = { site_extracted: 0, service_generated: 0, location_generated: 0, ai_expanded: 0, search_console: 0 };

  const [customer, services, locations, pages, existingKeywords] = await Promise.all([
    sb.from('gt3_customers').select('*').eq('id', customerId).single().then(r => r.data),
    sb.from('gt3_customer_services').select('*').eq('customer_id', customerId).then(r => r.data || []),
    sb.from('gt3_customer_locations').select('*').eq('customer_id', customerId).then(r => r.data || []),
    sb.from('gt3_site_pages').select('url, title, h1, meta_description').eq('customer_id', customerId).then(r => r.data || []),
    sb.from('gt3_keyword_universe').select('normalized_keyword').eq('customer_id', customerId).then(r => r.data || []),
  ]);

  if (!customer) return svcResult({ ok: false, source: 'discovery', errors: ['customer not found'] });

  const existingSet = new Set(existingKeywords.map(k => k.normalized_keyword));
  const candidates = new Map(); // normalized_keyword → { keyword, source_type }

  function add(raw, source_type) {
    const kw = (raw || '').trim();
    if (!kw || kw.length < 3) return;
    // Skip if it's just a number or single common word
    if (/^\d+$/.test(kw)) return;
    if (kw.split(/\s+/).length === 1 && kw.length < 5) return;  // single short word
    const norm = normalize(kw);
    if (existingSet.has(norm)) return;
    if (candidates.has(norm)) return; // keep first source only
    candidates.set(norm, { keyword: kw, source_type });
  }

  // SOURCE 1: Site-extracted (titles, H1s, cleaned up)
  for (const p of pages) {
    for (const text of [p.title, p.h1]) {
      if (!text) continue;
      // Basic extraction: split title by | or - and take the business-relevant side
      const parts = text.split(/[|–\-]/).map(s => s.trim()).filter(s => s.length > 3 && s.length < 80);
      for (const part of parts) {
        // Skip business name bits
        if (part.toLowerCase().includes(customer.name.toLowerCase().split(' ')[0])) continue;
        add(part, 'site_extracted');
        if (stats.site_extracted++ >= maxPerSource) break;
      }
    }
  }

  // SOURCE 2: Service-generated (primary service words)
  const heProfessions = HE_PROFESSION_BY_TYPE[customer.business_type] || [];
  for (const s of services) {
    const heName = s.service_name_he?.trim();
    const enName = s.service_name?.trim();
    if (heName) {
      add(heName, 'service_generated');
      // Combine with profession markers
      for (const prof of heProfessions) {
        add(`${prof} ${heName}`, 'service_generated');
      }
    }
    if (enName && customer.primary_language === 'en') add(enName, 'service_generated');
    stats.service_generated = candidates.size;
  }

  // SOURCE 3: Service + City combinations
  if (customer.is_local_business && locations.length) {
    for (const s of services.filter(s => s.is_primary)) {
      const heName = s.service_name_he?.trim();
      if (!heName) continue;
      for (const loc of locations) {
        if (!loc.city) continue;
        for (const prof of heProfessions) {
          add(`${prof} ${heName} ${loc.city}`, 'location_generated');
          add(`${prof} ${heName} ב${loc.city}`, 'location_generated');
        }
        add(`${heName} ${loc.city}`, 'location_generated');
      }
      stats.location_generated = candidates.size - stats.service_generated;
    }
  }

  // SOURCE 4: Service + intent modifier (AI-expanded)
  for (const s of services.filter(s => s.is_primary).slice(0, 3)) {
    const heName = s.service_name_he?.trim();
    if (!heName) continue;
    for (const prof of heProfessions.slice(0, 2)) {
      for (const mod of HE_MODIFIERS.hire) add(`${prof} ${heName} ${mod}`, 'ai_expanded');
      for (const mod of HE_MODIFIERS.price.slice(0, 2)) add(`${prof} ${heName} ${mod}`, 'ai_expanded');
    }
  }

  // SOURCE 5: Informational support (how/what questions)
  for (const s of services.filter(s => s.is_primary).slice(0, 3)) {
    const heName = s.service_name_he?.trim();
    if (!heName) continue;
    for (const mod of HE_MODIFIERS.how.slice(0, 2)) add(`${mod} ${heName}`, 'ai_expanded');
    for (const mod of HE_MODIFIERS.what.slice(0, 1)) add(`${mod} ${heName}`, 'ai_expanded');
  }
  stats.ai_expanded = candidates.size - stats.location_generated - stats.service_generated;

  // SOURCE 6: Search Console queries — already in gt3_keyword_universe
  // from backfill (skipped — already counted as search_console).

  // INSERT candidates
  const rows = [...candidates.values()].map(c => ({
    customer_id: customerId,
    keyword: c.keyword,
    normalized_keyword: normalize(c.keyword),
    language: /[\u0590-\u05FF]/.test(c.keyword) ? 'he' : 'en',
    source_type: c.source_type,
  }));

  // Batch insert (100 at a time)
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { data, error } = await sb.from('gt3_keyword_universe')
      .insert(batch)
      .select('id');
    if (!error) inserted += data?.length || 0;
  }
  writes.gt3_keyword_universe = inserted;

  return svcResult({
    ok: true, source: 'discovery',
    data: {
      customer_id: customerId,
      new_keywords: inserted,
      total_candidates: candidates.size,
      already_existed: existingKeywords.length,
      by_source: stats,
    },
    writes,
  });
}
