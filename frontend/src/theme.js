// ─── AI Growth OS — Design Tokens ────────────────────────────────
// Centralized design system based on Analytics Dashboard palette
// from UI/UX Pro Max Skill

export const colors = {
  // Primary brand
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  primaryLighter: '#DBEAFE',
  primaryLightest: '#EFF6FF',
  onPrimary: '#FFFFFF',

  // Accent (attention/CTA)
  accent: '#D97706',
  accentLight: '#F59E0B',
  accentLighter: '#FEF3C7',
  onAccent: '#FFFFFF',

  // Neutrals
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceHover: '#F1F5F9',
  border: '#DBEAFE',
  borderLight: '#E2E8F0',
  borderDark: '#CBD5E1',

  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textDisabled: '#94A3B8',
  textInverse: '#FFFFFF',

  // Sidebar
  sidebarBg: '#0F172A',
  sidebarText: '#94A3B8',
  sidebarTextActive: '#FFFFFF',
  sidebarActive: '#1E40AF',
  sidebarHover: '#1E293B',
  sidebarBrand: '#3B82F6',

  // Semantic — status
  success: '#10B981',
  successLight: '#D1FAE5',
  successDark: '#065F46',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  errorDark: '#991B1B',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  warningDark: '#92400E',
  info: '#3B82F6',
  infoLight: '#DBEAFE',
  infoDark: '#1E40AF',

  // Run statuses
  status: {
    success: '#10B981',
    failed: '#EF4444',
    running: '#3B82F6',
    pending_approval: '#F59E0B',
    dry_run: '#8B5CF6',
    queued: '#64748B',
    executed: '#10B981',
    cancelled: '#94A3B8',
    blocked_dependency: '#F97316',
    open: '#EF4444',
    investigating: '#F59E0B',
    resolved: '#10B981',
    dismissed: '#94A3B8',
    pending: '#F59E0B',
    approved: '#10B981',
    rejected: '#EF4444',
  },

  // Agent roles
  roles: {
    owner: { bg: '#FEF3C7', color: '#92400E' },
    worker: { bg: '#DBEAFE', color: '#1E40AF' },
    validator: { bg: '#D1FAE5', color: '#065F46' },
  },

  // Lane colors
  lanes: {
    'System / Infrastructure': '#6366F1',
    'SEO Operations': '#10B981',
    'Paid Acquisition and Conversion': '#F59E0B',
    'Website Content, UX, and Design': '#3B82F6',
    'Local Authority, Reviews, and GBP': '#8B5CF6',
    'Innovation and Competitive Edge': '#EC4899',
    'Social Publishing and Engagement': '#06B6D4',
    'Reporting': '#84CC16',
  },

  // Severity
  severity: {
    critical: { color: '#EF4444', bg: '#FEE2E2' },
    high: { color: '#F59E0B', bg: '#FEF3C7' },
    medium: { color: '#3B82F6', bg: '#DBEAFE' },
    low: { color: '#94A3B8', bg: '#F1F5F9' },
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
  '5xl': 40,
};

export const radius = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  '2xl': 12,
  full: 9999,
};

export const fontSize = {
  micro: 10,
  xs: 11,
  sm: 12,
  md: 13,
  lg: 14,
  xl: 15,
  '2xl': 18,
  '3xl': 20,
  '4xl': 24,
  '5xl': 28,
  hero: 48,
};

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
};

export const shadows = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)',
  lg: '0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.05)',
};

export const transitions = {
  fast: 'all 0.15s ease',
  normal: 'all 0.25s ease',
  slow: 'all 0.35s ease',
};

export const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
};

// Sidebar nav groups
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'verification', label: 'Verification' },
      { id: 'credentials', label: 'Credentials' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'agents', label: 'Agents' },
      { id: 'runs', label: 'Runs' },
      { id: 'queue', label: 'Queue' },
      { id: 'approvals', label: 'Approvals' },
      { id: 'schedules', label: 'Schedules' },
    ],
  },
  {
    label: 'SEO Intelligence',
    items: [
      { id: 'seo', label: 'SEO & Links' },
      { id: 'link-intelligence', label: 'Link Intelligence' },
      { id: 'seo-actions', label: 'SEO Actions' },
    ],
  },
  {
    label: 'Content',
    items: [
      { id: 'reports', label: 'Reports' },
      { id: 'memory', label: 'Memory' },
      { id: 'prompt-overrides', label: 'Prompt Overrides' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'connectors', label: 'Connectors' },
      { id: 'website-access', label: 'Website Access' },
      { id: 'setup-links', label: 'Setup Links' },
      { id: 'incidents', label: 'Incidents' },
      { id: 'audit', label: 'Audit Trail' },
    ],
  },
  {
    label: 'Onboarding',
    items: [
      { id: 'onboarding', label: 'New Client' },
    ],
  },
];
