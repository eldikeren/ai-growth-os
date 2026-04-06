// ─── AI Growth OS — Onboarding View ─────────────────────────────
// 6-step wizard with skip, auto-save, accessibility, responsive layout
import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, Loader, X } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions, breakpoints } from '../theme.js';
import { Card, Btn, SH, Field, Badge, Spin, inputStyle, selectStyle } from '../components/index.jsx';
import { api } from '../hooks/useApi.js';

const STORAGE_KEY = 'growthOS_onboarding_draft';

const INITIAL_DATA = {
  name: '', domain: '', businessType: 'law firm', industry: 'legal services',
  subIndustry: '', language: 'he', rtlRequired: true, brandVoice: '',
  geographies: [], targetAudiences: [], forbiddenAudiences: [], profitableTopics: [],
  complianceRestrictions: '', gscPropertyUrl: '', googleAdsCid: '', websiteUrl: '',
  reportRecipients: [], keywords: [], competitors: [],
  allowedAccounts: [], forbiddenAccounts: [], sourceOfTruth: 'Google Drive',
  preRunDocument: 'CLAUDE.md', specialPolicies: [], approvalRequiredFor: [],
  reviewsVoice: 'office', defaultReportLanguage: 'he',
  defaultReportTypes: ['weekly_progress'], reportSchedule: 'weekly', timezone: 'Asia/Jerusalem',
};

const STEPS = [
  'Basic Identity',
  'Targeting',
  'Connectors & Data',
  'SEO Foundation',
  'Operational Policies',
  'Reports & Schedule',
];

// ─── Tag Chip ───────────────────────────────────────────────────
function Chip({ label, onRemove, bg = colors.primaryLightest, color: chipColor = colors.primary }) {
  return (
    <span
      style={{
        background: bg,
        color: chipColor,
        padding: '2px 8px',
        borderRadius: radius.sm,
        fontSize: fontSize.sm,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: colors.textDisabled,
          padding: 0,
          fontSize: fontSize.lg,
          lineHeight: 1,
        }}
      >
        <X size={12} />
      </button>
    </span>
  );
}

// ─── Array Field with input + Add button ────────────────────────
function ArrayField({ id, label, placeholder, items, onAdd, onRemove, chipBg, chipColor }) {
  const inputRef = useRef(null);

  const handleAdd = () => {
    const el = inputRef.current;
    if (!el || !el.value.trim()) return;
    onAdd(el.value.trim());
    el.value = '';
    el.focus();
  };

  return (
    <Field label={label} htmlFor={id}>
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.sm }}>
        <input
          id={id}
          ref={inputRef}
          style={{ ...inputStyle, marginBottom: 0, flex: 1 }}
          placeholder={placeholder}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Btn small secondary onClick={handleAdd} ariaLabel={`Add ${label}`}>
          Add
        </Btn>
      </div>
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: spacing.xs, flexWrap: 'wrap' }} role="list" aria-label={label}>
          {items.map((item, i) => (
            <span key={i} role="listitem">
              <Chip
                label={typeof item === 'object' ? item.keyword || item.domain : item}
                onRemove={() => onRemove(i)}
                bg={chipBg}
                color={chipColor}
              />
            </span>
          ))}
        </div>
      )}
    </Field>
  );
}

// ─── Step Progress Bar ──────────────────────────────────────────
function StepProgress({ current, steps }) {
  return (
    <nav aria-label="Onboarding progress" style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing['2xl'] }}>
      {steps.map((s, i) => {
        const stepNum = i + 1;
        const isActive = current === stepNum;
        const isCompleted = current > stepNum;
        let bg = colors.surfaceHover;
        let textColor = colors.textDisabled;
        if (isActive) { bg = colors.primary; textColor = colors.onPrimary; }
        else if (isCompleted) { bg = colors.success; textColor = colors.textInverse; }

        return (
          <div
            key={i}
            role="listitem"
            aria-current={isActive ? 'step' : undefined}
            aria-label={`Step ${stepNum}: ${s}${isCompleted ? ' (completed)' : isActive ? ' (current)' : ''}`}
            style={{
              flex: 1,
              padding: `${spacing.sm}px ${spacing.xs}px`,
              borderRadius: radius.md,
              background: bg,
              color: textColor,
              fontSize: fontSize.micro,
              fontWeight: fontWeight.bold,
              textAlign: 'center',
              transition: transitions.fast,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {stepNum}. {s}
          </div>
        );
      })}
    </nav>
  );
}

