// ─── AI Growth OS — Link Intelligence View ──────────────────────
import { useState, useEffect } from 'react';
import { Link, Zap } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import {
  Badge, Card, Btn, SH, Spin, Empty, Tabs, SortableTable, SkeletonCard,
} from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

// ─── Impact / effort color helpers ──────────────────────────────
const impactStyle = (level) => {
  switch (level) {
    case 'high': return { color: colors.successDark, bg: colors.successLight };
    case 'medium': return { color: colors.warningDark, bg: colors.warningLight };
    default: return { color: colors.textSecondary, bg: colors.surfaceHover };
  }
};

const effortStyle = () => ({
  color: colors.textSecondary,
  bg: colors.surfaceHover,
});

// ─── Opportunity Card ───────────────────────────────────────────
function OpportunityCard({ o }) {
  const impact = impactStyle(o.expected_impact);
  return (
    <Card style={{ marginBottom: spacing.md }}>
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
        <div
          style={{
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: colors.text,
          }}
        >
          {o.domain}
        </div>
        <div
          style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}
          aria-label="Opportunity metrics"
        >
          <Badge
            text={`DA ${Math.round(o.domain_authority)}`}
            color={colors.textSecondary}
            bg={colors.surfaceHover}
          />
          <Badge
            text={o.expected_impact}
            color={impact.color}
            bg={impact.bg}
          />
          <Badge
            text={o.effort}
            {...effortStyle()}
          />
        </div>
      </div>

      {o.competitor_that_has_it && (
        <div
          style={{
            fontSize: fontSize.xs,
            color: colors.textDisabled,
            marginBottom: spacing.sm,
          }}
        >
          Competitor: {o.competitor_that_has_it}
        </div>
      )}

      <div
        style={{
          fontSize: fontSize.sm,
          color: colors.text,
          marginBottom: spacing.xs,
          lineHeight: 1.5,
        }}
      >
        <strong>Why:</strong> {o.why_it_matters}
      </div>
      <div
        style={{
          fontSize: fontSize.sm,
          color: colors.text,
          lineHeight: 1.5,
        }}
      >
        <strong>Strategy:</strong> {o.outreach_strategy}
      </div>
    </Card>
  );
}

