import { useState, useEffect, useCallback } from 'react';
import { Plus, Image, Send, Pause, Play, Trash2, ChevronLeft, Edit3, Globe, Target, DollarSign, Calendar, Eye } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions, shadows } from '../theme.js';
import { Card, SH, Badge, Btn, GradientBtn, Spin, Empty, Field, inputStyle } from '../components/index.jsx';

const selectStyle = { ...inputStyle, cursor: 'pointer' };

const OBJECTIVES = [
  { value: 'TRAFFIC', label: 'Traffic (Website Visits)', icon: '🌐' },
  { value: 'AWARENESS', label: 'Awareness (Reach)', icon: '📢' },
  { value: 'ENGAGEMENT', label: 'Engagement', icon: '💬' },
  { value: 'LEADS', label: 'Leads', icon: '📋' },
  { value: 'SALES', label: 'Sales', icon: '🛒' },
];

const CTA_OPTIONS = [
  'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'GET_OFFER',
  'BOOK_NOW', 'APPLY_NOW', 'DOWNLOAD', 'WATCH_MORE', 'GET_QUOTE', 'SUBSCRIBE',
];

const STATUS_COLORS = {
  draft: { bg: colors.surfaceHover, color: colors.textSecondary },
  active: { bg: colors.successLight, color: colors.successDark },
  paused: { bg: colors.warningLight, color: colors.warningDark },
  completed: { bg: '#E0E7FF', color: '#3730A3' },
  failed: { bg: colors.errorLight, color: colors.errorDark },
  archived: { bg: colors.surfaceHover, color: colors.textMuted },
  pending_approval: { bg: colors.warningLight, color: colors.warningDark },
};

function formatCurrency(cents, currency = 'ILS') {
  if (!cents && cents !== 0) return '--';
  const symbols = { ILS: '\u20AA', USD: '$', EUR: '\u20AC', GBP: '\u00A3' };
  return `${symbols[currency] || currency} ${(cents / 100).toFixed(0)}`;
}

