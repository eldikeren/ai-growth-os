// ─── AI Growth OS — Mission Control Live View ─────────────────
// Real-time visualization of agent activity. Renderer of truth, not simulator.
// Phase 1: Single customer live view (Phaser pixel office)
// Phase 2: Multi-customer wall (video-wall pods)
// Phase 3: Historical replay timeline (hour-by-hour activity)
// Phase 4: Premium 2.5D overlay (glow, glass, depth) applied to Phase 1
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Spin, Empty, Btn, Badge } from '../components/index.jsx';
import { Monitor, Zap, AlertTriangle, CheckCircle, Clock, XCircle, Eye,
  Grid3x3, Rewind, Maximize2, Users, Play, Pause, RefreshCw, ArrowLeft } from 'lucide-react';

// ── Dark theme overrides for this view ──────────────────────
const dark = {
  bg: '#07070f',
  surface: '#0d1117',
  surfaceLight: '#161b22',
  border: '#ffffff1a',
  text: '#f0f0f0',
  textMuted: '#b0b0b0',   // bumped from #666 for readability
  textDim: '#909090',     // bumped from #444
};

// ── Event type colors and labels ────────────────────────────
const EVENT_STYLES = {
  started:    { color: '#4285F4', label: 'STARTED' },
  completed:  { color: '#00E676', label: 'DONE' },
  failed:     { color: '#FF1744', label: 'FAILED' },
  queued:     { color: '#00BCD4', label: 'QUEUED' },
  blocked:    { color: '#FFAB00', label: 'BLOCKED' },
  reporting:  { color: '#34A853', label: 'REPORT' },
  validating: { color: '#2196F3', label: 'VALID' },
  retrying:   { color: '#FF9800', label: 'RETRY' },
  tool_call:  { color: '#9C27B0', label: 'TOOL' },
  approved:   { color: '#00E676', label: 'APPROVED' },
};

const ANIM_STATE_CONFIG = {
  idle:       { color: '#555', label: 'Idle', icon: '💤' },
  queued:     { color: '#00BCD4', label: 'Queued', icon: '⏳' },
  working:    { color: '#9C27B0', label: 'Working', icon: '⚙️' },
  reporting:  { color: '#34A853', label: 'Reporting', icon: '📤' },
  blocked:    { color: '#FFAB00', label: 'Blocked', icon: '🚫' },
  error:      { color: '#FF1744', label: 'Error', icon: '⚠️' },
  validating: { color: '#2196F3', label: 'Validating', icon: '🔍' },
  done:       { color: '#FFD600', label: 'Done', icon: '✅' },
};

