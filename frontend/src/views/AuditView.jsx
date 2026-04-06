import { useState, useEffect, useMemo } from 'react';
import { BookOpen } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions } from '../theme.js';
import { Card, SH, Empty, SkeletonCard, inputStyle } from '../components/index.jsx';

const MAX_VISIBLE = 100;

// ─── Audit Entry Row ────────────────────────────────────────────
function AuditEntry({ entry }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: `${spacing.md}px 0`,
        borderBottom: `1px solid ${colors.borderLight}`,
      }}
    >
      {/* Purple dot indicator */}
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#6366F1',
          marginTop: 5,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
          {entry.action}{' '}
          <span style={{ color: colors.textDisabled, fontSize: fontSize.xs }}>
            by {entry.agent_slug || entry.actor}
          </span>
        </div>
        {entry.details && Object.keys(entry.details).length > 0 && (
          <div
            style={{
              fontSize: fontSize.xs,
              color: colors.textMuted,
              marginTop: 2,
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {Object.entries(entry.details)
              .slice(0, 4)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' \u00B7 ')}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <time
        dateTime={entry.created_at}
        style={{
          fontSize: fontSize.xs,
          color: colors.textDisabled,
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        {new Date(entry.created_at).toLocaleString()}
      </time>
    </div>
  );
}

// ─── Audit View ─────────────────────────────────────────────────
export default function AuditView({ clientId }) {
  const [audit, setAudit] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api(`/clients/${clientId}/audit`)
      .then(data => {
        setAudit(data);
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setLoading(false);
      });
  }, [clientId]);

  const filtered = useMemo(() => {
    if (!search) return audit;
    const q = search.toLowerCase();
    return audit.filter(
      a =>
        a.action?.toLowerCase().includes(q) ||
        a.agent_slug?.toLowerCase().includes(q) ||
        a.actor?.toLowerCase().includes(q)
    );
  }, [audit, search]);

  const visible = filtered.slice(0, MAX_VISIBLE);

  if (!clientId) {
    return <Empty icon={BookOpen} msg="Select a client to view audit trail" />;
  }

  return (
    <div>
      <SH
        title="Audit Trail"
        sub={`${audit.length} entr${audit.length !== 1 ? 'ies' : 'y'}${
          filtered.length !== audit.length ? ` (${filtered.length} matching)` : ''
        }`}
      />

      {/* Search input */}
      <div style={{ marginBottom: spacing.lg }}>
        <label htmlFor="audit-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
          Filter audit entries
        </label>
        <input
          id="audit-search"
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filter by action or agent..."
          style={{
            ...inputStyle,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {loading ? (
        <SkeletonCard rows={6} />
      ) : (
        <Card>
          {visible.map(e => (
            <AuditEntry key={e.id} entry={e} />
          ))}
          {visible.length < filtered.length && (
            <div
              style={{
                textAlign: 'center',
                padding: `${spacing.md}px 0`,
                fontSize: fontSize.xs,
                color: colors.textDisabled,
              }}
            >
              Showing {visible.length} of {filtered.length} entries
            </div>
          )}
          {filtered.length === 0 && <Empty icon={BookOpen} msg="No entries" />}
        </Card>
      )}
    </div>
  );
}
