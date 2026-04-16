import { useState, useEffect, useCallback } from 'react';
import {
  Plus, CheckCircle, Circle, Clock, Trash2, Wand2, MessageSquare, ChevronDown,
  ChevronUp, AlertTriangle, Lightbulb, ListTodo, Bug, Zap, X, Filter, Send,
} from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, transitions, shadows } from '../theme.js';
import { Card, SH, Badge, Btn, GradientBtn, Spin, Empty, Field, inputStyle, Tabs } from '../components/index.jsx';

const selectStyle = { ...inputStyle, cursor: 'pointer' };

const TYPE_CONFIG = {
  task:        { icon: ListTodo,     label: 'Task',        color: colors.primary,      bg: colors.primaryLightest },
  idea:        { icon: Lightbulb,    label: 'Idea',        color: '#D97706',           bg: '#FEF3C7' },
  comment:     { icon: MessageSquare,label: 'Comment',     color: '#6B7280',           bg: '#F3F4F6' },
  bug:         { icon: Bug,          label: 'Bug',         color: colors.errorDark,    bg: colors.errorLight },
  improvement: { icon: Zap,          label: 'Improvement', color: colors.successDark,  bg: colors.successLight },
};

const STATUS_CONFIG = {
  open:        { icon: Circle,       label: 'Open',        color: colors.primary,      bg: colors.primaryLightest },
  in_progress: { icon: Clock,        label: 'In Progress', color: '#D97706',           bg: '#FEF3C7' },
  done:        { icon: CheckCircle,  label: 'Done',        color: colors.successDark,  bg: colors.successLight },
  archived:    { icon: X,            label: 'Archived',    color: colors.textMuted,    bg: colors.surfaceHover },
  rejected:    { icon: X,            label: 'Rejected',    color: colors.errorDark,    bg: colors.errorLight },
};

const PRIORITY_CONFIG = {
  low:      { color: '#6B7280', bg: '#F3F4F6', label: 'Low' },
  medium:   { color: '#D97706', bg: '#FEF3C7', label: 'Medium' },
  high:     { color: '#DC2626', bg: '#FEE2E2', label: 'High' },
  critical: { color: '#7C2D12', bg: '#FED7AA', label: 'Critical' },
};

const CATEGORIES = [
  'general', 'seo', 'content', 'design', 'technical', 'marketing', 'ads', 'social', 'analytics', 'other',
];

// ── Quick Add Form (inline) ─────────────────────────────────────
function QuickAddForm({ clientId, onCreated }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('task');
  const [expanded, setExpanded] = useState(false);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [relatedUrl, setRelatedUrl] = useState('');
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      await api(`/clients/${clientId}/tasks`, {
        method: 'POST',
        body: {
          title: title.trim(),
          type,
          description: description || undefined,
          category,
          priority,
          related_url: relatedUrl || undefined,
        },
      });
      setTitle(''); setDescription(''); setRelatedUrl('');
      setExpanded(false);
      onCreated();
    } catch (e) { alert(e.message); }
    setCreating(false);
  };

  return (
    <Card style={{ border: `2px solid ${colors.primary}20`, marginBottom: spacing.lg }}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <button key={key} type="button"
                  onClick={() => setType(key)}
                  title={cfg.label}
                  style={{
                    width: 32, height: 32, borderRadius: radius.sm, border: 'none',
                    background: type === key ? cfg.bg : 'transparent',
                    color: type === key ? cfg.color : colors.textMuted,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: transitions.fast,
                  }}>
                  <Icon size={16} />
                </button>
              );
            })}
          </div>
          <input
            style={{ ...inputStyle, flex: 1, border: 'none', boxShadow: 'none', fontSize: fontSize.md }}
            placeholder={`Add a ${type}...`}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onFocus={() => title.length > 0 && setExpanded(true)}
          />
          <button type="button" onClick={() => setExpanded(!expanded)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 4 }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <GradientBtn type="submit" disabled={!title.trim() || creating}
            style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
            {creating ? <Spin /> : <><Plus size={14} /> Add</>}
          </GradientBtn>
        </div>

        {expanded && (
          <div style={{ marginTop: spacing.md, display: 'grid', gap: spacing.sm }}>
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
              placeholder="Description (optional)..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: spacing.sm }}>
              <Field label="Category">
                <select style={selectStyle} value={category} onChange={e => setCategory(e.target.value)}>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select style={selectStyle} value={priority} onChange={e => setPriority(e.target.value)}>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Related URL">
                <input style={inputStyle} placeholder="https://..." value={relatedUrl}
                  onChange={e => setRelatedUrl(e.target.value)} />
              </Field>
            </div>
          </div>
        )}
      </form>
    </Card>
  );
}

