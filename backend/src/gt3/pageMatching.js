// ============================================================
// GT3 PHASE 2 — PAGE MATCHING
//
// Determines whether a keyword has an existing page that serves
// it, and how well that page matches. Drives the "needs new page"
// vs "improve existing page" decision.
//
// Pure function. Input is the keyword + the customer's page set
// (from gt3_site_pages + gt3_page_entities). No I/O here.
// ============================================================

import { detectCity } from './intentClassifier.js';

const MATCH_TYPES = ['exact_match', 'close_match', 'partial_match', 'weak_match', 'missing_page'];

// Tokenize a Hebrew/English string into meaningful tokens
function tokenize(s) {
  if (!s) return [];
  // Split on any non-letter/digit/Hebrew character
  return s.toLowerCase()
    .split(/[^a-z0-9\u0590-\u05FF]+/)
    .filter(t => t.length > 2);
}

function overlap(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const hits = aTokens.filter(t => bSet.has(t)).length;
  return hits / aTokens.length;
}

// Score how well a single page serves a keyword (0-10)
function scorePage(keyword, page, entities = []) {
  const kwTokens = tokenize(keyword);
  const titleTokens = tokenize(page.title);
  const h1Tokens = tokenize(page.h1);
  const metaTokens = tokenize(page.meta_description);
  const urlTokens = tokenize(page.url?.split('/').pop()?.replace(/[.-]/g, ' '));

  // Weighted overlap
  const titleOverlap = overlap(kwTokens, titleTokens);      // most important
  const h1Overlap = overlap(kwTokens, h1Tokens);
  const metaOverlap = overlap(kwTokens, metaTokens);
  const urlOverlap = overlap(kwTokens, urlTokens);

  // Entity matching: does the page have entities matching the keyword's key terms?
  const entityValues = entities.filter(e => e.page_id === page.id).map(e => (e.entity_value || '').toLowerCase());
  const entityHitRate = kwTokens.length ? kwTokens.filter(t => entityValues.some(ev => ev.includes(t))).length / kwTokens.length : 0;

  // City match — if the keyword has a city and the page is a location_service_page for that city
  const city = detectCity(keyword);
  const pageCityMatch = (city && city !== 'implied_local' && (
    page.title?.includes(city) || page.h1?.includes(city) || page.url?.toLowerCase().includes(city.toLowerCase().replace(/\s+/g, '-'))
  )) ? 1 : 0;

  // Page type fit bonus
  const pageTypeBonus = (() => {
    if (page.page_type === 'service_page' && titleOverlap >= 0.5) return 0.8;
    if (page.page_type === 'location_service_page' && pageCityMatch) return 1.0;
    if (page.page_type === 'homepage' && titleOverlap >= 0.7) return 0.5;
    if (page.page_type === 'article' && titleOverlap >= 0.6) return 0.4;
    return 0;
  })();

  // Raw score: weighted combination, scaled to 0-10
  const raw = (
    titleOverlap * 3.5 +
    h1Overlap * 2.0 +
    metaOverlap * 1.0 +
    urlOverlap * 1.0 +
    entityHitRate * 1.5 +
    pageCityMatch * 0.5 +
    pageTypeBonus * 0.5
  );

  return Math.min(10, Math.max(0, raw));
}

export function matchKeywordToPages(keyword, pages, entities = []) {
  if (!pages || pages.length === 0) {
    return {
      match_type: 'missing_page',
      match_score: 0,
      best_page_id: null,
      needs_new_page: true,
      all_candidates: [],
    };
  }

  const scored = pages.map(p => ({
    page_id: p.id,
    page_url: p.url,
    page_type: p.page_type,
    match_score: scorePage(keyword, p, entities),
  })).sort((a, b) => b.match_score - a.match_score);

  const top = scored[0];
  let match_type;
  if (top.match_score >= 8.5) match_type = 'exact_match';
  else if (top.match_score >= 6.5) match_type = 'close_match';
  else if (top.match_score >= 4.0) match_type = 'partial_match';
  else if (top.match_score >= 2.0) match_type = 'weak_match';
  else match_type = 'missing_page';

  return {
    match_type,
    match_score: Number(top.match_score.toFixed(2)),
    best_page_id: match_type === 'missing_page' ? null : top.page_id,
    best_page_url: match_type === 'missing_page' ? null : top.page_url,
    needs_new_page: match_type === 'missing_page' || match_type === 'weak_match',
    all_candidates: scored.slice(0, 5),
  };
}

export { MATCH_TYPES };
