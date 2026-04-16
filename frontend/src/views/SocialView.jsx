// ─── AI Growth OS — Social Publishing View ──────────────────────
import { useState, useEffect, useCallback } from 'react';
import {
  Facebook, Instagram, Send, Clock, Edit3, Trash2, Wand2, Plus, Eye,
  Image, Link, Calendar, RefreshCw, CheckCircle, AlertTriangle,
  ChevronLeft, X, MessageCircle, Heart, Share2, Users,
} from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions, shadows } from '../theme.js';
import { Card, SH, Badge, Btn, GradientBtn, Spin, Empty, Field, inputStyle } from '../components/index.jsx';

// ── Constants ───────────────────────────────────────────────────
const PLATFORM_COLORS = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  both: '#8B5CF6',
};

const STATUS_CONFIG = {
  draft: { color: colors.textSecondary, bg: colors.surfaceHover, label: 'Draft' },
  scheduled: { color: '#92400E', bg: '#FEF3C7', label: 'Scheduled' },
  published: { color: colors.successDark, bg: colors.successLight, label: 'Published' },
  failed: { color: colors.errorDark, bg: colors.errorLight, label: 'Failed' },
};

function PlatformIcon({ platform, size = 16 }) {
  if (platform === 'facebook') return <Facebook size={size} style={{ color: PLATFORM_COLORS.facebook }} />;
  if (platform === 'instagram') return <Instagram size={size} style={{ color: PLATFORM_COLORS.instagram }} />;
  // "both"
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      <Facebook size={size} style={{ color: PLATFORM_COLORS.facebook }} />
      <Instagram size={size} style={{ color: PLATFORM_COLORS.instagram }} />
    </span>
  );
}

function PlatformBadge({ platform }) {
  const col = PLATFORM_COLORS[platform] || PLATFORM_COLORS.both;
  const label = platform === 'both' ? 'FB + IG' : platform === 'facebook' ? 'Facebook' : 'Instagram';
  return <Badge text={label} color={col} bg={`${col}18`} />;
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return <Badge text={cfg.label} color={cfg.color} bg={cfg.bg} />;
}

