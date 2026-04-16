import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, AlertTriangle, CheckCircle, Clock, RefreshCw, ChevronDown,
  ChevronRight, Users, Zap, Shield, TrendingUp, XCircle, Play, Eye,
  Filter, Server, Wifi, WifiOff, ArrowRight, RotateCcw, AlertCircle,
  Circle, Layers, FileText, Trash2
} from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, fontSize, fontWeight, radius, shadows, transitions } from '../theme.js';
import { Card, Badge, Dot, Spin } from '../components/index.jsx';

// ─── Constants ──────────────────────────────────────────────────
const STATUS_COLORS = {
  success: '#10B981', executed: '#10B981',
  failed: '#EF4444',
  running: '#3B82F6',
  queued: '#6B7280',
  pending_approval: '#F59E0B',
  dry_run: '#8B5CF6',
  cancelled: '#9CA3AF',
  blocked_dependency: '#F97316',
};

const LANE_COLORS = colors.lanes;

const MONO = "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace";

// Which agents are responsible for each KPI metric
const METRIC_AGENTS = {
  mobile_pagespeed: ['Technical SEO Crawl Agent', 'Website QA Agent', 'CRO Agent'],
  desktop_pagespeed: ['Technical SEO Crawl Agent', 'Website QA Agent', 'CRO Agent'],
  page1_keyword_count: ['SEO Core Agent', 'GSC Daily Monitor', 'Keyword Research Agent'],
  google_reviews_count: ['Reviews / GBP / Authority Agent', 'Local SEO Agent'],
  google_reviews_rating: ['Reviews / GBP / Authority Agent', 'Local SEO Agent'],
  domain_authority: ['Backlink & Digital PR Agent', 'SEO Core Agent'],
  referring_domains_count: ['Backlink & Digital PR Agent'],
  indexed_pages: ['Technical SEO Crawl Agent', 'GSC Daily Monitor'],
  local_3pack_present: ['Local SEO Agent', 'Reviews / GBP / Authority Agent'],
};

// ─── Helpers ────────────────────────────────────────────────────
function relativeTime(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 0) return 'just now';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '--';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function parseAgentOutput(output) {
  if (!output) return null;
  try {
    const data = typeof output === 'string' ? JSON.parse(output) : output;
    const findings = [];
    const metrics = [];
    const actions = [];

    // Extract key-value metrics
    for (const [key, val] of Object.entries(data)) {
      if (val === null || val === undefined) continue;
      const k = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
      if (typeof val === 'number' || (typeof val === 'string' && !val.includes('\n') && val.length < 80)) {
        metrics.push({ label: k, value: String(val) });
      } else if (Array.isArray(val)) {
        if (key.toLowerCase().includes('action') || key.toLowerCase().includes('todo') || key.toLowerCase().includes('recommendation')) {
          val.slice(0, 5).forEach(item => {
            actions.push(typeof item === 'string' ? item : (item.title || item.description || item.text || JSON.stringify(item)));
          });
        } else if (val.length > 0 && typeof val[0] === 'string') {
          findings.push({ label: k, items: val.slice(0, 5) });
        } else {
          metrics.push({ label: k, value: `${val.length} items` });
        }
      } else if (typeof val === 'object') {
        metrics.push({ label: k, value: Object.keys(val).length + ' entries' });
      } else if (typeof val === 'string' && val.length < 300) {
        findings.push({ label: k, items: [val] });
      }
    }

    return { metrics: metrics.slice(0, 8), findings: findings.slice(0, 4), actions: actions.slice(0, 5), raw: data };
  } catch {
    if (typeof output === 'string' && output.length > 0) {
      return { metrics: [], findings: [{ label: 'Output', items: [output.slice(0, 500)] }], actions: [], raw: output };
    }
    return null;
  }
}

function getErrorFix(errorMsg) {
  if (!errorMsg) return null;
  const msg = String(errorMsg).toLowerCase();
  if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('auth') || msg.includes('token')) {
    return 'Credential expired or invalid. Go to Credentials and re-authenticate the relevant service.';
  }
  if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota')) {
    return 'API rate limit hit. Wait 15-30 minutes and re-run, or upgrade the API plan.';
  }
  if (msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('network')) {
    return 'Network/timeout error. Check that the external service is reachable and retry.';
  }
  if (msg.includes('404') || msg.includes('not found')) {
    return 'Resource not found. Verify the target URL/ID is correct in the agent config.';
  }
  if (msg.includes('500') || msg.includes('internal server')) {
    return 'External service error. This is on their end -- retry in a few minutes.';
  }
  if (msg.includes('permission') || msg.includes('forbidden') || msg.includes('403')) {
    return 'Permission denied. Check that the connected account has the required access/scopes.';
  }
  return 'Check the full error output for details. If this keeps happening, review the agent config and credentials.';
}

// ─── Sub-components ─────────────────────────────────────────────

