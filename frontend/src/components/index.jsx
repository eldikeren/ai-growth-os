// ─── AI Growth OS — Shared Components ──────────────────────────
// All micro-components with design token integration,
// accessibility, skeletons, sparklines, sorting, animations
import { useState, useEffect, useRef } from 'react';
import { Loader, Eye, Check, X, ChevronUp, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';

// ─── Badge ───────────────────────────────────────────────────────
export function Badge({ text, color, bg }) {
  return (
    <span
      role="status"
      style={{
        background: bg || colors.primaryLightest,
        color: color || colors.textSecondary,
        padding: '2px 8px',
        borderRadius: radius.sm,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
      }}
    >
      {text}
    </span>
  );
}

// ─── Dot (status indicator) ──────────────────────────────────────
export function Dot({ s }) {
  return (
    <span
      aria-label={`Status: ${s}`}
      style={{
        display: 'inline-block',
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: colors.status[s] || colors.textDisabled,
        flexShrink: 0,
      }}
    />
  );
}

// ─── Card ────────────────────────────────────────────────────────
export function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.xl,
        padding: spacing.xl,
        boxShadow: shadows.sm,
        transition: transitions.fast,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────────
export function Btn({ children, onClick, color = colors.primary, disabled, small, danger, secondary, style, type = 'button', ariaLabel }) {
  const bg = danger ? colors.error : secondary ? colors.surface : color;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        background: disabled ? colors.borderLight : bg,
        color: disabled ? colors.textDisabled : secondary ? colors.textSecondary : colors.textInverse,
        border: secondary ? `1px solid ${colors.borderDark}` : 'none',
        borderRadius: radius.md,
        padding: small ? '4px 10px' : '7px 14px',
        fontSize: small ? fontSize.sm : fontSize.md,
        fontWeight: fontWeight.semibold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        transition: transitions.fast,
        boxShadow: secondary ? 'none' : shadows.sm,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Animated Counter (count-up on load) ─────────────────────────
function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0);
  const num = typeof target === 'number' ? target : parseFloat(target);
  useEffect(() => {
    if (isNaN(num) || num === 0) { setVal(target); return; }
    let start = 0;
    const step = num / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= num) { setVal(num); clearInterval(timer); }
      else setVal(Math.round(start));
    }, 16);
    return () => clearInterval(timer);
  }, [num, duration]);
  return typeof target === 'number' ? val : target;
}

// ─── Mini Sparkline ──────────────────────────────────────────────
export function Sparkline({ data = [], color = colors.primary, width = 60, height = 20 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block', marginTop: 4 }}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// ─── Trend Delta ─────────────────────────────────────────────────
export function TrendDelta({ value, suffix = '%' }) {
  if (value == null || isNaN(value)) return null;
  const isUp = value > 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        color: isUp ? colors.success : colors.error,
      }}
    >
      <Icon size={10} />
      {Math.abs(value)}{suffix}
    </span>
  );
}

// ─── KPI Card (with sparkline + trend) ───────────────────────────
export function KpiCard({ label, value, target, color = colors.primary, sub, trend, sparkData }) {
  const displayVal = useCountUp(typeof value === 'number' ? value : value);
  return (
    <Card style={{ textAlign: 'center', padding: '18px 12px' }}>
      <div style={{ fontSize: fontSize['5xl'], fontWeight: fontWeight.extrabold, color, lineHeight: 1.1 }}>
        {displayVal ?? '\u2014'}
      </div>
      {trend != null && <TrendDelta value={trend} />}
      {sparkData && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
          <Sparkline data={sparkData} color={color} width={70} height={22} />
        </div>
      )}
      {target && <div style={{ fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 2 }}>Target: {target}</div>}
      <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs }}>{label}</div>
      {sub && <div style={{ fontSize: fontSize.xs, color: colors.textDisabled }}>{sub}</div>}
    </Card>
  );
}