function formatDateTime(iso) {
  if (!iso) return '--';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function truncate(str, len = 80) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

// ── AI Generate Inline Form ─────────────────────────────────────
function AiGenerateForm({ clientId, platform, onGenerated, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await api(`/clients/${clientId}/social/ai-generate`, {
        method: 'POST',
        body: { prompt: prompt.trim(), platform: platform || 'facebook' },
      });
      onGenerated(data.content || data.text || data.generated_content || '');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{
      padding: spacing.lg, background: `linear-gradient(135deg, ${colors.primaryLightest}, #F5F3FF)`,
      borderRadius: radius.lg, border: `1px solid ${colors.primaryLighter}`,
      marginBottom: spacing.lg,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Wand2 size={16} style={{ color: colors.primary }} />
          <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
            AI Content Generator
          </span>
        </div>
        {onClose && (
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            color: colors.textMuted, display: 'flex',
          }}>
            <X size={16} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: spacing.sm }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="Describe what you want to post about..."
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleGenerate()}
        />
        <GradientBtn onClick={handleGenerate} disabled={loading || !prompt.trim()}>
          {loading ? <Spin /> : <><Wand2 size={14} /> Generate</>}
        </GradientBtn>
      </div>
      {error && (
        <div style={{ marginTop: spacing.sm, fontSize: fontSize.sm, color: colors.error, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={13} /> {error}
        </div>
      )}
    </div>
  );
}

// ── Create / Edit Post Form ─────────────────────────────────────
function PostForm({ clientId, post, onSaved, onCancel }) {
  const isEdit = !!post;
  const [form, setForm] = useState({
    title: post?.title || '',
    content: post?.content || '',
    platform: post?.platform || 'facebook',
    post_type: post?.post_type || 'post',
    media_urls: post?.media_urls || [],
    link_url: post?.link_url || '',
    scheduled_at: post?.scheduled_at ? post.scheduled_at.slice(0, 16) : '',
  });
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [error, setError] = useState('');

  const updateField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const addImageUrl = () => {
    if (!imageUrl.trim()) return;
    updateField('media_urls', [...form.media_urls, imageUrl.trim()]);
    setImageUrl('');
  };

  const removeImage = (idx) => {
    updateField('media_urls', form.media_urls.filter((_, i) => i !== idx));
  };

  const handleSave = async (publish = false) => {
    if (!form.content.trim()) return setError('Content is required');
    setSaving(true);
    setError('');
    try {
      const body = {
        title: form.title,
        content: form.content,
        platform: form.platform,
        post_type: form.post_type,
        media_urls: form.media_urls.length > 0 ? form.media_urls : undefined,
        link_url: form.link_url || undefined,
        scheduled_at: form.scheduled_at || undefined,
      };

      let saved;
      if (isEdit) {
        saved = await api(`/clients/${clientId}/social/${post.id}`, { method: 'PATCH', body });
      } else {
        saved = await api(`/clients/${clientId}/social`, { method: 'POST', body });
      }

      if (publish && saved?.id) {
        await api(`/clients/${clientId}/social/${saved.id}/publish`, { method: 'POST' });
      }

      onSaved();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  };

  const handleAiGenerated = (content) => {
    updateField('content', content);
    setShowAi(false);
  };

  return (
    <Card style={{ border: `2px solid ${colors.primary}`, marginBottom: spacing.lg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
        <h3 style={{ margin: 0, fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: colors.text }}>
          {isEdit ? 'Edit Post' : 'Create New Post'}
        </h3>
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 4,
          color: colors.textMuted, display: 'flex',
        }}>
          <X size={18} />
        </button>
      </div>

      {/* Platform Selection */}
      <Field label="Platform">
        <div style={{ display: 'flex', gap: spacing.sm }}>
          {[
            { value: 'facebook', label: 'Facebook', icon: Facebook, color: PLATFORM_COLORS.facebook },
            { value: 'instagram', label: 'Instagram', icon: Instagram, color: PLATFORM_COLORS.instagram },
            { value: 'both', label: 'Both', color: PLATFORM_COLORS.both },
          ].map(p => {
            const selected = form.platform === p.value;
            return (
              <button key={p.value} onClick={() => updateField('platform', p.value)}
                style={{
                  padding: '8px 18px', borderRadius: radius.md, cursor: 'pointer',
                  border: `2px solid ${selected ? p.color : colors.border}`,
                  background: selected ? `${p.color}12` : colors.surface,
                  color: selected ? p.color : colors.text,
                  fontSize: fontSize.sm, fontWeight: selected ? fontWeight.bold : fontWeight.medium,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: transitions.fast,
                }}>
                {p.value === 'both' ? (
                  <><Facebook size={14} /><Instagram size={14} /></>
                ) : (
                  <p.icon size={14} />
                )}
                {p.label}
              </button>
            );
          })}
        </div>
      </Field>

      {/* AI Generate */}
      {showAi ? (
        <AiGenerateForm
          clientId={clientId}
          platform={form.platform}
          onGenerated={handleAiGenerated}
          onClose={() => setShowAi(false)}
        />
      ) : (
        <div style={{ marginBottom: spacing.lg }}>
          <Btn onClick={() => setShowAi(true)} small>
            <Wand2 size={13} /> AI Generate Content
          </Btn>
        </div>
      )}

      {/* Content */}
      <Field label="Content" required>
        <textarea
          style={{ ...inputStyle, minHeight: 140, resize: 'vertical', lineHeight: 1.6 }}
          placeholder="Write your post content here..."
          value={form.content}
          onChange={e => updateField('content', e.target.value)}
        />
        <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 3, textAlign: 'right' }}>
          {form.content.length} characters
        </div>
      </Field>

      {/* Image URL */}
      <Field label="Image URL" hint="Add one or more image URLs for your post">
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="https://example.com/image.jpg"
            value={imageUrl}
            onChange={e => setImageUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addImageUrl()}
          />
          <Btn small onClick={addImageUrl} disabled={!imageUrl.trim()}>
            <Image size={13} /> Add
          </Btn>
        </div>
        {form.media_urls.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
            {form.media_urls.map((url, idx) => (
              <span key={idx} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '4px 10px', borderRadius: radius.full,
                background: colors.primaryLightest, color: colors.primary,
                fontSize: fontSize.xs, fontWeight: fontWeight.medium,
                maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                <Image size={11} />
                {url.split('/').pop() || url}
                <X size={12} style={{ cursor: 'pointer', flexShrink: 0 }} onClick={() => removeImage(idx)} />
              </span>
            ))}
          </div>
        )}
      </Field>

      {/* Link URL */}
      <Field label="Link URL" hint="Optional link to share with the post">
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Link size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="https://example.com/page"
            value={form.link_url}
            onChange={e => updateField('link_url', e.target.value)}
          />
        </div>
      </Field>

      {/* Schedule */}
      <Field label="Schedule" hint="Leave empty to save as draft, or pick a time to schedule">
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Calendar size={14} style={{ color: colors.textMuted, flexShrink: 0 }} />
          <input
            type="datetime-local"
            style={{ ...inputStyle, flex: 1 }}
            value={form.scheduled_at}
            onChange={e => updateField('scheduled_at', e.target.value)}
          />
          {form.scheduled_at && (
            <button onClick={() => updateField('scheduled_at', '')} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: colors.textMuted, display: 'flex',
            }}>
              <X size={14} />
            </button>
          )}
        </div>
      </Field>

      {error && (
        <div style={{
          marginBottom: spacing.md, padding: spacing.md,
          background: colors.errorLight, borderRadius: radius.md,
          fontSize: fontSize.sm, color: colors.errorDark,
          display: 'flex', alignItems: 'center', gap: spacing.sm,
        }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: spacing.sm, justifyContent: 'flex-end' }}>
        <Btn secondary onClick={onCancel}>Cancel</Btn>
        <Btn onClick={() => handleSave(false)} disabled={saving}>
          {saving ? <Spin /> : <><Edit3 size={13} /> Save Draft</>}
        </Btn>
        <GradientBtn onClick={() => handleSave(true)} disabled={saving}>
          {saving ? <Spin /> : <><Send size={13} /> Publish Now</>}
        </GradientBtn>
      </div>
    </Card>
  );
}

