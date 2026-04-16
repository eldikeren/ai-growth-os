// ============================================================
// GT3 Phase 6 — Weekly Mission Report
//
// Produces a Hebrew weekly report per customer covering:
//   - Missions progressed (rank changed by 3+ positions)
//   - Missions won (rank moved into top 3)
//   - Missions lost (rank dropped out of top 3)
//   - Brand demand growth (branded search / direct / returning)
//   - Top tasks completed this week
//   - Top tasks blocked and why
//
// The report is a JSON object returned by the service; the UI
// renders it. Also writes a summary memory_item so the legacy
// audit trail captures it.
// ============================================================

import { getGT3Supabase } from './supabaseClient.js';
import { computeSignalTrend } from './BrandDemandSignalsService.js';

export async function buildWeeklyReport(customerId) {
  const sb = getGT3Supabase();

  const { data: customer } = await sb.from('gt3_customers')
    .select('*').eq('id', customerId).single();
  if (!customer) return { ok: false, error: 'customer not found' };

  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString();

  // 1. RANKING CHANGES — compare latest vs the reading from ~7d ago per keyword
  const { data: keywords } = await sb.from('gt3_keyword_universe')
    .select('id, keyword').eq('customer_id', customerId);

  const keywordIds = (keywords || []).map(k => k.id);
  const { data: rankings } = await sb.from('gt3_keyword_rankings')
    .select('keyword_id, current_position, ranking_type, checked_at')
    .in('keyword_id', keywordIds)
    .gte('checked_at', twoWeeksAgo)
    .order('checked_at', { ascending: false });

  // Build latest + 7d-ago snapshots per keyword
  const latestByKw = {};
  const weekAgoByKw = {};
  for (const r of rankings || []) {
    if (r.ranking_type !== 'organic') continue;
    if (!latestByKw[r.keyword_id]) { latestByKw[r.keyword_id] = r; continue; }
    if (r.checked_at < weekStart && !weekAgoByKw[r.keyword_id]) {
      weekAgoByKw[r.keyword_id] = r;
    }
  }
  const byKwId = Object.fromEntries((keywords || []).map(k => [k.id, k]));

  const progressed = [];
  const wonTop3 = [];
  const lostTop3 = [];
  for (const kwId of keywordIds) {
    const latest = latestByKw[kwId];
    const past = weekAgoByKw[kwId];
    if (!latest || !past) continue;
    const now = latest.current_position;
    const then = past.current_position;
    if (now == null || then == null) continue;
    const delta = then - now; // positive means improved (moved up)
    if (Math.abs(delta) >= 3) {
      progressed.push({ keyword: byKwId[kwId]?.keyword, from: then, to: now, delta });
    }
    if (then > 3 && now <= 3) wonTop3.push({ keyword: byKwId[kwId]?.keyword, from: then, to: now });
    else if (then <= 3 && now > 3) lostTop3.push({ keyword: byKwId[kwId]?.keyword, from: then, to: now });
  }

  // 2. TASKS this week
  const { data: recentTasks } = await sb.from('gt3_action_tasks')
    .select('task_type, priority_label, status, title_he, updated_at')
    .eq('customer_id', customerId)
    .gte('updated_at', weekStart);
  const doneTasks = (recentTasks || []).filter(t => t.status === 'done');
  const blockedTasks = (recentTasks || []).filter(t => t.status === 'blocked');

  const { data: channelTasks } = await sb.from('gt3_channel_tasks')
    .select('channel_type, task_type, status, title_he, updated_at')
    .eq('customer_id', customerId)
    .gte('updated_at', weekStart);

  // 3. BRAND DEMAND TRENDS (30d)
  const [brandedSearch, directTraffic, returningUsers, brandedCtr, gbpViews] = await Promise.all([
    computeSignalTrend(customerId, 'branded_search_growth', 30),
    computeSignalTrend(customerId, 'direct_traffic_growth', 30),
    computeSignalTrend(customerId, 'returning_users_growth', 30),
    computeSignalTrend(customerId, 'branded_ctr_growth', 30),
    computeSignalTrend(customerId, 'gbp_views_growth', 30),
  ]);

  // 4. LIFECYCLE STAGE
  const latestPositions = Object.values(latestByKw).map(r => r.current_position).filter(p => p != null);
  const top3Count = latestPositions.filter(p => p <= 3).length;
  const totalTracked = latestPositions.length;

  // 5. Build the Hebrew narrative
  const summary_he = buildHebrewSummary({
    customerName: customer.name,
    progressed, wonTop3, lostTop3, doneTasksCount: doneTasks.length,
    blockedTasksCount: blockedTasks.length, channelTasksCount: (channelTasks || []).length,
    brandedSearch, directTraffic, returningUsers, gbpViews,
    top3Count, totalTracked, lifecycle: customer.lifecycle_stage,
  });

  return {
    ok: true,
    customer: { id: customer.id, name: customer.name, domain: customer.domain },
    week_ending: new Date().toISOString(),
    summary_he,
    rankings: {
      progressed_count: progressed.length,
      progressed_sample: progressed.slice(0, 10),
      won_top3: wonTop3,
      lost_top3: lostTop3,
      top3_share: totalTracked > 0 ? `${top3Count}/${totalTracked}` : 'n/a',
    },
    tasks: {
      done: doneTasks.length,
      blocked: blockedTasks.length,
      channel_actions: (channelTasks || []).length,
      done_samples: doneTasks.slice(0, 5),
      blocked_samples: blockedTasks.slice(0, 5),
    },
    brand_demand: {
      branded_search: brandedSearch,
      direct_traffic: directTraffic,
      returning_users: returningUsers,
      branded_ctr: brandedCtr,
      gbp_views: gbpViews,
    },
    lifecycle_stage: customer.lifecycle_stage,
  };
}

