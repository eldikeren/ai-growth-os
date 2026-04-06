// ─── AI Growth OS — Website Access View (Editable) ───────────────
import { useState, useEffect } from 'react';
import { Globe, RefreshCw, Edit3, Check, X, Link2, ExternalLink } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, transitions } from '../theme.js';
import { Card, Btn, SH, Spin, Empty, KpiCard, Dot, SkeletonKpi, SkeletonCard, Field, inputStyle, selectStyle } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

const connColor = (status) => status === 'connected' ? colors.success : colors.textDisabled;

// ─── Editable Section ──────────────────────────────────────────
function EditableSection({ icon, title, children, status, onEdit, editing }) {
  return (
    <Card style={{ marginBottom: spacing.md, borderColor: editing ? colors.primary : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>{icon} {title}</div>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          {status && <span style={{ fontSize: fontSize.xs, color: connColor(status), fontWeight: fontWeight.semibold }}>{status}</span>}
          {!editing && onEdit && <Btn small secondary onClick={onEdit} ariaLabel={`Edit ${title}`}><Edit3 size={11} /> Edit</Btn>}
        </div>
      </div>
      {children}
    </Card>
  );
}

// ─── Access Level Editor ─────────────────────────────────────────
function AccessLevelEditor({ current, websiteId, onSaved }) {
  const [level, setLevel] = useState(current || 'read_only');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/website/${websiteId}/policy`, { method: 'POST', body: { current_access_level: level } });
      onSaved();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
      <Field label="Access Level" htmlFor="access-level">
        <select id="access-level" value={level} onChange={e => setLevel(e.target.value)} style={selectStyle}>
          <option value="read_only">Read Only</option>
          <option value="read_write">Read & Write</option>
          <option value="full_access">Full Access</option>
        </select>
      </Field>
      <Btn onClick={save} disabled={saving} small style={{ marginTop: 16 }}>{saving ? <Spin /> : <Check size={12} />} Save</Btn>
    </div>
  );
}

// ─── Git Editor ──────────────────────────────────────────────────
function GitEditor({ git, websiteId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    provider: git?.provider || 'github',
    repo_owner: git?.repo_owner || '',
    repo_name: git?.repo_name || '',
    production_branch: git?.production_branch || 'main',
    access_mode: git?.access_mode || 'token',
    git_token: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/website/${websiteId}/git`, { method: 'POST', body: form });
      onSaved();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.sm }}>
        <Field label="Provider" htmlFor="git-provider">
          <select id="git-provider" value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))} style={selectStyle}>
            <option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="bitbucket">Bitbucket</option>
          </select>
        </Field>
        <Field label="Repo Owner" htmlFor="git-owner">
          <input id="git-owner" value={form.repo_owner} onChange={e => setForm(p => ({ ...p, repo_owner: e.target.value }))} style={inputStyle} placeholder="username or org" />
        </Field>
        <Field label="Repo Name" htmlFor="git-repo">
          <input id="git-repo" value={form.repo_name} onChange={e => setForm(p => ({ ...p, repo_name: e.target.value }))} style={inputStyle} placeholder="my-website" />
        </Field>
        <Field label="Branch" htmlFor="git-branch">
          <input id="git-branch" value={form.production_branch} onChange={e => setForm(p => ({ ...p, production_branch: e.target.value }))} style={inputStyle} placeholder="main" />
        </Field>
      </div>
      <Field label="Access Token" htmlFor="git-token" hint="Personal access token or deploy key">
        <input id="git-token" type="password" value={form.git_token} onChange={e => setForm(p => ({ ...p, git_token: e.target.value }))} style={inputStyle} placeholder="ghp_xxxxxxxxxxxx" />
      </Field>
      <div style={{ display: 'flex', gap: spacing.sm }}>
        <Btn onClick={save} disabled={saving}>{saving ? <Spin /> : <Check size={13} />} Save Git</Btn>
        <Btn secondary onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ─── CMS Editor ──────────────────────────────────────────────────
