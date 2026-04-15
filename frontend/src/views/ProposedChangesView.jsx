// ─── AI Growth OS — Proposed Changes View ───────────────────
// The user's "what changed / what's waiting for me" screen.
//
// Layout:
//   1. Awaiting approval banner   (actionable queue — top of the page)
//   2. Audit trail                (everything else, filterable)
//
// All work agents propose ends up here. With the approval gate
// (migration 021), anything created in approve_then_act mode lands
// as status='proposed' and waits for the user to approve or reject.
import { useState, useEffect, useMemo } from 'react';
import {
  GitPullRequest, RefreshCw, ExternalLink, Check, X, Clock, GitMerge, AlertTriangle,
} from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows } from '../theme.js';
import { Card, Badge, Btn, Empty, SH, SkeletonCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

const statusStyle = (status) => {
  if (status === 'executed') return { bg: colors.successLight, fg: colors.successDark, label: 'Applied',  Icon: GitMerge };
  if (status === 'approved') return { bg: colors.primaryLightest, fg: colors.primary,  label: 'Approved', Icon: Check };
  if (status === 'proposed') return { bg: colors.warningLight, fg: colors.warningDark, label: 'Awaiting approval', Icon: Clock };
  if (status === 'rejected') return { bg: colors.errorLight, fg: colors.errorDark, label: 'Rejected', Icon: X };
  return { bg: colors.surfaceHover, fg: colors.textMuted, label: status || 'unknown', Icon: Clock };
};

// ─── Change card (reused in both sections) ───
function ChangeCard({ c, onApprove, onReject, pendingIds }) {
  const { bg, fg, label, Icon } = statusStyle(c.status);
  const prUrl = c.platform_ref;
  const exec = c.execution_result || {};
  const isRealEdit = exec.real_edit === true;
  const merged = exec.merged === true;
  const isPending = pendingIds?.has(c.id);

  return (
    <Card style={{ marginBottom: spacing.md, opacity: isPending ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.md }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs, flexWrap: 'wrap' }}>
            <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
              {c.change_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </div>
            <Badge text={label} color={fg} bg={bg} />
            {isRealEdit && <Badge text="real edit" color={colors.successDark} bg={colors.successLight} />}
            {merged && <Badge text="merged" color="#ffffff" bg={colors.success} />}
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.xs }}>
            {c.page_url} · {c.platform || 'manual'} · {new Date(c.created_at).toLocaleString()}
          </div>
          {exec.edited_file && (
            <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontFamily: 'monospace', marginBottom: spacing.xs }}>
              📄 {exec.edited_file}
            </div>
          )}
          {c.approved_at && (
            <div style={{ fontSize: fontSize.xs, color: colors.primary, marginBottom: spacing.xs }}>
              Approved {new Date(c.approved_at).toLocaleString()} by {c.approved_by || 'you'}
            </div>
          )}
          {c.executed_at && (
            <div style={{ fontSize: fontSize.xs, color: colors.successDark, marginBottom: spacing.xs }}>
              Deployed {new Date(c.executed_at).toLocaleString()}
            </div>
          )}
        </div>
        {prUrl && (
          <a href={prUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <Btn small secondary><ExternalLink size={11} /> View PR</Btn>
          </a>
        )}
      </div>

      {c.reason && (
        <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm, fontStyle: 'italic' }}>
          Why: {c.reason}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm, fontSize: fontSize.sm }}>
        <div>
          <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 2 }}>Current</div>
          <div style={{
            padding: spacing.sm, borderRadius: radius.sm, background: colors.errorLight,
            color: colors.errorDark, fontFamily: 'monospace', fontSize: fontSize.xs,
            wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
          }}>
            {c.current_value || '(missing)'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 2 }}>Proposed</div>
          <div style={{
            padding: spacing.sm, borderRadius: radius.sm, background: colors.successLight,
            color: colors.successDark, fontFamily: 'monospace', fontSize: fontSize.xs,
            wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
          }}>
            {c.proposed_value}
          </div>
        </div>
      </div>

      {c.status === 'proposed' && (
        <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
          <Btn small onClick={() => onApprove(c.id)} disabled={isPending}>
            <Check size={11} /> Approve & deploy
          </Btn>
          <Btn small secondary onClick={() => onReject(c.id)} disabled={isPending}>
            <X size={11} /> Reject
          </Btn>
        </div>
      )}

      {exec.error && (
        <div style={{ fontSize: fontSize.xs, color: colors.errorDark, marginTop: spacing.sm }}>
          ⚠ Execution error: {exec.error}
        </div>
      )}
      {exec.merge_error && (
        <div style={{ fontSize: fontSize.xs, color: colors.warningDark, marginTop: spacing.sm }}>
          ⚠ Auto-merge failed: {exec.merge_error}
        </div>
      )}
    </Card>
  );
}

