import { useState, useEffect, useCallback } from 'react';
import { Key, RefreshCw, Edit3, Check, X, Eye, EyeOff, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions, shadows } from '../theme.js';
import { Card, SH, Badge, Btn, Spin, Empty, SkeletonCard, Field, inputStyle } from '../components/index.jsx';

// Known service types and what credentials they need
const SERVICE_CONFIG = {
  openai: { label: 'OpenAI API (gpt-4.1)', fields: [{ key: 'api_key', label: 'API Key', secret: true, placeholder: 'sk-proj-...' }] },
  google_search_console: { label: 'Google Search Console', oauth: 'google', fields: [{ key: 'property_url', label: 'Website URL', placeholder: 'https://example.com' }, { key: 'email', label: 'Google Account Email', placeholder: 'you@gmail.com' }, { key: 'password', label: 'Password / App Password', secret: true }] },
  google_ads: { label: 'Google Ads', oauth: 'google', fields: [{ key: 'customer_id', label: 'Customer ID', placeholder: 'XXX-XXX-XXXX' }, { key: 'email', label: 'Google Account Email', placeholder: 'you@gmail.com' }, { key: 'password', label: 'Password / App Password', secret: true }] },
  google_analytics: { label: 'Google Analytics 4', oauth: 'google', fields: [{ key: 'property_id', label: 'Property ID', placeholder: 'e.g. 123456789' }, { key: 'email', label: 'Google Account Email', placeholder: 'you@gmail.com' }, { key: 'password', label: 'Password / App Password', secret: true }] },
  google_business_profile: { label: 'Google Business Profile', oauth: 'google', fields: [{ key: 'email', label: 'Google Account Email', placeholder: 'you@gmail.com' }, { key: 'password', label: 'Password / App Password', secret: true }] },
  facebook: { label: 'Facebook Business Page', oauth: 'meta', fields: [{ key: 'page_url', label: 'Page URL', placeholder: 'https://facebook.com/yourpage' }, { key: 'email', label: 'Facebook Email / Username' }, { key: 'password', label: 'Password', secret: true }] },
  instagram: { label: 'Instagram Business Profile', oauth: 'meta', fields: [{ key: 'profile_url', label: 'Profile URL', placeholder: 'https://instagram.com/yourprofile' }, { key: 'username', label: 'Username', placeholder: '@yourhandle' }, { key: 'password', label: 'Password', secret: true }] },
  meta_business: { label: 'Meta Business', oauth: 'meta', fields: [{ key: 'email', label: 'Meta Business Email' }, { key: 'password', label: 'Password', secret: true }] },
  dataforseo: { label: 'DataForSEO API', fields: [{ key: 'login', label: 'Login Email' }, { key: 'password', label: 'Password', secret: true }] },
  moz: { label: 'Moz API (Domain Authority)', fields: [{ key: 'access_id', label: 'Access ID' }, { key: 'secret_key', label: 'Secret Key', secret: true }] },
};

const DEFAULT_CONFIG = { label: 'Unknown Service', fields: [{ key: 'api_key', label: 'API Key / Token', secret: true }] };

// ─── Health explanation ──────────────────────────────────────────
function healthExplanation(score, service) {
  if (score === 100) return 'All fields configured and connection verified';
  if (score >= 75) return 'Connected but some optional fields may be missing';
  if (score >= 50) return 'Partially configured — some required fields are missing';
  if (score > 0) return 'Minimally configured — most fields need to be filled in';
  return 'No credentials configured — click Configure to add them';
}

