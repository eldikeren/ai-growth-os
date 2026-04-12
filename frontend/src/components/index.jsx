// ─── AI Growth OS — Shared Components v2 ────────────────────────
// Modern glassmorphism, gradients, animations, hover effects
import { useState, useEffect, useRef } from 'react';
import { Loader, Eye, Check, X, ChevronUp, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';

// ─── Badge ───────────────────────────────────────────────────────
export function Badge({ text, color, bg }) {
  return (
    <span role="status"
      style={{
        background: bg || colors.primaryLightest,
        color: color || colors.primary,
        padding: '3px 10px',
        borderRadius: radius.full,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        whiteSpace: 'nowrap',
        display: 'inline-flex',
        alignItems: 'center',
        letterSpacing: 0.3,
        textTransform: 'capitalize',
      }}>
      {text}
    </span>
  );
}

// ─── Dot (status indicator) ──────────────────────────────────────
export function Dot({ s }) {
  return (
    <span aria-label={`Status: ${s}`}
      style={{
        display: 'inline-block', width: 8, height: 8,
        borderRadius: '50%', background: colors.status[s] || colors.textDisabled, flexShrink: 0,
        boxShadow: `0 0 6px ${colors.status[s] || 'transparent'}`,
      }} />
  );
}

// ─── Card ────────────────────────────────────────────────────────
export function Card({ children, style, onClick, hover = true }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={() => hover && setHovered(true)}
      onMouseLeave={() => hover && setHovered(false)}
      style={{
        background: colors.surface,
        border: `1px solid ${hovered ? colors.primaryLighter : colors.border}`,
        borderRadius: radius.xl,
        padding: spacing.xl,
        boxShadow: hovered ? shadows.cardHover : shadows.sm,
        transition: transitions.normal,
        transform: hovered && onClick ? 'translateY(-2px)' : 'none',
        ...style,
      }}>
      {children}
    </div>
  );
}

// ─── Glass Card (for special sections) ──────────────────────────
export function GlassCard({ children, style }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.6)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.3)',
      borderRadius: radius.xl,
      padding: spacing.xl,
      boxShadow: shadows.md,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────────
export function Btn({ children, onClick, color = colors.primary, disabled, small, danger, secondary, ghost, style, type = 'button', ariaLabel }) {
  const [hovered, setHovered] = useState(false);
  const bg = danger ? colors.error : secondary ? colors.surface : ghost ? 'transparent' : color;
  const hoverBg = danger ? '#DC2626' : secondary ? colors.surfaceHover : ghost ? 'rgba(99,102,241,0.08)' : colors.primaryLight;
  return (
    <button type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: disabled ? colors.borderLight : hovered ? hoverBg : bg,
        color: disabled ? colors.textDisabled : secondary ? colors.textSecondary : ghost ? colors.primary : colors.textInverse,
        border: secondary ? `1px solid ${colors.borderDark}` : ghost ? `1px solid transparent` : 'none',
        borderRadius: radius.md,
        padding: small ? '5px 12px' : '8px 18px',
        fontSize: small ? fontSize.sm : fontSize.md,
        fontWeight: fontWeight.semibold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: transitions.fast,
        boxShadow: secondary || ghost ? 'none' : disabled ? 'none' : hovered ? shadows.md : shadows.sm,
        transform: hovered && !disabled && !secondary ? 'translateY(-1px)' : 'none',
        ...style,
      }}>
      {children}
    </button>
  );
}

// ─── Gradient Button (for primary CTAs) ─────────────────────────
export function GradientBtn({ children, onClick, disabled, style, ariaLabel }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={ariaLabel}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        background: disabled ? colors.borderLight : colors.primaryGradient,
        color: disabled ? colors.textDisabled : '#FFFFFF',
        border: 'none', borderRadius: radius.md,
        padding: '10px 24px', fontSize: fontSize.md, fontWeight: fontWeight.bold,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        transition: transitions.fast,
        boxShadow: hovered ? shadows.glow : shadows.md,
        transform: hovered && !disabled ? 'translateY(-2px)' : 'none',
        letterSpacing: 0.3,
        ...style,
      }}>
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
      <defs>
        <linearGradient id={`spark-${color.replace('#','')}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={`url(#spark-${color.replace('#','')})`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// ─── Trend Delta ─────────────────────────────────────────────────
export function TrendDelta({ value, suffix = '%' }) {
  if (value == null || isNaN(value)) return null;
  const isUp = value > 0;
  const Icon = isUp ? ArrowUp : ArrowDown;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      fontSize: fontSize.xs, fontWeight: fontWeight.bold,
      color: isUp ? colors.success : colors.error,
      background: isUp ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
      padding: '2px 6px', borderRadius: radius.sm,
    }}>
      <Icon size={10} />
      {Math.abs(value)}{suffix}
    </span>
  );
}

