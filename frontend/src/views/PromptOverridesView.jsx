// ─── AI Growth OS — Prompt Overrides View ───────────────────────
// 2-column layout: agent list (260px) + detail panel
// Manage client-specific prompt overrides per agent
import { useState, useEffect, useCallback } from 'react';
import { FileText, Check } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Card, Btn, SH, Badge, Empty, Spin, Skeleton, inputStyle } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Agent List Skeleton ────────────────────────────────────────
function AgentListSkeleton() {
  return (
    <div>
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div
          key={i}
          style={{
            padding: `${spacing.sm}px ${spacing.md}px`,
            marginBottom: spacing.xs,
            borderRadius: radius.md,
            border: `1px solid ${colors.borderLight}`,
          }}
        >
          <Skeleton width="70%" height={12} style={{ marginBottom: spacing.xs }} />
          <Skeleton width="50%" height={10} />
        </div>
      ))}
    </div>
  );
}

export default function PromptOverridesView({ clientId }) {
  const [overrides, setOverrides] = useState([]);
  const [agents, setAgents] = useState([]);
  const [sel, setSel] = useState(null);
  const [diff, setDiff] = useState(null);
  const [editing, setEditing] = useState(false);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [ov, ag] = await Promise.all([
        api(`/clients/${clientId}/prompt-overrides`),
        api('/agents'),
      ]);
      setOverrides(ov);
      setAgents(ag);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDiff = async (agentId) => {
    try {
      const d = await api(`/clients/${clientId}/agents/${agentId}/prompt-diff`);
      setDiff(d);
      setNewText(d.client_override?.prompt_text || d.base_prompt || '');
    } catch (e) {
      console.error(e);
    }
  };

  const save = async (agentId) => {
    setSaving(true);
    try {
      await api(`/clients/${clientId}/prompt-overrides`, {
        method: 'POST',
        body: { agentTemplateId: agentId, promptText: newText, notes: 'Manual override' },
      });
      await load();
      await loadDiff(agentId);
      setEditing(false);
    } catch (e) {
      alert(e.message);
    }
    setSaving(false);
  };

  const deactivate = async (overrideId, agentId) => {
    try {
      await api(`/prompt-overrides/${overrideId}`, {
        method: 'PATCH',
        body: { is_active: false },
      });
      await load();
      await loadDiff(agentId);
    } catch (e) {
      alert(e.message);
    }
  };

  if (!clientId) {
    return <Empty icon={FileText} msg="Select a client to manage prompt overrides" />;
  }

  return (
    <div>
      <SH
        title="Prompt Overrides"
        sub="Client-specific prompt overrides take priority over base prompts and prompt versions"
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          gap: spacing.xl,
          alignItems: 'start',
        }}
      >
        {/* ─── Agent List Panel ────────────────────────────────── */}
        <div>
          <div
            style={{
              fontSize: fontSize.sm,
              fontWeight: fontWeight.bold,
              color: colors.textMuted,
              marginBottom: spacing.md,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Select Agent to Override
          </div>

          {loading ? (
            <AgentListSkeleton />
          ) : (
            <nav aria-label="Agent list" role="listbox">
              {agents.map(a => {
                const isSelected = sel?.id === a.id;
                const hasOverride = overrides.find(o => o.agent_template_id === a.id);

                return (
                  <div
                    key={a.id}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => {
                      setSel(a);
                      loadDiff(a.id);
                      setEditing(false);
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSel(a);
                        loadDiff(a.id);
                        setEditing(false);
                      }
                    }}
                    style={{
                      padding: `${spacing.sm}px ${spacing.md}px`,
                      borderRadius: radius.md,
                      cursor: 'pointer',
                      marginBottom: spacing.xs,
                      border: `1px solid ${isSelected ? colors.primary : colors.borderLight}`,
                      background: isSelected ? colors.primaryLightest : colors.surface,
                      transition: transitions.fast,
                    }}
                  >
                    <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                      {a.name}
                    </div>
                    <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: 2 }}>
                      {a.lane}
                    </div>
                    {hasOverride && (
                      <div style={{ marginTop: spacing.xs }}>
                        <Badge text="Override Active" color={colors.primary} bg={colors.primaryLightest} />
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          )}
        </div>

        {/* ─── Detail Panel ───────────────────────────────────── */}
        {sel && diff ? (
          <Card>
            {/* Agent name and active source */}
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.xs }}>
              {sel.name}
            </div>
            <div
              style={{
                fontSize: fontSize.xs,
                color: colors.textDisabled,
                marginBottom: spacing.lg,
              }}
            >
              Active source: <strong style={{ color: colors.textSecondary }}>{diff.active_source}</strong>
            </div>

            {!editing ? (
              <>
                {/* Current prompt display */}
                <div style={{ marginBottom: spacing.md }}>
                  <div
                    style={{
                      fontSize: fontSize.sm,
                      fontWeight: fontWeight.semibold,
                      color: colors.text,
                      marginBottom: spacing.sm,
                    }}
                  >
                    {diff.client_override ? 'Client Override Active' : 'Base Prompt (no override)'}
                  </div>
                  <pre
                    aria-label="Prompt text"
                    style={{
                      background: colors.background,
                      border: `1px solid ${colors.borderLight}`,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      fontSize: fontSize.xs,
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: 250,
                      overflow: 'auto',
                      direction: 'ltr',
                      textAlign: 'left',
                      color: colors.textSecondary,
                      margin: 0,
                    }}
                  >
                    {diff.client_override?.prompt_text || diff.base_prompt || '(empty)'}
                  </pre>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
                  <Btn onClick={() => setEditing(true)} ariaLabel={diff.client_override ? 'Edit override' : 'Create override'}>
                    {diff.client_override ? 'Edit Override' : 'Create Override'}
                  </Btn>
                  {diff.client_override && (
                    <Btn
                      secondary
                      small
                      onClick={() => deactivate(diff.client_override.id, sel.id)}
                      ariaLabel="Deactivate override"
                    >
                      Deactivate
                    </Btn>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Editing textarea */}
                <label
                  htmlFor="prompt-override-editor"
                  style={{
                    fontSize: fontSize.sm,
                    fontWeight: fontWeight.semibold,
                    color: colors.text,
                    display: 'block',
                    marginBottom: spacing.sm,
                  }}
                >
                  Edit prompt override
                </label>
                <textarea
                  id="prompt-override-editor"
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  rows={12}
                  style={{
                    ...inputStyle,
                    fontFamily: 'monospace',
                    fontSize: fontSize.sm,
                    direction: 'ltr',
                    textAlign: 'left',
                    resize: 'vertical',
                    marginBottom: spacing.md,
                    minHeight: 200,
                  }}
                />
                <div style={{ display: 'flex', gap: spacing.sm }}>
                  <Btn
                    onClick={() => save(sel.id)}
                    color={colors.success}
                    disabled={saving}
                    ariaLabel="Save override"
                  >
                    {saving ? <Spin /> : <Check size={13} />}
                    {saving ? 'Saving...' : 'Save Override'}
                  </Btn>
                  <Btn secondary onClick={() => setEditing(false)} ariaLabel="Cancel editing">
                    Cancel
                  </Btn>
                </div>
              </>
            )}
          </Card>
        ) : (
          <Card>
            <Empty icon={FileText} msg="Select an agent to view or create a prompt override" />
          </Card>
        )}
      </div>
    </div>
  );
}