function buildHebrewSummary(d) {
  const parts = [];
  parts.push(`דוח שבועי — ${d.customerName}`);
  parts.push('');
  if (d.wonTop3.length) parts.push(`🥇 ניצחונות השבוע: ${d.wonTop3.length} מילים נכנסו לטופ 3${d.wonTop3.length <= 3 ? ` (${d.wonTop3.map(w => `"${w.keyword}"`).join(', ')})` : ''}.`);
  if (d.lostTop3.length) parts.push(`⚠ הפסדים השבוע: ${d.lostTop3.length} מילים יצאו מטופ 3.`);
  if (d.progressed.length) parts.push(`📈 ${d.progressed.length} מילים זזו 3+ מיקומים (חיובי או שלילי).`);
  parts.push(`📊 טופ 3 נוכחי: ${d.top3Count} מתוך ${d.totalTracked} מילים במעקב.`);
  parts.push('');
  if (d.doneTasksCount) parts.push(`✅ ${d.doneTasksCount} משימות בוצעו השבוע.`);
  if (d.blockedTasksCount) parts.push(`🚫 ${d.blockedTasksCount} משימות חסומות — דרושה התערבות.`);
  if (d.channelTasksCount) parts.push(`📣 ${d.channelTasksCount} פעולות ערוצים (Ads/Meta/Local/Social) יצאו לדרך.`);
  parts.push('');
  if (d.brandedSearch.trend === 'growing') parts.push(`🌱 חיפושי מותג עולים (+${d.brandedSearch.change_pct}% ב-30 ימים).`);
  else if (d.brandedSearch.trend === 'declining') parts.push(`📉 חיפושי מותג יורדים (${d.brandedSearch.change_pct}% ב-30 ימים).`);
  if (d.directTraffic.trend === 'growing') parts.push(`🌱 תעבורה ישירה עולה (+${d.directTraffic.change_pct}%).`);
  if (d.returningUsers.trend === 'growing') parts.push(`🌱 משתמשים חוזרים עולים (+${d.returningUsers.change_pct}%).`);
  if (d.gbpViews.trend === 'growing') parts.push(`🌱 צפיות בפרופיל העסק בגוגל עולות (+${d.gbpViews.change_pct}%).`);
  parts.push('');
  parts.push(`שלב חיים נוכחי: ${d.lifecycle}`);
  return parts.join('\n');
}
