// ─── AI Growth OS — Data Health View ────────────────────────────
// Shows cross-table data integrity findings. Each finding has a rule,
// severity, sample rows, and (when safe) a one-click Fix.
// Findings are written by the dataIntegrityAudit which runs every 5 min.
import { useState, useEffect, useCallback } from 'react';
import { Shield, CheckCircle2, AlertTriangle, AlertCircle, Info, RefreshCw, X } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Card, Badge, Btn, SH, Empty, SkeletonCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

const SEV_META = {
  critical: { color: '#b91c1c', bg: '#fee2e2', icon: AlertCircle, label: 'Critical' },
  error:    { color: '#b91c1c', bg: '#fee2e2', icon: AlertCircle, label: 'Error' },
  warn:     { color: '#b45309', bg: '#fef3c7', icon: AlertTriangle, label: 'Warning' },
  info:     { color: '#1e40af', bg: '#dbeafe', icon: Info, label: 'Info' },
};

const SEV_ORDER = { critical: 0, error: 1, warn: 2, info: 3 };

function FindingCard({ finding, onFix, onDismiss, busy }) {
  const meta = SEV_META[finding.severity] || SEV_META.info;
  const Icon = meta.icon;

  return (
    <Card style={{ marginBottom: spacing.md, borderLeft: `4px solid ${meta.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
            <Icon size={18} color={meta.color} />
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
              {finding.rule_label}
            </span>
            <Badge text={meta.label} color={meta.color} bg={meta.bg} />
            {finding.auto_fixed && (
              <Badge text="Auto-fixed" color={colors.successDark} bg={colors.successLight} />
            )}
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm }}>
            {finding.description}
          </div>
          <div style={{ display: 'flex', gap: spacing.md, fontSize: fontSize.xs, color: colors.textMuted, flexWrap: 'wrap' }}>
            <span>Table: <code style={{ background: colors.surfaceHover, padding: '1px 6px', borderRadius: 4 }}>{finding.table_name}</code></span>
            <span>Rows: <strong style={{ color: colors.text }}>{finding.row_count}</strong></span>
            <span>Rule: <code>{finding.rule_id}</code></span>
            <span>Seen {finding.run_count}× (last {new Date(finding.last_seen_at).toLocaleString()})</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: spacing.xs, flexShrink: 0 }}>
          {finding.auto_fixable && finding.status === 'open' && (
            <Btn onClick={() => onFix(finding)} disabled={busy}>
              {busy ? 'Fixing…' : 'Fix now'}
            </Btn>
          )}
          {finding.status === 'open' && (
            <Btn onClick={() => onDismiss(finding)} disabled={busy}>
              Dismiss
            </Btn>
          )}
        </div>
      </div>

      {/* Sample rows */}
      {finding.sample && finding.sample.length > 0 && (
        <div style={{ marginTop: spacing.md, padding: spacing.sm, background: colors.surface, borderRadius: radius.sm, border: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: fontSize.micro, color: colors.textMuted, textTransform: 'uppercase', fontWeight: fontWeight.bold, marginBottom: spacing.xs }}>
            Sample (first {finding.sample.length})
          </div>
          <pre style={{ fontSize: fontSize.xs, color: colors.textSecondary, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, monospace' }}>
            {JSON.stringify(finding.sample, null, 2)}
          </pre>
        </div>
      )}
    </Card>
  );
}

export default function DataHealthView({ clientId }) {
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [lastAudit, setLastAudit] = useState(null);
  const [filter, setFilter] = useState('open'); // open | fixed | dismissed | all

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const r = await api(`/clients/${clientId}/data-integrity`);
      setFindings(r.findings || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [clientId]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30000); // refresh every 30s
    return () => clearInterval(t);
  }, [load]);

  const runAudit = async () => {
    setAuditing(true);
    try {
      const r = await api('/data-integrity/audit', { method: 'POST', body: { clientId, autoFix: true } });
      setLastAudit(r);
      await load();
    } catch (e) {
      alert('Audit failed: ' + e.message);
    } finally { setAuditing(false); }
  };

  const handleFix = async (finding) => {
    setBusyId(finding.id);
    try {
      await api(`/data-integrity/findings/${finding.id}/fix`, { method: 'POST' });
      await load();
    } catch (e) {
      alert('Fix failed: ' + e.message);
    } finally { setBusyId(null); }
  };

  const handleDismiss = async (finding) => {
    setBusyId(finding.id);
    try {
      await api(`/data-integrity/findings/${finding.id}/dismiss`, { method: 'POST', body: { reason: 'Dismissed from UI' } });
      await load();
    } catch (e) {
      alert('Dismiss failed: ' + e.message);
    } finally { setBusyId(null); }
  };

  // Summary
  const open = findings.filter(f => f.status === 'open');
  const fixed = findings.filter(f => f.status === 'fixed');
  const dismissed = findings.filter(f => f.status === 'dismissed');
  const bySeverity = open.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] || 0) + 1;
    return acc;
  }, {});

  // Filter
  const visible = findings
    .filter(f => filter === 'all' ? true : f.status === filter)
    .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));

  if (loading) {
    return (
      <div>
        <SH title="Data Health" sub="Cross-table integrity audit — catches contradictions across tables" />
        <SkeletonCard rows={3} />
      </div>
    );
  }

  return (
    <div>
      <SH title="Data Health" sub="Cross-table integrity audit — catches contradictions across tables so silent bugs don't hide in the UI" />

      {/* Summary + actions */}
      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'center', flexWrap: 'wrap', marginBottom: spacing.lg }}>
        <Card style={{ padding: spacing.md, minWidth: 160 }}>
          <div style={{ fontSize: fontSize.micro, color: colors.textMuted, textTransform: 'uppercase', fontWeight: fontWeight.bold }}>Open</div>
          <div style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: open.length === 0 ? colors.successDark : colors.text }}>
            {open.length}
          </div>
        </Card>
        <Card style={{ padding: spacing.md, minWidth: 160 }}>
          <div style={{ fontSize: fontSize.micro, color: colors.textMuted, textTransform: 'uppercase', fontWeight: fontWeight.bold }}>Auto-fixed</div>
          <div style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.successDark }}>{fixed.length}</div>
        </Card>
        {bySeverity.critical > 0 && (
          <Card style={{ padding: spacing.md, background: SEV_META.critical.bg, minWidth: 140 }}>
            <div style={{ fontSize: fontSize.micro, color: SEV_META.critical.color, textTransform: 'uppercase', fontWeight: fontWeight.bold }}>Critical</div>
            <div style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: SEV_META.critical.color }}>{bySeverity.critical}</div>
          </Card>
        )}
        {bySeverity.error > 0 && (
          <Card style={{ padding: spacing.md, background: SEV_META.error.bg, minWidth: 140 }}>
            <div style={{ fontSize: fontSize.micro, color: SEV_META.error.color, textTransform: 'uppercase', fontWeight: fontWeight.bold }}>Errors</div>
            <div style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: SEV_META.error.color }}>{bySeverity.error}</div>
          </Card>
        )}
        {bySeverity.warn > 0 && (
          <Card style={{ padding: spacing.md, background: SEV_META.warn.bg, minWidth: 140 }}>
            <div style={{ fontSize: fontSize.micro, color: SEV_META.warn.color, textTransform: 'uppercase', fontWeight: fontWeight.bold }}>Warnings</div>
            <div style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: SEV_META.warn.color }}>{bySeverity.warn}</div>
          </Card>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: spacing.sm }}>
          <Btn onClick={runAudit} disabled={auditing}>
            <RefreshCw size={14} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
            {auditing ? 'Running audit…' : 'Run audit now'}
          </Btn>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.md }}>
        {[
          ['open', `Open (${open.length})`],
          ['fixed', `Auto-fixed (${fixed.length})`],
          ['dismissed', `Dismissed (${dismissed.length})`],
          ['all', `All (${findings.length})`],
        ].map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            style={{
              padding: `${spacing.xs} ${spacing.md}`,
              fontSize: fontSize.sm,
              fontWeight: filter === k ? fontWeight.bold : fontWeight.normal,
              background: filter === k ? colors.primary : colors.surface,
              color: filter === k ? '#fff' : colors.text,
              border: `1px solid ${filter === k ? colors.primary : colors.border}`,
              borderRadius: radius.sm,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Findings list */}
      {visible.length === 0 ? (
        <Card style={{ padding: spacing.xl, textAlign: 'center' }}>
          <CheckCircle2 size={40} color={colors.successDark} style={{ margin: '0 auto', display: 'block' }} />
          <div style={{ marginTop: spacing.md, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
            {filter === 'open' ? 'No open findings — your data looks consistent.' : 'Nothing here.'}
          </div>
          <div style={{ marginTop: spacing.xs, fontSize: fontSize.sm, color: colors.textSecondary }}>
            The audit runs every 5 minutes as part of the self-heal cron. Click "Run audit now" to re-check immediately.
          </div>
        </Card>
      ) : (
        visible.map(f => (
          <FindingCard
            key={f.id}
            finding={f}
            onFix={handleFix}
            onDismiss={handleDismiss}
            busy={busyId === f.id}
          />
        ))
      )}

      {/* Last audit footer */}
      {lastAudit && (
        <div style={{ marginTop: spacing.lg, fontSize: fontSize.xs, color: colors.textMuted, textAlign: 'center' }}>
          Last on-demand audit: {new Date(lastAudit.finished_at).toLocaleString()} —
          {' '}ran {lastAudit.rules_run} rules in {Math.round(lastAudit.duration_ms / 100) / 10}s,
          {' '}found {lastAudit.total_findings} issue(s), auto-fixed {lastAudit.total_auto_fixed} row(s).
        </div>
      )}
    </div>
  );
}
