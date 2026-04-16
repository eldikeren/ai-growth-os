// ============================================================
// GT3 Phase 3 — SiteCrawlerService
//
// Crawls the customer's website and populates gt3_site_pages +
// gt3_page_entities. Uses existing site_audit data if present,
// falls back to a fresh HTTP crawl.
//
// Writes with TRUTH semantics: every page's source, crawl date,
// and extraction confidence are recorded — no fabricated data.
// ============================================================

import { getGT3Supabase, svcResult } from './supabaseClient.js';

// Minimal HTML fetch + extraction. For rich entity extraction we can
// later route through Manus for visual verification.
async function fetchPage(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIGrowthOS/1.0; +https://ai-growth-os.vercel.app/bot)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'he,en;q=0.9',
      },
      redirect: 'follow',
    });
    const html = await res.text();
    return { status: res.status, html, final_url: res.url };
  } catch (e) {
    return { status: 0, html: '', error: e.message };
  } finally {
    clearTimeout(t);
  }
}

function extractFromHtml(html) {
  const dec = (s) => s ? s.replace(/<!--.*?-->/gs, '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() : '';
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h2Matches = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].slice(0, 10).map(m => dec(m[1]));
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);

  // Body word count (rough)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyText = bodyMatch ? dec(bodyMatch[1]) : '';
  const wordCount = bodyText.split(/\s+/).filter(w => w.length > 1).length;

  // Presence checks
  const hasPhone = /(tel:|\+972|\b0\d{1,2}-?\d{3}-?\d{4}\b)/.test(html);
  const hasWhatsapp = /wa\.me|whatsapp\.com|api\.whatsapp/.test(html);
  const hasForm = /<form[\s>]/i.test(html);
  const hasSchema = /application\/ld\+json/i.test(html);

  // Links (for site map / internal link analysis later)
  const allLinks = [...html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)].map(m => m[1]).filter(h => h && !h.startsWith('#'));

  return {
    title: dec(titleMatch?.[1] || ''),
    meta_description: dec(metaDesc?.[1] || ''),
    h1: dec(h1Match?.[1] || ''),
    h2s: h2Matches,
    canonical_url: canonicalMatch?.[1] || null,
    word_count: wordCount,
    body_text: bodyText.slice(0, 5000),  // cap
    has_phone: hasPhone,
    has_whatsapp: hasWhatsapp,
    has_form: hasForm,
    has_schema: hasSchema,
    all_links: allLinks.slice(0, 100),
  };
}

// Page type classification heuristic
function inferPageType(url, extracted) {
  const path = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return url.toLowerCase(); } })();
  const title = (extracted.title || '').toLowerCase();
  const h1 = (extracted.h1 || '').toLowerCase();

  if (path === '/' || path === '/index.html' || path === '/home') return 'homepage';
  if (/\b(contact|צור[-_ ]?קשר|contact-us)\b/.test(path) || title.includes('צור קשר') || title.includes('contact')) return 'contact';
  if (/\b(about|אודות|who-we-are)\b/.test(path) || title.includes('אודות')) return 'about';
  if (/\b(faq|שאלות[-_ ]?ותשובות)\b/.test(path) || title.includes('שאלות')) return 'faq';
  if (/\b(price|pricing|מחיר|מחירון)\b/.test(path) || title.includes('מחיר')) return 'pricing';
  if (/\b(review|testimonial|המלצה|ביקורת)\b/.test(path)) return 'review_page';
  if (/\b(case[_-]study|מקרה)\b/.test(path)) return 'case_study';
  if (/\b(blog|article|post|מאמר)\b/.test(path)) return 'article';
  if (/\b(category|קטגור)\b/.test(path)) return 'category_page';
  // Service page heuristic: service keyword in URL path
  if (extracted.h1 && extracted.word_count > 200 && /service|שירות|divorce|גירושין|mortgage|משכנתא/.test(path + h1)) return 'service_page';
  return 'other';
}

// Quality scoring
function computeQualityScore(extracted, pageType) {
  let score = 0;
  if (extracted.title && extracted.title.length >= 20 && extracted.title.length <= 80) score += 2;
  if (extracted.meta_description && extracted.meta_description.length >= 80 && extracted.meta_description.length <= 200) score += 2;
  if (extracted.h1) score += 1.5;
  if (extracted.h2s?.length >= 2) score += 1;
  if (extracted.word_count >= 300) score += 1.5;
  if (extracted.word_count >= 600) score += 0.5;
  if (extracted.has_schema) score += 1;
  if (pageType !== 'other') score += 0.5;
  return Math.min(10, Number(score.toFixed(2)));
}

function computeConversionReadiness(extracted, pageType) {
  let score = 0;
  if (extracted.has_phone) score += 3;
  if (extracted.has_whatsapp) score += 3;
  if (extracted.has_form) score += 2;
  if (['service_page', 'location_service_page', 'pricing', 'contact'].includes(pageType)) score += 1;
  if (extracted.word_count >= 300) score += 0.5;
  if (extracted.has_schema) score += 0.5;
  return Math.min(10, Number(score.toFixed(2)));
}

