// ─── AI Growth OS — Runs View v2 ─────────────────────────────────
// Complete redesign: readable insights, action buttons, approval workflow
import { useState, useEffect } from 'react';
import { Play, Zap, Activity, X, ChevronRight, ChevronDown, Check, AlertTriangle, Target, TrendingUp, Search, Globe, Link2, FileText, BarChart3, Shield, Clock, ArrowRight, Sparkles, Eye, EyeOff, RefreshCw, Settings, CheckCircle2, XCircle, ThumbsUp, ThumbsDown, Lightbulb, ArrowUpRight, ExternalLink, Gauge } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';
import { Badge, Dot, Card, Btn, GradientBtn, SH, Empty, Spin, SkeletonCard, Skeleton, Field, selectStyle, Tabs, GlassCard } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Score Ring (circular gauge) ─────────────────────────────
function ScoreRing({ score, size = 80, strokeWidth = 6, label }) {
  const numScore = typeof score === 'number' ? score : parseInt(score) || 0;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (numScore / 100) * circumference;
  const color = numScore >= 80 ? colors.success : numScore >= 50 ? colors.warning : colors.error;
  return (
    <div style={{ textAlign: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={colors.borderLight} strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
      </svg>
      <div style={{ marginTop: -size/2 - 12, fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color, lineHeight: `${size}px` }}>
        {numScore}
      </div>
      {label && <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 }}>{label}</div>}
    </div>
  );
}

// ─── Priority indicator ──────────────────────────────────────
function PriorityBadge({ priority }) {
  const p = (priority || '').toLowerCase();
  const config = {
    critical: { color: '#DC2626', bg: '#FEE2E2', icon: '🔴' },
    high: { color: '#F59E0B', bg: '#FEF3C7', icon: '🟠' },
    medium: { color: '#6366F1', bg: '#EEF2FF', icon: '🔵' },
    low: { color: '#9CA3AF', bg: '#F3F4F6', icon: '⚪' },
  };
  const c = config[p] || config.medium;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: c.bg, color: c.color, padding: '3px 10px',
      borderRadius: radius.full, fontSize: fontSize.xs, fontWeight: fontWeight.bold,
    }}>
      {c.icon} {priority}
    </span>
  );
}

// ─── Smart Output Parser ─────────────────────────────────────
// Parses agent JSON output into structured sections
function parseAgentOutput(output) {
  if (!output) return null;

  const data = typeof output === 'string' ? (() => { try { return JSON.parse(output); } catch { return null; } })() : output;
  if (!data) return null;

  const sections = {};

  // Extract health/SEO score
  if (data.seo_health_score != null) sections.healthScore = data.seo_health_score;
  if (data.overall_score != null) sections.healthScore = data.overall_score;
  if (data.score != null && !sections.healthScore) sections.healthScore = data.score;

  // Summary / overview
  if (data.summary) sections.summary = data.summary;
  if (data.overview) sections.summary = data.overview;
  if (data.analysis_summary) sections.summary = data.analysis_summary;

  // Action plan items
  if (data.action_plan) sections.actionPlan = Array.isArray(data.action_plan) ? data.action_plan : [data.action_plan];
  if (data.actions) sections.actionPlan = Array.isArray(data.actions) ? data.actions : [data.actions];
  if (data.recommendations) sections.actionPlan = Array.isArray(data.recommendations) ? data.recommendations : [data.recommendations];

  // Content gaps
  if (data.content_gaps) sections.contentGaps = Array.isArray(data.content_gaps) ? data.content_gaps : [data.content_gaps];

  // Keywords / rankings
  if (data.rankings) sections.rankings = data.rankings;
  if (data.keywords) sections.rankings = data.keywords;
  if (data.keyword_rankings) sections.rankings = data.keyword_rankings;

  // Opportunities
  if (data.opportunities) sections.opportunities = Array.isArray(data.opportunities) ? data.opportunities : [data.opportunities];
  if (data.quick_wins) sections.quickWins = Array.isArray(data.quick_wins) ? data.quick_wins : [data.quick_wins];

  // Backlinks
  if (data.backlinks) sections.backlinks = data.backlinks;
  if (data.backlink_analysis) sections.backlinks = data.backlink_analysis;

  // Technical issues
  if (data.technical_issues) sections.technical = Array.isArray(data.technical_issues) ? data.technical_issues : [data.technical_issues];
  if (data.issues) sections.technical = Array.isArray(data.issues) ? data.issues : [data.issues];

  // Competitor data
  if (data.competitor_analysis) sections.competitors = data.competitor_analysis;
  if (data.competitors) sections.competitors = data.competitors;

  // Methodology / how scores were derived
  if (data.methodology) sections.methodology = data.methodology;
  if (data.scoring_methodology) sections.methodology = data.scoring_methodology;
  if (data.data_sources) sections.dataSources = data.data_sources;

  // Changes made
  if (data.changes_made) sections.changesMade = Array.isArray(data.changes_made) ? data.changes_made : [data.changes_made];

  // Metrics breakdown
  if (data.metrics) sections.metrics = data.metrics;
  if (data.scores) sections.metrics = data.scores;
  if (data.score_breakdown) sections.metrics = data.score_breakdown;

  // Catch-all: any remaining top-level keys
  const knownKeys = new Set([
    'seo_health_score', 'overall_score', 'score', 'summary', 'overview', 'analysis_summary',
    'action_plan', 'actions', 'recommendations', 'content_gaps', 'rankings', 'keywords',
    'keyword_rankings', 'opportunities', 'quick_wins', 'backlinks', 'backlink_analysis',
    'technical_issues', 'issues', 'competitor_analysis', 'competitors', 'methodology',
    'scoring_methodology', 'data_sources', 'changes_made', 'metrics', 'scores', 'score_breakdown',
  ]);
  // Filter out internal/system keys and collect extras
  const internalKeys = new Set(['_truth_gate', '_meta', '_debug', '_raw', '_agent_config']);
  const extraKeys = Object.keys(data).filter(k => !knownKeys.has(k) && !internalKeys.has(k) && !k.startsWith('_'));
  if (extraKeys.length > 0) {
    sections.extra = {};
    extraKeys.forEach(k => { sections.extra[k] = data[k]; });
  }

  return sections;
}

