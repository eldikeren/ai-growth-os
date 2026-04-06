// ─── AI Growth OS — Memory View ────────────────────────────────
import { useState, useEffect } from 'react';
import { Brain, Check, Trash2 } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Card, Badge, Btn, Empty, SH, Field, inputStyle, selectStyle, SkeletonCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

const SCOPES = [
  'general', 'seo', 'reviews', 'performance', 'content', 'competitors',
  'technical_debt', 'ads', 'social', 'backlinks', 'strategy', 'local_seo',
];

const TYPES = [
  'fact', 'goal', 'constraint', 'preference', 'status', 'insight', 'warning', 'achievement',
];

const INITIAL_ITEM = { scope: 'general', type: 'fact', content: '', tags: '' };

export default function MemoryView({ clientId }) {
  const [memory, setMemory] = useState([]);
  const [filter, setFilter] = useState({ scope: '', stale: '' });
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ ...INITIAL_ITEM });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    let url = `/clients/${clientId}/memory?`;
    if (filter.scope) url += `scope=${filter.scope}&`;
    if (filter.stale) url += `stale=${filter.stale}&`;
    try {
      setMemory(await api(url));
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [clientId, filter.scope, filter.stale]);

  if (!clientId) {
    return <Empty icon={Brain} msg="Select a client to view memory" />;
  }

  const handleAdd = async () => {
    if (!newItem.content) return;
    try {
      await api(`/clients/${clientId}/memory`, {
        method: 'POST',
        body: {
          ...newItem,
          tags: newItem.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
        },
      });
      setAdding(false);
      setNewItem({ ...INITIAL_ITEM });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleStale = async (item) => {
    try {
      await api(`/memory/${item.id}`, {
        method: 'PATCH',
        body: { is_stale: !item.is_stale },
      });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (item) => {
    if (!confirm('Delete?')) return;
    try {
      await api(`/memory/${item.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div>
      <SH
        title="Memory"
        sub={`${memory.length} items`}
        action={
          <Btn small onClick={() => setAdding(!adding)} ariaLabel={adding ? 'Cancel adding memory' : 'Add memory item'}>
            {adding ? 'Cancel' : '+ Add'}
          </Btn>
        }
      />

      {/* Add form */}
      {adding && (
        <Card style={{ marginBottom: spacing.xl, borderColor: colors.primaryLighter }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <Field label="Scope" htmlFor="mem-scope" required>
              <select
                id="mem-scope"
                value={newItem.scope}
                onChange={(e) => setNewItem({ ...newItem, scope: e.target.value })}
                style={selectStyle}
                aria-label="Memory scope"
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Type" htmlFor="mem-type" required>
              <select
                id="mem-type"
                value={newItem.type}
                onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                style={selectStyle}
                aria-label="Memory type"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Content" htmlFor="mem-content" required>
            <textarea
              id="mem-content"
              value={newItem.content}
              onChange={(e) => setNewItem({ ...newItem, content: e.target.value })}
              placeholder="Memory content..."
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical',
              }}
              aria-label="Memory content"
            />
          </Field>
          <Field label="Tags" htmlFor="mem-tags" hint="Comma separated">
            <input
              id="mem-tags"
              value={newItem.tags}
              onChange={(e) => setNewItem({ ...newItem, tags: e.target.value })}
              placeholder="Tags (comma separated)"
              style={inputStyle}
              aria-label="Memory tags"
            />
          </Field>
          <Btn onClick={handleAdd} ariaLabel="Add memory item">
            <Check size={13} />
            Add
          </Btn>
        </Card>
      )}

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: spacing.sm,
          marginBottom: spacing.lg,
          flexWrap: 'wrap',
        }}
      >
        <Field label="Filter by scope" htmlFor="filter-scope" style={{ marginBottom: 0 }}>
          <select
            id="filter-scope"
            value={filter.scope}
            onChange={(e) => setFilter({ ...filter, scope: e.target.value })}
            style={{ ...selectStyle, fontSize: fontSize.sm }}
            aria-label="Filter by scope"
          >
            <option value="">All scopes</option>
            {SCOPES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Filter by status" htmlFor="filter-stale" style={{ marginBottom: 0 }}>
          <select
            id="filter-stale"
            value={filter.stale}
            onChange={(e) => setFilter({ ...filter, stale: e.target.value })}
            style={{ ...selectStyle, fontSize: fontSize.sm }}
            aria-label="Filter by stale status"
          >
            <option value="">All</option>
            <option value="false">Active</option>
            <option value="true">Stale</option>
          </select>
        </Field>
      </div>

      {/* Memory items */}
      {loading ? (
        <div style={{ display: 'grid', gap: spacing.sm }}>
          <SkeletonCard rows={2} />
          <SkeletonCard rows={2} />
          <SkeletonCard rows={2} />
        </div>
      ) : (
        <div
          role="list"
          aria-label="Memory items"
          style={{ display: 'grid', gap: spacing.sm }}
        >
          {memory.map((item) => (
            <Card
              key={item.id}
              style={{
                padding: `${spacing.md}px ${spacing.lg}px`,
                opacity: item.is_stale ? 0.6 : 1,
                borderColor: item.is_stale ? colors.errorLight : colors.border,
              }}
            >
              <div
                role="listitem"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: spacing.sm,
                  flexWrap: 'wrap',
                  gap: spacing.sm,
                }}
              >
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge text={item.scope} color={colors.infoDark} bg={colors.primaryLightest} />
                  <Badge text={item.type} color={colors.text} bg={colors.surfaceHover} />
                  {item.is_stale && (
                    <Badge text="stale" color={colors.errorDark} bg={colors.errorLight} />
                  )}
                  <span style={{ fontSize: fontSize.micro, color: colors.textMuted }}>
                    x{item.times_used}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: spacing.xs }}>
                  <Btn
                    secondary
                    small
                    onClick={() => handleToggleStale(item)}
                    ariaLabel={item.is_stale ? `Restore memory: ${item.content?.slice(0, 30)}` : `Mark stale: ${item.content?.slice(0, 30)}`}
                    style={{ fontSize: fontSize.xs }}
                  >
                    {item.is_stale ? 'Restore' : 'Stale'}
                  </Btn>
                  <Btn
                    danger
                    small
                    onClick={() => handleDelete(item)}
                    ariaLabel={`Delete memory: ${item.content?.slice(0, 30)}`}
                  >
                    <Trash2 size={11} />
                  </Btn>
                </div>
              </div>

              <div
                style={{
                  fontSize: fontSize.md,
                  color: colors.text,
                  lineHeight: 1.6,
                  direction: 'rtl',
                  textAlign: 'right',
                }}
              >
                {item.content}
              </div>

              {item.tags?.length > 0 && (
                <div
                  style={{
                    marginTop: spacing.sm,
                    display: 'flex',
                    gap: spacing.xs,
                    flexWrap: 'wrap',
                  }}
                >
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        fontSize: fontSize.micro,
                        background: colors.surfaceHover,
                        padding: '2px 6px',
                        borderRadius: radius.sm,
                        color: colors.textMuted,
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          ))}
          {memory.length === 0 && <Empty icon={Brain} msg="No memory items yet" />}
        </div>
      )}
    </div>
  );
}
