// ─── AI Growth OS — Agents View ─────────────────────────────────
import { useState, useEffect } from 'react';
import { Bot } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Badge, Card, SH, Empty, SkeletonCard, Skeleton } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Skeleton for the sidebar lane list ─────────────────────────
function AgentListSkeleton() {
  return (
    <div>
      {[1, 2, 3].map(lane => (
        <div key={lane} style={{ marginBottom: spacing.lg }}>
          <Skeleton width={120} height={10} style={{ marginBottom: spacing.sm }} />
          {[1, 2].map(a => (
            <div
              key={a}
              style={{
                padding: `${spacing.sm}px ${spacing.md}px`,
                marginBottom: spacing.xs,
                borderRadius: radius.lg,
                border: `1px solid ${colors.borderLight}`,
              }}
            >
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

// ─── Skeleton for the detail panel ──────────────────────────────
function AgentDetailSkeleton() {
  return (
    <Card>
      <Skeleton width="50%" height={18} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="35%" height={12} style={{ marginBottom: spacing.xl }} />
      <Skeleton width="100%" height={14} style={{ marginBottom: spacing.sm }} />
      <Skeleton width="90%" height={14} style={{ marginBottom: spacing.xl }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: spacing.sm, marginBottom: spacing.lg }}>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ background: colors.surfaceHover, borderRadius: radius.md, padding: `${spacing.sm}px ${spacing.md}px` }}>
            <Skeleton width={50} height={9} style={{ marginBottom: spacing.xs }} />
            <Skeleton width={70} height={12} />
          </div>
        ))}
      </div>
      <Skeleton width="100%" height={120} borderRadius={radius.md} />
    </Card>
  );
}

export default function AgentsView({ clientId }) {
  const [agentsByLane, setAgentsByLane] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api(`/clients/${clientId}/agents`)
      .then(setAgentsByLane)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId]);

  if (!clientId) return <Empty icon={Bot} msg="Select a client to view agents" />;

  const lanes = Object.keys(agentsByLane).sort();
  const totalAgents = lanes.reduce((sum, l) => sum + agentsByLane[l].length, 0);

  return (
    <div>
      <SH
        title="Agents"
        sub={loading ? 'Loading agents...' : `${totalAgents} agents across ${lanes.length} lanes`}
      />

      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '300px 1fr',
            gap: spacing.xl,
          }}
        >
          <AgentListSkeleton />
          <AgentDetailSkeleton />
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '300px 1fr',
            gap: spacing.xl,
          }}
        >
          {/* ─── Lane sidebar ─────────────────────────── */}
          <nav aria-label="Agent list grouped by lane">
            {lanes.map(lane => {
              const laneColor = colors.lanes[lane] || colors.textMuted;
              return (
                <div key={lane} style={{ marginBottom: spacing.lg }}>
                  <div
                    style={{
                      fontSize: fontSize.xs,
                      fontWeight: fontWeight.bold,
                      color: laneColor,
                      marginBottom: spacing.sm,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {lane}
                  </div>
                  {agentsByLane[lane].map(agent => {
                    const role = colors.roles[agent.role_type] || {};
                    const roleLabel =
                      agent.role_type
                        ? agent.role_type.charAt(0).toUpperCase() + agent.role_type.slice(1)
                        : '';
                    const isSelected = selected?.id === agent.id;

                    return (
                      <button
                        key={agent.id}
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`View agent ${agent.name}, role ${roleLabel}`}
                        onClick={() => setSelected(isSelected ? null : agent)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: `${spacing.sm}px ${spacing.md}px`,
                          borderRadius: radius.lg,
                          cursor: 'pointer',
                          marginBottom: spacing.xs,
                          border: '1px solid',
                          borderColor: isSelected ? laneColor : colors.borderLight,
                          background: isSelected ? laneColor + '11' : colors.surface,
                          transition: transitions.fast,
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                            {agent.name}
                          </span>
                          <Badge text={roleLabel} color={role.color} bg={role.bg} />
                        </div>
                        {agent.assignment?.last_run_at && (
                          <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: 3 }}>
                            Last: {new Date(agent.assignment.last_run_at).toLocaleDateString()}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          {/* ─── Detail panel ─────────────────────────── */}
          {selected ? (
            <Card>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.lg }}>
                <div>
                  <h3 style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, margin: 0, color: colors.text }}>
                    {selected.name}
                  </h3>
                  <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs }}>
                    {selected.lane} &middot; {selected.slug}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: spacing.sm }}>
                  <Badge
                    text={
                      selected.role_type
                        ? selected.role_type.charAt(0).toUpperCase() + selected.role_type.slice(1)
                        : ''
                    }
                    color={colors.roles[selected.role_type]?.color}
                    bg={colors.roles[selected.role_type]?.bg}
                  />
                  <Badge text={selected.action_mode_default} color={colors.textSecondary} bg={colors.surfaceHover} />
                </div>
              </div>

              {/* Description */}
              <p style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 1.6 }}>
                {selected.description}
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
                  ['Model', selected.model],
                  ['Cooldown', `${selected.cooldown_minutes}m`],
                  ['Max Tokens', selected.max_tokens],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      background: colors.surfaceHover,
                      borderRadius: radius.md,
                      padding: `${spacing.sm}px ${spacing.md}px`,
                    }}
                  >
                    <div style={{ fontSize: fontSize.micro, color: colors.textDisabled }}>{label}</div>
                    <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* DO rules */}
              {selected.do_rules?.length > 0 && (
                <div style={{ marginBottom: spacing.md }} role="list" aria-label="DO rules">
                  <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.successDark, marginBottom: spacing.sm }}>
                    DO Rules
                  </div>
                  {selected.do_rules.map((rule, i) => (
                    <div key={i} role="listitem" style={{ fontSize: fontSize.sm, padding: '3px 0', color: colors.text }}>
                      <span aria-hidden="true" style={{ color: colors.success }}>&#10003;</span> {rule}
                    </div>
                  ))}
                </div>
              )}

              {/* DON'T rules */}
              {selected.dont_rules?.length > 0 && (
                <div style={{ marginBottom: spacing.md }} role="list" aria-label="DON'T rules">
                  <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.errorDark, marginBottom: spacing.sm }}>
                    DON'T Rules
                  </div>
                  {selected.dont_rules.map((rule, i) => (
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
                  {selected.base_prompt}
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <Empty icon={Bot} msg="Click an agent to view details" />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
