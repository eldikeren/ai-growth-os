// ─── AI Growth OS — Queue View ─────────────────────────────────
import { useState, useEffect } from 'react';
import { ListOrdered, RefreshCw, Zap, X } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Card, Badge, Dot, Btn, Spin, Empty, SH, SkeletonCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

export default function QueueView({ clientId }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      setQueue(await api(`/queue?clientId=${clientId}`));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [clientId]);

  if (!clientId) {
    return <Empty icon={ListOrdered} msg="Select a client to view queue" />;
  }

  const byStatus = queue.reduce((acc, q) => {
    acc[q.status] = (acc[q.status] || 0) + 1;
    return acc;
  }, {});

  const handleProcess = async () => {
    setProcessing(true);
    try {
      await api('/queue/process', { method: 'POST' });
      await load();
    } catch (e) {
      console.error(e);
    }
    setProcessing(false);
  };

  const handleCancel = async (itemId) => {
    try {
      await api(`/queue/${itemId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <SH
        title="Run Queue"
        sub={`${queue.length} items`}
        action={
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Btn onClick={load} small secondary ariaLabel="Refresh queue">
              <RefreshCw size={12} />
            </Btn>
            <Btn
              onClick={handleProcess}
              disabled={processing}
              small
              ariaLabel="Process queue"
            >
              {processing ? <Spin /> : <Zap size={12} />}
              Process
            </Btn>
          </div>
        }
      />

      {/* Status summary chips */}
      <div
        role="list"
        aria-label="Queue status summary"
        style={{
          display: 'flex',
          gap: spacing.sm,
          marginBottom: spacing.xl,
          flexWrap: 'wrap',
        }}
      >
        {Object.entries(byStatus).map(([status, count]) => (
          <div
            key={status}
            role="listitem"
            style={{
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
              padding: `${spacing.sm}px ${spacing.md}px`,
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <Dot s={status} />
            <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
              {status} ({count})
            </span>
          </div>
        ))}
      </div>

      {/* Queue items list */}
      {loading ? (
        <SkeletonCard rows={5} />
      ) : queue.length === 0 ? (
        <Card>
          <Empty icon={ListOrdered} msg="Queue is empty" />
        </Card>
      ) : (
        <Card>
          <div role="list" aria-label="Queue items">
            {queue.map((item) => (
              <div
                key={item.id}
                role="listitem"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.md,
                  padding: `${spacing.md}px 0`,
                  borderBottom: `1px solid ${colors.borderLight}`,
                }}
              >
                <Dot s={item.status} />
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
                    {item.agent_templates?.name}
                  </div>
                  <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                    {new Date(item.created_at).toLocaleString()} · by {item.queued_by}
                  </div>
                  {item.error && (
                    <div style={{ fontSize: fontSize.xs, color: colors.error, marginTop: 2 }}>
                      {item.error}
                    </div>
                  )}
                </div>
                <Badge
                  text={item.status}
                  color={colors.status[item.status] || colors.textSecondary}
                  bg={(colors.status[item.status] || colors.textDisabled) + '22'}
                />
                {item.status === 'queued' && (
                  <Btn
                    danger
                    small
                    onClick={() => handleCancel(item.id)}
                    ariaLabel={`Cancel queued item: ${item.agent_templates?.name}`}
                  >
                    <X size={11} />
                  </Btn>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
