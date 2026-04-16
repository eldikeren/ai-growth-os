// ============================================================
// GT3 Phase 3 — MissionPlannerService + TaskGenerationService
//
// After scoring, this service:
//   1. Classifies each scored keyword into a mission (primary /
//      secondary / defense / none) + bucket (core_revenue /
//      quick_commercial_wins / authority_builders / low_value_noise)
//   2. Generates concrete tasks from recommended_action
//   3. Writes gt3_action_tasks (SEO tasks) and gt3_channel_tasks
//      (multi-channel actions)
//
// All tasks have Hebrew title + description and cite the keyword_id.
// ============================================================

import { getGT3Supabase, svcResult } from './supabaseClient.js';
import { classifyMissionBucket, selectMission, generateTasksForScore, detectLifecycleStage } from '../decisionEngine.js';

export async function planMissions(customerId) {
  const sb = getGT3Supabase();

  const { data: customer } = await sb.from('gt3_customers').select('*').eq('id', customerId).single();
  if (!customer) return svcResult({ ok: false, source: 'mission_planner', errors: ['customer not found'] });

  // Load scored keywords joined with universe + latest ranking + page match
  const { data: keywords } = await sb.from('gt3_keyword_universe')
    .select('id, keyword, normalized_keyword, keyword_cluster, intent_type')
    .eq('customer_id', customerId);
  if (!keywords?.length) return svcResult({ ok: true, source: 'mission_planner', data: { missions: 0, reason: 'no_keywords' } });

  const keywordIds = keywords.map(k => k.id);
  const [scoresRes, matchesRes, rankingsRes, existingTasksRes, strategyRes] = await Promise.all([
    sb.from('gt3_keyword_scores').select('*').in('keyword_id', keywordIds),
    sb.from('gt3_keyword_page_matches').select('*').in('keyword_id', keywordIds),
    sb.from('gt3_keyword_rankings').select('keyword_id, current_position, checked_at').in('keyword_id', keywordIds),
    sb.from('gt3_action_tasks').select('keyword_id, task_type').eq('customer_id', customerId).in('status', ['open', 'in_progress']),
    sb.from('gt3_keyword_channel_strategy').select('*').in('keyword_id', keywordIds),
  ]);
  const scoresByKw = Object.fromEntries((scoresRes.data || []).map(s => [s.keyword_id, s]));
  const matchesByKw = Object.fromEntries((matchesRes.data || []).map(m => [m.keyword_id, m]));
  const latestRanking = {};
  for (const r of rankingsRes.data || []) {
    if (!latestRanking[r.keyword_id] || new Date(r.checked_at) > new Date(latestRanking[r.keyword_id].checked_at)) {
      latestRanking[r.keyword_id] = r;
    }
  }
  const strategyByKw = Object.fromEntries((strategyRes.data || []).map(s => [s.keyword_id, s]));
  // Dedup: don't create a task that already exists open for the same (keyword_id, task_type)
  const existingTaskKeys = new Set((existingTasksRes.data || []).map(t => `${t.keyword_id}__${t.task_type}`));

  // Lifecycle stage detection
  const totalKeywords = keywords.length;
  const top3Count = Object.values(latestRanking).filter(r => r.current_position && r.current_position <= 3).length;
  const page1Count = Object.values(latestRanking).filter(r => r.current_position && r.current_position <= 10).length;
  const lifecycle = detectLifecycleStage({ totalKeywords, top3Count, page1Count });
  await sb.from('gt3_customers').update({ lifecycle_stage: lifecycle, updated_at: new Date().toISOString() }).eq('id', customerId);

  // Mission & task planning
  const actionTasks = [];
  const channelTasks = [];
  const missionStats = { primary: 0, secondary: 0, defense: 0, none: 0 };
  const bucketStats = { core_revenue: 0, quick_commercial_wins: 0, authority_builders: 0, low_value_noise: 0 };

  for (const kw of keywords) {
    const score = scoresByKw[kw.id];
    if (!score) continue;
    const match = matchesByKw[kw.id];
    const ranking = latestRanking[kw.id] || {};
    const strategy = strategyByKw[kw.id] || {};

    const mission = selectMission(score, ranking.current_position);
    const bucket = classifyMissionBucket(score);
    missionStats[mission.mission]++;
    bucketStats[bucket.bucket]++;

    // Generate SEO tasks
    const tasks = generateTasksForScore({
      score,
      keyword: kw.keyword,
      page_match_type: match?.match_type || 'missing_page',
      best_page_url: null,
    });
    for (const t of tasks) {
      const dedupKey = `${kw.id}__${t.task_type}`;
      if (existingTaskKeys.has(dedupKey)) continue; // skip duplicates
      actionTasks.push({
        customer_id: customerId,
        keyword_id: kw.id,
        page_id: match?.page_id || null,
        task_type: t.task_type,
        priority_label: t.priority_label,
        status: 'open',
        title_he: t.title_he,
        description_he: t.description_he,
        estimated_impact_score: t.estimated_impact_score,
        assigned_agent: routeAgentByTaskType(t.task_type),
      });
      existingTaskKeys.add(dedupKey);
    }

    // Generate channel tasks for enabled channels
    if (mission.mission !== 'none') {
      if (strategy.use_google_ads) {
        channelTasks.push(makeChannelTask({
          customer_id: customerId, keyword_id: kw.id,
          channel_type: 'google_ads', task_type: 'create_search_ads',
          priority_label: labelFromScore(score.output_label),
          title_he: `קמפיין Google Ads ממוקד עבור "${kw.keyword}"`,
          description_he: strategy.google_ads_goal_he || 'קמפיין חיפוש ממוקד, בדיקת מסרים, דפי נחיתה.',
          target_metric: 'qualified_leads',
        }));
      }
      if (strategy.use_local_seo && score.output_label !== 'deprioritize') {
        channelTasks.push(makeChannelTask({
          customer_id: customerId, keyword_id: kw.id,
          channel_type: 'local_seo', task_type: 'update_gbp_services',
          priority_label: labelFromScore(score.output_label),
          title_he: `חיזוק Google Business Profile עבור "${kw.keyword}"`,
          description_he: strategy.local_seo_goal_he,
          target_metric: 'local_pack_visibility',
        }));
      }
      if (strategy.use_meta_ads && ['mission_critical', 'high_priority'].includes(score.output_label)) {
        channelTasks.push(makeChannelTask({
          customer_id: customerId, keyword_id: kw.id,
          channel_type: 'meta_ads', task_type: 'create_remarketing_audience',
          priority_label: labelFromScore(score.output_label),
          title_he: `רימרקטינג Meta Ads סביב "${kw.keyword}"`,
          description_he: strategy.meta_ads_goal_he,
          target_metric: 'returning_user_conversions',
        }));
      }
      if (strategy.use_organic_social && score.authority_support_score >= 5) {
        channelTasks.push(makeChannelTask({
          customer_id: customerId, keyword_id: kw.id,
          channel_type: 'organic_social', task_type: 'publish_social_post',
          priority_label: labelFromScore(score.output_label),
          title_he: `תוכן תומך ברשתות סביב "${kw.keyword}"`,
          description_he: strategy.organic_social_goal_he,
          target_metric: 'brand_demand_growth',
        }));
      }
    }
  }

  // Batch insert tasks
  const writes = {};
  if (actionTasks.length) {
    for (let i = 0; i < actionTasks.length; i += 100) {
      const batch = actionTasks.slice(i, i + 100);
      const { error } = await sb.from('gt3_action_tasks').insert(batch);
      if (error) console.warn('[mission_planner] action_tasks batch error:', error.message);
    }
    writes.gt3_action_tasks = actionTasks.length;
  }
  if (channelTasks.length) {
    for (let i = 0; i < channelTasks.length; i += 100) {
      const batch = channelTasks.slice(i, i + 100);
      const { error } = await sb.from('gt3_channel_tasks').insert(batch);
      if (error) console.warn('[mission_planner] channel_tasks batch error:', error.message);
    }
    writes.gt3_channel_tasks = channelTasks.length;
  }

  return svcResult({
    ok: true, source: 'mission_planner',
    data: {
      customer_id: customerId,
      lifecycle_stage: lifecycle,
      missions: missionStats,
      buckets: bucketStats,
      action_tasks_created: actionTasks.length,
      channel_tasks_created: channelTasks.length,
    },
    writes,
  });
}

