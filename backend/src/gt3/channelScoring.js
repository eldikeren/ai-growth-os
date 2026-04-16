// ============================================================
// GT3 PHASE 2 — CHANNEL SCORING
//
// For each keyword × channel pair, compute Cross-Channel Support
// Score using the customer's business_type weights. This tells us
// HOW MUCH each channel can contribute to this keyword's mission.
//
// Pure function. No I/O.
// ============================================================

// Formula per spec:
// Cross-Channel Support Score =
//   (Direct Ranking Impact × 0.35) +
//   (Demand Capture × 0.25) +
//   (Brand Lift × 0.20) +
//   (Conversion Assist × 0.20)
//
// Input impact scores come from gt3_channel_weight_profiles for
// the customer's business_type and each channel_type (seo,
// local_seo, google_ads, meta_ads, organic_social).
export function crossChannelSupport(channelProfile) {
  if (!channelProfile) return 0;
  const s =
    (Number(channelProfile.direct_ranking_impact) || 0) * 0.35 +
    (Number(channelProfile.demand_capture_impact) || 0) * 0.25 +
    (Number(channelProfile.brand_lift_impact) || 0) * 0.20 +
    (Number(channelProfile.conversion_assist_impact) || 0) * 0.20;
  return Number(s.toFixed(2));
}

// Given all channel profiles for a business_type and a keyword context,
// compute Cross-Channel Support per channel + select which channels
// should be enabled for this keyword based on channel decision rules.
export function computeChannelStrategy({
  keyword,
  keyword_score,       // the scored record from keywordScoring.scoreKeyword()
  customer,            // { business_type, is_local_business }
  channel_profiles,    // array of gt3_channel_weight_profiles rows for this business_type
}) {
  const profileByChannel = {};
  for (const p of channel_profiles) profileByChannel[p.channel_type] = p;

  const channels = ['seo', 'local_seo', 'google_ads', 'meta_ads', 'organic_social'];
  const perChannel = {};
  for (const ch of channels) {
    const profile = profileByChannel[ch];
    perChannel[ch] = {
      profile,
      cross_channel_support_score: profile ? crossChannelSupport(profile) : 0,
    };
  }

  // Apply the 5 channel decision rules
  const isLocal = !!customer?.is_local_business;
  const businessType = customer?.business_type;
  const isEmergencyLocal = ['plumber', 'electrician', 'locksmith'].includes(businessType);
  const isTrustHeavy = ['lawyer', 'therapist', 'dentist', 'medical_clinic', 'realtor'].includes(businessType);

  const k = keyword_score;
  const isMissionCritical = k.output_label === 'mission_critical';
  const isHighPriority = k.output_label === 'high_priority';
  const isInformational = k.intent_type === 'informational';
  const hasHighAuthoritySupport = k.authority_support_score >= 8;
  const isRank4to10 = k.inputs_snapshot?.rankings?.current_position >= 4 && k.inputs_snapshot?.rankings?.current_position <= 10;
  const isMoneyKeyword = k.business_value_score >= 8;

  // Decision matrix — which channels are enabled for this keyword?
  const use = {
    use_seo: true,     // SEO is the default backbone for every keyword
    use_local_seo: false,
    use_google_ads: false,
    use_meta_ads: false,
    use_organic_social: false,
    use_remarketing: false,
  };

  // Supporting flags
  const isNationalConsultative = customer?.business_model === 'national_lead_gen' ||
                                 customer?.business_model === 'personal_brand';
  const isEcommerce = customer?.business_model === 'ecommerce';
  const isServiceKeyword = k.relevance_score >= 7 && k.business_value_score >= 7;
  const isStrategicSupport = k.output_label === 'strategic_support';

  // Rule 1: mission_critical + high business_value
  if (isMissionCritical && isMoneyKeyword) {
    use.use_seo = true;
    use.use_google_ads = true;
    use.use_organic_social = true;
    if (isLocal && k.local_intent_score >= 5) use.use_local_seo = true;
    if (isTrustHeavy || (isLocal && k.conversion_intent_score >= 7)) use.use_meta_ads = true;
    if (k.business_value_score >= 7) use.use_remarketing = true;
  }

  // Rule 2: informational + high authority support
  if (isInformational && hasHighAuthoritySupport) {
    use.use_seo = true;
    use.use_organic_social = true;
    use.use_meta_ads = true;
    use.use_google_ads = false;
  }

  // Rule 3: rank 4-10 on money keyword
  if (isRank4to10 && isMoneyKeyword) {
    use.use_seo = true;
    use.use_google_ads = true;
    use.use_meta_ads = true;
    use.use_remarketing = true;
    if (isLocal) use.use_local_seo = true;
  }

  // Rule 4: emergency local service
  if (isEmergencyLocal && k.conversion_intent_score >= 5) {
    use.use_google_ads = true;
    if (isLocal) use.use_local_seo = true;
    use.use_meta_ads = false;
    use.use_organic_social = false;
  }

  // Rule 5: trust-heavy consideration
  if (isTrustHeavy && isHighPriority) {
    use.use_seo = true;
    if (isLocal) use.use_local_seo = true;
    use.use_google_ads = true;
    use.use_meta_ads = true;
    use.use_organic_social = true;
  }

  // Rule 6 (NEW): ANY service keyword with real commercial value
  // Even at strategic_support, if it's a legitimate service (rel>=7, bv>=7)
  // with some commercial intent, we fire the core paid + social channels.
  // This ensures clients like Homie (national consultant, strategic_support
  // labels while volume data catches up) still get ads + retargeting + social
  // demand-building work queued.
  if (isServiceKeyword && (k.conversion_intent_score >= 5 || k.intent_type === 'commercial' || k.intent_type === 'transactional')) {
    use.use_google_ads = true;
    use.use_meta_ads = true;       // brand lift + retargeting
    use.use_organic_social = true;  // authority content
    if (k.business_value_score >= 7) use.use_remarketing = true;
    if (isLocal && k.local_intent_score >= 5) use.use_local_seo = true;
  }

  // Rule 7 (NEW): Ecommerce always fires Ads + Meta on commercial keywords
  if (isEcommerce && (k.intent_type === 'transactional' || k.intent_type === 'commercial') && isServiceKeyword) {
    use.use_google_ads = true;
    use.use_meta_ads = true;
    use.use_remarketing = true;
  }

  // Hebrew goals per enabled channel
  const goals = {
    seo_goal_he: use.use_seo ? seoGoalHe(k) : null,
    local_seo_goal_he: use.use_local_seo ? localSeoGoalHe(k) : null,
    google_ads_goal_he: use.use_google_ads ? googleAdsGoalHe(k) : null,
    meta_ads_goal_he: use.use_meta_ads ? metaAdsGoalHe(k, isTrustHeavy) : null,
    organic_social_goal_he: use.use_organic_social ? organicSocialGoalHe(k) : null,
  };

  // Aggregate cross-channel support for enabled channels
  const enabledChannels = Object.entries(use).filter(([key, val]) => val === true && key.startsWith('use_'))
    .map(([key]) => key.replace('use_', '').replace('remarketing', 'meta_ads'));
  const uniqueChannels = [...new Set(enabledChannels)];
  const avgSupportScore = uniqueChannels.length
    ? uniqueChannels.reduce((s, ch) => s + (perChannel[ch]?.cross_channel_support_score || 0), 0) / uniqueChannels.length
    : 0;

  return {
    ...use,
    ...goals,
    cross_channel_support_score: Number(avgSupportScore.toFixed(2)),
    per_channel_scores: Object.fromEntries(
      Object.entries(perChannel).map(([ch, v]) => [ch, v.cross_channel_support_score])
    ),
  };
}

