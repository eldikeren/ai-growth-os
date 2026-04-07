// ─── System Verification View v2 ─────────────────────────────────
// Actionable health checks with Fix buttons
import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, Check, X, Zap, ArrowRight, Wrench, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import {
  Card, Btn, Spin, Empty, SH, Skeleton,
} from '../components/index.jsx';

// ─── Fix action config per check ID ─────────────────────────────
const FIX_CONFIG = {
  memory_loaded: {
    label: 'Go to Memory',
    navigate: 'memory',
    description: 'Add memory items so agents have context about your client. Upload documents or add key facts.',
    icon: '💾',
    autoFix: false,
  },
  recent_run: {
    label: 'Run Agent Now',
    description: 'No successful run in 48h. Click to queue a fresh agent run immediately.',
    icon: '▶️',
    autoFix: true,
  },
  credential_health: {
    label: 'Fix Credentials',
    navigate: 'credentials',
    description: 'Some credentials are missing or expired. Go to Credentials to configure your service connections.',
    icon: '🔑',
    autoFix: false,
  },
  no_orphan_runs: {
    label: 'Cancel Stuck Runs',
    description: 'Some runs have been stuck for over 10 minutes. Click to auto-cancel them.',
    icon: '🔧',
    autoFix: true,
  },
  no_critical_incidents: {
    label: 'View Incidents',
    navigate: 'incidents',
    description: 'There are critical open incidents that need your attention.',
    icon: '🚨',
    autoFix: false,
  },
  pending_approvals: {
    label: 'Review Approvals',
    navigate: 'approvals',
    description: 'Pending approvals are piling up. Review and approve or reject them.',
    icon: '👍',
    autoFix: false,
  },
  agent_assignments: {
    label: 'Configure Agents',
    navigate: 'agents',
    description: 'Not enough agents are enabled. Go to Agents to assign and enable them.',
    icon: '🤖',
    autoFix: false,
  },
  prompt_quality: {
    label: 'Fix Prompts',
    navigate: 'prompt-overrides',
    description: 'Some agents have empty prompts. Go to Prompt Overrides to configure them.',
    icon: '✏️',
    autoFix: false,
  },
  queue_health: {
    label: 'View Queue',
    navigate: 'queue',
    description: 'The run queue is backed up. Review and clear failed items.',
    icon: '📋',
    autoFix: false,
  },
  kpi_integrity: {
    label: 'View Dashboard',
    navigate: 'dashboard',
    description: 'KPI data sources need verification. Check your dashboard metrics.',
    icon: '📊',
    autoFix: false,
  },
};

// ─── Health score color ──────────────────────────────────────────
function scoreColor(score) {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.warning;
  return colors.error;
}

// ─── Score Ring ──────────────────────────────────────────────────
function ScoreRing({ score, size = 120 }) {
  const strokeWidth = 8;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={colors.borderLight} strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: fontSize['4xl'], fontWeight: fontWeight.extrabold, color, lineHeight: 1 }}>{score}%</div>
      </div>
    </div>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────