// ─── Now Running panel ─────────────────────────────────────────
// Live view of what's executing for the selected client (or aggregate
// across all clients when 'all' is picked). Shows elapsed time,
// next-up queue, and recent completions — the user's at-a-glance
// "what's happening right now".
function NowRunningPanel({ clientId, clients }) {
  const [data, setData] = useState({ running: [], queued: [], recent: [], summary: {} });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0); // force re-render for live elapsed time

  const load = useCallback(async () => {
    try {
      if (clientId && clientId !== 'all') {
        const d = await api(`/clients/${clientId}/now-running`);
        setData(d || { running: [], queued: [], recent: [], summary: {} });
      } else if (clients?.length) {
        // Aggregate across all clients
        const results = await Promise.all(
          clients.map(c =>
            api(`/clients/${c.id}/now-running`)
              .then(r => ({ ...r, _clientName: c.name }))
              .catch(() => null)
          )
        );
        const agg = { running: [], queued: [], recent: [], summary: { running_count: 0, queued_count: 0 } };
        for (const r of results) {
          if (!r) continue;
          (r.running || []).forEach(x => agg.running.push({ ...x, _clientName: r._clientName }));
          (r.queued || []).forEach(x => agg.queued.push({ ...x, _clientName: r._clientName }));
          (r.recent || []).forEach(x => agg.recent.push({ ...x, _clientName: r._clientName }));
          agg.summary.running_count += r.summary?.running_count || 0;
          agg.summary.queued_count += r.summary?.queued_count || 0;
        }
        agg.recent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        agg.recent = agg.recent.slice(0, 10);
        setData(agg);
      }
    } catch (e) {
      console.error('now-running fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [clientId, clients]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  // Poll every 5s for fresh elapsed data + tick every 1s for smooth countdown
  useEffect(() => {
    const pollT = setInterval(load, 5000);
    const tickT = setInterval(() => setTick(t => t + 1), 1000);
    return () => { clearInterval(pollT); clearInterval(tickT); };
  }, [load]);

  // ── Live elapsed: server elapsed + time since last fetch ──
  const nowRef = Date.now();
  const liveElapsed = (run) => {
    const serverTs = new Date(run.created_at).getTime();
    return Math.max(0, Math.round((nowRef - serverTs) / 1000));
  };

  // ── ETA guess: typical run takes 60-120s for most agents ──
  const etaText = (run) => {
    const elapsed = liveElapsed(run);
    if (elapsed < 30) return 'just started';
    if (elapsed < 90) return `~${90 - elapsed}s remaining`;
    if (elapsed < 300) return 'finishing up';
    return 'long-running';
  };

  const fmt = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const running = data.running || [];
  const queued = data.queued || [];
  const recent = data.recent || [];
  const nextUp = queued[0];
  const showingAll = clientId === 'all' || !clientId;

  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${running.length > 0 ? '#3B82F6' : colors.border}`,
        borderRadius: radius.xl,
        marginBottom: spacing.md,
        padding: '14px 20px',
        boxShadow: running.length > 0 ? `0 0 0 3px #3B82F610` : shadows.sm,
        transition: transitions.normal,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: running.length > 0 || queued.length > 0 ? 12 : 0 }}>
        <Activity size={14} color={running.length > 0 ? '#3B82F6' : colors.textMuted} style={{ animation: running.length > 0 ? 'pulse 1.5s infinite' : 'none' }} />
        <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>
          Now Running {showingAll ? '(all clients)' : ''}
        </span>
        <span style={{ fontSize: fontSize.xs, color: colors.textDisabled, fontFamily: MONO }}>
          {running.length} active · {queued.length} queued
        </span>
        {loading && <Spin />}
      </div>

      {running.length === 0 && queued.length === 0 ? (
        <div style={{ fontSize: fontSize.xs, color: colors.textDisabled, fontStyle: 'italic' }}>
          Idle. {recent.length > 0 && `Last run: ${recent[0].agent_name || recent[0].agent_slug} (${relativeTime(recent[0].created_at)})`}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Running rows */}
          {running.map(r => {
            const el = liveElapsed(r);
            return (
              <div
                key={r.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  background: '#EBF5FF',
                  border: '1px solid #BFDBFE',
                  borderRadius: radius.md,
                }}
              >
                <StatusDot status="running" size={10} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: '#1E3A8A' }}>
                      {r.agent_name || r.agent_slug || 'Unknown'}
                    </span>
                    {r.lane && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 6px',
                          borderRadius: radius.full,
                          background: (LANE_COLORS[r.lane] || colors.textMuted) + '22',
                          color: LANE_COLORS[r.lane] || colors.textMuted,
                          fontWeight: fontWeight.bold,
                          textTransform: 'uppercase',
                        }}
                      >
                        {r.lane}
                      </span>
                    )}
                    {showingAll && r._clientName && (
                      <span style={{ fontSize: fontSize.xs, color: colors.primary }}>
                        · {r._clientName}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: fontSize.xs, color: '#3B82F6', fontFamily: MONO }}>
                    Started {relativeTime(r.created_at)} · {etaText(r)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: '#1E3A8A', fontFamily: MONO, lineHeight: 1 }}>
                    {fmt(el)}
                  </div>
                  <div style={{ fontSize: 9, color: '#3B82F6', fontFamily: MONO }}>elapsed</div>
                </div>
              </div>
            );
          })}

          {/* Next up */}
          {nextUp && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 12px',
                background: colors.surfaceHover,
                borderRadius: radius.md,
                fontSize: fontSize.xs,
                color: colors.textSecondary,
              }}
            >
              <Clock size={11} color={colors.textMuted} />
              <span>
                <strong>Next in queue:</strong> {nextUp.agent_name || nextUp.agent_slug}
                {showingAll && nextUp._clientName && ` · ${nextUp._clientName}`}
                {queued.length > 1 && ` (+${queued.length - 1} more)`}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthBar({ score, label }) {
  const barColor = score >= 80 ? '#10B981' : score >= 50 ? '#F59E0B' : '#EF4444';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 120 }}>
      <span style={{ fontSize: fontSize.xs, color: colors.textSecondary, whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: colors.borderLight, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, Math.max(0, score))}%`, height: '100%',
          borderRadius: 3, background: barColor, transition: transitions.normal,
        }} />
      </div>
      <span style={{ fontSize: fontSize.xs, fontFamily: MONO, color: barColor, fontWeight: fontWeight.bold, minWidth: 28, textAlign: 'right' }}>
        {Math.round(score)}
      </span>
    </div>
  );
}

function StatusDot({ status, size = 8 }) {
  const color = STATUS_COLORS[status] || colors.textDisabled;
  const isRunning = status === 'running';
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      background: color, flexShrink: 0,
      boxShadow: `0 0 ${isRunning ? 8 : 4}px ${color}`,
      animation: isRunning ? 'pulse 1.5s ease-in-out infinite' : 'none',
    }} />
  );
}

function FilterPill({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 12px', borderRadius: radius.full, border: `1px solid ${active ? colors.primary : colors.border}`,
      background: active ? colors.primaryLightest : 'transparent', color: active ? colors.primary : colors.textSecondary,
      fontSize: fontSize.xs, fontWeight: active ? fontWeight.bold : fontWeight.medium,
      cursor: 'pointer', transition: transitions.fast, whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  );
}

function RunRow({ run, clientName, expanded, onToggle, onRerun }) {
  const duration = run.completed_at && run.created_at
    ? (new Date(run.completed_at).getTime() - new Date(run.created_at).getTime()) / 1000
    : null;
  const parsed = expanded ? parseAgentOutput(run.output || run.result) : null;
  const isFailed = run.status === 'failed';
  const errorMsg = run.error || run.error_message || (isFailed && run.output ? String(run.output).slice(0, 300) : null);

  return (
    <div style={{
      borderBottom: `1px solid ${colors.borderLight}`,
      background: expanded ? colors.surfaceHover : 'transparent',
      transition: transitions.fast,
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          cursor: 'pointer', transition: transitions.fast,
        }}
        onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
        onMouseLeave={e => e.currentTarget.style.background = expanded ? colors.surfaceHover : 'transparent'}
      >
        {expanded ? <ChevronDown size={14} color={colors.textMuted} /> : <ChevronRight size={14} color={colors.textMuted} />}
        <StatusDot status={run.status} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220,
          }}>
            {run.agent_templates?.name || run.agent_name || 'Unknown Agent'}
          </span>
          <span style={{
            fontSize: fontSize.xs, color: colors.primary, background: colors.primaryLightest,
            padding: '1px 8px', borderRadius: radius.full, fontWeight: fontWeight.medium,
          }}>
            {clientName}
          </span>
        </div>
        <Badge
          text={run.status?.replace(/_/g, ' ')}
          color={STATUS_COLORS[run.status] || colors.textDisabled}
          bg={(STATUS_COLORS[run.status] || colors.textDisabled) + '18'}
        />
        {duration !== null && (
          <span style={{ fontSize: fontSize.xs, fontFamily: MONO, color: colors.textMuted, minWidth: 48, textAlign: 'right' }}>
            {formatDuration(duration)}
          </span>
        )}
        <span style={{ fontSize: fontSize.xs, fontFamily: MONO, color: colors.textDisabled, minWidth: 60, textAlign: 'right' }}>
          {relativeTime(run.created_at)}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 14px 42px' }}>
          {/* Error section for failed runs */}
          {isFailed && errorMsg && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: radius.md,
              padding: '10px 14px', marginBottom: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <XCircle size={14} color="#EF4444" style={{ marginTop: 1, flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: fontSize.sm, color: '#991B1B', fontWeight: fontWeight.semibold, marginBottom: 4 }}>
                    Error
                  </div>
                  <pre style={{
                    fontSize: fontSize.xs, fontFamily: MONO, color: '#7F1D1D',
                    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
                  }}>
                    {errorMsg}
                  </pre>
                  <div style={{
                    marginTop: 8, fontSize: fontSize.xs, color: '#92400E',
                    background: '#FEF3C7', borderRadius: radius.sm, padding: '6px 10px',
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}>
                    <AlertTriangle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>{getErrorFix(errorMsg)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Parsed output */}
          {parsed && !isFailed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {parsed.metrics.length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: 6, marginBottom: 4,
                }}>
                  {parsed.metrics.map((m, i) => (
                    <div key={i} style={{
                      background: colors.borderLight, borderRadius: radius.sm, padding: '6px 10px',
                    }}>
                      <div style={{ fontSize: 9, color: colors.textDisabled, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                        {m.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {parsed.findings.map((f, i) => (
                <div key={i}>
                  <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: colors.textSecondary, marginBottom: 3, textTransform: 'capitalize' }}>
                    {f.label}
                  </div>
                  {f.items.map((item, j) => (
                    <div key={j} style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 1.5, paddingLeft: 8, borderLeft: `2px solid ${colors.borderLight}`, marginBottom: 2 }}>
                      {item}
                    </div>
                  ))}
                </div>
              ))}

              {parsed.actions.length > 0 && (
                <div>
                  <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.semibold, color: '#F59E0B', marginBottom: 3 }}>
                    Action Items
                  </div>
                  {parsed.actions.map((a, i) => (
                    <div key={i} style={{ fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 1.5, display: 'flex', gap: 4 }}>
                      <span style={{ color: '#F59E0B' }}>-</span> {a}
                    </div>
                  ))}
                </div>
              )}

              {!parsed.metrics.length && !parsed.findings.length && !parsed.actions.length && (
                <div style={{ fontSize: fontSize.xs, color: colors.textDisabled, fontStyle: 'italic' }}>
                  No structured output to display
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={(e) => { e.stopPropagation(); onRerun(run); }} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
              borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: colors.surface,
              fontSize: fontSize.xs, color: colors.textSecondary, cursor: 'pointer', transition: transitions.fast,
            }}>
              <RotateCcw size={11} /> Re-run
            </button>
            <button onClick={(e) => {
              e.stopPropagation();
              window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'runs', runId: run.id } }));
            }} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px',
              borderRadius: radius.sm, border: `1px solid ${colors.border}`, background: colors.surface,
              fontSize: fontSize.xs, color: colors.textSecondary, cursor: 'pointer', transition: transitions.fast,
            }}>
              <Eye size={11} /> View Full Output
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent, onClick }) {
  const lastRun = agent.last_run_at || agent.updated_at;
  const hoursSinceRun = lastRun ? (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60) : Infinity;
  const lastStatus = agent.last_run_status || agent.status;

  let dotColor = colors.textDisabled; // gray = never run
  let statusLabel = 'inactive';
  if (lastStatus === 'failed') { dotColor = '#EF4444'; statusLabel = 'failed'; }
  else if (lastStatus === 'running') { dotColor = '#3B82F6'; statusLabel = 'running'; }
  else if (lastStatus === 'success' || lastStatus === 'executed') {
    if (hoursSinceRun > 48) { dotColor = '#F59E0B'; statusLabel = 'stale'; }
    else { dotColor = '#10B981'; statusLabel = 'ok'; }
  }
  else if (hoursSinceRun > 48 && hoursSinceRun < Infinity) { dotColor = '#F59E0B'; statusLabel = 'stale'; }

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
        borderRadius: radius.md, cursor: 'pointer', transition: transitions.fast,
        border: `1px solid transparent`,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = colors.surfaceHover; e.currentTarget.style.borderColor = colors.border; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
    >
      <span style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: dotColor, flexShrink: 0, boxShadow: `0 0 4px ${dotColor}`,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: fontSize.xs, fontWeight: fontWeight.medium, color: colors.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {agent.name || agent.agent_templates?.name || 'Unnamed'}
        </div>
        <div style={{ fontSize: 9, color: colors.textDisabled, fontFamily: MONO }}>
          {lastRun ? relativeTime(lastRun) : 'never run'}
        </div>
      </div>
      {statusLabel === 'failed' && agent.last_error && (
        <AlertCircle size={11} color="#EF4444" />
      )}
    </div>
  );
}

function CredentialBadge({ cred }) {
  const isHealthy = cred.status === 'active' || cred.status === 'valid' || cred.is_valid;
  const isWarning = cred.status === 'expiring' || cred.status === 'warning';
  const color = isHealthy ? '#10B981' : isWarning ? '#F59E0B' : '#EF4444';
  return (
    <div
      onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'credentials', service: cred.service || cred.provider || cred.type } }))}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
        borderRadius: radius.full, border: `1px solid ${color}30`, background: `${color}08`,
        cursor: 'pointer', transition: transitions.fast,
      }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}15`}
      onMouseLeave={e => e.currentTarget.style.background = `${color}08`}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{ fontSize: fontSize.xs, color: colors.text, fontWeight: fontWeight.medium }}>
        {cred.provider || cred.service || cred.type || 'Unknown'}
      </span>
    </div>
  );
}

