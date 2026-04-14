// ─── AI Growth OS — Proposed Changes View ───────────────────
// Shows everything the agents have proposed / executed on the site,
// so the user sees the work happening IN the app instead of having
// to go to GitHub to check PRs.
import { useState, useEffect } from 'react';
import { GitPullRequest, RefreshCw, ExternalLink, Check, X, Clock, GitMerge } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Card, Badge, Btn, Spin, Empty, SH, SkeletonCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

const statusStyle = (status) => {
  if (status === 'executed') return { bg: colors.successLight, fg: colors.successDark, label: 'Applied', Icon: GitMerge };
  if (status === 'approved') return { bg: colors.primaryLightest, fg: colors.primary, label: 'Approved', Icon: Check };
  if (status === 'proposed') return { bg: colors.warningLight, fg: colors.warningDark, label: 'Proposed', Icon: Clock };
  if (status === 'rejected') return { bg: colors.errorLight, fg: colors.errorDark, label: 'Rejected', Icon: X };
  return { bg: colors.surfaceHover, fg: colors.textMuted, label: status || 'unknown', Icon: Clock };
};

export default function ProposedChangesView({ clientId }) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try { setChanges(await api(`/clients/${clientId}/proposed-changes`)); }
    catch { setChanges([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  if (!clientId) return <Empty icon={GitPullRequest} msg="Select a client to view proposed changes" />;

  const filtered = filter === 'all' ? changes : changes.filter(c => c.status === filter);

  const counts = {
    all: changes.length,
    executed: changes.filter(c => c.status === 'executed').length,
    proposed: changes.filter(c => c.status === 'proposed').length,
    approved: changes.filter(c => c.status === 'approved').length,
    rejected: changes.filter(c => c.status === 'rejected').length,
  };

  const handleApprove = async (id) => {
    try {
      await api(`/proposed-changes/${id}/approve`, { method: 'POST', body: { approved_by: 'admin' } });
      await load();
    } catch (e) { alert(e.message); }
  };

  const handleReject = async (id) => {
    const reason = prompt('Reason for rejection:');
    if (!reason) return;
    try {
      await api(`/proposed-changes/${id}/reject`, { method: 'POST', body: { reason } });
      await load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <SH
        title="Proposed Changes"
        sub={`${counts.executed} applied · ${counts.proposed} proposed · ${counts.rejected} rejected`}
        action={<Btn small secondary onClick={load} ariaLabel="Refresh"><RefreshCw size={12} /></Btn>}
      />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' }}>
        {['all', 'executed', 'proposed', 'approved', 'rejected'].map(f => (
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
            }}
          >
            {f} ({counts[f] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonCard rows={4} />
      ) : filtered.length === 0 ? (
        <Card><Empty icon={GitPullRequest} msg={filter === 'all' ? 'No proposed changes yet. Run an agent to generate some.' : `No ${filter} changes`} /></Card>
      ) : (
        filtered.map(c => {
          const { bg, fg, label, Icon } = statusStyle(c.status);
          const prUrl = c.platform_ref;
          const exec = c.execution_result || {};
          const isRealEdit = exec.real_edit === true;
          const merged = exec.merged === true;
          return (
            <Card key={c.id} style={{ marginBottom: spacing.md }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.md }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                    <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
                      {c.change_type?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </div>
                    <Badge text={label} color={fg} bg={bg} icon={Icon} />
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
                    color: colors.errorDark, fontFamily: 'monospace', fontSize: fontSize.xs, wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
                  }}>
                    {c.current_value || '(missing)'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 2 }}>Proposed</div>
                  <div style={{
                    padding: spacing.sm, borderRadius: radius.sm, background: colors.successLight,
                    color: colors.successDark, fontFamily: 'monospace', fontSize: fontSize.xs, wordBreak: 'break-word', maxHeight: 120, overflow: 'auto',
                  }}>
                    {c.proposed_value}
                  </div>
                </div>
              </div>

              {c.status === 'proposed' && (
                <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
                  <Btn small onClick={() => handleApprove(c.id)}><Check size={11} /> Approve</Btn>
                  <Btn small secondary onClick={() => handleReject(c.id)}><X size={11} /> Reject</Btn>
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
        })
      )}
    </div>
  );
}
