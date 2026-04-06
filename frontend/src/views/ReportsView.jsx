// ─── Reports View ────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import { BarChart3, Eye, X } from 'lucide-react';
import { api, API } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import {
  Card, Btn, Spin, Badge, Empty, SH, Field,
  Skeleton, SkeletonCard,
  inputStyle, selectStyle,
} from '../components/index.jsx';

// ─── Loading skeleton ────────────────────────────────────────────
function ReportsSkeleton() {
  return (
    <div>
      <Card style={{ marginBottom: spacing.xl }}>
        <Skeleton width={180} height={16} style={{ marginBottom: spacing.md }} />
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Skeleton width={120} height={34} />
          <Skeleton width={140} height={34} />
          <Skeleton width={140} height={34} />
          <Skeleton width={100} height={34} />
        </div>
      </Card>
      <SkeletonCard rows={4} />
    </div>
  );
}

export default function ReportsView({ clientId, clients }) {
  const [reports, setReports] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState({ start: '', end: '', type: 'monthly' });
  const [previewId, setPreviewId] = useState(null);

  const client = clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api(`/clients/${clientId}/reports`)
      .then(setReports)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId]);

  if (!clientId) return <Empty icon={BarChart3} msg="Select a client to view reports" />;

  const handleGenerate = async () => {
    if (!period.start || !period.end) { alert('Set start and end dates'); return; }
    setGenerating(true);
    try {
      await api(`/clients/${clientId}/reports/generate`, {
        method: 'POST',
        body: { periodStart: period.start, periodEnd: period.end, periodType: period.type },
      });
      setReports(await api(`/clients/${clientId}/reports`));
    } catch (e) {
      alert(e.message);
    }
    setGenerating(false);
  };

  const statusColor = (status) => colors.status[status] || colors.text;

  if (loading) {
    return (
      <div>
        <SH title="Reports" sub={`Reports for ${client?.name || '...'}`} />
        <ReportsSkeleton />
      </div>
    );
  }

  return (
    <div>
      <SH title="Reports" sub={`${reports.length} report${reports.length !== 1 ? 's' : ''} for ${client?.name}`} />

      {/* ── Generate New Report Form ── */}
      <Card style={{ marginBottom: spacing.xl }}>
        <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, marginBottom: spacing.md }}>
          Generate New Report
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: spacing.md,
            alignItems: 'end',
          }}
        >
          <Field label="Type" htmlFor="report-type">
            <select
              id="report-type"
              value={period.type}
              onChange={(e) => setPeriod({ ...period, type: e.target.value })}
              style={selectStyle}
            >
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>

          <Field label="Start Date" htmlFor="report-start">
            <input
              id="report-start"
              type="date"
              value={period.start}
              onChange={(e) => setPeriod({ ...period, start: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <Field label="End Date" htmlFor="report-end">
            <input
              id="report-end"
              type="date"
              value={period.end}
              onChange={(e) => setPeriod({ ...period, end: e.target.value })}
              style={inputStyle}
            />
          </Field>

          <div>
            <Btn onClick={handleGenerate} disabled={generating} ariaLabel="Generate report">
              {generating ? <Spin /> : <BarChart3 size={13} />}
              {generating ? 'Generating...' : 'Generate'}
            </Btn>
          </div>
        </div>
      </Card>

      {/* ── Preview iframe ── */}
      {previewId && (
        <Card style={{ marginBottom: spacing.xl }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold }}>Preview</div>
            <Btn secondary small onClick={() => setPreviewId(null)} ariaLabel="Close preview">
              <X size={12} />
            </Btn>
          </div>
          <iframe
            src={`${API}/reports/${previewId}/html`}
            style={{
              width: '100%',
              height: 600,
              border: `1px solid ${colors.border}`,
              borderRadius: radius.md,
            }}
            title="Report preview"
          />
        </Card>
      )}

      {/* ── Report List ── */}
      <Card>
        {reports.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.sm,
              padding: `${spacing.md}px 0`,
              borderBottom: `1px solid ${colors.borderLight}`,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.semibold }}>{r.title}</div>
              <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>
                {new Date(r.created_at).toLocaleString()}
              </div>
            </div>
            <Badge
              text={r.status}
              color={statusColor(r.status)}
              bg={statusColor(r.status) + '22'}
            />
            <Btn secondary small onClick={() => setPreviewId(r.id)} ariaLabel={`Preview report: ${r.title}`}>
              <Eye size={12} />
            </Btn>
          </div>
        ))}
        {reports.length === 0 && <Empty icon={BarChart3} msg="No reports yet" />}
      </Card>
    </div>
  );
}