// ── Task Card ───────────────────────────────────────────────────
function TaskCard({ task, onUpdate, onDelete, onAnalyze, onSelect }) {
  const typeConf = TYPE_CONFIG[task.type] || TYPE_CONFIG.task;
  const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.open;
  const prioConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;
  const TypeIcon = typeConf.icon;
  const StatusIcon = statusConf.icon;
  const isDone = task.status === 'done';
  const hasAI = !!task.ai_analysis;

  const toggleDone = (e) => {
    e.stopPropagation();
    onUpdate(task.id, { status: isDone ? 'open' : 'done' });
  };

  const cycleStatus = (e) => {
    e.stopPropagation();
    const cycle = ['open', 'in_progress', 'done'];
    const idx = cycle.indexOf(task.status);
    const next = cycle[(idx + 1) % cycle.length];
    onUpdate(task.id, { status: next });
  };

  return (
    <Card
      onClick={() => onSelect(task)}
      style={{
        marginBottom: spacing.sm, cursor: 'pointer',
        border: `1px solid ${colors.border}`,
        opacity: isDone ? 0.65 : 1,
        transition: transitions.fast,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: spacing.md, alignItems: 'flex-start' }}>
        {/* Status toggle */}
        <button onClick={toggleDone}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
            color: isDone ? colors.success : colors.textMuted,
            flexShrink: 0, marginTop: 2,
          }}
          title={isDone ? 'Mark as open' : 'Mark as done'}
        >
          {isDone ? <CheckCircle size={22} /> : <Circle size={22} />}
        </button>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text,
              textDecoration: isDone ? 'line-through' : 'none',
            }}>
              {task.title}
            </span>
            <Badge text={typeConf.label} color={typeConf.color} bg={typeConf.bg} />
            <Badge text={prioConf.label} color={prioConf.color} bg={prioConf.bg} />
            {task.category !== 'general' && (
              <span style={{ fontSize: fontSize.xs, color: colors.textMuted, textTransform: 'capitalize' }}>
                {task.category}
              </span>
            )}
            {hasAI && (
              <span title="AI analyzed" style={{ fontSize: fontSize.xs }}>
                <Wand2 size={12} color={colors.primary} />
              </span>
            )}
          </div>
          {task.description && (
            <div style={{
              fontSize: fontSize.sm, color: colors.textSecondary,
              overflow: 'hidden', textOverflow: 'ellipsis',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
              {task.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.xs, fontSize: fontSize.xs, color: colors.textMuted }}>
            <span>{new Date(task.created_at).toLocaleDateString()}</span>
            {task.due_date && <span>Due: {task.due_date}</span>}
            {task.completed_at && <span>Done: {new Date(task.completed_at).toLocaleDateString()}</span>}
            {task.related_url && <span style={{ color: colors.primary }}>Has URL</span>}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={(e) => { e.stopPropagation(); cycleStatus(e); }}
            title={`Status: ${statusConf.label}`}
            style={{
              background: statusConf.bg, border: 'none', borderRadius: radius.sm,
              color: statusConf.color, cursor: 'pointer', padding: '4px 8px',
              fontSize: fontSize.xs, fontWeight: fontWeight.medium,
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
            <StatusIcon size={12} /> {statusConf.label}
          </button>
          {!hasAI && (
            <button onClick={(e) => { e.stopPropagation(); onAnalyze(task.id); }}
              title="Get AI analysis"
              style={{
                background: colors.primaryLightest, border: 'none', borderRadius: radius.sm,
                color: colors.primary, cursor: 'pointer', padding: '4px 8px',
                fontSize: fontSize.xs, display: 'flex', alignItems: 'center', gap: 3,
              }}>
              <Wand2 size={12} /> AI
            </button>
          )}
        </div>
      </div>

      {/* AI Analysis Preview */}
      {hasAI && task.ai_action_plan?.feasibility && (
        <div style={{
          marginTop: spacing.sm, padding: spacing.sm,
          background: '#F0F9FF', borderRadius: radius.sm, border: '1px solid #BAE6FD',
          fontSize: fontSize.xs, color: '#0C4A6E',
        }}>
          <div style={{ display: 'flex', gap: spacing.md, marginBottom: 4 }}>
            <span>Impact: <strong>{task.ai_action_plan.impact}</strong></span>
            <span>Feasibility: <strong>{task.ai_action_plan.feasibility}</strong></span>
            {task.ai_action_plan.estimated_timeline && (
              <span>Timeline: <strong>{task.ai_action_plan.estimated_timeline}</strong></span>
            )}
          </div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.ai_analysis}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Task Detail Panel ───────────────────────────────────────────
function TaskDetail({ task: initialTask, clientId, onClose, onUpdate, onDelete }) {
  const [task, setTask] = useState(initialTask);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api(`/clients/${clientId}/tasks/${task.id}`);
      setTask(data);
      setComments(data.comments || []);
      setForm({
        title: data.title, description: data.description || '',
        type: data.type, category: data.category,
        priority: data.priority, status: data.status,
        due_date: data.due_date || '', related_url: data.related_url || '',
        notes: data.notes || '',
      });
    } catch (e) { console.error(e); }
  }, [clientId, task.id]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    try {
      await api(`/clients/${clientId}/tasks/${task.id}`, { method: 'PATCH', body: form });
      setEditing(false);
      load();
      onUpdate();
    } catch (e) { alert(e.message); }
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    try {
      const resp = await api(`/clients/${clientId}/tasks/${task.id}/ai-analyze`, { method: 'POST' });
      await load();
      onUpdate();
    } catch (e) { alert('AI analysis failed: ' + e.message); }
    setAnalyzing(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    try {
      await api(`/clients/${clientId}/tasks/${task.id}/comments`, {
        method: 'POST', body: { content: newComment },
      });
      setNewComment('');
      await load();
    } catch (e) { alert(e.message); }
    setPosting(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task? This cannot be undone.')) return;
    try {
      await api(`/clients/${clientId}/tasks/${task.id}`, { method: 'DELETE' });
      onDelete();
      onClose();
    } catch (e) { alert(e.message); }
  };

  const typeConf = TYPE_CONFIG[task.type] || TYPE_CONFIG.task;
  const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.open;
  const prioConf = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textMuted, padding: 4 }}>
          <X size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <Badge text={typeConf.label} color={typeConf.color} bg={typeConf.bg} />
            <Badge text={statusConf.label} color={statusConf.color} bg={statusConf.bg} />
            <Badge text={prioConf.label} color={prioConf.color} bg={prioConf.bg} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: spacing.sm }}>
          <Btn small onClick={handleAnalyze} disabled={analyzing}>
            {analyzing ? <Spin /> : <><Wand2 size={12} /> AI Analyze</>}
          </Btn>
          <Btn small onClick={() => editing ? handleSave() : setEditing(true)}>
            {editing ? 'Save' : 'Edit'}
          </Btn>
          <Btn small danger onClick={handleDelete}>
            <Trash2 size={12} />
          </Btn>
        </div>
      </div>

      {/* Task Details */}
      <Card style={{ marginBottom: spacing.lg, border: `1px solid ${colors.border}` }}>
        {editing ? (
          <div style={{ display: 'grid', gap: spacing.md }}>
            <Field label="Title">
              <input style={inputStyle} value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </Field>
            <Field label="Description">
              <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: spacing.sm }}>
              <Field label="Type">
                <select style={selectStyle} value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select style={selectStyle} value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select style={selectStyle} value={form.priority}
                  onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select style={selectStyle} value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Due Date">
                <input style={inputStyle} type="date" value={form.due_date}
                  onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
              </Field>
              <Field label="Related URL">
                <input style={inputStyle} placeholder="https://..." value={form.related_url}
                  onChange={e => setForm(f => ({ ...f, related_url: e.target.value }))} />
              </Field>
            </div>
            <Field label="Notes">
              <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
                placeholder="Internal notes..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
        ) : (
          <div>
            <h2 style={{ fontSize: fontSize.xl, fontWeight: fontWeight.black, color: colors.text, margin: 0, marginBottom: spacing.sm }}>
              {task.title}
            </h2>
            {task.description && (
              <p style={{ fontSize: fontSize.sm, color: colors.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0, marginBottom: spacing.md }}>
                {task.description}
              </p>
            )}
            <div style={{ display: 'flex', gap: spacing.lg, fontSize: fontSize.xs, color: colors.textMuted, flexWrap: 'wrap' }}>
              <span>Created: {new Date(task.created_at).toLocaleString()}</span>
              {task.due_date && <span>Due: {task.due_date}</span>}
              {task.completed_at && <span>Done: {new Date(task.completed_at).toLocaleString()}</span>}
              {task.related_url && (
                <a href={task.related_url} target="_blank" rel="noopener noreferrer"
                  style={{ color: colors.primary, textDecoration: 'none' }}
                  onClick={e => e.stopPropagation()}>
                  {task.related_url}
                </a>
              )}
              {task.notes && <span>Notes: {task.notes}</span>}
            </div>
          </div>
        )}
      </Card>

      {/* AI Analysis */}
      {task.ai_action_plan && (
        <Card style={{ marginBottom: spacing.lg, border: `1px solid #BAE6FD`, background: '#F0F9FF' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <Wand2 size={18} color={colors.primary} />
            <h3 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
              AI Analysis
            </h3>
            {task.ai_analyzed_at && (
              <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                {new Date(task.ai_analyzed_at).toLocaleString()}
              </span>
            )}
          </div>

          <p style={{ fontSize: fontSize.sm, color: '#0C4A6E', lineHeight: 1.6, margin: 0, marginBottom: spacing.md }}>
            {task.ai_action_plan.evaluation}
          </p>

          <div style={{ display: 'flex', gap: spacing.lg, marginBottom: spacing.md, flexWrap: 'wrap' }}>
            {task.ai_action_plan.feasibility && (
              <div style={{ padding: spacing.sm, background: '#fff', borderRadius: radius.sm, textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Feasibility</div>
                <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#0C4A6E', textTransform: 'capitalize' }}>
                  {task.ai_action_plan.feasibility}
                </div>
              </div>
            )}
            {task.ai_action_plan.impact && (
              <div style={{ padding: spacing.sm, background: '#fff', borderRadius: radius.sm, textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Impact</div>
                <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#0C4A6E', textTransform: 'capitalize' }}>
                  {task.ai_action_plan.impact}
                </div>
              </div>
            )}
            {task.ai_action_plan.estimated_timeline && (
              <div style={{ padding: spacing.sm, background: '#fff', borderRadius: radius.sm, textAlign: 'center', minWidth: 100 }}>
                <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>Timeline</div>
                <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#0C4A6E' }}>
                  {task.ai_action_plan.estimated_timeline}
                </div>
              </div>
            )}
          </div>

          {/* Action Plan */}
          {task.ai_action_plan.action_plan?.length > 0 && (
            <div style={{ marginBottom: spacing.md }}>
              <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, marginBottom: spacing.sm }}>Action Plan</div>
              {task.ai_action_plan.action_plan.map((step, i) => (
                <div key={i} style={{
                  display: 'flex', gap: spacing.sm, padding: spacing.sm,
                  background: '#fff', borderRadius: radius.sm, marginBottom: spacing.xs,
                  border: '1px solid #E0F2FE',
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: colors.primary, color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                  }}>
                    {step.step || i + 1}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                      {step.action}
                    </div>
                    {step.details && (
                      <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 }}>
                        {step.details}
                      </div>
                    )}
                  </div>
                  {step.effort && (
                    <Badge text={step.effort} color={step.effort === 'small' ? colors.successDark : step.effort === 'large' ? colors.errorDark : '#D97706'}
                      bg={step.effort === 'small' ? colors.successLight : step.effort === 'large' ? colors.errorLight : '#FEF3C7'} />
                  )}
                </div>
              ))}
            </div>
          )}

          {task.ai_action_plan.suggestions && (
            <div style={{ fontSize: fontSize.sm, color: '#0C4A6E', background: '#fff', padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.xs }}>
              <strong>Suggestions:</strong> {task.ai_action_plan.suggestions}
            </div>
          )}
          {task.ai_action_plan.risks && (
            <div style={{ fontSize: fontSize.sm, color: '#7C2D12', background: '#FEF3C7', padding: spacing.sm, borderRadius: radius.sm }}>
              <strong>Risks:</strong> {task.ai_action_plan.risks}
            </div>
          )}
        </Card>
      )}

      {/* Comments */}
      <Card style={{ border: `1px solid ${colors.border}` }}>
        <h3 style={{ margin: 0, marginBottom: spacing.md, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <MessageSquare size={18} /> Comments ({comments.length})
        </h3>

        {comments.map(c => (
          <div key={c.id} style={{
            padding: spacing.md,
            background: c.is_ai_response ? '#F0F9FF' : colors.surfaceHover,
            borderRadius: radius.md, marginBottom: spacing.sm,
            borderLeft: `3px solid ${c.is_ai_response ? colors.primary : colors.border}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: spacing.xs }}>
              <span style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: c.is_ai_response ? colors.primary : colors.text }}>
                {c.is_ai_response ? 'AI Assistant' : c.author || 'You'}
              </span>
              <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                {new Date(c.created_at).toLocaleString()}
              </span>
            </div>
            <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {c.content}
            </div>
          </div>
        ))}

        {/* Add comment */}
        <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.md }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Add a comment..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleAddComment()}
          />
          <Btn small onClick={handleAddComment} disabled={!newComment.trim() || posting}>
            {posting ? <Spin /> : <Send size={14} />}
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ── Main Tasks View ─────────────────────────────────────────────
export default function TasksView({ clientId }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('active'); // active, done, all
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [analyzingId, setAnalyzingId] = useState(null);
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const params = [];
      if (filter === 'done') params.push('status=done');
      else if (filter === 'active') params.push('status=open');
      // for 'all', don't filter by status
      if (typeFilter !== 'all') params.push(`type=${typeFilter}`);
      const data = await api(`/clients/${clientId}/tasks?${params.join('&')}`);
      setTasks(data || []);
    } catch (e) { console.error(e); setTasks([]); }
    setLoading(false);
  }, [clientId, filter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const handleUpdate = async (id, updates) => {
    try {
      await api(`/clients/${clientId}/tasks/${id}`, { method: 'PATCH', body: updates });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id) => {
    try {
      await api(`/clients/${clientId}/tasks/${id}`, { method: 'DELETE' });
      load();
    } catch (e) { alert(e.message); }
  };

  const handleAnalyze = async (id) => {
    setAnalyzingId(id);
    try {
      await api(`/clients/${clientId}/tasks/${id}/ai-analyze`, { method: 'POST' });
      load();
    } catch (e) { alert('AI analysis failed: ' + e.message); }
    setAnalyzingId(null);
  };

  const handleAiScan = async () => {
    setScanning(true);
    try {
      const data = await api(`/clients/${clientId}/ai-insights`, { method: 'POST' });
      if (data.created > 0) {
        load();
      } else {
        alert('AI scan complete — no new tasks to add.');
      }
    } catch (e) { alert('AI scan failed: ' + e.message); }
    setScanning(false);
  };

  if (!clientId) return <Empty icon={ListTodo} msg="Select a client to view tasks" />;

  if (selectedTask) {
    return (
      <TaskDetail
        task={selectedTask}
        clientId={clientId}
        onClose={() => { setSelectedTask(null); load(); }}
        onUpdate={load}
        onDelete={() => { setSelectedTask(null); load(); }}
      />
    );
  }

  // Count stats
  const openCount = tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const ideasCount = tasks.filter(t => t.type === 'idea').length;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: spacing.sm }}>
        <SH
          title="Tasks & Ideas"
          sub={`${openCount} open · ${doneCount} done · ${ideasCount} ideas`}
        />
        <GradientBtn onClick={handleAiScan} disabled={scanning}
          style={{ padding: '8px 18px', fontSize: fontSize.sm }}>
          {scanning ? <><Spin /> Scanning...</> : <><Wand2 size={14} /> AI Scan</>}
        </GradientBtn>
      </div>

      <QuickAddForm clientId={clientId} onCreated={load} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap', alignItems: 'center' }}>
        <Filter size={14} color={colors.textMuted} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'active', label: 'Active' },
            { key: 'done', label: 'Done' },
            { key: 'all', label: 'All' },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px', borderRadius: radius.full, cursor: 'pointer',
                border: `1px solid ${filter === f.key ? colors.primary : colors.borderLight}`,
                background: filter === f.key ? colors.primaryLightest : 'transparent',
                color: filter === f.key ? colors.primary : colors.textMuted,
                fontSize: fontSize.xs, fontWeight: filter === f.key ? fontWeight.bold : fontWeight.normal,
              }}>
              {f.label}
            </button>
          ))}
        </div>
        <span style={{ color: colors.border }}>|</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { key: 'all', label: 'All types' },
            ...Object.entries(TYPE_CONFIG).map(([k, v]) => ({ key: k, label: v.label })),
          ].map(f => (
            <button key={f.key} onClick={() => setTypeFilter(f.key)}
              style={{
                padding: '5px 12px', borderRadius: radius.full, cursor: 'pointer',
                border: `1px solid ${typeFilter === f.key ? colors.primary : colors.borderLight}`,
                background: typeFilter === f.key ? colors.primaryLightest : 'transparent',
                color: typeFilter === f.key ? colors.primary : colors.textMuted,
                fontSize: fontSize.xs, fontWeight: typeFilter === f.key ? fontWeight.bold : fontWeight.normal,
              }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      ) : tasks.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: spacing['2xl'] }}>
          <Empty icon={ListTodo}
            msg={filter === 'done' ? 'No completed tasks' : filter === 'active' ? 'No open tasks yet — add one above!' : 'No tasks yet'}
          />
        </Card>
      ) : (
        <div>
          {/* Group by priority for active tasks */}
          {filter === 'active' && (() => {
            const critical = tasks.filter(t => t.priority === 'critical');
            const high = tasks.filter(t => t.priority === 'high');
            const medium = tasks.filter(t => t.priority === 'medium');
            const low = tasks.filter(t => t.priority === 'low');
            const groups = [
              { label: 'Critical', tasks: critical, color: '#7C2D12' },
              { label: 'High Priority', tasks: high, color: '#DC2626' },
              { label: 'Medium', tasks: medium, color: '#D97706' },
              { label: 'Low', tasks: low, color: '#6B7280' },
            ].filter(g => g.tasks.length > 0);

            return groups.map(g => (
              <div key={g.label} style={{ marginBottom: spacing.lg }}>
                <div style={{
                  fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: g.color,
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.sm,
                }}>
                  {g.label} ({g.tasks.length})
                </div>
                {g.tasks.map(t => (
                  <TaskCard key={t.id} task={t}
                    onUpdate={handleUpdate}
                    onDelete={() => handleDelete(t.id)}
                    onAnalyze={handleAnalyze}
                    onSelect={setSelectedTask}
                  />
                ))}
              </div>
            ));
          })()}

          {filter !== 'active' && tasks.map(t => (
            <TaskCard key={t.id} task={t}
              onUpdate={handleUpdate}
              onDelete={() => handleDelete(t.id)}
              onAnalyze={handleAnalyze}
              onSelect={setSelectedTask}
            />
          ))}
        </div>
      )}
    </div>
  );
}