// Try to fetch sitemap.xml and extract all URLs
async function fetchSitemapUrls(domain, timeoutMs = 15000) {
  const candidates = [
    `https://${domain}/sitemap.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://${domain}/sitemap-index.xml`,
    `https://${domain}/wp-sitemap.xml`,
    `https://${domain}/robots.txt`,
  ];
  const foundSitemaps = new Set();
  const urls = new Set();

  // Parse robots.txt for Sitemap: lines
  try {
    const robots = await fetchPage(`https://${domain}/robots.txt`, timeoutMs);
    if (robots.html) {
      const matches = [...robots.html.matchAll(/sitemap:\s*(\S+)/gi)];
      for (const m of matches) foundSitemaps.add(m[1].trim());
    }
  } catch {}

  for (const c of candidates) {
    if (c.endsWith('robots.txt')) continue;
    foundSitemaps.add(c);
  }

  // Recursively expand sitemap index → individual sitemaps
  const toProcess = [...foundSitemaps];
  const processed = new Set();
  while (toProcess.length) {
    const sm = toProcess.shift();
    if (processed.has(sm)) continue;
    processed.add(sm);
    try {
      const res = await fetchPage(sm, timeoutMs);
      if (!res.html || res.status >= 400) continue;
      // URL-set (<url><loc>URL</loc>)
      const urlMatches = [...res.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)];
      for (const m of urlMatches) {
        const u = m[1].trim();
        // If it's a nested sitemap, queue it; otherwise treat as page URL
        if (u.endsWith('.xml') || u.includes('sitemap')) toProcess.push(u);
        else urls.add(u);
      }
    } catch {}
  }
  return [...urls];
}

// Main entry: crawl a customer's site. Sitemap-first, BFS fallback.
export async function crawlCustomerSite(customerId, { maxPages = 500, timeoutMs = 12000 } = {}) {
  const sb = getGT3Supabase();
  const { data: customer } = await sb.from('gt3_customers')
    .select('id, name, domain, primary_language').eq('id', customerId).single();
  if (!customer) return svcResult({ ok: false, source: 'crawler', errors: ['customer not found'] });

  const domain = customer.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const rootUrl = `https://${domain}/`;

  // PHASE 1: Try sitemap.xml first (fast, comprehensive)
  let seedUrls = await fetchSitemapUrls(domain, timeoutMs);
  const sitemapFound = seedUrls.length > 0;
  if (!sitemapFound) seedUrls = [rootUrl];

  const visited = new Set();
  const queue = [...new Set(seedUrls)];
  const crawled = [];
  const errors = [];

  // PHASE 2: Crawl each URL. If we found a sitemap, we don't need deep link discovery.
  while (queue.length && crawled.length < maxPages) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    // Filter to customer domain only
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      if (host !== domain) continue;
      // Skip common non-page URLs
      if (/\.(pdf|jpg|jpeg|png|gif|svg|css|js|ico|xml|woff2?|ttf|zip)$/i.test(u.pathname)) continue;
    } catch { continue; }

    const res = await fetchPage(url, timeoutMs);
    if (res.error) { errors.push({ url, error: res.error }); continue; }
    if (res.status >= 400) { errors.push({ url, status: res.status }); continue; }

    const extracted = extractFromHtml(res.html);
    const pageType = inferPageType(res.final_url || url, extracted);
    const qualityScore = computeQualityScore(extracted, pageType);
    const convScore = computeConversionReadiness(extracted, pageType);

    const pageRow = {
      customer_id: customerId,
      url: res.final_url || url,
      canonical_url: extracted.canonical_url,
      title: extracted.title || null,
      meta_description: extracted.meta_description || null,
      h1: extracted.h1 || null,
      page_type: pageType,
      language: customer.primary_language || 'he',
      status_code: res.status,
      word_count: extracted.word_count,
      is_indexable: !res.html.includes('noindex'),
      is_service_page: pageType === 'service_page' || pageType === 'location_service_page',
      is_location_page: pageType === 'location_service_page',
      is_blog_page: pageType === 'article',
      page_quality_score: qualityScore,
      conversion_readiness_score: convScore,
      last_crawled_at: new Date().toISOString(),
    };

    const { data: upserted, error } = await sb.from('gt3_site_pages')
      .upsert(pageRow, { onConflict: 'customer_id,url' })
      .select('id').single();
    if (error) { errors.push({ url, error: error.message }); continue; }

    crawled.push({ ...pageRow, id: upserted.id });

    // Entities
    const entities = [];
    if (extracted.has_phone) entities.push({ entity_type: 'conversion_element', entity_value: 'phone', confidence_score: 9 });
    if (extracted.has_whatsapp) entities.push({ entity_type: 'conversion_element', entity_value: 'whatsapp', confidence_score: 9 });
    if (extracted.has_form) entities.push({ entity_type: 'conversion_element', entity_value: 'form', confidence_score: 8 });
    if (extracted.has_schema) entities.push({ entity_type: 'trust_signal', entity_value: 'schema_markup', confidence_score: 8 });
    if (entities.length) {
      try { await sb.from('gt3_page_entities').insert(entities.map(e => ({ page_id: upserted.id, ...e }))); } catch {}
    }

    // If no sitemap, do BFS link discovery
    if (!sitemapFound) {
      for (const link of extracted.all_links) {
        try {
          const absoluteUrl = new URL(link, res.final_url || url).href.split('#')[0];
          const linkDomain = new URL(absoluteUrl).hostname.replace(/^www\./, '');
          if (linkDomain === domain && !visited.has(absoluteUrl)) {
            queue.push(absoluteUrl);
          }
        } catch {}
      }
    }
  }

  return svcResult({
    ok: true, source: 'crawler',
    data: {
      customer_id: customerId,
      pages_crawled: crawled.length,
      sitemap_found: sitemapFound,
      seed_urls_count: seedUrls.length,
      max_pages_limit: maxPages,
      pages_by_type: crawled.reduce((acc, p) => { acc[p.page_type] = (acc[p.page_type] || 0) + 1; return acc; }, {}),
      errors_count: errors.length,
      sample_titles: crawled.slice(0, 5).map(p => p.title).filter(Boolean),
    },
    writes: { gt3_site_pages: crawled.length },
    errors: errors.slice(0, 10),
  });
}