// ─── Health Bar ─────────────────────────────────────────────────
function HealthBar({ score }) {
  const pct = score || 0;
  const barColor = pct >= 75 ? colors.success : pct >= 50 ? colors.warning : colors.error;
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Health score: ${pct}%`}
      style={{ height: 6, background: colors.borderLight, borderRadius: radius.sm, marginBottom: spacing.xs, overflow: 'hidden' }}>
      <div style={{ height: 6, borderRadius: radius.sm, background: barColor, width: `${pct}%`, transition: transitions.normal }} />
    </div>
  );
}

// ─── Secret Field ───────────────────────────────────────────────
function SecretInput({ value, onChange, placeholder, multiline, hasExisting }) {
  const [visible, setVisible] = useState(false);
  if (multiline) {
    return (
      <textarea value={value} onChange={onChange} placeholder={placeholder} rows={3}
        style={{ ...inputStyle, fontFamily: 'monospace', fontSize: fontSize.xs, resize: 'vertical' }} />
    );
  }
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

// ─── Edit Credential Modal ──────────────────────────────────────
function EditCredentialForm({ cred, config, onSave, onCancel, saving }) {
  const [formData, setFormData] = useState({});
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Fetch existing credential data on mount
  useEffect(() => {
    setLoadingDetail(true);
    api(`/credentials/${cred.id}/detail`)
      .then(d => {
        setDetail(d);
        // Pre-fill form with existing values
        const data = {};
        config.fields.forEach(f => {
          // Use raw_data for non-secret fields, leave secret fields blank (user fills if changing)
          if (f.secret) {
            data[f.key] = ''; // Don't pre-fill secrets — user enters new or leaves blank to keep
          } else {
            data[f.key] = d.raw_data?.[f.key] || '';
          }
        });
        setFormData(data);
      })
      .catch(() => {
        // Fallback: empty form
        const data = {};
        config.fields.forEach(f => { data[f.key] = ''; });
        setFormData(data);
      })
      .finally(() => setLoadingDetail(false));
  }, [cred.id]);

  const handleSave = () => {
    // Merge: for secret fields left blank, keep existing value from raw_data
    const merged = { ...formData };
    if (detail?.raw_data) {
      config.fields.forEach(f => {
        if (f.secret && !merged[f.key] && detail.raw_data[f.key]) {
          merged[f.key] = detail.raw_data[f.key]; // Keep existing secret
        }
      });
    }
    onSave(merged);
  };

  const filledCount = detail ? config.fields.filter(f => detail.field_status?.[f.key]).length : 0;
  const totalFields = config.fields.length;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: spacing.xl,
    }} onClick={onCancel}>
      <div style={{
        background: colors.surface, borderRadius: radius.xl,
        border: `2px solid ${colors.primary}`,
        padding: spacing['2xl'], width: '100%', maxWidth: 560,
        maxHeight: '90vh', overflow: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        animation: 'fadeIn 0.2s ease-out',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
          <div>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color: colors.text }}>{config.label}</div>
            <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
              {cred.is_connected ? '✅ Connected' : '❌ Disconnected'}
              {detail && ` — ${filledCount}/${totalFields} fields configured`}
            </div>
          </div>
          <button onClick={onCancel} style={{
            background: colors.surfaceHover, border: 'none', borderRadius: radius.md,
            width: 32, height: 32, cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={16} color={colors.textMuted} />
          </button>
        </div>

        {/* Health explanation */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
          background: cred.health_score >= 75 ? colors.successLight : cred.health_score >= 50 ? colors.warningLight : colors.errorLight,
          borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
          fontSize: fontSize.sm, lineHeight: 1.5,
          color: cred.health_score >= 75 ? colors.successDark : cred.health_score >= 50 ? colors.warningDark : colors.errorDark,
        }}>
          <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>Health: {cred.health_score}%</strong> — {healthExplanation(cred.health_score, cred.service)}
            {cred.error && <div style={{ marginTop: 4 }}>Error: {cred.error}</div>}
          </div>
        </div>

        {config.oauth && (
          <div style={{
            background: '#f0f7ff', border: '1px solid #c5ddf7',
            borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg,
            fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 1.5,
          }}>
            🔑 <strong>Tip:</strong> You can also connect via <strong>Setup Link</strong> sent to your client — they authenticate directly with {config.oauth === 'google' ? 'Google' : 'Meta'} (recommended).
          </div>
        )}

        {loadingDetail ? (
          <div style={{ textAlign: 'center', padding: spacing['2xl'] }}>
            <Spin /> <span style={{ marginLeft: 8, fontSize: fontSize.sm, color: colors.textMuted }}>Loading saved credentials...</span>
          </div>
        ) : (
          <>
            {/* Fields with status indicators */}
            {config.fields.map(field => {
              const hasExisting = detail?.field_status?.[field.key] === true;
              const maskedValue = detail?.masked_data?.[field.key] || '';

              return (
                <div key={field.key} style={{ marginBottom: spacing.lg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
                    <label htmlFor={`cred-${field.key}`}
                      style={{
                        fontSize: fontSize.xs, color: colors.textSecondary,
                        fontWeight: fontWeight.bold, textTransform: 'uppercase',
                        letterSpacing: 0.5,
                      }}>
                      {field.label}
                    </label>
                    {/* Field status badge */}
                    {hasExisting ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: fontSize.micro, color: colors.success,
                        fontWeight: fontWeight.bold,
                      }}>
                        <CheckCircle2 size={10} /> Saved
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: fontSize.micro, color: colors.error,
                        fontWeight: fontWeight.bold,
                      }}>
                        <AlertCircle size={10} /> Missing
                      </span>
                    )}
                  </div>

                  {/* Show current masked value for reference */}
                  {hasExisting && field.secret && (
                    <div style={{
                      fontSize: fontSize.xs, color: colors.textMuted,
                      marginBottom: 4, fontFamily: 'monospace',
                    }}>
                      Current: {maskedValue}
                    </div>
                  )}

                  {field.secret ? (
                    <SecretInput
                      value={formData[field.key] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder || `Enter ${field.label}...`}
                      multiline={field.multiline}
                      hasExisting={hasExisting}
                    />
                  ) : (
                    <input id={`cred-${field.key}`} value={formData[field.key] || ''}
                      onChange={e => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder || `Enter ${field.label}...`} style={inputStyle} />
                  )}

                  {field.secret && hasExisting && (
                    <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: 3 }}>
                      Leave blank to keep existing value
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.xl }}>
              <Btn onClick={handleSave} disabled={saving}>
                {saving ? <Spin /> : <Check size={13} />} Save Credentials
              </Btn>
              <Btn secondary onClick={onCancel}>Cancel</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Credential Card ────────────────────────────────────────────
function CredentialCard({ cred, onEdit }) {
  const connected = cred.is_connected;
  const config = SERVICE_CONFIG[cred.service];
  const totalFields = config?.fields?.length || 1;
  const healthPct = cred.health_score || 0;

  return (
    <Card style={{
      borderColor: connected ? colors.successLight : colors.errorLight,
      borderLeft: `4px solid ${connected ? colors.success : healthPct > 0 ? colors.warning : colors.error}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, gap: spacing.sm, flexWrap: 'wrap' }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>{cred.label || config?.label || cred.service}</div>
        <Badge text={connected ? 'Connected' : 'Disconnected'} color={connected ? colors.successDark : colors.errorDark} bg={connected ? colors.successLight : colors.errorLight} />
      </div>

      <HealthBar score={healthPct} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          Health: {healthPct}%
        </div>
        <Btn small secondary onClick={() => onEdit(cred)} ariaLabel={`Configure ${cred.label || cred.service}`}>
          <Edit3 size={11} /> Configure
        </Btn>
      </div>

      {/* Explain what the score means */}
      <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, lineHeight: 1.4 }}>
        {healthExplanation(healthPct, cred.service)}
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

