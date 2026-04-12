// ─── SEO & Link Intelligence View ────────────────────────────────
import { useState, useEffect, useCallback } from 'react';
import { Link, Globe, Zap, Database, RefreshCw } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, shadows } from '../theme.js';
import {
  Card, Btn, Spin, Badge, Dot, Empty, SH, Tabs,
  SortableTable, Field, Skeleton, SkeletonCard,
  inputStyle, selectStyle,
} from '../components/index.jsx';

// ─── Difficulty Bar (inline) ─────────────────────────────────────
function DifficultyBar({ value }) {
  const v = value || 0;
  const bg = v > 60 ? colors.error : v > 40 ? colors.warning : colors.success;
  return (
    <div
      role="meter"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Difficulty ${v}%`}
      style={{ height: 4, background: colors.borderLight, borderRadius: radius.sm, width: 60 }}
    >
      <div style={{ height: 4, borderRadius: radius.sm, background: bg, width: `${v}%`, transition: 'width 0.3s ease' }} />
    </div>
  );
}

// ─── Tab content: Keywords ───────────────────────────────────────
function KeywordsTab({ data }) {
  const columns = [
    {
      key: 'keyword',
      label: 'Keyword',
      sortable: true,
      style: { minWidth: 180, textAlign: 'right' },
      render: (row) => (
        <span style={{ fontWeight: fontWeight.semibold, direction: 'rtl', display: 'inline-block', unicodeBidi: 'embed' }}>
          {row.keyword}
        </span>
      ),
    },
    {
      key: 'current_position',
      label: 'Position',
      sortable: true,
      sortValue: (row) => row.current_position ?? 9999,
      render: (row) =>
        row.current_position ? (
          <Badge
            text={`#${row.current_position}`}
            color={row.current_position <= 10 ? colors.successDark : colors.warningDark}
            bg={row.current_position <= 10 ? colors.successLight : colors.warningLight}
          />
        ) : (
          <span style={{ color: colors.textDisabled }}>--</span>
        ),
    },
    {
      key: 'volume',
      label: 'Volume',
      sortable: true,
      render: (row) => row.volume?.toLocaleString() || '--',
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      sortable: true,
      render: (row) => <DifficultyBar value={row.difficulty} />,
    },
    {
      key: 'cluster',
      label: 'Cluster',
      sortable: true,
      render: (row) => (
        <span style={{ fontSize: fontSize.xs, direction: 'rtl', display: 'inline-block' }}>
          {row.cluster || '--'}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <SortableTable columns={columns} data={data} emptyIcon={Link} emptyMsg="No keywords -- import via Sheets Sync" />
    </Card>
  );
}

// ─── Tab content: Backlinks ──────────────────────────────────────
function BacklinksTab({ data }) {
  const columns = [
    {
      key: 'source_domain',
      label: 'Source Domain',
      sortable: true,
      render: (row) => <span style={{ fontWeight: fontWeight.semibold }}>{row.source_domain}</span>,
    },
    {
      key: 'domain_authority',
      label: 'DA',
      sortable: true,
      render: (row) => (
        <Badge
          text={Math.round(row.domain_authority)}
          color={row.domain_authority >= 50 ? colors.successDark : colors.text}
          bg={row.domain_authority >= 50 ? colors.successLight : colors.surfaceHover}
        />
      ),
    },
    {
      key: 'anchor_text',
      label: 'Anchor',
      sortable: true,
      render: (row) => <span style={{ color: colors.textMuted }}>{row.anchor_text || '--'}</span>,
    },
    {
      key: 'is_dofollow',
      label: 'Type',
      sortable: true,
      sortValue: (row) => (row.is_dofollow ? 1 : 0),
      render: (row) => (
        <Badge
          text={row.is_dofollow ? 'dofollow' : 'nofollow'}
          color={row.is_dofollow ? colors.successDark : colors.textMuted}
          bg={row.is_dofollow ? colors.successLight : colors.surfaceHover}
        />
      ),
    },
  ];

  return (
    <Card>
      <SortableTable columns={columns} data={data} emptyIcon={Link} emptyMsg="No backlinks -- import from Google Sheets" />
    </Card>
  );
}

