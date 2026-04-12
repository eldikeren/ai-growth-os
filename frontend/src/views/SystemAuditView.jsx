// ─── System Audit & Client Truth View ────────────────────────────
// Real operational coordination audit — not cosmetic verification.
// 12 categories, 30 tests, growth state, blockers, freshness.
import { useState, useEffect, useCallback } from 'react';
import {
  Shield, RefreshCw, Check, X, AlertTriangle, ChevronDown, ChevronRight,
  Activity, Database, Zap, Eye, Clock, Target, Link, Globe, Users,
  TrendingUp, Server, Lock, FileText, Layers, BarChart3
} from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Card, Btn, Spin, Empty, SH } from '../components/index.jsx';

const MONO = "'SF Mono', 'Fira Code', Consolas, monospace";

const CATEGORY_META = {
  execution_engine:        { label: 'Execution Engine',      icon: Zap,         color: '#3B82F6' },
  orchestration:           { label: 'Orchestration',         icon: Layers,      color: '#8B5CF6' },
  validation_chain:        { label: 'Validation Chain',      icon: Shield,      color: '#10B981' },
  memory:                  { label: 'Memory / Learning',     icon: Database,    color: '#F59E0B' },
  client_growth_database:  { label: 'Client Growth DB',      icon: TrendingUp,  color: '#EC4899' },
  integration_freshness:   { label: 'Integration Freshness', icon: Clock,       color: '#14B8A6' },
  website_control:         { label: 'Website Control',       icon: Globe,       color: '#6366F1' },
  system_trust:            { label: 'System Trust',          icon: Lock,        color: '#EF4444' },
  auth_model:              { label: 'Auth Model',            icon: Users,       color: '#7C3AED' },
  perplexity_geo:          { label: 'Perplexity / GEO',     icon: Eye,         color: '#06B6D4' },
  browser_tasks:           { label: 'Browser Operator',      icon: Globe,       color: '#D946EF' },
};

const SCORE_COLORS = ['#9CA3AF', '#EF4444', '#F97316', '#F59E0B', '#10B981', '#059669'];

function ScoreRing({ score, size = 100 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#10B981' : score >= 55 ? '#F59E0B' : '#EF4444';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={colors.borderLight} strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize={size * 0.28} fontWeight="800" fontFamily={MONO}
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
        {score}%
      </text>
    </svg>
  );
}