// ─── Render an action plan item ──────────────────────────────
function ActionItem({ item, index, onApprove, onReject, onRun }) {
  const [expanded, setExpanded] = useState(false);

  // Normalize item shape
  const title = item.title || item.action || item.name || item.recommendation || `Action ${index + 1}`;
  const description = item.description || item.details || item.rationale || item.explanation || '';
  const priority = item.priority || item.severity || item.impact || 'medium';
  const effort = item.effort || item.complexity || item.estimated_effort || '';
  const impact = item.expected_impact || item.impact_description || item.benefit || '';
  const methodology = item.how_tested || item.methodology || item.data_source || '';
  const status = item.status || 'pending';

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      marginBottom: spacing.md,
      overflow: 'hidden',
      background: colors.surface,
      transition: transitions.fast,
    }}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: spacing.md,
          width: '100%', padding: `${spacing.md}px ${spacing.lg}px`,
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: radius.md,
          background: colors.primaryLightest, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary,
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text }}>{title}</div>
          {!expanded && description && (
            <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {typeof description === 'string' ? description : JSON.stringify(description)}
            </div>
          )}
        </div>
        <PriorityBadge priority={priority} />
        {expanded ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: `0 ${spacing.lg}px ${spacing.lg}px`, borderTop: `1px solid ${colors.borderLight}` }}>
          {/* Description */}
          {description && (
            <div style={{ marginTop: spacing.md, fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 1.7 }}>
              {typeof description === 'string' ? description : (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>
                  {JSON.stringify(description, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Meta info tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
            {effort && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: fontSize.xs, color: colors.textMuted, background: colors.surfaceHover, padding: '4px 10px', borderRadius: radius.full }}>
                <Clock size={11} /> Effort: {effort}
              </span>
            )}
            {impact && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: fontSize.xs, color: colors.success, background: colors.successLight, padding: '4px 10px', borderRadius: radius.full }}>
                <TrendingUp size={11} /> Impact: {typeof impact === 'string' ? impact : JSON.stringify(impact)}
              </span>
            )}
          </div>

          {/* Methodology / how it was tested */}
          {methodology && (
            <div style={{
              marginTop: spacing.md, padding: spacing.md,
              background: '#F0F9FF', borderRadius: radius.md,
              border: '1px solid #BAE6FD',
            }}>
              <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                <Lightbulb size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                How This Was Determined
              </div>
              <div style={{ fontSize: fontSize.sm, color: '#0C4A6E', lineHeight: 1.6 }}>
                {typeof methodology === 'string' ? methodology : JSON.stringify(methodology)}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.lg, flexWrap: 'wrap' }}>
            <Btn onClick={() => onRun && onRun(item)} color={colors.primary} ariaLabel={`Run fix: ${title}`}>
              <Zap size={13} /> Run This Fix
            </Btn>
            <Btn onClick={() => onApprove && onApprove(item)} color={colors.success} ariaLabel={`Approve: ${title}`}>
              <ThumbsUp size={13} /> Approve
            </Btn>
            <Btn onClick={() => onReject && onReject(item)} secondary ariaLabel={`Dismiss: ${title}`}>
              <ThumbsDown size={13} /> Dismiss
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Metric Breakdown Card ───────────────────────────────────
function MetricCard({ label, value, maxValue = 100, detail }) {
  const numVal = typeof value === 'number' ? value : parseInt(value) || 0;
  const pct = Math.min(100, (numVal / maxValue) * 100);
  const color = pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.error;
  return (
    <div style={{
      padding: spacing.md, background: colors.surfaceHover,
      borderRadius: radius.lg, flex: '1 1 200px', minWidth: 180,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: spacing.sm }}>
        <span style={{ fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: fontWeight.medium }}>{label}</span>
        <span style={{ fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, color }}>{numVal}</span>
      </div>
      <div style={{ height: 4, background: colors.borderLight, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 1s ease-out' }} />
      </div>
      {detail && <div style={{ fontSize: fontSize.xs, color: colors.textMuted, marginTop: 4 }}>{detail}</div>}
    </div>
  );
}

// ─── Structured Run Detail ───────────────────────────────────
function RunDetail({ run, onClose, onRunAction, clientId }) {
  const sections = parseAgentOutput(run.output);
  const [showRawJson, setShowRawJson] = useState(false);
  const [tab, setTab] = useState('insights');
  const [actionStates, setActionStates] = useState({});

  const handleRunAction = async (item, index) => {
    setActionStates(prev => ({ ...prev, [index]: 'running' }));
    try {
      if (onRunAction) await onRunAction(item);
      setActionStates(prev => ({ ...prev, [index]: 'done' }));
    } catch {
      setActionStates(prev => ({ ...prev, [index]: 'error' }));
    }
  };

  const handleApprove = (item, index) => {
    setActionStates(prev => ({ ...prev, [index]: 'approved' }));
  };

  const handleReject = (item, index) => {
    setActionStates(prev => ({ ...prev, [index]: 'rejected' }));
  };

  const agentName = run.agent_templates?.name || 'Agent Run';
  const agentLane = run.agent_templates?.lane || '';
  const laneColor = colors.lanes[agentLane] || colors.primary;

  // Build tab list dynamically based on available sections
  const availableTabs = [{ id: 'insights', label: 'Insights' }];
  if (sections?.actionPlan?.length) availableTabs.push({ id: 'actions', label: `Actions (${sections.actionPlan.length})` });
  if (sections?.contentGaps?.length) availableTabs.push({ id: 'gaps', label: 'Content Gaps' });
  if (sections?.rankings) availableTabs.push({ id: 'rankings', label: 'Rankings' });
  if (sections?.opportunities?.length || sections?.quickWins?.length) availableTabs.push({ id: 'opportunities', label: 'Opportunities' });
  if (sections?.technical?.length) availableTabs.push({ id: 'technical', label: 'Technical Issues' });
  if (sections?.backlinks) availableTabs.push({ id: 'backlinks', label: 'Backlinks' });
  if (sections?.competitors) availableTabs.push({ id: 'competitors', label: 'Competitors' });
  availableTabs.push({ id: 'raw', label: 'Raw Data' });

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
      }} />

      {/* Slide-in panel */}
      <div style={{
        position: 'relative', width: '100%', maxWidth: 800,
        background: colors.background, overflowY: 'auto',
        boxShadow: shadows.xl, animation: 'slideInRight 0.3s ease-out',
      }}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: colors.surface, borderBottom: `1px solid ${colors.border}`,
          padding: `${spacing.xl}px ${spacing['2xl']}px`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: 4 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: laneColor, display: 'inline-block',
                  boxShadow: `0 0 8px ${laneColor}`,
                }} />
                <span style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.medium }}>{agentLane}</span>
              </div>
              <h2 style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.text, margin: 0 }}>
                {agentName}
              </h2>
              <div style={{ display: 'flex', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' }}>
                <Badge text={run.status} color={colors.status[run.status]} bg={(colors.status[run.status] || colors.textDisabled) + '22'} />
                <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                  <Clock size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  {new Date(run.created_at).toLocaleString()}
                </span>
                {run.duration_ms && (
                  <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                    Duration: {run.duration_ms > 60000 ? `${Math.round(run.duration_ms / 60000)}m` : `${Math.round(run.duration_ms / 1000)}s`}
                  </span>
                )}
                {run.tokens_used && (
                  <span style={{ fontSize: fontSize.xs, color: colors.textSecondary }}>
                    {run.tokens_used.toLocaleString()} tokens
                  </span>
                )}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: colors.surfaceHover, border: 'none', borderRadius: radius.md,
              width: 32, height: 32, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <X size={16} color={colors.textMuted} />
            </button>
          </div>

          {/* Truth Gate — confidence, completeness, missing sources */}
          {run.output?._truth_gate && (() => {
            const tg = run.output._truth_gate;
            const confColor = { high: '#10B981', medium: '#F59E0B', low: '#F97316', very_low: '#EF4444' }[tg.confidence] || '#9CA3AF';
            const compColor = tg.data_completeness_percent >= 70 ? '#10B981' : tg.data_completeness_percent >= 50 ? '#F59E0B' : '#EF4444';
            return (
              <div style={{
                marginTop: spacing.lg, padding: spacing.md,
                background: confColor + '0A', border: `1px solid ${confColor}33`,
                borderRadius: radius.lg,
              }}>
                <div style={{ display: 'flex', gap: spacing.lg, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: radius.full, fontSize: 10, fontWeight: 800,
                    textTransform: 'uppercase', background: confColor + '20', color: confColor,
                  }}>
                    {tg.confidence} confidence
                  </span>
                  <span style={{ fontSize: 11, color: compColor, fontWeight: 700 }}>
                    Data: {tg.data_completeness_percent}%
                  </span>
                  <span style={{ fontSize: 10, color: colors.textMuted }}>
                    {tg.measured_findings_count} measured · {tg.inferred_recommendations_count} inferred
                  </span>
                  {tg.data_sources_used?.length > 0 && (
                    <span style={{ fontSize: 10, color: colors.textMuted }}>
                      Sources: {tg.data_sources_used.map(s => s.source).join(', ')}
                    </span>
                  )}
                </div>
                {tg.missing_sources?.length > 0 && (
                  <div style={{ fontSize: 10, color: '#EF4444', marginBottom: 4 }}>
                    Missing: {tg.missing_sources.map(s => s.source).join(', ')}
                  </div>
                )}
                {tg.why_this_may_be_incomplete?.length > 0 && (
                  <div style={{ fontSize: 10, color: colors.textMuted, lineHeight: 1.5 }}>
                    {tg.why_this_may_be_incomplete.map((w, i) => <div key={i}>• {w}</div>)}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Score + summary strip */}
          {sections && (sections.healthScore != null || sections.summary) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: spacing.xl,
              marginTop: spacing.lg, padding: spacing.lg,
              background: `linear-gradient(135deg, ${colors.primaryLightest}, ${colors.surfaceHover})`,
              borderRadius: radius.lg,
            }}>
              {sections.healthScore != null && (
                <ScoreRing score={sections.healthScore} size={72} strokeWidth={5} label="Health Score" />
              )}
              {sections.summary && (
                <div style={{ flex: 1, fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 1.7 }}>
                  {typeof sections.summary === 'string' ? sections.summary : JSON.stringify(sections.summary, null, 2)}
                </div>
              )}
            </div>
          )}

          {/* Tabs */}
          {availableTabs.length > 2 && (
            <div style={{ marginTop: spacing.lg, marginBottom: -spacing.xl }}>
              <Tabs tabs={availableTabs} active={tab} onChange={setTab} />
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: `${spacing.xl}px ${spacing['2xl']}px` }}>
          {/* Error */}
          {run.error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: spacing.md,
              background: colors.errorLight, border: `1px solid ${colors.error}33`,
              borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl,
            }}>
              <AlertTriangle size={18} color={colors.error} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.errorDark, marginBottom: 4 }}>Error</div>
                <div style={{ fontSize: fontSize.sm, color: colors.errorDark, lineHeight: 1.5 }}>{run.error}</div>
              </div>
            </div>
          )}

          {!sections && run.output && (
            <div>
              <div style={{ fontSize: fontSize.md, color: colors.textSecondary, marginBottom: spacing.md }}>
                No structured data detected. Showing raw output:
              </div>
              <pre style={{
                background: '#0F0F1A', color: '#A5B4FC', padding: spacing.lg,
                borderRadius: radius.lg, fontSize: fontSize.xs, overflow: 'auto',
                maxHeight: 500, direction: 'ltr', textAlign: 'left',
                border: '1px solid rgba(99,102,241,0.2)',
              }}>
                {typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2)}
              </pre>
            </div>
          )}

          {sections && (
            <>
              {/* ─── INSIGHTS TAB ─────────────────────── */}
              {tab === 'insights' && (
                <div>
                  {/* Auto-generated overview when no explicit summary */}
                  {!sections.summary && sections.extra && Object.keys(sections.extra).length > 0 && (
                    <div style={{
                      marginBottom: spacing['2xl'], padding: spacing.lg,
                      background: colors.primaryLightest, borderRadius: radius.lg,
                      border: `1px solid ${colors.primaryLighter}`,
                    }}>
                      <h3 style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: spacing.sm, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Sparkles size={16} /> What This Agent Found
                      </h3>
                      <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 1.6 }}>
                        This run analyzed <strong>{Object.keys(sections.extra).length} areas</strong>:{' '}
                        {Object.keys(sections.extra).map(k => FRIENDLY_LABELS[k] || k.replace(/_/g, ' ')).join(', ')}.
                        {' '}Review each section below for details.
                      </div>
                    </div>
                  )}

                  {/* Metrics breakdown */}
                  {sections.metrics && (
                    <div style={{ marginBottom: spacing['2xl'] }}>
                      <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <BarChart3 size={18} color={colors.primary} /> Score Breakdown
                      </h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: spacing.md }}>
                        {typeof sections.metrics === 'object' && !Array.isArray(sections.metrics) ? (
                          Object.entries(sections.metrics).map(([key, val]) => (
                            <MetricCard
                              key={key}
                              label={FRIENDLY_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              value={typeof val === 'object' ? (val.score || val.value || 0) : val}
                              detail={typeof val === 'object' ? val.detail || val.description : undefined}
                            />
                          ))
                        ) : (
                          <div style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
                            {JSON.stringify(sections.metrics, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Methodology / data sources */}
                  {(sections.methodology || sections.dataSources) && (
                    <div style={{
                      marginBottom: spacing['2xl'], padding: spacing.lg,
                      background: '#FFFBEB', border: '1px solid #FDE68A',
                      borderRadius: radius.lg,
                    }}>
                      <h3 style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: '#92400E', marginBottom: spacing.sm, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Lightbulb size={16} /> How These Conclusions Were Reached
                      </h3>
                      {sections.methodology && (
                        <div style={{ fontSize: fontSize.sm, color: '#78350F', lineHeight: 1.7, marginBottom: sections.dataSources ? spacing.md : 0 }}>
                          {typeof sections.methodology === 'string' ? sections.methodology : (
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                              {(Array.isArray(sections.methodology) ? sections.methodology : Object.entries(sections.methodology)).map((item, i) => (
                                <li key={i} style={{ marginBottom: 4 }}>
                                  {typeof item === 'string' ? item : Array.isArray(item) ? `${item[0]}: ${item[1]}` : JSON.stringify(item)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {sections.dataSources && (
                        <div>
                          <div style={{ fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#92400E', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Data Sources</div>
                          <div style={{ fontSize: fontSize.sm, color: '#78350F', lineHeight: 1.6 }}>
                            {typeof sections.dataSources === 'string' ? sections.dataSources : (
                              Array.isArray(sections.dataSources) ? sections.dataSources.join(', ') : JSON.stringify(sections.dataSources)
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Quick stats from extra data */}
                  {sections.extra && Object.keys(sections.extra).length > 0 && (
                    <div style={{ marginBottom: spacing['2xl'] }}>
                      <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={18} color={colors.primary} /> Detailed Findings
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: spacing.md }}>
                        {Object.entries(sections.extra).map(([key, val]) => (
                          <ExtraDataCard key={key} label={key} value={val} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Changes made */}
                  {sections.changesMade?.length > 0 && (
                    <div style={{ marginBottom: spacing['2xl'] }}>
                      <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <CheckCircle2 size={18} color={colors.success} /> Changes Made
                      </h3>
                      {sections.changesMade.map((change, i) => (
                        <div key={i} style={{
                          display: 'flex', gap: spacing.md, padding: spacing.md,
                          background: colors.successLight, borderRadius: radius.md,
                          marginBottom: spacing.sm, alignItems: 'flex-start',
                        }}>
                          <Check size={14} color={colors.success} style={{ marginTop: 2, flexShrink: 0 }} />
                          <div style={{ fontSize: fontSize.sm, color: colors.successDark, lineHeight: 1.5 }}>
                            {typeof change === 'string' ? change : (change.description || change.title || JSON.stringify(change))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── ACTIONS TAB ──────────────────────── */}
              {tab === 'actions' && sections.actionPlan && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg }}>
                    <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Target size={18} color={colors.primary} /> Action Plan
                    </h3>
                    <Btn
                      color={colors.primary}
                      onClick={() => {/* Run all actions */}}
                      ariaLabel="Run all recommended fixes"
                    >
                      <Zap size={13} /> Run All Fixes
                    </Btn>
                  </div>
                  {sections.actionPlan.map((item, i) => (
                    <ActionItem
                      key={i}
                      item={typeof item === 'string' ? { title: item } : item}
                      index={i}
                      onRun={(item) => handleRunAction(item, i)}
                      onApprove={(item) => handleApprove(item, i)}
                      onReject={(item) => handleReject(item, i)}
                    />
                  ))}
                </div>
              )}

              {/* ─── CONTENT GAPS TAB ─────────────────── */}
              {tab === 'gaps' && sections.contentGaps && (
                <div>
                  <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Search size={18} color={colors.primary} /> Content Gaps
                  </h3>
                  {sections.contentGaps.map((gap, i) => (
                    <Card key={i} style={{ marginBottom: spacing.md, padding: spacing.lg }}>
                      <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, color: colors.text, marginBottom: 4 }}>
                        {typeof gap === 'string' ? gap : (gap.title || gap.keyword || gap.topic || `Gap ${i + 1}`)}
                      </div>
                      {typeof gap === 'object' && (
                        <>
                          {gap.description && <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 1.6, marginBottom: spacing.sm }}>{gap.description}</div>}
                          {gap.search_volume && <Badge text={`${gap.search_volume} searches/mo`} color={colors.primary} bg={colors.primaryLightest} />}
                          {gap.difficulty && <Badge text={`Difficulty: ${gap.difficulty}`} color={colors.warning} bg={colors.warningLight} />}
                        </>
                      )}
                    </Card>
                  ))}
                </div>
              )}

              {/* ─── RANKINGS TAB ─────────────────────── */}
              {tab === 'rankings' && sections.rankings && (
                <div>
                  <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingUp size={18} color={colors.primary} /> Keyword Rankings
                  </h3>
                  {Array.isArray(sections.rankings) ? (
                    <div style={{ borderRadius: radius.lg, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.sm }}>
                        <thead>
                          <tr style={{ background: colors.surfaceHover }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: fontWeight.bold, color: colors.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase' }}>Keyword</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: fontWeight.bold, color: colors.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase' }}>Position</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: fontWeight.bold, color: colors.textSecondary, fontSize: fontSize.xs, textTransform: 'uppercase' }}>URL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sections.rankings.map((kw, i) => {
                            const keyword = typeof kw === 'string' ? kw : (kw.keyword || kw.query || kw.term || '');
                            const position = typeof kw === 'object' ? (kw.position || kw.rank || kw.ranking || '') : '';
                            const url = typeof kw === 'object' ? (kw.url || kw.page || '') : '';
                            const posColor = position <= 3 ? colors.success : position <= 10 ? colors.primary : position <= 20 ? colors.warning : colors.error;
                            return (
                              <tr key={i} style={{ borderBottom: `1px solid ${colors.borderLight}` }}>
                                <td style={{ padding: '10px 14px', fontWeight: fontWeight.medium }}>{keyword}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                  {position && <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: `${posColor}15`, color: posColor, fontWeight: fontWeight.bold, fontSize: fontSize.md }}>{position}</span>}
                                </td>
                                <td style={{ padding: '10px 14px', fontSize: fontSize.xs, color: colors.textMuted, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{url}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <pre style={{ background: colors.surfaceHover, padding: spacing.lg, borderRadius: radius.lg, fontSize: fontSize.xs, overflow: 'auto', maxHeight: 400 }}>
                      {JSON.stringify(sections.rankings, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* ─── OPPORTUNITIES TAB ────────────────── */}
              {tab === 'opportunities' && (
                <div>
                  {sections.quickWins?.length > 0 && (
                    <>
                      <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Sparkles size={18} color={colors.accent} /> Quick Wins
                      </h3>
                      {sections.quickWins.map((item, i) => (
                        <Card key={i} style={{ marginBottom: spacing.md, padding: spacing.lg, borderLeft: `3px solid ${colors.accent}` }}>
                          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                            {typeof item === 'string' ? item : (item.title || item.action || JSON.stringify(item))}
                          </div>
                          {typeof item === 'object' && item.description && (
                            <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 }}>{item.description}</div>
                          )}
                        </Card>
                      ))}
                    </>
                  )}
                  {sections.opportunities?.length > 0 && (
                    <>
                      <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg, marginTop: spacing.xl, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ArrowUpRight size={18} color={colors.success} /> Growth Opportunities
                      </h3>
                      {sections.opportunities.map((item, i) => (
                        <Card key={i} style={{ marginBottom: spacing.md, padding: spacing.lg, borderLeft: `3px solid ${colors.success}` }}>
                          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>
                            {typeof item === 'string' ? item : (item.title || item.opportunity || JSON.stringify(item))}
                          </div>
                          {typeof item === 'object' && item.description && (
                            <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4 }}>{item.description}</div>
                          )}
                          {typeof item === 'object' && item.potential_impact && (
                            <Badge text={`Impact: ${item.potential_impact}`} color={colors.success} bg={colors.successLight} />
                          )}
                        </Card>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* ─── TECHNICAL ISSUES TAB ─────────────── */}
              {tab === 'technical' && sections.technical && (
                <div>
                  <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={18} color={colors.error} /> Technical Issues
                  </h3>
                  {sections.technical.map((issue, i) => {
                    const title = typeof issue === 'string' ? issue : (issue.title || issue.issue || issue.name || `Issue ${i + 1}`);
                    const severity = typeof issue === 'object' ? (issue.severity || issue.priority || 'medium') : 'medium';
                    const desc = typeof issue === 'object' ? (issue.description || issue.details || '') : '';
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: spacing.md, padding: spacing.lg,
                        background: colors.surface, border: `1px solid ${colors.border}`,
                        borderRadius: radius.lg, marginBottom: spacing.md, alignItems: 'flex-start',
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: radius.md, flexShrink: 0,
                          background: (colors.severity[severity]?.bg || colors.errorLight),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <AlertTriangle size={14} color={colors.severity[severity]?.color || colors.error} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: 4 }}>
                            <span style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: colors.text }}>{title}</span>
                            <PriorityBadge priority={severity} />
                          </div>
                          {desc && <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 1.6 }}>{desc}</div>}
                        </div>
                        <Btn small onClick={() => handleRunAction(issue, i)} ariaLabel={`Fix: ${title}`}>
                          <Zap size={11} /> Fix
                        </Btn>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ─── BACKLINKS TAB ────────────────────── */}
              {tab === 'backlinks' && sections.backlinks && (
                <div>
                  <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Link2 size={18} color={colors.primary} /> Backlink Analysis
                  </h3>
                  <RenderStructuredData data={sections.backlinks} />
                </div>
              )}

              {/* ─── COMPETITORS TAB ──────────────────── */}
              {tab === 'competitors' && sections.competitors && (
                <div>
                  <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Globe size={18} color={colors.primary} /> Competitor Analysis
                  </h3>
                  <RenderStructuredData data={sections.competitors} />
                </div>
              )}

              {/* ─── RAW DATA TAB ─────────────────────── */}
              {tab === 'raw' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                    <h3 style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, margin: 0 }}>Raw JSON Output</h3>
                  </div>
                  <pre style={{
                    background: '#0F0F1A', color: '#A5B4FC', padding: spacing.lg,
                    borderRadius: radius.lg, fontSize: fontSize.xs, overflow: 'auto',
                    maxHeight: 600, direction: 'ltr', textAlign: 'left',
                    border: '1px solid rgba(99,102,241,0.2)',
                    lineHeight: 1.6,
                  }}>
                    {JSON.stringify(run.output, null, 2)}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Friendly label map for common agent output keys ─────────
const FRIENDLY_LABELS = {
  cta_audit: 'Call-to-Action Audit',
  form_audit: 'Form Audit',
  page_speed: 'Page Speed',
  pagespeed: 'Page Speed',
  pagespeed_score: 'Page Speed Score',
  mobile_score: 'Mobile Score',
  desktop_score: 'Desktop Score',
  meta_tags: 'Meta Tags',
  meta_title: 'Page Title',
  meta_description: 'Meta Description',
  h1_tags: 'H1 Headings',
  h2_tags: 'H2 Headings',
  schema_markup: 'Schema Markup',
  structured_data: 'Structured Data',
  internal_links: 'Internal Links',
  external_links: 'External Links',
  broken_links: 'Broken Links',
  redirect_chains: 'Redirect Chains',
  canonical_issues: 'Canonical Issues',
  indexability: 'Indexability',
  crawl_errors: 'Crawl Errors',
  robots_txt: 'Robots.txt',
  sitemap: 'XML Sitemap',
  ssl_status: 'SSL Certificate',
  https_status: 'HTTPS Status',
  core_web_vitals: 'Core Web Vitals',
  lcp: 'Largest Contentful Paint (LCP)',
  fid: 'First Input Delay (FID)',
  cls: 'Cumulative Layout Shift (CLS)',
  ttfb: 'Time to First Byte (TTFB)',
  gbp_status: 'Google Business Profile',
  gbp_reviews: 'Google Reviews',
  review_count: 'Review Count',
  average_rating: 'Average Rating',
  nap_consistency: 'NAP Consistency',
  citation_count: 'Citations Found',
  domain_authority: 'Domain Authority',
  domain_rating: 'Domain Rating',
  referring_domains: 'Referring Domains',
  trust_flow: 'Trust Flow',
  citation_flow: 'Citation Flow',
  organic_traffic: 'Organic Traffic',
  organic_keywords: 'Organic Keywords',
  top_pages: 'Top Performing Pages',
  conversion_rate: 'Conversion Rate',
  bounce_rate: 'Bounce Rate',
  avg_session_duration: 'Avg Session Duration',
  total_clicks: 'Total Clicks',
  total_impressions: 'Total Impressions',
  avg_position: 'Average Position',
  avg_ctr: 'Average Click-Through Rate',
  social_profiles: 'Social Profiles',
  content_analysis: 'Content Analysis',
  word_count: 'Word Count',
  readability_score: 'Readability Score',
  keyword_density: 'Keyword Density',
  images_without_alt: 'Images Without Alt Text',
  missing_alt_tags: 'Missing Alt Tags',
  duplicate_content: 'Duplicate Content',
  thin_content: 'Thin Content Pages',
  local_rankings: 'Local Rankings',
  map_pack_presence: 'Map Pack Presence',
  competitor_gap: 'Competitor Gap Analysis',
  link_opportunities: 'Link Opportunities',
  toxic_links: 'Toxic Links',
  disavow_candidates: 'Disavow Candidates',
  status_code: 'HTTP Status Code',
  response_time: 'Response Time',
  total_pages: 'Total Pages',
  indexed_pages: 'Indexed Pages',
  error_pages: 'Error Pages',
  warnings: 'Warnings',
  findings: 'Key Findings',
  audit_results: 'Audit Results',
  performance_score: 'Performance Score',
  accessibility_score: 'Accessibility Score',
  best_practices_score: 'Best Practices Score',
  seo_score: 'SEO Score',
};

// ─── Extra Data Card (for any unrecognized fields) ───────────
function ExtraDataCard({ label, value }) {
  const displayLabel = FRIENDLY_LABELS[label] || label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (typeof value === 'boolean') {
    return (
      <div style={{ padding: spacing.lg, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: fontWeight.semibold, marginBottom: 4 }}>{displayLabel}</div>
        <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, color: value ? colors.success : colors.error }}>
          {value ? '✓ Yes' : '✗ No'}
        </div>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div style={{ padding: spacing.lg, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: fontWeight.semibold, marginBottom: 4 }}>{displayLabel}</div>
        <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.text }}>{value.toLocaleString()}</div>
      </div>
    );
  }

  if (typeof value === 'string' && value.length < 200) {
    return (
      <div style={{ padding: spacing.lg, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
        <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: fontWeight.semibold, marginBottom: 4 }}>{displayLabel}</div>
        <div style={{ fontSize: fontSize.md, color: colors.text, lineHeight: 1.5 }}>{value}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: spacing.lg, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: radius.lg }}>
      <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: fontWeight.semibold, marginBottom: 4 }}>{displayLabel}</div>
      <RenderStructuredData data={value} />
    </div>
  );
}

// ─── Generic structured data renderer ────────────────────────
function RenderStructuredData({ data }) {
  if (data == null) return null;

  if (typeof data === 'string') {
    return <div style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 1.6 }}>{data}</div>;
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>{String(data)}</div>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <div style={{ fontSize: fontSize.sm, color: colors.textMuted }}>None</div>;

    // If array of simple strings
    if (data.every(d => typeof d === 'string')) {
      return (
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {data.map((item, i) => (
            <li key={i} style={{ fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 1.7, marginBottom: 4 }}>{item}</li>
          ))}
        </ul>
      );
    }

    // Array of objects — render as mini cards
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
        {data.map((item, i) => (
          <div key={i} style={{
            padding: spacing.md, background: colors.surfaceHover,
            borderRadius: radius.md, border: `1px solid ${colors.borderLight}`,
          }}>
            {typeof item === 'object' ? (
              Object.entries(item).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', gap: spacing.sm, marginBottom: 2 }}>
                  <span style={{ fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.bold, minWidth: 100 }}>
                    {FRIENDLY_LABELS[k] || k.replace(/_/g, ' ')}:
                  </span>
                  <span style={{ fontSize: fontSize.sm, color: colors.text }}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ fontSize: fontSize.sm, color: colors.text }}>{String(item)}</div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Object
  if (typeof data === 'object') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
        {Object.entries(data).map(([k, v]) => (
          <div key={k} style={{
            display: 'flex', gap: spacing.md, padding: `${spacing.sm}px 0`,
            borderBottom: `1px solid ${colors.borderLight}`, alignItems: 'flex-start',
          }}>
            <span style={{
              fontSize: fontSize.xs, color: colors.textSecondary, fontWeight: fontWeight.bold,
              minWidth: 120, textTransform: 'uppercase', letterSpacing: 0.3, paddingTop: 2,
            }}>
              {FRIENDLY_LABELS[k] || k.replace(/_/g, ' ')}
            </span>
            <div style={{ flex: 1 }}>
              {typeof v === 'object' ? <RenderStructuredData data={v} /> : (
                <span style={{ fontSize: fontSize.sm, color: colors.text, lineHeight: 1.5 }}>{String(v)}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return null;
}


// ─── Skeleton for run control cards ─────────────────────────────
function RunControlSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: spacing.xl, marginBottom: spacing['2xl'] }}>
      <Card>
        <Skeleton width={140} height={14} style={{ marginBottom: spacing.md }} />
        <Skeleton width="100%" height={34} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />
        <Skeleton width={130} height={14} style={{ marginBottom: spacing.sm }} />
        <Skeleton width={90} height={30} borderRadius={radius.md} />
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
        <Card>
          <Skeleton width={100} height={14} style={{ marginBottom: spacing.sm }} />
          <Skeleton width="100%" height={34} borderRadius={radius.md} style={{ marginBottom: spacing.sm }} />
          <Skeleton width={90} height={30} borderRadius={radius.md} />
        </Card>
        <Card>
          <Skeleton width={120} height={14} style={{ marginBottom: spacing.xs }} />
          <Skeleton width="80%" height={12} style={{ marginBottom: spacing.sm }} />
          <Skeleton width={80} height={30} borderRadius={radius.md} />
        </Card>
      </div>
    </div>
  );
}

// ─── Skeleton for recent runs list ──────────────────────────
function RunsListSkeleton() {
  return (
    <Card>
      <Skeleton width={120} height={14} style={{ marginBottom: spacing.lg }} />
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, padding: `${spacing.sm}px ${spacing.md}px`, marginBottom: spacing.xs }}>
          <Skeleton width={8} height={8} borderRadius="50%" />
          <div style={{ flex: 1 }}>
            <Skeleton width="55%" height={13} style={{ marginBottom: 3 }} />
            <Skeleton width="35%" height={10} />
          </div>
          <Skeleton width={64} height={20} borderRadius={radius.sm} />
        </div>
      ))}
    </Card>
  );
}

// ─── Run list item (compact card) ────────────────────────────
function RunListItem({ run, isSelected, onClick }) {
  const [hovered, setHovered] = useState(false);
  const laneColor = colors.lanes[run.agent_templates?.lane] || colors.textDisabled;
  const hasOutput = run.output && Object.keys(run.output || {}).length > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-expanded={isSelected}
      aria-label={`Run ${run.agent_templates?.name}, status ${run.status}`}
      style={{
        display: 'flex', alignItems: 'center', gap: spacing.md,
        padding: `${spacing.md}px ${spacing.lg}px`,
        width: '100%', textAlign: 'left',
        background: isSelected ? colors.primaryLightest : hovered ? colors.surfaceHover : colors.surface,
        borderRadius: radius.lg, cursor: 'pointer',
        border: isSelected ? `1.5px solid ${colors.primary}` : `1px solid ${hovered ? colors.borderDark : colors.borderLight}`,
        transition: transitions.fast, fontFamily: 'inherit',
        marginBottom: spacing.xs,
        transform: hovered ? 'translateX(2px)' : 'none',
      }}
    >
      {/* Lane color bar */}
      <div style={{
        width: 3, height: 36, borderRadius: 2,
        background: laneColor, flexShrink: 0,
      }} />

      <Dot s={run.status} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: fontSize.md, fontWeight: fontWeight.semibold,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: colors.text,
        }}>
          {run.agent_templates?.name}
        </div>
        <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, display: 'flex', gap: spacing.sm, marginTop: 2 }}>
          <span>{new Date(run.created_at).toLocaleString()}</span>
          {run.tokens_used ? <span>{run.tokens_used} tok</span> : null}
          {run.duration_ms ? <span>{run.duration_ms > 60000 ? `${Math.round(run.duration_ms / 60000)}m` : `${Math.round(run.duration_ms / 1000)}s`}</span> : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
        <Badge text={run.status} color={colors.status[run.status] || colors.status.partial || colors.textDisabled} bg={(colors.status[run.status] || colors.textDisabled) + '22'} />
        {run.output?._truth_gate?.confidence && (() => {
          const conf = run.output._truth_gate.confidence;
          const c = { high: '#10B981', medium: '#F59E0B', low: '#F97316', very_low: '#EF4444' }[conf] || '#9CA3AF';
          return <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 3, background: c + '18', color: c, textTransform: 'uppercase' }}>{conf}</span>;
        })()}
        {run.false_success && (
          <span title={`False success: ${(run.false_success_flags || []).join(', ')}`} style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
            background: '#FEF3C7', color: '#92400E', border: '1px solid #F59E0B44',
          }}>FAKE?</span>
        )}
        {hasOutput && <ChevronRight size={14} color={colors.textMuted} />}
      </div>
    </button>
  );
}

// ─── Main View ───────────────────────────────────────────────
export default function RunsView({ clientId, focusRunId, onFocusConsumed }) {
  const [agents, setAgents] = useState({});
  const [runs, setRuns] = useState([]);
  const [selAgent, setSelAgent] = useState('');
  const [selLane, setSelLane] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [dryRun, setDryRun] = useState(false);
  const [selRun, setSelRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [latestOnly, setLatestOnly] = useState(true);
  const [clearing, setClearing] = useState(false);

  const lanes = Object.keys(agents).sort();

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    Promise.all([
      api(`/clients/${clientId}/agents`),
      api(`/clients/${clientId}/runs`),
    ])
      .then(([a, r]) => { setAgents(a); setRuns(r); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId]);

  // Auto-open a specific run when navigated from Dashboard
  useEffect(() => {
    if (focusRunId && runs.length > 0) {
      const target = runs.find(r => r.id === focusRunId);
      if (target) {
        setSelRun(target);
        if (onFocusConsumed) onFocusConsumed();
      }
    }
  }, [focusRunId, runs]);

  const refreshRuns = async () => {
    try {
      setRuns(await api(`/clients/${clientId}/runs`));
    } catch (e) { console.error(e); }
  };

  const exec = async (mode) => {
    setRunning(true);
    setResult(null);
    try {
      let res;
      if (mode === 'single') {
        if (!selAgent) { alert('Select agent'); setRunning(false); return; }
        res = await api('/runs/execute', { method: 'POST', body: { clientId, agentTemplateId: selAgent, isDryRun: dryRun } });
      } else if (mode === 'lane') {
        if (!selLane) { alert('Select lane'); setRunning(false); return; }
        res = await api('/runs/run-lane', { method: 'POST', body: { clientId, laneName: selLane } });
      } else {
        res = await api('/runs/run-all', { method: 'POST', body: { clientId } });
      }
      setResult(res);
      setFilterStatus('running'); // auto-switch to running view after queuing
      await refreshRuns();
    } catch (e) {
      setResult({ error: e.message });
    }
    setRunning(false);
  };

  const clearOldRuns = async () => {
    if (!confirm('Delete all failed and cancelled runs? Running and successful runs are kept.')) return;
    setClearing(true);
    try {
      await api(`/clients/${clientId}/runs/clear-old`, { method: 'DELETE' });
      await refreshRuns();
    } catch (e) {
      // fallback: just remove from local state
      setRuns(prev => prev.filter(r => r.status === 'running' || r.status === 'success' || r.status === 'pending_approval'));
    }
    setClearing(false);
  };

  // Filter runs — latest only = show 1 run per agent (most recent)
  const latestRunsMap = runs.reduce((acc, r) => {
    const key = r.agent_template_id;
    if (!acc[key] || new Date(r.created_at) > new Date(acc[key].created_at)) acc[key] = r;
    return acc;
  }, {});
  const baseRuns = latestOnly ? Object.values(latestRunsMap) : runs;

  const filteredRuns = baseRuns
    .filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = (r.agent_templates?.name || '').toLowerCase();
        const lane = (r.agent_templates?.lane || '').toLowerCase();
        if (!name.includes(q) && !lane.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const statusCounts = baseRuns.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  if (!clientId) return <Empty icon={Play} msg="Select a client to run agents" />;

  return (
    <div>
      <SH
        title="Run Control"
        sub="Execute agents individually, by lane, or all at once"
        action={
          <Btn small secondary onClick={refreshRuns} ariaLabel="Refresh runs">
            <RefreshCw size={12} /> Refresh
          </Btn>
        }
      />

      {/* ─── Run control cards ─────────────────────── */}
      {loading ? (
        <RunControlSkeleton />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: spacing.xl, marginBottom: spacing['2xl'] }}>
          {/* Single agent card */}
          <Card>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.md }}>
              Run Single Agent
            </div>
            <Field label="Agent" htmlFor="run-agent-select" required>
              <select
                id="run-agent-select"
                value={selAgent}
                onChange={e => setSelAgent(e.target.value)}
                aria-label="Select an agent to run"
                style={selectStyle}
              >
                <option value="">Select agent...</option>
                {lanes.map(lane => (
                  <optgroup key={lane} label={lane}>
                    {agents[lane].map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} [{a.role_type}]
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </Field>
            <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, fontSize: fontSize.md, cursor: 'pointer', marginBottom: spacing.sm, color: colors.textSecondary }}>
              <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} aria-label="Enable dry run mode (preview only)" />
              Dry Run (preview only)
            </label>
            <Btn onClick={() => exec('single')} disabled={running || !selAgent} ariaLabel={dryRun ? 'Start dry run for selected agent' : 'Run selected agent'}>
              {running ? <Spin /> : <Play size={13} />}
              {dryRun ? 'Dry Run' : 'Run Agent'}
            </Btn>
          </Card>

          {/* Lane + All cards column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            <Card>
              <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.sm }}>
                Run Lane
              </div>
              <Field label="Lane" htmlFor="run-lane-select" required>
                <select
                  id="run-lane-select"
                  value={selLane}
                  onChange={e => setSelLane(e.target.value)}
                  aria-label="Select a lane to run"
                  style={selectStyle}
                >
                  <option value="">Select lane...</option>
                  {lanes.map(l => <option key={l} value={l}>{l} ({agents[l].length})</option>)}
                </select>
              </Field>
              <Btn onClick={() => exec('lane')} disabled={running || !selLane} color={colors.success} ariaLabel="Run all agents in selected lane">
                {running ? <Spin /> : <Zap size={13} />} Run Lane
              </Btn>
            </Card>

            <Card>
              <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: spacing.xs }}>
                Run All Agents
              </div>
              <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm }}>
                Queues all enabled agents in order
              </div>
              <Btn onClick={() => exec('all')} disabled={running} color="#7c3aed" ariaLabel="Run all agents">
                {running ? <Spin /> : <Activity size={13} />} Run All
              </Btn>
            </Card>
          </div>
        </div>
      )}

      {/* ─── Result banner ────────────────────────── */}
      {result && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: spacing.md,
          marginBottom: spacing.xl, padding: spacing.lg,
          background: result.error ? colors.errorLight : colors.successLight,
          border: `1px solid ${result.error ? colors.error + '33' : colors.success + '33'}`,
          borderRadius: radius.lg,
        }}>
          {result.error ? (
            <XCircle size={20} color={colors.error} />
          ) : (
            <CheckCircle2 size={20} color={colors.success} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold, color: result.error ? colors.errorDark : colors.successDark }} role="alert">
              {result.error ? `Error: ${result.error}` : result.queued ? `Queued ${result.queued} agents` : 'Run complete'}
            </div>
          </div>
          <Btn small ghost onClick={() => setResult(null)} ariaLabel="Dismiss">
            <X size={14} />
          </Btn>
        </div>
      )}

      {/* ─── Runs list ────────────────────────────── */}
      {loading ? (
        <RunsListSkeleton />
      ) : (
        <>
          {/* Filter bar */}
          <div style={{ marginBottom: spacing.lg }}>
            {/* Row 1: search + latest toggle + clear button */}
            <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: colors.textMuted }} />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%', padding: '7px 12px 7px 32px',
                    border: `1.5px solid ${colors.border}`, borderRadius: radius.md,
                    fontSize: fontSize.sm, color: colors.text, background: colors.surface,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Latest only toggle */}
              <button
                onClick={() => setLatestOnly(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: radius.md, cursor: 'pointer',
                  border: `1.5px solid ${latestOnly ? colors.primary : colors.border}`,
                  background: latestOnly ? colors.primary + '15' : colors.surface,
                  color: latestOnly ? colors.primary : colors.textSecondary,
                  fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                  transition: 'all 0.15s',
                }}
              >
                <Activity size={13} />
                {latestOnly ? 'Latest run per agent ✓' : 'Show all history'}
              </button>

              {/* Clear old runs */}
              <button
                onClick={clearOldRuns}
                disabled={clearing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: radius.md, cursor: 'pointer',
                  border: `1.5px solid ${colors.error}30`,
                  background: colors.surface,
                  color: colors.error,
                  fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                  opacity: clearing ? 0.5 : 1,
                }}
              >
                <X size={13} />
                {clearing ? 'Clearing...' : 'Clear failed runs'}
              </button>
            </div>

            {/* Row 2: status filter pills */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['all', 'running', 'success', 'failed', 'pending_approval'].map(status => {
                const count = status === 'all' ? baseRuns.length : (statusCounts[status] || 0);
                const dotColor = status === 'running' ? colors.primary : status === 'success' ? colors.success : status === 'failed' ? colors.error : colors.textMuted;
                return (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    style={{
                      padding: '5px 12px', borderRadius: radius.full,
                      border: 'none', cursor: 'pointer',
                      fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
                      background: filterStatus === status ? colors.primary : colors.surfaceHover,
                      color: filterStatus === status ? '#fff' : colors.textSecondary,
                      transition: 'all 0.15s',
                    }}
                  >
                    {status === 'all' ? `All (${count})` : `${status.replace(/_/g, ' ')} (${count})`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Runs list */}
          <div>
            {filteredRuns.map(r => (
              <RunListItem
                key={r.id}
                run={r}
                isSelected={selRun?.id === r.id}
                onClick={() => setSelRun(selRun?.id === r.id ? null : r)}
              />
            ))}
            {filteredRuns.length === 0 && (
              <Empty icon={Play} msg={searchQuery || filterStatus !== 'all' ? 'No matching runs' : 'No runs yet'} />
            )}
          </div>
        </>
      )}

      {/* ─── Run detail panel ─────────────────────── */}
      {selRun && (
        <RunDetail
          run={selRun}
          clientId={clientId}
          onClose={() => setSelRun(null)}
          onRunAction={async (item) => {
            // TODO: Wire up to actual action execution endpoint
            console.log('Run action:', item);
          }}
        />
      )}
    </div>
  );
}
