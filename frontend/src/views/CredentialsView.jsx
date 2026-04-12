import { useState, useEffect, useCallback } from 'react';
import { Key, RefreshCw, Edit3, Check, X, Eye, EyeOff, AlertCircle, CheckCircle2, Info, MapPin, ExternalLink, Link2, Shield, Clock } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions, shadows } from '../theme.js';
import { Card, SH, Badge, Btn, Spin, Empty, SkeletonCard, Field, inputStyle } from '../components/index.jsx';

// ─── Service configuration ──────────────────────────────────────
// OAuth services use platform OAuth — no passwords, no manual tokens
const SERVICE_CONFIG = {
  openai: { label: 'OpenAI API (gpt-4.1)', icon: '🤖', category: 'api', fields: [{ key: 'api_key', label: 'API Key', secret: true, placeholder: 'sk-proj-...' }] },
  google_search_console: { label: 'Google Search Console', icon: '🔍', category: 'oauth', oauth: 'google', subProvider: 'search_console', fields: [] },
  google_ads: { label: 'Google Ads', icon: '💰', category: 'oauth', oauth: 'google', subProvider: 'ads', fields: [] },
  google_analytics: { label: 'Google Analytics 4', icon: '📊', category: 'oauth', oauth: 'google', subProvider: 'analytics', fields: [] },
  google_business_profile: { label: 'Google Business Profile', icon: '📍', category: 'oauth', oauth: 'google', subProvider: 'business_profile', fields: [] },
  facebook: { label: 'Facebook Business Page', icon: '📘', category: 'oauth', oauth: 'meta', subProvider: 'facebook', fields: [] },
  instagram: { label: 'Instagram Business Profile', icon: '📸', category: 'oauth', oauth: 'meta', subProvider: 'instagram', fields: [] },
  meta_business: { label: 'Meta Business Suite', icon: '📱', category: 'oauth', oauth: 'meta', subProvider: 'meta', fields: [] },
  dataforseo: { label: 'DataForSEO API', icon: '📈', category: 'api', fields: [{ key: 'login', label: 'Login Email' }, { key: 'password', label: 'Password', secret: true }] },
  moz: { label: 'Moz API', icon: '🔗', category: 'api', fields: [{ key: 'access_id', label: 'Access ID' }, { key: 'secret_key', label: 'Secret Key', secret: true }] },
  perplexity: { label: 'Perplexity AI', icon: '🧠', category: 'api', fields: [{ key: 'api_key', label: 'API Key', secret: true, placeholder: 'pplx-...' }] },
  semrush: { label: 'Semrush API', icon: '📊', category: 'api', fields: [{ key: 'api_key', label: 'API Key', secret: true }] },
  ahrefs: { label: 'Ahrefs API', icon: '🔗', category: 'api', fields: [{ key: 'api_key', label: 'API Key', secret: true }] },
  website_url: { label: 'Website URL', icon: '🌐', category: 'info', fields: [{ key: 'url', label: 'Website URL', placeholder: 'https://example.co.il' }] },
};

const DEFAULT_CONFIG = { label: 'Unknown Service', icon: '🔧', category: 'api', fields: [{ key: 'api_key', label: 'API Key / Token', secret: true }] };

// ─── Connection status labels ───────────────────────────────────
const STATUS_CONFIG = {
  active: { label: 'Connected', color: colors.success, bg: colors.successLight },
  connected: { label: 'Connected', color: colors.success, bg: colors.successLight },
  connected_no_integration: { label: 'Partial', color: colors.warning, bg: colors.warningLight },
  expired: { label: 'Token Expired', color: colors.error, bg: colors.errorLight },
  limited: { label: 'Limited Permissions', color: colors.warning, bg: colors.warningLight },
  disconnected: { label: 'Not Connected', color: colors.error, bg: colors.errorLight },
  missing: { label: 'Not Connected', color: colors.error, bg: colors.errorLight },
};

