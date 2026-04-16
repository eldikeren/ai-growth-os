-- ============================================================
-- 041: GT3 Phase 3 — View fixes
--
-- Phase 3 audit surfaced 2 views not returning rows as intended:
-- - gt3_v_support_clusters (threshold too strict pre-enrichment)
-- - gt3_v_quick_wins (missed rank-in-top-3 defense cases)
-- ============================================================

-- ─── support_clusters: relax threshold while Phase 4 enriches ──
-- Was: authority_support_score >= 8 AND output_label IN ('strategic_support','high_priority')
-- Now: authority_support >= 6 OR informational with meaningful relevance.
CREATE OR REPLACE VIEW gt3_v_support_clusters AS
SELECT
  ku.customer_id, ku.id AS keyword_id, ku.keyword,
  ku.keyword_cluster, ku.intent_type,
  ks.strategic_priority_score, ks.output_label, ks.recommended_action,
  ks.authority_support_score, ks.relevance_score, ks.explanation_he
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
WHERE ks.authority_support_score >= 6
   OR (ku.intent_type = 'informational' AND ks.relevance_score >= 5
       AND ks.output_label IN ('strategic_support', 'high_priority', 'mission_critical'));

-- ─── quick_wins: include both "rank 4-10 + probability" AND "any strategic keyword outside top 3" ──
-- Also surface keywords with rank > 10 but strong signals — these ARE the wins the
-- agents should be pushing hardest.
CREATE OR REPLACE VIEW gt3_v_quick_wins AS
SELECT
  ku.customer_id, ku.id AS keyword_id, ku.keyword,
  ks.strategic_priority_score, ks.win_probability_score, ks.output_label,
  ks.recommended_action, ks.explanation_he,
  r.current_position
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
LEFT JOIN LATERAL (
  SELECT current_position FROM gt3_keyword_rankings rr
  WHERE rr.keyword_id = ku.id AND rr.ranking_type = 'organic'
  ORDER BY rr.checked_at DESC LIMIT 1
) r ON TRUE
WHERE
  -- Classic quick win: rank 4-10 with realistic win probability
  (r.current_position BETWEEN 4 AND 10 AND ks.win_probability_score >= 5)
  -- OR: top commercial keyword not yet in top 3 with good scoring signals
  OR (ks.business_value_score >= 7 AND ks.relevance_score >= 7
      AND ks.output_label IN ('high_priority', 'mission_critical')
      AND (r.current_position IS NULL OR r.current_position > 3));

COMMENT ON VIEW gt3_v_support_clusters IS 'Phase 3 relaxed: authority_support>=6 OR strong informational';
COMMENT ON VIEW gt3_v_quick_wins IS 'Phase 3 relaxed: rank 4-10 with win_prob>=5 OR top commercial keyword outside top-3';