// ─── Hebrew channel goal generators ─────────────────────────
function seoGoalHe(k) {
  if (k.recommended_action === 'build_new_page') return 'בניית עמוד יעד ייעודי לקידום הביטוי לטופ 3';
  if (k.recommended_action === 'push_to_top_3') return 'לדחוף את העמוד הקיים לטופ 3 דרך חיזוק תוכן, קישורים פנימיים וסיגנלים';
  if (k.recommended_action === 'improve_page') return 'שדרוג העמוד הקיים: כותרת, H1, FAQ, תוכן, CTA';
  if (k.recommended_action === 'defend') return 'שמירה על המיקום בטופ 3 ושיפור רלוונטיות לאורך זמן';
  if (k.recommended_action === 'expand_support_cluster') return 'הרחבת אשכול התוכן התומך לחיזוק סמכות נושאית';
  return 'חיזוק הנוכחות האורגנית';
}
function localSeoGoalHe(k) {
  return 'חיזוק נראות במפות, Google Business Profile וביקורות, עם דגש על המיקום הגאוגרפי הרלוונטי';
}
function googleAdsGoalHe(k) {
  const rankingPush = k.inputs_snapshot?.rankings?.current_position;
  if (rankingPush && rankingPush > 3) return 'לתפוס ביקוש קיים, לבדוק מסרים ו-CTR, ולכסות עד שהאורגני עולה לטופ 3';
  return 'לבדוק מסרים ו-CTR להאצת למידה ולחיזוק דפי נחיתה';
}
function metaAdsGoalHe(k, isTrustHeavy) {
  if (isTrustHeavy) return 'רימרקטינג וחיזוק אמון אצל מבקרים שלא פנו — הצגת ביקורות, תוכן סמכות, וטריגרים ליצירת קשר';
  return 'בניית ביקוש מותג, רימרקטינג למבקרים שלא המירו';
}
function organicSocialGoalHe(k) {
  if (k.intent_type === 'informational') return 'הפצת תוכן אסטרטגי שמחזק סמכות נושאית ומזין חיפושי מותג';
  return 'הפצת תכני סמכות, ביקורות ותוכן מחזק מותג סביב מילת היעד';
}
