// ─── AI Growth OS — Approvals View ─────────────────────────────
import { useState, useEffect } from 'react';
import { CheckSquare, RefreshCw, Check, X } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Card, Badge, Dot, Btn, Spin, Empty, SH, SkeletonCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

export default function ApprovalsView({ clientId }) {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchApprovals = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      setApprovals(await api(`/clients/${clientId}/approvals`));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchApprovals();
  }, [clientId]);

  if (!clientId) {
    return <Empty icon={CheckSquare} msg="Select a client to view approvals" />;
  }

  const pending = approvals.filter((a) => a.status === 'pending');
  const resolved = approvals.filter((a) => a.status !== 'pending');

  const handleApprove = async (id) => {
    try {
      await api(`/approvals/${id}/approve`, {
        method: 'POST',
        body: { approvedBy: 'admin' },
      });
      await fetchApprovals();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Reason:');
    if (!reason) return;
    try {
      await api(`/approvals/${id}/reject`, {
        method: 'POST',
        body: { reason },
      });
      await fetchApprovals();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <SH
        title="Approvals"
        sub={`${pending.length} pending`}
        action={
          <Btn small secondary onClick={fetchApprovals} ariaLabel="Refresh approvals">
            <RefreshCw size={12} />
          </Btn>
        }
      />

      {loading ? (
        <>
          <SkeletonCard rows={3} />
          <div style={{ marginTop: spacing.md }}>
            <SkeletonCard rows={4} />
          </div>
        </>
      ) : (
        <>
          {/* Pending approvals */}
          {pending.length === 0 && (
            <Card style={{ marginBottom: spacing.md }}>
              <Empty icon={CheckSquare} msg="No pending approvals" />
            </Card>
          )}
          {pending.map((a) => (
            <Card
              key={a.id}
              style={{
                marginBottom: spacing.md,
                borderColor: colors.warningLight,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: spacing.md,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: fontSize.lg,
                      fontWeight: fontWeight.bold,
                      color: colors.text,
                    }}
                  >
                    {a.agent_templates?.name}
                  </div>
                  <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                    {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge
                  text="pending"
                  color={colors.warningDark}
                  bg={colors.warningLight}
                />
              </div>

              <div
                style={{
                  fontSize: fontSize.md,
                  color: colors.text,
                  marginBottom: spacing.md,
                  lineHeight: 1.5,
                }}
              >
                {a.what_needs_approval}
              </div>

              {a.proposed_action && (
                <div
                  style={{
                    background: colors.surfaceHover,
                    borderRadius: radius.md,
                    padding: spacing.md,
                    fontSize: fontSize.sm,
                    color: colors.textSecondary,
                    marginBottom: spacing.md,
                    lineHeight: 1.5,
                  }}
                >
                  {a.proposed_action}
                </div>
              )}

              <div style={{ display: 'flex', gap: spacing.sm }}>
                <Btn
                  onClick={() => handleApprove(a.id)}
                  color={colors.success}
                  ariaLabel={`Approve: ${a.agent_templates?.name}`}
                >
                  <Check size={13} />
                  Approve &amp; Resume
                </Btn>
                <Btn
                  danger
                  onClick={() => handleReject(a.id)}
                  ariaLabel={`Reject: ${a.agent_templates?.name}`}
                >
                  <X size={13} />
                  Reject
                </Btn>
              </div>
            </Card>
          ))}

          {/* History */}
          <Card>
            <div
              style={{
                fontSize: fontSize.lg,
                fontWeight: fontWeight.semibold,
                color: colors.text,
                marginBottom: spacing.lg,
              }}
            >
              History
            </div>
            {resolved.length === 0 ? (
              <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
                No history
              </div>
            ) : (
              <div role="list" aria-label="Approval history">
                {resolved.slice(0, 20).map((a) => (
                  <div
                    key={a.id}
                    role="listitem"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.md,
                      padding: `${spacing.sm}px 0`,
                      borderBottom: `1px solid ${colors.borderLight}`,
                    }}
                  >
                    <Dot s={a.status} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: fontSize.sm,
                          fontWeight: fontWeight.semibold,
                          color: colors.text,
                        }}
                      >
                        {a.agent_templates?.name}
                      </div>
                      <div
                        style={{
                          fontSize: fontSize.xs,
                          color: colors.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {a.what_needs_approval?.slice(0, 80)}
                      </div>
                    </div>
                    <Badge
                      text={a.status}
                      color={colors.status[a.status] || colors.textSecondary}
                      bg={(colors.status[a.status] || colors.textDisabled) + '22'}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