// ─── Spinner ─────────────────────────────────────────────────────
export function Spin() {
  return <Loader size={16} aria-label="Loading" style={{ animation: 'spin 1s linear infinite' }} />;
}

// ─── Skeleton Loader ─────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 16, borderRadius = radius.md, style }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        background: `linear-gradient(90deg, ${colors.borderLight} 25%, ${colors.border} 50%, ${colors.borderLight} 75%)`,
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite ease-in-out',
        ...style,
      }}
    />
  );
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <Card>
      <Skeleton width={140} height={14} style={{ marginBottom: 14 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
          <Skeleton width={8} height={8} borderRadius="50%" />
          <div style={{ flex: 1 }}>
            <Skeleton width="60%" height={12} style={{ marginBottom: 4 }} />
            <Skeleton width="40%" height={10} />
          </div>
          <Skeleton width={60} height={20} borderRadius={radius.sm} />
        </div>
      ))}
    </Card>
  );
}

export function SkeletonKpi() {
  return (
    <Card style={{ textAlign: 'center', padding: '18px 12px' }}>
      <Skeleton width={60} height={28} style={{ margin: '0 auto 6px' }} />
      <Skeleton width={80} height={10} style={{ margin: '0 auto 4px' }} />
      <Skeleton width={100} height={10} style={{ margin: '0 auto' }} />
    </Card>
  );
}

// ─── Empty State ─────────────────────────────────────────────────
export function Empty({ icon: I, msg, action, actionLabel }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: colors.textDisabled }}>
      <div style={{
        width: 56, height: 56, borderRadius: radius['2xl'], background: colors.primaryLightest,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
      }}>
        <I size={28} style={{ color: colors.primaryLight }} />
      </div>
      <div style={{ fontSize: fontSize.lg, color: colors.textSecondary, marginBottom: action ? 12 : 0 }}>{msg}</div>
      {action && <Btn onClick={action} small>{actionLabel || 'Get Started'}</Btn>}
    </div>
  );
}

