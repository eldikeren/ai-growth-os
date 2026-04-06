// ─── AI Growth OS — Website Access View ──────────────────────────
import { useState, useEffect } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import {
  Card, Btn, SH, Spin, Empty, KpiCard, Dot, SkeletonKpi, SkeletonCard,
} from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Connection status color helper ─────────────────────────────
const connColor = (status) =>
  status === 'connected' ? colors.success : colors.textDisabled;

// ─── Detail Card (Git / CMS / Server) ───────────────────────────
function DetailCard({ icon, title, children }) {
  return (
    <Card style={{ marginBottom: spacing.md }}>
      <div
        style={{
          fontSize: fontSize.md,
          fontWeight: fontWeight.bold,
          color: colors.text,
          marginBottom: spacing.sm,
        }}
      >
        {icon} {title}
      </div>
      <div style={{ fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 1.6 }}>
        {children}
      </div>
    </Card>
  );
}

// ─── Safety Policy Grid ─────────────────────────────────────────
function SafetyPolicyGrid({ pol }) {
  const items = [
    ['Analysis', pol.allow_analysis],
    ['Content Edits', pol.allow_content_edits],
    ['Code Changes', pol.allow_code_changes],
    ['Direct Publish', pol.allow_direct_production_changes],
    ['Require PR', pol.require_pr],
    ['Staging First', pol.require_staging_first],
    ['Manual Approval', pol.require_manual_approval_before_publish],
    ['Auto Safe Changes', pol.allow_autonomous_safe_changes],
  ];

  return (
    <Card>
      <div
        style={{
          fontSize: fontSize.md,
          fontWeight: fontWeight.bold,
          color: colors.text,
          marginBottom: spacing.sm,
        }}
      >
        Safety Policy
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: spacing.sm,
          fontSize: fontSize.sm,
        }}
        role="list"
        aria-label="Safety policy settings"
      >
        {items.map(([label, enabled]) => (
          <div
            key={label}
            role="listitem"
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              background: enabled ? colors.successLight : colors.errorLight,
              borderRadius: radius.sm,
              color: enabled ? colors.successDark : colors.errorDark,
              fontWeight: fontWeight.medium,
            }}
          >
            {enabled ? '\u2713' : '\u2717'} {label}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Recent Validations ─────────────────────────────────────────
function ValidationsCard({ validations }) {
  if (!validations || validations.length === 0) return null;

  return (
    <Card style={{ marginTop: spacing.md }}>
      <div
        style={{
          fontSize: fontSize.md,
          fontWeight: fontWeight.bold,
          color: colors.text,
          marginBottom: spacing.sm,
        }}
      >
        Recent Validations
      </div>
      {validations.slice(0, 5).map((v, i) => (
        <div
          key={i}
          style={{
            fontSize: fontSize.sm,
            padding: `${spacing.xs}px 0`,
            borderBottom: `1px solid ${colors.borderLight}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <Dot
              s={
                v.status === 'passed'
                  ? 'success'
                  : v.status === 'failed'
                  ? 'failed'
                  : 'pending'
              }
            />
            {v.validation_type}
          </span>
          <span style={{ color: colors.textDisabled, fontSize: fontSize.xs }}>
            {new Date(v.created_at).toLocaleString()}
          </span>
        </div>
      ))}
    </Card>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export default function WebsiteAccessView({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const d = await api(`/clients/${clientId}/website`);
      setData(d);
    } catch (e) {
      setData(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  // ── Guard: no client ────────────────────────────────────────
  if (!clientId) {
    return <Empty icon={Globe} msg="Select a client to view website access" />;
  }

  // ── Loading skeleton ────────────────────────────────────────
  if (loading) {
    return (
      <div>
        <SH title="Website Access" sub="Loading..." />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: spacing.md,
            marginBottom: spacing.lg,
          }}
        >
          {[1, 2, 3, 4].map((k) => (
            <SkeletonKpi key={k} />
          ))}
        </div>
        <SkeletonCard rows={3} />
      </div>
    );
  }

  // ── No website configured ───────────────────────────────────
  if (!data || !data.website) {
    return (
      <div>
        <SH title="Website Access" sub="No website configured for this client yet." />
        <Card>
          <div
            style={{
              textAlign: 'center',
              padding: spacing.xl,
              color: colors.textDisabled,
            }}
          >
            <Globe
              size={32}
              style={{ marginBottom: spacing.md, opacity: 0.5 }}
            />
            <div style={{ fontSize: fontSize.lg, color: colors.textSecondary }}>
              Send a setup link to the client to configure website access, or open
              the{' '}
              <a
                href="/website-access.html"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: colors.primary }}
              >
                Website Access Manager
              </a>{' '}
              to configure manually.
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // ── Destructure data ────────────────────────────────────────
  const { website: w, access_profile: ap, git: g, cms: cm, server: srv, policy: pol, validations } = data;

  return (
    <div>
      <SH
        title="Website Access"
        sub={`${w.primary_domain} \u00B7 ${w.website_platform_type || 'unknown'}`}
        action={
          <Btn small secondary onClick={load} ariaLabel="Refresh website access">
            <RefreshCw size={12} />
          </Btn>
        }
      />

      {/* ── KPI Row ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: spacing.md,
          marginBottom: spacing.lg,
        }}
      >
        <KpiCard
          label="Access Level"
          value={ap?.current_access_level?.replace('_', ' ') || 'read only'}
          color={colors.primary}
        />
        <KpiCard
          label="Git"
          value={g?.connection_status || 'none'}
          color={connColor(g?.connection_status)}
        />
        <KpiCard
          label="CMS"
          value={cm?.connection_status || 'none'}
          color={connColor(cm?.connection_status)}
        />
        <KpiCard
          label="Server"
          value={srv?.connection_status || 'none'}
          color={connColor(srv?.connection_status)}
        />
      </div>

      {/* ── Git Detail ─────────────────────────────────────────── */}
      {g && (
        <DetailCard icon={'\uD83D\uDCC1'} title={`Git: ${g.provider} \u2014 ${g.repo_owner}/${g.repo_name}`}>
          Branch: {g.production_branch} &middot; Mode: {g.access_mode} &middot; Status:{' '}
          <span style={{ color: connColor(g.connection_status), fontWeight: fontWeight.semibold }}>
            {g.connection_status}
          </span>
        </DetailCard>
      )}

      {/* ── CMS Detail ─────────────────────────────────────────── */}
      {cm && (
        <DetailCard icon={'\uD83D\uDDA5'} title={`CMS: ${cm.cms_type}`}>
          Admin: {cm.admin_url || '\u2014'} &middot; API:{' '}
          {cm.api_enabled ? 'enabled' : 'disabled'} &middot; Status:{' '}
          <span style={{ color: connColor(cm.connection_status), fontWeight: fontWeight.semibold }}>
            {cm.connection_status}
          </span>
        </DetailCard>
      )}

      {/* ── Server Detail ──────────────────────────────────────── */}
      {srv && (
        <DetailCard icon={'\uD83D\uDD12'} title={`Server: ${srv.access_type}`}>
          Host: {srv.host}:{srv.port} &middot; Root: {srv.site_root_path || '\u2014'} &middot; Status:{' '}
          <span style={{ color: connColor(srv.connection_status), fontWeight: fontWeight.semibold }}>
            {srv.connection_status}
          </span>
        </DetailCard>
      )}

      {/* ── Safety Policy ──────────────────────────────────────── */}
      {pol && <SafetyPolicyGrid pol={pol} />}

      {/* ── Recent Validations ─────────────────────────────────── */}
      <ValidationsCard validations={validations} />
    </div>
  );
}
