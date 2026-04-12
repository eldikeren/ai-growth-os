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
          width: collapsed ? 0 : 280,
          minWidth: collapsed ? 0 : 280,
          background: colors.sidebarBgGradient,
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          overflow: 'hidden', transition: transitions.normal, zIndex: 50,
          borderRight: '1px solid rgba(255,255,255,0.04)',
        }}>

        {/* Brand — EladDigital Logo */}
        <div style={{ padding: '20px 16px 12px' }}>
          <img
            src="/images/elad-digital-logo.png"
            alt="Elad Digital"
            style={{
              width: '100%', maxWidth: 200, height: 'auto',
              display: 'block',
              filter: 'brightness(1.1)',
            }}
          />
          <div style={{
            fontSize: 11, fontWeight: fontWeight.bold, letterSpacing: 1.5,
            marginTop: 6, textTransform: 'uppercase',
            background: 'linear-gradient(135deg, #818CF8 0%, #C084FC 50%, #F472B6 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            AI GROWTH OS
          </div>
        </div>

        {/* Client selector — stacked layout so delete button is always visible */}
        <div style={{ padding: '0 14px 16px' }}>
          <select id="client-select" value={clientId} onChange={e => setClientId(e.target.value)}
            aria-label="Select client"
            style={{
              width: '100%', background: 'rgba(255,255,255,0.06)', backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: radius.md,
              padding: '10px 12px', fontSize: 14, color: '#E5E7EB', cursor: 'pointer',
              transition: transitions.fast, marginBottom: clientId ? 8 : 0,
            }}>
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.domain ? ` (${c.domain.replace(/^https?:\/\//, '')})` : ''}</option>)}
          </select>
          {clientId && (
            <button onClick={onDeleteClient} title="Delete selected client" aria-label="Delete selected client"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: radius.md, padding: '8px 12px', cursor: 'pointer',
                transition: transitions.fast, color: '#FCA5A5', fontSize: 13,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.12)'; }}
            >
              <Trash2 size={14} color="#FCA5A5" />
              Delete Client
            </button>
          )}
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
                    cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 11,
                    fontWeight: fontWeight.bold, textTransform: 'uppercase', letterSpacing: 1.2,
                  }}>
                  {group.label}
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
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
                        padding: '10px 12px 10px 14px', borderRadius: radius.md, border: 'none',
                        cursor: 'pointer', marginBottom: 2, textAlign: 'left',
                        background: active ? colors.sidebarActiveBg : hovered ? colors.sidebarHover : 'transparent',
                        color: active ? '#FFFFFF' : hovered ? '#D1D5DB' : colors.sidebarText,
                        fontSize: 15, fontWeight: active ? fontWeight.semibold : fontWeight.normal,
                        transition: transitions.fast,
                        borderLeft: active ? '3px solid #818CF8' : '3px solid transparent',
                      }}>
                      <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
                      {label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer with legal links */}
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${colors.sidebarDivider}` }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', transition: transitions.fast }}
              onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.7)'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}>
              Privacy Policy
            </a>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11 }}>·</span>
            <a href="/data-deletion" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', transition: transitions.fast }}
              onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.7)'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}>
              Data Deletion
            </a>
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 11 }}>·</span>
            <a href="/terms-of-service" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', transition: transitions.fast }}
              onMouseEnter={e => e.target.style.color = 'rgba(255,255,255,0.7)'}
              onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.4)'}>
              Terms
            </a>
          </div>
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
