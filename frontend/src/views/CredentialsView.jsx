import { useState, useEffect, useCallback } from 'react';
import { Key, RefreshCw, Edit3, Check, X, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions } from '../theme.js';
import { Card, SH, Badge, Btn, Spin, Empty, SkeletonCard, Field, inputStyle } from '../components/index.jsx';

// Known service types and what credentials they need
const SERVICE_CONFIG = {
  openai: { label: 'OpenAI API (gpt-4.1)', fields: [{ key: 'api_key', label: 'API Key', secret: true }] },
  google_search_console: { label: 'Google Search Console', fields: [{ key: 'property_url', label: 'Property URL' }, { key: 'api_key', label: 'Service Account JSON', secret: true, multiline: true }] },
  google_ads: { label: 'Google Ads', fields: [{ key: 'customer_id', label: 'Customer ID' }, { key: 'api_key', label: 'API Key / OAuth Token', secret: true }] },
  google_analytics: { label: 'Google Analytics 4', fields: [{ key: 'property_id', label: 'Property ID' }, { key: 'api_key', label: 'Service Account JSON', secret: true, multiline: true }] },
  google_business_profile: { label: 'Google Business Profile', fields: [{ key: 'account_id', label: 'Account ID' }, { key: 'api_key', label: 'OAuth Token', secret: true }] },
  meta_business: { label: 'Facebook Business Page', fields: [{ key: 'page_id', label: 'Page ID' }, { key: 'access_token', label: 'Access Token', secret: true }] },
  instagram_business: { label: 'Instagram Business Profile', fields: [{ key: 'account_id', label: 'Account ID' }, { key: 'access_token', label: 'Access Token', secret: true }] },
  dataforseo: { label: 'DataForSEO API', fields: [{ key: 'login', label: 'Login' }, { key: 'password', label: 'Password', secret: true }] },
  moz: { label: 'Moz API (Domain Authority)', fields: [{ key: 'access_id', label: 'Access ID' }, { key: 'secret_key', label: 'Secret Key', secret: true }] },
};

