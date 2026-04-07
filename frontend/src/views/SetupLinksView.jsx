// ─── AI Growth OS — Setup Links View ─────────────────────────────
import { useState, useEffect } from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, transitions } from '../theme.js';
import {
  Badge, Card, Btn, SH, Spin, Empty, Field, inputStyle, SkeletonCard,
} from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Status-to-border color mapping ─────────────────────────────
const statusBorderColor = (status) => {
  switch (status) {
    case 'completed':   return colors.success;
    case 'in_progress': return colors.primaryLight;
    case 'expired':
    case 'cancelled':   return colors.error;
    default:            return colors.border;
  }
};

// ─── Connector toggle button ────────────────────────────────────
function ConnectorToggle({ slug, label, icon, selected, onToggle }) {
  const active = selected;
  return (
    <button
      type="button"
      onClick={() => onToggle(slug)}
      aria-pressed={active}
      style={{
        padding: `${spacing.xs}px ${spacing.md}px`,
        borderRadius: radius.md,
        border: `1px solid ${active ? colors.primary : colors.borderLight}`,
        background: active ? colors.primaryLightest : colors.surface,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        cursor: 'pointer',
        color: active ? colors.primary : colors.textMuted,
        transition: transitions.fast,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {icon} {label}
    </button>
  );
}

// ─── Single Link Card ───────────────────────────────────────────
function LinkCard({ l, onRevoke, onRegen, onCopy }) {
  const statusColor = colors.status[l.status === 'in_progress' ? 'running' : l.status] || colors.textMuted;

  return (
    <Card
      style={{
        marginBottom: spacing.md,
        borderColor: statusBorderColor(l.status),
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: spacing.sm,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: fontSize.lg,
              fontWeight: fontWeight.bold,
              color: colors.text,
            }}
          >
            {l.client_name || l.clients?.name || 'Client'}
          </div>
          <div
            style={{
              fontSize: fontSize.xs,
              color: colors.textDisabled,
              marginTop: 2,
            }}
          >
            Created {new Date(l.created_at).toLocaleDateString()} &middot; Expires{' '}
            {new Date(l.expires_at).toLocaleDateString()}
          </div>

          {/* Requested connectors */}
          <div
            style={{
              display: 'flex',
              gap: spacing.xs,
              marginTop: spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            {(l.requested_connectors || []).map((s) => (
              <span
                key={s}
                style={{
                  background: colors.surfaceHover,
                  padding: '2px 6px',
                  borderRadius: radius.sm,
                  fontSize: fontSize.micro,
                  color: colors.textSecondary,
                }}
              >
                {s}
              </span>
            ))}
          </div>

          {/* Completed connectors */}
          {l.completed_connectors?.length > 0 && (
            <div
              style={{
                fontSize: fontSize.xs,
                color: colors.success,
                marginTop: spacing.xs,
              }}
            >
              Completed: {l.completed_connectors.join(', ')}
            </div>
          )}
        </div>

        <Badge
          text={l.status}
          color={statusColor}
          bg={statusColor + '22'}
        />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
        {l.status !== 'cancelled' && l.status !== 'completed' && (
          <Btn
            small
            secondary
            onClick={() => onCopy(l)}
            ariaLabel="Copy setup link"
          >
            Copy Link
          </Btn>
        )}
        {l.status !== 'cancelled' && l.status !== 'completed' && (
          <Btn
            small
            secondary
            onClick={() => onRevoke(l.id)}
            ariaLabel="Revoke setup link"
          >
            Revoke
          </Btn>
        )}
        {(l.status === 'expired' || l.status === 'cancelled') && (
          <Btn
            small
            secondary
            onClick={() => onRegen(l.id)}
            ariaLabel="Regenerate setup link"
          >
            Regenerate
          </Btn>
        )}
      </div>
    </Card>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export default function SetupLinksView({ clientId, clients }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [connDefs, setConnDefs] = useState([]);
  const [selected, setSelected] = useState([]);
  const [msgHe, setMsgHe] = useState('');
  const [email, setEmail] = useState('');
  const [notify, setNotify] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const d = clientId
        ? await api(`/clients/${clientId}/setup-links`)
        : await api('/setup-links');
      setLinks(d);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadDefs = async () => {
    try {
      const d = await api('/connector-definitions');
      setConnDefs(d);
      setSelected(d.map((c) => c.slug));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
    loadDefs();
  }, [clientId]);

  const create = async () => {
    if (!clientId) {
      alert('Select a client first');
      return;
    }
    setCreating(true);
    try {
      const result = await api(`/clients/${clientId}/setup-links`, {
        method: 'POST',
        body: {
          requestedConnectors: selected,
          customMessageHe: msgHe || undefined,
          clientEmail: email || undefined,
          notifyEmail: notify || undefined,
          language: 'he',
        },
      });
      alert(
        `Magic link created!\n\n${result.setup_url}\n\nExpires: ${new Date(
          result.expires_at
        ).toLocaleDateString()}`
      );
      navigator.clipboard?.writeText(result.setup_url);
      load();
    } catch (e) {
      alert(e.message);
    }
    setCreating(false);
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this link?')) return;
    try {
      await api(`/setup-links/${id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const regen = async (id) => {
    try {
      const r = await api(`/setup-links/${id}/regenerate`, { method: 'POST' });
      alert(`New link:\n${r.setup_url}`);
      navigator.clipboard?.writeText(r.setup_url);
      load();
    } catch (e) {
      alert(e.message);
    }
  };

  const copyLink = (l) => {
    const url = `${window.location.origin}/setup/${l.token}`;
    navigator.clipboard?.writeText(url);
    alert(`Link copied!\n\n${url}`);
  };

  const toggleConn = (slug) =>
    setSelected((s) =>
      s.includes(slug) ? s.filter((x) => x !== slug) : [...s, slug]
    );

  const client = clients?.find((c) => c.id === clientId);

  // ── Extra hardcoded connector options ───────────────────────
  const extraConnectors = [
    { slug: 'git_repo', icon: '\uD83D\uDCC1', name: 'Git Repository' },
    { slug: 'cms_access', icon: '\uD83D\uDDA5', name: 'CMS Access' },
    { slug: 'server_access', icon: '\uD83D\uDD12', name: 'Server Access' },
  ];

  return (
    <div>
      <SH
        title="Setup Links"
        sub="Create magic links for client onboarding. Client opens the link, connects their tools, and agents start working."
        action={
          <Btn small secondary onClick={load} ariaLabel="Refresh setup links">
            <RefreshCw size={12} />
          </Btn>
        }
      />

      {/* ── Create New Link Form ───────────────────────────────── */}
      <Card style={{ marginBottom: spacing.xl }}>
        <div
          style={{
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: colors.text,
            marginBottom: spacing.lg,
          }}
        >
          Create New Setup Link{client ? ` for ${client.name}` : ''}
        </div>

        {!clientId ? (
          <div style={{ color: colors.textDisabled, fontSize: fontSize.md }}>
            Select a client from the dropdown first
          </div>
        ) : (
          <>
            {/* Connector toggles */}
            <div
              style={{
                fontSize: fontSize.sm,
                fontWeight: fontWeight.semibold,
                color: colors.textMuted,
                marginBottom: spacing.sm,
              }}
            >
              Connectors to request:
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: spacing.sm,
                marginBottom: spacing.lg,
              }}
              role="group"
              aria-label="Connector selection"
            >
              {connDefs.map((c) => (
                <ConnectorToggle
                  key={c.slug}
                  slug={c.slug}
                  label={c.name}
                  icon={c.icon}
                  selected={selected.includes(c.slug)}
                  onToggle={toggleConn}
                />
              ))}
              {extraConnectors.map((c) => (
                <ConnectorToggle
                  key={c.slug}
                  slug={c.slug}
                  label={c.name}
                  icon={c.icon}
                  selected={selected.includes(c.slug)}
                  onToggle={toggleConn}
                />
              ))}
            </div>

            {/* Email fields */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <Field label="Client Email" htmlFor="setup-client-email">
                <input
                  id="setup-client-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  style={inputStyle}
                  type="email"
                />
              </Field>
              <Field label="Notify Email (admin)" htmlFor="setup-notify-email">
                <input
                  id="setup-notify-email"
                  value={notify}
                  onChange={(e) => setNotify(e.target.value)}
                  placeholder="you@elad.digital"
                  style={inputStyle}
                  type="email"
                />
              </Field>
            </div>

            {/* Hebrew message */}
            <Field label="Custom Message (Hebrew)" htmlFor="setup-msg-he">
              <textarea
                id="setup-msg-he"
                value={msgHe}
                onChange={(e) => setMsgHe(e.target.value)}
                rows={2}
                placeholder="\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D0\u05D9\u05E9\u05D9\u05EA \u05DC\u05DC\u05E7\u05D5\u05D7..."
                style={{
                  ...inputStyle,
                  direction: 'rtl',
                  resize: 'vertical',
                }}
              />
            </Field>

            <Btn
              onClick={create}
              disabled={creating || selected.length === 0}
              ariaLabel="Create magic link"
            >
              {creating ? <Spin /> : <Zap size={13} />} Create Magic Link
            </Btn>
          </>
        )}
      </Card>

      {/* ── Links List ─────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: spacing['5xl'] }}>
          <Spin />
        </div>
      ) : (
        links.map((l) => (
          <LinkCard
            key={l.id}
            l={l}
            onRevoke={revoke}
            onRegen={regen}
            onCopy={copyLink}
          />
        ))
      )}

      {links.length === 0 && !loading && (
        <Empty icon={Zap} msg="No setup links yet — create one above" />
      )}
    </div>
  );
}
