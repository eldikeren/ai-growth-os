// ─── System Verification View ────────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { Shield, RefreshCw, Check, X } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import {
  Card, Btn, Spin, Empty, SH, KpiCard, Skeleton, SkeletonKpi, SkeletonCard,
} from '../components/index.jsx';

// ─── Health score color ──────────────────────────────────────────
function scoreColor(score) {
  if (score >= 80) return colors.success;
  if (score >= 60) return colors.warning;
  return colors.error;
}

// ─── Loading skeleton ────────────────────────────────────────────
function VerificationSkeleton() {
  return (
    <div>
      <div style={{ display: 'flex', gap: spacing.lg, alignItems: 'center', marginBottom: spacing.xl }}>
        <Skeleton width={100} height={56} borderRadius={radius.xl} />
        <div>
          <Skeleton width={180} height={18} style={{ marginBottom: spacing.xs }} />
          <Skeleton width={120} height={14} />
        </div>
      </div>
      <div style={{ display: 'grid', gap: spacing.sm }}>
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

// ─── Single check item ───────────────────────────────────────────
function CheckItem({ check }) {
  const pass = check.pass;
  return (
    <Card
      style={{
        borderColor: pass ? colors.successLight : colors.errorLight,
        background: pass ? '#f0fdf4' : '#fef2f2',
        padding: `${spacing.lg}px ${spacing.xl}px`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md }}>
        <div
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: radius.full,
            background: pass ? colors.success : colors.error,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {pass ? <Check size={14} color={colors.textInverse} /> : <X size={14} color={colors.textInverse} />}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: fontSize.md,
              fontWeight: fontWeight.bold,
              color: pass ? colors.successDark : colors.errorDark,
            }}
          >
            {check.label}
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 }}>
            {check.detail}
          </div>
        </div>
        <span
          role="status"
          aria-label={pass ? 'Passed' : 'Failed'}
          style={{
            fontSize: fontSize.xs,
            fontWeight: fontWeight.semibold,
            color: pass ? colors.successDark : colors.errorDark,
          }}
        >
          {pass ? 'PASS' : 'FAIL'}
        </span>
      </div>
    </Card>
  );
}

// ─── Main View ───────────────────────────────────────────────────
export default function VerificationView({ clientId }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      setResult(await api(`/clients/${clientId}/verification`));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { run(); }, [run]);

  if (!clientId) return <Empty icon={Shield} msg="Select a client to run verification" />;

  return (
    <div>
      <SH
        title="System Verification"
        sub="Real-time health checks"
        action={
          <Btn onClick={run} disabled={loading} ariaLabel="Run verification checks">
            {loading ? <Spin /> : <RefreshCw size={13} />}
            Run Checks
          </Btn>
        }
      />

      {loading ? (
        <VerificationSkeleton />
      ) : result && (
        <>
          {/* ── Health Score Hero ── */}
          <div
            role="status"
            aria-label={`Health score: ${result.health_score}%`}
            style={{
              marginBottom: spacing.xl,
              display: 'flex',
              gap: spacing.lg,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: fontSize.hero,
                fontWeight: fontWeight.extrabold,
                color: scoreColor(result.health_score),
                lineHeight: 1,
              }}
            >
              {result.health_score}%
            </div>
            <div>
              <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.bold, color: colors.text }}>
                {result.all_passed
                  ? 'All checks passed'
                  : `${result.pass_count}/${result.total_checks} passed`}
              </div>
              <div style={{ fontSize: fontSize.md, color: colors.textMuted }}>System health score</div>
            </div>
          </div>

          {/* ── Checks Grid ── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: spacing.sm,
            }}
          >
            {result.checks.map((c) => (
              <CheckItem key={c.id} check={c} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
