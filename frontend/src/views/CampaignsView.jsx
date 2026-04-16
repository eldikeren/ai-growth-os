import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Image, Send, Pause, Play, Trash2, ChevronLeft, Edit3, Globe, Target,
  DollarSign, Calendar, Eye, Wand2, Search, X, Users, MapPin, Layers, ChevronDown, ChevronUp,
  AlertCircle, Megaphone,
} from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions, shadows } from '../theme.js';
import { Card, SH, Badge, Btn, GradientBtn, Spin, Empty, Field, inputStyle } from '../components/index.jsx';

const selectStyle = { ...inputStyle, cursor: 'pointer' };

const OBJECTIVES = [
  { value: 'TRAFFIC', label: 'Traffic (Website Visits)', icon: '🌐', desc: 'Drive visitors to your website' },
  { value: 'AWARENESS', label: 'Awareness (Reach)', icon: '📢', desc: 'Get seen by as many people as possible' },
  { value: 'ENGAGEMENT', label: 'Engagement', icon: '💬', desc: 'Get likes, comments, and shares' },
  { value: 'LEADS', label: 'Leads', icon: '📋', desc: 'Collect contact info from potential clients' },
  { value: 'SALES', label: 'Sales', icon: '🛒', desc: 'Drive purchases and conversions' },
];

const CTA_OPTIONS = [
  'LEARN_MORE', 'SHOP_NOW', 'SIGN_UP', 'CONTACT_US', 'GET_OFFER',
  'BOOK_NOW', 'APPLY_NOW', 'DOWNLOAD', 'WATCH_MORE', 'GET_QUOTE', 'SUBSCRIBE',
];

const COUNTRIES = [
  { code: 'IL', name: 'Israel' }, { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' }, { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' }, { code: 'BR', name: 'Brazil' },
  { code: 'IN', name: 'India' }, { code: 'JP', name: 'Japan' },
  { code: 'AE', name: 'UAE' }, { code: 'SA', name: 'Saudi Arabia' },
];

const LANGUAGES = [
  { key: 13, name: 'Hebrew' }, { key: 6, name: 'English (US)' },
  { key: 24, name: 'English (UK)' }, { key: 10, name: 'French' },
  { key: 4, name: 'German' }, { key: 28, name: 'Arabic' },
  { key: 16, name: 'Russian' }, { key: 23, name: 'Spanish' },
  { key: 37, name: 'Portuguese' }, { key: 20, name: 'Italian' },
];

const FB_POSITIONS = [
  { value: 'feed', label: 'Feed' },
  { value: 'right_hand_column', label: 'Right Column' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'video_feeds', label: 'Video Feeds' },
  { value: 'story', label: 'Stories' },
  { value: 'reels', label: 'Reels' },
];

const IG_POSITIONS = [
  { value: 'stream', label: 'Feed' },
  { value: 'story', label: 'Stories' },
  { value: 'explore', label: 'Explore' },
  { value: 'reels', label: 'Reels' },
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

const sectionHeaderStyle = {
  display: 'flex', alignItems: 'center', gap: spacing.sm,
  fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text,
  cursor: 'pointer', userSelect: 'none', padding: `${spacing.sm}px 0`,
};

// ── Collapsible Section ─────────────────────────────────────────
function Section({ title, icon, defaultOpen = true, children, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: spacing.md }}>
      <div onClick={() => setOpen(!open)} style={sectionHeaderStyle}>
        {icon}
        <span>{title}</span>
        {badge && <Badge text={badge} color={colors.primary} bg={colors.primaryLightest} />}
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </div>
      {open && <div style={{ paddingTop: spacing.sm }}>{children}</div>}
    </div>
  );
}