// ─── JSON Viewer ─────────────────────────────────────────────────
export function Json({ data }) {
  const [o, sO] = useState(false);
  return (
    <div>
      <Btn secondary small onClick={() => sO(!o)} style={{ marginTop: spacing.sm }}>
        <Eye size={12} />{o ? 'Hide' : 'View'} Output
      </Btn>
      {o && (
        <pre
          style={{
            background: colors.sidebarBg,
            color: '#E2E8F0',
            padding: spacing.lg,
            borderRadius: radius.lg,
            fontSize: fontSize.xs,
            overflow: 'auto',
            maxHeight: 400,
            marginTop: spacing.sm,
            direction: 'ltr',
            textAlign: 'left',
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────
export function SH({ title, sub, action, breadcrumbs }) {
  return (
    <div style={{ marginBottom: spacing.xl }}>
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: spacing.sm, fontSize: fontSize.xs, color: colors.textMuted }}>
          {breadcrumbs.map((b, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {i > 0 && <span style={{ color: colors.textDisabled }}>/</span>}
              {b.onClick ? (
                <button onClick={b.onClick} style={{ background: 'none', border: 'none', color: colors.primary, cursor: 'pointer', fontSize: fontSize.xs, fontWeight: fontWeight.medium, padding: 0 }}>
                  {b.label}
                </button>
              ) : (
                <span style={{ color: colors.textSecondary, fontWeight: fontWeight.semibold }}>{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.bold, color: colors.text, margin: 0 }}>{title}</h2>
          {sub && <p style={{ fontSize: fontSize.md, color: colors.textMuted, margin: '4px 0 0' }}>{sub}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

// ─── Sortable Table ──────────────────────────────────────────────
export function SortableTable({ columns, data, onBulkAction, bulkActions = [], emptyIcon, emptyMsg }) {
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [selected, setSelected] = useState(new Set());
  const allSelected = data.length > 0 && selected.size === data.length;

  const handleSort = (colKey) => {
    if (sortCol === colKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(colKey); setSortDir('asc'); }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortCol) return 0;
    const col = columns.find(c => c.key === sortCol);
    const aVal = col?.sortValue ? col.sortValue(a) : a[sortCol];
    const bVal = col?.sortValue ? col.sortValue(b) : b[sortCol];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(data.map((_, i) => i)));
  };

  const toggleRow = (idx) => {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelected(next);
  };

  return (
    <div>
      {bulkActions.length > 0 && selected.size > 0 && (
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', padding: '8px 12px', background: colors.primaryLightest, borderRadius: `${radius.lg}px ${radius.lg}px 0 0`, borderBottom: `1px solid ${colors.border}` }}>
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.semibold, color: colors.primary }}>{selected.size} selected</span>
          {bulkActions.map(ba => (
            <Btn key={ba.label} small secondary onClick={() => { ba.action([...selected].map(i => sorted[i])); setSelected(new Set()); }}>
              {ba.label}
            </Btn>
          ))}
        </div>
      )}
      <div style={{ overflowX: 'auto' }} role="region" aria-label="Data table" tabIndex={0}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.sm }}>
          <thead>
            <tr>
              {bulkActions.length > 0 && (
                <th style={{ padding: '8px 10px', width: 36, background: colors.surfaceHover, borderBottom: `1px solid ${colors.border}` }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all rows" />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                  style={{
                    padding: '8px 10px',
                    textAlign: 'left',
                    fontWeight: fontWeight.semibold,
                    color: colors.textSecondary,
                    borderBottom: `1px solid ${colors.border}`,
                    background: colors.surfaceHover,
                    cursor: col.sortable !== false ? 'pointer' : 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {col.label}
                    {sortCol === col.key && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.id || i} style={{ borderBottom: `1px solid ${colors.borderLight}`, background: selected.has(i) ? colors.primaryLightest : 'transparent' }}>
                {bulkActions.length > 0 && (
                  <td style={{ padding: '8px 10px' }}>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} aria-label={`Select row ${i + 1}`} />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '8px 10px', ...col.style }}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.length === 0 && emptyIcon && <Empty icon={emptyIcon} msg={emptyMsg || 'No data'} />}
    </div>
  );
}

// ─── Tab Navigation ──────────────────────────────────────────────
export function Tabs({ tabs, active, onChange }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 6, marginBottom: spacing.xl, flexWrap: 'wrap' }}>
      {tabs.map(t => {
        const id = typeof t === 'string' ? t : t.id;
        const label = typeof t === 'string' ? t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : t.label;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active === id}
            onClick={() => onChange(id)}
            style={{
              padding: '6px 14px',
              borderRadius: radius.md,
              fontSize: fontSize.sm,
              fontWeight: fontWeight.semibold,
              cursor: 'pointer',
              background: active === id ? colors.primary : colors.surfaceHover,
              color: active === id ? colors.textInverse : colors.textSecondary,
              border: active === id ? 'none' : `1px solid ${colors.border}`,
              transition: transitions.fast,
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Form Field (accessible) ─────────────────────────────────────
export function Field({ label, children, htmlFor, required, hint }) {
  return (
    <div style={{ marginBottom: spacing.md }}>
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: fontSize.xs,
          color: colors.textMuted,
          display: 'block',
          marginBottom: spacing.xs,
          fontWeight: fontWeight.semibold,
        }}
      >
        {label}{required && <span style={{ color: colors.error }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

export const inputStyle = {
  width: '100%',
  border: `1px solid ${colors.borderDark}`,
  borderRadius: radius.md,
  padding: '7px 10px',
  fontSize: fontSize.md,
  fontFamily: 'inherit',
  color: colors.text,
  background: colors.surface,
  transition: transitions.fast,
  outline: 'none',
};

export const selectStyle = { ...inputStyle, cursor: 'pointer' };
