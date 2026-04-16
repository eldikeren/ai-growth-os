// ─── AI Growth OS — Design Tokens v2 ─────────────────────────────
// Modern dark-accented design with glassmorphism & gradients

export const colors = {
  // Primary brand — vibrant indigo-violet gradient feel
  primary: '#6366F1',
  primaryLight: '#818CF8',
  primaryLighter: '#E0E7FF',
  primaryLightest: '#EEF2FF',
  onPrimary: '#FFFFFF',
  primaryGradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',

  // Accent (attention/CTA)
  accent: '#F59E0B',
  accentLight: '#FBBF24',
  accentLighter: '#FEF3C7',
  onAccent: '#FFFFFF',
  accentGradient: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',

  // Neutrals — softer, more modern
  background: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceHover: '#F8FAFC',
  surfaceElevated: '#FFFFFF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  borderDark: '#D1D5DB',

  // Text — higher contrast
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#6B7280',
  textDisabled: '#9CA3AF',
  textInverse: '#FFFFFF',

  // Sidebar — sleek dark with subtle gradient
  sidebarBg: '#0F0F1A',
  sidebarBgGradient: 'linear-gradient(180deg, #0F0F1A 0%, #1A1A2E 100%)',
  sidebarText: '#9CA3AF',
  sidebarTextActive: '#FFFFFF',
  sidebarActive: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
  sidebarActiveBg: 'rgba(99, 102, 241, 0.15)',
  sidebarHover: 'rgba(255,255,255,0.05)',
  sidebarBrand: '#818CF8',
  sidebarDivider: 'rgba(255,255,255,0.06)',

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
  info: '#6366F1',
  infoLight: '#E0E7FF',
  infoDark: '#4338CA',

  // Run statuses
  status: {
    success: '#10B981', failed: '#EF4444', running: '#6366F1',
    pending_approval: '#F59E0B', dry_run: '#8B5CF6', queued: '#6B7280',
    partial: '#F97316', executed: '#10B981', cancelled: '#9CA3AF', blocked_dependency: '#F97316',
    open: '#EF4444', investigating: '#F59E0B', resolved: '#10B981',
    dismissed: '#9CA3AF', pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444',
  },

  // Agent roles
  roles: {
    owner: { bg: '#FEF3C7', color: '#92400E' },
    worker: { bg: '#E0E7FF', color: '#4338CA' },
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
    medium: { color: '#6366F1', bg: '#E0E7FF' },
    low: { color: '#9CA3AF', bg: '#F3F4F6' },
  },

  // Glass effect
  glass: 'rgba(255,255,255,0.7)',
  glassBorder: 'rgba(255,255,255,0.2)',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24,
  '2xl': 32, '3xl': 40, '4xl': 48, '5xl': 56,
};

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 18, '2xl': 22, full: 9999,
};

export const fontSize = {
  micro: 10, xs: 11, sm: 12, md: 13, lg: 15, xl: 17,
  '2xl': 20, '3xl': 24, '4xl': 30, '5xl': 36, hero: 48,
};

export const fontWeight = {
  normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800,
};

export const shadows = {
  sm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  md: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
  lg: '0 12px 32px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.06)',
  xl: '0 20px 48px rgba(0,0,0,0.12)',
  glow: '0 0 20px rgba(99,102,241,0.3)',
  cardHover: '0 8px 24px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.06)',
};

export const transitions = {
  fast: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
  normal: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
  slow: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  spring: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
};

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 };

// Sidebar nav groups
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', emoji: '📊' },
      { id: 'mission-control', label: 'Mission Control', emoji: '🎮' },
      { id: 'system-audit', label: 'System Audit', emoji: '🔬' },
      { id: 'verification', label: 'Verification', emoji: '✅' },
      { id: 'credentials', label: 'Credentials', emoji: '🔑' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { id: 'agents', label: 'Agents', emoji: '🤖' },
      { id: 'runs', label: 'Runs', emoji: '▶️' },
      { id: 'queue', label: 'Queue', emoji: '📋' },
      { id: 'approvals', label: 'Approvals', emoji: '👍' },
      { id: 'proposed-changes', label: 'Proposed Changes', emoji: '🔧' },
      { id: 'schedules', label: 'Schedules', emoji: '⏰' },
    ],
  },
  {
    label: 'SEO Intelligence',
    items: [
      { id: 'seo', label: 'SEO & Links', emoji: '🔗' },
      { id: 'link-intelligence', label: 'Link Intelligence', emoji: '🧠' },
      { id: 'seo-actions', label: 'SEO Actions', emoji: '🎯' },
    ],
  },
  {
    label: 'Campaigns & Social',
    items: [
      { id: 'campaigns', label: 'Campaigns', emoji: '📣' },
      { id: 'social', label: 'Social Posts', emoji: '💬' },
    ],
  },
  {
    label: 'Tasks & Ideas',
    items: [
      { id: 'tasks', label: 'Tasks & Ideas', emoji: '📝' },
    ],
  },
  {
    label: 'Content',
    items: [
      { id: 'reports', label: 'Reports', emoji: '📈' },
      { id: 'memory', label: 'Memory', emoji: '💾' },
      { id: 'prompt-overrides', label: 'Prompt Overrides', emoji: '✏️' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { id: 'website-access', label: 'Website Access', emoji: '🌐' },
      { id: 'setup-links', label: 'Setup Links', emoji: '⚡' },
      { id: 'incidents', label: 'Incidents', emoji: '🚨' },
      { id: 'audit', label: 'Audit Trail', emoji: '📜' },
    ],
  },
  {
    label: 'Onboarding',
    items: [
      { id: 'onboarding', label: 'New Client', emoji: '🚀' },
    ],
  },
];