// ─── KPI Card (with sparkline + trend) ───────────────────────────
export function KpiCard({ label, value, target, color = colors.primary, sub, trend, sparkData, icon: Icon }) {
  const displayVal = useCountUp(typeof value === 'number' ? value : value);
  return (
    <Card style={{ textAlign: 'center', padding: '24px 16px', position: 'relative', overflow: 'hidden' }}>
      {/* Subtle gradient accent at top */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${color}, ${color}88)`,
        borderRadius: `${radius.xl}px ${radius.xl}px 0 0`,
      }} />
      {Icon && (
        <div style={{
          width: 36, height: 36, borderRadius: radius.lg,
          background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 8px',
        }}>
          <Icon size={18} style={{ color }} />
        </div>
      )}
      <div style={{ fontSize: fontSize['4xl'], fontWeight: fontWeight.extrabold, color, lineHeight: 1.1 }}>
        {displayVal ?? '\u2014'}
      </div>
      {trend != null && <div style={{ marginTop: 4 }}><TrendDelta value={trend} /></div>}
      {sparkData && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
          <Sparkline data={sparkData} color={color} width={70} height={22} />
        </div>
      )}
      {target && <div style={{ fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 4 }}>Target: {target}</div>}
      <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.sm, fontWeight: fontWeight.medium }}>{label}</div>
      {sub && <div style={{ fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 2 }}>{sub}</div>}
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
    <div aria-hidden="true"
      style={{
        width, height, borderRadius,
        background: `linear-gradient(90deg, ${colors.borderLight} 25%, ${colors.border} 50%, ${colors.borderLight} 75%)`,
        backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite ease-in-out',
        ...style,
      }} />
  );
}

export function SkeletonCard({ rows = 3 }) {
  return (
    <Card hover={false}>
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
    <Card hover={false} style={{ textAlign: 'center', padding: '24px 16px' }}>
      <Skeleton width={40} height={40} borderRadius={radius.lg} style={{ margin: '0 auto 8px' }} />
      <Skeleton width={60} height={32} style={{ margin: '0 auto 6px' }} />
      <Skeleton width={80} height={10} style={{ margin: '0 auto 4px' }} />
      <Skeleton width={100} height={10} style={{ margin: '0 auto' }} />
    </Card>
  );
}

// ─── Empty State ─────────────────────────────────────────────────
export function Empty({ icon: I, msg, action, actionLabel }) {
  return (
    <div style={{ textAlign: 'center', padding: '56px 24px', color: colors.textDisabled }}>
      <div style={{
        width: 72, height: 72, borderRadius: radius['2xl'],
        background: `linear-gradient(135deg, ${colors.primaryLightest}, ${colors.primaryLighter})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
        boxShadow: '0 8px 24px rgba(99,102,241,0.12)',
      }}>
        <I size={32} style={{ color: colors.primary }} />
      </div>
      <div style={{ fontSize: fontSize.lg, color: colors.textSecondary, fontWeight: fontWeight.medium, marginBottom: action ? 16 : 0 }}>{msg}</div>
      {action && <GradientBtn onClick={action}>{actionLabel || 'Get Started'}</GradientBtn>}
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
        <pre style={{
          background: '#0F0F1A', color: '#A5B4FC', padding: spacing.lg,
          borderRadius: radius.lg, fontSize: fontSize.xs, overflow: 'auto',
          maxHeight: 400, marginTop: spacing.sm, direction: 'ltr', textAlign: 'left',
          border: '1px solid rgba(99,102,241,0.2)',
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ─── Section Header ──────────────────────────────────────────────
export function SH({ title, sub, action, breadcrumbs }) {
  return (
    <div style={{ marginBottom: spacing['2xl'] }}>
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
          <h2 style={{ fontSize: fontSize['3xl'], fontWeight: fontWeight.extrabold, color: colors.text, margin: 0, letterSpacing: -0.5 }}>{title}</h2>
          {sub && <p style={{ fontSize: fontSize.md, color: colors.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>{sub}</p>}
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
  const [hoveredRow, setHoveredRow] = useState(null);
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
    if (aVal == null) return 1; if (bVal == null) return -1;
    const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : aVal - bVal;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const toggleAll = () => { if (allSelected) setSelected(new Set()); else setSelected(new Set(data.map((_, i) => i))); };
  const toggleRow = (idx) => { const next = new Set(selected); if (next.has(idx)) next.delete(idx); else next.add(idx); setSelected(next); };

  return (
    <div style={{ borderRadius: radius.xl, overflow: 'hidden', border: `1px solid ${colors.border}`, background: colors.surface }}>
      {bulkActions.length > 0 && selected.size > 0 && (
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center', padding: '10px 16px', background: colors.primaryLightest, borderBottom: `1px solid ${colors.primaryLighter}` }}>
          <span style={{ fontSize: fontSize.sm, fontWeight: fontWeight.bold, color: colors.primary }}>{selected.size} selected</span>
          {bulkActions.map(ba => (
            <Btn key={ba.label} small secondary onClick={() => { ba.action([...selected].map(i => sorted[i])); setSelected(new Set()); }}>
              {ba.label}
            </Btn>
          ))}
        </div>
      )}
      <div style={{ overflowX: 'auto' }} role="region" aria-label="Data table" tabIndex={0}>
        <table dir="rtl" style={{ width: '100%', borderCollapse: 'collapse', fontSize: fontSize.sm }}>
          <thead>
            <tr>
              {bulkActions.length > 0 && (
                <th style={{ padding: '12px 14px', width: 36, background: colors.surfaceHover, borderBottom: `2px solid ${colors.border}` }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all rows" />
                </th>
              )}
              {columns.map(col => (
                <th key={col.key} onClick={col.sortable !== false ? () => handleSort(col.key) : undefined}
                  style={{
                    padding: '12px 14px', textAlign: 'start', fontWeight: fontWeight.bold,
                    color: colors.textSecondary, borderBottom: `2px solid ${colors.border}`,
                    background: colors.surfaceHover, cursor: col.sortable !== false ? 'pointer' : 'default',
                    userSelect: 'none', whiteSpace: 'nowrap', fontSize: fontSize.xs,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
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
              <tr key={row.id || i}
                onMouseEnter={() => setHoveredRow(i)} onMouseLeave={() => setHoveredRow(null)}
                style={{
                  borderBottom: `1px solid ${colors.borderLight}`,
                  background: selected.has(i) ? colors.primaryLightest : hoveredRow === i ? colors.surfaceHover : 'transparent',
                  transition: transitions.fast,
                }}>
                {bulkActions.length > 0 && (
                  <td style={{ padding: '10px 14px' }}>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => toggleRow(i)} aria-label={`Select row ${i + 1}`} />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '10px 14px', ...col.style }}>
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
    <div role="tablist" style={{
      display: 'flex', gap: 4, marginBottom: spacing['2xl'], flexWrap: 'wrap',
      background: colors.surfaceHover, padding: 4, borderRadius: radius.lg,
      border: `1px solid ${colors.borderLight}`,
    }}>
      {tabs.map(t => {
        const id = typeof t === 'string' ? t : t.id;
        const label = typeof t === 'string' ? t.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : t.label;
        return (
          <button key={id} role="tab" aria-selected={active === id} onClick={() => onChange(id)}
            style={{
              padding: '7px 16px', borderRadius: radius.md - 2, fontSize: fontSize.sm, fontWeight: fontWeight.semibold,
              cursor: 'pointer', transition: transitions.fast,
              background: active === id ? colors.surface : 'transparent',
              color: active === id ? colors.primary : colors.textMuted,
              border: 'none',
              boxShadow: active === id ? shadows.sm : 'none',
            }}>
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
    <div style={{ marginBottom: spacing.lg }}>
      <label htmlFor={htmlFor}
        style={{
          fontSize: fontSize.xs, color: colors.textSecondary, display: 'block',
          marginBottom: spacing.xs, fontWeight: fontWeight.bold, textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}>
        {label}{required && <span style={{ color: colors.error }}> *</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: fontSize.micro, color: colors.textDisabled, marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export const inputStyle = {
  width: '100%',
  border: `1.5px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: '9px 12px',
  fontSize: fontSize.md,
  fontFamily: 'inherit',
  color: colors.text,
  background: colors.surface,
  transition: transitions.fast,
  outline: 'none',
};

export const selectStyle = { ...inputStyle, cursor: 'pointer' };