// ─── Health Bar ─────────────────────────────────────────────────
function HealthBar({ score }) {
  const pct = score || 0;
  const barColor = pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.error;
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Health score: ${pct}%`}
      style={{ height: 6, background: colors.borderLight, borderRadius: radius.sm, marginBottom: spacing.sm, overflow: 'hidden' }}>
      <div style={{ height: 6, borderRadius: radius.sm, background: barColor, width: `${pct}%`, transition: transitions.normal }} />
    </div>
  );
}

// ─── Secret Field ───────────────────────────────────────────────
function SecretInput({ value, onChange, placeholder, multiline }) {
  const [visible, setVisible] = useState(false);
  if (multiline) {
    return (
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={3}
        style={{ ...inputStyle, fontFamily: 'monospace', fontSize: fontSize.xs, resize: 'vertical' }} />
    );
  }
  return (
    <div style={{ position: 'relative' }}>
      <input type={visible ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 36 }} />
      <button onClick={() => setVisible(!visible)} type="button" aria-label={visible ? 'Hide' : 'Show'}
        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 2 }}>
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ─── Edit Credential Modal ──────────────────────────────────────
function EditCredentialForm({ cred, config, onSave, onCancel, saving }) {
  const [formData, setFormData] = useState(() => {
    const data = {};
    config.fields.forEach(f => { data[f.key] = cred?.credential_data?.[f.key] || ''; });
    return data;
  });

  return (
    <Card style={{ borderColor: colors.primary, borderWidth: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>{config.label}</div>
        <Btn small secondary onClick={onCancel} ariaLabel="Cancel editing"><X size={12} /></Btn>
      </div>
      {config.fields.map(field => (
        <Field key={field.key} label={field.label} htmlFor={`cred-${field.key}`}>
          {field.secret ? (
            <SecretInput
              value={formData[field.key]}
              onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={`Enter ${field.label}...`}
              multiline={field.multiline}
            />
          ) : (
            <input id={`cred-${field.key}`} value={formData[field.key]}
              onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={`Enter ${field.label}...`} style={inputStyle} />
          )}
        </Field>
      ))}
      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
        <Btn onClick={() => onSave(formData)} disabled={saving}>
          {saving ? <Spin /> : <Check size={13} />} Save Credentials
        </Btn>
        <Btn secondary onClick={onCancel}>Cancel</Btn>
      </div>
    </Card>
  );
}

// ─── Credential Card ────────────────────────────────────────────
function CredentialCard({ cred, onEdit }) {
  const connected = cred.is_connected;
  const config = SERVICE_CONFIG[cred.service];

  return (
    <Card style={{ borderColor: connected ? colors.successLight : colors.errorLight }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm, flexWrap: 'wrap' }}>
        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>{cred.label || config?.label || cred.service}</div>
        <Badge text={connected ? 'Connected' : 'Disconnected'} color={connected ? colors.successDark : colors.errorDark} bg={connected ? colors.successLight : colors.errorLight} />
      </div>
      <HealthBar score={cred.health_score} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Health: {cred.health_score}%</div>
        <Btn small secondary onClick={() => onEdit(cred)} ariaLabel={`Configure ${cred.label || cred.service}`}>
          <Edit3 size={11} /> Configure
        </Btn>
      </div>
      {cred.error && (
        <div role="alert" style={{ fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs, lineHeight: 1.4 }}>{cred.error}</div>
      )}
    </Card>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export default function CredentialsView({ clientId }) {
  const [creds, setCreds] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // cred being edited
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try { setCreds(await api(`/clients/${clientId}/credentials`)); }
    catch (e) { setError(e.message); }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try { await api(`/clients/${clientId}/credentials/refresh`, { method: 'POST' }); await load(); }
    catch (e) { setError(e.message); }
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
      // Refresh to re-check health
      await api(`/clients/${clientId}/credentials/refresh`, { method: 'POST' });
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!clientId) return <Empty icon={Key} msg="Select a client to view credentials" />;

  const config = editing ? SERVICE_CONFIG[editing.service] : null;

  return (
    <div>
      <SH
        title="Credentials"
        sub="Service connection health — click Configure to add or update API keys"
        action={
          <Btn onClick={handleRefreshAll} disabled={refreshing} small ariaLabel="Refresh all credential health checks">
            {refreshing ? <Spin /> : <RefreshCw size={12} />} Check All
          </Btn>
        }
      />

      {/* Editing form */}
      {editing && config && (
        <div style={{ marginBottom: spacing.xl }}>
          <EditCredentialForm cred={editing} config={config} onSave={handleSave} onCancel={() => setEditing(null)} saving={saving} />
        </div>
      )}

      {error && (
        <div role="alert" style={{ background: colors.errorLight, color: colors.errorDark, padding: `${spacing.sm}px ${spacing.lg}px`, borderRadius: radius.md, fontSize: fontSize.sm, marginBottom: spacing.lg }}>
          {error}
        </div>
      )}

      {/* Help banner */}
      <Card style={{ marginBottom: spacing.lg, background: colors.primaryLightest, borderColor: colors.primaryLighter }}>
        <div style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold, marginBottom: spacing.xs }}>
          How credentials work
        </div>
        <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 1.5 }}>
          Click <strong>Configure</strong> on any service to enter API keys. After saving, we'll automatically verify the connection.
          You can also send a <strong>Setup Link</strong> to your client so they can connect their own accounts via OAuth.
        </div>
      </Card>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.md }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} rows={2} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.md }}>
          {creds.map(c => <CredentialCard key={c.id} cred={c} onEdit={setEditing} />)}
          {creds.length === 0 && (
            <div style={{ gridColumn: '1 / -1' }}>
              <Empty icon={Key} msg="No credentials configured for this client" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
