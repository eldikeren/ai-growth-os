import { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Link2, Send } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, fontSize, fontWeight } from '../theme.js';
import { Card, KpiCard, SH, Badge, Dot, Btn, Spin, Empty, SkeletonCard, SkeletonKpi } from '../components/index.jsx';

export default function Dashboard({ clientId, clients }) {
  const [stats, sS] = useState(null);
  const [bl, sBl] = useState([]);
  const [runs, sR] = useState([]);
  const [inc, sI] = useState([]);
  const [load, sL] = useState(false);

  const fetch_data = useCallback(async () => {
    if (!clientId) return;
    sL(true);
    try {
      const [s, b, r, i] = await Promise.all([
        api(`/clients/${clientId}/stats`),
        api(`/clients/${clientId}/baselines`),
        api(`/clients/${clientId}/runs?limit=10`),
        api(`/clients/${clientId}/incidents?status=open`),
      ]);
      sS(s); sBl(b); sR(r); sI(i);
    } catch (e) { console.error(e); }
    sL(false);
  }, [clientId]);

  useEffect(() => { fetch_data(); }, [fetch_data]);

  if (!clientId) return <Empty icon={Users} msg="Select a client to view dashboard" />;

  const client = clients.find(c => c.id === clientId);
  const bm = Object.fromEntries(bl.map(b => [b.metric_name, b]));

  if (load) {
    return (
      <div>
        <SH title={client?.name || 'Dashboard'} sub={client?.domain} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
          {[1, 2, 3, 4].map(i => <SkeletonKpi key={i} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <SkeletonCard rows={5} />
          <SkeletonCard rows={4} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SH title={client?.name || 'Dashboard'} sub={client?.domain} action={<Btn onClick={fetch_data} small secondary ariaLabel="Refresh dashboard"><RefreshCw size={12} />Refresh</Btn>} />

      {/* KPI Row 1 */}
      <div className="grid-responsive-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <KpiCard label="Google Reviews" value={bm.google_reviews_count?.metric_value} target={bm.google_reviews_count?.target_value} color={colors.accent} />
        <KpiCard label="LawReviews" value={bm.lawreviews_count?.metric_value} sub={bm.lawreviews_rating?.metric_value ? `\u2605 ${bm.lawreviews_rating.metric_value}` : undefined} color={colors.success} />
        <KpiCard label="Mobile PageSpeed" value={bm.mobile_pagespeed?.metric_value} target={bm.mobile_pagespeed?.target_value} color={(bm.mobile_pagespeed?.metric_value || 0) >= 80 ? colors.success : colors.error} sub="/100" />
        <KpiCard label="Page 1 Keywords" value={bm.page1_keyword_count?.metric_value} target={bm.page1_keyword_count?.target_value} color={colors.primary} />
      </div>

      {/* KPI Row 2 */}
      <div className="grid-responsive-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <KpiCard label="Local 3-Pack" value={bm.local_3pack_present?.metric_value != null ? (bm.local_3pack_present.metric_value === 1 ? '\u2713 Yes' : '\u2717 No') : undefined} color={bm.local_3pack_present?.metric_value === 1 ? colors.success : colors.error} />
        <KpiCard label="Indexed Pages" value={bm.indexed_pages?.metric_value} target={bm.indexed_pages?.target_value} color={colors.info} />
        <KpiCard label="Referring Domains" value={bm.referring_domains_count?.metric_value} target={bm.referring_domains_count?.target_value} color="#8B5CF6" />
        <KpiCard label="Domain Authority" value={bm.domain_authority?.metric_value} target={bm.domain_authority?.target_value} color="#06B6D4" />
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid-responsive-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>7-Day Runs</div>
            <div style={{ fontSize: 22, fontWeight: fontWeight.bold }}>{stats.run_stats?.total_runs ?? 0}</div>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>Success Rate</div>
            <div style={{ fontSize: 22, fontWeight: fontWeight.bold, color: colors.success }}>{stats.run_stats?.success_rate ?? 0}%</div>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>Open Incidents</div>
            <div style={{ fontSize: 22, fontWeight: fontWeight.bold, color: inc.length > 0 ? colors.error : colors.success }}>{inc.length}</div>
          </Card>
          <Card style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>Memory Items</div>
            <div style={{ fontSize: 22, fontWeight: fontWeight.bold, color: colors.primary }}>{stats.memory_count ?? 0}</div>
          </Card>
        </div>
      )}

      {/* Quick Actions — Customer Setup Link */}
      <Card style={{ marginBottom: 20, background: colors.primaryLightest, borderColor: colors.primaryLighter }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.primary, marginBottom: 2 }}>
              <Send size={14} style={{ marginRight: 6 }} />Customer Setup Link
            </div>
            <div style={{ fontSize: fontSize.sm, color: colors.textSecondary }}>
              Send your client a magic link to connect their Google, Meta, website and other digital assets.
            </div>
          </div>
          <Btn onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'setup-links' }))} color={colors.primary}>
            <Link2 size={13} /> Create Setup Link
          </Btn>
        </div>
      </Card>

      {/* Two-column: Recent Runs + Open Incidents */}
      <div className="grid-responsive-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <Card>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: 14 }}>Recent Runs</div>
          {runs.slice(0, 8).map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
              <Dot s={r.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.agent_templates?.name}</div>
                <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>{new Date(r.created_at).toLocaleString()}</div>
              </div>
              <Badge text={r.status} color={colors.status[r.status]} bg={colors.status[r.status] + '22'} />
            </div>
          ))}
          {runs.length === 0 && <div style={{ fontSize: fontSize.sm, color: colors.textDisabled, padding: '10px 0' }}>No runs yet</div>}
        </Card>

        <Card>
          <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold, marginBottom: 14 }}>Open Incidents</div>
          {inc.slice(0, 6).map(i => (
            <div key={i.id} style={{ padding: '8px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <Badge text={i.severity} color={colors.severity[i.severity]?.color} bg={colors.severity[i.severity]?.bg} />
                <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, flex: 1 }}>{i.title}</span>
              </div>
            </div>
          ))}
          {inc.length === 0 && <div style={{ fontSize: fontSize.sm, color: colors.success, padding: '10px 0' }}>{'\u2713'} No open incidents</div>}
        </Card>
      </div>
    </div>
  );
}
