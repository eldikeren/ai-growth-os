// ============================================================
// GT3 PHASE 2 — DECISION ENGINE
//
// Hard-coded business rules. These run AFTER scoring and channel
// selection. They:
//   1. Enforce invariants ("money keyword can never be deprioritized")
//   2. Select which keywords become missions vs support vs maintenance
//   3. Decide lifecycle stage of the customer
//
// Rules live in code, not prompts. Deterministic and auditable.
// ============================================================

// ─── Keyword-level invariants (from spec's 6 decision rules) ──
// Applied AFTER scoring to correct for edge cases.
export function enforceKeywordInvariants(score) {
  const out = { ...score };

  // Rule 1: If Business Value >= 8 AND Relevance >= 8,
  //         the keyword can NEVER be labeled deprioritize/low_priority,
  //         even if it's hard. Minimum: strategic_support.
  if (out.business_value_score >= 8 && out.relevance_score >= 8) {
    if (['deprioritize', 'low_priority'].includes(out.output_label)) {
      out.output_label = 'strategic_support';
      out.recommended_action = out.recommended_action === 'deprioritize' ? 'expand_support_cluster' : out.recommended_action;
      out._invariant_applied = 'rule_1_protected_money_keyword';
    }
  }

  // Rule 2: Win Probability >= 7 AND Business Value >= 6 → immediate push target
  if (out.win_probability_score >= 7 && out.business_value_score >= 6) {
    if (out.output_label === 'strategic_support' || out.output_label === 'low_priority') {
      out.output_label = 'high_priority';
      out._invariant_applied = (out._invariant_applied || '') + '|rule_2_quick_win_promoted';
    }
    if (!out.recommended_action || out.recommended_action === 'expand_support_cluster') {
      out.recommended_action = 'push_to_top_3';
    }
  }

  // Rule 3: Authority Support >= 8 + supports mission critical → keep, even if medium demand
  // (already handled by keywordScoring.authority_support_score)

  // Rule 4: High Demand + Low Relevance → do NOT promote (suppress)
  if (out.demand_score >= 8 && out.relevance_score <= 3) {
    out.output_label = 'low_priority';
    out.recommended_action = 'deprioritize';
    out._invariant_applied = (out._invariant_applied || '') + '|rule_4_irrelevant_demand_suppressed';
  }

  // Rule 5: Traffic without conversion potential + without authority support → deprioritize
  if (out.demand_score >= 6 && out.conversion_intent_score <= 2 && out.authority_support_score <= 3) {
    if (!['mission_critical', 'high_priority'].includes(out.output_label)) {
      out.output_label = 'deprioritize';
      out.recommended_action = 'deprioritize';
      out._invariant_applied = (out._invariant_applied || '') + '|rule_5_vanity_traffic_suppressed';
    }
  }

  return out;
}

// ─── Mission classification (which bucket does this keyword belong to?) ──
// Reads the 4 buckets from the spec: core_revenue, quick_commercial_wins,
// authority_builders, low_value_noise.
// Thresholds are based on inherent keyword quality (relevance + business value
// + intent), NOT on final strategic_priority_score — because priority depends
// on external signals (rank, volume) that may not exist yet in Phase 2.
export function classifyMissionBucket(score) {
  const isMoneyKeyword = score.business_value_score >= 7 && score.relevance_score >= 7;
  const isCommercialEnough = ['transactional', 'commercial', 'urgent_local'].includes(score.intent_type);
  const isStrongCommercial = score.conversion_intent_score >= 5 || score.intent_type === 'transactional' || score.intent_type === 'urgent_local';

  // Core Revenue: direct match to primary service with strong commercial intent
  if (isMoneyKeyword && isStrongCommercial && (score.business_value_score >= 8 || score.relevance_score >= 9)) {
    return {
      bucket: 'core_revenue',
      bucket_he: 'יעדי כסף ראשיים',
      description_he: 'מילות יעד חייבות-טופ-3 — הלב של התוכנית',
    };
  }

  // Quick Commercial Wins: medium-strong commercial + realistic win probability
  if (
    isCommercialEnough &&
    score.business_value_score >= 5 &&
    (score.win_probability_score >= 5 || score.relevance_score >= 6)
  ) {
    return {
      bucket: 'quick_commercial_wins',
      bucket_he: 'ניצחונות מסחריים מהירים',
      description_he: 'ביטויים מסחריים בינוניים עם סיכוי ריאלי לעלייה מהירה',
    };
  }

  // Authority Builders: informational content that supports the mission
  if (
    score.authority_support_score >= 6 ||
    (score.intent_type === 'informational' && score.relevance_score >= 5)
  ) {
    return {
      bucket: 'authority_builders',
      bucket_he: 'בוני סמכות',
      description_he: 'מילות תוכן שמחזקות סמכות נושאית ותומכות במילות כסף',
    };
  }

  // Low Value Noise
  return {
    bucket: 'low_value_noise',
    bucket_he: 'מילים לא רלוונטיות כעת',
    description_he: 'לא להשקיע בהן כרגע',
  };
}

