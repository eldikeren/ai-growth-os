import { useState, useEffect, useCallback } from 'react';
import { Key, RefreshCw } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions, breakpoints } from '../theme.js';
import { Card, SH, Badge, Btn, Spin, Empty, SkeletonCard } from '../components/index.jsx';

// ─── Health Bar ─────────────────────────────────────────────────
function HealthBar({ score }) {
  const pct = score || 0;
  const barColor = pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.error;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Health score: ${pct}%`}
      style={{
        height: 6,
        background: colors.borderLight,
        borderRadius: radius.sm,
        marginBottom: spacing.sm,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 6,
          borderRadius: radius.sm,
          background: barColor,
          width: `${pct}%`,
          transition: transitions.normal,
        }}
      />
    </div>
  );
}

// ─── Credential Card ────────────────────────────────────────────
function CredentialCard({ cred }) {
  const connected = cred.is_connected;
  return (
    <Card
      style={{
        borderColor: connected ? colors.successLight : colors.errorLight,
        borderWidth: 1,
        borderStyle: 'solid',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: spacing.md,
          gap: spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            fontSize: fontSize.md,
            fontWeight: fontWeight.bold,
            color: colors.text,
          }}
        >
          {cred.label || cred.service}
        </div>
        <Badge
          text={connected ? 'Connected' : 'Disconnected'}
          color={connected ? colors.successDark : colors.errorDark}
          bg={connected ? colors.successLight : colors.errorLight}
        />
      </div>

      <HealthBar score={cred.health_score} />

      <div
        style={{
          fontSize: fontSize.xs,
          color: colors.textMuted,
        }}
      >
        Health: {cred.health_score}%
      </div>

      {cred.error && (
        <div
          role="alert"
          style={{
            fontSize: fontSize.xs,
            color: colors.error,
            marginTop: spacing.xs,
            lineHeight: 1.4,
          }}
        >
          {cred.error}
        </div>
      )}
    </Card>
  );
}

// ─── Credentials View ───────────────────────────────────────────
export default function CredentialsView({ clientId }) {
  const [creds, setCreds] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      setCreds(await api(`/clients/${clientId}/credentials`));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await api(`/clients/${clientId}/credentials/refresh`, { method: 'POST' });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setRefreshing(false);
  };

  if (!clientId) {
    return <Empty icon={Key} msg="Select a client to view credentials" />;
  }

  return (
    <div>
      <SH
        title="Credentials"
        sub="Service connection health"
        action={
          <Btn
            onClick={handleRefreshAll}
            disabled={refreshing}
            small
            ariaLabel="Refresh all credential health checks"
          >
            {refreshing ? <Spin /> : <RefreshCw size={12} />}
            Check All
          </Btn>
        }
      />

      {error && (
        <div
          role="alert"
          style={{
            background: colors.errorLight,
            color: colors.errorDark,
            padding: `${spacing.sm}px ${spacing.lg}px`,
            borderRadius: radius.md,
            fontSize: fontSize.sm,
            marginBottom: spacing.lg,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: spacing.md,
          }}
        >
          {[1, 2, 3].map(i => (
            <SkeletonCard key={i} rows={2} />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: spacing.md,
          }}
        >
          {creds.map(c => (
            <CredentialCard key={c.id} cred={c} />
          ))}
          {creds.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Empty icon={Key} msg="No credentials configured" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