function VerificationSkeleton() {
  return (
    <div>
      <div style={{ display: 'flex', gap: spacing.xl, alignItems: 'center', marginBottom: spacing['2xl'] }}>
        <Skeleton width={120} height={120} borderRadius="50%" />
        <div>
          <Skeleton width={200} height={20} style={{ marginBottom: spacing.sm }} />
          <Skeleton width={140} height={14} />
        </div>
      </div>
      <div style={{ display: 'grid', gap: spacing.md }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} style={{ padding: `${spacing.lg}px ${spacing.xl}px` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
              <Skeleton width={28} height={28} borderRadius={radius.full} />
              <div style={{ flex: 1 }}>
                <Skeleton width="50%" height={14} style={{ marginBottom: spacing.xs }} />
                <Skeleton width="70%" height={12} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Single check item with fix button ──────────────────────────
function CheckItem({ check, onFix, fixing, clientId }) {
  const pass = check.pass;
  const fixConfig = FIX_CONFIG[check.id];
  const [fixResult, setFixResult] = useState(null);

  const handleFix = async () => {
    if (fixConfig?.navigate) {
      // Navigate to the relevant view
      window.dispatchEvent(new CustomEvent('navigate', { detail: fixConfig.navigate }));
      return;
    }
    if (fixConfig?.autoFix) {
      onFix(check.id);
    }
  };

  return (
    <Card
      style={{
        borderColor: pass ? colors.successLight : colors.errorLight,
        background: pass ? '#f0fdf4' : '#fef2f2',
        padding: `${spacing.lg}px ${spacing.xl}px`,
        borderLeft: `4px solid ${pass ? colors.success : colors.error}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.md }}>
        {/* Status icon */}
        <div
          aria-hidden="true"
          style={{
            width: 32, height: 32, borderRadius: radius.full,
            background: pass ? colors.success : colors.error,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginTop: 2,
            boxShadow: `0 0 8px ${pass ? colors.success : colors.error}33`,
          }}
        >
          {pass ? <Check size={16} color="#fff" /> : <X size={16} color="#fff" />}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <span style={{
              fontSize: fontSize.lg, fontWeight: fontWeight.bold,
              color: pass ? colors.successDark : colors.errorDark,
            }}>
              {check.label}
            </span>
            <span style={{
              fontSize: fontSize.xs, fontWeight: fontWeight.bold,
              color: pass ? colors.successDark : colors.errorDark,
              background: pass ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              padding: '2px 8px', borderRadius: radius.full,
            }}>
              {pass ? 'PASS' : 'FAIL'}
            </span>
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 }}>
            {check.detail}
          </div>

          {/* Fix description — only show for failed checks */}
          {!pass && fixConfig && (
            <div style={{
              marginTop: spacing.sm, fontSize: fontSize.sm,
              color: colors.textSecondary, lineHeight: 1.5,
              paddingTop: spacing.sm, borderTop: `1px solid rgba(239,68,68,0.15)`,
            }}>
              {fixConfig.description}
            </div>
          )}
        </div>

        {/* Fix button — only show for failed checks */}
        {!pass && fixConfig && (
          <Btn
            onClick={handleFix}
            disabled={fixing === check.id}
            small
            color={fixConfig.autoFix ? colors.primary : colors.textSecondary}
            secondary={!fixConfig.autoFix}
            style={{ flexShrink: 0, marginTop: 2 }}
            ariaLabel={fixConfig.label}
          >
            {fixing === check.id ? (
              <Spin />
            ) : fixConfig.autoFix ? (
              <Wrench size={13} />
            ) : (
              <ArrowRight size={13} />
            )}
            {fixConfig.label}
          </Btn>
        )}
      </div>
    </Card>
  );
}

// ─── Main View ───────────────────────────────────────────────────
export default function VerificationView({ clientId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(null);
  const [fixMessage, setFixMessage] = useState(null);

  const run = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setFixMessage(null);
    try {
      setResult(await api(`/clients/${clientId}/verification`));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { run(); }, [run]);

  const handleFix = async (checkId) => {
    setFixing(checkId);
    setFixMessage(null);
    try {
      const res = await api(`/clients/${clientId}/verification/fix`, {
        method: 'POST',
        body: { checkId },
      });
      setFixMessage({ type: 'success', text: res.results?.map(r => r.detail).join('. ') || 'Fix applied' });
      // Re-run verification after fix
      setTimeout(() => run(), 1500);
    } catch (e) {
      setFixMessage({ type: 'error', text: e.message });
    }
    setFixing(null);
  };

  const handleFixAll = async () => {
    setFixing('all');
    setFixMessage(null);
    try {
      const res = await api(`/clients/${clientId}/verification/fix`, {
        method: 'POST',
        body: { checkId: 'all' },
      });
      setFixMessage({ type: 'success', text: res.results?.map(r => r.detail).join(' • ') || 'All fixes applied' });
      setTimeout(() => run(), 1500);
    } catch (e) {
      setFixMessage({ type: 'error', text: e.message });
    }
    setFixing(null);
  };

  if (!clientId) return <Empty icon={Shield} msg="Select a client to run verification" />;

  const failedChecks = result?.checks?.filter(c => !c.pass) || [];
  const passedChecks = result?.checks?.filter(c => c.pass) || [];
  const autoFixable = failedChecks.filter(c => FIX_CONFIG[c.id]?.autoFix);

  return (
    <div>
      <SH
        title="System Verification"
        sub="Real-time health checks"
        action={
          <div style={{ display: 'flex', gap: spacing.sm }}>
            {failedChecks.length > 0 && autoFixable.length > 0 && (
              <Btn onClick={handleFixAll} disabled={!!fixing} color={colors.primary} ariaLabel="Auto-fix all issues">
                {fixing === 'all' ? <Spin /> : <Wrench size={13} />}
                Fix All ({autoFixable.length})
              </Btn>
            )}
            <Btn onClick={run} disabled={loading} secondary ariaLabel="Run verification checks">
              {loading ? <Spin /> : <RefreshCw size={13} />}
              Run Checks
            </Btn>
          </div>
        }
      />

      {/* Fix result banner */}
      {fixMessage && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: spacing.md,
          marginBottom: spacing.lg, padding: spacing.lg,
          background: fixMessage.type === 'success' ? colors.successLight : colors.errorLight,
          border: `1px solid ${fixMessage.type === 'success' ? colors.success + '33' : colors.error + '33'}`,
          borderRadius: radius.lg,
          animation: 'fadeIn 0.3s ease-out',
        }}>
          {fixMessage.type === 'success' ? (
            <CheckCircle2 size={18} color={colors.success} />
          ) : (
            <AlertTriangle size={18} color={colors.error} />
          )}
          <div style={{ flex: 1, fontSize: fontSize.md, color: fixMessage.type === 'success' ? colors.successDark : colors.errorDark }}>
            {fixMessage.text}
          </div>
          <Btn small ghost onClick={() => setFixMessage(null)} ariaLabel="Dismiss">
            <X size={14} />
          </Btn>
        </div>
      )}

      {loading ? (
        <VerificationSkeleton />
      ) : result && (
        <>
          {/* ── Health Score Hero ── */}
          <div style={{
            display: 'flex', gap: spacing['2xl'], alignItems: 'center',
            marginBottom: spacing['2xl'], padding: spacing['2xl'],
            background: `linear-gradient(135deg, ${colors.surface}, ${colors.surfaceHover})`,
            borderRadius: radius.xl, border: `1px solid ${colors.border}`,
          }}>
            <ScoreRing score={result.health_score} />
            <div>
              <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.text, marginBottom: 4 }}>
                {result.all_passed
                  ? '✅ All checks passed!'
                  : `${result.pass_count}/${result.total_checks} passed`}
              </div>
              <div style={{ fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.md }}>
                System health score
              </div>
              {failedChecks.length > 0 && (
                <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
                  {failedChecks.map(c => {
                    const config = FIX_CONFIG[c.id];
                    return (
                      <span key={c.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: colors.errorLight, color: colors.errorDark,
                        padding: '3px 10px', borderRadius: radius.full,
                        fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                      }}>
                        {config?.icon || '❌'} {c.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Failed Checks ── */}
          {failedChecks.length > 0 && (
            <div style={{ marginBottom: spacing['2xl'] }}>
              <div style={{
                fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.error,
                marginBottom: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.sm,
              }}>
                <AlertTriangle size={18} /> Needs Attention ({failedChecks.length})
              </div>
              <div style={{ display: 'grid', gap: spacing.md }}>
                {failedChecks.map(c => (
                  <CheckItem key={c.id} check={c} onFix={handleFix} fixing={fixing} clientId={clientId} />
                ))}
              </div>
            </div>
          )}

          {/* ── Passed Checks ── */}
          {passedChecks.length > 0 && (
            <div>
              <div style={{
                fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.success,
                marginBottom: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.sm,
              }}>
                <CheckCircle2 size={18} /> Passing ({passedChecks.length})
              </div>
              <div style={{ display: 'grid', gap: spacing.sm }}>
                {passedChecks.map(c => (
                  <CheckItem key={c.id} check={c} onFix={handleFix} fixing={fixing} clientId={clientId} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
