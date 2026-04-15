// ─── AI Growth OS — Agents View ─────────────────────────────────
// Per-agent + per-lane controls:
//   - status pill (active / paused / report-only)
//   - pause/resume (flips agent_templates.is_active)
//   - action mode (autonomous / approve_then_act / report_only)
//     → per-agent default, overridable per client
//   - bulk lane controls
//   - Now Running indicator (pulls /clients/:id/now-running)
import { useState, useEffect, useMemo } from 'react';
import { Bot, Play, Pause, Shield, ShieldCheck, ShieldOff, Zap, Activity, RefreshCw } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Badge, Card, SH, Empty, SkeletonCard, Skeleton, Btn } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Mode definitions ───────────────────────────────────────────
const MODES = [
  { value: 'autonomous',      label: 'Auto',     desc: 'Push changes without approval',    Icon: Zap,        color: '#D97706', bg: '#FEF3C7' },
  { value: 'approve_then_act', label: 'Approve', desc: 'Wait for your review before push', Icon: ShieldCheck, color: '#2563EB', bg: '#DBEAFE' },
  { value: 'report_only',      label: 'Report',  desc: 'Collect data, never write',        Icon: Shield,      color: '#6B7280', bg: '#F3F4F6' },
];
const modeMeta = (m) => MODES.find(x => x.value === m) || MODES[1];

