// ─── Modern Glassmorphic Sidebar ─────────────────────────────────
import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { colors, spacing, radius, fontSize, fontWeight, NAV_GROUPS, transitions } from '../theme.js';

export default function Sidebar({ view, setView, clients, clientId, setClientId, onDeleteClient, collapsed, setCollapsed }) {
  const [openGroups, setOpenGroups] = useState(() => {
    const open = {};
    NAV_GROUPS.forEach(g => { open[g.label] = true; });
    return open;
  });
  const [hoveredItem, setHoveredItem] = useState(null);

  const toggleGroup = (label) => setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div onClick={() => setCollapsed(true)} className="sidebar-overlay"
          style={{ display: 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 40 }} />
      )}

      <aside role="navigation" aria-label="Main navigation" className="sidebar"
        style={{
          width: collapsed ? 0 : 260,
          minWidth: collapsed ? 0 : 260,
          background: colors.sidebarBgGradient,
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          overflow: 'hidden', transition: transitions.normal, zIndex: 50,
          borderRight: '1px solid rgba(255,255,255,0.04)',
        }}>

        {/* Brand */}
        <div style={{ padding: '28px 20px 20px' }}>
          <div style={{
            fontSize: fontSize.xl, fontWeight: fontWeight.extrabold, letterSpacing: 1.5,
            background: 'linear-gradient(135deg, #818CF8 0%, #C084FC 50%, #F472B6 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            AI GROWTH OS
          </div>
          <div style={{ fontSize: fontSize.micro, color: 'rgba(255,255,255,0.35)', marginTop: 4, letterSpacing: 0.5 }}>
            by Elad Digital
          </div>
        </div>

        {/* Client selector */}
        <div style={{ padding: '0 14px 16px' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label htmlFor="client-select" className="sr-only">Select client</label>
            <select id="client-select" value={clientId} onChange={e => setClientId(e.target.value)}
              aria-label="Select client"
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: radius.md,
                padding: '8px 10px', fontSize: fontSize.sm, color: '#E5E7EB', cursor: 'pointer',
                transition: transitions.fast,
              }}>
              <option value="">Select client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {clientId && (
              <button onClick={onDeleteClient} title="Delete client" aria-label="Delete selected client"
                style={{
                  background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: radius.md, padding: 7, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', transition: transitions.fast,
                }}>
                <Trash2 size={12} color="#FCA5A5" />
              </button>
            )}
          </div>
        </div>

        <div style={{ height: 1, background: colors.sidebarDivider, margin: '0 14px' }} />

        {/* Navigation */}
        <nav style={{ flex: 1, overflow: 'auto', padding: '12px 10px' }} aria-label="Application sections">
          {NAV_GROUPS.map(group => {
            const isOpen = openGroups[group.label];
            return (
              <div key={group.label} style={{ marginBottom: 6 }}>
                <button onClick={() => toggleGroup(group.label)} aria-expanded={isOpen}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: radius.sm,
                    cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: fontSize.micro,
                    fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 1.2,
                  }}>
                  {group.label}
                  {isOpen ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                </button>
                {isOpen && group.items.map(({ id, label, emoji }) => {
                  const active = view === id;
                  const hovered = hoveredItem === id;
                  return (
                    <button key={id} onClick={() => setView(id)}
                      onMouseEnter={() => setHoveredItem(id)}
                      onMouseLeave={() => setHoveredItem(null)}
                      aria-current={active ? 'page' : undefined}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 12px 9px 14px', borderRadius: radius.md, border: 'none',
                        cursor: 'pointer', marginBottom: 2, textAlign: 'left',
                        background: active ? colors.sidebarActiveBg : hovered ? colors.sidebarHover : 'transparent',
                        color: active ? '#FFFFFF' : hovered ? '#D1D5DB' : colors.sidebarText,
                        fontSize: fontSize.sm, fontWeight: active ? fontWeight.semibold : fontWeight.normal,
                        transition: transitions.fast,
                        borderLeft: active ? '3px solid #818CF8' : '3px solid transparent',
                      }}>
                      <span style={{ fontSize: 15, lineHeight: 1 }}>{emoji}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.sidebarDivider}` }}>
          <div style={{
            fontSize: fontSize.micro, color: 'rgba(255,255,255,0.2)', textAlign: 'center',
          }}>
            v2.0 — Powered by AI
          </div>
        </div>
      </aside>
    </>
  );
}