// ─── Mission Selection (primary / secondary / defense) ──────
// From the spec — selects Primary Missions, Secondary Missions, Defense.
// Defense is checked FIRST: if already in top 3 on a non-trivial keyword,
// protecting that rank is always the top job — even if the keyword could
// also qualify as primary/secondary.
export function selectMission(score, currentPosition) {
  // Defense (checked first): already in Top 3 + strategic enough to keep
  if (currentPosition !== null && currentPosition !== undefined &&
      currentPosition <= 3 && score.strategic_priority_score >= 40) {
    return { mission: 'defense', priority: 1 };
  }

  // Primary Mission
  if (
    score.strategic_priority_score >= 80 &&
    score.business_value_score >= 8 &&
    score.relevance_score >= 8
  ) {
    return { mission: 'primary', priority: 1 };
  }

  // Secondary Mission: 65-79 OR authority support anchor OR
  // high relevance + business value on a service keyword (even if other signals weak)
  if (
    (score.strategic_priority_score >= 65 && score.strategic_priority_score < 80) ||
    score.authority_support_score >= 8 ||
    (score.relevance_score >= 8 && score.business_value_score >= 8)
  ) {
    return { mission: 'secondary', priority: 2 };
  }

  return { mission: 'none', priority: 0 };
}

// ─── Customer lifecycle stage ───────────────────────────────
// From spec: stage_1 = no presence; stage_2 = base, not top 3; stage_3 = some top 3.
export function detectLifecycleStage({ totalKeywords, top3Count, page1Count }) {
  if (totalKeywords === 0) return 'stage_1';
  const top3Share = top3Count / totalKeywords;
  const page1Share = page1Count / totalKeywords;

  if (top3Share >= 0.25) return 'stage_3';        // 25%+ in top 3 → defend/expand
  if (page1Share >= 0.2) return 'stage_2';        // 20%+ on page 1 → push
  return 'stage_1';                               // no real presence
}

