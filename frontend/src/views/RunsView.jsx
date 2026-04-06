// ─── AI Growth OS — Runs View ───────────────────────────────────
import { useState, useEffect } from 'react';
import { Play, Zap, Activity, X } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Badge, Dot, Card, Btn, SH, Empty, Spin, SkeletonCard, Skeleton, Json, Field, selectStyle } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Skeleton for run control cards ─────────────────────────────
function RunControlSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: spacing.xl,
        marginBottom: spacing['2xl'],
      }}
    >
      <Card>
        <Skeleton width={140} height={14} style={{ marginBottom: spacing.md }} />
        <Skeleton width="100%" height={34} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />
        <Skeleton width={130} height={14} style={{ marginBottom: spacing.sm }} />
        <Skeleton width={90} height={30} borderRadius={radius.md} />
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        <Card>
          <Skeleton width={100} height={14} style={{ marginBottom: spacing.sm }} />
          <Skeleton width="100%" height={34} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />
          <Skeleton width={90} height={30} borderRadius={radius.md} />
        </Card>
        <Card>
          <Skeleton width={120} height={14} style={{ marginBottom: spacing.xs }} />
          <Skeleton width="80%" height={12} style={{ marginBottom: spacing.sm }} />
          <Skeleton width={80} height={30} borderRadius={radius.md} />
        </Card>
      </div>
    </div>
  );
}

// ─── Skeleton for recent runs list ──────────────────────────────
function RunsListSkeleton() {
  return (
    <Card>
      <Skeleton width={120} height={14} style={{ marginBottom: spacing.lg }} />
      {[1, 2, 3, 4, 5].map(i => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            padding: `${spacing.sm}px ${spacing.md}px`,
            marginBottom: spacing.xs,
          }}
        >
          <Skeleton width={8} height={8} borderRadius="50%" />
          <div style={{ flex: 1 }}>
            <Skeleton width="55%" height={13} style={{ marginBottom: 3 }} />
            <Skeleton width="35%" height={10} />
          </div>
          <Skeleton width={64} height={20} borderRadius={radius.sm} />
        </div>
      ))}
    </Card>
  );
}

