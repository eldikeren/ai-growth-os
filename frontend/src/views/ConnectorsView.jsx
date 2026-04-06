// ─── AI Growth OS — Connectors View ─────────────────────────────
// 3-column grid of connector cards with sync status, error display
import { useState, useEffect, useCallback } from 'react';
import { Globe, RefreshCw, Database } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Card, Btn, SH, Badge, Empty, Spin, SkeletonCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

const CONNECTOR_ICONS = {
  google_search_console: '🔍',
  google_ads: '💰',
  google_analytics: '📊',
  google_business_profile: '📍',
  meta_business: '📱',
  google_sheets: '📋',
  github: '🐙',
  vercel: '▲',
  website: '🌐',
  email_smtp: '✉️',
};

function statusColors(status) {
  if (status === 'success') return { color: colors.successDark, bg: colors.successLight, border: colors.success };
  if (status === 'failed') return { color: colors.errorDark, bg: colors.errorLight, border: colors.error };
  return { color: colors.textMuted, bg: colors.surfaceHover, border: colors.borderLight };
}

// ─── Skeleton for loading state ─────────────────────────────────
function ConnectorsSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: spacing.md,
      }}
    >
      {[1, 2, 3, 4, 5, 6].map(i => (
        <SkeletonCard key={i} rows={2} />
      ))}
    </div>
  );
}

export default function ConnectorsView({ clientId }) {
  const [connectors, setConnectors] = useState([]);
  const [syncing, setSyncing] = useState({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { data } = await api(`/clients/${clientId}/connectors`);
      setConnectors(data || []);
    } catch {
      setConnectors([]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const sync = async (type) => {
    setSyncing(prev => ({ ...prev, [type]: true }));
    try {
      await api(`/clients/${clientId}/connectors/${type}/sync`, { method: 'POST' });
      await load();
    } catch (e) {
      alert(e.message);
    }
    setSyncing(prev => ({ ...prev, [type]: false }));
  };

  if (!clientId) {
    return <Empty icon={Globe} msg="Select a client to view connectors" />;
  }

  return (
    <div>
      <SH
        title="Connectors & Data Sources"
        sub="Per-client service connections. All data flows through these connectors into agent runtime."
        action={
          <Btn small secondary onClick={load} ariaLabel="Refresh connectors">
            <RefreshCw size={12} /> Refresh
          </Btn>
        }
      />

      {loading ? (
        <ConnectorsSkeleton />
      ) : connectors.length === 0 ? (
        <Empty icon={Globe} msg="No connectors configured yet" />
      ) : (
        <div
          role="list"
          aria-label="Connector cards"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: spacing.md,
          }}
        >
          {connectors.map(c => {
            const sc = statusColors(c.last_sync_status);
            return (
              <div key={c.id} role="listitem">
                <Card
                  style={{
                    borderColor: c.is_active ? sc.border : colors.borderLight,
                    transition: transitions.fast,
                  }}
                >
                  {/* Header row: icon + name + badge */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: spacing.sm,
                    }}
                  >
                    <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
                      {CONNECTOR_ICONS[c.connector_type] || '🔌'}{' '}
                      {c.label || c.connector_type}
                    </div>
                    <Badge
                      text={c.last_sync_status || 'not synced'}
                      color={sc.color}
                      bg={sc.bg}
                    />
                  </div>

                  {/* Last synced time */}
                  <div
                    style={{
                      fontSize: fontSize.xs,
                      color: colors.textDisabled,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {c.last_synced_at
                      ? `Last sync: ${new Date(c.last_synced_at).toLocaleString()}`
                      : 'Never synced'}
                  </div>

                  {/* Error text */}
                  {c.last_sync_error && (
                    <div
                      role="alert"
                      style={{
                        fontSize: fontSize.xs,
                        color: colors.error,
                        marginBottom: spacing.sm,
                        lineHeight: 1.4,
                      }}
                    >
                      {c.last_sync_error}
                    </div>
                  )}

                  {/* Sync button for google_sheets */}
                  {c.connector_type === 'google_sheets' && c.is_active && (
                    <Btn
                      small
                      color={colors.success}
                      onClick={() => sync(c.connector_type)}
                      disabled={syncing[c.connector_type]}
                      ariaLabel={`Sync ${c.label || c.connector_type}`}
                      style={{ marginTop: spacing.xs }}
                    >
                      {syncing[c.connector_type] ? <Spin /> : <Database size={11} />}
                      Sync Now
                    </Btn>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
