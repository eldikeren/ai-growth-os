import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions } from '../theme.js';
import { Card, SH, Badge, Btn, Empty, SkeletonCard } from '../components/index.jsx';

// Status filter options
const STATUS_FILTERS = ['open', 'investigating', 'resolved', 'all'];

// ─── Incident Card ──────────────────────────────────────────────
function IncidentCard({ incident, onUpdate }) {
  const sev = colors.severity[incident.severity] || colors.severity.low;
  const statusColor = colors.status[incident.status] || colors.textDisabled;

  const patchStatus = async (status, extra = {}) => {
    await api(`/incidents/${incident.id}`, {
      method: 'PATCH',
      body: { status, ...extra },
    });
    onUpdate();
  };

  return (
    <Card
      style={{
        marginBottom: spacing.md,
        borderRight: `4px solid ${sev.color}`,
      }}
    >
      {/* Header row: severity + title + status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: spacing.sm,
          gap: spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Badge
            text={incident.severity}
            color={sev.color}
            bg={sev.bg}
          />
          <span
            style={{
              fontSize: fontSize.lg,
              fontWeight: fontWeight.bold,
              color: colors.text,
            }}
          >
            {incident.title}
          </span>
        </div>
        <Badge
          text={incident.status}
          color={statusColor}
          bg={statusColor + '22'}
        />
      </div>

      {/* Description */}
      {incident.description && (
        <p
          style={{
            fontSize: fontSize.sm,
            color: colors.textSecondary,
            marginBottom: spacing.md,
            marginTop: 0,
            lineHeight: 1.5,
          }}
        >
          {incident.description}
        </p>
      )}

      {/* Action buttons */}
      <div
        role="group"
        aria-label="Incident actions"
        style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}
      >
        {incident.status === 'open' && (
          <Btn
            small
            secondary
            onClick={() => patchStatus('investigating')}
            ariaLabel={`Investigate incident: ${incident.title}`}
          >
            Investigate
          </Btn>
        )}
        {incident.status !== 'resolved' && (
          <Btn
            small
            color={colors.success}
            onClick={() =>
              patchStatus('resolved', {
                resolved_by: 'admin',
                resolved_at: new Date().toISOString(),
              })
            }
            ariaLabel={`Resolve incident: ${incident.title}`}
          >
            Resolve
          </Btn>
        )}
        {incident.status !== 'dismissed' && (
          <Btn
            small
            secondary
            onClick={() => patchStatus('dismissed')}
            ariaLabel={`Dismiss incident: ${incident.title}`}
          >
            Dismiss
          </Btn>
        )}
      </div>
    </Card>
  );
}

// ─── Incidents View ─────────────────────────────────────────────
export default function IncidentsView({ clientId }) {
  const [incidents, setIncidents] = useState([]);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      let url = `/clients/${clientId}/incidents`;
      if (filter && filter !== 'all') url += `?status=${filter}`;
      setIncidents(await api(url));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [clientId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  if (!clientId) {
    return <Empty icon={AlertTriangle} msg="Select a client to view incidents" />;
  }

  return (
    <div>
      <SH
        title="Incidents"
        sub={`${incidents.length} ${filter} incident${incidents.length !== 1 ? 's' : ''}`}
        action={
          <div
            role="group"
            aria-label="Filter incidents by status"
            style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}
          >
            {STATUS_FILTERS.map(s => (
              <Btn
                key={s}
                small
                onClick={() => setFilter(s)}
                color={filter === s ? colors.primary : colors.textMuted}
                secondary={filter !== s}
                ariaLabel={`Filter: ${s}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Btn>
            ))}
          </div>
        }
      />

      {loading ? (
        <div style={{ display: 'grid', gap: spacing.md }}>
          {[1, 2, 3].map(i => (
            <SkeletonCard key={i} rows={2} />
          ))}
        </div>
      ) : (
        <>
          {incidents.map(i => (
            <IncidentCard key={i.id} incident={i} onUpdate={load} />
          ))}
          {incidents.length === 0 && (
            <Card>
              <Empty icon={AlertTriangle} msg={`No ${filter} incidents`} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