// ─── Main View ──────────────────────────────────────────────────
export default function LinkIntelligenceView({ clientId }) {
  const [tab, setTab] = useState('opportunities');
  const [data, setData] = useState({ opportunities: [], missing: [], gap: [] });
  const [generating, setGen] = useState(false);
  const [loading, setLoading] = useState(false);

  const tabDefs = [
    { id: 'opportunities', label: 'Opportunities' },
    { id: 'missing-domains', label: 'Missing Domains' },
    { id: 'link-gap', label: 'Link Gap' },
  ];

  const load = async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [opp, miss, gap] = await Promise.all([
        api(`/clients/${clientId}/link-opportunities`),
        api(`/clients/${clientId}/missing-domains`),
        api(`/clients/${clientId}/link-gap`),
      ]);
      setData({ opportunities: opp, missing: miss, gap });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  const gen = async () => {
    setGen(true);
    try {
      await api(`/clients/${clientId}/link-intelligence/generate`, { method: 'POST' });
      await load();
    } catch (e) {
      alert(e.message);
    }
    setGen(false);
  };

  // ── Empty / loading states ──────────────────────────────────
  if (!clientId) {
    return <Empty icon={Link} msg="Select a client to view link intelligence" />;
  }

  if (loading && data.opportunities.length === 0) {
    return (
      <div>
        <SH title="Link Intelligence" sub="Competitor gap, missing domains, AI-powered link acquisition strategy" />
        <SkeletonCard rows={4} />
      </div>
    );
  }

  // ── Missing-domains columns (SortableTable) ─────────────────
  const missingCols = [
    {
      key: 'domain',
      label: 'Domain',
      render: (row) => (
        <span style={{ fontWeight: fontWeight.semibold }}>{row.domain}</span>
      ),
    },
    {
      key: 'da',
      label: 'DA',
      sortValue: (row) => row.domain_authority,
      render: (row) => (
        <Badge
          text={Math.round(row.domain_authority)}
          color={colors.textSecondary}
          bg={colors.surfaceHover}
        />
      ),
    },
    {
      key: 'competitors',
      label: 'Competitors That Have It',
      sortable: false,
      render: (row) => (
        <span style={{ fontSize: fontSize.xs, color: colors.textMuted }}>
          {row.competitors_that_have_it?.join(', ') || '\u2014'}
        </span>
      ),
    },
    {
      key: 'category',
      label: 'Category',
      render: (row) => (
        <span style={{ fontSize: fontSize.xs }}>{row.category || '\u2014'}</span>
      ),
    },
    {
      key: 'priority_score',
      label: 'Priority',
      sortValue: (row) => row.priority_score,
      render: (row) => (
        <Badge
          text={Math.round(row.priority_score)}
          color={colors.textSecondary}
          bg={colors.surfaceHover}
        />
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge
          text={row.status}
          color={colors.status[row.status] || colors.textSecondary}
          bg={(colors.status[row.status] || colors.textSecondary) + '22'}
        />
      ),
    },
  ];

  // ── Link-gap columns (SortableTable) ────────────────────────
  const gapCols = [
    {
      key: 'domain',
      label: 'Domain',
      render: (row) => (
        <span style={{ fontWeight: fontWeight.semibold }}>{row.domain}</span>
      ),
    },
    {
      key: 'da',
      label: 'DA',
      sortValue: (row) => row.domain_authority,
      render: (row) => (
        <Badge
          text={Math.round(row.domain_authority)}
          color={colors.textSecondary}
          bg={colors.surfaceHover}
        />
      ),
    },
    {
      key: 'competitor_domain',
      label: 'Competitor',
      render: (row) => (
        <span style={{ color: colors.textMuted }}>{row.competitor_domain}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        <Badge
          text={row.status}
          color={colors.status[row.status] || colors.textSecondary}
          bg={(colors.status[row.status] || colors.textSecondary) + '22'}
        />
      ),
    },
  ];

  return (
    <div>
      <SH
        title="Link Intelligence"
        sub="Competitor gap, missing domains, AI-powered link acquisition strategy"
        action={
          <Btn
            onClick={gen}
            disabled={generating}
            color={colors.primary}
            small
            ariaLabel="Generate AI link analysis"
          >
            {generating ? <Spin /> : <Zap size={12} />} Generate AI Analysis
          </Btn>
        }
      />

      <Tabs tabs={tabDefs} active={tab} onChange={setTab} />

      {/* ── Opportunities tab ──────────────────────────────────── */}
      {tab === 'opportunities' && (
        <div role="tabpanel" aria-label="Opportunities">
          {data.opportunities.map((o) => (
            <OpportunityCard key={o.id} o={o} />
          ))}
          {data.opportunities.length === 0 && (
            <Empty
              icon={Link}
              msg="No link opportunities yet — click Generate AI Analysis"
            />
          )}
        </div>
      )}

      {/* ── Missing Domains tab ────────────────────────────────── */}
      {tab === 'missing-domains' && (
        <div role="tabpanel" aria-label="Missing Domains">
          <Card>
            <SortableTable
              columns={missingCols}
              data={data.missing}
              emptyIcon={Link}
              emptyMsg="No missing domains — import from Google Sheets"
            />
          </Card>
        </div>
      )}

      {/* ── Link Gap tab ───────────────────────────────────────── */}
      {tab === 'link-gap' && (
        <div role="tabpanel" aria-label="Link Gap">
          <Card>
            <SortableTable
              columns={gapCols}
              data={data.gap}
              emptyIcon={Link}
              emptyMsg="No gap data — import competitor link gap from Sheets"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