export default function ProposedChangesView({ clientId }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [pendingIds, setPendingIds] = useState(new Set());

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try { setChanges(await api(`/clients/${clientId}/proposed-changes`)); }
    catch { setChanges([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  if (!clientId) return <Empty icon={GitPullRequest} msg="Select a client to view proposed changes" />;

  // Split into waiting vs history
  const awaiting = useMemo(() => changes.filter(c => c.status === 'proposed'), [changes]);
  const history = useMemo(() => changes.filter(c => c.status !== 'proposed'), [changes]);

  const counts = {
    all: changes.length,
    executed: changes.filter(c => c.status === 'executed').length,
    approved: changes.filter(c => c.status === 'approved').length,
    rejected: changes.filter(c => c.status === 'rejected').length,
  };

  const filteredHistory = filter === 'all'
    ? history
    : history.filter(c => c.status === filter);

  const markPending = (id, on) => setPendingIds(prev => {
    const next = new Set(prev);
    on ? next.add(id) : next.delete(id);
    return next;
  });

  const handleApprove = async (id) => {
    markPending(id, true);
    try {
      const res = await api(`/proposed-changes/${id}/approve`, { method: 'POST', body: { approved_by: 'admin' } });
      if (res?.executionResult?.success === false) {
        alert(`Approved, but deploy failed: ${res.executionResult.error || 'unknown error'}`);
      }
      await load();
    } catch (e) { alert(e.message); }
    finally { markPending(id, false); }
  };

  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    markPending(id, true);
    try {
      await api(`/proposed-changes/${id}/reject`, { method: 'POST', body: { reason } });
      await load();
    } catch (e) { alert(e.message); }
    finally { markPending(id, false); }
  };

  const handleApproveAll = async () => {
    if (!awaiting.length) return;
    if (!window.confirm(`Approve & deploy all ${awaiting.length} pending changes? This will push to production.`)) return;
    for (const c of awaiting) await handleApprove(c.id);
  };

  return (
    <div>
      <SH
        title="Proposed Changes"
        sub={`${awaiting.length} awaiting approval · ${counts.executed} deployed · ${counts.rejected} rejected`}
        action={<Btn small secondary onClick={load} ariaLabel="Refresh"><RefreshCw size={12} /> Refresh</Btn>}
      />

      {/* ─── Awaiting approval banner ─── */}
      {awaiting.length > 0 && (
        <div
          style={{
            background: colors.warningLight,
            border: `2px solid ${colors.warning}`,
            borderRadius: radius.xl,
            padding: spacing.lg,
            marginBottom: spacing.xl,
            boxShadow: shadows.md,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md, gap: spacing.md, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <AlertTriangle size={18} color={colors.warningDark} />
              <div>
                <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.warningDark }}>
                  {awaiting.length} change{awaiting.length === 1 ? '' : 's'} waiting for your approval
                </div>
                <div style={{ fontSize: fontSize.sm, color: colors.warningDark, opacity: 0.8 }}>
                  Nothing will be pushed until you approve. Review each below.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Btn small onClick={handleApproveAll} disabled={pendingIds.size > 0}>
                <Check size={11} /> Approve all
              </Btn>
            </div>
          </div>
          {awaiting.map(c => (
            <ChangeCard
              key={c.id}
              c={c}
              onApprove={handleApprove}
              onReject={handleReject}
              pendingIds={pendingIds}
            />
          ))}
        </div>
      )}

      {/* ─── Audit trail ─── */}
      <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
        Audit trail
      </div>
      <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md }}>
        Everything that's been decided. Filter by status.
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' }}>
        {['all', 'executed', 'approved', 'rejected'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: `${spacing.xs}px ${spacing.md}px`,
              borderRadius: radius.full,
              border: `1px solid ${filter === f ? colors.primary : colors.borderLight}`,
              background: filter === f ? colors.primaryLightest : colors.background,
              color: filter === f ? colors.primary : colors.textMuted,
              fontSize: fontSize.sm,
              fontWeight: filter === f ? fontWeight.semibold : fontWeight.normal,
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {f} ({f === 'all' ? history.length : (counts[f] || 0)})
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonCard rows={4} />
      ) : filteredHistory.length === 0 ? (
        <Card>
          <Empty
            icon={GitPullRequest}
            msg={awaiting.length > 0
              ? 'No history yet — review the pending items above'
              : filter === 'all'
                ? 'No changes yet. Run an agent to see proposals.'
                : `No ${filter} changes`}
          />
        </Card>
      ) : (
        filteredHistory.map(c => (
          <ChangeCard
            key={c.id}
            c={c}
            onApprove={handleApprove}
            onReject={handleReject}
            pendingIds={pendingIds}
          />
        ))
      )}
    </div>
  );
}