function CategoryCard({ catKey, data, expanded, onToggle }) {
  const meta = CATEGORY_META[catKey] || { label: catKey, icon: Activity, color: '#6B7280' };
  const Icon = meta.icon;
  const scoreColor = SCORE_COLORS[data.score] || '#6B7280';

  return (
    <div style={{
      background: colors.surface, borderRadius: radius.xl,
      border: `1px solid ${data.score >= 4 ? '#10B98133' : data.score >= 2 ? '#F59E0B33' : '#EF444433'}`,
      overflow: 'hidden', transition: transitions.fast,
    }}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
          cursor: 'pointer', transition: transitions.fast,
        }}
        onMouseEnter={e => e.currentTarget.style.background = colors.surfaceHover}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <div style={{
          width: 36, height: 36, borderRadius: radius.lg,
          background: `${meta.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={18} color={meta.color} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: colors.text }}>
            {meta.label}
          </div>
          <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            {data.passed}/{data.total} passed
          </div>
        </div>
        <div style={{ textAlign: 'center', marginRight: 8 }}>
          <div style={{
            fontSize: fontSize.lg, fontWeight: fontWeight.extrabold, fontFamily: MONO,
            color: scoreColor,
          }}>
            {data.score}/5
          </div>
          <div style={{ fontSize: 9, color: scoreColor, textTransform: 'uppercase', fontWeight: fontWeight.bold }}>
            {data.score_label}
          </div>
        </div>
        {expanded ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
      </div>

      {expanded && (
        <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.tests.map(test => (
            <div key={test.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
              borderRadius: radius.lg,
              background: test.pass ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${test.pass ? '#10B98122' : '#EF444422'}`,
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: radius.full, flexShrink: 0, marginTop: 1,
                background: test.pass ? '#10B981' : '#EF4444',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {test.pass ? <Check size={12} color="#fff" /> : <X size={12} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontSize: fontSize.xs, fontWeight: fontWeight.bold, fontFamily: MONO,
                    color: test.pass ? '#10B981' : '#EF4444',
                  }}>
                    {test.id}
                  </span>
                  <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.text }}>
                    {test.name}
                  </span>
                </div>
                <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 3 }}>
                  {test.detail}
                </div>
                {!test.pass && test.fix && (
                  <div style={{
                    fontSize: fontSize.xs, color: '#B91C1C', marginTop: 6,
                    padding: '6px 10px', background: '#FEE2E2', borderRadius: radius.md,
                    borderLeft: '3px solid #EF4444',
                  }}>
                    {test.fix}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GrowthStatePanel({ state }) {
  if (!state) return null;

  const sections = [
    { label: 'Execution', items: [
      { k: 'Active Agents', v: state.active_agents },
      { k: 'Runs (7d)', v: state.total_runs_7d },
      { k: 'Successful', v: state.successful_runs_7d, color: '#10B981' },
      { k: 'Failed', v: state.failed_runs_7d, color: state.failed_runs_7d > 0 ? '#EF4444' : null },
      { k: 'Real Tool Calls', v: state.real_tool_executions },
    ]},
    { label: 'SEO Data', items: [
      { k: 'Baselines', v: `${state.baselines_fresh} fresh / ${state.baselines_stale} stale` },
      { k: 'Keywords', v: `${state.keywords_with_position} ranked / ${state.keywords_tracked} total` },
      { k: 'Keywords Stale', v: state.keywords_stale, color: state.keywords_stale > 0 ? '#F59E0B' : null },
      { k: 'Competitors', v: state.competitors_tracked },
    ]},
    { label: 'Operations', items: [
      { k: 'Memory Items', v: state.memory_items },
      { k: 'Open Incidents', v: state.open_incidents, color: state.open_incidents > 0 ? '#EF4444' : null },
      { k: 'Pending Approvals', v: state.pending_approvals },
      { k: 'Queue Pending', v: state.queue_pending },
      { k: 'Queue Stuck', v: state.queue_stuck, color: state.queue_stuck > 0 ? '#EF4444' : null },
    ]},
    { label: 'Integrations', items: [
      { k: 'Connected Services', v: state.connected_services },
      { k: 'Missing OAuth', v: state.missing_oauth?.length > 0 ? state.missing_oauth.join(', ') : 'None', color: state.missing_oauth?.length > 2 ? '#EF4444' : null },
      { k: 'Validation Chains', v: state.validation_chains_run },
    ]},
  ];

  return (
    <div style={{
      background: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <BarChart3 size={18} color={colors.primary} />
        <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
          {state.name} — Growth State
        </span>
        <span style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>{state.domain}</span>
      </div>

      {/* Last activity */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          Last success: <span style={{ fontFamily: MONO, color: state.last_successful_run ? '#10B981' : '#EF4444' }}>
            {state.last_successful_run ? new Date(state.last_successful_run).toLocaleString() : 'Never'}
          </span>
        </div>
        <div style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          Last run: <span style={{ fontFamily: MONO }}>
            {state.last_any_run ? new Date(state.last_any_run).toLocaleString() : 'Never'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        {sections.map(section => (
          <div key={section.label} style={{
            padding: '14px 16px', borderRadius: radius.lg,
            background: colors.backgroundAlt || '#F9FAFB', border: `1px solid ${colors.borderLight}`,
          }}>
            <div style={{
              fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: colors.textSecondary,
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10,
            }}>
              {section.label}
            </div>
            {section.items.map(item => (
              <div key={item.k} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '4px 0', fontSize: fontSize.sm,
              }}>
                <span style={{ color: colors.textMuted }}>{item.k}</span>
                <span style={{
                  fontFamily: MONO, fontWeight: fontWeight.bold,
                  color: item.color || colors.text, fontSize: fontSize.sm,
                }}>
                  {item.v}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BlockersList({ blockers }) {
  if (!blockers?.length) return null;
  return (
    <div style={{
      background: '#FEF2F2', borderRadius: radius.xl, border: '1px solid #FECACA',
      padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AlertTriangle size={16} color="#DC2626" />
        <span style={{ fontSize: fontSize.base, fontWeight: fontWeight.bold, color: '#991B1B' }}>
          Blockers ({blockers.length})
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {blockers.map((b, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: '10px 14px',
            background: '#fff', borderRadius: radius.lg, border: '1px solid #FECACA',
          }}>
            <span style={{
              fontSize: fontSize.xs, fontFamily: MONO, fontWeight: fontWeight.bold,
              color: b.severity === 'critical' ? '#DC2626' : '#EA580C',
              textTransform: 'uppercase', flexShrink: 0, marginTop: 2,
            }}>
              {b.severity}
            </span>
            <div>
              <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: '#991B1B' }}>
                [{b.test}] {b.name}
              </div>
              <div style={{ fontSize: fontSize.xs, color: '#B91C1C', marginTop: 2 }}>
                {b.fix}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────
export default function SystemAuditView({ clientId }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState({});

  const runAudit = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api(`/clients/${clientId}/system-audit`);
      setData(result);
      // Auto-expand failed categories
      const autoExpand = {};
      if (result.categories) {
        for (const [key, cat] of Object.entries(result.categories)) {
          if (cat.passed < cat.total) autoExpand[key] = true;
        }
      }
      setExpanded(autoExpand);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { runAudit(); }, [runAudit]);

  if (!clientId) return <Empty icon={Shield} msg="Select a client to run system audit" />;

  const categories = data?.categories ? Object.entries(data.categories) : [];

  return (
    <div>
      <SH
        title="System Audit"
        sub="Coordination & Execution Truth — Real operational scoring"
        action={
          <Btn onClick={runAudit} disabled={loading} ariaLabel="Run system audit">
            {loading ? <Spin /> : <RefreshCw size={13} />}
            Run Audit
          </Btn>
        }
      />

      {error && (
        <div style={{
          padding: spacing.lg, marginBottom: spacing.lg,
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: radius.lg,
          color: '#991B1B', fontSize: fontSize.sm,
        }}>
          Error: {error}
        </div>
      )}

      {loading && !data && (
        <div style={{ textAlign: 'center', padding: spacing['2xl'], color: colors.textMuted }}>
          <Spin /> Running comprehensive audit...
        </div>
      )}

      {data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
          {/* ── Hero Score ── */}
          <div style={{
            background: colors.surface, borderRadius: radius.xl, border: `1px solid ${colors.border}`,
            padding: '24px 32px', display: 'flex', alignItems: 'center', gap: 32,
            flexWrap: 'wrap',
          }}>
            <ScoreRing score={data.overall_score} size={120} />
            <div>
              <div style={{ fontSize: 28, fontWeight: fontWeight.extrabold, color: colors.text }}>
                {data.total_passed}/{data.total_tests} Tests Passed
              </div>
              <div style={{
                fontSize: fontSize.lg, color: SCORE_COLORS[
                  data.overall_score >= 90 ? 5 : data.overall_score >= 75 ? 4 :
                  data.overall_score >= 55 ? 3 : data.overall_score >= 35 ? 2 : 1
                ],
                fontWeight: fontWeight.bold, textTransform: 'uppercase',
              }}>
                {data.overall_label}
              </div>
              <div style={{ fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 4 }}>
                Audited: {new Date(data.audit_timestamp).toLocaleString()}
              </div>
            </div>

            {/* Category score bars */}
            <div style={{ flex: 1, minWidth: 280 }}>
              {categories.map(([key, cat]) => {
                const meta = CATEGORY_META[key] || { label: key, color: '#6B7280' };
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{
                      fontSize: 11, color: colors.textMuted, width: 130, textAlign: 'right',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {meta.label}
                    </span>
                    <div style={{
                      flex: 1, height: 8, background: colors.borderLight, borderRadius: 4,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${(cat.passed / cat.total) * 100}%`,
                        height: '100%', borderRadius: 4,
                        background: SCORE_COLORS[cat.score],
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <span style={{
                      fontSize: 11, fontFamily: MONO, fontWeight: fontWeight.bold,
                      color: SCORE_COLORS[cat.score], width: 30,
                    }}>
                      {cat.score}/5
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Blockers ── */}
          <BlockersList blockers={data.blockers} />

          {/* ── Client Growth State ── */}
          <GrowthStatePanel state={data.growth_state} />

          {/* ── Category Details ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {categories.map(([key, cat]) => (
              <CategoryCard
                key={key}
                catKey={key}
                data={cat}
                expanded={!!expanded[key]}
                onToggle={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