// ─── Tab content: Referring Domains ──────────────────────────────
function ReferringDomainsTab({ data }) {
  const columns = [
    {
      key: 'domain',
      label: 'Domain',
      sortable: true,
      render: (row) => <span style={{ fontWeight: fontWeight.semibold }}>{row.domain}</span>,
    },
    {
      key: 'domain_authority',
      label: 'DA',
      sortable: true,
      render: (row) => (
        <Badge text={Math.round(row.domain_authority)} color={colors.text} bg={colors.surfaceHover} />
      ),
    },
    {
      key: 'backlink_count',
      label: 'Links',
      sortable: true,
    },
  ];

  return (
    <Card>
      <SortableTable columns={columns} data={data} emptyIcon={Globe} emptyMsg="No referring domains" />
    </Card>
  );
}

// ─── Tab content: Link Gap ───────────────────────────────────────
function LinkGapTab({ data }) {
  const columns = [
    {
      key: 'domain',
      label: 'Domain',
      sortable: true,
      render: (row) => <span style={{ fontWeight: fontWeight.semibold }}>{row.domain}</span>,
    },
    {
      key: 'domain_authority',
      label: 'DA',
      sortable: true,
      render: (row) => (
        <Badge text={Math.round(row.domain_authority)} color={colors.text} bg={colors.surfaceHover} />
      ),
    },
    {
      key: 'competitor_domain',
      label: 'Competitor',
      sortable: true,
      render: (row) => <span style={{ color: colors.textMuted }}>{row.competitor_domain}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge text={row.status} color={colors.text} bg={colors.surfaceHover} />,
    },
  ];

  return (
    <Card>
      <SortableTable columns={columns} data={data} emptyIcon={Link} emptyMsg="No gap data -- import from Sheets" />
    </Card>
  );
}

// ─── Tab content: Recommendations ────────────────────────────────
function RecommendationsTab({ data, clientId, onRefresh }) {
  const [genRecs, setGenRecs] = useState(false);

  const generate = async () => {
    setGenRecs(true);
    try {
      await api(`/clients/${clientId}/link-recommendations/generate`, { method: 'POST' });
      await onRefresh();
    } catch (e) {
      alert(e.message);
    }
    setGenRecs(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: spacing.md }}>
        <Btn onClick={generate} disabled={genRecs} color="#7c3aed" ariaLabel="Generate AI link recommendations">
          {genRecs ? <Spin /> : <Zap size={13} />}
          Generate AI Recommendations
        </Btn>
      </div>

      {data.map((r) => (
        <Card key={r.id} style={{ marginBottom: spacing.sm }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm, flexWrap: 'wrap', gap: spacing.sm }}>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>
              #{r.priority} {r.domain}
            </div>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Badge text={`DA ${Math.round(r.domain_authority)}`} color={colors.text} bg={colors.surfaceHover} />
              <Badge
                text={r.estimated_impact}
                color={r.estimated_impact === 'high' ? colors.successDark : colors.warningDark}
                bg={r.estimated_impact === 'high' ? colors.successLight : colors.warningLight}
              />
            </div>
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.text, marginBottom: spacing.xs }}>
            <strong>Why:</strong> {r.why_it_matters}
          </div>
          <div style={{ fontSize: fontSize.sm, color: colors.text }}>
            <strong>Strategy:</strong> {r.outreach_strategy}
          </div>
        </Card>
      ))}

      {data.length === 0 && <Empty icon={Zap} msg="No recommendations -- click Generate" />}
    </div>
  );
}