// ─── Skeleton ───────────────────────────────────────────────────
function AgentListSkeleton() {
  return (
    <div>
      {[1, 2, 3].map(lane => (
        <div key={lane} style={{ marginBottom: spacing.lg }}>
          <Skeleton width={120} height={10} style={{ marginBottom: spacing.sm }} />
          {[1, 2].map(a => (
            <div key={a} style={{ padding: `${spacing.sm}px ${spacing.md}px`, marginBottom: spacing.xs, borderRadius: radius.lg, border: `1px solid ${colors.borderLight}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Skeleton width="60%" height={13} />
                <Skeleton width={52} height={18} borderRadius={radius.sm} />
              </div>
              <Skeleton width={90} height={9} style={{ marginTop: spacing.xs }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AgentDetailSkeleton() {
  return (
    <Card>
      <Skeleton width="50%" height={18} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="35%" height={12} style={{ marginBottom: spacing.xl }} />
      <Skeleton width="100%" height={14} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="90%" height={14} style={{ marginBottom: spacing.xl }} />
      <Skeleton width="100%" height={120} borderRadius={radius.md} />
    </Card>
  );
}

// ─── Mode selector pills ────────────────────────────────────────
function ModePills({ current, onChange, disabled }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 3, background: colors.surfaceHover, borderRadius: radius.md }}>
      {MODES.map(m => {
        const active = m.value === current;
        const Icon = m.Icon;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => !disabled && onChange(m.value)}
            disabled={disabled}
            title={m.desc}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px',
              borderRadius: radius.sm,
              border: 'none',
              background: active ? m.bg : 'transparent',
              color: active ? m.color : colors.textMuted,
              fontSize: fontSize.xs,
              fontWeight: active ? fontWeight.bold : fontWeight.semibold,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: transitions.fast,
              fontFamily: 'inherit',
            }}
          >
            <Icon size={11} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AgentsView({ clientId }) {
  const [agentsByLane, setAgentsByLane] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({});               // { agentId: true }
  const [clientOverrides, setClientOverrides] = useState({}); // { 'agent-slug': 'autonomous' | ... }
  const [runningMap, setRunningMap] = useState({});   // { 'agent-slug': elapsed_seconds }
  const [toast, setToast] = useState(null);

  // ── Load everything ──
  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [agents, clientDetail, liveRes] = await Promise.all([
        api(`/clients/${clientId}/agents`),
        api(`/clients/${clientId}`).catch(() => null),
        api(`/clients/${clientId}/now-running`).catch(() => ({ running: [] })),
      ]);
      setAgentsByLane(agents);
      // client_rules is joined in /clients/:id — pull overrides from there
      const rules = Array.isArray(clientDetail?.client_rules) ? clientDetail.client_rules[0] : clientDetail?.client_rules;
      setClientOverrides(rules?.action_mode_overrides || {});
      const rmap = {};
      for (const r of liveRes?.running || []) rmap[r.agent_slug] = r.elapsed_seconds;
      setRunningMap(rmap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [clientId]);

  // Poll now-running every 10s so elapsed time updates live
  useEffect(() => {
    if (!clientId) return;
    const t = setInterval(() => {
      api(`/clients/${clientId}/now-running`).then(live => {
        const rmap = {};
        for (const r of live?.running || []) rmap[r.agent_slug] = r.elapsed_seconds;
        setRunningMap(rmap);
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, [clientId]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ── Per-agent actions ──
  const togglePauseAgent = async (agent) => {
    setBusy(b => ({ ...b, [agent.id]: true }));
    try {
      const next = !agent.is_active;
      await api(`/agents/${agent.id}`, { method: 'PATCH', body: { is_active: next } });
      showToast(`${agent.name} ${next ? 'resumed' : 'paused'}`);
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(b => ({ ...b, [agent.id]: false })); }
  };

  const setAgentDefaultMode = async (agent, mode) => {
    setBusy(b => ({ ...b, [agent.id]: true }));
    try {
      await api(`/agents/${agent.id}`, { method: 'PATCH', body: { action_mode_default: mode } });
      showToast(`${agent.name} default mode → ${modeMeta(mode).label}`);
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(b => ({ ...b, [agent.id]: false })); }
  };

  const setClientOverride = async (agent, mode) => {
    setBusy(b => ({ ...b, [agent.id]: true }));
    try {
      // mode === agent default → clear override so we fall back to default
      const isDefault = mode === agent.action_mode_default;
      await api(`/clients/${clientId}/agent-mode-override`, {
        method: 'POST',
        body: { agent_slug: agent.slug, mode: isDefault ? null : mode },
      });
      showToast(isDefault ? `${agent.name}: using default (${modeMeta(mode).label})` : `${agent.name} set to ${modeMeta(mode).label} for this client`);
      await load();
    } catch (e) { alert(e.message); }
    finally { setBusy(b => ({ ...b, [agent.id]: false })); }
  };

  // ── Bulk lane actions ──
  const bulkLaneAction = async (lane, patch, label) => {
    if (!window.confirm(`${label} for entire "${lane}" category?`)) return;
    try {
      const res = await api(`/agents/lane/${encodeURIComponent(lane)}`, { method: 'PATCH', body: patch });
      showToast(`${label}: ${res.updated} agents updated`);
      await load();
    } catch (e) { alert(e.message); }
  };

  if (!clientId) return <Empty icon={Bot} msg="Select a client to view agents" />;

  const lanes = Object.keys(agentsByLane).sort();
  const totalAgents = lanes.reduce((sum, l) => sum + agentsByLane[l].length, 0);
  const runningCount = Object.keys(runningMap).length;

  // ── Effective mode for an agent: override → default ──
  const effectiveMode = (agent) => clientOverrides[agent.slug] || agent.action_mode_default || 'approve_then_act';
  const hasOverride = (agent) => !!clientOverrides[agent.slug];

  // ── Status pill logic ──
  const statusOf = (agent) => {
    if (runningMap[agent.slug] != null) return { text: 'Running', color: '#065F46', bg: '#D1FAE5' };
    if (!agent.is_active) return { text: 'Paused', color: '#991B1B', bg: '#FEE2E2' };
    const em = effectiveMode(agent);
    if (em === 'report_only') return { text: 'Report only', color: '#374151', bg: '#E5E7EB' };
    if (em === 'approve_then_act') return { text: 'Approve gate', color: '#1E3A8A', bg: '#DBEAFE' };
    return { text: 'Autonomous', color: '#92400E', bg: '#FEF3C7' };
  };

  return (
    <div>
      <SH
        title="Agents"
        sub={loading ? 'Loading agents...' : `${totalAgents} agents · ${lanes.length} categories · ${runningCount} running now`}
        action={<Btn small secondary onClick={load} ariaLabel="Refresh"><RefreshCw size={12} /> Refresh</Btn>}
      />

      {/* Live toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', bottom: spacing.xl, right: spacing.xl,
            background: colors.text, color: colors.textInverse,
            padding: `${spacing.sm}px ${spacing.lg}px`,
            borderRadius: radius.md, fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
            boxShadow: shadows.lg, zIndex: 1000,
          }}
        >
          {toast}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: spacing.xl }}>
          <AgentListSkeleton />
          <AgentDetailSkeleton />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: spacing.xl }}>
          {/* ─── Lane sidebar ─────────────────────────── */}
          <nav aria-label="Agent list grouped by lane">
            {lanes.map(lane => {
              const laneColor = colors.lanes[lane] || colors.textMuted;
              const laneAgents = agentsByLane[lane];
              const allPaused = laneAgents.every(a => !a.is_active);
              return (
                <div key={lane} style={{ marginBottom: spacing.lg }}>
                  {/* Lane header with bulk controls */}
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: spacing.sm,
                      paddingBottom: spacing.xs,
                      borderBottom: `1px solid ${colors.borderLight}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                        color: laneColor, textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}
                    >
                      {lane} <span style={{ color: colors.textDisabled, marginLeft: 4 }}>({laneAgents.length})</span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        aria-label={`${allPaused ? 'Resume' : 'Pause'} all ${lane}`}
                        title={`${allPaused ? 'Resume' : 'Pause'} entire ${lane} category`}
                        onClick={() => bulkLaneAction(lane, { is_active: allPaused }, `${allPaused ? 'Resume' : 'Pause'} lane`)}
                        style={{
                          border: `1px solid ${colors.borderLight}`, background: colors.surface,
                          borderRadius: radius.sm, padding: '2px 6px', cursor: 'pointer',
                          color: allPaused ? colors.success : colors.textMuted,
                        }}
                      >
                        {allPaused ? <Play size={11} /> : <Pause size={11} />}
                      </button>
                      <button
                        type="button"
                        aria-label={`Set ${lane} to approval gate`}
                        title="Set whole lane to approval-gate mode (safest)"
                        onClick={() => bulkLaneAction(lane, { action_mode_default: 'approve_then_act' }, 'Set lane to approval gate')}
                        style={{
                          border: `1px solid ${colors.borderLight}`, background: colors.surface,
                          borderRadius: radius.sm, padding: '2px 6px', cursor: 'pointer',
                          color: colors.textMuted,
                        }}
                      >
                        <ShieldCheck size={11} />
                      </button>
                    </div>
                  </div>

                  {laneAgents.map(agent => {
                    const isSelected = selected?.id === agent.id;
                    const st = statusOf(agent);
                    const running = runningMap[agent.slug] != null;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`View agent ${agent.name}`}
                        onClick={() => setSelected(isSelected ? null : agent)}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: `${spacing.sm}px ${spacing.md}px`,
                          borderRadius: radius.lg, cursor: 'pointer',
                          marginBottom: spacing.xs,
                          border: '1px solid',
                          borderColor: isSelected ? laneColor : colors.borderLight,
                          background: isSelected ? laneColor + '11' : colors.surface,
                          opacity: agent.is_active ? 1 : 0.6,
                          transition: transitions.fast, fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.xs }}>
                          <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {running && <Activity size={11} color={colors.success} style={{ animation: 'pulse 1.5s infinite' }} />}
                            {agent.name}
                          </span>
                          <Badge text={st.text} color={st.color} bg={st.bg} />
                        </div>
                        <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: 3, display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            {running
                              ? `Running · ${Math.floor(runningMap[agent.slug] / 60)}m ${runningMap[agent.slug] % 60}s`
                              : agent.assignment?.last_run_at
                                ? `Last: ${new Date(agent.assignment.last_run_at).toLocaleDateString()}`
                                : 'Never run'}
                          </span>
                          {hasOverride(agent) && <span style={{ color: colors.warning }}>override</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* ─── Detail panel ─────────────────────────── */}
          {selected ? (() => {
            const agent = agentsByLane[selected.lane]?.find(a => a.id === selected.id) || selected;
            const st = statusOf(agent);
            const em = effectiveMode(agent);
            const isRunning = runningMap[agent.slug] != null;
            const overridden = hasOverride(agent);

            return (
              <Card>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg, gap: spacing.md }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0, color: colors.text }}>
                      {agent.name}
                    </h3>
                    <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs }}>
                      {agent.lane} · {agent.slug}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Badge text={st.text} color={st.color} bg={st.bg} />
                    {isRunning && (
                      <Badge
                        text={`${Math.floor(runningMap[agent.slug] / 60)}m ${runningMap[agent.slug] % 60}s`}
                        color={colors.successDark}
                        bg={colors.successLight}
                      />
                    )}
                  </div>
                </div>

                {/* ── Control panel ── */}
                <div
                  style={{
                    background: colors.background,
                    border: `1px solid ${colors.borderLight}`,
                    borderRadius: radius.lg,
                    padding: spacing.md,
                    marginBottom: spacing.lg,
                  }}
                >
                  <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: spacing.sm }}>
                    Controls
                  </div>

                  {/* Row 1: pause/resume */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
                    <div>
                      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                        Status
                      </div>
                      <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                        {agent.is_active ? 'Running on its schedule' : 'Will not execute until resumed'}
                      </div>
                    </div>
                    <Btn
                      small
                      secondary={agent.is_active}
                      danger={agent.is_active}
                      disabled={busy[agent.id]}
                      onClick={() => togglePauseAgent(agent)}
                    >
                      {agent.is_active ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
                    </Btn>
                  </div>

                  {/* Row 2: default mode */}
                  <div style={{ marginBottom: spacing.md }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs }}>
                      <div>
                        <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                          Default mode (all clients)
                        </div>
                        <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                          {modeMeta(agent.action_mode_default).desc}
                        </div>
                      </div>
                      <ModePills
                        current={agent.action_mode_default}
                        onChange={m => setAgentDefaultMode(agent, m)}
                        disabled={busy[agent.id]}
                      />
                    </div>
                  </div>

                  {/* Row 3: per-client override */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                          This client override
                        </div>
                        <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                          {overridden
                            ? `Overridden → ${modeMeta(em).label}. Click default to clear.`
                            : `Using default (${modeMeta(agent.action_mode_default).label})`}
                        </div>
                      </div>
                      <ModePills
                        current={em}
                        onChange={m => setClientOverride(agent, m)}
                        disabled={busy[agent.id]}
                      />
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 1.6 }}>
                  {agent.description}
                </p>

                {/* Model info grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: spacing.sm,
                    marginBottom: spacing.lg,
                  }}
                >
                  {[
                    ['Model', agent.model],
                    ['Cooldown', `${agent.cooldown_minutes}m`],
                    ['Max Tokens', agent.max_tokens],
                    ['Runs', agent.assignment?.run_count ?? '—'],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{ background: colors.surfaceHover, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px` }}
                    >
                      <div style={{ fontSize: fontSize.micro, color: colors.textDisabled }}>{label}</div>
                      <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* DO rules */}
                {agent.do_rules?.length > 0 && (
                  <div style={{ marginBottom: spacing.md }} role="list" aria-label="DO rules">
                    <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.successDark, marginBottom: spacing.sm }}>
                      DO Rules
                    </div>
                    {agent.do_rules.map((rule, i) => (
                      <div key={i} role="listitem" style={{ fontSize: fontSize.sm, padding: '3px 0', color: colors.text }}>
                        <span aria-hidden="true" style={{ color: colors.success }}>&#10003;</span> {rule}
                      </div>
                    ))}
                  </div>
                )}

                {/* DON'T rules */}
                {agent.dont_rules?.length > 0 && (
                  <div style={{ marginBottom: spacing.md }} role="list" aria-label="DON'T rules">
                    <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.errorDark, marginBottom: spacing.sm }}>
                      DON'T Rules
                    </div>
                    {agent.dont_rules.map((rule, i) => (
                      <div key={i} role="listitem" style={{ fontSize: fontSize.sm, padding: '3px 0', color: colors.text }}>
                        <span aria-hidden="true" style={{ color: colors.error }}>&#10007;</span> {rule}
                      </div>
                    ))}
                  </div>
                )}

                {/* Base prompt */}
                <div>
                  <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, marginBottom: spacing.sm, color: colors.text }}>
                    Base Prompt
                  </div>
                  <div
                    style={{
                      background: colors.background,
                      border: `1px solid ${colors.borderLight}`,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      fontSize: fontSize.xs,
                      color: colors.textSecondary,
                      maxHeight: 200,
                      overflow: 'auto',
                      lineHeight: 1.6,
                      direction: 'ltr',
                      textAlign: 'left',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {agent.base_prompt}
                  </div>
                </div>
              </Card>
            );
          })() : (
            <Card>
              <Empty icon={Bot} msg="Click an agent to view details and controls" />
            </Card>
          )}
        </div>
      )}

      {/* Pulse keyframes for running indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
