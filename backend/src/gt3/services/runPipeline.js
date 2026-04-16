// ============================================================
// GT3 Phase 3 — Pipeline Orchestrator
//
// Runs the full GT3 pipeline end-to-end for a customer:
//   Onboarding → Crawl → Discovery → Scoring → Mission Planning
//
// Each step is logged with its source, writes, and errors so the
// output is fully auditable.
// ============================================================

import { ensureCustomerProfile } from './CustomerOnboardingService.js';
import { crawlCustomerSite } from './SiteCrawlerService.js';
import { discoverKeywords } from './KeywordDiscoveryService.js';
import { scoreAllKeywords } from './KeywordScoringService.js';
import { planMissions } from './MissionPlannerService.js';

export async function runGT3Pipeline(customerId, options = {}) {
  const {
    skipCrawl = false,
    skipDiscovery = false,
    maxPages = 20,
  } = options;

  const started = Date.now();
  const report = {
    customer_id: customerId,
    started_at: new Date().toISOString(),
    steps: {},
  };

  // 1. Onboarding
  report.steps.onboarding = await ensureCustomerProfile(customerId);

  // 2. Site Crawl
  if (!skipCrawl) {
    report.steps.crawl = await crawlCustomerSite(customerId, { maxPages });
  } else {
    report.steps.crawl = { skipped: true };
  }

  // 3. Keyword Discovery
  if (!skipDiscovery) {
    report.steps.discovery = await discoverKeywords(customerId);
  } else {
    report.steps.discovery = { skipped: true };
  }

  // 4. Scoring
  report.steps.scoring = await scoreAllKeywords(customerId);

  // 5. Mission Planning + Task Generation
  report.steps.mission_planning = await planMissions(customerId);

  report.completed_at = new Date().toISOString();
  report.duration_ms = Date.now() - started;
  report.ok = Object.values(report.steps).every(s => s.ok !== false);
  return report;
}

// CLI entry point: node runPipeline.js <customer_id>
if (import.meta.url === `file://${process.argv[1]}`) {
  const customerId = process.argv[2];
  if (!customerId) {
    console.error('Usage: node runPipeline.js <customer_id>');
    process.exit(1);
  }
  runGT3Pipeline(customerId).then(r => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