// ─── Tab content: Sheets Sync ────────────────────────────────────
function SheetsSyncTab({ data, clientId, onRefresh }) {
  const [syncing, setSyncing] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [syncType, setSyncType] = useState('backlinks');

  const handleImport = async () => {
    if (!sheetUrl) { alert('Enter a Google Sheets URL'); return; }
    setSyncing(true);
    try {
      await api(`/clients/${clientId}/sync-sheets`, { method: 'POST', body: { sheetUrl, syncType } });
      await onRefresh();
      setSheetUrl('');
    } catch (e) {
      alert(e.message);
    }
    setSyncing(false);
  };

  const syncTypeOptions = [
    { value: 'backlinks', label: 'Backlinks' },
    { value: 'referring_domains', label: 'Referring Domains' },
    { value: 'competitor_link_gap', label: 'Competitor Link Gap' },
    { value: 'keyword_rankings', label: 'Keyword Rankings' },
    { value: 'competitors', label: 'Competitors' },
  ];

  return (
    <div>
      <Card style={{ marginBottom: spacing.lg }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.md }}>
          Import from Google Sheets
        </div>
        <Field label="Data Type" htmlFor="sync-type">
          <select
            id="sync-type"
            value={syncType}
            onChange={(e) => setSyncType(e.target.value)}
            style={selectStyle}
          >
            {syncTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Google Sheets URL" htmlFor="sheet-url">
          <input
            id="sheet-url"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            style={inputStyle}
          />
        </Field>
        <Btn onClick={handleImport} disabled={syncing} ariaLabel="Import data from Google Sheets">
          {syncing ? <Spin /> : <Database size={13} />}
          Import
        </Btn>
      </Card>

      <Card>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.md }}>
          Sync History
        </div>
        {data.map((log) => (
          <div
            key={log.id}
            style={{
              display: 'flex',
              gap: spacing.sm,
              padding: `${spacing.sm}px 0`,
              borderBottom: `1px solid ${colors.borderLight}`,
              alignItems: 'center',
            }}
          >
            <Dot s={log.status} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold }}>
                {log.sync_type} -- {log.rows_imported} imported
              </div>
              <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>
                {new Date(log.created_at).toLocaleString()}
              </div>
              {log.error && (
                <div style={{ fontSize: fontSize.xs, color: colors.error }}>{log.error}</div>
              )}
            </div>
            <Badge
              text={log.status}
              color={colors.status[log.status] || colors.text}
              bg={(colors.status[log.status] || colors.text) + '22'}
            />
          </div>
        ))}
        {data.length === 0 && (
          <div style={{ fontSize: fontSize.sm, color: colors.textDisabled }}>No sync history</div>
        )}
      </Card>
    </div>
  );
}

// ─── Loading skeleton for SEO view ───────────────────────────────
function SeoSkeleton() {
  return (
    <div>
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.xl }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width={90} height={30} borderRadius={radius.md} />
        ))}
      </div>
      <SkeletonCard rows={8} />
    </div>
  );
}

// ─── Main View ───────────────────────────────────────────────────
const TAB_LIST = ['keywords', 'backlinks', 'referring-domains', 'link-gap', 'recommendations', 'sheets-sync'];

export default function SeoView({ clientId }) {
  const [tab, setTab] = useState('keywords');
  const [data, setData] = useState({
    keywords: [],
    backlinks: [],
    referringDomains: [],
    linkGap: [],
    recommendations: [],
    syncLog: [],
  });
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [kw, bl, rd, lg, rec, log] = await Promise.all([
        api(`/clients/${clientId}/keywords`),
        api(`/clients/${clientId}/backlinks`),
        api(`/clients/${clientId}/referring-domains`),
        api(`/clients/${clientId}/link-gap`),
        api(`/clients/${clientId}/link-recommendations`),
        api(`/clients/${clientId}/sync-log`),
      ]);
      setData({
        keywords: kw,
        backlinks: bl,
        referringDomains: rd,
        linkGap: lg,
        recommendations: rec,
        syncLog: log,
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (!clientId) return <Empty icon={Link} msg="Select a client to view SEO data" />;

  return (
    <div>
      <SH
        title="SEO & Link Intelligence"
        sub="Rankings, backlinks, gaps, AI recommendations"
        action={
          <Btn small secondary onClick={fetchAll} ariaLabel="Refresh SEO data">
            <RefreshCw size={12} />
          </Btn>
        }
      />

      <Tabs tabs={TAB_LIST} active={tab} onChange={setTab} />

      {loading ? (
        <SeoSkeleton />
      ) : (
        <>
          {tab === 'keywords' && <KeywordsTab data={data.keywords} />}
          {tab === 'backlinks' && <BacklinksTab data={data.backlinks} />}
          {tab === 'referring-domains' && <ReferringDomainsTab data={data.referringDomains} />}
          {tab === 'link-gap' && <LinkGapTab data={data.linkGap} />}
          {tab === 'recommendations' && (
            <RecommendationsTab data={data.recommendations} clientId={clientId} onRefresh={fetchAll} />
          )}
          {tab === 'sheets-sync' && (
            <SheetsSyncTab data={data.syncLog} clientId={clientId} onRefresh={fetchAll} />
          )}
        </>
      )}
    </div>
  );
}