// ── Interest Search Input ───────────────────────────────────────
function InterestSearch({ clientId, value = [], onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);

  const doSearch = async (q) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await api(`/clients/${clientId}/meta/interests?q=${encodeURIComponent(q)}`);
      setResults(data || []);
    } catch { setResults([]); }
    setSearching(false);
  };

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(q), 400);
  };

  const addInterest = (interest) => {
    if (!value.find(i => i.id === interest.id)) {
      onChange([...value, { id: interest.id, name: interest.name }]);
    }
    setQuery('');
    setResults([]);
  };

  const removeInterest = (id) => {
    onChange(value.filter(i => i.id !== id));
  };

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <Search size={14} style={{ color: colors.textMuted }} />
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Search interests (e.g. Finance, Real Estate, Law...)"
            value={query}
            onChange={handleInput}
          />
          {searching && <Spin />}
        </div>
        {results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
            background: colors.surface, border: `1px solid ${colors.border}`,
            borderRadius: radius.md, boxShadow: shadows.lg, maxHeight: 240, overflow: 'auto',
          }}>
            {results.map(r => (
              <div key={r.id}
                onClick={() => addInterest(r)}
                style={{
                  padding: `${spacing.sm}px ${spacing.md}px`, cursor: 'pointer',
                  borderBottom: `1px solid ${colors.borderLight}`,
                  fontSize: fontSize.sm,
                  ':hover': { background: colors.surfaceHover },
                }}
                onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: fontWeight.medium }}>{r.name}</div>
                {r.audience_size_lower_bound && (
                  <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                    Audience: {r.audience_size_lower_bound?.toLocaleString()} - {r.audience_size_upper_bound?.toLocaleString()}
                    {r.topic ? ` · ${r.topic}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
          {value.map(i => (
            <span key={i.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: radius.full,
              background: colors.primaryLightest, color: colors.primary,
              fontSize: fontSize.xs, fontWeight: fontWeight.medium,
            }}>
              {i.name}
              <X size={12} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => removeInterest(i.id)} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Audience Targeting Editor ───────────────────────────────────
function TargetingEditor({ targeting, onChange, clientId }) {
  const t = targeting || {};

  const updateField = (key, value) => {
    onChange({ ...t, [key]: value });
  };

  const updateGeo = (field, value) => {
    const geo = t.geo_locations || { countries: ['IL'] };
    onChange({ ...t, geo_locations: { ...geo, [field]: value } });
  };

  const updatePlacements = (field, value) => {
    const pl = t.placements || { automatic: true };
    onChange({ ...t, placements: { ...pl, [field]: value } });
  };

  const toggleCountry = (code) => {
    const countries = t.geo_locations?.countries || ['IL'];
    const next = countries.includes(code)
      ? countries.filter(c => c !== code)
      : [...countries, code];
    updateGeo('countries', next);
  };

  const togglePosition = (platform, pos) => {
    const key = `${platform}_positions`;
    const current = t.placements?.[key] || [];
    const next = current.includes(pos) ? current.filter(p => p !== pos) : [...current, pos];
    updatePlacements(key, next);
  };

  const toggleLanguage = (lang) => {
    const langs = t.languages || [];
    const exists = langs.find(l => l.key === lang.key);
    const next = exists ? langs.filter(l => l.key !== lang.key) : [...langs, lang];
    updateField('languages', next);
  };

  const isAutoPlacement = t.placements?.automatic !== false;

  return (
    <div style={{ display: 'grid', gap: spacing.md }}>
      {/* Geographic Targeting */}
      <Section title="Location" icon={<MapPin size={16} color={colors.primary} />} badge={`${(t.geo_locations?.countries || ['IL']).length} countries`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs }}>
          {COUNTRIES.map(c => {
            const selected = (t.geo_locations?.countries || ['IL']).includes(c.code);
            return (
              <button key={c.code}
                onClick={() => toggleCountry(c.code)}
                style={{
                  padding: '6px 12px', borderRadius: radius.md, cursor: 'pointer',
                  border: `2px solid ${selected ? colors.primary : colors.border}`,
                  background: selected ? colors.primaryLightest : colors.surface,
                  color: selected ? colors.primary : colors.text,
                  fontSize: fontSize.xs, fontWeight: selected ? fontWeight.bold : fontWeight.normal,
                  transition: transitions.fast,
                }}>
                {c.name}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Demographics */}
      <Section title="Demographics" icon={<Users size={16} color={colors.primary} />}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.md }}>
          <Field label="Age Range">
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
              <input type="number" style={{ ...inputStyle, width: 70 }} min={13} max={65}
                value={t.age_min || 18}
                onChange={e => updateField('age_min', parseInt(e.target.value) || 18)} />
              <span style={{ color: colors.textMuted }}>to</span>
              <input type="number" style={{ ...inputStyle, width: 70 }} min={13} max={65}
                value={t.age_max || 65}
                onChange={e => updateField('age_max', parseInt(e.target.value) || 65)} />
            </div>
          </Field>
          <Field label="Gender">
            <select style={selectStyle} value={t.gender || 'all'}
              onChange={e => updateField('gender', e.target.value)}>
              <option value="all">All genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Languages">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {LANGUAGES.map(l => {
                const selected = (t.languages || []).find(x => x.key === l.key);
                return (
                  <button key={l.key} onClick={() => toggleLanguage(l)}
                    style={{
                      padding: '4px 8px', borderRadius: radius.sm, cursor: 'pointer',
                      border: `1px solid ${selected ? colors.primary : colors.border}`,
                      background: selected ? colors.primaryLightest : 'transparent',
                      color: selected ? colors.primary : colors.textSecondary,
                      fontSize: fontSize.xs, transition: transitions.fast,
                    }}>
                    {l.name}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      </Section>

      {/* Interests */}
      <Section title="Interests & Behaviors" icon={<Target size={16} color={colors.primary} />}
        badge={`${(t.interests || []).length} selected`}>
        <InterestSearch
          clientId={clientId}
          value={t.interests || []}
          onChange={v => updateField('interests', v)}
        />
        {(t.interests || []).length === 0 && (
          <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs, fontStyle: 'italic' }}>
            Search and add interests to narrow your audience. Leave empty for broad targeting.
          </div>
        )}
      </Section>

      {/* Placements */}
      <Section title="Placements" icon={<Layers size={16} color={colors.primary} />}
        badge={isAutoPlacement ? 'Automatic' : 'Manual'}>
        <div style={{ marginBottom: spacing.sm }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, cursor: 'pointer' }}>
            <input type="checkbox" checked={isAutoPlacement}
              onChange={e => updatePlacements('automatic', e.target.checked)}
              style={{ accentColor: colors.primary }} />
            <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.medium }}>
              Automatic placements (recommended)
            </span>
          </label>
          <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginLeft: 26 }}>
            Meta will optimize delivery across all available placements for best results.
          </div>
        </div>

        {!isAutoPlacement && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
            <div>
              <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs }}>
                📘 Facebook Positions
              </div>
              {FB_POSITIONS.map(p => (
                <label key={p.value} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: 4, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={(t.placements?.facebook_positions || []).includes(p.value)}
                    onChange={() => togglePosition('facebook', p.value)}
                    style={{ accentColor: colors.primary }} />
                  <span style={{ fontSize: fontSize.sm }}>{p.label}</span>
                </label>
              ))}
            </div>
            <div>
              <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: spacing.xs }}>
                📸 Instagram Positions
              </div>
              {IG_POSITIONS.map(p => (
                <label key={p.value} style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: 4, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={(t.placements?.instagram_positions || []).includes(p.value)}
                    onChange={() => togglePosition('instagram', p.value)}
                    style={{ accentColor: colors.primary }} />
                  <span style={{ fontSize: fontSize.sm }}>{p.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Campaign List View ───────────────────────────────────────────
function CampaignList({ campaigns, onSelect, onCreate, onAiSuggest, loading }) {
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
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <Btn onClick={onAiSuggest} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wand2 size={14} /> AI Suggest Campaign
          </Btn>
          <GradientBtn onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> New Campaign
          </GradientBtn>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
          <div style={{ fontSize: 48, marginBottom: spacing.md }}>📣</div>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs }}>
            No campaigns yet
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.lg }}>
            Create your first campaign manually or let AI suggest the best campaign setup based on your business
          </div>
          <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'center' }}>
            <Btn onClick={onAiSuggest}><Wand2 size={14} /> AI Suggest</Btn>
            <GradientBtn onClick={onCreate}><Plus size={14} /> Create Manually</GradientBtn>
          </div>
        </Card>
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

// ── Creative Editor (Single Image + Carousel) ───────────────────
function CreativeEditor({ creative, onSave, onDelete, campaignId, clientId }) {
  const [form, setForm] = useState({
    headline: creative?.headline || '',
    primary_text: creative?.primary_text || '',
    description: creative?.description || '',
    call_to_action: creative?.call_to_action || 'LEARN_MORE',
    destination_url: creative?.destination_url || '',
    image_url: creative?.image_url || '',
    format: creative?.format || 'single_image',
    images: creative?.images || [],
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];
          const resp = await api(`/clients/${clientId}/campaigns/${campaignId}/upload-image`, {
            method: 'POST',
            body: { image_base64: base64, filename: file.name, content_type: file.type },
          });
          resolve(resp);
        } catch (err) { reject(err); }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSingleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const resp = await uploadImage(file);
      setForm(f => ({ ...f, image_url: resp.image_url }));
    } catch (err) { alert('Upload failed: ' + err.message); }
    setUploading(false);
  };

  const handleCarouselImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploadedImages = [];
      for (const file of files) {
        const resp = await uploadImage(file);
        uploadedImages.push({
          url: resp.image_url,
          storage_path: resp.storage_path,
          headline: '',
          description: '',
          destination_url: '',
        });
      }
      setForm(f => ({ ...f, images: [...f.images, ...uploadedImages] }));
    } catch (err) { alert('Upload failed: ' + err.message); }
    setUploading(false);
    e.target.value = '';
  };

  const updateCarouselImage = (idx, field, value) => {
    setForm(f => ({
      ...f,
      images: f.images.map((img, i) => i === idx ? { ...img, [field]: value } : img),
    }));
  };

  const removeCarouselImage = (idx) => {
    setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };

  const moveImage = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= form.images.length) return;
    setForm(f => {
      const imgs = [...f.images];
      [imgs[idx], imgs[newIdx]] = [imgs[newIdx], imgs[idx]];
      return { ...f, images: imgs };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); }
    catch (e) { alert(e.message); }
    setSaving(false);
  };

  const isCarousel = form.format === 'carousel';

  return (
    <Card style={{ border: `1px solid ${colors.border}`, marginBottom: spacing.md }}>
      {/* Format Toggle */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md }}>
        {['single_image', 'carousel'].map(fmt => (
          <button key={fmt} onClick={() => setForm(f => ({ ...f, format: fmt }))}
            style={{
              padding: '8px 16px', borderRadius: radius.md, cursor: 'pointer',
              border: `2px solid ${form.format === fmt ? colors.primary : colors.border}`,
              background: form.format === fmt ? colors.primaryLightest : colors.surface,
              color: form.format === fmt ? colors.primary : colors.text,
              fontSize: fontSize.sm, fontWeight: form.format === fmt ? fontWeight.bold : fontWeight.medium,
              transition: transitions.fast,
            }}>
            {fmt === 'single_image' ? '🖼 Single Image' : '🎠 Carousel'}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isCarousel ? '1fr' : '1fr 1fr', gap: spacing.md }}>
        {/* Text fields */}
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

        {/* Image area - Single Image */}
        {!isCarousel && (
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
                <input type="file" accept="image/*" onChange={handleSingleImageUpload}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
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
          </div>
        )}
      </div>

      {/* Carousel Images */}
      {isCarousel && (
        <div style={{ marginTop: spacing.md }}>
          <Field label={`Carousel Cards (${form.images.length})`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: spacing.md }}>
              {form.images.map((img, idx) => (
                <div key={idx} style={{
                  border: `1px solid ${colors.border}`, borderRadius: radius.md,
                  overflow: 'hidden', background: colors.surface,
                }}>
                  <div style={{ position: 'relative', height: 140, background: colors.surfaceHover }}>
                    <img src={img.url} alt={`Card ${idx + 1}`} style={{
                      width: '100%', height: '100%', objectFit: 'cover',
                    }} />
                    <div style={{
                      position: 'absolute', top: 4, right: 4,
                      display: 'flex', gap: 2,
                    }}>
                      {idx > 0 && (
                        <button onClick={() => moveImage(idx, -1)}
                          style={{ background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}>
                          ◀
                        </button>
                      )}
                      {idx < form.images.length - 1 && (
                        <button onClick={() => moveImage(idx, 1)}
                          style={{ background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}>
                          ▶
                        </button>
                      )}
                      <button onClick={() => removeCarouselImage(idx)}
                        style={{ background: 'rgba(220,38,38,0.8)', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', padding: '2px 6px', fontSize: 11 }}>
                        ✕
                      </button>
                    </div>
                    <div style={{
                      position: 'absolute', bottom: 4, left: 4,
                      background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '2px 8px',
                      borderRadius: 4, fontSize: fontSize.xs,
                    }}>
                      {idx + 1}/{form.images.length}
                    </div>
                  </div>
                  <div style={{ padding: spacing.sm }}>
                    <input style={{ ...inputStyle, fontSize: fontSize.xs, marginBottom: 4 }}
                      placeholder="Card headline..."
                      value={img.headline || ''}
                      onChange={e => updateCarouselImage(idx, 'headline', e.target.value)} />
                    <input style={{ ...inputStyle, fontSize: fontSize.xs }}
                      placeholder="Card URL (optional)"
                      value={img.destination_url || ''}
                      onChange={e => updateCarouselImage(idx, 'destination_url', e.target.value)} />
                  </div>
                </div>
              ))}

              {/* Add more images */}
              <div style={{
                border: `2px dashed ${colors.border}`, borderRadius: radius.md,
                minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: colors.surfaceHover, position: 'relative', cursor: 'pointer',
              }}>
                <div style={{ textAlign: 'center', color: colors.textMuted }}>
                  <Plus size={28} style={{ marginBottom: spacing.xs }} />
                  <div style={{ fontSize: fontSize.sm }}>Add images</div>
                  <div style={{ fontSize: fontSize.xs }}>Min 2, max 10 cards</div>
                </div>
                <input type="file" accept="image/*" multiple
                  onChange={handleCarouselImageUpload}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                {uploading && (
                  <div style={{
                    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Spin />
                  </div>
                )}
              </div>
            </div>
          </Field>
        </div>
      )}

      <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md, justifyContent: 'flex-end' }}>
        {onDelete && (
          <Btn danger onClick={onDelete} style={{ marginRight: 'auto' }}>
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
  const [editingTargeting, setEditingTargeting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [suggestingAudience, setSuggestingAudience] = useState(false);
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
      setEditingTargeting(false);
      await load();
    } catch (e) { alert(e.message); }
  };

  const handleSuggestAudience = async () => {
    setSuggestingAudience(true);
    try {
      const resp = await api(`/clients/${clientId}/campaigns/${campaignId}/suggest-audience`, { method: 'POST' });
      if (resp?.success && resp.suggestion) {
        const s = resp.suggestion;
        setForm(f => ({
          ...f,
          targeting: {
            ...f.targeting,
            geo_locations: s.geo_locations || f.targeting.geo_locations,
            age_min: s.age_min || f.targeting.age_min,
            age_max: s.age_max || f.targeting.age_max,
            gender: s.gender || f.targeting.gender,
            interests: s.interests || f.targeting.interests,
            placements: s.placements || f.targeting.placements,
            languages: s.languages || f.targeting.languages,
          },
        }));
        setEditingTargeting(true);
        if (s.reasoning) alert(`AI Suggestion: ${s.reasoning}`);
      }
    } catch (e) { alert('AI suggestion failed: ' + e.message); }
    setSuggestingAudience(false);
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
  if (!campaign) return <Empty icon={AlertCircle} msg="Campaign not found" />;

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
            <Btn danger onClick={handleDelete}>
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

      {/* Audience Targeting */}
      <Card style={{ marginBottom: spacing.lg, border: `1px solid ${colors.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <h3 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <Users size={18} /> Audience Targeting
          </h3>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            {isDraft && (
              <>
                <Btn small onClick={handleSuggestAudience} disabled={suggestingAudience}>
                  {suggestingAudience ? <Spin /> : <><Wand2 size={12} /> AI Suggest</>}
                </Btn>
                <Btn small onClick={() => {
                  if (editingTargeting) handleSaveSettings();
                  else setEditingTargeting(true);
                }}>
                  <Edit3 size={12} /> {editingTargeting ? 'Save' : 'Edit'}
                </Btn>
              </>
            )}
          </div>
        </div>

        {editingTargeting ? (
          <TargetingEditor
            targeting={form.targeting}
            onChange={targeting => setForm(f => ({ ...f, targeting }))}
            clientId={clientId}
          />
        ) : (
          /* Read-only targeting summary */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: spacing.md }}>
            <div style={{ padding: spacing.md, background: colors.surfaceHover, borderRadius: radius.md }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Location</div>
              <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>
                {(campaign.targeting?.geo_locations?.countries || campaign.targeting?.geo || ['IL']).map(c =>
                  COUNTRIES.find(x => x.code === c)?.name || c
                ).join(', ')}
              </div>
            </div>
            <div style={{ padding: spacing.md, background: colors.surfaceHover, borderRadius: radius.md }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Age</div>
              <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>
                {campaign.targeting?.age_min || 18} - {campaign.targeting?.age_max || 65}
              </div>
            </div>
            <div style={{ padding: spacing.md, background: colors.surfaceHover, borderRadius: radius.md }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Gender</div>
              <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>
                {(campaign.targeting?.gender || 'all') === 'all' ? 'All' : campaign.targeting?.gender === 'male' ? 'Male' : 'Female'}
              </div>
            </div>
            <div style={{ padding: spacing.md, background: colors.surfaceHover, borderRadius: radius.md }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Interests</div>
              <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>
                {(campaign.targeting?.interests || []).length > 0
                  ? campaign.targeting.interests.map(i => i.name).join(', ')
                  : 'Broad (no specific interests)'}
              </div>
            </div>
            <div style={{ padding: spacing.md, background: colors.surfaceHover, borderRadius: radius.md }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Placements</div>
              <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>
                {campaign.targeting?.placements?.automatic !== false ? 'Automatic' : 'Manual'}
              </div>
            </div>
            <div style={{ padding: spacing.md, background: colors.surfaceHover, borderRadius: radius.md }}>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 4 }}>Languages</div>
              <div style={{ fontSize: fontSize.sm, color: colors.text, fontWeight: fontWeight.medium }}>
                {(campaign.targeting?.languages || []).length > 0
                  ? campaign.targeting.languages.map(l => l.name).join(', ')
                  : 'All languages'}
              </div>
            </div>
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

      {/* Performance */}
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
function NewCampaignForm({ clientId, onCreated, onCancel, aiSuggestion }) {
  const [form, setForm] = useState({
    name: aiSuggestion?.campaign_name || '',
    objective: aiSuggestion?.objective || 'TRAFFIC',
    platforms: aiSuggestion?.platforms || ['facebook', 'instagram'],
    daily_budget_cents: aiSuggestion?.daily_budget_cents || 4000,
    currency: aiSuggestion?.currency || 'ILS',
    targeting: aiSuggestion?.targeting || {},
  });
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!form.name.trim()) return alert('Campaign name is required');
    setCreating(true);
    try {
      const resp = await api(`/clients/${clientId}/campaigns`, { method: 'POST', body: form });
      const campaignId = resp.id;

      // If AI suggested creatives, create them automatically
      if (aiSuggestion?.creatives?.length) {
        for (const cr of aiSuggestion.creatives) {
          await api(`/clients/${clientId}/campaigns/${campaignId}/creatives`, {
            method: 'POST',
            body: {
              headline: cr.headline || '',
              primary_text: cr.primary_text || '',
              description: cr.description || '',
              call_to_action: cr.call_to_action || 'LEARN_MORE',
              destination_url: cr.destination_url || '',
              format: cr.format || 'single_image',
              images: [],
            },
          });
        }
      }

      onCreated(campaignId);
    } catch (e) { alert(e.message); }
    setCreating(false);
  };

  return (
    <Card style={{ border: `2px solid ${colors.primary}`, maxWidth: 700 }}>
      <h3 style={{ margin: 0, marginBottom: spacing.lg, fontSize: fontSize.xl, fontWeight: fontWeight.black, color: colors.text }}>
        {aiSuggestion ? '✨ AI-Suggested Campaign' : 'New Campaign'}
      </h3>

      {aiSuggestion?.objective_reasoning && (
        <div style={{
          padding: spacing.md, background: '#F0FDF4', border: '1px solid #86EFAC',
          borderRadius: radius.md, marginBottom: spacing.lg, fontSize: fontSize.sm, color: '#166534',
        }}>
          <strong>AI Reasoning:</strong> {aiSuggestion.objective_reasoning}
        </div>
      )}

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
              <div>{o.icon} {o.label}</div>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>{o.desc}</div>
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

      {/* Show AI-suggested targeting summary */}
      {aiSuggestion?.targeting && (
        <div style={{
          marginTop: spacing.md, padding: spacing.md,
          background: colors.surfaceHover, borderRadius: radius.md,
        }}>
          <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: spacing.xs }}>
            AI-Suggested Targeting
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
            {aiSuggestion.targeting_reasoning || 'Based on your business profile'}
          </div>
          <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            {(aiSuggestion.targeting.geo_locations?.countries || []).map(c => (
              <Badge key={c} text={COUNTRIES.find(x => x.code === c)?.name || c} color={colors.primary} bg={colors.primaryLightest} />
            ))}
            <Badge text={`Age: ${aiSuggestion.targeting.age_min || 18}-${aiSuggestion.targeting.age_max || 65}`} color={colors.primary} bg={colors.primaryLightest} />
            {(aiSuggestion.targeting.interests || []).map(i => (
              <Badge key={i.id} text={i.name} color={colors.successDark} bg={colors.successLight} />
            ))}
          </div>
        </div>
      )}

      {/* Show AI-suggested creatives preview */}
      {aiSuggestion?.creatives?.length > 0 && (
        <div style={{
          marginTop: spacing.md, padding: spacing.md,
          background: '#FEF3C7', borderRadius: radius.md, border: '1px solid #FCD34D',
        }}>
          <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: spacing.sm }}>
            AI-Suggested Creatives ({aiSuggestion.creatives.length})
          </div>
          {aiSuggestion.creatives.map((cr, idx) => (
            <div key={idx} style={{
              padding: spacing.sm, background: '#fff', borderRadius: radius.sm,
              marginBottom: idx < aiSuggestion.creatives.length - 1 ? spacing.xs : 0,
              fontSize: fontSize.sm,
            }}>
              <div style={{ fontWeight: fontWeight.bold }}>{cr.headline}</div>
              <div style={{ color: colors.textSecondary, fontSize: fontSize.xs }}>{cr.primary_text}</div>
              {cr.image_suggestions && (
                <div style={{ fontSize: fontSize.xs, color: colors.primary, marginTop: 4, fontStyle: 'italic' }}>
                  Image tip: {cr.image_suggestions}
                </div>
              )}
            </div>
          ))}
          <div style={{ fontSize: fontSize.xs, color: '#92400E', marginTop: spacing.xs }}>
            These creatives will be auto-created. You can edit them after creating the campaign.
          </div>
        </div>
      )}

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
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

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

  const handleAiSuggest = async () => {
    const goal = prompt('What do you want to achieve with this campaign? (e.g. "get website visits", "generate leads", or leave empty for AI to decide)');
    if (goal === null) return; // cancelled
    setAiLoading(true);
    try {
      const resp = await api(`/clients/${clientId}/campaigns/suggest-full`, {
        method: 'POST',
        body: { goal: goal || undefined },
      });
      if (resp?.success && resp.suggestion) {
        setAiSuggestion(resp.suggestion);
        setCreating(true);
        if (resp.suggestion.additional_tips) {
          // Show tips after a brief delay
          setTimeout(() => alert(`AI Tips:\n${resp.suggestion.additional_tips}`), 500);
        }
      } else {
        alert('AI suggestion failed. Try creating a campaign manually.');
      }
    } catch (e) { alert('AI suggestion failed: ' + e.message); }
    setAiLoading(false);
  };

  if (!clientId) return <Empty icon={Megaphone} msg="Select a client to manage campaigns" />;

  // AI loading state
  if (aiLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin />
        <div style={{ marginTop: spacing.lg, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
          AI is analyzing your business...
        </div>
        <div style={{ marginTop: spacing.xs, fontSize: fontSize.sm, color: colors.textSecondary }}>
          Suggesting the best campaign type, audience targeting, and ad creative
        </div>
      </div>
    );
  }

  if (selectedId) {
    return <CampaignDetail campaignId={selectedId} clientId={clientId} onBack={() => { setSelectedId(null); load(); }} />;
  }

  if (creating) {
    return <NewCampaignForm clientId={clientId}
      aiSuggestion={aiSuggestion}
      onCreated={(id) => { setCreating(false); setAiSuggestion(null); setSelectedId(id); }}
      onCancel={() => { setCreating(false); setAiSuggestion(null); }} />;
  }

  return <CampaignList campaigns={campaigns} loading={loading}
    onSelect={setSelectedId} onCreate={() => setCreating(true)} onAiSuggest={handleAiSuggest} />;
}
