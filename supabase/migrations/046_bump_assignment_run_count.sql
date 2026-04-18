-- ─────────────────────────────────────────────────────────────────────────────
-- Atomic bump_assignment_run_count RPC
--
-- Why this exists:
--   core.js was trying to do
--     .update({ run_count: supabase.rpc('increment', { x: 1 }) })
--   which doesn't work in the Supabase JS client — the PostgrestBuilder object
--   gets serialized into something Postgres rejects, so the ENTIRE update row
--   (including last_run_at) silently fails. Net result: every row in
--   client_agent_assignments still shows run_count=0 and last_run_at=null even
--   though the agent has actually run hundreds of times.
--
-- This RPC is the proper atomic way to do it: increment run_count and bump
-- last_run_at in a single SQL statement.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION bump_assignment_run_count(
  p_client_id UUID,
  p_agent_template_id UUID
)
RETURNS void AS $$
  UPDATE client_agent_assignments
  SET run_count = COALESCE(run_count, 0) + 1,
      last_run_at = now()
  WHERE client_id = p_client_id
    AND agent_template_id = p_agent_template_id;
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION bump_assignment_run_count(UUID, UUID) TO anon, authenticated, service_role;