// ─── Main View ──────────────────────────────────────────────────
export default function CredentialsView({ clientId }) {
  const [creds, setCreds] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
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
      await api(`/clients/${clientId}/credentials/refresh`, { method: 'POST' });
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  if (!clientId) return <Empty icon={Key} msg="Select a client to view credentials" />;

  const config = editing ? (SERVICE_CONFIG[editing.service] || { ...DEFAULT_CONFIG, label: editing.label || editing.service }) : null;

  // Stats
  const connected = creds.filter(c => c.is_connected).length;
  const avgHealth = creds.length > 0 ? Math.round(creds.reduce((s, c) => s + (c.health_score || 0), 0) / creds.length) : 0;

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

      {editing && config && (
        <EditCredentialForm cred={editing} config={config} onSave={handleSave} onCancel={() => setEditing(null)} saving={saving} />
      )}

      {error && (
        <div role="alert" style={{ background: colors.errorLight, color: colors.errorDark, padding: `${spacing.sm}px ${spacing.lg}px`, borderRadius: radius.md, fontSize: fontSize.sm, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <AlertCircle size={14} /> {error}
          <Btn small ghost onClick={() => setError(null)} style={{ marginLeft: 'auto' }}><X size={12} /></Btn>
        </div>
      )}

      {/* Summary strip */}
      <Card style={{ marginBottom: spacing.lg, background: `linear-gradient(135deg, ${colors.primaryLightest}, ${colors.surfaceHover})`, borderColor: colors.primaryLighter }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md }}>
          <div>
            <div style={{ fontSize: fontSize.sm, color: colors.primary, fontWeight: fontWeight.semibold, marginBottom: 2 }}>
              How credentials work
            </div>
            <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 1.5 }}>
              Click <strong>Configure</strong> on any service to enter API keys. After saving, we'll automatically verify the connection.
              You can also send a <strong>Setup Link</strong> to your client so they can connect their own accounts.
            </div>
          </div>
          <div style={{ display: 'flex', gap: spacing.xl, textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: connected === creds.length ? colors.success : colors.warning }}>{connected}/{creds.length}</div>
              <div style={{ fontSize: fontSize.micro, color: colors.textMuted }}>Connected</div>
            </div>
            <div>
              <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: avgHealth >= 75 ? colors.success : avgHealth >= 50 ? colors.warning : colors.error }}>{avgHealth}%</div>
              <div style={{ fontSize: fontSize.micro, color: colors.textMuted }}>Avg Health</div>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: spacing.md }}>
          {[1, 2, 3].map(i => <SkeletonCard key={i} rows={2} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: spacing.md }}>
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
