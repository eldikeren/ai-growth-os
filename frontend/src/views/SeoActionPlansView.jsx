// ─── AI Growth OS — SEO Action Plans View ───────────────────────
import { useState, useEffect } from 'react';
import { Activity, Zap } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import {
  Badge, Card, Btn, SH, Spin, Empty, SkeletonCard,
} from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Effort / impact color maps ─────────────────────────────────
const effortColors = {
  low:    { color: colors.success,      bg: colors.success + '22' },
  medium: { color: colors.warning,      bg: colors.warning + '22' },
  high:   { color: colors.error,        bg: colors.error + '22' },
};

const impactColors = {
  low:    { color: colors.textDisabled,  bg: colors.textDisabled + '22', border: colors.textDisabled },
  medium: { color: colors.warning,       bg: colors.warning + '22',      border: colors.warning },
  high:   { color: colors.success,       bg: colors.success + '22',      border: colors.success },
};

// ─── Single Plan Card ───────────────────────────────────────────
function PlanCard({ p, onUpdate }) {
  const effort = effortColors[p.effort] || effortColors.low;
  const impact = impactColors[p.expected_impact] || impactColors.low;

  return (
    <Card
      style={{
        marginBottom: spacing.md,
        borderRight: `4px solid ${impact.border}`,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: spacing.sm,
          flexWrap: 'wrap',
          gap: spacing.sm,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: fontSize.lg,
              fontWeight: fontWeight.bold,
              color: colors.text,
              direction: 'rtl',
              textAlign: 'right',
            }}
          >
            {p.title}
          </div>
          <div
            style={{
              fontSize: fontSize.xs,
              color: colors.textDisabled,
              marginTop: 2,
            }}
          >
            {p.action_type?.replace(/_/g, ' ')} &middot; {p.owner_lane}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            gap: spacing.xs,
            flexShrink: 0,
          }}
        >
          <Badge text={p.effort} color={effort.color} bg={effort.bg} />
          <Badge
            text={`Impact: ${p.expected_impact}`}
            color={impact.color}
            bg={impact.bg}
          />
        </div>
      </div>

      {/* Description (RTL) */}
      {p.description && (
        <div
          style={{
            fontSize: fontSize.sm,
            color: colors.text,
            marginBottom: spacing.sm,
            direction: 'rtl',
            textAlign: 'right',
            lineHeight: 1.5,
          }}
        >
          {p.description}
        </div>
      )}

      {/* Target keyword (RTL) */}
      {p.target_keyword && (
        <div
          style={{
            fontSize: fontSize.xs,
            color: colors.textMuted,
            marginBottom: spacing.sm,
            direction: 'rtl',
          }}
        >
          {'\u05DE\u05D9\u05DC\u05EA \u05DE\u05E4\u05EA\u05D7: '}{p.target_keyword}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
        {p.status === 'open' && (
          <Btn
            small
            secondary
            onClick={() => onUpdate(p.id, { status: 'in_progress' })}
            ariaLabel={`Start plan: ${p.title}`}
          >
            Start
          </Btn>
        )}
        {p.status === 'in_progress' && (
          <Btn
            small
            color={colors.success}
            onClick={() =>
              onUpdate(p.id, {
                status: 'done',
                completed_at: new Date().toISOString(),
              })
            }
            ariaLabel={`Mark done: ${p.title}`}
          >
            Mark Done
          </Btn>
        )}
        {p.status !== 'dismissed' && (
          <Btn
            small
            secondary
            onClick={() => onUpdate(p.id, { status: 'dismissed' })}
            ariaLabel={`Dismiss plan: ${p.title}`}
          >
            Dismiss
          </Btn>
        )}
      </div>
    </Card>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export default function SeoActionPlansView({ clientId }) {
  const [plans, setPlans] = useState([]);
  const [gen, setGen] = useState(false);
  const [filter, setFilter] = useState('open');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const d = await api(`/clients/${clientId}/seo-action-plans?status=${filter}`);
      setPlans(d);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId, filter]);

  const generate = async () => {
    setGen(true);
    try {
      await api(`/clients/${clientId}/seo-action-plans/generate`, { method: 'POST' });
      await load();
    } catch (e) {
      alert(e.message);
    }
    setGen(false);
  };

  const update = async (id, patch) => {
    try {
      await api(`/seo-action-plans/${id}`, { method: 'PATCH', body: patch });
      await load();
    } catch (e) {
      alert(e.message);
    }
  };

  // ── Guard states ────────────────────────────────────────────
  if (!clientId) {
    return <Empty icon={Activity} msg="Select a client to view SEO action plans" />;
  }

  if (loading && plans.length === 0) {
    return (
      <div>
        <SH title="SEO Action Plans" sub="AI-generated, prioritized SEO task list" />
        <SkeletonCard rows={4} />
      </div>
    );
  }

  // ── Filter buttons ──────────────────────────────────────────
  const statuses = ['open', 'in_progress', 'done'];

  return (
    <div>
      <SH
        title="SEO Action Plans"
        sub="AI-generated, prioritized SEO task list"
        action={
          <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
            {statuses.map((s) => (
              <Btn
                key={s}
                small
                onClick={() => setFilter(s)}
                color={filter === s ? colors.primary : colors.textMuted}
                secondary={filter !== s}
                ariaLabel={`Filter by ${s.replace('_', ' ')}`}
              >
                {s.replace('_', ' ')}
              </Btn>
            ))}
            <Btn
              onClick={generate}
              disabled={gen}
              small
              color={colors.primary}
              ariaLabel="Generate SEO action plans"
            >
              {gen ? <Spin /> : <Zap size={12} />} Generate
            </Btn>
          </div>
        }
      />

      {plans.map((p) => (
        <PlanCard key={p.id} p={p} onUpdate={update} />
      ))}

      {plans.length === 0 && (
        <Empty
          icon={Activity}
          msg={`No ${filter.replace('_', ' ')} action plans \u2014 click Generate`}
        />
      )}
    </div>
  );
}