// ── Orchestrator Bar ────────────────────────────────────────
function OrchestratorBar({ state }) {
  const summary = state?.summary;
  const workingCount = summary?.working || 0;
  const queuedCount = summary?.queued || 0;
  const totalDone = summary?.done || 0;
  const errors = summary?.errors || 0;

  let message = 'Waiting for mission...';
  if (workingCount > 0) message = `Orchestrating ${workingCount} agent${workingCount > 1 ? 's' : ''}... ${queuedCount} queued`;
  else if (totalDone > 0 && errors === 0) message = 'All agents reported — standing by';
  else if (errors > 0) message = `${errors} agent${errors > 1 ? 's' : ''} need attention`;
  else if (queuedCount > 0) message = `${queuedCount} agent${queuedCount > 1 ? 's' : ''} queued, waiting to start`;

  const pct = summary?.total > 0
    ? Math.round(((summary.done + summary.idle) / summary.total) * 100)
    : 0;

  return (
    <div style={{
      padding: '10px 16px',
      background: '#0a1628ee',
      borderBottom: '1px solid #4285F433',
      display: 'flex', alignItems: 'center', gap: 12,
      fontFamily: "'Courier New', monospace",
      fontSize: '13px', color: '#4285F4',
      backdropFilter: 'blur(4px)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 18 }}>🤖</span>
      <span style={{ fontWeight: 700, letterSpacing: 2, color: '#7aaefe', fontSize: 11 }}>ORCHESTRATOR</span>
      <span style={{ flex: 1, fontStyle: 'italic', color: '#cfd6e6', fontSize: 13 }}>{message}</span>
      <div style={{
        width: 160, height: 6,
        background: '#ffffff14', borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, #4285F4, #00E676)',
          borderRadius: 3,
          transition: 'width 0.5s ease',
          boxShadow: '0 0 8px #4285F4',
        }} />
      </div>
      <span style={{ fontSize: 14, color: '#4285F4', fontWeight: 700, minWidth: 40, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

// ── Stats Bar ───────────────────────────────────────────────
function StatsBar({ summary }) {
  const stats = [
    { key: 'working', label: 'ACTIVE', color: '#9C27B0', value: summary?.working || 0 },
    { key: 'queued', label: 'QUEUED', color: '#00BCD4', value: summary?.queued || 0 },
    { key: 'done', label: 'DONE', color: '#00E676', value: summary?.done || 0 },
    { key: 'errors', label: 'ERRORS', color: '#FF1744', value: summary?.errors || 0 },
    { key: 'blocked', label: 'BLOCKED', color: '#FFAB00', value: summary?.blocked || 0 },
    { key: 'idle', label: 'IDLE', color: '#555', value: summary?.idle || 0 },
  ];

  return (
    <div style={{
      padding: '10px 16px',
      background: dark.surface,
      borderBottom: `1px solid ${dark.border}`,
      display: 'flex', gap: 10, alignItems: 'center',
      fontFamily: "'Courier New', monospace",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 12, color: '#d0d0d0', letterSpacing: 2, marginRight: 12, fontWeight: 700 }}>
        AGENTS: {summary?.total || 0}
      </span>
      {stats.map(s => (
        <div key={s.key} style={{
          textAlign: 'center',
          background: `${s.color}18`,
          borderRadius: 8, padding: '6px 14px',
          border: `1px solid ${s.color}44`,
          minWidth: 64,
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
          <div style={{ fontSize: 10, color: '#d0d0d0', letterSpacing: 2, marginTop: 4, fontWeight: 600 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Log Panel ───────────────────────────────────────────────
function LogPanel({ events }) {
  return (
    <div style={{
      width: 280,
      background: dark.surface,
      borderLeft: `1px solid ${dark.border}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Courier New', monospace",
      flexShrink: 0,
    }}>
      <div style={{
        padding: '12px 14px',
        fontSize: 11, color: '#d0d0d0', letterSpacing: 3, fontWeight: 700,
        borderBottom: `1px solid ${dark.border}`,
        background: '#0a1628',
      }}>
        LIVE ACTIVITY LOG
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 12px',
      }}>
        {events.length === 0 && (
          <div style={{ fontSize: 12, color: dark.textMuted, padding: '16px 8px', textAlign: 'center', lineHeight: 1.5 }}>
            No recent activity.<br/>
            <span style={{ fontSize: 10, color: dark.textDim }}>
              Events appear when agents start running.
            </span>
          </div>
        )}
        {events.map((evt, i) => {
          const style = EVENT_STYLES[evt.event_type] || EVENT_STYLES.started;
          const time = new Date(evt.created_at).toLocaleTimeString('en-GB', { hour12: false });
          return (
            <div key={evt.id || i} style={{
              padding: '8px 10px',
              marginBottom: 6,
              borderRadius: 6,
              borderLeft: `3px solid ${style.color}`,
              background: `${style.color}12`,
              fontSize: 11, lineHeight: 1.5,
              animation: i === 0 ? 'fadeIn 0.3s ease' : undefined,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontWeight: 700, color: style.color, fontSize: 10, letterSpacing: 1 }}>{style.label}</span>
                <span style={{ color: dark.textDim, fontSize: 10 }}>{time}</span>
              </div>
              <div style={{ color: '#f0f0f0', fontWeight: 600, fontSize: 11 }}>{evt.agent_name}</div>
              {evt.message && <div style={{ color: dark.textMuted, fontSize: 10, marginTop: 2 }}>{evt.message}</div>}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        padding: '12px 14px',
        borderTop: `1px solid ${dark.border}`,
        background: '#0a1628',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 9, color: '#8090a0', letterSpacing: 2, marginBottom: 8, fontWeight: 700 }}>
          LEGEND
        </div>
        {[
          { color: '#00BCD4', label: 'Walking / Queued' },
          { color: '#9C27B0', label: 'Working' },
          { color: '#34A853', label: 'Reporting' },
          { color: '#FF1744', label: 'Error' },
          { color: '#FFD600', label: 'Done' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0, boxShadow: `0 0 6px ${item.color}88` }} />
            <span style={{ fontSize: 11, color: '#d0d0d0' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agent Inspector Modal ───────────────────────────────────
// Shows FULL details when you click an agent character:
// - current state, last run status, last error, tool envelopes
// - blockers (missing credentials, expired tokens)
// - action buttons: Run diagnostic, View full run, Open credentials
function AgentInspector({ info, clientId, onClose, onNavigate }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!info || !clientId) return;
    setLoading(true);
    // Pull the latest run for this agent (includes error, tool envelopes, grounding, output)
    api(`/clients/${clientId}/runs?agent_slug=${encodeURIComponent(info.slug)}&limit=1`)
      .then(rows => {
        const latest = Array.isArray(rows) ? rows[0] : rows?.runs?.[0];
        setDetails(latest || null);
      })
      .catch(() => setDetails(null))
      .finally(() => setLoading(false));
  }, [info, clientId]);

  if (!info) return null;
  const stateConfig = ANIM_STATE_CONFIG[info.animState] || ANIM_STATE_CONFIG.idle;
  const isError = info.animState === 'error' || details?.status === 'failed';
  const isBlocked = info.animState === 'blocked' || details?.status === 'blocked';

  const error = details?.error || info.stateDetail?.error || null;
  const blockers = details?.output?.blockers || details?.output?.preflight?.blockers || [];
  const grounding = details?.output?._grounding;
  const envelopeSummary = details?.output?._tool_envelopes_summary || [];
  const truthWarning = details?.output?._truth_warning;

  // Both buttons spawn an agent run and POLL for its result (instead of silent close).
  // The modal transitions to a "running → result" state so the user sees real feedback.
  const [actionState, setActionState] = useState(null); // { kind, status, runId, result, error }

  async function runAgentAndWatch(kind, agentSlug, payloadExtras) {
    if (!clientId) return;
    setRunning(true);
    setActionState({ kind, status: 'starting', runId: null });
    try {
      const resp = await api('/runs/execute', {
        method: 'POST',
        body: {
          clientId,
          agentSlug,
          taskPayload: {
            triggered_by: 'mission_control_inspector',
            investigating: info.slug,
            ...payloadExtras,
          },
        },
      });
      const runId = resp?.runId || resp?.run_id;
      setActionState({ kind, status: 'running', runId, agentSlug });

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // ~60 * 2s = 2 min max
      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
        try {
          const run = await api(`/runs/${runId}`);
          if (!run) continue;
          if (['success', 'failed', 'blocked', 'partial', 'cancelled'].includes(run.status)) {
            setActionState({ kind, status: run.status, runId, agentSlug, result: run });
            break;
          }
        } catch {
          // continue polling
        }
      }
      if (attempts >= maxAttempts) {
        setActionState(s => ({ ...s, status: 'timeout' }));
      }
    } catch (e) {
      setActionState({ kind, status: 'error', error: e.message });
    } finally {
      setRunning(false);
    }
  }

  async function runDiagnostic() {
    return runAgentAndWatch('investigate', 'credential-health-agent', {
      reason: error || blockers.map(b => b.reason).join(', ') || 'User requested investigation',
      failing_agent: info.slug,
    });
  }

  async function runFix() {
    return runAgentAndWatch('fix', 'code-fix-agent', {
      failing_agent: info.slug,
      error_to_fix: error || blockers.map(b => b.reason).join(', '),
      last_run_id: details?.id,
    });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: '#000000cc',
        zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: dark.surface,
          border: `2px solid ${stateConfig.color}`,
          borderRadius: 12, padding: 20,
          width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto',
          color: dark.text, fontFamily: "'Courier New', monospace",
          boxShadow: `0 0 40px ${stateConfig.color}44`,
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: stateConfig.color, fontWeight: 700, marginBottom: 4 }}>
              {stateConfig.icon} {stateConfig.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{info.name}</div>
            <div style={{ fontSize: 10, color: dark.textMuted, marginTop: 2 }}>{info.lane} Lane</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #ffffff22', color: dark.textMuted,
            borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
          }}>✕</button>
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 30, color: dark.textMuted, fontSize: 11 }}>
            Loading run details...
          </div>
        )}

        {/* BLOCKER section */}
        {!loading && isBlocked && blockers.length > 0 && (
          <div style={{
            background: '#FFAB0015', border: '1px solid #FFAB0055',
            borderRadius: 8, padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#FFAB00', fontWeight: 700, marginBottom: 8 }}>
              🚫 PREFLIGHT BLOCKED — MISSING DATA SOURCES
            </div>
            <div style={{ fontSize: 12, color: '#FEF3C7', lineHeight: 1.6, marginBottom: 10 }}>
              This agent cannot run because required data sources are not verified:
            </div>
            {blockers.map((b, i) => (
              <div key={i} style={{
                padding: 8, marginBottom: 6,
                background: '#00000033', border: '1px solid #FFAB0033', borderRadius: 6,
                fontSize: 11,
              }}>
                <div style={{ color: '#FFD54F', fontWeight: 700, marginBottom: 2 }}>
                  {b.kind === 'connector' ? `⚡ ${b.provider?.toUpperCase()} connector` : `📝 Profile field: ${b.field}`}
                </div>
                <div style={{ color: dark.textMuted, fontSize: 10 }}>{b.reason}</div>
              </div>
            ))}
          </div>
        )}

        {/* ERROR section */}
        {!loading && isError && error && (
          <div style={{
            background: '#FF174415', border: '1px solid #FF174455',
            borderRadius: 8, padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#FF1744', fontWeight: 700, marginBottom: 8 }}>
              ⚠ ERROR DETAIL
            </div>
            <pre style={{
              margin: 0, fontSize: 11, lineHeight: 1.6, color: '#fecaca',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              maxHeight: 200, overflowY: 'auto',
              fontFamily: 'inherit',
            }}>{error}</pre>
          </div>
        )}

        {/* TRUTH WARNING section */}
        {!loading && truthWarning && (
          <div style={{
            background: '#F59E0B15', border: '1px solid #F59E0B55',
            borderRadius: 8, padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: '#F59E0B', fontWeight: 700, marginBottom: 6 }}>
              ⚠ UNGROUNDED OUTPUT
            </div>
            <div style={{ fontSize: 11, color: '#fde68a', lineHeight: 1.5 }}>{truthWarning}</div>
          </div>
        )}

        {/* GROUNDING summary */}
        {!loading && grounding && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: dark.textMuted, fontWeight: 700, marginBottom: 6 }}>
              DATA GROUNDING
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 10 }}>
              <span style={{
                padding: '3px 8px', borderRadius: 4,
                background: grounding.grounding === 'supported' ? '#10B98133' : grounding.grounding === 'weakly_supported' ? '#F59E0B33' : '#FF174433',
                color: grounding.grounding === 'supported' ? '#10B981' : grounding.grounding === 'weakly_supported' ? '#F59E0B' : '#FF1744',
                fontWeight: 700,
              }}>
                {grounding.grounding.replace('_', ' ').toUpperCase()}
              </span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: '#ffffff08', color: dark.textMuted }}>
                Reality score: {grounding.reality_score}/100
              </span>
              <span style={{ padding: '3px 8px', borderRadius: 4, background: '#ffffff08', color: dark.textMuted }}>
                {grounding.valid_sources} valid / {grounding.total_sources} total
              </span>
            </div>
          </div>
        )}

        {/* TOOL ENVELOPES section */}
        {!loading && envelopeSummary.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: dark.textMuted, fontWeight: 700, marginBottom: 6 }}>
              TOOL CALLS — TRUTH ENVELOPES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {envelopeSummary.map((e, i) => {
                const qualityColor = {
                  valid: '#10B981', empty: '#6B7280', stale: '#F59E0B',
                  invalid: '#FF1744', misconfigured: '#FFAB00', unverified: '#9C27B0',
                }[e.quality] || '#6B7280';
                return (
                  <div key={i} style={{
                    padding: 8, background: '#ffffff05', borderRadius: 4,
                    borderLeft: `3px solid ${qualityColor}`, fontSize: 10,
                    display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ color: '#fff', fontWeight: 600 }}>{e.source}</div>
                      <div style={{ color: dark.textMuted, fontSize: 9 }}>{String(e.asset || '').slice(0, 50)}</div>
                    </div>
                    <span style={{ padding: '2px 6px', borderRadius: 3, background: `${qualityColor}22`, color: qualityColor, fontWeight: 700 }}>
                      {e.quality}
                    </span>
                    <span style={{ color: dark.textMuted, fontSize: 9 }}>
                      {e.rows} rows · {Math.round((e.confidence || 0) * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RUN INFO */}
        {!loading && details && (
          <div style={{ fontSize: 10, color: dark.textMuted, marginBottom: 14, lineHeight: 1.6 }}>
            {details.created_at && <div>Last run: {new Date(details.created_at).toLocaleString('en-GB')}</div>}
            {details.duration_ms && <div>Duration: {(details.duration_ms / 1000).toFixed(1)}s</div>}
            {info.runCount > 0 && <div>Total runs: {info.runCount}</div>}
          </div>
        )}

        {/* ACTION RESULT — shown when a button was clicked and we're polling/done */}
        {actionState && (
          <div style={{
            background: actionState.status === 'success' ? '#10B98115'
              : actionState.status === 'failed' || actionState.status === 'error' ? '#FF174415'
              : actionState.status === 'blocked' ? '#FFAB0015'
              : '#4285F415',
            border: `1px solid ${
              actionState.status === 'success' ? '#10B98155'
              : actionState.status === 'failed' || actionState.status === 'error' ? '#FF174455'
              : actionState.status === 'blocked' ? '#FFAB0055'
              : '#4285F455'
            }`,
            borderRadius: 8, padding: 14, marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, letterSpacing: 2, fontWeight: 700, marginBottom: 8,
              color: actionState.status === 'success' ? '#10B981'
                : actionState.status === 'failed' || actionState.status === 'error' ? '#FF1744'
                : actionState.status === 'blocked' ? '#FFAB00'
                : '#4285F4',
            }}>
              {actionState.kind === 'fix' ? '🔧 CODE FIX AGENT' : '🔍 CREDENTIAL HEALTH AGENT'} — {actionState.status?.toUpperCase()}
            </div>
            {['starting', 'running'].includes(actionState.status) && (
              <div style={{ fontSize: 11, color: '#cfd6e6', lineHeight: 1.5 }}>
                <span style={{ display: 'inline-block', animation: 'pulse 1.2s ease-in-out infinite', marginRight: 8 }}>●</span>
                Agent is running{actionState.runId ? ` (run ${actionState.runId.slice(0, 8)})` : ''}. This can take 30–60 seconds. Watching for the result...
              </div>
            )}
            {actionState.status === 'success' && actionState.result && (
              <div>
                <div style={{ fontSize: 11, color: '#10B981', marginBottom: 6 }}>✓ Run completed successfully</div>
                {actionState.result.output?.summary && (
                  <div style={{ fontSize: 10, color: '#cfd6e6', lineHeight: 1.5 }}>{actionState.result.output.summary}</div>
                )}
                {Array.isArray(actionState.result.output?.actions_taken) && actionState.result.output.actions_taken.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: dark.textMuted }}>
                    Actions: {actionState.result.output.actions_taken.map((a,i) => <div key={i}>• {typeof a === 'string' ? a : a.action || JSON.stringify(a).slice(0,80)}</div>)}
                  </div>
                )}
              </div>
            )}
            {actionState.status === 'blocked' && actionState.result && (
              <div style={{ fontSize: 11, color: '#fde68a', lineHeight: 1.5 }}>
                Agent could not run — it ran into the same type of problem: {actionState.result.output?.message || actionState.result.error || 'preflight blocked'}.
              </div>
            )}
            {actionState.status === 'partial' && actionState.result?.output?._truth_warning && (
              <div style={{ fontSize: 11, color: '#fde68a', lineHeight: 1.5 }}>
                ⚠ {actionState.result.output._truth_warning}
              </div>
            )}
            {['failed', 'error'].includes(actionState.status) && (
              <div style={{ fontSize: 11, color: '#fecaca', lineHeight: 1.5 }}>
                {actionState.error || actionState.result?.error || 'Agent run failed. Check the full run details for more info.'}
              </div>
            )}
            {actionState.status === 'timeout' && (
              <div style={{ fontSize: 11, color: '#fde68a', lineHeight: 1.5 }}>
                Still running after 2 minutes. The run is queued — check back later in the Runs view.
              </div>
            )}
          </div>
        )}

        {/* ACTION BUTTONS */}
        {!loading && (isError || isBlocked) && !actionState && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isBlocked && (
              <button
                onClick={() => onNavigate?.({ view: 'credentials' })}
                style={{
                  flex: 1, minWidth: 120,
                  background: 'linear-gradient(135deg,#F59E0B,#EA580C)',
                  border: 'none', borderRadius: 8, padding: '10px 14px',
                  color: '#fff', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: 1,
                  cursor: 'pointer',
                }}
              >
                🔑 FIX CREDENTIALS
              </button>
            )}
            <button
              onClick={runDiagnostic}
              disabled={running}
              style={{
                flex: 1, minWidth: 120,
                background: running ? '#ffffff14' : 'linear-gradient(135deg,#4285F4,#1a73e8)',
                border: 'none', borderRadius: 8, padding: '10px 14px',
                color: '#fff', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: 1,
                cursor: running ? 'not-allowed' : 'pointer',
              }}
            >
              {running ? 'Starting...' : '🔍 INVESTIGATE'}
            </button>
            <button
              onClick={runFix}
              disabled={running}
              style={{
                flex: 1, minWidth: 120,
                background: running ? '#ffffff14' : 'linear-gradient(135deg,#10B981,#059669)',
                border: 'none', borderRadius: 8, padding: '10px 14px',
                color: '#fff', fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: 1,
                cursor: running ? 'not-allowed' : 'pointer',
              }}
              title="Trigger Code Fix Agent to propose an actual code change that fixes this"
            >
              {running ? 'Starting...' : '🔧 PROPOSE FIX'}
            </button>
          </div>
        )}

        {!loading && details?.id && (
          <div style={{ marginTop: 14, textAlign: 'center' }}>
            <button
              onClick={() => onNavigate?.({ view: 'runs', runId: details.id })}
              style={{
                background: 'transparent', border: '1px solid #ffffff22', borderRadius: 6,
                color: dark.textMuted, fontFamily: 'inherit', fontSize: 10, padding: '6px 14px', cursor: 'pointer',
              }}
            >
              View full run details →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Phase 1: Single Customer Live View ─────────────────────
function SingleCustomerLive({ clientId }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const phaserRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const data = await api(`/clients/${clientId}/mission-control/state`);
      setState(data);
      if (sceneRef.current?.updateAgentStates) {
        sceneRef.current.updateAgentStates(data.agents);
      }
    } catch (e) {
      console.error('Mission control fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Initial load
  useEffect(() => { setLoading(true); load(); }, [load]);

  // Poll every 5s
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // Initialize Phaser — wait for container to have real dimensions before starting
  useEffect(() => {
    if (!phaserRef.current || gameRef.current) return;

    let cancelled = false;
    let rafId = null;

    // Wait until the ref has layout dimensions (can be 0 on first paint)
    const waitForSize = () => {
      if (cancelled) return;
      const el = phaserRef.current;
      if (!el) return;
      const w = el.clientWidth || el.offsetWidth;
      const h = el.clientHeight || el.offsetHeight;
      if (w < 50 || h < 50) {
        rafId = requestAnimationFrame(waitForSize);
        return;
      }
      startPhaser(w, h);
    };

    const startPhaser = (initW, initH) => {
      import('phaser').then((PhaserModule) => {
        if (cancelled) return;
        const Phaser = PhaserModule.default || PhaserModule;
        import('./mission-control/OfficeScene.js').then((mod) => {
          if (cancelled) return;
          const OfficeScene = mod.default;
          const scene = new OfficeScene();
          sceneRef.current = scene;

          gameRef.current = new Phaser.Game({
            type: Phaser.AUTO,
            parent: phaserRef.current,
            width: initW,
            height: initH,
            backgroundColor: '#07070f',
            scene,
            scale: {
              mode: Phaser.Scale.RESIZE,
              autoCenter: Phaser.Scale.CENTER_BOTH,
              parent: phaserRef.current,
              width: initW,
              height: initH,
            },
            render: { antialias: false, pixelArt: true },
          });

          // If state already loaded before the scene was ready, push it in now
          setTimeout(() => {
            if (cancelled || !sceneRef.current) return;
            if (state?.agents?.length) {
              try { sceneRef.current.updateAgentStates(state.agents); } catch {}
            }
          }, 200);
        });
      });
    };

    waitForSize();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push agent state into the scene whenever state arrives (handles race where
  // state arrives before Phaser was ready)
  useEffect(() => {
    if (!sceneRef.current?.updateAgentStates) return;
    if (!state?.agents?.length) return;
    try { sceneRef.current.updateAgentStates(state.agents); } catch {}
  }, [state]);

  // Resize handler
  useEffect(() => {
    const onResize = () => {
      if (gameRef.current && phaserRef.current) {
        gameRef.current.scale.resize(
          phaserRef.current.clientWidth,
          phaserRef.current.clientHeight,
        );
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Listen for agent clicks from Phaser
  useEffect(() => {
    const handler = (e) => {
      const { slug, name, lane, x, y } = e.detail;
      const agentData = state?.agents?.find(a => a.slug === slug);
      if (agentData) {
        // Convert Phaser coords to screen coords (approximate)
        const canvas = phaserRef.current?.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        setTooltip({
          ...agentData,
          screenX: (rect?.left || 0) + x * (rect?.width / (canvas?.width || 1)),
          screenY: (rect?.top || 0) + y * (rect?.height / (canvas?.height || 1)),
        });
      }
    };
    window.addEventListener('mc-agent-click', handler);
    return () => window.removeEventListener('mc-agent-click', handler);
  }, [state]);

  if (!clientId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <Empty icon={Monitor} msg="Select a client to view Mission Control" />
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      height: 'calc(100vh - 80px)',
      display: 'flex',
      flexDirection: 'column',
      background: dark.bg,
      color: dark.text,
    }}>
      {/* CSS for fadeIn animation */}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>

      <OrchestratorBar state={state} />
      <StatsBar summary={state?.summary} />

      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden', minHeight: 400 }}>
        {/* Phaser canvas container */}
        <div
          ref={phaserRef}
          style={{
            flex: 1, position: 'relative',
            minWidth: 400, minHeight: 400,
          }}
          onClick={() => setTooltip(null)}
        />

        {/* Agent tooltip overlay */}
        <AgentInspector
          info={tooltip}
          clientId={clientId}
          onClose={() => setTooltip(null)}
          onNavigate={(detail) => {
            setTooltip(null);
            window.dispatchEvent(new CustomEvent('navigate', { detail }));
          }}
        />

        {/* Log panel */}
        <LogPanel events={state?.events || []} />

        {/* Loading overlay */}
        {loading && !state && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${dark.bg}cc`,
            zIndex: 100,
          }}>
            <div style={{ textAlign: 'center' }}>
              <Spin />
              <div style={{ fontSize: 10, color: dark.textMuted, marginTop: 8, fontFamily: "'Courier New', monospace" }}>
                Connecting to agents...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2 — MULTI-CUSTOMER WALL VIEW
// Video-wall showing all clients as pods with live status
// ═══════════════════════════════════════════════════════════════
function CustomerWall({ clients, onSelectClient }) {
  const [states, setStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!clients.length) { setLoading(false); return; }
    const results = await Promise.allSettled(
      clients.map(c =>
        api(`/clients/${c.id}/mission-control/state`)
          .then(s => [c.id, s])
          .catch(() => [c.id, null])
      )
    );
    const next = {};
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value[1]) next[r.value[0]] = r.value[1];
    });
    setStates(next);
    setLastRefresh(new Date());
    setLoading(false);
  }, [clients]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const id = setInterval(fetchAll, 8000);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) {
    return (
      <div style={{ height: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark.bg }}>
        <Spin />
      </div>
    );
  }
  if (!clients.length) {
    return (
      <div style={{ padding: spacing.xl, background: dark.bg, minHeight: 'calc(100vh - 180px)' }}>
        <Empty icon={Users} msg="No clients to display" />
      </div>
    );
  }

  return (
    <div style={{
      padding: spacing.md,
      background: dark.bg,
      minHeight: 'calc(100vh - 180px)',
      color: dark.text,
      fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 3 }}>OPS WALL</div>
          <div style={{ fontSize: 9, color: '#4285F4', letterSpacing: 3 }}>
            {clients.length} CLIENTS • {lastRefresh && `UPDATED ${lastRefresh.toLocaleTimeString('en-GB', { hour12: false })}`}
          </div>
        </div>
        <button
          onClick={fetchAll}
          style={{
            background: 'linear-gradient(135deg,#4285F4,#1a73e8)',
            border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'inherit',
            fontSize: 10, fontWeight: 700, letterSpacing: 2, padding: '8px 16px',
            cursor: 'pointer', boxShadow: '0 0 16px #4285F466',
          }}
        >
          <RefreshCw size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          REFRESH
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: spacing.md,
      }}>
        {clients.map(client => {
          const s = states[client.id];
          const summary = s?.summary || { total: 0, working: 0, errors: 0, blocked: 0, done: 0, queued: 0, idle: 0 };
          const hasTrouble = summary.errors > 0 || summary.blocked > 0;
          const isBusy = summary.working > 0 || summary.queued > 0;
          const borderCol = hasTrouble ? '#FF1744' : isBusy ? '#9C27B0' : '#ffffff14';
          const glow = hasTrouble ? '#FF174466' : isBusy ? '#9C27B066' : 'transparent';
          return (
            <div
              key={client.id}
              onClick={() => onSelectClient(client)}
              style={{
                cursor: 'pointer',
                background: dark.surface,
                border: `2px solid ${borderCol}`,
                borderRadius: 12, padding: 14,
                boxShadow: isBusy || hasTrouble ? `0 0 24px ${glow}` : 'none',
                transition: 'all 0.3s',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Pulse animation background */}
              {isBusy && !hasTrouble && (
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: 'radial-gradient(circle at 50% 50%, #9C27B015 0%, transparent 70%)',
                  animation: 'pulse 3s ease-in-out infinite',
                }} />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, position: 'relative' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{client.name}</div>
                  <div style={{ fontSize: 8, color: dark.textDim, letterSpacing: 2 }}>{summary.total} AGENTS</div>
                </div>
                {hasTrouble && (
                  <span style={{
                    fontSize: 7, fontWeight: 700, letterSpacing: 2,
                    background: '#FF174422', color: '#FF1744',
                    padding: '3px 8px', borderRadius: 4, border: '1px solid #FF174444',
                  }}>NEEDS ATTENTION</span>
                )}
                {!hasTrouble && isBusy && (
                  <span style={{
                    fontSize: 7, fontWeight: 700, letterSpacing: 2,
                    background: '#9C27B022', color: '#9C27B0',
                    padding: '3px 8px', borderRadius: 4, border: '1px solid #9C27B044',
                  }}>ACTIVE</span>
                )}
                {!hasTrouble && !isBusy && (
                  <span style={{
                    fontSize: 7, fontWeight: 700, letterSpacing: 2,
                    background: '#ffffff08', color: dark.textDim,
                    padding: '3px 8px', borderRadius: 4, border: '1px solid #ffffff14',
                  }}>IDLE</span>
                )}
              </div>

              {/* Mini stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10, position: 'relative' }}>
                <PodStat label="WORK" value={summary.working} color="#9C27B0" />
                <PodStat label="QUEUE" value={summary.queued} color="#00BCD4" />
                <PodStat label="ERR" value={summary.errors} color="#FF1744" />
                <PodStat label="DONE" value={summary.done} color="#00E676" />
              </div>

              {/* Agent dots */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 14, position: 'relative' }}>
                {(s?.agents || []).slice(0, 16).map(a => {
                  const stateCfg = ANIM_STATE_CONFIG[a.animState] || ANIM_STATE_CONFIG.idle;
                  return (
                    <span
                      key={a.slug}
                      title={`${a.name} — ${stateCfg.label}`}
                      style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: stateCfg.color,
                        boxShadow: a.animState === 'working' ? `0 0 6px ${stateCfg.color}` :
                                   a.animState === 'error' ? `0 0 6px ${stateCfg.color}` : 'none',
                        animation: a.animState === 'working' ? 'pulse 1.5s ease-in-out infinite' : undefined,
                      }}
                    />
                  );
                })}
                {(s?.agents?.length || 0) > 16 && (
                  <span style={{ fontSize: 8, color: dark.textDim }}>+{s.agents.length - 16}</span>
                )}
              </div>

              {/* Recent event preview */}
              {s?.events?.[0] && (
                <div style={{
                  marginTop: 10, paddingTop: 8,
                  borderTop: `1px solid ${dark.border}`,
                  fontSize: 8, color: dark.textDim, position: 'relative',
                }}>
                  <span style={{ color: (EVENT_STYLES[s.events[0].event_type]?.color) || '#666' }}>
                    {EVENT_STYLES[s.events[0].event_type]?.label || s.events[0].event_type}
                  </span>
                  {' '}— {s.events[0].agent_name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function PodStat({ label, value, color }) {
  return (
    <div style={{
      textAlign: 'center',
      background: `${color}0d`,
      border: `1px solid ${color}22`,
      borderRadius: 6, padding: '4px 2px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'Courier New', monospace" }}>{value}</div>
      <div style={{ fontSize: 6, color: dark.textDim, letterSpacing: 2, marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3 — HISTORICAL REPLAY TIMELINE
// Hour-by-hour bar chart of activity + full event log
// ═══════════════════════════════════════════════════════════════
function ReplayView({ clientId, clientName, onExit }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | errors | completions

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api(`/clients/${clientId}/mission-control/state`)
      .then(s => { setEvents(s.events || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  if (!clientId) {
    return <div style={{ padding: spacing.xl, background: dark.bg, minHeight: 'calc(100vh - 180px)' }}>
      <Empty icon={Clock} msg="Select a client to view history" />
    </div>;
  }
  if (loading) {
    return <div style={{ height: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark.bg }}>
      <Spin />
    </div>;
  }

  // Group events by hour
  const buckets = {};
  events.forEach(ev => {
    const hour = new Date(ev.created_at);
    hour.setMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(ev);
  });
  const sortedKeys = Object.keys(buckets).sort();
  // Fill in missing hours for the last 24 hours
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const filledHours = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    filledHours.push(t.toISOString());
  }

  const counts = filledHours.map(k => ({
    hour: k,
    total: (buckets[k] || []).length,
    completed: (buckets[k] || []).filter(e => e.event_type === 'completed').length,
    failed: (buckets[k] || []).filter(e => e.event_type === 'failed').length,
    started: (buckets[k] || []).filter(e => e.event_type === 'started').length,
  }));
  const maxCount = Math.max(1, ...counts.map(c => c.total));

  // Agent activity breakdown
  const byAgent = {};
  events.forEach(ev => {
    if (!byAgent[ev.agent_slug]) byAgent[ev.agent_slug] = { name: ev.agent_name, started: 0, completed: 0, failed: 0, total: 0 };
    byAgent[ev.agent_slug].total++;
    if (ev.event_type === 'completed') byAgent[ev.agent_slug].completed++;
    else if (ev.event_type === 'failed') byAgent[ev.agent_slug].failed++;
    else if (ev.event_type === 'started') byAgent[ev.agent_slug].started++;
  });
  const agentList = Object.values(byAgent).sort((a, b) => b.total - a.total);

  // Filter events
  const filteredEvents = filter === 'errors' ? events.filter(e => e.event_type === 'failed' || e.event_type === 'blocked')
    : filter === 'completions' ? events.filter(e => e.event_type === 'completed')
    : events;

  const totalEvents = events.length;
  const totalCompleted = events.filter(e => e.event_type === 'completed').length;
  const totalFailed = events.filter(e => e.event_type === 'failed').length;
  const successRate = totalCompleted + totalFailed > 0 ? Math.round((totalCompleted / (totalCompleted + totalFailed)) * 100) : 100;

  return (
    <div style={{
      padding: spacing.md,
      background: dark.bg,
      minHeight: 'calc(100vh - 180px)',
      color: dark.text,
      fontFamily: "'Courier New', monospace",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onExit} style={{
            background: 'transparent', border: '1px solid #ffffff14',
            color: dark.text, borderRadius: 6, padding: '6px 10px',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 10,
          }}>
            <ArrowLeft size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            BACK
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 3 }}>SPRINT REPLAY</div>
            <div style={{ fontSize: 9, color: '#4285F4', letterSpacing: 3 }}>
              {clientName?.toUpperCase() || 'CLIENT'} • LAST 24H
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="ALL" />
          <FilterBtn active={filter === 'completions'} onClick={() => setFilter('completions')} label="WINS" color="#00E676" />
          <FilterBtn active={filter === 'errors'} onClick={() => setFilter('errors')} label="ERRORS" color="#FF1744" />
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.sm, marginBottom: spacing.md }}>
        <KpiCard label="TOTAL EVENTS" value={totalEvents} color="#4285F4" />
        <KpiCard label="COMPLETED" value={totalCompleted} color="#00E676" />
        <KpiCard label="FAILED" value={totalFailed} color="#FF1744" />
        <KpiCard label="SUCCESS RATE" value={`${successRate}%`} color={successRate >= 80 ? '#00E676' : successRate >= 50 ? '#FFAB00' : '#FF1744'} />
      </div>

      {/* Timeline bar chart */}
      <div style={{
        background: dark.surface, border: `1px solid ${dark.border}`,
        borderRadius: 10, padding: 16, marginBottom: spacing.md,
      }}>
        <div style={{ fontSize: 9, color: dark.textDim, letterSpacing: 3, marginBottom: 12 }}>ACTIVITY BY HOUR</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
          {counts.map((c, idx) => {
            const h = Math.round((c.total / maxCount) * 100);
            return (
              <div key={c.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div
                  title={`${new Date(c.hour).toLocaleString('en-GB', { hour12: false })} — ${c.total} events (${c.completed} done, ${c.failed} failed)`}
                  style={{
                    width: '80%', height: `${Math.max(h, 2)}%`, minHeight: 2,
                    background: c.failed > 0
                      ? 'linear-gradient(to top, #FF1744 0%, #9C27B0 50%, #4285F4 100%)'
                      : 'linear-gradient(to top, #4285F4 0%, #00E676 100%)',
                    borderRadius: 3,
                    boxShadow: c.total > 0 ? '0 0 8px #4285F466' : 'none',
                    transition: 'all 0.3s',
                  }}
                />
                <span style={{ fontSize: 7, color: dark.textDim }}>
                  {new Date(c.hour).getHours().toString().padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent breakdown & event log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
        {/* Top agents */}
        <div style={{
          background: dark.surface, border: `1px solid ${dark.border}`,
          borderRadius: 10, padding: 16,
        }}>
          <div style={{ fontSize: 9, color: dark.textDim, letterSpacing: 3, marginBottom: 12 }}>TOP AGENTS</div>
          {agentList.length === 0 && (
            <div style={{ fontSize: 9, color: dark.textDim, textAlign: 'center', padding: 20 }}>
              No agent activity in this window
            </div>
          )}
          {agentList.slice(0, 10).map(a => (
            <div key={a.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0', borderBottom: `1px solid ${dark.border}`,
              fontSize: 10,
            }}>
              <span style={{ color: dark.text }}>{a.name}</span>
              <div style={{ display: 'flex', gap: 8, fontSize: 8 }}>
                <span style={{ color: '#4285F4' }}>{a.started}▶</span>
                <span style={{ color: '#00E676' }}>{a.completed}✓</span>
                {a.failed > 0 && <span style={{ color: '#FF1744' }}>{a.failed}✗</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Event log */}
        <div style={{
          background: dark.surface, border: `1px solid ${dark.border}`,
          borderRadius: 10, padding: 16,
          display: 'flex', flexDirection: 'column', maxHeight: 400,
        }}>
          <div style={{ fontSize: 9, color: dark.textDim, letterSpacing: 3, marginBottom: 12 }}>
            EVENT LOG ({filteredEvents.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredEvents.length === 0 && (
              <div style={{ fontSize: 9, color: dark.textDim, textAlign: 'center', padding: 20 }}>
                No events match this filter
              </div>
            )}
            {filteredEvents.slice(0, 100).map((ev, i) => {
              const style = EVENT_STYLES[ev.event_type] || EVENT_STYLES.started;
              const time = new Date(ev.created_at).toLocaleString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={ev.id || i} style={{
                  padding: 6, marginBottom: 4,
                  borderLeft: `3px solid ${style.color}`,
                  background: `${style.color}0a`,
                  borderRadius: 4,
                  fontSize: 9,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: style.color, fontWeight: 700 }}>{style.label}</span>
                    <span style={{ color: dark.textDim }}>{time}</span>
                  </div>
                  <div style={{ color: dark.text, marginTop: 2 }}>{ev.agent_name}</div>
                  {ev.message && <div style={{ color: dark.textMuted, marginTop: 2 }}>{ev.message}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label, color }) {
  const c = color || '#4285F4';
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${c}33` : 'transparent',
        border: `1px solid ${active ? c : '#ffffff14'}`,
        color: active ? c : '#888', borderRadius: 6, padding: '6px 12px',
        fontFamily: 'inherit', fontSize: 9, letterSpacing: 2, fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{
      background: dark.surface, border: `1px solid ${dark.border}`,
      borderRadius: 10, padding: 14,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 100% 0%, ${color}22 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ fontSize: 8, color: dark.textDim, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, position: 'relative' }}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4 — PREMIUM 2.5D OVERLAY
// Applied as CSS effects over the Phase 1 Phaser canvas
// (glass panels, glow, depth) — handled by view wrapper
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — Mode switcher wrapping all phases
// ═══════════════════════════════════════════════════════════════
export default function MissionControlView({ clientId, clients = [], setClientId }) {
  const [mode, setMode] = useState('live');

  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div style={{
      background: dark.bg,
      minHeight: 'calc(100vh - 80px)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Mode switcher header */}
      <div style={{
        padding: '10px 16px',
        background: '#07070fee',
        borderBottom: `1px solid ${dark.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
        backdropFilter: 'blur(8px)',
        fontFamily: "'Courier New', monospace",
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 900, color: '#fff',
          letterSpacing: 4, textShadow: '0 0 20px #4285F4',
        }}>
          AGENT MISSION CONTROL
        </div>
        <div style={{ flex: 1 }} />
        <ModeButton active={mode === 'live'} onClick={() => setMode('live')} icon={Maximize2} label="LIVE" />
        <ModeButton active={mode === 'wall'} onClick={() => setMode('wall')} icon={Grid3x3} label="WALL" />
        <ModeButton active={mode === 'replay'} onClick={() => setMode('replay')} icon={Rewind} label="REPLAY" />
      </div>

      {/* Mode content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'live' && (
          <SingleCustomerLive clientId={clientId} />
        )}
        {mode === 'wall' && (
          <CustomerWall
            clients={clients}
            onSelectClient={(c) => { if (setClientId) setClientId(c.id); setMode('live'); }}
          />
        )}
        {mode === 'replay' && (
          <ReplayView
            clientId={clientId}
            clientName={selectedClient?.name}
            onExit={() => setMode('live')}
          />
        )}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8,
        background: active ? 'linear-gradient(135deg,#4285F4,#1a73e8)' : 'transparent',
        color: active ? '#fff' : '#888',
        border: `1px solid ${active ? 'transparent' : '#ffffff14'}`,
        fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 2,
        cursor: 'pointer', transition: 'all 0.15s',
        boxShadow: active ? '0 0 20px #4285F466' : 'none',
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