// ─── Main Component ─────────────────────────────────────────────
export default function OnboardingView({ clientId, clients, onClientCreated }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...INITIAL_DATA, ...parsed };
      }
    } catch { /* ignore parse errors */ }
    return { ...INITIAL_DATA };
  });

  // Auto-save to localStorage on data change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore quota errors */ }
  }, [data]);

  const update = useCallback((field, value) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const addArrayItem = useCallback((field, value) => {
    if (!value) return;
    setData(prev => ({ ...prev, [field]: [...(prev[field] || []), value] }));
  }, []);

  const removeArrayItem = useCallback((field, index) => {
    setData(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== index) }));
  }, []);

  const goNext = () => setStep(s => Math.min(s + 1, STEPS.length));
  const goBack = () => setStep(s => Math.max(s - 1, 1));

  const submit = async () => {
    setSaving(true);
    try {
      const result = await api('/onboarding', { method: 'POST', body: data });
      // Clear saved draft on success
      localStorage.removeItem(STORAGE_KEY);
      alert(`Client created! ${result.summary.agents_assigned} agents assigned, ${result.summary.keywords_imported} keywords imported.`);
      if (onClientCreated) onClientCreated(result.clientId);
    } catch (e) {
      alert(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const clearDraft = () => {
    if (window.confirm('Clear all onboarding data and start fresh?')) {
      setData({ ...INITIAL_DATA });
      setStep(1);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <SH
        title="New Client Onboarding"
        sub="Step-by-step setup -- all data becomes AI runtime input"
        action={
          <Btn small secondary onClick={clearDraft} ariaLabel="Clear draft and start over">
            <X size={12} /> Clear Draft
          </Btn>
        }
      />

      <StepProgress current={step} steps={STEPS} />

      <Card>
        {/* ─── Step 1: Basic Identity ─────────────────────────── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.lg }}>
              Step 1: Basic Identity
            </div>

            <Field label="Client Name" htmlFor="ob-name" required>
              <input
                id="ob-name"
                value={data.name}
                onChange={e => update('name', e.target.value)}
                style={inputStyle}
                placeholder="e.g. Yaniv Gil Law Firm"
                autoFocus
              />
            </Field>

            <Field label="Website URL" htmlFor="ob-website" required>
              <input
                id="ob-website"
                value={data.websiteUrl}
                onChange={e => update('websiteUrl', e.target.value)}
                style={inputStyle}
                placeholder="https://example.co.il"
                type="url"
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
              <Field label="Business Type" htmlFor="ob-biz-type">
                <select
                  id="ob-biz-type"
                  value={data.businessType}
                  onChange={e => update('businessType', e.target.value)}
                  style={selectStyle}
                >
                  {['law firm', 'medical clinic', 'real estate', 'e-commerce', 'saas', 'restaurant', 'professional services', 'other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Industry" htmlFor="ob-industry">
                <input
                  id="ob-industry"
                  value={data.industry}
                  onChange={e => update('industry', e.target.value)}
                  style={inputStyle}
                  placeholder="legal services"
                />
              </Field>
            </div>

            <Field label="Sub-Industry" htmlFor="ob-sub-industry">
              <input
                id="ob-sub-industry"
                value={data.subIndustry}
                onChange={e => update('subIndustry', e.target.value)}
                style={inputStyle}
                placeholder="family law / divorce / inheritance"
              />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
              <Field label="Primary Language" htmlFor="ob-lang">
                <select
                  id="ob-lang"
                  value={data.language}
                  onChange={e => update('language', e.target.value)}
                  style={selectStyle}
                >
                  <option value="he">Hebrew</option>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </Field>
              <Field label="RTL Layout Required" htmlFor="ob-rtl">
                <select
                  id="ob-rtl"
                  value={data.rtlRequired ? 'yes' : 'no'}
                  onChange={e => update('rtlRequired', e.target.value === 'yes')}
                  style={selectStyle}
                >
                  <option value="yes">Yes -- Right-to-Left</option>
                  <option value="no">No -- Left-to-Right</option>
                </select>
              </Field>
            </div>

            <Field label="Brand Voice" htmlFor="ob-brand-voice">
              <textarea
                id="ob-brand-voice"
                value={data.brandVoice}
                onChange={e => update('brandVoice', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="premium, formal, authoritative, empathetic"
              />
            </Field>
          </div>
        )}

        {/* ─── Step 2: Targeting ──────────────────────────────── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.lg }}>
              Step 2: Targeting
            </div>

            <ArrayField
              id="ob-geographies"
              label="Target Geographies"
              placeholder="e.g. Tel Aviv, Gush Dan, Israel"
              items={data.geographies}
              onAdd={val => addArrayItem('geographies', val)}
              onRemove={i => removeArrayItem('geographies', i)}
            />
            <ArrayField
              id="ob-audiences"
              label="Target Audiences"
              placeholder="e.g. adults going through divorce in Tel Aviv"
              items={data.targetAudiences}
              onAdd={val => addArrayItem('targetAudiences', val)}
              onRemove={i => removeArrayItem('targetAudiences', i)}
            />
            <ArrayField
              id="ob-forbidden-audiences"
              label="Forbidden Audiences"
              placeholder="e.g. competing lawyers, students"
              items={data.forbiddenAudiences}
              onAdd={val => addArrayItem('forbiddenAudiences', val)}
              onRemove={i => removeArrayItem('forbiddenAudiences', i)}
              chipBg={colors.errorLight}
              chipColor={colors.errorDark}
            />
            <ArrayField
              id="ob-topics"
              label="Profitable Services/Topics"
              placeholder="e.g. high-net-worth divorce, inheritance disputes"
              items={data.profitableTopics}
              onAdd={val => addArrayItem('profitableTopics', val)}
              onRemove={i => removeArrayItem('profitableTopics', i)}
              chipBg={colors.successLight}
              chipColor={colors.successDark}
            />

            <Field label="Compliance Restrictions" htmlFor="ob-compliance">
              <textarea
                id="ob-compliance"
                value={data.complianceRestrictions}
                onChange={e => update('complianceRestrictions', e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Israeli Bar Association advertising rules, no guaranteed outcomes..."
              />
            </Field>
          </div>
        )}

        {/* ─── Step 3: Connectors & Data Sources ─────────────── */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.lg }}>
              Step 3: Connectors & Data Sources
            </div>
            <p style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.lg }}>
              Configure your data sources. These become available in the Connectors tab and are used by agents at runtime.
            </p>

            <Field label="Google Search Console Property URL" htmlFor="ob-gsc">
              <input
                id="ob-gsc"
                value={data.gscPropertyUrl}
                onChange={e => update('gscPropertyUrl', e.target.value)}
                style={inputStyle}
                placeholder="https://yanivgil.co.il/"
              />
            </Field>
            <Field label="Google Ads Customer ID" htmlFor="ob-ads">
              <input
                id="ob-ads"
                value={data.googleAdsCid}
                onChange={e => update('googleAdsCid', e.target.value)}
                style={inputStyle}
                placeholder="123-456-7890"
              />
            </Field>
            <Field label="Website URL (required)" htmlFor="ob-ws-url" required>
              <input
                id="ob-ws-url"
                value={data.websiteUrl}
                onChange={e => update('websiteUrl', e.target.value)}
                style={inputStyle}
                placeholder="https://yanivgil.co.il"
                type="url"
              />
            </Field>

            <ArrayField
              id="ob-recipients"
              label="Report Recipients (email)"
              placeholder="elad.d.keren@gmail.com"
              items={data.reportRecipients}
              onAdd={val => addArrayItem('reportRecipients', val)}
              onRemove={i => removeArrayItem('reportRecipients', i)}
              chipBg={colors.successLight}
              chipColor={colors.successDark}
            />

            <div
              role="note"
              style={{
                background: colors.warningLight,
                borderRadius: radius.md,
                padding: spacing.md,
                fontSize: fontSize.sm,
                color: colors.warningDark,
                marginTop: spacing.sm,
              }}
            >
              Google Sheets staging, GitHub, and Vercel connections are configured in the Connectors tab after client creation.
            </div>
          </div>
        )}

        {/* ─── Step 4: SEO Foundation ────────────────────────── */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.lg }}>
              Step 4: SEO Foundation
            </div>

            <ArrayField
              id="ob-keywords"
              label="Add Keywords (press Enter after each)"
              placeholder="\u05E2\u05D5\u05E8\u05DA \u05D3\u05D9\u05DF \u05D2\u05D9\u05E8\u05D5\u05E9\u05D9\u05DF \u05EA\u05DC \u05D0\u05D1\u05D9\u05D1"
              items={data.keywords}
              onAdd={val => addArrayItem('keywords', { keyword: val })}
              onRemove={i => setData(prev => ({ ...prev, keywords: prev.keywords.filter((_, j) => j !== i) }))}
            />

            <ArrayField
              id="ob-competitors"
              label="Add Competitors (domain)"
              placeholder="competitor-law.co.il"
              items={data.competitors}
              onAdd={val => addArrayItem('competitors', { domain: val })}
              onRemove={i => setData(prev => ({ ...prev, competitors: prev.competitors.filter((_, j) => j !== i) }))}
              chipBg={colors.accentLighter}
              chipColor={colors.accent}
            />
          </div>
        )}

        {/* ─── Step 5: Operational Policies ───────────────────── */}
        {step === 5 && (
          <div>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.lg }}>
              Step 5: Operational Policies
            </div>

            <ArrayField
              id="ob-allowed-accounts"
              label="Allowed Accounts (email)"
              placeholder="elad.d.keren@gmail.com"
              items={data.allowedAccounts}
              onAdd={val => addArrayItem('allowedAccounts', val)}
              onRemove={i => removeArrayItem('allowedAccounts', i)}
              chipBg={colors.successLight}
              chipColor={colors.successDark}
            />
            <ArrayField
              id="ob-forbidden-accounts"
              label="Forbidden Accounts (email)"
              placeholder="elad@netop.cloud"
              items={data.forbiddenAccounts}
              onAdd={val => addArrayItem('forbiddenAccounts', val)}
              onRemove={i => removeArrayItem('forbiddenAccounts', i)}
              chipBg={colors.errorLight}
              chipColor={colors.errorDark}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
              <Field label="Source of Truth" htmlFor="ob-source">
                <select
                  id="ob-source"
                  value={data.sourceOfTruth}
                  onChange={e => update('sourceOfTruth', e.target.value)}
                  style={selectStyle}
                >
                  <option value="Google Drive">Google Drive</option>
                  <option value="Notion">Notion</option>
                  <option value="Manual">Manual</option>
                </select>
              </Field>
              <Field label="Reviews Voice" htmlFor="ob-reviews-voice">
                <select
                  id="ob-reviews-voice"
                  value={data.reviewsVoice}
                  onChange={e => update('reviewsVoice', e.target.value)}
                  style={selectStyle}
                >
                  <option value="office">Office/Plural</option>
                  <option value="personal">Personal</option>
                </select>
              </Field>
            </div>

            <Field label="Pre-Run Document Name" htmlFor="ob-prerun">
              <input
                id="ob-prerun"
                value={data.preRunDocument}
                onChange={e => update('preRunDocument', e.target.value)}
                style={inputStyle}
                placeholder="CLAUDE.md"
              />
            </Field>
          </div>
        )}

        {/* ─── Step 6: Reports & Schedule ─────────────────────── */}
        {step === 6 && (
          <div>
            <div style={{ fontSize: fontSize.xl, fontWeight: fontWeight.bold, marginBottom: spacing.lg }}>
              Step 6: Reports & Schedule
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
              <Field label="Default Report Language" htmlFor="ob-report-lang">
                <select
                  id="ob-report-lang"
                  value={data.defaultReportLanguage}
                  onChange={e => update('defaultReportLanguage', e.target.value)}
                  style={selectStyle}
                >
                  <option value="he">Hebrew</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="Report Schedule" htmlFor="ob-schedule">
                <select
                  id="ob-schedule"
                  value={data.reportSchedule}
                  onChange={e => update('reportSchedule', e.target.value)}
                  style={selectStyle}
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="daily">Daily</option>
                </select>
              </Field>
            </div>

            <Field label="Default Report Types">
              <div role="group" aria-label="Report types">
                {['weekly_progress', 'monthly_progress', 'weekly_seo', 'weekly_paid_ads', 'weekly_growth'].map(type => (
                  <label
                    key={type}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: spacing.sm,
                      marginBottom: spacing.sm,
                      fontSize: fontSize.md,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={data.defaultReportTypes.includes(type)}
                      onChange={e => {
                        if (e.target.checked) {
                          setData(prev => ({ ...prev, defaultReportTypes: [...prev.defaultReportTypes, type] }));
                        } else {
                          setData(prev => ({ ...prev, defaultReportTypes: prev.defaultReportTypes.filter(t => t !== type) }));
                        }
                      }}
                    />
                    {type.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </Field>

            {/* Summary */}
            <div
              style={{
                background: colors.successLight,
                border: `1px solid ${colors.success}`,
                borderRadius: radius.lg,
                padding: spacing.lg,
                marginTop: spacing.lg,
              }}
            >
              <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.successDark, marginBottom: spacing.sm }}>
                Ready to create client
              </div>
              <div style={{ fontSize: fontSize.sm, color: colors.text }}>
                <div>Name: {data.name || '(not set)'}</div>
                <div>Language: {data.language} {data.rtlRequired ? '(RTL)' : ''}</div>
                <div>Keywords to import: {data.keywords.length}</div>
                <div>Competitors: {data.competitors.length}</div>
                <div>All 23 agents will be assigned automatically</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Navigation Buttons ─────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: spacing.xl,
            gap: spacing.sm,
          }}
        >
          <div>
            {step > 1 && (
              <Btn secondary onClick={goBack} ariaLabel="Go to previous step">
                Back
              </Btn>
            )}
          </div>

          <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
            {/* Skip button -- allows advancing without filling current step */}
            {step < STEPS.length && (
              <Btn
                secondary
                small
                onClick={goNext}
                ariaLabel={`Skip step ${step} and continue`}
                style={{ color: colors.textMuted }}
              >
                Skip
              </Btn>
            )}

            {step < STEPS.length ? (
              <Btn onClick={goNext} disabled={step === 1 && !data.name} ariaLabel="Go to next step">
                Next
              </Btn>
            ) : (
              <Btn
                onClick={submit}
                disabled={saving || !data.name}
                color={colors.success}
                ariaLabel="Create client"
              >
                {saving ? <Spin /> : <Check size={13} />}
                {saving ? 'Creating...' : 'Create Client'}
              </Btn>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