// ─── Task generation rules (what actions flow from an action label) ──
// Maps recommended_action → task_type + priority_label + Hebrew title/description template.
export function generateTasksForScore({ score, keyword, page_match_type, best_page_url }) {
  const tasks = [];
  const priority = priorityFromLabel(score.output_label);

  switch (score.recommended_action) {
    case 'build_new_page':
      tasks.push({
        task_type: 'create_page',
        priority_label: priority,
        title_he: `לבנות עמוד ${targetPageTypeHe(score.target_page_type)} עבור "${keyword}"`,
        description_he: `אין עמוד תואם לביטוי "${keyword}". נדרש לבנות עמוד יעד עם כותרת ממוקדת, H1, FAQ, קריאות לפעולה (טלפון/וואטסאפ/טופס), ותוכן שמתאים לכוונת החיפוש.`,
        estimated_impact_score: Math.min(10, score.strategic_priority_score / 10),
      });
      break;

    case 'improve_page':
      tasks.push({
        task_type: 'improve_page',
        priority_label: priority,
        title_he: `לשדרג את "${best_page_url || 'העמוד הקיים'}" עבור "${keyword}"`,
        description_he: `העמוד הקיים מספק התאמה ${pageMatchTypeHe(page_match_type)}. נדרש למקד את הכותרת, ה-H1, והמטא; להוסיף FAQ רלוונטי; לחזק קישורים פנימיים; ולשפר את ה-CTA.`,
        estimated_impact_score: Math.min(10, score.strategic_priority_score / 10),
      });
      break;

    case 'push_to_top_3':
      tasks.push({
        task_type: 'improve_page',
        priority_label: priority,
        title_he: `לדחוף "${keyword}" לטופ 3`,
        description_he: `כרגע מחוץ לטופ 3. נדרש לחזק את העמוד הקיים: להוסיף תוכן תומך, קישורים פנימיים, ביקורות, וסיגנלים מקומיים אם רלוונטי. לשפר גם כותרת ומטא לשיפור CTR.`,
        estimated_impact_score: score.win_probability_score,
      });
      tasks.push({
        task_type: 'add_internal_links',
        priority_label: priority,
        title_he: `לחזק קישורים פנימיים לעמוד היעד של "${keyword}"`,
        description_he: `לבנות 3-5 קישורים פנימיים מעמודים רלוונטיים לעמוד היעד — עם אנקור טקסט ממוקד.`,
        estimated_impact_score: 6,
      });
      break;

    case 'defend':
      tasks.push({
        task_type: 'defend_ranking',
        priority_label: priority,
        title_he: `לשמור על הטופ 3 עבור "${keyword}"`,
        description_he: `המיקום הנוכחי בטופ 3 — נדרש לוודא שהעמוד נשאר מעודכן, הביקורות חדשות, וה-CTR תחרותי. לעקוב אחר תנועות מתחרים.`,
        estimated_impact_score: 8,
      });
      tasks.push({
        task_type: 'improve_ctr',
        priority_label: priority,
        title_he: `שיפור CTR אורגני עבור "${keyword}"`,
        description_he: `עדכון כותרת ומטא לנוסחאות עם CTR גבוה יותר — להגן מהחזרה לטופ 3 אם התחרות מחדדת מסרים.`,
        estimated_impact_score: 5,
      });
      break;

    case 'expand_support_cluster':
      tasks.push({
        task_type: 'build_cluster',
        priority_label: priority,
        title_he: `להרחיב אשכול תוכן סביב "${keyword}"`,
        description_he: `ביטוי זה תומך במילות כסף מרכזיות. נדרש לבנות 3-5 מאמרי תמיכה עם קישור פנימי הדוק לעמוד היעד הראשי.`,
        estimated_impact_score: score.authority_support_score,
      });
      break;

    case 'strengthen_local_signals':
      tasks.push({
        task_type: 'strengthen_local_seo',
        priority_label: priority,
        title_he: `לחזק אותות מקומיים עבור "${keyword}"`,
        description_he: `עדכון GBP, בקשת ביקורות חדשות, עדכון קטגוריות ושירותים, וידוא עקביות NAP, ובדיקת נראות במפות.`,
        estimated_impact_score: score.local_intent_score,
      });
      break;

    case 'improve_ctr':
      tasks.push({
        task_type: 'improve_ctr',
        priority_label: priority,
        title_he: `שיפור CTR אורגני עבור "${keyword}"`,
        description_he: `המיקום טוב אבל ה-CTR נמוך מהצפוי. נדרש לעדכן את הכותרת, התיאור המטא, ותצוגת ה-rich snippet (FAQ/schema).`,
        estimated_impact_score: 6,
      });
      break;

    case 'earn_authority_links':
      tasks.push({
        task_type: 'acquire_links',
        priority_label: priority,
        title_he: `לבנות קישורים סמכותיים לעמוד של "${keyword}"`,
        description_he: `פער סמכות מונע כניסה לטופ 3. נדרש לזהות 5-10 דומיינים סמכותיים בתחום ולבצע outreach למאמרי אורח, אזכורים, ושיתופי פעולה.`,
        estimated_impact_score: 8,
      });
      break;

    // deprioritize → no tasks
  }

  return tasks;
}

// ─── Helpers ─────────────────────────────────────────────────
function priorityFromLabel(label) {
  if (label === 'mission_critical') return 'mission_critical';
  if (label === 'high_priority') return 'high_priority';
  if (label === 'strategic_support') return 'strategic_support';
  return 'low_priority';
}

function targetPageTypeHe(t) {
  const map = {
    homepage: 'בית',
    primary_service_page: 'שירות ראשי',
    location_service_page: 'שירות + מיקום',
    supporting_article: 'מאמר תומך',
    faq_page: 'שאלות ותשובות',
    comparison_page: 'השוואה',
    pricing_page: 'מחירים',
    case_study_page: 'מקרה בוחן',
    review_page: 'ביקורות',
    local_landing_page: 'דף נחיתה מקומי',
  };
  return map[t] || 'שירות';
}

function pageMatchTypeHe(t) {
  const map = {
    exact_match: 'מדויקת',
    close_match: 'קרובה',
    partial_match: 'חלקית',
    weak_match: 'חלשה',
    missing_page: 'חסרה',
  };
  return map[t] || t;
}
