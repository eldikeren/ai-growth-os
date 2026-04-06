import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions } from '../theme.js';
import { Card, SH, Badge, Empty, SkeletonCard } from '../components/index.jsx';

// ─── Schedule Row ───────────────────────────────────────────────
function ScheduleRow({ schedule, onToggle }) {
  const agentName = schedule.agent_templates?.name || 'Unknown Agent';
  const lane = schedule.agent_templates?.lane || '';
  const checkboxId = `schedule-toggle-${schedule.id}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        padding: `${spacing.md}px 0`,
        borderBottom: `1px solid ${colors.borderLight}`,
      }}
    >
      {/* Enable/disable checkbox */}
      <input
        id={checkboxId}
        type="checkbox"
        checked={schedule.enabled}
        onChange={e => onToggle(schedule.id, e.target.checked)}
        aria-label={`${schedule.enabled ? 'Disable' : 'Enable'} schedule for ${agentName}`}
        style={{
          width: 16,
          height: 16,
          cursor: 'pointer',
          accentColor: colors.primary,
          flexShrink: 0,
        }}
      />

      {/* Agent info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: fontSize.md,
            fontWeight: fontWeight.semibold,
            color: colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {agentName}
        </div>
        <div
          style={{
            fontSize: fontSize.sm,
            color: colors.textMuted,
            marginTop: 2,
          }}
        >
          <code
            style={{
              fontSize: fontSize.xs,
              background: colors.surfaceHover,
              padding: '1px 4px',
              borderRadius: radius.sm,
              fontFamily: 'monospace',
            }}
          >
            {schedule.cron_expression}
          </code>
          {lane && (
            <span style={{ marginLeft: spacing.sm }}>
              {' \u00B7 '}{lane}
            </span>
          )}
        </div>
        {schedule.last_run_at && (
          <div
            style={{
              fontSize: fontSize.xs,
              color: colors.textDisabled,
              marginTop: 2,
            }}
          >
            Last:{' '}
            <time dateTime={schedule.last_run_at}>
              {new Date(schedule.last_run_at).toLocaleString()}
            </time>
            {' \u00B7 '}Runs: {schedule.run_count}
          </div>
        )}
      </div>

      {/* Active / Paused badge */}
      <Badge
        text={schedule.enabled ? 'Active' : 'Paused'}
        color={schedule.enabled ? colors.successDark : colors.textMuted}
        bg={schedule.enabled ? colors.successLight : colors.surfaceHover}
      />
    </div>
  );
}

// ─── Schedules View ─────────────────────────────────────────────
export default function SchedulesView({ clientId }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      setSchedules(await api(`/clients/${clientId}/schedules`));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleToggle = async (id, enabled) => {
    try {
      await api(`/schedules/${id}`, { method: 'PATCH', body: { enabled } });
      setSchedules(await api(`/clients/${clientId}/schedules`));
    } catch (e) {
      console.error(e);
    }
  };

  if (!clientId) {
    return <Empty icon={Clock} msg="Select a client to view schedules" />;
  }

  return (
    <div>
      <SH title="Agent Schedules" sub="Automated cron-based execution" />

      {loading ? (
        <SkeletonCard rows={5} />
      ) : (
        <Card>
          {schedules.map(s => (
            <ScheduleRow
              key={s.id}
              schedule={s}
              onToggle={handleToggle}
            />
          ))}
          {schedules.length === 0 && (
            <Empty icon={Clock} msg="No schedules configured" />
          )}
        </Card>
      )}
    </div>
  );
}