function KpiMini({ label, value, target, unit, color, provenance, delta7d, metricName, clientId }) {
  const val = value != null ? value : '--';
  const isGood = target && value != null ? value >= target : null;
  const prov = provenance || {};
  const fColor = prov.freshness === 'fresh' ? '#10B981' : prov.freshness === 'aging' ? '#F59E0B' : prov.freshness === 'stale' || prov.freshness === 'critical_stale' ? '#EF4444' : colors.textDisabled;
  const isStale = prov.freshness === 'stale' || prov.freshness === 'critical_stale';
  const canVerify = !!(metricName && clientId && VERIFIABLE_METRICS.includes(metricName));
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState(null);

  async function handleVerify(e) {
    e.stopPropagation();
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const resp = await api(`/clients/${clientId}/metrics/${metricName}/visual-verify`, { method: 'POST', body: {} });
      setVerifyMsg({ kind: 'queued', text: `Manus task ${String(resp.task_id).slice(0, 8)} queued. Visits the real page to verify. Refreshes within ~10 min.` });
    } catch (err) {
      setVerifyMsg({ kind: 'err', text: err.message });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div style={{ textAlign: 'center', minWidth: 60, position: 'relative' }} title={prov.source ? `Source: ${prov.source}\nLast sync: ${prov.last_sync ? new Date(prov.last_sync).toLocaleString() : 'never'}\nFreshness: ${prov.freshness_label || prov.freshness || 'unknown'}` : undefined}>
      <div style={{
        fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, fontFamily: MONO,
        color: color || (isGood === true ? '#10B981' : isGood === false ? '#F59E0B' : colors.text),
        lineHeight: 1.1,
      }}>
        {val}{unit || ''}
        {delta7d != null && delta7d !== 0 && (
          <span style={{ fontSize: 9, fontWeight: fontWeight.bold, marginLeft: 2, color: delta7d > 0 ? '#10B981' : '#EF4444' }}>
            {delta7d > 0 ? '+' : ''}{delta7d}
          </span>
        )}
      </div>
      <div style={{ fontSize: 9, color: colors.textDisabled, marginTop: 2, lineHeight: 1.1 }}>{label}</div>
      {target != null && (
        <div style={{ fontSize: 8, color: colors.textDisabled, marginTop: 1 }}>target: {target}{unit || ''}</div>
      )}
      {prov.source && (
        <div style={{ fontSize: 7, color: fColor, marginTop: 1, fontWeight: fontWeight.bold, direction: 'ltr', unicodeBidi: 'embed' }}>
          {prov.freshness_label || (prov.age_hours != null ? (prov.age_hours < 1 ? 'Just now' : prov.age_hours < 24 ? `${prov.age_hours}h ago` : `${Math.round(prov.age_hours / 24)}d ago`) : 'Never synced')}
        </div>
      )}
      {/* Visual Verify button — shown when metric is stale or source looks suspicious */}
      {canVerify && (isStale || String(prov.source || '').toLowerCase().includes('cache')) && !verifyMsg && (
        <button
          onClick={handleVerify}
          disabled={verifying}
          title="Send Manus to visit the real page and extract the current value"
          style={{
            marginTop: 4, padding: '3px 8px', borderRadius: 4,
            background: 'linear-gradient(135deg,#6366F1,#8B5CF6)', color: '#fff',
            border: 'none', fontSize: 8, fontWeight: 700, letterSpacing: 1, cursor: 'pointer',
            boxShadow: '0 0 8px rgba(99,102,241,0.4)',
          }}
        >{verifying ? '...' : '🔎 VERIFY VIA MANUS'}</button>
      )}
      {verifyMsg && (
        <div style={{
          marginTop: 4, fontSize: 7, color: verifyMsg.kind === 'err' ? '#EF4444' : '#10B981',
          maxWidth: 120, lineHeight: 1.3, direction: 'ltr',
        }} title={verifyMsg.text}>
          {verifyMsg.kind === 'queued' ? '✓ Queued' : '✗ Failed'}
        </div>
      )}
    </div>
  );
}