function CmsEditor({ cms, websiteId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    cms_type: cms?.cms_type || 'wordpress',
    admin_url: cms?.admin_url || '',
    api_enabled: cms?.api_enabled ?? true,
    cms_username: '',
    cms_password: '',
    cms_api_token: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/website/${websiteId}/cms`, { method: 'POST', body: form });
      onSaved();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: spacing.sm }}>
        <Field label="CMS Type" htmlFor="cms-type">
          <select id="cms-type" value={form.cms_type} onChange={e => setForm(p => ({ ...p, cms_type: e.target.value }))} style={selectStyle}>
            <option value="wordpress">WordPress</option><option value="wix">Wix</option><option value="shopify">Shopify</option><option value="squarespace">Squarespace</option><option value="custom">Custom</option>
          </select>
        </Field>
        <Field label="Admin URL" htmlFor="cms-admin">
          <input id="cms-admin" value={form.admin_url} onChange={e => setForm(p => ({ ...p, admin_url: e.target.value }))} style={inputStyle} placeholder="https://example.com/wp-admin" />
        </Field>
        <Field label="Username" htmlFor="cms-user">
          <input id="cms-user" value={form.cms_username} onChange={e => setForm(p => ({ ...p, cms_username: e.target.value }))} style={inputStyle} placeholder="admin" />
        </Field>
        <Field label="Password" htmlFor="cms-pass">
          <input id="cms-pass" type="password" value={form.cms_password} onChange={e => setForm(p => ({ ...p, cms_password: e.target.value }))} style={inputStyle} placeholder="Enter password..." />
        </Field>
      </div>
      <Field label="API Token (optional)" htmlFor="cms-api">
        <input id="cms-api" type="password" value={form.cms_api_token} onChange={e => setForm(p => ({ ...p, cms_api_token: e.target.value }))} style={inputStyle} placeholder="wp_xxxxxxxxxxxx" />
      </Field>
      <div style={{ display: 'flex', gap: spacing.sm }}>
        <Btn onClick={save} disabled={saving}>{saving ? <Spin /> : <Check size={13} />} Save CMS</Btn>
        <Btn secondary onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ─── Server Editor ───────────────────────────────────────────────
function ServerEditor({ server, websiteId, onSaved, onCancel }) {
  const [form, setForm] = useState({
    access_type: server?.access_type || 'ssh',
    host: server?.host || '',
    port: server?.port || 22,
    username: server?.username || '',
    site_root_path: server?.site_root_path || '/var/www/html',
    server_password: '',
    ssh_private_key: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api(`/website/${websiteId}/server`, { method: 'POST', body: form });
      onSaved();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: spacing.sm }}>
        <Field label="Access Type" htmlFor="srv-type">
          <select id="srv-type" value={form.access_type} onChange={e => setForm(p => ({ ...p, access_type: e.target.value }))} style={selectStyle}>
            <option value="ssh">SSH</option><option value="sftp">SFTP</option><option value="ftp">FTP</option><option value="cpanel">cPanel</option>
          </select>
        </Field>
        <Field label="Host" htmlFor="srv-host">
          <input id="srv-host" value={form.host} onChange={e => setForm(p => ({ ...p, host: e.target.value }))} style={inputStyle} placeholder="server.example.com" />
        </Field>
        <Field label="Port" htmlFor="srv-port">
          <input id="srv-port" type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: e.target.value }))} style={inputStyle} />
        </Field>
        <Field label="Username" htmlFor="srv-user">
          <input id="srv-user" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} style={inputStyle} placeholder="root" />
        </Field>
      </div>
      <Field label="Site Root Path" htmlFor="srv-root">
        <input id="srv-root" value={form.site_root_path} onChange={e => setForm(p => ({ ...p, site_root_path: e.target.value }))} style={inputStyle} placeholder="/var/www/html" />
      </Field>
      <Field label="Password or SSH Private Key" htmlFor="srv-pass" hint="Enter password for basic auth, or paste SSH private key for key-based auth">
        <textarea id="srv-pass" value={form.ssh_private_key || form.server_password}
          onChange={e => setForm(p => ({ ...p, ssh_private_key: e.target.value, server_password: e.target.value }))}
          rows={3} style={{ ...inputStyle, fontFamily: 'monospace', fontSize: fontSize.xs, resize: 'vertical' }} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
      </Field>
      <div style={{ display: 'flex', gap: spacing.sm }}>
        <Btn onClick={save} disabled={saving}>{saving ? <Spin /> : <Check size={13} />} Save Server</Btn>
        <Btn secondary onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ─── Safety Policy Editor ────────────────────────────────────────
function SafetyPolicyGrid({ pol, websiteId, onSaved }) {
  const [form, setForm] = useState({ ...pol });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  const items = [
    ['allow_analysis', 'Analysis'],
    ['allow_content_edits', 'Content Edits'],
    ['allow_code_changes', 'Code Changes'],
    ['allow_direct_production_changes', 'Direct Publish'],
    ['require_pr', 'Require PR'],
    ['require_staging_first', 'Staging First'],
    ['require_manual_approval_before_publish', 'Manual Approval'],
    ['allow_autonomous_safe_changes', 'Auto Safe Changes'],
  ];

  const save = async () => {
    setSaving(true);
    try {
      await api(`/website/${websiteId}/policy`, { method: 'POST', body: form });
      onSaved();
      setEditing(false);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
        <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold }}>Safety Policy</div>
        {!editing ? (
          <Btn small secondary onClick={() => setEditing(true)}><Edit3 size={11} /> Edit</Btn>
        ) : (
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Btn small onClick={save} disabled={saving}>{saving ? <Spin /> : <Check size={11} />} Save</Btn>
            <Btn small secondary onClick={() => { setForm({ ...pol }); setEditing(false); }}><X size={11} /></Btn>
          </div>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: spacing.sm, fontSize: fontSize.sm }} role="list">
        {items.map(([key, label]) => (
          <div key={key} role="listitem" onClick={editing ? () => setForm(p => ({ ...p, [key]: !p[key] })) : undefined}
            style={{
              padding: `${spacing.xs}px ${spacing.sm}px`,
              background: form[key] ? colors.successLight : colors.errorLight,
              borderRadius: radius.sm,
              color: form[key] ? colors.successDark : colors.errorDark,
              fontWeight: fontWeight.medium,
              cursor: editing ? 'pointer' : 'default',
              border: editing ? `1px dashed ${form[key] ? colors.success : colors.error}` : 'none',
              transition: transitions.fast,
            }}>
            {form[key] ? '\u2713' : '\u2717'} {label}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export default function WebsiteAccessView({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingSection, setEditingSection] = useState(null); // 'git' | 'cms' | 'server' | 'access'

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try { setData(await api(`/clients/${clientId}/website`)); }
    catch (e) { setData(null); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  const onSaved = () => { setEditingSection(null); load(); };

  if (!clientId) return <Empty icon={Globe} msg="Select a client to view website access" />;

  if (loading) {
    return (
      <div>
        <SH title="Website Access" sub="Loading..." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.md, marginBottom: spacing.lg }}>
          {[1, 2, 3, 4].map(k => <SkeletonKpi key={k} />)}
        </div>
        <SkeletonCard rows={3} />
      </div>
    );
  }

  if (!data || !data.website) {
    return (
      <div>
        <SH title="Website Access" sub="No website configured for this client yet." />
        <Card>
          <div style={{ textAlign: 'center', padding: spacing['5xl'], color: colors.textSecondary }}>
            <Globe size={40} style={{ marginBottom: spacing.lg, color: colors.primaryLight }} />
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.semibold, marginBottom: spacing.sm }}>No website configured</div>
            <div style={{ fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.xl }}>
              Send a <strong>Setup Link</strong> to the client so they can connect their website,
              or configure it manually using the Website Access Manager.
            </div>
            <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'center' }}>
              <a href="/website-access.html" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <Btn><ExternalLink size={13} /> Open Website Access Manager</Btn>
              </a>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { website: w, access_profile: ap, git: g, cms: cm, server: srv, policy: pol, validations } = data;
  const websiteId = w.id;

  return (
    <div>
      <SH
        title="Website Access"
        sub={`${w.primary_domain} \u00B7 ${w.website_platform_type || 'unknown'}`}
        action={<Btn small secondary onClick={load} ariaLabel="Refresh"><RefreshCw size={12} /></Btn>}
      />

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: spacing.md, marginBottom: spacing.lg }}>
        <KpiCard label="Access Level" value={ap?.current_access_level?.replace('_', ' ') || 'read only'} color={colors.primary} />
        <KpiCard label="Git" value={g?.connection_status || 'none'} color={connColor(g?.connection_status)} />
        <KpiCard label="CMS" value={cm?.connection_status || 'none'} color={connColor(cm?.connection_status)} />
        <KpiCard label="Server" value={srv?.connection_status || 'none'} color={connColor(srv?.connection_status)} />
      </div>

      {/* Access Level — always show edit option */}
      {websiteId && (
        <Card style={{ marginBottom: spacing.md }}>
          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, marginBottom: spacing.sm }}>Access Level</div>
          <AccessLevelEditor current={ap?.current_access_level} websiteId={websiteId} onSaved={onSaved} />
        </Card>
      )}

      {/* Git */}
      <EditableSection icon="📁" title={g ? `Git: ${g.provider} — ${g.repo_owner}/${g.repo_name}` : 'Git Connection'} status={g?.connection_status} onEdit={editingSection !== 'git' ? () => setEditingSection('git') : null} editing={editingSection === 'git'}>
        {editingSection === 'git' ? (
          <GitEditor git={g} websiteId={websiteId} onSaved={onSaved} onCancel={() => setEditingSection(null)} />
        ) : g ? (
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
            Branch: {g.production_branch} &middot; Mode: {g.access_mode} &middot; Status: <span style={{ color: connColor(g.connection_status), fontWeight: fontWeight.semibold }}>{g.connection_status}</span>
          </div>
        ) : (
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Not configured — click Edit to add Git connection</div>
        )}
      </EditableSection>

      {/* CMS */}
      <EditableSection icon="🖥" title={cm ? `CMS: ${cm.cms_type}` : 'CMS Connection'} status={cm?.connection_status} onEdit={editingSection !== 'cms' ? () => setEditingSection('cms') : null} editing={editingSection === 'cms'}>
        {editingSection === 'cms' ? (
          <CmsEditor cms={cm} websiteId={websiteId} onSaved={onSaved} onCancel={() => setEditingSection(null)} />
        ) : cm ? (
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
            Admin: {cm.admin_url || '\u2014'} &middot; API: {cm.api_enabled ? 'enabled' : 'disabled'} &middot; Status: <span style={{ color: connColor(cm.connection_status), fontWeight: fontWeight.semibold }}>{cm.connection_status}</span>
          </div>
        ) : (
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Not configured — click Edit to add CMS connection</div>
        )}
      </EditableSection>

      {/* Server */}
      <EditableSection icon="🔒" title={srv ? `Server: ${srv.access_type}` : 'Server Connection'} status={srv?.connection_status} onEdit={editingSection !== 'server' ? () => setEditingSection('server') : null} editing={editingSection === 'server'}>
        {editingSection === 'server' ? (
          <ServerEditor server={srv} websiteId={websiteId} onSaved={onSaved} onCancel={() => setEditingSection(null)} />
        ) : srv ? (
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>
            Host: {srv.host}:{srv.port} &middot; Root: {srv.site_root_path || '\u2014'} &middot; Status: <span style={{ color: connColor(srv.connection_status), fontWeight: fontWeight.semibold }}>{srv.connection_status}</span>
          </div>
        ) : (
          <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Not configured — click Edit to add server connection</div>
        )}
      </EditableSection>

      {/* Safety Policy */}
      {pol && <SafetyPolicyGrid pol={pol} websiteId={websiteId} onSaved={onSaved} />}

      {/* Validations */}
      {validations?.length > 0 && (
        <Card style={{ marginTop: spacing.md }}>
          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, marginBottom: spacing.sm }}>Recent Validations</div>
          {validations.slice(0, 5).map((v, i) => (
            <div key={i} style={{ fontSize: fontSize.sm, padding: `${spacing.xs}px 0`, borderBottom: `1px solid ${colors.borderLight}`, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                <Dot s={v.status === 'passed' ? 'success' : v.status === 'failed' ? 'failed' : 'pending'} />
                {v.validation_type}
              </span>
              <span style={{ color: colors.textDisabled, fontSize: fontSize.xs }}>{new Date(v.created_at).toLocaleString()}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