export default function RunsView({ clientId }) {
  const [agents, setAgents] = useState({});
  const [runs, setRuns] = useState([]);
  const [selAgent, setSelAgent] = useState('');
  const [selLane, setSelLane] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [dryRun, setDryRun] = useState(false);
  const [selRun, setSelRun] = useState(null);
  const [loading, setLoading] = useState(false);

  const lanes = Object.keys(agents).sort();

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    Promise.all([
      api(`/clients/${clientId}/agents`),
      api(`/clients/${clientId}/runs`),
    ])
      .then(([a, r]) => { setAgents(a); setRuns(r); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId]);

  const exec = async (mode) => {
    setRunning(true);
    setResult(null);
    try {
      let res;
      if (mode === 'single') {
        if (!selAgent) { alert('Select agent'); setRunning(false); return; }
        res = await api('/runs/execute', { method: 'POST', body: { clientId, agentTemplateId: selAgent, isDryRun: dryRun } });
      } else if (mode === 'lane') {
        if (!selLane) { alert('Select lane'); setRunning(false); return; }
        res = await api('/runs/run-lane', { method: 'POST', body: { clientId, laneName: selLane } });
      } else {
        res = await api('/runs/run-all', { method: 'POST', body: { clientId } });
      }
      setResult(res);
      setRuns(await api(`/clients/${clientId}/runs`));
    } catch (e) {
      setResult({ error: e.message });
    }
    setRunning(false);
  };

  if (!clientId) return <Empty icon={Play} msg="Select a client to run agents" />;

  return (
    <div>
      <SH title="Run Control" sub="Execute agents individually, by lane, or all at once" />

      {/* ─── Run control cards ─────────────────────── */}
      {loading ? (
        <RunControlSkeleton />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: spacing.xl,
            marginBottom: spacing['2xl'],
          }}
        >
          {/* Single agent card */}
          <Card>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md }}>
              Run Single Agent
            </div>
            <Field label="Agent" htmlFor="run-agent-select" required>
              <select
                id="run-agent-select"
                value={selAgent}
                onChange={e => setSelAgent(e.target.value)}
                aria-label="Select an agent to run"
                style={selectStyle}
              >
                <option value="">Select agent...</option>
                {lanes.map(lane => (
                  <optgroup key={lane} label={lane}>
                    {agents[lane].map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} [{a.role_type}]
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                fontSize: fontSize.md,
                cursor: 'pointer',
                marginBottom: spacing.sm,
                color: colors.textSecondary,
              }}
            >
              <input
                type="checkbox"
                checked={dryRun}
                onChange={e => setDryRun(e.target.checked)}
                aria-label="Enable dry run mode (preview only)"
              />
              Dry Run (preview only)
            </label>
            <Btn
              onClick={() => exec('single')}
              disabled={running || !selAgent}
              ariaLabel={dryRun ? 'Start dry run for selected agent' : 'Run selected agent'}
            >
              {running ? <Spin /> : <Play size={13} />}
              {dryRun ? 'Dry Run' : 'Run Agent'}
            </Btn>
          </Card>

          {/* Lane + All cards column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <Card>
              <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
                Run Lane
              </div>
              <Field label="Lane" htmlFor="run-lane-select" required>
                <select
                  id="run-lane-select"
                  value={selLane}
                  onChange={e => setSelLane(e.target.value)}
                  aria-label="Select a lane to run"
                  style={selectStyle}
                >
                  <option value="">Select lane...</option>
                  {lanes.map(l => (
                    <option key={l} value={l}>
                      {l} ({agents[l].length})
                    </option>
                  ))}
                </select>
              </Field>
              <Btn
                onClick={() => exec('lane')}
                disabled={running || !selLane}
                color={colors.success}
                ariaLabel="Run all agents in selected lane"
              >
                {running ? <Spin /> : <Zap size={13} />}
                Run Lane
              </Btn>
            </Card>

            <Card>
              <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs }}>
                Run All Agents
              </div>
              <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm }}>
                Queues all enabled agents in order
              </div>
              <Btn
                onClick={() => exec('all')}
                disabled={running}
                color="#7c3aed"
                ariaLabel="Run all agents"
              >
                {running ? <Spin /> : <Activity size={13} />}
                Run All
              </Btn>
            </Card>
          </div>
        </div>
      )}

      {/* ─── Result card ──────────────────────────── */}
      {result && (
        <Card
          style={{
            marginBottom: spacing.xl,
            borderColor: result.error ? colors.errorLight : colors.successLight,
            background: result.error ? colors.errorLight : colors.successLight,
          }}
        >
          <div
            style={{
              fontSize: fontSize.md,
              fontWeight: fontWeight.semibold,
              color: result.error ? colors.errorDark : colors.successDark,
            }}
            role="alert"
          >
            {result.error
              ? `Error: ${result.error}`
              : result.queued
                ? `Queued ${result.queued} agents`
                : 'Run complete'}
          </div>
          {result.output && <Json data={result.output} />}
        </Card>
      )}

      {/* ─── Recent runs list ─────────────────────── */}
      {loading ? (
        <RunsListSkeleton />
      ) : (
        <Card>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg }}>
            Recent Runs
          </div>
          {runs.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelRun(selRun?.id === r.id ? null : r)}
              aria-expanded={selRun?.id === r.id}
              aria-label={`Run ${r.agent_templates?.name}, status ${r.status}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.sm,
                padding: `${spacing.sm}px ${spacing.md}px`,
                width: '100%',
                textAlign: 'left',
                background: selRun?.id === r.id ? colors.primaryLightest : colors.surface,
                borderRadius: radius.md,
                cursor: 'pointer',
                border: selRun?.id === r.id ? `1px solid ${colors.primary}` : '1px solid transparent',
                transition: transitions.fast,
                fontFamily: 'inherit',
                marginBottom: 2,
              }}
            >
              <Dot s={r.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: fontSize.md,
                    fontWeight: fontWeight.semibold,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: colors.text,
                  }}
                >
                  {r.agent_templates?.name}
                </div>
                <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>
                  {new Date(r.created_at).toLocaleString()}
                  {r.tokens_used ? ` \u00B7 ${r.tokens_used} tok` : ''}
                </div>
              </div>
              <Badge text={r.status} color={colors.status[r.status]} bg={(colors.status[r.status] || colors.textDisabled) + '22'} />
            </button>
          ))}
          {runs.length === 0 && <Empty icon={Play} msg="No runs yet" />}
        </Card>
      )}

      {/* ─── Selected run detail ──────────────────── */}
      {selRun && (
        <Card style={{ marginTop: spacing.lg }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.lg }}>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
              Run: {selRun.agent_templates?.name}
            </div>
            <Btn secondary small onClick={() => setSelRun(null)} ariaLabel="Close run details">
              <X size={12} />
            </Btn>
          </div>

          {/* Stats grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: spacing.sm,
              marginBottom: spacing.lg,
            }}
          >
            {[
              ['Status', selRun.status],
              ['Tokens', selRun.tokens_used],
              ['Duration', selRun.duration_ms ? `${selRun.duration_ms}ms` : '\u2014'],
              ['Changed', selRun.changed_anything ? 'Yes' : 'No'],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  background: colors.surfaceHover,
                  borderRadius: radius.md,
                  padding: `${spacing.sm}px ${spacing.sm}px`,
                }}
              >
                <div style={{ fontSize: fontSize.micro, color: colors.textDisabled }}>{label}</div>
                <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                  {value ?? '\u2014'}
                </div>
              </div>
            ))}
          </div>

          {/* Error */}
          {selRun.error && (
            <div
              role="alert"
              style={{
                background: colors.errorLight,
                color: colors.errorDark,
                padding: spacing.sm,
                borderRadius: radius.md,
                fontSize: fontSize.sm,
                marginBottom: spacing.md,
              }}
            >
              {selRun.error}
            </div>
          )}

          {/* Output */}
          {selRun.output && <Json data={selRun.output} />}
        </Card>
      )}
    </div>
  );
}