function makeChannelTask(partial) {
  return {
    ...partial,
    status: 'open',
    assigned_agent: routeChannelAgent(partial.channel_type),
  };
}

function labelFromScore(output_label) {
  if (output_label === 'mission_critical') return 'mission_critical';
  if (output_label === 'high_priority') return 'high_priority';
  if (output_label === 'strategic_support') return 'strategic_support';
  return 'low_priority';
}

function routeAgentByTaskType(taskType) {
  const map = {
    create_page: 'website-content-agent',
    improve_page: 'website-content-agent',
    improve_ctr: 'seo-core-agent',
    add_internal_links: 'seo-core-agent',
    add_faq: 'website-content-agent',
    strengthen_local_seo: 'reviews-gbp-authority-agent',
    improve_conversion: 'cro-agent',
    build_cluster: 'website-content-agent',
    review_gbp: 'reviews-gbp-authority-agent',
    acquire_links: 'seo-core-agent',
    defend_ranking: 'seo-core-agent',
  };
  return map[taskType] || 'seo-core-agent';
}

function routeChannelAgent(channel) {
  const map = {
    seo: 'seo-core-agent',
    local_seo: 'local-seo-agent',
    google_ads: 'google-ads-campaign-agent',
    meta_ads: 'facebook-agent',
    organic_social: 'content-distribution-agent',
  };
  return map[channel] || null;
}
