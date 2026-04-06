// ─── AI Growth OS — Main App Shell ───────────────────────────────
// Clean layout with grouped sidebar, responsive design, lazy-loaded views
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Loader, Menu, X } from 'lucide-react';
import { api } from './hooks/useApi.js';
import { colors, spacing, transitions } from './theme.js';
import Sidebar from './layout/Sidebar.jsx';

// Lazy-load views for code splitting
const Dashboard = lazy(() => import('./views/Dashboard.jsx'));
const AgentsView = lazy(() => import('./views/AgentsView.jsx'));
const RunsView = lazy(() => import('./views/RunsView.jsx'));
const QueueView = lazy(() => import('./views/QueueView.jsx'));
const ApprovalsView = lazy(() => import('./views/ApprovalsView.jsx'));
const MemoryView = lazy(() => import('./views/MemoryView.jsx'));
const SeoView = lazy(() => import('./views/SeoView.jsx'));
const ReportsView = lazy(() => import('./views/ReportsView.jsx'));
const VerificationView = lazy(() => import('./views/VerificationView.jsx'));
const CredentialsView = lazy(() => import('./views/CredentialsView.jsx'));
const IncidentsView = lazy(() => import('./views/IncidentsView.jsx'));
const AuditView = lazy(() => import('./views/AuditView.jsx'));
const SchedulesView = lazy(() => import('./views/SchedulesView.jsx'));
const OnboardingView = lazy(() => import('./views/OnboardingView.jsx'));
const SetupLinksView = lazy(() => import('./views/SetupLinksView.jsx'));
const WebsiteAccessView = lazy(() => import('./views/WebsiteAccessView.jsx'));
const ConnectorsView = lazy(() => import('./views/ConnectorsView.jsx'));
const PromptOverridesView = lazy(() => import('./views/PromptOverridesView.jsx'));
const LinkIntelligenceView = lazy(() => import('./views/LinkIntelligenceView.jsx'));
const SeoActionPlansView = lazy(() => import('./views/SeoActionPlansView.jsx'));

function ViewLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: colors.primary }} />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState('dashboard');
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const loadClients = useCallback(() =>
    api('/clients').then(c => {
      setClients(c);
      if (c.length > 0 && !c.find(x => x.id === clientId)) setClientId(c[0].id);
      return c;
    }).catch(() => [])
  , []);

  useEffect(() => { loadClients().finally(() => setLoading(false)); }, []);

  // Auto-collapse sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setSidebarCollapsed(e.matches);
    handler(mq);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Listen for navigation events from child views (e.g. Dashboard "Create Setup Link")
  useEffect(() => {
    const handler = (e) => setView(e.detail);
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  const deleteClient = async () => {
    if (!clientId) return;
    const client = clients.find(c => c.id === clientId);
    if (!confirm(`Delete "${client?.name || clientId}" and ALL related data? This cannot be undone.`)) return;
    try {
      await api(`/clients/${clientId}`, { method: 'DELETE' });
      const updated = await loadClients();
      if (updated.length > 0) setClientId(updated[0].id);
      else setClientId('');
    } catch (e) { alert(`Error: ${e.message}`); }
  };

  const viewProps = { clientId, clients };

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.background, fontFamily: "'Inter', 'Noto Sans Hebrew', 'DM Sans', 'Segoe UI', sans-serif", overflow: 'hidden' }}>
      {/* Global styles */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        body { margin: 0; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
        a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 2px solid ${colors.primary};
          outline-offset: 2px;
        }
        /* Responsive sidebar */
        @media (max-width: 768px) {
          .sidebar { position: fixed !important; height: 100vh !important; z-index: 50 !important; }
          .sidebar-overlay { display: block !important; }
          .mobile-menu-btn { display: flex !important; }
          .main-content { padding: 16px !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu-btn { display: none !important; }
        }
        /* Smooth view transitions */
        .view-content { animation: fadeIn 0.2s ease-out; }
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${colors.borderDark}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${colors.textMuted}; }
      `}</style>

      {/* Skip to main content (a11y) */}
      <a href="#main-content" className="sr-only" style={{ position: 'absolute', zIndex: 100, background: colors.primary, color: '#fff', padding: '8px 16px', top: 0, left: 0 }}
        onFocus={e => e.target.style.clip = 'auto'}
        onBlur={e => e.target.style.clip = 'rect(0,0,0,0)'}
      >
        Skip to main content
      </a>

      {/* Sidebar */}
      <Sidebar
        view={view}
        setView={(v) => { setView(v); if (window.innerWidth <= 768) setSidebarCollapsed(true); }}
        clients={clients}
        clientId={clientId}
        setClientId={setClientId}
        onDeleteClient={deleteClient}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />

      {/* Main content area */}
      <main
        id="main-content"
        className="main-content"
        role="main"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: spacing['3xl'],
          transition: transitions.normal,
        }}
      >
        {/* Mobile menu button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Open menu' : 'Close menu'}
          style={{
            display: 'none',
            alignItems: 'center',
            justifyContent: 'center',
            width: 36,
            height: 36,
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.surface,
            cursor: 'pointer',
            marginBottom: spacing.lg,
          }}
        >
          {sidebarCollapsed ? <Menu size={18} /> : <X size={18} />}
        </button>

        {loading ? (
          <ViewLoader />
        ) : (
          <Suspense fallback={<ViewLoader />}>
            <div className="view-content">
              {view === 'dashboard' && <Dashboard {...viewProps} />}
              {view === 'agents' && <AgentsView clientId={clientId} />}
              {view === 'runs' && <RunsView clientId={clientId} />}
              {view === 'queue' && <QueueView clientId={clientId} />}
              {view === 'approvals' && <ApprovalsView clientId={clientId} />}
              {view === 'memory' && <MemoryView clientId={clientId} />}
              {view === 'seo' && <SeoView clientId={clientId} />}
              {view === 'reports' && <ReportsView {...viewProps} />}
              {view === 'verification' && <VerificationView clientId={clientId} />}
              {view === 'credentials' && <CredentialsView clientId={clientId} />}
              {view === 'incidents' && <IncidentsView clientId={clientId} />}
              {view === 'audit' && <AuditView clientId={clientId} />}
              {view === 'schedules' && <SchedulesView clientId={clientId} />}
              {view === 'onboarding' && <OnboardingView clientId={clientId} clients={clients} onClientCreated={id => { setClientId(id); loadClients(); setView('dashboard'); }} />}
              {view === 'setup-links' && <SetupLinksView {...viewProps} />}
              {view === 'website-access' && <WebsiteAccessView clientId={clientId} />}
              {view === 'connectors' && <ConnectorsView clientId={clientId} />}
              {view === 'prompt-overrides' && <PromptOverridesView clientId={clientId} />}
              {view === 'link-intelligence' && <LinkIntelligenceView clientId={clientId} />}
              {view === 'seo-actions' && <SeoActionPlansView clientId={clientId} />}
            </div>
          </Suspense>
        )}
      </main>
    </div>
  );
}
