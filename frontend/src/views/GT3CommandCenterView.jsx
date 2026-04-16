// ─── GT3 Command Center ──────────────────────────────────────
// Hebrew-first dashboard that visualizes the GT3 mission layer:
// primary missions, quick wins, missing pages, support clusters,
// defense, and the tasks queued to execute each mission.

import { useState, useEffect, useCallback } from 'react';
import {
  Target, TrendingUp, AlertTriangle, Shield, Layers, FileQuestion,
  Play, ChevronRight, ExternalLink, Zap, RefreshCw, Info,
} from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Card, SH, Badge, Btn, Spin, Empty } from '../components/index.jsx';

// ─── Hebrew labels ───────────────────────────────────────────
const LABEL_HE = {
  mission_critical:  'יעד קריטי',
  high_priority:     'עדיפות גבוהה',
  strategic_support: 'תמיכה אסטרטגית',
  low_priority:      'עדיפות נמוכה',
  deprioritize:      'לא בעדיפות',
};
const ACTION_HE = {
  defend:                  'להגן על מיקום',
  push_to_top_3:           'לדחוף לטופ 3',
  build_new_page:          'לבנות עמוד חדש',
  improve_page:            'לשדרג עמוד',
  expand_support_cluster:  'להרחיב אשכול',
  improve_ctr:             'לשפר CTR',
  strengthen_local_signals:'לחזק אותות מקומיים',
  earn_authority_links:    'לבנות קישורים',
  merge_with_existing_topic:'למזג לנושא קיים',
  deprioritize:            'להוריד מעדיפות',
};
const INTENT_HE = {
  transactional:  'מסחרי/שכירה',
  commercial:     'מסחרי',
  informational:  'אינפורמטיבי',
  navigational:   'ניווטי',
  brand:          'מותג',
  urgent_local:   'דחוף מקומי',
};
const TASK_TYPE_HE = {
  create_page:              'בניית עמוד',
  improve_page:             'שדרוג עמוד',
  improve_ctr:              'שיפור CTR',
  add_internal_links:       'קישורים פנימיים',
  add_faq:                  'הוספת FAQ',
  strengthen_local_seo:     'חיזוק Local SEO',
  improve_conversion:       'שיפור המרה',
  build_cluster:            'בניית אשכול',
  review_gbp:               'ביקורת GBP',
  acquire_links:            'רכישת קישורים',
  defend_ranking:           'הגנת מיקום',
  // channel
  create_search_ads:        'קמפיין חיפוש Google',
  test_ad_copy:             'בדיקת מסרי מודעה',
  create_remarketing_audience: 'רימרקטינג Meta',
  publish_social_post:      'פוסט אורגני',
  distribute_authority_content: 'הפצת תוכן סמכות',
  update_gbp_services:      'עדכון GBP',
  request_reviews:          'בקשת ביקורות',
  improve_landing_page:     'שיפור דף נחיתה',
  test_headline_variants:   'בדיקת כותרות',
  create_video:             'יצירת וידאו',
  warm_audience:            'חימום קהל',
};

const CHANNEL_META = {
  seo:            { label_he: 'SEO',     color: '#6366F1', icon: '🎯' },
  local_seo:      { label_he: 'Local',   color: '#06B6D4', icon: '📍' },
  google_ads:     { label_he: 'G.Ads',   color: '#1877F2', icon: '💰' },
  meta_ads:       { label_he: 'Meta',    color: '#E1306C', icon: '📱' },
  organic_social: { label_he: 'Social',  color: '#10B981', icon: '💬' },
};

const LABEL_COLOR = {
  mission_critical:  '#EF4444',
  high_priority:     '#F59E0B',
  strategic_support: '#6366F1',
  low_priority:      '#9CA3AF',
  deprioritize:      '#D1D5DB',
};

// ─── Helpers ─────────────────────────────────────────────────
function isHebrew(s) { return /[\u0590-\u05FF]/.test(s || ''); }

