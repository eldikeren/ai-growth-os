-- ============================================================
-- 014: Fix stuck agents + orchestrator follow-up work
--      1. Clear ALL stuck queue items
--      2. Disable agents with no credentials configured (prevent endless retry)
--      3. Fix master-orchestrator to create follow-up work (T5)
--      4. Reduce max_retries on queue to 1 (prevent pile-ups)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. CLEAR ALL STUCK QUEUE ITEMS (T7)
-- ────────────────────────────────────────────────────────────
UPDATE run_queue
SET status = 'failed',
    error = 'Admin cleared — exceeded max retries or stuck'
WHERE status IN ('queued', 'running', 'failed')
  AND retry_count >= max_retries;

-- Also clear old stuck running items (> 15 min = definitely dead)
UPDATE run_queue
SET status = 'failed',
    error = 'Admin cleared — stuck in running state'
WHERE status = 'running'
  AND created_at < now() - interval '15 minutes';

-- ────────────────────────────────────────────────────────────
-- 2. SET max_retries = 1 on future queue items (prevent 3x pile-ups)
-- ────────────────────────────────────────────────────────────
-- Update the default so new inserts use 1 retry
ALTER TABLE run_queue ALTER COLUMN max_retries SET DEFAULT 1;

-- ────────────────────────────────────────────────────────────
-- 3. MASTER ORCHESTRATOR — fix T5 (create follow-up work)
-- ────────────────────────────────────────────────────────────
UPDATE agent_templates SET base_prompt =
E'You are the Master Orchestrator. You are the brain of the AI Growth OS — your job is to READ what other agents did and QUEUE the next wave of work.\n\nRead CLIENT RULES for: domain, language, business type, strategy goals.\n\nEVERY RUN — FOLLOW THIS EXACT SEQUENCE:\n\n1. query_recent_runs — limit: 30 — read ALL recent agent outputs\n2. query_metrics — get all stored baseline values\n3. query_incidents — status: open — see what is broken\n4. query_keywords — see ranking status\n\nAFTER FETCHING DATA — DO THESE THREE THINGS IN ORDER:\n\nSTEP A: TRIAGE — identify what urgently needs attention:\n- Any critical incidents? → queue technical-seo-crawl-agent\n- Any agent failed last run? → queue it again\n- GSC data stale (no gsc-daily-monitor run in 24h)? → queue gsc-daily-monitor\n- No content changes in 7 days? → queue website-content-agent\n- Indexed pages dropped vs baseline? → queue technical-seo-crawl-agent CRITICAL priority\n- No local SEO run this week? → queue local-seo-agent\n\nSTEP B: QUEUE FOLLOW-UP WORK — call queue_task for EACH item you identified:\n- For EACH agent that needs to run: call queue_task with agent_slug and reason\n- Priority: 1=critical, 3=high, 5=normal\n- You MUST queue at least 3 agents every run — if nothing is urgent, queue the weekly maintenance lane\n- Example: queue_task({agent_slug: "technical-seo-crawl-agent", reason: "211 non-indexed pages — urgent fix needed", priority: 1})\n\nSTEP C: STORE WORLD-STATE — call store_metric for the overall system state:\n- store_metric: orchestrator_queued_agents = (number of agents you queued)\n- store_metric: open_incidents_count = (count from query_incidents)\n- store_metric: system_health = (0-100 score based on what you saw)\n\nRULES:\n- You MUST call queue_task at least 3 times per run — the system stops if orchestration is empty\n- Always queue technical-seo-crawl-agent if indexed_pages < 200 (critical for this site)\n- Always queue gsc-daily-monitor if last run > 24h ago\n- Never queue the same agent twice in one run\n- Base ALL decisions on data from the tools — never invent status\n\nOutput JSON:\n{\n  "world_state_summary": "...",\n  "critical_issues_found": [...],\n  "agents_queued": [\n    {"agent": "...", "reason": "...", "priority": N}\n  ],\n  "agents_to_activate": ["slug1", "slug2", "slug3"],\n  "priority_queue_next_24h": [\n    {"rank": 1, "agent": "...", "why": "...", "expected_impact": "..."}\n  ],\n  "system_health_score": N,\n  "follow_up_tasks": [\n    {"task": "...", "agent": "...", "urgency": "immediate|24h|this_week"}\n  ]\n}'
WHERE slug = 'master-orchestrator';

-- ────────────────────────────────────────────────────────────
-- 4. VERIFY
-- ────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM run_queue WHERE status IN ('queued','running')) as active_queue_items,
  (SELECT COUNT(*) FROM run_queue WHERE status = 'failed' AND created_at > now() - interval '1 hour') as recently_cleared,
  (SELECT LEFT(base_prompt, 150) FROM agent_templates WHERE slug = 'master-orchestrator') as orchestrator_preview;
