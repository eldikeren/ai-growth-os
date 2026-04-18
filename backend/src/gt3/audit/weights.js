// Strict GT3 Audit — module weights and scoring helpers
// Spec §17 Audit Score Formula

export const MODULE_WEIGHTS = {
  business_onboarding: 0.08,
  website_crawl: 0.08,
  site_understanding: 0.08,
  keyword_discovery: 0.10,
  keyword_classification: 0.08,
  scoring_engine: 0.12,
  page_matching: 0.07,
  mission_selection: 0.10,
  channel_strategy: 0.10,
  task_engine: 0.07,
  dashboard_output: 0.05,
  data_integrity: 0.05,
  cross_business_adaptation: 0.05,
  reality_check: 0.05,
};

export function computeFinalScore(moduleScores) {
  let total = 0;
  for (const [k, w] of Object.entries(MODULE_WEIGHTS)) {
    const s = Number(moduleScores[k]) || 0;
    total += s * w;
  }
  return Math.round(total * 10) / 10;
}

export function gradeLabel(score) {
  if (score >= 90) return 'Production Ready';
  if (score >= 80) return 'Strong but not safe enough';
  if (score >= 70) return 'Functional but strategically weak';
  if (score >= 50) return 'Partial system, not trustworthy';
  return 'Broken as a GT3 engine';
}

export function overallStatus({ finalScore, hardFailGates }) {
  if (hardFailGates.length > 0) return 'Fail';
  if (finalScore >= 90) return 'Pass';
  if (finalScore >= 80) return 'Conditional Pass';
  if (finalScore >= 70) return 'Conditional Pass';
  return 'Fail';
}