// ─── Health Bar ─────────────────────────────────────────────────
function HealthBar({ score }) {
  const pct = score || 0;
  const barColor = pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.error;
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      style={{ height: 6, background: colors.borderLight, borderRadius: radius.sm, marginBottom: spacing.xs, overflow: 'hidden' }}>
      <div style={{ height: 6, borderRadius: radius.sm, background: barColor, width: `${pct}%`, transition: transitions.normal }} />
    </div>
  );
}

// ─── Secret Field ───────────────────────────────────────────────
function SecretInput({ value, onChange, placeholder, hasExisting }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={visible ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={hasExisting && !value ? '••••••• (saved — leave blank to keep)' : (placeholder || '')}
        style={{ ...inputStyle, paddingRight: 36 }} />
      <button onClick={() => setVisible(!visible)} type="button" aria-label={visible ? 'Hide' : 'Show'}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 2 }}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ─── OAuth Connection Card (for Google/Meta services) ───────────
function OAuthConnectionCard({ service, config, oauthStatus, clientId, onRefresh }) {
  const [connecting, setConnecting] = useState(false);
  const [selectingAsset, setSelectingAsset] = useState(null);
  const conn = oauthStatus || {};
  const sc = STATUS_CONFIG[conn.status] || STATUS_CONFIG.disconnected;
  const isConnected = conn.connected && conn.token_status === 'valid';
  const isExpired = conn.token_status === 'expired';

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const provider = config.oauth;
      let resp;
      if (provider === 'google') {
        resp = await api(`/clients/${clientId}/oauth/google/start`, {
          method: 'POST',
          body: { subProviders: ['search_console', 'ads', 'business_profile', 'analytics'] }
        });
      } else {
        resp = await api(`/clients/${clientId}/oauth/meta/start`, { method: 'POST' });
      }
      if (resp.auth_url) window.open(resp.auth_url, '_blank', 'width=600,height=700');
    } catch (e) {
      alert(`OAuth error: ${e.message}`);
    }
    setConnecting(false);
  };

  const handleSelectAsset = async (assetId) => {
    setSelectingAsset(assetId);
    try {
      await api(`/clients/${clientId}/integration-assets/${assetId}/select`, { method: 'PATCH' });
      if (onRefresh) await onRefresh();
    } catch (e) { alert(e.message); }
    setSelectingAsset(null);
  };

  return (
    <Card style={{
      borderLeft: `4px solid ${isConnected ? colors.success : isExpired ? colors.error : colors.textDisabled}`,
      borderColor: isConnected ? colors.successLight : colors.borderLight,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ fontSize: fontSize['2xl'] }}>{config.icon}</span>
          <div>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>{config.label}</div>
            <div style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
              via {config.oauth === 'google' ? 'Google' : 'Meta'} OAuth
            </div>
          </div>
        </div>
        <Badge
          text={isConnected ? 'Connected' : isExpired ? 'Expired' : 'Not Connected'}
          color={isConnected ? colors.successDark : colors.errorDark}
          bg={isConnected ? colors.successLight : colors.errorLight}
        />
      </div>

      {/* Connection details (when connected) */}
      {isConnected && (
        <div style={{
          background: colors.successLight, borderRadius: radius.md,
          padding: spacing.md, marginBottom: spacing.md,
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.lg }}>
            {conn.account_email && (
              <div>
                <div style={{ fontSize: fontSize.micro, color: colors.successDark, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>Account</div>
                <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>{conn.account_name || conn.account_email}</div>
                {conn.account_name && <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>{conn.account_email}</div>}
              </div>
            )}
            {conn.selected_asset && (
              <div>
                <div style={{ fontSize: fontSize.micro, color: colors.successDark, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {config.subProvider === 'facebook' ? 'Page' : config.subProvider === 'instagram' ? 'Profile' : 'Property'}
                </div>
                <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>{conn.selected_asset.label}</div>
              </div>
            )}
            {conn.connected_at && (
              <div>
                <div style={{ fontSize: fontSize.micro, color: colors.successDark, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>Connected</div>
                <div style={{ fontSize: fontSize.sm, color: colors.text }}>{new Date(conn.connected_at).toLocaleDateString()}</div>
              </div>
            )}
          </div>
          {conn.scopes_granted?.length > 0 && (
            <div style={{ marginTop: spacing.sm }}>
              <div style={{ fontSize: fontSize.micro, color: colors.successDark, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Permissions</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {conn.scopes_granted.slice(0, 6).map((s, i) => (
                  <span key={i} style={{
                    fontSize: 9, padding: '2px 6px', borderRadius: radius.sm,
                    background: 'rgba(16,185,129,0.15)', color: colors.successDark,
                  }}>
                    {s.split('/').pop().split('.').pop()}
                  </span>
                ))}
                {conn.scopes_granted.length > 6 && (
                  <span style={{ fontSize: 9, color: colors.textMuted }}>+{conn.scopes_granted.length - 6} more</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expired token warning */}
      {isExpired && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: spacing.sm,
          background: colors.errorLight, borderRadius: radius.md,
          padding: spacing.md, marginBottom: spacing.md,
          fontSize: fontSize.sm, color: colors.errorDark,
        }}>
          <AlertCircle size={14} />
          <span>Token expired. Reconnect to restore access.</span>
        </div>
      )}

      {/* Not connected instructions */}
      {!isConnected && !isExpired && (
        <div style={{
          background: colors.surfaceHover, borderRadius: radius.md,
          padding: spacing.md, marginBottom: spacing.md,
          fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 1.6,
        }}>
          {config.oauth === 'google'
            ? 'Click Connect to sign in with Google and grant access. The customer authenticates directly — no passwords or tokens needed.'
            : 'Click Connect to sign in with Facebook/Instagram and approve access. Select the Page to manage. No manual tokens needed.'
          }
        </div>
      )}

      {/* Asset selection (pages, properties, etc.) */}
      {isConnected && conn.assets?.length > 1 && (
        <div style={{ marginBottom: spacing.md }}>
          <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm }}>
            Select {config.subProvider === 'facebook' ? 'Page' : config.subProvider === 'instagram' ? 'Profile' : 'Property'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
            {conn.assets.map(a => (
              <button
                key={a.id}
                onClick={() => handleSelectAsset(a.id)}
                disabled={selectingAsset === a.id}
                style={{
                  padding: '6px 12px', borderRadius: radius.md,
                  border: `2px solid ${a.is_selected ? colors.primary : colors.border}`,
                  background: a.is_selected ? colors.primaryLightest : colors.surface,
                  cursor: 'pointer', fontSize: fontSize.xs, fontWeight: a.is_selected ? fontWeight.bold : fontWeight.medium,
                  color: a.is_selected ? colors.primary : colors.text,
                  transition: transitions.fast, opacity: selectingAsset ? 0.7 : 1,
                }}
              >
                {a.label}
                {a.is_selected && <CheckCircle2 size={10} style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {conn.last_error && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 4,
          fontSize: fontSize.xs, color: colors.error, marginBottom: spacing.sm,
          background: colors.errorLight, padding: `${spacing.xs}px ${spacing.sm}px`,
          borderRadius: radius.sm, lineHeight: 1.4,
        }}>
          <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          {conn.last_error}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
        <button
          onClick={handleConnect}
          disabled={connecting}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: radius.md,
            background: isConnected ? colors.surfaceHover : (config.oauth === 'google' ? '#4285F4' : '#1877F2'),
            color: isConnected ? colors.text : '#fff',
            border: isConnected ? `1px solid ${colors.border}` : 'none',
            cursor: connecting ? 'wait' : 'pointer',
            fontSize: fontSize.sm, fontWeight: fontWeight.bold,
            transition: transitions.fast, opacity: connecting ? 0.7 : 1,
          }}
        >
          {connecting ? <Spin /> : <Link2 size={13} />}
          {isConnected ? 'Reconnect' : isExpired ? 'Reconnect' : `Connect ${config.oauth === 'google' ? 'Google' : 'Facebook'}`}
        </button>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'setup-links' }))}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '8px 12px', borderRadius: radius.md,
            background: 'transparent', border: `1px solid ${colors.border}`,
            color: colors.textSecondary, cursor: 'pointer',
            fontSize: fontSize.xs, fontWeight: fontWeight.medium,
          }}
        >
          <ExternalLink size={11} /> Send Setup Link
        </button>
      </div>
    </Card>
  );
}

// ─── API Credential Card (for non-OAuth services) ───────────────
function ApiCredentialCard({ cred, onEdit }) {
  const connected = cred.is_connected;
  const config = SERVICE_CONFIG[cred.service] || DEFAULT_CONFIG;
  const healthPct = cred.health_score || 0;

  return (
    <Card style={{
      borderColor: connected ? colors.successLight : colors.errorLight,
      borderLeft: `4px solid ${connected ? colors.success : healthPct > 0 ? colors.warning : colors.error}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <span style={{ fontSize: fontSize.xl }}>{config.icon}</span>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>{cred.label || config.label || cred.service}</div>
        </div>
        <Badge text={connected ? 'Connected' : 'Disconnected'} color={connected ? colors.successDark : colors.errorDark} bg={connected ? colors.successLight : colors.errorLight} />
      </div>

      <HealthBar score={healthPct} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>Health: {healthPct}%</div>
        <Btn small secondary onClick={() => onEdit(cred)} ariaLabel={`Configure ${cred.label || cred.service}`}>
          <Edit3 size={11} /> Configure
        </Btn>
      </div>

      {cred.error && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'flex-start', gap: 4,
          fontSize: fontSize.xs, color: colors.error, marginTop: spacing.sm,
          background: colors.errorLight, padding: `${spacing.xs}px ${spacing.sm}px`,
          borderRadius: radius.sm, lineHeight: 1.4,
        }}>
          <AlertCircle size={11} style={{ flexShrink: 0, marginTop: 1 }} />
          {cred.error}
        </div>
      )}

      {cred.last_checked && (
        <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: spacing.xs }}>
          Last checked: {new Date(cred.last_checked).toLocaleString()}
        </div>
      )}
    </Card>
  );
}

// ─── API Credential Edit Modal ──────────────────────────────────
function EditCredentialForm({ cred, config, onSave, onCancel, saving }) {
  const [formData, setFormData] = useState({});
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    setLoadingDetail(true);
    api(`/credentials/${cred.id}/detail`)
      .then(d => {
        setDetail(d);
        const data = {};
        config.fields.forEach(f => {
          data[f.key] = f.secret ? '' : (d.raw_data?.[f.key] || '');
        });
        setFormData(data);
      })
      .catch(() => {
        const data = {};
        config.fields.forEach(f => { data[f.key] = ''; });
        setFormData(data);
      })
      .finally(() => setLoadingDetail(false));
  }, [cred.id]);

  const handleSave = () => {
    const merged = { ...formData };
    if (detail?.raw_data) {
      config.fields.forEach(f => {
        if (f.secret && !merged[f.key] && detail.raw_data[f.key]) merged[f.key] = detail.raw_data[f.key];
      });
    }
    onSave(merged);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: spacing.xl,
    }} onClick={onCancel}>
      <div style={{
        background: colors.surface, borderRadius: radius.xl, border: `2px solid ${colors.primary}`,
        padding: spacing['2xl'], width: '100%', maxWidth: 500, maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', animation: 'fadeIn 0.2s ease-out',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.text }}>
            {config.icon} {config.label}
          </div>
          <button onClick={onCancel} style={{ background: colors.surfaceHover, border: 'none', borderRadius: radius.md, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color={colors.textMuted} />
          </button>
        </div>

        {loadingDetail ? (
          <div style={{ textAlign: 'center', padding: spacing['2xl'] }}><Spin /></div>
        ) : (
          <>
            {config.fields.map(field => {
              const hasExisting = detail?.field_status?.[field.key] === true;
              return (
                <div key={field.key} style={{ marginBottom: spacing.lg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                    <label style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {field.label}
                    </label>
                    {hasExisting ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fontSize.micro, color: colors.success, fontWeight: fontWeight.bold }}>
                        <CheckCircle2 size={10} /> Saved
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fontSize.micro, color: colors.error, fontWeight: fontWeight.bold }}>
                        <AlertCircle size={10} /> Missing
                      </span>
                    )}
                  </div>
                  {field.secret ? (
                    <SecretInput value={formData[field.key] || ''} onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder || `Enter ${field.label}...`} hasExisting={hasExisting} />
                  ) : (
                    <input value={formData[field.key] || ''} onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder || `Enter ${field.label}...`} style={inputStyle} />
                  )}
                  {field.secret && hasExisting && (
                    <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: 3 }}>Leave blank to keep existing value</div>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.xl }}>
              <Btn onClick={handleSave} disabled={saving}>{saving ? <Spin /> : <Check size={13} />} Save</Btn>
              <Btn secondary onClick={onCancel}>Cancel</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export default function CredentialsView({ clientId, focusService, onFocusConsumed }) {
  const [creds, setCreds] = useState([]);
  const [oauthStatus, setOauthStatus] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const [credsData, oauthData] = await Promise.all([
        api(`/clients/${clientId}/credentials`),
        api(`/clients/${clientId}/oauth-status`).catch(() => ({ connections: {} })),
      ]);
      setCreds(credsData);
      setOauthStatus(oauthData.connections || {});
    } catch (e) { setError(e.message); }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  // Auto-open specific credential when navigated from Dashboard
  useEffect(() => {
    if (focusService && creds.length > 0 && !editing) {
      const config = SERVICE_CONFIG[focusService];
      if (config?.category === 'api') {
        const target = creds.find(c => c.service === focusService);
        if (target) setEditing(target);
      }
      // For OAuth services, just scroll to view — they don't have an edit modal
      if (onFocusConsumed) onFocusConsumed();
    }
  }, [focusService, creds]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await api(`/clients/${clientId}/credentials/refresh`, { method: 'POST' });
      await load();
    } catch (e) { setError(e.message); }
    setRefreshing(false);
  };

  const handleSave = async (formData) => {
    setSaving(true);
    try {
      await api(`/credentials/${editing.id}`, {
        method: 'PATCH',
        body: { credential_data: formData, is_connected: false, error: null },
      });
      setEditing(null);
      await api(`/clients/${clientId}/credentials/refresh`, { method: 'POST' });
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!clientId) return <Empty icon={Key} msg="Select a client to view credentials" />;

  const config = editing ? (SERVICE_CONFIG[editing.service] || DEFAULT_CONFIG) : null;

  // Separate OAuth and API credentials
  const oauthServices = Object.entries(SERVICE_CONFIG).filter(([_, c]) => c.category === 'oauth');
  const apiCreds = creds.filter(c => {
    const cfg = SERVICE_CONFIG[c.service];
    // Show only explicitly API services, or unknown ones that aren't clearly OAuth/info
    if (cfg) return cfg.category === 'api';
    // Hide DB entries for services that are handled via OAuth or are just info
    const oauthServiceNames = ['google_search_console', 'google_ads', 'google_analytics', 'google_business_profile', 'facebook', 'instagram', 'meta_business', 'facebook_page'];
    const infoServiceNames = ['website_url'];
    return !oauthServiceNames.includes(c.service) && !infoServiceNames.includes(c.service);
  });

  // Count connections
  const oauthConnected = Object.values(oauthStatus).filter(c => c.connected && c.token_status === 'valid').length;
  const apiConnected = apiCreds.filter(c => c.is_connected).length;
  const totalConnected = oauthConnected + apiConnected;
  const totalServices = oauthServices.length + apiCreds.length;

  return (
    <div>
      <SH
        title="Credentials & Connections"
        sub="OAuth connections and API keys for all integrated services"
        action={
          <Btn onClick={handleRefreshAll} disabled={refreshing} small>
            {refreshing ? <Spin /> : <RefreshCw size={12} />} Refresh All
          </Btn>
        }
      />

      {editing && config && (
        <EditCredentialForm cred={editing} config={config} onSave={handleSave} onCancel={() => setEditing(null)} saving={saving} />
      )}

      {error && (
        <div role="alert" style={{ background: colors.errorLight, color: colors.errorDark, padding: `${spacing.sm}px ${spacing.lg}px`, borderRadius: radius.md, fontSize: fontSize.sm, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <AlertCircle size={14} /> {error}
          <Btn small ghost onClick={() => setError(null)} style={{ marginLeft: 'auto' }}><X size={12} /></Btn>
        </div>
      )}

      {/* Summary */}
      <Card style={{ marginBottom: spacing.xl, background: `linear-gradient(135deg, ${colors.primaryLightest}, ${colors.surfaceHover})`, borderColor: colors.primaryLighter }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}>
          <div>
            <div style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold, marginBottom: 2 }}>
              Platform Connections
            </div>
            <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 1.5 }}>
              <strong>Google & Meta</strong> services connect via OAuth — click Connect and the customer authenticates directly. No passwords needed.
              <br /><strong>API services</strong> require keys entered manually or via Setup Link.
            </div>
          </div>
          <div style={{ display: 'flex', gap: spacing.xl, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: totalConnected === totalServices ? colors.success : colors.warning }}>
                {totalConnected}/{totalServices}
              </div>
              <div style={{ fontSize: fontSize.micro, color: colors.textMuted }}>Connected</div>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: spacing.md }}>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} rows={3} />)}
        </div>
      ) : (
        <>
          {/* ─── GOOGLE CONNECTIONS ─────────────────────── */}
          <div style={{ marginBottom: spacing['2xl'] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
              <span style={{ fontSize: fontSize.xl }}>🔐</span>
              <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, margin: 0 }}>Google Services</h3>
              <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Platform OAuth — one click connection</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: spacing.md }}>
              {oauthServices.filter(([_, c]) => c.oauth === 'google').map(([key, cfg]) => (
                <OAuthConnectionCard
                  key={key}
                  service={key}
                  config={cfg}
                  oauthStatus={oauthStatus[`google_${cfg.subProvider}`]}
                  clientId={clientId}
                  onRefresh={load}
                />
              ))}
            </div>
          </div>

          {/* ─── META CONNECTIONS ───────────────────────── */}
          <div style={{ marginBottom: spacing['2xl'] }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
              <span style={{ fontSize: fontSize.xl }}>📱</span>
              <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, margin: 0 }}>Facebook & Instagram</h3>
              <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Platform OAuth — no manual tokens</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: spacing.md }}>
              {oauthServices.filter(([_, c]) => c.oauth === 'meta').map(([key, cfg]) => (
                <OAuthConnectionCard
                  key={key}
                  service={key}
                  config={cfg}
                  oauthStatus={oauthStatus[cfg.subProvider] || oauthStatus[key]}
                  clientId={clientId}
                  onRefresh={load}
                />
              ))}
            </div>
          </div>

          {/* ─── API CREDENTIALS ───────────────────────── */}
          {apiCreds.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                <span style={{ fontSize: fontSize.xl }}>🔑</span>
                <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, margin: 0 }}>API Keys & Services</h3>
                <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Manual configuration</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: spacing.md }}>
                {apiCreds.map(c => <ApiCredentialCard key={c.id} cred={c} onEdit={setEditing} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