// ── Campaign List View ───────────────────────────────────────────
function CampaignList({ campaigns, onSelect, onCreate, loading }) {
  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <div>
          <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.black, color: colors.text }}>Campaigns</div>
          <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 }}>
            Create and manage ad campaigns for Meta (Facebook + Instagram) and Google Ads
          </div>
        </div>
        <GradientBtn onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> New Campaign
        </GradientBtn>
      </div>

      {campaigns.length === 0 ? (
        <Empty icon="📣" title="No campaigns yet" subtitle="Create your first campaign to start advertising on Facebook, Instagram, or Google Ads" />
      ) : (
        <div style={{ display: 'grid', gap: spacing.md }}>
          {campaigns.map(c => {
            const sc = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
            const platforms = c.platforms || [];
            return (
              <Card key={c.id} style={{ cursor: 'pointer', transition: transitions.fast, border: `1px solid ${colors.border}` }}
                onClick={() => onSelect(c.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs }}>
                      <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>{c.name}</span>
                      <Badge text={c.status} color={sc.color} bg={sc.bg} />
                    </div>
                    <div style={{ display: 'flex', gap: spacing.lg, fontSize: fontSize.sm, color: colors.textSecondary, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Target size={12} />
                        {OBJECTIVES.find(o => o.value === c.objective)?.label || c.objective}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {platforms.includes('facebook') && '📘'}
                        {platforms.includes('instagram') && '📸'}
                        {platforms.includes('google_ads') && '💰'}
                        {platforms.join(', ')}
                      </span>
                      {c.daily_budget_cents && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <DollarSign size={12} />
                          {formatCurrency(c.daily_budget_cents, c.currency)}/day
                        </span>
                      )}
                      <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                        {c.creatives_count || 0} creative{c.creatives_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <ChevronLeft size={16} style={{ color: colors.textMuted, transform: 'rotate(180deg)' }} />
                </div>
                {/* Performance summary if active */}
                {c.performance && c.performance.impressions > 0 && (
                  <div style={{
                    display: 'flex', gap: spacing.xl, marginTop: spacing.md,
                    padding: spacing.sm, background: colors.surfaceHover, borderRadius: radius.sm,
                    fontSize: fontSize.xs, color: colors.textSecondary,
                  }}>
                    <span><strong>{(c.performance.impressions || 0).toLocaleString()}</strong> impressions</span>
                    <span><strong>{(c.performance.clicks || 0).toLocaleString()}</strong> clicks</span>
                    <span><strong>{formatCurrency(c.performance.spend_cents, c.currency)}</strong> spent</span>
                    {c.performance.ctr && <span>CTR: <strong>{(c.performance.ctr * 100).toFixed(2)}%</strong></span>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Creative Editor ──────────────────────────────────────────────
function CreativeEditor({ creative, onSave, onDelete, campaignId, clientId }) {
  const [form, setForm] = useState({
    headline: creative?.headline || '',
    primary_text: creative?.primary_text || '',
    description: creative?.description || '',
    call_to_action: creative?.call_to_action || 'LEARN_MORE',
    destination_url: creative?.destination_url || '',
    image_url: creative?.image_url || '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        const resp = await api(`/clients/${clientId}/campaigns/${campaignId}/upload-image`, {
          method: 'POST',
          body: { image_base64: base64, filename: file.name, content_type: file.type },
        });
        setForm(f => ({ ...f, image_url: resp.image_url }));
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('Upload failed: ' + err.message);
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(form);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  return (
    <Card style={{ border: `1px solid ${colors.border}`, marginBottom: spacing.md }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
        {/* Left: Text fields */}
        <div>
          <Field label="Headline">
            <input style={inputStyle} placeholder="Your ad headline..." value={form.headline}
              onChange={e => setForm(f => ({ ...f, headline: e.target.value }))} />
          </Field>
          <Field label="Primary Text (Ad Copy)">
            <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
              placeholder="Write your ad copy here..."
              value={form.primary_text}
              onChange={e => setForm(f => ({ ...f, primary_text: e.target.value }))} />
          </Field>
          <Field label="Description (optional)">
            <input style={inputStyle} placeholder="Link description..." value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.sm }}>
            <Field label="Call to Action">
              <select style={selectStyle} value={form.call_to_action}
                onChange={e => setForm(f => ({ ...f, call_to_action: e.target.value }))}>
                {CTA_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </Field>
            <Field label="Destination URL">
              <input style={inputStyle} placeholder="https://..." value={form.destination_url}
                onChange={e => setForm(f => ({ ...f, destination_url: e.target.value }))} />
            </Field>
          </div>
        </div>

        {/* Right: Image */}
        <div>
          <Field label="Ad Image">
            <div style={{
              border: `2px dashed ${colors.border}`, borderRadius: radius.md,
              minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: colors.surfaceHover, position: 'relative', overflow: 'hidden',
            }}>
              {form.image_url ? (
                <img src={form.image_url} alt="Ad preview" style={{
                  maxWidth: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: radius.sm,
                }} />
              ) : (
                <div style={{ textAlign: 'center', color: colors.textMuted }}>
                  <Image size={32} style={{ marginBottom: spacing.xs }} />
                  <div style={{ fontSize: fontSize.sm }}>Click to upload image</div>
                  <div style={{ fontSize: fontSize.xs }}>Recommended: 1200x628px</div>
                </div>
              )}
              <input type="file" accept="image/*"
                onChange={handleImageUpload}
                style={{
                  position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer',
                }} />
              {uploading && (
                <div style={{
                  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Spin />
                </div>
              )}
            </div>
          </Field>
          {form.image_url && (
            <Field label="Image URL">
              <input style={{ ...inputStyle, fontSize: fontSize.xs }} value={form.image_url} readOnly />
            </Field>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'flex-end' }}>
        {onDelete && (
          <Btn color="danger" onClick={onDelete} style={{ marginRight: 'auto' }}>
            <Trash2 size={12} /> Remove
          </Btn>
        )}
        <GradientBtn onClick={handleSave} disabled={saving}>
          {saving ? <Spin /> : 'Save Creative'}
        </GradientBtn>
      </div>
    </Card>
  );
}

// ── Campaign Detail View ─────────────────────────────────────────
function CampaignDetail({ campaignId, clientId, onBack }) {
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/clients/${clientId}/campaigns/${campaignId}`);
      setCampaign(data);
      setForm({
        name: data.name,
        objective: data.objective,
        platforms: data.platforms || ['facebook', 'instagram'],
        daily_budget_cents: data.daily_budget_cents || '',
        currency: data.currency || 'ILS',
        start_date: data.start_date || '',
        end_date: data.end_date || '',
        targeting: data.targeting || {},
        notes: data.notes || '',
      });
    } catch (e) { alert(e.message); }
    setLoading(false);
  }, [clientId, campaignId]);

  useEffect(() => { load(); }, [load]);

  const handleSaveSettings = async () => {
    try {
      await api(`/clients/${clientId}/campaigns/${campaignId}`, {
        method: 'PATCH', body: form,
      });
      setEditing(false);
      await load();
    } catch (e) { alert(e.message); }
  };

  const handleAddCreative = async (creativeData) => {
    await api(`/clients/${clientId}/campaigns/${campaignId}/creatives`, {
      method: 'POST', body: creativeData,
    });
    await load();
  };

  const handleUpdateCreative = async (creativeId, creativeData) => {
    await api(`/clients/${clientId}/campaigns/${campaignId}/creatives/${creativeId}`, {
      method: 'PATCH', body: creativeData,
    });
    await load();
  };

  const handleDeleteCreative = async (creativeId) => {
    if (!confirm('Remove this creative?')) return;
    await api(`/clients/${clientId}/campaigns/${campaignId}/creatives/${creativeId}`, { method: 'DELETE' });
    await load();
  };

  const handlePublish = async () => {
    if (!confirm('Publish this campaign to Meta Ads? It will be created as PAUSED.')) return;
    setPublishing(true);
    try {
      const resp = await api(`/clients/${clientId}/campaigns/${campaignId}/publish-meta`, { method: 'POST' });
      alert(resp.message || 'Published successfully!');
      await load();
    } catch (e) { alert('Publish failed: ' + e.message); }
    setPublishing(false);
  };

  const handleToggleStatus = async (action) => {
    setToggling(true);
    try {
      await api(`/clients/${clientId}/campaigns/${campaignId}/meta-status`, {
        method: 'POST', body: { action },
      });
      await load();
    } catch (e) { alert(e.message); }
    setToggling(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      await api(`/clients/${clientId}/campaigns/${campaignId}`, { method: 'DELETE' });
      onBack();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>;
  if (!campaign) return <Empty icon="!" title="Campaign not found" />;

  const sc = STATUS_COLORS[campaign.status] || STATUS_COLORS.draft;
  const isDraft = campaign.status === 'draft' || campaign.status === 'failed';
  const isActive = campaign.status === 'active';
  const isPaused = campaign.status === 'paused';

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: spacing.xs,
          color: colors.textSecondary, display: 'flex',
        }}>
          <ChevronLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <span style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.black, color: colors.text }}>
              {campaign.name}
            </span>
            <Badge text={campaign.status} color={sc.color} bg={sc.bg} />
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
            Created {new Date(campaign.created_at).toLocaleDateString()}
            {campaign.published_at && ` | Published ${new Date(campaign.published_at).toLocaleDateString()}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: spacing.sm }}>
          {isDraft && campaign.creatives?.length > 0 && (
            <GradientBtn onClick={handlePublish} disabled={publishing}>
              {publishing ? <Spin /> : <><Send size={13} /> Publish to Meta</>}
            </GradientBtn>
          )}
          {isActive && (
            <Btn onClick={() => handleToggleStatus('pause')} disabled={toggling}>
              <Pause size={13} /> Pause
            </Btn>
          )}
          {isPaused && (
            <GradientBtn onClick={() => handleToggleStatus('activate')} disabled={toggling}>
              <Play size={13} /> Activate
            </GradientBtn>
          )}
          {isDraft && (
            <Btn color="danger" onClick={handleDelete}>
              <Trash2 size={13} /> Delete
            </Btn>
          )}
        </div>
      </div>

      {/* Campaign Settings */}
      <Card style={{ marginBottom: spacing.lg, border: `1px solid ${colors.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <h3 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
            Campaign Settings
          </h3>
          {isDraft && (
            <Btn onClick={() => editing ? handleSaveSettings() : setEditing(true)}>
              <Edit3 size={12} /> {editing ? 'Save' : 'Edit'}
            </Btn>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: spacing.md }}>
          <Field label="Campaign Name">
            {editing ? (
              <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            ) : (
              <div style={{ fontSize: fontSize.md, color: colors.text }}>{campaign.name}</div>
            )}
          </Field>

          <Field label="Objective">
            {editing ? (
              <select style={selectStyle} value={form.objective} onChange={e => setForm(f => ({ ...f, objective: e.target.value }))}>
                {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: fontSize.md, color: colors.text }}>
                {OBJECTIVES.find(o => o.value === campaign.objective)?.icon}{' '}
                {OBJECTIVES.find(o => o.value === campaign.objective)?.label || campaign.objective}
              </div>
            )}
          </Field>

          <Field label="Platforms">
            {editing ? (
              <div style={{ display: 'flex', gap: spacing.sm }}>
                {[
                  { value: 'facebook', label: '📘 Facebook' },
                  { value: 'instagram', label: '📸 Instagram' },
                  { value: 'google_ads', label: '💰 Google Ads' },
                ].map(p => (
                  <label key={p.value} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '6px 12px', borderRadius: radius.md,
                    border: `2px solid ${form.platforms?.includes(p.value) ? colors.primary : colors.border}`,
                    background: form.platforms?.includes(p.value) ? colors.primaryLightest : colors.surface,
                    cursor: 'pointer', fontSize: fontSize.sm,
                  }}>
                    <input type="checkbox" checked={form.platforms?.includes(p.value) || false}
                      onChange={e => {
                        const next = e.target.checked
                          ? [...(form.platforms || []), p.value]
                          : (form.platforms || []).filter(x => x !== p.value);
                        setForm(f => ({ ...f, platforms: next }));
                      }}
                      style={{ display: 'none' }}
                    />
                    {p.label}
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: spacing.xs }}>
                {(campaign.platforms || []).map(p => (
                  <span key={p} style={{
                    padding: '4px 10px', borderRadius: radius.sm,
                    background: colors.primaryLightest, color: colors.primary,
                    fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                  }}>
                    {p === 'facebook' ? '📘 Facebook' : p === 'instagram' ? '📸 Instagram' : '💰 Google Ads'}
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Daily Budget">
            {editing ? (
              <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                <select style={{ ...selectStyle, width: 80 }} value={form.currency}
                  onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                  <option value="ILS">ILS</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
                <input style={inputStyle} type="number" placeholder="e.g. 40"
                  value={form.daily_budget_cents ? form.daily_budget_cents / 100 : ''}
                  onChange={e => setForm(f => ({ ...f, daily_budget_cents: Math.round(parseFloat(e.target.value || 0) * 100) }))} />
                <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>/day</span>
              </div>
            ) : (
              <div style={{ fontSize: fontSize.md, color: colors.text }}>
                {formatCurrency(campaign.daily_budget_cents, campaign.currency)}/day
              </div>
            )}
          </Field>

          <Field label="Start Date">
            {editing ? (
              <input style={inputStyle} type="date" value={form.start_date || ''}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            ) : (
              <div style={{ fontSize: fontSize.md, color: colors.text }}>
                {campaign.start_date || 'Not set'}
              </div>
            )}
          </Field>

          <Field label="End Date">
            {editing ? (
              <input style={inputStyle} type="date" value={form.end_date || ''}
                onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            ) : (
              <div style={{ fontSize: fontSize.md, color: colors.text }}>
                {campaign.end_date || 'Ongoing'}
              </div>
            )}
          </Field>
        </div>

        {editing && (
          <Field label="Notes">
            <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
              placeholder="Internal notes about this campaign..."
              value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        )}

        {/* Meta IDs (when published) */}
        {campaign.meta_campaign_id && (
          <div style={{
            marginTop: spacing.md, padding: spacing.sm,
            background: colors.surfaceHover, borderRadius: radius.sm,
            fontSize: fontSize.xs, color: colors.textMuted,
          }}>
            Meta Campaign: {campaign.meta_campaign_id}
            {campaign.meta_adset_id && ` | Ad Set: ${campaign.meta_adset_id}`}
            {campaign.meta_ad_id && ` | Ad: ${campaign.meta_ad_id}`}
          </div>
        )}
      </Card>

      {/* Creatives */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <h3 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
            Ad Creatives ({campaign.creatives?.length || 0})
          </h3>
        </div>

        {(campaign.creatives || []).map(cr => (
          <CreativeEditor
            key={cr.id}
            creative={cr}
            campaignId={campaignId}
            clientId={clientId}
            onSave={(data) => handleUpdateCreative(cr.id, data)}
            onDelete={() => handleDeleteCreative(cr.id)}
          />
        ))}

        {/* New creative form */}
        <div style={{ marginTop: spacing.md }}>
          <div style={{
            fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.textSecondary,
            marginBottom: spacing.sm,
          }}>
            Add New Creative
          </div>
          <CreativeEditor
            campaignId={campaignId}
            clientId={clientId}
            onSave={handleAddCreative}
          />
        </div>
      </div>

      {/* Performance (when has data) */}
      {campaign.snapshots?.length > 0 && (
        <Card style={{ border: `1px solid ${colors.border}` }}>
          <h3 style={{ margin: 0, marginBottom: spacing.md, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
            Performance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: spacing.md }}>
            {['impressions', 'clicks', 'reach', 'spend_cents', 'ctr', 'link_clicks'].map(metric => {
              const total = campaign.snapshots.reduce((s, snap) => s + (snap[metric] || 0), 0);
              const label = metric.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
              return (
                <div key={metric} style={{
                  padding: spacing.md, background: colors.surfaceHover,
                  borderRadius: radius.md, textAlign: 'center',
                }}>
                  <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.black, color: colors.text, marginTop: 4 }}>
                    {metric === 'spend_cents' ? formatCurrency(total, campaign.currency)
                      : metric === 'ctr' ? `${(total * 100).toFixed(2)}%`
                      : total.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── New Campaign Modal ───────────────────────────────────────────
function NewCampaignForm({ clientId, onCreated, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    objective: 'TRAFFIC',
    platforms: ['facebook', 'instagram'],
    daily_budget_cents: 4000, // 40 ILS default
    currency: 'ILS',
  });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) return alert('Campaign name is required');
    setCreating(true);
    try {
      const resp = await api(`/clients/${clientId}/campaigns`, { method: 'POST', body: form });
      onCreated(resp.id);
    } catch (e) { alert(e.message); }
    setCreating(false);
  };

  return (
    <Card style={{ border: `2px solid ${colors.primary}`, maxWidth: 600 }}>
      <h3 style={{ margin: 0, marginBottom: spacing.lg, fontSize: fontSize.xl, fontWeight: fontWeight.black, color: colors.text }}>
        New Campaign
      </h3>

      <Field label="Campaign Name *">
        <input style={inputStyle} placeholder="e.g. Homie Finance - Website Traffic"
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
      </Field>

      <Field label="Objective">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: spacing.xs }}>
          {OBJECTIVES.map(o => (
            <button key={o.value} onClick={() => setForm(f => ({ ...f, objective: o.value }))}
              style={{
                padding: '10px 12px', borderRadius: radius.md, cursor: 'pointer',
                border: `2px solid ${form.objective === o.value ? colors.primary : colors.border}`,
                background: form.objective === o.value ? colors.primaryLightest : colors.surface,
                color: form.objective === o.value ? colors.primary : colors.text,
                fontSize: fontSize.sm, fontWeight: form.objective === o.value ? fontWeight.bold : fontWeight.medium,
                textAlign: 'left', transition: transitions.fast,
              }}>
              {o.icon} {o.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Platforms">
        <div style={{ display: 'flex', gap: spacing.sm }}>
          {[
            { value: 'facebook', label: '📘 Facebook' },
            { value: 'instagram', label: '📸 Instagram' },
            { value: 'google_ads', label: '💰 Google Ads' },
          ].map(p => (
            <label key={p.value} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '8px 16px', borderRadius: radius.md, cursor: 'pointer',
              border: `2px solid ${form.platforms.includes(p.value) ? colors.primary : colors.border}`,
              background: form.platforms.includes(p.value) ? colors.primaryLightest : colors.surface,
              fontSize: fontSize.sm, fontWeight: form.platforms.includes(p.value) ? fontWeight.bold : fontWeight.medium,
              transition: transitions.fast,
            }}>
              <input type="checkbox" checked={form.platforms.includes(p.value)}
                onChange={e => {
                  const next = e.target.checked
                    ? [...form.platforms, p.value]
                    : form.platforms.filter(x => x !== p.value);
                  setForm(f => ({ ...f, platforms: next }));
                }}
                style={{ display: 'none' }}
              />
              {p.label}
            </label>
          ))}
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
        <Field label="Daily Budget">
          <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
            <select style={{ ...selectStyle, width: 80 }} value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
              <option value="ILS">ILS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <input style={inputStyle} type="number" placeholder="40"
              value={form.daily_budget_cents / 100}
              onChange={e => setForm(f => ({ ...f, daily_budget_cents: Math.round(parseFloat(e.target.value || 0) * 100) }))} />
          </div>
        </Field>
      </div>

      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.lg, justifyContent: 'flex-end' }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <GradientBtn onClick={handleCreate} disabled={creating}>
          {creating ? <Spin /> : <><Plus size={13} /> Create Campaign</>}
        </GradientBtn>
      </div>
    </Card>
  );
}

// ── Main Campaigns View ──────────────────────────────────────────
export default function CampaignsView({ clientId }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const data = await api(`/clients/${clientId}/campaigns`);
      setCampaigns(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  if (!clientId) return <Empty icon="📣" title="Select a client" subtitle="Choose a client from the sidebar to manage campaigns" />;

  if (selectedId) {
    return <CampaignDetail campaignId={selectedId} clientId={clientId} onBack={() => { setSelectedId(null); load(); }} />;
  }

  if (creating) {
    return <NewCampaignForm clientId={clientId}
      onCreated={(id) => { setCreating(false); setSelectedId(id); }}
      onCancel={() => setCreating(false)} />;
  }

  return <CampaignList campaigns={campaigns} loading={loading}
    onSelect={setSelectedId} onCreate={() => setCreating(true)} />;
}
