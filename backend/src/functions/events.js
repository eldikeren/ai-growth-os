// ============================================================
// AGENT EVENTS — append-only log for Mission Control
// Renderer of truth: only emit when something real happened.
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Lane → color mapping (used by Mission Control to place character in correct zone)
const LANE_MAP = {
  'master-orchestrator': 'Orchestrator',
  'seo-core-agent': 'SEO',
  'technical-seo-crawl-agent': 'SEO',
  'gsc-daily-monitor': 'SEO',
  'website-content-agent': 'Content',
  'cro-agent': 'Content',
  'local-seo-agent': 'Local',
  'reviews-gbp-authority-agent': 'Local',
  'competitor-intelligence-agent': 'Research',
  'geo-ai-visibility-agent': 'Research',
  'facebook-agent': 'Social',
  'instagram-agent': 'Social',
  'content-distribution-agent': 'Social',
  'google-ads-campaign-agent': 'Paid',
  'analytics-conversion-integrity-agent': 'Paid',
  'hebrew-quality-agent': 'Validation',
  'website-qa-agent': 'Validation',
  'design-enforcement-agent': 'Validation',
  'regression-agent': 'Validation',
  'legal-agent': 'Validation',
  'kpi-integrity-agent': 'Validation',
  'credential-health-agent': 'Validation',
  'report-composer-agent': 'Orchestrator',
};

function laneFor(slug) {
  return LANE_MAP[slug] || 'Other';
}

/**
 * Emit an agent event. This is a FIRE-AND-FORGET operation — if it fails,
 * we log but don't break the caller. Mission Control is read-only.
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.agentSlug
 * @param {string} params.agentName - human-friendly name (e.g. "SEO Core Agent")
 * @param {string} params.eventType - one of: started, completed, failed, queued, blocked, reporting, validating, retrying, tool_call, approved
 * @param {string|null} [params.runId]
 * @param {string|null} [params.message]
 * @param {object} [params.metadata]
 */
export async function emitAgentEvent({ clientId, agentSlug, agentName, eventType, runId = null, message = null, metadata = {} }) {
  if (!clientId || !agentSlug || !eventType) return;
  try {
    await supabase.from('agent_events').insert({
      client_id: clientId,
      agent_slug: agentSlug,
      agent_name: agentName || agentSlug,
      lane: laneFor(agentSlug),
      event_type: eventType,
      run_id: runId,
      message: message ? String(message).slice(0, 500) : null,
      metadata: metadata || {},
    });
  } catch (err) {
    // Swallow errors — Mission Control must never break agent execution
    console.warn('[agent_events] emit failed:', err.message);
  }
}

/**
 * Convenience: emit a "non-agent" event (campaign published, social post published).
 * We fake an agent_slug so it shows up on the visualization.
 */
export async function emitSystemEvent({ clientId, source, eventType, message = null, metadata = {} }) {
  const slugMap = {
    'campaign_published_meta': { slug: 'facebook-agent', name: 'Meta Publisher' },
    'social_post_published_facebook': { slug: 'facebook-agent', name: 'Facebook Publisher' },
    'social_post_published_instagram': { slug: 'instagram-agent', name: 'Instagram Publisher' },
  };
  const m = slugMap[source] || { slug: source, name: source };
  return emitAgentEvent({
    clientId,
    agentSlug: m.slug,
    agentName: m.name,
    eventType,
    message,
    metadata,
  });
}

/**
 * Cleanup: delete events older than 7 days. Call from a daily cron.
 */
export async function cleanupOldEvents() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('agent_events').delete().lt('created_at', cutoff);
  if (error) console.warn('[agent_events] cleanup failed:', error.message);
}