// Metrics that have a sensible default public-page verification path
const VERIFIABLE_METRICS = [
  'google_reviews_count',
  'google_reviews_rating',
  'domain_authority',
  'indexed_pages_count',
];

function ClientCard({ client, runCount, failCount, agentCount, kpis, isActive, onClick, onRefreshMetrics, refreshingMetrics, onDelete }) {
  const hasFailures = failCount > 0;
  const b = kpis || {};
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 18px', borderRadius: radius.lg,
        border: `2px solid ${isActive ? colors.primary : hasFailures ? '#FECACA' : colors.border}`,
        background: isActive ? colors.primaryLightest : colors.surface,
        cursor: 'pointer', transition: transitions.fast, minWidth: 280, maxWidth: 380,
        flex: '1 1 300px',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = colors.primaryLighter; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = hasFailures ? '#FECACA' : colors.border; }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.text }}>
            {client.name}
          </div>
          <div style={{ fontSize: 9, color: colors.textDisabled }}>{client.domain}</div>
        </div>
        {onRefreshMetrics && (
          <button
            onClick={e => { e.stopPropagation(); onRefreshMetrics(client.id); }}
            disabled={refreshingMetrics}
            title="Refresh SEO Metrics"
            style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px',
              borderRadius: radius.sm, border: `1px solid ${colors.border}`,
              background: 'transparent', fontSize: 9, color: colors.primary,
              cursor: refreshingMetrics ? 'wait' : 'pointer', opacity: refreshingMetrics ? 0.5 : 1,
            }}
          >
            <RefreshCw size={9} style={{ animation: refreshingMetrics ? 'spin 1s linear infinite' : 'none' }} />
            Metrics
          </button>
        )}
      </div>

      {/* SEO KPI Row */}
      <div style={{
        display: 'flex', gap: 8, justifyContent: 'space-between', padding: '8px 0',
        borderTop: `1px solid ${colors.borderLight}`, borderBottom: `1px solid ${colors.borderLight}`,
        marginBottom: 8,
      }}>
        <KpiMini label="PageSpeed" value={b.mobile_pagespeed} target={b.mobile_pagespeed_target} provenance={b.mobile_pagespeed_prov} color={b.mobile_pagespeed >= 80 ? '#10B981' : b.mobile_pagespeed >= 50 ? '#F59E0B' : b.mobile_pagespeed ? '#EF4444' : null} metricName="mobile_pagespeed" clientId={client.id} />
        <KpiMini label="Page 1 KWs" value={b.page1_keyword_count} target={b.page1_keyword_count_target} provenance={b.page1_keyword_count_prov} color="#6366F1" metricName="page1_keyword_count" clientId={client.id} />
        <KpiMini label="Reviews" value={b.google_reviews_count} target={b.google_reviews_count_target} provenance={b.google_reviews_count_prov} metricName="google_reviews_count" clientId={client.id} />
        <KpiMini label="DA" value={b.domain_authority} target={b.domain_authority_target} provenance={b.domain_authority_prov} metricName="domain_authority" clientId={client.id} />
        <KpiMini label="AI Visibility" value={b.ai_visibility_score} target={100} provenance={b.ai_visibility_score_prov} color={b.ai_visibility_score >= 50 ? '#10B981' : b.ai_visibility_score >= 20 ? '#F59E0B' : b.ai_visibility_score !== null ? '#EF4444' : null} metricName="ai_visibility_score" clientId={client.id} />
      </div>

      {/* Operational stats */}
      <div style={{ display: 'flex', gap: 12, fontSize: fontSize.xs }}>
        <span style={{ color: colors.textMuted }}>
          <span style={{ fontWeight: fontWeight.bold, color: colors.primary }}>{agentCount}</span> agents
        </span>
        <span style={{ color: colors.textMuted }}>
          <span style={{ fontWeight: fontWeight.bold, color: '#10B981' }}>{runCount}</span> runs today
        </span>
        {failCount > 0 && (
          <span style={{ color: '#EF4444', fontWeight: fontWeight.bold }}>
            {failCount} failed
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Pulse animation ────────────────────────────────────────────
const pulseKeyframes = `
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`;

// ═══════════════════════════════════════════════════════════════════
// ─── MAIN DASHBOARD COMPONENT ───────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
export default function Dashboard({ clientId, setClientId, clients }) {
  // ─── State ──────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Data
  const [allRuns, setAllRuns] = useState([]);
  const [allAgents, setAllAgents] = useState([]);
  const [clientKpis, setClientKpis] = useState({}); // { clientId: { mobile_pagespeed: X, ... } }
  const [clientTrends, setClientTrends] = useState({}); // { clientId: [{ metric_name, delta_7d, ... }] }
  const [refreshingMetrics, setRefreshingMetrics] = useState(null); // clientId being refreshed
  const [refreshResult, setRefreshResult] = useState(null); // { ok: [...], failed: [...] }
  const [allCredentials, setAllCredentials] = useState([]);
  const [clientStats, setClientStats] = useState({});

  // UI
  const [expandedRun, setExpandedRun] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [agentFilter, setAgentFilter] = useState('all');
  const [metricFilter, setMetricFilter] = useState(null); // KPI metric key clicked
  const [clientsExpanded, setClientsExpanded] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [rerunning, setRerunning] = useState(null);

  // ─── Sync sidebar client selector → dashboard filter ─────────
  useEffect(() => {
    if (clientId && clients.some(c => c.id === clientId)) {
      setClientFilter(clientId);
    }
  }, [clientId, clients]);

  // ─── Fetch trends when client filter changes ─────────────────
  useEffect(() => {
    if (clientFilter && clientFilter !== 'all' && !clientTrends[clientFilter]) {
      api(`/clients/${clientFilter}/trends`).then(data => {
        if (Array.isArray(data)) setClientTrends(prev => ({ ...prev, [clientFilter]: data }));
      }).catch(() => {});
    }
  }, [clientFilter]);

  // ─── Data Fetching ────────────────────────────────────────────
  const fetchAllData = useCallback(async () => {
    if (!clients || clients.length === 0) { setLoading(false); return; }

    try {
      const results = await Promise.allSettled(
        clients.map(async (client) => {
          const [runs, agents, credentials, baselines] = await Promise.allSettled([
            api(`/clients/${client.id}/runs?limit=50`),
            api(`/clients/${client.id}/agents`),
            api(`/clients/${client.id}/credentials`),
            api(`/clients/${client.id}/baselines`),
          ]);
          return {
            clientId: client.id,
            clientName: client.name,
            runs: runs.status === 'fulfilled' ? runs.value : [],
            agents: agents.status === 'fulfilled' ? agents.value : [],
            credentials: credentials.status === 'fulfilled' ? credentials.value : [],
            baselines: baselines.status === 'fulfilled' ? baselines.value : [],
          };
        })
      );

      const runsAcc = [];
      const agentsAcc = [];
      const credsAcc = [];
      const statsAcc = {};
      const kpisAcc = {};

      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        const data = r.value;
        const clientRuns = Array.isArray(data.runs) ? data.runs : [];
        const clientAgents = Array.isArray(data.agents) ? data.agents : [];
        const clientCreds = Array.isArray(data.credentials) ? data.credentials : [];
        const clientBaselines = Array.isArray(data.baselines) ? data.baselines : [];

        clientRuns.forEach(run => {
          run._clientId = data.clientId;
          run._clientName = data.clientName;
        });
        clientAgents.forEach(agent => {
          agent._clientId = data.clientId;
          agent._clientName = data.clientName;
        });
        clientCreds.forEach(cred => {
          cred._clientId = data.clientId;
          cred._clientName = data.clientName;
        });

        runsAcc.push(...clientRuns);
        agentsAcc.push(...clientAgents);
        credsAcc.push(...clientCreds);

        // Build KPI map from baselines (now includes provenance)
        const kpiMap = {};
        clientBaselines.forEach(b => {
          kpiMap[b.metric_name] = b.metric_value;
          if (b.target_value != null) kpiMap[b.metric_name + '_target'] = b.target_value;
          if (b.provenance) kpiMap[b.metric_name + '_prov'] = b.provenance;
        });
        kpisAcc[data.clientId] = kpiMap;

        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayRuns = clientRuns.filter(r => new Date(r.created_at) >= todayStart);

        statsAcc[data.clientId] = {
          runsToday: todayRuns.length,
          failuresToday: todayRuns.filter(r => r.status === 'failed').length,
          agentCount: clientAgents.length,
        };
      }

      // Sort runs by date descending
      runsAcc.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setAllRuns(runsAcc);
      setAllAgents(agentsAcc);
      setAllCredentials(credsAcc);
      setClientStats(statsAcc);
      setClientKpis(kpisAcc);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    }
    setLoading(false);
  }, [clients]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  const handleRefreshMetrics = async (cId) => {
    setRefreshingMetrics(cId);
    setRefreshResult(null);
    try {
      const result = await api(`/clients/${cId}/metrics/refresh-all`, { method: 'POST' });
      if (result?.results) {
        const updated = { ...(clientKpis[cId] || {}) };
        const ok = [], failed = [];
        result.results.forEach(r => {
          if (r.status === 'ok' && r.value != null) {
            updated[r.metric] = r.value;
            ok.push(r.metric.replace(/_/g, ' '));
          } else if (r.status !== 'ok') {
            failed.push({ metric: r.metric.replace(/_/g, ' '), reason: r.detail || r.status });
          }
        });
        setClientKpis(prev => ({ ...prev, [cId]: updated }));
        setRefreshResult({ ok, failed, time: new Date().toLocaleTimeString() });
        // Reload baselines to get fresh recorded_at timestamps
        try {
          const freshBaselines = await api(`/clients/${cId}/baselines`);
          const kpiMap = {};
          (freshBaselines || []).forEach(b => {
            kpiMap[b.metric_name] = b.metric_value;
            if (b.target_value) kpiMap[b.metric_name + '_target'] = b.target_value;
            if (b.provenance) kpiMap[b.metric_name + '_prov'] = b.provenance;
          });
          setClientKpis(prev => ({ ...prev, [cId]: kpiMap }));
        } catch (_) {}
      }
    } catch (e) {
      console.error('Metrics refresh failed:', e);
      setRefreshResult({ ok: [], failed: [{ metric: 'all', reason: e.message }], time: new Date().toLocaleTimeString() });
    }
    setRefreshingMetrics(null);
  };

  const handleRerun = async (run) => {
    if (!run._clientId || (!run.agent_template_id && !run.agent_id)) return;
    setRerunning(run.id);
    try {
      await api(`/clients/${run._clientId}/runs`, {
        method: 'POST',
        body: { agent_template_id: run.agent_template_id || run.agent_id },
      });
      // Refresh after a short delay to pick up the new run
      setTimeout(fetchAllData, 1500);
    } catch (e) {
      console.error('Re-run failed:', e);
    }
    setRerunning(null);
  };

  // ─── Computed Values ──────────────────────────────────────────
  const todayStart = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const todayRuns = useMemo(() =>
    allRuns.filter(r => new Date(r.created_at) >= todayStart),
    [allRuns, todayStart]
  );

  // Helper: a credential is "broken" if it's not connected, or its health score is low,
  // or its last_checked is very old. Uses the actual backend field names.
  const isCredentialBroken = useCallback((c) => {
    if (!c) return true;
    // If the backend says it's not connected, it's broken.
    if (c.is_connected === false) return true;
    // If health score is explicitly set and below 50, it's broken.
    if (typeof c.health_score === 'number' && c.health_score < 50) return true;
    // If it has a last_error, it's broken.
    if (c.last_error) return true;
    // Legacy field fallbacks — if either exists and says broken, trust it.
    if (c.status && c.status !== 'active' && c.status !== 'valid' && c.status !== 'connected') return true;
    return false;
  }, []);

  const healthScore = useMemo(() => {
    if (!allRuns.length && !allCredentials.length) return 0;
    // Credential health (0-100) — now using correct field names
    const validCreds = allCredentials.filter(c => !isCredentialBroken(c));
    const credScore = allCredentials.length > 0 ? (validCreds.length / allCredentials.length) * 100 : 50;
    // Agent success rate from recent runs (0-100)
    const recent = allRuns.slice(0, 100);
    const completed = recent.filter(r => r.status === 'success' || r.status === 'executed' || r.status === 'failed');
    const succeeded = completed.filter(r => r.status === 'success' || r.status === 'executed');
    const successRate = completed.length > 0 ? (succeeded.length / completed.length) * 100 : 50;
    // Freshness -- what % of agents ran in the last 48h
    const recentAgents = allAgents.filter(a => {
      const lastRun = a.last_run_at || a.updated_at;
      return lastRun && (Date.now() - new Date(lastRun).getTime()) < 48 * 60 * 60 * 1000;
    });
    const freshnessScore = allAgents.length > 0 ? (recentAgents.length / allAgents.length) * 100 : 50;

    return Math.round(credScore * 0.3 + successRate * 0.5 + freshnessScore * 0.2);
  }, [allRuns, allAgents, allCredentials, isCredentialBroken]);

  const failedToday = useMemo(() => todayRuns.filter(r => r.status === 'failed').length, [todayRuns]);
  const runningNow = useMemo(() => allRuns.filter(r => r.status === 'running').length, [allRuns]);
  const pendingApprovals = useMemo(() => allRuns.filter(r => r.status === 'pending_approval').length, [allRuns]);

  const brokenCredentials = useMemo(() =>
    allCredentials.filter(isCredentialBroken),
    [allCredentials, isCredentialBroken]
  );

  // Filtered runs
  const filteredRuns = useMemo(() => {
    let filtered = allRuns;
    if (statusFilter !== 'all') {
      if (statusFilter === 'failed') filtered = filtered.filter(r => r.status === 'failed');
      else if (statusFilter === 'success') filtered = filtered.filter(r => r.status === 'success' || r.status === 'executed');
      else if (statusFilter === 'running') filtered = filtered.filter(r => r.status === 'running');
    }
    if (clientFilter !== 'all') {
      filtered = filtered.filter(r => r._clientId === clientFilter);
    }
    if (agentFilter !== 'all') {
      filtered = filtered.filter(r => (r.agent_templates?.name || r.agent_name) === agentFilter);
    }
    // Metric-based filter: show only agents relevant to the clicked KPI
    if (metricFilter && METRIC_AGENTS[metricFilter]) {
      const relevantAgents = METRIC_AGENTS[metricFilter];
      filtered = filtered.filter(r => {
        const agentName = r.agent_templates?.name || r.agent_name || '';
        return relevantAgents.some(ra => agentName.includes(ra) || ra.includes(agentName));
      });
    }
    return filtered.slice(0, 100);
  }, [allRuns, statusFilter, clientFilter, agentFilter, metricFilter]);

  // Agents grouped by lane
  const agentsByLane = useMemo(() => {
    const map = {};
    allAgents.forEach(a => {
      const lane = a.lane || a.agent_templates?.lane || 'Uncategorized';
      if (!map[lane]) map[lane] = [];
      map[lane].push(a);
    });
    return map;
  }, [allAgents]);

  // Unique agent names for filter
  const agentNames = useMemo(() => {
    const names = new Set();
    allRuns.forEach(r => {
      const name = r.agent_templates?.name || r.agent_name;
      if (name) names.add(name);
    });
    return Array.from(names).sort();
  }, [allRuns]);

  // ─── Loading State ────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: spacing.xl }}>
        <style>{pulseKeyframes}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: spacing.xl }}>
          <Spin />
          <span style={{ fontSize: fontSize.lg, color: colors.textSecondary }}>Loading Operations Command Center...</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ height: 70, borderRadius: radius.lg, background: colors.borderLight, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <div style={{ height: 400, borderRadius: radius.xl, background: colors.borderLight, animation: 'pulse 1.5s ease-in-out infinite' }} />
      </div>
    );
  }

  // ─── No Clients State ─────────────────────────────────────────
  if (!clients || clients.length === 0) {
    return (
      <div style={{ padding: spacing['3xl'], textAlign: 'center' }}>
        <Users size={48} color={colors.textDisabled} style={{ marginBottom: 16 }} />
        <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text, marginBottom: 8 }}>
          No Clients Found
        </div>
        <div style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
          Create your first client to get started with the Operations Command Center.
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1440, margin: '0 auto' }}>
      <style>{pulseKeyframes}</style>

      {/* ─── Section 4: CREDENTIAL HEALTH BAR ────────────────────── */}
      {brokenCredentials.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: radius.lg,
          marginBottom: spacing.md,
        }}>
          <AlertTriangle size={16} color="#EF4444" />
          <span style={{ fontSize: fontSize.sm, color: '#991B1B', fontWeight: fontWeight.semibold, flex: 1 }}>
            {brokenCredentials.length} credential{brokenCredentials.length !== 1 ? 's' : ''} need attention
          </span>
          {brokenCredentials.slice(0, 5).map((c, i) => (
            <CredentialBadge key={i} cred={c} />
          ))}
          <button
            onClick={() => {
              const services = brokenCredentials.map(c => c.service || c.provider || c.type).filter(Boolean);
              window.dispatchEvent(new CustomEvent('navigate', { detail: { view: 'credentials', service: services[0], brokenServices: services } }));
            }}
            style={{
              fontSize: fontSize.xs, color: '#EF4444', background: 'none', border: '1px solid #FECACA',
              borderRadius: radius.sm, padding: '4px 10px', cursor: 'pointer', fontWeight: fontWeight.semibold,
            }}
          >
            Fix Now <ArrowRight size={10} style={{ marginLeft: 2 }} />
          </button>
        </div>
      )}

      {/* Credential strip (when all healthy) */}
      {brokenCredentials.length === 0 && allCredentials.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px',
          background: colors.surface, border: `1px solid ${colors.borderLight}`, borderRadius: radius.lg,
          marginBottom: spacing.md, overflowX: 'auto',
        }}>
          <Shield size={12} color="#10B981" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: fontSize.xs, color: '#10B981', fontWeight: fontWeight.semibold, marginRight: 4, whiteSpace: 'nowrap' }}>
            All credentials healthy
          </span>
          {allCredentials.slice(0, 12).map((c, i) => <CredentialBadge key={i} cred={c} />)}
        </div>
      )}

      {/* ─── Section 1: SYSTEM HEALTH TOP BAR ────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: spacing.lg, padding: '14px 20px',
        background: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`,
        boxShadow: shadows.sm, marginBottom: spacing.md, flexWrap: 'wrap',
      }}>
        {/* Health score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: healthScore >= 80 ? '#D1FAE5' : healthScore >= 50 ? '#FEF3C7' : '#FEE2E2',
            border: `2px solid ${healthScore >= 80 ? '#10B981' : healthScore >= 50 ? '#F59E0B' : '#EF4444'}`,
          }}>
            <span style={{
              fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, fontFamily: MONO,
              color: healthScore >= 80 ? '#065F46' : healthScore >= 50 ? '#92400E' : '#991B1B',
            }}>
              {healthScore}
            </span>
          </div>
          <div>
            <div style={{ fontSize: fontSize.xs, color: colors.textDisabled, lineHeight: 1 }}>System Health</div>
            <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.text }}>
              {healthScore >= 80 ? 'Healthy' : healthScore >= 50 ? 'Needs Attention' : 'Critical'}
            </div>
          </div>
        </div>

        <div style={{ width: 1, height: 32, background: colors.borderLight }} />

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: spacing.lg, flexWrap: 'wrap', flex: 1 }}>
          <StatPill icon={Users} label="Clients" value={clients.length} color={colors.primary} />
          <StatPill icon={Activity} label="Runs Today" value={todayRuns.length} color="#10B981" />
          <StatPill icon={XCircle} label="Failed" value={failedToday} color={failedToday > 0 ? '#EF4444' : colors.textDisabled} alert={failedToday > 0} />
          <StatPill icon={Zap} label="Running" value={runningNow} color={runningNow > 0 ? '#3B82F6' : colors.textDisabled} />
          <StatPill icon={Clock} label="Pending" value={pendingApprovals} color={pendingApprovals > 0 ? '#F59E0B' : colors.textDisabled} />
        </div>

        {/* Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastRefresh && (
            <span style={{ fontSize: 9, color: colors.textDisabled, fontFamily: MONO }}>
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
              borderRadius: radius.md, border: `1px solid ${colors.border}`,
              background: colors.surface, fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
              color: colors.primary, cursor: refreshing ? 'wait' : 'pointer',
              transition: transitions.fast, opacity: refreshing ? 0.7 : 1,
            }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            {refreshing ? 'Refreshing...' : 'Refresh All'}
          </button>
        </div>
      </div>

      {/* ─── Now Running live panel ──────────────────────────────── */}
      <NowRunningPanel clientId={clientFilter} clients={clients} />

      {/* ─── Section 5: CLIENT OVERVIEW CARDS (Collapsible) ──────── */}
      <div style={{
        background: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`,
        marginBottom: spacing.md, overflow: 'hidden',
      }}>
        <div
          onClick={() => setClientsExpanded(!clientsExpanded)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
            cursor: 'pointer', transition: transitions.fast,
          }}
          onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {clientsExpanded ? <ChevronDown size={14} color={colors.textMuted} /> : <ChevronRight size={14} color={colors.textMuted} />}
          <Users size={14} color={colors.primary} />
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
            Client Overview
          </span>
          <span style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>
            ({clients.length} client{clients.length !== 1 ? 's' : ''})
          </span>
        </div>
        {clientsExpanded && (
          <div style={{
            display: 'flex', gap: 10, padding: '0 20px 14px', overflowX: 'auto',
            flexWrap: 'wrap',
          }}>
            {clients.length > 1 && (() => {
              // Compute real aggregates across all clients — average each metric, skip nulls
              const vals = (key) => clients.map(c => clientKpis[c.id]?.[key]).filter(v => v != null && !isNaN(Number(v))).map(Number);
              const avg = (arr) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : null;
              const sum = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) : null;
              const aggKpis = {
                ai_visibility_score: avg(vals('ai_visibility_score')),
                domain_authority: avg(vals('domain_authority')),
                google_reviews_count: sum(vals('google_reviews_count')),
                page1_keyword_count: sum(vals('page1_keyword_count')),
                mobile_pagespeed: avg(vals('mobile_pagespeed')),
              };
              return (
                <ClientCard
                  client={{ name: 'All Clients', domain: 'aggregated' }}
                  runCount={todayRuns.length}
                  failCount={failedToday}
                  agentCount={allAgents.length}
                  kpis={aggKpis}
                  isActive={clientFilter === 'all'}
                  onClick={() => { setClientFilter('all'); if (setClientId) setClientId(''); }}
                />
              );
            })()}
            {clients.map(c => (
              <ClientCard
                key={c.id}
                client={c}
                runCount={clientStats[c.id]?.runsToday || 0}
                failCount={clientStats[c.id]?.failuresToday || 0}
                agentCount={clientStats[c.id]?.agentCount || 0}
                kpis={clientKpis[c.id]}
                isActive={clientFilter === c.id}
                onClick={() => { const next = clientFilter === c.id ? 'all' : c.id; setClientFilter(next); if (setClientId) setClientId(next === 'all' ? '' : next); }}
                onRefreshMetrics={handleRefreshMetrics}
                refreshingMetrics={refreshingMetrics === c.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── Section 6: SELECTED CLIENT KPI PANEL ─────────────────── */}
      {clientFilter !== 'all' && (() => {
        const selClient = clients.find(c => c.id === clientFilter);
        const kpi = clientKpis[clientFilter] || {};
        const hasKpis = Object.keys(kpi).length > 0;
        return (
          <div style={{
            background: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.primary}33`,
            marginBottom: spacing.md, padding: '16px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TrendingUp size={16} color={colors.primary} />
                <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.text }}>
                  {selClient?.name} — SEO Growth Dashboard
                </span>
                <span style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>{selClient?.domain}</span>
              </div>
              <button
                onClick={() => handleRefreshMetrics(clientFilter)}
                disabled={refreshingMetrics === clientFilter}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
                  borderRadius: radius.md, border: `1px solid ${colors.primary}44`,
                  background: colors.primaryLightest, fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                  color: colors.primary, cursor: refreshingMetrics === clientFilter ? 'wait' : 'pointer',
                }}
              >
                <RefreshCw size={11} style={{ animation: refreshingMetrics === clientFilter ? 'spin 1s linear infinite' : 'none' }} />
                {refreshingMetrics === clientFilter ? 'Refreshing...' : 'Refresh All Metrics'}
              </button>
            </div>
            {/* Refresh result summary */}
            {refreshResult && (
              <div style={{
                marginBottom: 12, padding: '8px 14px', borderRadius: radius.md,
                background: refreshResult.failed.length > 0 ? '#FEF3C7' : '#D1FAE5',
                border: `1px solid ${refreshResult.failed.length > 0 ? '#F59E0B' : '#10B981'}33`,
                fontSize: fontSize.xs, lineHeight: 1.5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    {refreshResult.ok.length > 0 && (
                      <span style={{ color: '#059669' }}>
                        <CheckCircle size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                        Updated: {refreshResult.ok.join(', ')}
                      </span>
                    )}
                    {refreshResult.failed.length > 0 && (
                      <div style={{ color: '#B45309', marginTop: refreshResult.ok.length > 0 ? 4 : 0 }}>
                        <AlertTriangle size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                        Not updated: {refreshResult.failed.map(f => `${f.metric} (${f.reason})`).join(', ')}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setRefreshResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 16 }}>&times;</button>
                </div>
              </div>
            )}
            {hasKpis ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                {(() => {
                  const trends = clientTrends[clientFilter] || [];
                  const trendMap = {};
                  trends.forEach(t => { trendMap[t.metric_name] = t; });
                  return [
                  { key: 'mobile_pagespeed', label: 'Mobile PageSpeed', unit: '/100', color: kpi.mobile_pagespeed >= 80 ? '#10B981' : kpi.mobile_pagespeed >= 50 ? '#F59E0B' : '#EF4444' },
                  { key: 'desktop_pagespeed', label: 'Desktop PageSpeed', unit: '/100' },
                  { key: 'page1_keyword_count', label: 'Page 1 Keywords', color: '#6366F1' },
                  { key: 'google_reviews_count', label: 'Google Reviews' },
                  { key: 'google_reviews_rating', label: 'Google Rating', unit: '/5' },
                  { key: 'domain_authority', label: 'Domain Authority', color: '#8B5CF6' },
                  { key: 'referring_domains_count', label: 'Referring Domains' },
                  { key: 'indexed_pages', label: 'Indexed Pages' },
                  { key: 'local_3pack_present', label: 'Local 3-Pack' },
                ].filter(m => kpi[m.key] != null).map(m => {
                  const prov = kpi[m.key + '_prov'];
                  const trend = trendMap[m.key];
                  const FRESHNESS_COLORS = { fresh: '#10B981', aging: '#F59E0B', stale: '#F97316', critical_stale: '#EF4444', never_synced: '#9CA3AF' };
                  return (
                    <div key={m.key} onClick={() => setMetricFilter(metricFilter === m.key ? null : m.key)} style={{
                      padding: '12px 14px', borderRadius: radius.lg,
                      background: metricFilter === m.key ? (colors.primaryLightest || '#EEF2FF') : (colors.backgroundAlt || '#F9FAFB'),
                      border: `2px solid ${metricFilter === m.key ? colors.primary : prov ? (FRESHNESS_COLORS[prov.freshness] || colors.borderLight) + '33' : colors.borderLight}`,
                      textAlign: 'center', cursor: 'pointer', transition: transitions.fast,
                    }}>
                      <div style={{
                        fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, fontFamily: MONO,
                        color: m.color || colors.text, lineHeight: 1.2,
                      }}>
                        {m.key === 'local_3pack_present' ? (kpi[m.key] ? 'Yes' : 'No') : kpi[m.key]}{m.unit || ''}
                      </div>
                      <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 }}>{m.label}</div>
                      {/* Trend indicators */}
                      {trend && (trend.delta_7d != null || trend.delta_30d != null) && (
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 4, fontSize: 9, fontWeight: 600 }}>
                          {trend.delta_7d != null && (
                            <span style={{ color: trend.delta_7d > 0 ? '#10B981' : trend.delta_7d < 0 ? '#EF4444' : '#9CA3AF' }}>
                              7d: {trend.delta_7d > 0 ? '+' : ''}{trend.delta_7d}{trend.pct_7d != null ? ` (${trend.pct_7d > 0 ? '+' : ''}${trend.pct_7d}%)` : ''}
                            </span>
                          )}
                          {trend.delta_30d != null && (
                            <span style={{ color: trend.delta_30d > 0 ? '#10B981' : trend.delta_30d < 0 ? '#EF4444' : '#9CA3AF' }}>
                              30d: {trend.delta_30d > 0 ? '+' : ''}{trend.delta_30d}
                            </span>
                          )}
                        </div>
                      )}
                      {kpi[m.key + '_target'] != null && (
                        <div style={{ fontSize: 9, color: colors.textDisabled, marginTop: 2 }}>
                          Target: {kpi[m.key + '_target']}{m.unit || ''}
                        </div>
                      )}
                      {/* Provenance line */}
                      {prov && (
                        <div style={{
                          marginTop: 6, paddingTop: 6, borderTop: `1px solid ${colors.borderLight}`,
                          fontSize: 9, lineHeight: 1.4, textAlign: 'left', direction: 'ltr',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: colors.textDisabled }}>Source</span>
                            <span style={{ color: colors.textMuted, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prov.source}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
                            <span style={{ color: colors.textDisabled }}>Synced</span>
                            <span style={{ color: colors.textMuted }}>{prov.age_hours != null ? (prov.age_hours < 1 ? 'Just now' : prov.age_hours < 24 ? `${prov.age_hours}h ago` : `${Math.round(prov.age_hours / 24)} days ago`) : 'Never'}</span>
                          </div>
                          <div style={{
                            display: 'inline-block', marginTop: 3,
                            padding: '1px 6px', borderRadius: 4,
                            fontSize: 8, fontWeight: 700,
                            background: (FRESHNESS_COLORS[prov.freshness] || '#9CA3AF') + '18',
                            color: FRESHNESS_COLORS[prov.freshness] || '#9CA3AF',
                          }}>
                            {prov.freshness_label}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }); })()}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: colors.textDisabled, fontSize: fontSize.sm }}>
                No metrics yet. Click "Refresh All Metrics" to fetch real data from Google, DataForSEO, and other APIs.
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Main Content: Activity Feed + Agent Sidebar ─────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: spacing.md, alignItems: 'start' }}>
        {/* ─── Section 2: RECENT ACTIVITY FEED ─────────────────────── */}
        <div style={{
          background: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm, overflow: 'hidden', minHeight: 400,
        }}>
          {/* Header + Filters */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px',
            borderBottom: `1px solid ${colors.borderLight}`, flexWrap: 'wrap',
          }}>
            <Activity size={16} color={colors.primary} />
            <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
              Activity Feed
            </span>
            <span style={{ fontSize: fontSize.xs, color: colors.textDisabled, fontFamily: MONO }}>
              {filteredRuns.length} runs
            </span>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <FilterPill label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
              <FilterPill label="Failed" active={statusFilter === 'failed'} onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')} />
              <FilterPill label="Success" active={statusFilter === 'success'} onClick={() => setStatusFilter(statusFilter === 'success' ? 'all' : 'success')} />
              <FilterPill label="Running" active={statusFilter === 'running'} onClick={() => setStatusFilter(statusFilter === 'running' ? 'all' : 'running')} />
            </div>
          </div>

          {/* Client + Agent filters */}
          {(clients.length > 1 || agentNames.length > 1) && (
            <div style={{
              display: 'flex', gap: 8, padding: '8px 20px', borderBottom: `1px solid ${colors.borderLight}`,
              alignItems: 'center', flexWrap: 'wrap',
            }}>
              <Filter size={11} color={colors.textDisabled} />
              {clients.length > 1 && (
                <select
                  value={clientFilter}
                  onChange={e => { const v = e.target.value === 'all' ? 'all' : e.target.value; setClientFilter(v); if (setClientId) setClientId(v === 'all' ? '' : v); }}
                  style={{
                    fontSize: fontSize.xs, padding: '3px 8px', borderRadius: radius.sm,
                    border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text,
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Clients</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
              {agentNames.length > 1 && (
                <select
                  value={agentFilter}
                  onChange={e => setAgentFilter(e.target.value)}
                  style={{
                    fontSize: fontSize.xs, padding: '3px 8px', borderRadius: radius.sm,
                    border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text,
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Agents</option>
                  {agentNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
              {(clientFilter !== 'all' || agentFilter !== 'all' || statusFilter !== 'all' || metricFilter) && (
                <button
                  onClick={() => { setClientFilter('all'); setAgentFilter('all'); setStatusFilter('all'); setMetricFilter(null); }}
                  style={{
                    fontSize: fontSize.xs, color: colors.textMuted, background: 'none',
                    border: 'none', cursor: 'pointer', textDecoration: 'underline',
                  }}
                >
                  Clear filters
                </button>
              )}
              {metricFilter && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px', borderRadius: radius.md,
                  background: colors.primaryLightest, border: `1px solid ${colors.primary}44`,
                  fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.bold,
                }}>
                  Showing agents for: {metricFilter.replace(/_/g, ' ')}
                  <button onClick={() => setMetricFilter(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.primary, fontWeight: 'bold', fontSize: 14, lineHeight: 1 }}>&times;</button>
                </div>
              )}
            </div>
          )}

          {/* Run list */}
          <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
            {filteredRuns.length === 0 && (
              <div style={{ padding: spacing['2xl'], textAlign: 'center', color: colors.textDisabled }}>
                <Activity size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                <div style={{ fontSize: fontSize.sm }}>
                  {statusFilter !== 'all' || clientFilter !== 'all'
                    ? 'No runs match the current filters'
                    : 'No agent runs found yet'}
                </div>
              </div>
            )}
            {filteredRuns.map(run => (
              <RunRow
                key={run.id}
                run={run}
                clientName={run._clientName}
                expanded={expandedRun === run.id}
                onToggle={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                onRerun={handleRerun}
              />
            ))}
          </div>
        </div>

        {/* ─── Section 3: AGENT STATUS GRID (Sidebar) ────────────── */}
        <div style={{
          background: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`,
          boxShadow: shadows.sm, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px',
            borderBottom: `1px solid ${colors.borderLight}`,
          }}>
            <Layers size={14} color={colors.primary} />
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
              Agent Status
            </span>
            <span style={{ fontSize: fontSize.xs, color: colors.textDisabled, fontFamily: MONO }}>
              {allAgents.length}
            </span>
          </div>

          <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto', padding: '4px 0' }}>
            {Object.keys(agentsByLane).length === 0 && (
              <div style={{ padding: spacing.xl, textAlign: 'center', color: colors.textDisabled, fontSize: fontSize.sm }}>
                No agents configured
              </div>
            )}
            {Object.entries(agentsByLane).map(([lane, agents]) => {
              const laneColor = LANE_COLORS[lane] || colors.textMuted;
              return (
                <div key={lane} style={{ marginBottom: 4 }}>
                  <div style={{
                    padding: '6px 16px', fontSize: 9, fontWeight: fontWeight.bold,
                    color: laneColor, textTransform: 'uppercase', letterSpacing: 0.8,
                    borderLeft: `3px solid ${laneColor}`, marginLeft: 8,
                  }}>
                    {lane}
                  </div>
                  {agents.map(agent => (
                    <AgentCard
                      key={agent.id}
                      agent={agent}
                      onClick={() => {
                        setSelectedAgent(selectedAgent === agent.id ? null : agent.id);
                      }}
                    />
                  ))}
                  {/* Expanded agent detail */}
                  {agents.filter(a => selectedAgent === a.id).map(agent => (
                    <div key={`detail-${agent.id}`} style={{
                      margin: '0 8px 8px', padding: '10px 12px', borderRadius: radius.md,
                      background: colors.surfaceHover, border: `1px solid ${colors.borderLight}`,
                    }}>
                      <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: 6 }}>
                        <strong>{agent.name || agent.agent_templates?.name}</strong>
                        {agent._clientName && <span style={{ color: colors.textDisabled }}> - {agent._clientName}</span>}
                      </div>
                      {agent.description && (
                        <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 6, lineHeight: 1.4 }}>
                          {agent.description}
                        </div>
                      )}
                      <div style={{ fontSize: 9, fontFamily: MONO, color: colors.textDisabled, marginBottom: 8 }}>
                        Last: {relativeTime(agent.last_run_at || agent.updated_at)}
                        {agent.schedule && <span> | Schedule: {agent.schedule}</span>}
                      </div>
                      {agent.last_error && (
                        <div style={{
                          fontSize: fontSize.xs, color: '#991B1B', background: '#FEF2F2',
                          borderRadius: radius.sm, padding: '4px 8px', marginBottom: 6,
                          fontFamily: MONO, wordBreak: 'break-word',
                        }}>
                          {String(agent.last_error).slice(0, 200)}
                        </div>
                      )}
                      <button
                        onClick={async () => {
                          try {
                            await api(`/clients/${agent._clientId}/runs`, {
                              method: 'POST',
                              body: { agent_template_id: agent.agent_template_id || agent.id },
                            });
                            setTimeout(fetchAllData, 1500);
                          } catch (e) {
                            console.error('Trigger run failed:', e);
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                          borderRadius: radius.sm, border: `1px solid ${colors.primary}`,
                          background: colors.primaryLightest, color: colors.primary,
                          fontSize: fontSize.xs, fontWeight: fontWeight.semibold, cursor: 'pointer',
                          transition: transitions.fast,
                        }}
                      >
                        <Play size={10} /> Trigger Run
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Responsive override for mobile */}
      <style>{`
        @media (max-width: 900px) {
          div[style*="grid-template-columns: 1fr 380px"] {
            grid-template-columns: 1fr !important;
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Small stat pill for top bar ────────────────────────────────
function StatPill({ icon: Icon, label, value, color, alert }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Icon size={14} color={color} />
      <div>
        <div style={{ fontSize: 9, color: colors.textDisabled, lineHeight: 1 }}>{label}</div>
        <div style={{
          fontSize: fontSize.md, fontWeight: fontWeight.extrabold, fontFamily: MONO,
          color: color, lineHeight: 1.2,
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}
