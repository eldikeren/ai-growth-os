-- ============================================================
-- 042: GT3 view fixes after user feedback
-- 1. quick_wins must NOT include deprioritize/low_priority keywords
-- 2. support_clusters should cap at authority_support>=6 AND output_label
--    is not deprioritized
-- ============================================================

DROP VIEW IF EXISTS gt3_v_quick_wins CASCADE;
CREATE VIEW gt3_v_quick_wins AS
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
WHERE ks.output_label NOT IN ('deprioritize', 'low_priority')
  AND (
    (r.current_position BETWEEN 4 AND 10 AND ks.win_probability_score >= 5)
    OR (ks.business_value_score >= 7 AND ks.relevance_score >= 7
        AND ks.output_label IN ('high_priority', 'mission_critical', 'strategic_support')
        AND (r.current_position IS NULL OR r.current_position > 3))
  );

DROP VIEW IF EXISTS gt3_v_support_clusters CASCADE;
CREATE VIEW gt3_v_support_clusters AS
SELECT
  ku.customer_id, ku.id AS keyword_id, ku.keyword,
  ku.keyword_cluster, ku.intent_type,
  ks.strategic_priority_score, ks.output_label, ks.recommended_action,
  ks.authority_support_score, ks.relevance_score, ks.explanation_he
FROM gt3_keyword_universe ku
JOIN gt3_keyword_scores ks ON ks.keyword_id = ku.id
WHERE ks.output_label NOT IN ('deprioritize')
  AND (
    ks.authority_support_score >= 6
    OR (ku.intent_type = 'informational' AND ks.relevance_score >= 5
        AND ks.output_label IN ('strategic_support', 'high_priority', 'mission_critical'))
  );
