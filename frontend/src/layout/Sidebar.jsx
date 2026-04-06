// ─── Grouped Collapsible Sidebar ─────────────────────────────────
import { useState } from 'react';
import { LayoutDashboard, Bot, Play, ListOrdered, CheckSquare, Brain, Link, BarChart3, Shield, Clock, Key, AlertTriangle, BookOpen, Zap, Globe, Users, FileText, Activity, ChevronDown, ChevronRight, Trash2, Menu, X } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, NAV_GROUPS, transitions } from '../theme.js';

const ICONS = { dashboard: LayoutDashboard, agents: Bot, runs: Play, queue: ListOrdered, approvals: CheckSquare, memory: Brain, seo: Link, reports: BarChart3, verification: Shield, credentials: Key, incidents: AlertTriangle, audit: BookOpen, schedules: Clock, 'setup-links': Zap, 'website-access': Globe, onboarding: Users, connectors: Globe, 'prompt-overrides': FileText, 'link-intelligence': Link, 'seo-actions': Activity };

export default function Sidebar({ view, setView, clients, clientId, setClientId, onDeleteClient, collapsed, setCollapsed }) {
  const [openGroups, setOpenGroups] = useState(() => {
    // Open the group containing the current view by default
    const open = {};
    NAV_GROUPS.forEach(g => { open[g.label] = true; });
    return open;
  });

  const toggleGroup = (label) => setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          className="sidebar-overlay"
          style={{
            display: 'none',
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40,
          }}
        />
      )}

      <aside
        role="navigation"
        aria-label="Main navigation"
        className="sidebar"
        style={{
          width: collapsed ? 0 : 240,
          minWidth: collapsed ? 0 : 240,
          background: colors.sidebarBg,
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
          transition: transitions.normal,
          zIndex: 50,
        }}
      >
        {/* Brand */}
        <div style={{ padding: '20px 16px 12px' }}>
          <div style={{ fontSize: fontSize.md, fontWeight: fontWeight.extrabold, color: colors.sidebarBrand, letterSpacing: 1 }}>
            AI GROWTH OS
          </div>
          <div style={{ fontSize: fontSize.micro, color: colors.textMuted, marginTop: 2 }}>by Elad Digital</div>
        </div>

        {/* Client selector */}
        <div style={{ padding: '8px 12px 4px' }}>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <label htmlFor="client-select" className="sr-only">Select client</label>
            <select
              id="client-select"
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              aria-label="Select client"
              style={{
                flex: 1,
                background: '#1E293B',
                border: `1px solid ${colors.sidebarHover}`,
                borderRadius: radius.md,
                padding: '6px 8px',
                fontSize: fontSize.xs,
                color: '#E2E8F0',
                cursor: 'pointer',
              }}
            >
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {clientId && (
              <button
                onClick={onDeleteClient}
                title="Delete client"
                aria-label="Delete selected client"
                style={{
                  background: '#7F1D1D',
                  border: 'none',
                  borderRadius: radius.md,
                  padding: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={12} color="#FCA5A5" />
              </button>
            )}
          </div>
        </div>

        {/* Grouped navigation */}
        <nav style={{ flex: 1, overflow: 'auto', padding: spacing.sm }} aria-label="Application sections">
          {NAV_GROUPS.map(group => {
            const isOpen = openGroups[group.label];
            return (
              <div key={group.label} style={{ marginBottom: 4 }}>
                <button
                  onClick={() => toggleGroup(group.label)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    color: colors.textMuted,
                    fontSize: fontSize.micro,
                    fontWeight: fontWeight.bold,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                  }}
                >
                  {group.label}
                  {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>
                {isOpen && group.items.map(({ id, label }) => {
                  const I = ICONS[id] || LayoutDashboard;
                  const active = view === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setView(id)}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '7px 10px 7px 18px',
                        borderRadius: radius.md - 1,
                        border: 'none',
                        cursor: 'pointer',
                        marginBottom: 1,
                        background: active ? colors.sidebarActive : 'transparent',
                        color: active ? colors.sidebarTextActive : colors.sidebarText,
                        fontSize: fontSize.sm,
                        fontWeight: active ? fontWeight.semibold : fontWeight.normal,
                        textAlign: 'left',
                        transition: transitions.fast,
                      }}
                    >
                      <I size={14} />
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