// ── Post Detail View ────────────────────────────────────────────
function PostDetail({ post, clientId, onBack, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isDraft = post.status === 'draft';
  const isPublished = post.status === 'published';
  const isFailed = post.status === 'failed';

  const handlePublish = async () => {
    if (!confirm('Publish this post now?')) return;
    setPublishing(true);
    try {
      await api(`/clients/${clientId}/social/${post.id}/publish`, { method: 'POST' });
      onRefresh();
    } catch (e) { alert('Publish failed: ' + e.message); }
    setPublishing(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this post? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api(`/clients/${clientId}/social/${post.id}`, { method: 'DELETE' });
      onBack();
    } catch (e) { alert('Delete failed: ' + e.message); }
    setDeleting(false);
  };

  if (editing) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
          <button onClick={() => setEditing(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: spacing.xs,
            color: colors.textSecondary, display: 'flex',
          }}>
            <ChevronLeft size={20} />
          </button>
          <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
            Back to Post
          </span>
        </div>
        <PostForm clientId={clientId} post={post} onSaved={() => { setEditing(false); onRefresh(); }} onCancel={() => setEditing(false)} />
      </div>
    );
  }

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
            <PlatformIcon platform={post.platform} size={20} />
            <span style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.text }}>
              {post.title || 'Social Post'}
            </span>
            <StatusBadge status={post.status} />
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 }}>
            Created {formatDateTime(post.created_at)}
            {post.published_at && ` | Published ${formatDateTime(post.published_at)}`}
            {post.scheduled_at && post.status === 'scheduled' && ` | Scheduled for ${formatDateTime(post.scheduled_at)}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: spacing.sm }}>
          {isDraft && (
            <>
              <Btn onClick={() => setEditing(true)}>
                <Edit3 size={13} /> Edit
              </Btn>
              <GradientBtn onClick={handlePublish} disabled={publishing}>
                {publishing ? <Spin /> : <><Send size={13} /> Publish</>}
              </GradientBtn>
              <Btn danger onClick={handleDelete} disabled={deleting}>
                {deleting ? <Spin /> : <><Trash2 size={13} /> Delete</>}
              </Btn>
            </>
          )}
          {post.status === 'scheduled' && (
            <Btn onClick={() => setEditing(true)}>
              <Edit3 size={13} /> Edit
            </Btn>
          )}
        </div>
      </div>

      {/* Content */}
      <Card style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md }}>
          <PlatformBadge platform={post.platform} />
          <StatusBadge status={post.status} />
        </div>
        <div style={{
          fontSize: fontSize.lg, color: colors.text, lineHeight: 1.7,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {post.content}
        </div>

        {/* Media */}
        {post.media_urls && post.media_urls.length > 0 && (
          <div style={{ marginTop: spacing.lg }}>
            <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSecondary, textTransform: 'uppercase', marginBottom: spacing.sm }}>
              Media
            </div>
            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
              {post.media_urls.map((url, idx) => (
                <div key={idx} style={{
                  width: 160, height: 120, borderRadius: radius.md, overflow: 'hidden',
                  border: `1px solid ${colors.border}`, background: colors.surfaceHover,
                }}>
                  <img src={url} alt={`Media ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Link */}
        {post.link_url && (
          <div style={{
            marginTop: spacing.lg, padding: spacing.md,
            background: colors.surfaceHover, borderRadius: radius.md,
            display: 'flex', alignItems: 'center', gap: spacing.sm,
          }}>
            <Link size={14} style={{ color: colors.primary, flexShrink: 0 }} />
            <a href={post.link_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: fontSize.sm, color: colors.primary, wordBreak: 'break-all' }}>
              {post.link_url}
            </a>
          </div>
        )}
      </Card>

      {/* Failed Error */}
      {isFailed && post.publish_error && (
        <Card style={{ marginBottom: spacing.lg, border: `1px solid ${colors.error}`, background: colors.errorLight }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <AlertTriangle size={16} style={{ color: colors.error }} />
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.errorDark }}>
              Publish Failed
            </span>
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.errorDark }}>
            {post.publish_error}
          </div>
        </Card>
      )}

      {/* Engagement Metrics (for published posts) */}
      {isPublished && (
        <Card style={{ marginBottom: spacing.lg }}>
          <h3 style={{ margin: 0, marginBottom: spacing.lg, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
            Engagement
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: spacing.md }}>
            {[
              { key: 'likes', label: 'Likes', icon: Heart, color: colors.error },
              { key: 'comments', label: 'Comments', icon: MessageCircle, color: colors.primary },
              { key: 'shares', label: 'Shares', icon: Share2, color: colors.success },
              { key: 'reach', label: 'Reach', icon: Users, color: '#F59E0B' },
            ].map(m => {
              const val = post.engagement?.[m.key] ?? post[m.key] ?? 0;
              return (
                <div key={m.key} style={{
                  padding: spacing.lg, background: colors.surfaceHover,
                  borderRadius: radius.lg, textAlign: 'center',
                }}>
                  <m.icon size={20} style={{ color: m.color, marginBottom: spacing.sm }} />
                  <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.text }}>
                    {typeof val === 'number' ? val.toLocaleString() : val}
                  </div>
                  <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {m.label}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Schedule info */}
      {post.status === 'scheduled' && post.scheduled_at && (
        <Card style={{ marginBottom: spacing.lg, border: `1px solid #FCD34D`, background: '#FFFBEB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <Clock size={16} style={{ color: '#92400E' }} />
            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: '#92400E' }}>
              Scheduled for {formatDateTime(post.scheduled_at)}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Post Card (in list) ─────────────────────────────────────────
function PostCard({ post, onClick }) {
  return (
    <Card onClick={onClick} style={{ cursor: 'pointer', marginBottom: spacing.sm }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', gap: spacing.md, flex: 1, minWidth: 0 }}>
          <div style={{
            width: 40, height: 40, borderRadius: radius.lg,
            background: `${PLATFORM_COLORS[post.platform] || PLATFORM_COLORS.both}12`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <PlatformIcon platform={post.platform} size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: 2, flexWrap: 'wrap' }}>
              {post.title && (
                <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
                  {post.title}
                </span>
              )}
              <PlatformBadge platform={post.platform} />
              <StatusBadge status={post.status} />
            </div>
            <div style={{
              fontSize: fontSize.sm, color: colors.textSecondary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {truncate(post.content, 80)}
            </div>
            <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: spacing.md }}>
              {post.status === 'scheduled' && post.scheduled_at && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Clock size={11} /> {formatDateTime(post.scheduled_at)}
                </span>
              )}
              {post.status === 'published' && post.published_at && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <CheckCircle size={11} /> {formatDateTime(post.published_at)}
                </span>
              )}
              {post.status === 'draft' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Edit3 size={11} /> {formatDateTime(post.created_at)}
                </span>
              )}
              {post.status === 'published' && (post.engagement?.likes != null || post.likes != null) && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Heart size={11} /> {post.engagement?.likes ?? post.likes ?? 0}
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronLeft size={16} style={{ color: colors.textMuted, transform: 'rotate(180deg)', flexShrink: 0, marginTop: 4 }} />
      </div>
    </Card>
  );
}

// ── Status Section ──────────────────────────────────────────────
function StatusSection({ title, icon, posts, onSelect, accentColor }) {
  const [collapsed, setCollapsed] = useState(false);
  if (posts.length === 0) return null;

  return (
    <div style={{ marginBottom: spacing.xl }}>
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: 'flex', alignItems: 'center', gap: spacing.sm,
          marginBottom: spacing.md, cursor: 'pointer', userSelect: 'none',
        }}
      >
        {icon}
        <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>
          {title}
        </span>
        <Badge text={String(posts.length)} color={accentColor} bg={`${accentColor}18`} />
      </div>
      {!collapsed && posts.map(p => (
        <PostCard key={p.id} post={p} onClick={() => onSelect(p)} />
      ))}
    </div>
  );
}

// ── Main SocialView ─────────────────────────────────────────────
export default function SocialView({ clientId }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const data = await api(`/clients/${clientId}/social`);
      setPosts(Array.isArray(data) ? data : data?.posts || data?.data || []);
    } catch (e) { console.error('Failed to load social posts:', e); }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handlePostSaved = () => {
    setShowCreate(false);
    load();
  };

  const handleSelectPost = (post) => {
    setSelectedPost(post);
  };

  const handleBackFromDetail = () => {
    setSelectedPost(null);
    load();
  };

  if (!clientId) {
    return <Empty icon={Send} msg="Select a client to manage social posts" />;
  }

  // Detail view
  if (selectedPost) {
    // Refresh the post data from the list
    const fresh = posts.find(p => p.id === selectedPost.id) || selectedPost;
    return (
      <PostDetail
        post={fresh}
        clientId={clientId}
        onBack={handleBackFromDetail}
        onRefresh={async () => {
          await load();
          const updated = posts.find(p => p.id === selectedPost.id);
          if (updated) setSelectedPost(updated);
        }}
      />
    );
  }

  // Group posts by status
  const drafts = posts.filter(p => p.status === 'draft');
  const scheduled = posts.filter(p => p.status === 'scheduled');
  const published = posts.filter(p => p.status === 'published');
  const failed = posts.filter(p => p.status === 'failed');

  return (
    <div>
      <SH
        title="Social Posts"
        sub={`${posts.length} posts total — ${drafts.length} drafts, ${scheduled.length} scheduled, ${published.length} published`}
        action={
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Btn onClick={handleRefresh} disabled={refreshing} secondary>
              {refreshing ? <Spin /> : <RefreshCw size={14} />}
            </Btn>
            <GradientBtn onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create Post
            </GradientBtn>
          </div>
        }
      />

      {/* Stats strip */}
      {!loading && posts.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: spacing.md, marginBottom: spacing['2xl'],
        }}>
          {[
            { label: 'Drafts', count: drafts.length, icon: Edit3, color: colors.textSecondary },
            { label: 'Scheduled', count: scheduled.length, icon: Clock, color: '#F59E0B' },
            { label: 'Published', count: published.length, icon: CheckCircle, color: colors.success },
            { label: 'Failed', count: failed.length, icon: AlertTriangle, color: colors.error },
          ].map(s => (
            <div key={s.label} style={{
              padding: spacing.lg, background: colors.surface,
              borderRadius: radius.lg, textAlign: 'center',
              border: `1px solid ${colors.border}`,
            }}>
              <s.icon size={18} style={{ color: s.color, marginBottom: spacing.xs }} />
              <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.text }}>
                {s.count}
              </div>
              <div style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <PostForm clientId={clientId} onSaved={handlePostSaved} onCancel={() => setShowCreate(false)} />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      )}

      {/* Empty state */}
      {!loading && posts.length === 0 && !showCreate && (
        <Empty
          icon={Send}
          msg="No social posts yet"
          action={() => setShowCreate(true)}
          actionLabel="Create Your First Post"
        />
      )}

      {/* Post list grouped by status */}
      {!loading && posts.length > 0 && (
        <div>
          <StatusSection
            title="Drafts"
            icon={<Edit3 size={16} style={{ color: colors.textSecondary }} />}
            posts={drafts}
            onSelect={handleSelectPost}
            accentColor={colors.textSecondary}
          />
          <StatusSection
            title="Scheduled"
            icon={<Clock size={16} style={{ color: '#F59E0B' }} />}
            posts={scheduled}
            onSelect={handleSelectPost}
            accentColor="#F59E0B"
          />
          <StatusSection
            title="Published"
            icon={<CheckCircle size={16} style={{ color: colors.success }} />}
            posts={published}
            onSelect={handleSelectPost}
            accentColor={colors.success}
          />
          {failed.length > 0 && (
            <StatusSection
              title="Failed"
              icon={<AlertTriangle size={16} style={{ color: colors.error }} />}
              posts={failed}
              onSelect={handleSelectPost}
              accentColor={colors.error}
            />
          )}
        </div>
      )}
    </div>
  );
}