function ScoreDot({ score }) {
  const color = score >= 90 ? '#EF4444' : score >= 75 ? '#F59E0B' : score >= 60 ? '#6366F1' : '#9CA3AF';
  return (
    <div style={{
      width: 48, height: 48, borderRadius: '50%',
      background: `${color}22`, border: `2px solid ${color}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: fontWeight.extrabold, fontSize: fontSize.md, color,
      flexShrink: 0,
    }}>
      {Math.round(score)}
    </div>
  );
}

function ChannelBadges({ keyword }) {
  const channels = ['seo', 'local_seo', 'google_ads', 'meta_ads', 'organic_social']
    .filter(ch => keyword[`use_${ch}`]);
  if (!channels.length) return null;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {channels.map(ch => (
        <span key={ch} title={keyword[`${ch}_goal_he`] || CHANNEL_META[ch].label_he}
          style={{
            background: `${CHANNEL_META[ch].color}18`,
            color: CHANNEL_META[ch].color,
            border: `1px solid ${CHANNEL_META[ch].color}44`,
            padding: '2px 8px', borderRadius: 4,
            fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
          }}>
          {CHANNEL_META[ch].icon} {CHANNEL_META[ch].label_he}
        </span>
      ))}
    </div>
  );
}

function KeywordCard({ kw, compact = false }) {
  const [expanded, setExpanded] = useState(false);
  const labelColor = LABEL_COLOR[kw.output_label] || '#9CA3AF';
  const dir = isHebrew(kw.keyword) ? 'rtl' : 'ltr';

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderLeft: `4px solid ${labelColor}`,
        borderRadius: radius.md,
        padding: spacing.sm,
        marginBottom: spacing.xs,
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.sm }}>
        <ScoreDot score={kw.strategic_priority_score || 0} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
            <div style={{
              fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text,
              direction: dir,
            }}>
              {kw.keyword}
            </div>
            <span style={{
              fontSize: fontSize.xs, fontWeight: fontWeight.bold,
              background: `${labelColor}22`, color: labelColor,
              padding: '2px 8px', borderRadius: 4,
            }}>
              {LABEL_HE[kw.output_label] || kw.output_label}
            </span>
            {kw.current_organic_rank && (
              <span style={{
                fontSize: fontSize.xs, fontWeight: fontWeight.bold,
                background: kw.current_organic_rank <= 3 ? '#10B98122' : kw.current_organic_rank <= 10 ? '#F59E0B22' : '#EF444422',
                color: kw.current_organic_rank <= 3 ? '#10B981' : kw.current_organic_rank <= 10 ? '#F59E0B' : '#EF4444',
                padding: '2px 8px', borderRadius: 4,
              }}>
                מיקום #{kw.current_organic_rank}
              </span>
            )}
            {kw.intent_type && (
              <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
                {INTENT_HE[kw.intent_type] || kw.intent_type}
              </span>
            )}
          </div>
          {!compact && kw.explanation_he && (
            <div style={{
              fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4,
              direction: 'rtl', textAlign: 'right',
            }}>
              {kw.explanation_he}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: 6 }}>
            <span style={{
              fontSize: fontSize.xs, fontWeight: fontWeight.bold,
              background: '#6366F118', color: '#6366F1',
              padding: '2px 8px', borderRadius: 4,
            }}>
              ← {ACTION_HE[kw.recommended_action] || kw.recommended_action}
            </span>
            <ChannelBadges keyword={kw} />
          </div>

          {expanded && (
            <div style={{
              marginTop: spacing.sm, paddingTop: spacing.sm,
              borderTop: `1px solid ${colors.borderLight}`,
              fontSize: fontSize.xs, color: colors.textSecondary,
              direction: 'rtl', textAlign: 'right',
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 8 }}>
                {[
                  ['רלוונטיות', kw.relevance_score],
                  ['ערך עסקי', kw.business_value_score],
                  ['כוונת המרה', kw.conversion_intent_score],
                  ['כוונה מקומית', kw.local_intent_score],
                  ['ביקוש', kw.demand_score],
                  ['סיכוי לנצח', kw.win_probability_score],
                  ['תמיכת סמכות', kw.authority_support_score],
                  ['דחיפות פער', kw.gap_urgency_score],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: colors.surfaceHover, padding: 6, borderRadius: 4, textAlign: 'center' }}>
                    <div style={{ fontSize: fontSize.micro, color: colors.textMuted }}>{label}</div>
                    <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.bold, color: colors.text }}>{value?.toFixed?.(1) ?? value ?? '-'}</div>
                  </div>
                ))}
              </div>
              {['seo', 'local_seo', 'google_ads', 'meta_ads', 'organic_social'].map(ch => (
                kw[`use_${ch}`] && kw[`${ch}_goal_he`] && (
                  <div key={ch} style={{ marginTop: 4 }}>
                    <strong style={{ color: CHANNEL_META[ch].color }}>{CHANNEL_META[ch].icon} {CHANNEL_META[ch].label_he}:</strong>
                    <span style={{ marginRight: 6 }}>{kw[`${ch}_goal_he`]}</span>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
        <ChevronRight size={18} style={{
          color: colors.textMuted,
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.2s',
          flexShrink: 0,
        }} />
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, count, color = colors.primary }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: spacing.sm,
      marginBottom: spacing.sm, paddingBottom: spacing.xs,
      borderBottom: `2px solid ${color}22`,
    }}>
      <Icon size={22} style={{ color }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>
          {title}
          {count !== undefined && (
            <span style={{
              marginRight: 8, background: `${color}22`, color,
              padding: '2px 10px', borderRadius: 12,
              fontSize: fontSize.sm, fontWeight: fontWeight.bold,
            }}>{count}</span>
          )}
        </div>
        {subtitle && <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2, direction: 'rtl', textAlign: 'right' }}>{subtitle}</div>}
      </div>
    </div>
  );
}

function TaskRow({ task, kind }) {
  const color = LABEL_COLOR[task.priority_label] || colors.textMuted;
  return (
    <div style={{
      background: colors.surface,
      borderLeft: `3px solid ${color}`,
      padding: '8px 12px', marginBottom: 6,
      borderRadius: radius.sm,
      fontSize: fontSize.sm,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', direction: 'rtl' }}>
        <span style={{ fontWeight: fontWeight.bold, color: colors.text }}>{task.title_he}</span>
        <span style={{
          fontSize: fontSize.xs, fontWeight: fontWeight.semibold,
          background: `${color}22`, color,
          padding: '1px 6px', borderRadius: 4,
        }}>
          {TASK_TYPE_HE[task.task_type] || task.task_type}
        </span>
        {task.assigned_agent && (
          <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
            👤 {task.assigned_agent}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main view ───────────────────────────────────────────────
export default function GT3CommandCenterView({ clientId, clients = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  // Map legacy clientId → gt3 customer
  const [gt3CustomerId, setGt3CustomerId] = useState(null);

  const load = useCallback(async () => {
    if (!clientId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      // The backend resolves legacy client_id → GT3 customer_id automatically.
      const dash = await api(`/customers/${clientId}/gt3/dashboard`);
      setData(dash);
      setGt3CustomerId(dash?.customer?.id || null);
    } catch (e) {
      if (e.message?.includes('404') || e.message?.includes('No GT3 customer')) {
        setData({ customer: null }); // triggers onboarding CTA
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function runPipeline() {
    if (!data?.customer?.id) return;
    setRunning(true);
    try {
      await api(`/customers/${data.customer.id}/pipeline/run`, {
        method: 'POST', body: { skipCrawl: false, maxPages: 15 },
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  if (!clientId) {
    return <Empty icon={Target} msg="בחר לקוח כדי לראות מפקדת GT3" />;
  }
  if (loading) {
    return <div style={{ padding: spacing.xl, textAlign: 'center' }}><Spin /></div>;
  }
  if (error) {
    return (
      <Card>
        <div style={{ padding: spacing.md, color: colors.errorDark }}>
          <AlertTriangle size={18} style={{ display: 'inline', marginRight: 6 }} />
          שגיאה בטעינת נתוני GT3: {error}
        </div>
      </Card>
    );
  }
  if (!data?.customer) {
    return (
      <div>
        <Card>
          <div style={{ padding: spacing.xl, textAlign: 'center' }}>
            <Info size={28} style={{ color: colors.primary, marginBottom: 10 }} />
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: 8, direction: 'rtl' }}>
              אין עדיין פרופיל GT3 ללקוח הזה
            </div>
            <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.md, direction: 'rtl' }}>
              מפקדת GT3 פועלת על מודל נתונים חדש. יש להריץ את הצינור אחת כדי לאתחל.
            </div>
            <Btn onClick={runPipeline} disabled={running}>
              <Play size={14} style={{ marginLeft: 6 }} />
              {running ? 'מריץ צינור...' : 'הפעל צינור GT3'}
            </Btn>
          </div>
        </Card>
      </div>
    );
  }

  const { customer, primary_missions, support_clusters, missing_pages, quick_wins, defense, action_tasks, channel_tasks, summary } = data;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
      {/* Header */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: fontSize.xs, color: colors.primary, fontWeight: fontWeight.bold, letterSpacing: 2, marginBottom: 4 }}>
              🎯 GT3 COMMAND CENTER
            </div>
            <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: colors.text }}>
              {customer.name}
            </div>
            <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: 4, direction: 'rtl' }}>
              סוג עסק: <strong>{customer.business_type}</strong> · מודל: <strong>{customer.business_model}</strong> · שלב חיים: <strong>{customer.lifecycle_stage}</strong>
            </div>
          </div>
          <Btn onClick={runPipeline} disabled={running}>
            <RefreshCw size={14} style={{ marginLeft: 6, animation: running ? 'spin 1s linear infinite' : 'none' }} />
            {running ? 'מעדכן...' : 'הפעל צינור GT3'}
          </Btn>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: spacing.sm, marginTop: spacing.md,
        }}>
          {[
            { label: 'יעדי על', value: summary?.primary_count, color: '#EF4444' },
            { label: 'ניצחונות מהירים', value: summary?.quick_wins_count, color: '#10B981' },
            { label: 'עמודים חסרים', value: summary?.missing_pages_count, color: '#F59E0B' },
            { label: 'בוני סמכות', value: summary?.support_count, color: '#6366F1' },
            { label: 'הגנה', value: summary?.defense_count, color: '#8B5CF6' },
            { label: 'משימות פתוחות', value: (summary?.open_action_tasks || 0) + (summary?.open_channel_tasks || 0), color: '#06B6D4' },
          ].map(s => (
            <div key={s.label} style={{
              textAlign: 'center', padding: spacing.sm,
              background: `${s.color}10`, border: `1px solid ${s.color}33`,
              borderRadius: radius.md,
            }}>
              <div style={{ fontSize: fontSize['2xl'], fontWeight: fontWeight.extrabold, color: s.color }}>{s.value || 0}</div>
              <div style={{ fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2, direction: 'rtl' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Primary Missions */}
      <Card>
        <SectionHeader
          icon={Target} title="יעדי על"
          subtitle="מילות מפתח שחייבות להיכנס לטופ 3 — הלב של התוכנית"
          count={primary_missions?.length || 0} color="#EF4444"
        />
        {!primary_missions?.length && (
          <Empty icon={Target} msg="עדיין אין יעדים מדורגים כקריטיים. לאחר איסוף נתוני נפח ומיקומים, יעדי הכסף יעלו לכאן אוטומטית." />
        )}
        {primary_missions?.map(kw => <KeywordCard key={kw.keyword_id} kw={kw} />)}
      </Card>

      {/* Quick Wins */}
      <Card>
        <SectionHeader
          icon={Zap} title="ניצחונות מהירים"
          subtitle="מילים עם סיכוי ריאלי לקפוץ לטופ 3 בטווח קצר"
          count={quick_wins?.length || 0} color="#10B981"
        />
        {!quick_wins?.length ? (
          <Empty icon={Zap} msg="אין ניצחונות מהירים זמינים כרגע" />
        ) : quick_wins.slice(0, 10).map(kw => <KeywordCard key={kw.keyword_id} kw={kw} compact />)}
      </Card>

      {/* Missing Pages */}
      <Card>
        <SectionHeader
          icon={FileQuestion} title="עמודי יעד חסרים"
          subtitle="מילים חשובות ללא עמוד תואם — נדרשת בניית דף יעד"
          count={missing_pages?.length || 0} color="#F59E0B"
        />
        {!missing_pages?.length ? (
          <Empty icon={FileQuestion} msg="כל המילים החשובות מכוסות בעמודים" />
        ) : missing_pages.slice(0, 10).map(kw => <KeywordCard key={kw.keyword_id} kw={kw} compact />)}
      </Card>

      {/* Defense */}
      <Card>
        <SectionHeader
          icon={Shield} title="הגנה"
          subtitle="מילים שכבר בטופ 3 — נדרשת שמירה"
          count={defense?.length || 0} color="#8B5CF6"
        />
        {!defense?.length ? (
          <Empty icon={Shield} msg="אין כרגע מילים בטופ 3" />
        ) : defense.map(kw => <KeywordCard key={kw.keyword_id} kw={kw} compact />)}
      </Card>

      {/* Support Clusters */}
      <Card>
        <SectionHeader
          icon={Layers} title="בוני סמכות"
          subtitle="מילים תומכות שמחזקות את יעדי הכסף"
          count={support_clusters?.length || 0} color="#6366F1"
        />
        {!support_clusters?.length ? (
          <Empty icon={Layers} msg="אין כרגע בוני סמכות זמינים" />
        ) : support_clusters.slice(0, 15).map(kw => <KeywordCard key={kw.keyword_id} kw={kw} compact />)}
      </Card>

      {/* Tasks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: spacing.md }}>
        <Card>
          <SectionHeader
            icon={TrendingUp} title="משימות SEO פתוחות"
            subtitle="משימות שהמערכת ייצרה מתוך המיקוד למילות היעד"
            count={action_tasks?.length || 0} color="#6366F1"
          />
          {!action_tasks?.length ? (
            <Empty icon={TrendingUp} msg="אין משימות פתוחות" />
          ) : action_tasks.slice(0, 20).map(t => <TaskRow key={t.id} task={t} kind="action" />)}
        </Card>
        <Card>
          <SectionHeader
            icon={ExternalLink} title="משימות ערוצים"
            subtitle="Google Ads / Meta / Local / Social"
            count={channel_tasks?.length || 0} color="#E1306C"
          />
          {!channel_tasks?.length ? (
            <Empty icon={ExternalLink} msg="אין משימות ערוצים פתוחות" />
          ) : channel_tasks.slice(0, 20).map(t => <TaskRow key={t.id} task={t} kind="channel" />)}
        </Card>
      </div>
    </div>
  );
}
