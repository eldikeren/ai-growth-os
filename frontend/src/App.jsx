// ─── AI Growth OS — Main App Shell ───────────────────────────────
// Clean layout with grouped sidebar, responsive design, lazy-loaded views
import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Loader, Menu, X } from 'lucide-react';
import { api } from './hooks/useApi.js';
import { colors, spacing, transitions } from './theme.js';
import Sidebar from './layout/Sidebar.jsx';
import AiChat from './components/AiChat.jsx';

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
const PromptOverridesView = lazy(() => import('./views/PromptOverridesView.jsx'));
const LinkIntelligenceView = lazy(() => import('./views/LinkIntelligenceView.jsx'));
const SeoActionPlansView = lazy(() => import('./views/SeoActionPlansView.jsx'));
const SystemAuditView = lazy(() => import('./views/SystemAuditView.jsx'));
const ProposedChangesView = lazy(() => import('./views/ProposedChangesView.jsx'));

function ViewLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <Loader size={24} style={{ animation: 'spin 1s linear infinite', color: colors.primary }} />
    </div>
  );
}

export default function App() {
  const [view, _setView] = useState(() => localStorage.getItem('aigos_view') || 'dashboard');
  const setView = useCallback((v) => { _setView(v); localStorage.setItem('aigos_view', v); }, []);
  const [clients, setClients] = useState([]);
  const [clientId, _setClientId] = useState(() => localStorage.getItem('aigos_clientId') || '');
  const setClientId = useCallback((id) => { _setClientId(id); if (id) localStorage.setItem('aigos_clientId', id); }, []);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusRunId, setFocusRunId] = useState(null);
  const [focusCredentialService, setFocusCredentialService] = useState(null);

  const loadClients = useCallback(() =>
    api('/clients').then(c => {
      setClients(c);
      if (c.length > 0 && !c.find(x => x.id === clientId)) setClientId(c[0].id);
      return c;
    }).catch(() => [])
  , []);

  useEffect(() => {
    // Read URL params (e.g. from OAuth redirect: ?view=credentials&client=xxx)
    const params = new URLSearchParams(window.location.search);
    const urlView = params.get('view');
    const urlClient = params.get('client');
    if (urlView) setView(urlView);
    if (urlClient) setClientId(urlClient);
    // Clean URL params after reading
    if (urlView || urlClient) window.history.replaceState({}, '', window.location.pathname);

    loadClients().finally(() => setLoading(false));
  }, []);

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
    const handler = (e) => {
      const detail = e.detail;
      if (typeof detail === 'object' && detail.view) {
        setView(detail.view);
        if (detail.runId) setFocusRunId(detail.runId);
        if (detail.service) setFocusCredentialService(detail.service);
      } else {
        setView(detail);
      }
    };
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

  const viewProps = { clientId, setClientId, clients };

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.background, fontFamily: "'Inter', 'Noto Sans Hebrew', 'DM Sans', 'Segoe UI', sans-serif", overflow: 'hidden' }}>
      {/* Global styles */}
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
        body { margin: 0; background: #F5F7FA; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
        a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: 2px solid ${colors.primary};
          outline-offset: 2px;
        }
        input:focus, textarea:focus, select:focus {
          border-color: ${colors.primary} !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important;
        }
        button:active:not(:disabled) { transform: scale(0.98) !important; }
        /* Responsive sidebar */
        @media (max-width: 768px) {
          .sidebar { position: fixed !important; height: 100vh !important; z-index: 50 !important; }
          .sidebar-overlay { display: block !important; }
          .mobile-menu-btn { display: flex !important; }
          .main-content { padding: 20px !important; }
        }
        @media (min-width: 769px) {
          .mobile-menu-btn { display: none !important; }
        }
        /* Smooth view transitions */
        .view-content { animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        /* Scrollbar styling */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.25); }
        /* Selection */
        ::selection { background: rgba(99,102,241,0.2); color: #111827; }
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
              {view === 'system-audit' && <SystemAuditView clientId={clientId} />}
              {view === 'agents' && <AgentsView clientId={clientId} />}
              {view === 'runs' && <RunsView clientId={clientId} focusRunId={focusRunId} onFocusConsumed={() => setFocusRunId(null)} />}
              {view === 'queue' && <QueueView clientId={clientId} />}
              {view === 'approvals' && <ApprovalsView clientId={clientId} />}
              {view === 'memory' && <MemoryView clientId={clientId} />}
              {view === 'seo' && <SeoView clientId={clientId} />}
              {view === 'reports' && <ReportsView {...viewProps} />}
              {view === 'verification' && <VerificationView clientId={clientId} />}
              {view === 'credentials' && <CredentialsView clientId={clientId} focusService={focusCredentialService} onFocusConsumed={() => setFocusCredentialService(null)} />}
              {view === 'incidents' && <IncidentsView clientId={clientId} />}
              {view === 'audit' && <AuditView clientId={clientId} />}
              {view === 'schedules' && <SchedulesView clientId={clientId} />}
              {view === 'onboarding' && <OnboardingView clientId={clientId} clients={clients} onClientCreated={id => { setClientId(id); loadClients(); setView('dashboard'); }} />}
              {view === 'setup-links' && <SetupLinksView {...viewProps} />}
              {view === 'website-access' && <WebsiteAccessView clientId={clientId} />}
              {view === 'prompt-overrides' && <PromptOverridesView clientId={clientId} />}
              {view === 'link-intelligence' && <LinkIntelligenceView clientId={clientId} />}
              {view === 'seo-actions' && <SeoActionPlansView clientId={clientId} />}
              {view === 'proposed-changes' && <ProposedChangesView clientId={clientId} />}
            </div>
          </Suspense>
        )}
      </main>

      {/* App Footer — Legal Links for Meta Compliance */}
      <footer style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24,
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
        borderTop: `1px solid ${colors.border}`,
        zIndex: 30,
        fontSize: 12, color: '#6B7280',
      }}>
        <span style={{ fontWeight: 600, color: '#9CA3AF' }}>© {new Date().getFullYear()} Elad Digital</span>
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer"
          style={{ color: '#6366F1', textDecoration: 'none', fontWeight: 500 }}>
          Privacy Policy
        </a>
        <a href="/data-deletion" target="_blank" rel="noopener noreferrer"
          style={{ color: '#6366F1', textDecoration: 'none', fontWeight: 500 }}>
          Data Deletion
        </a>
        <a href="/terms-of-service" target="_blank" rel="noopener noreferrer"
          style={{ color: '#6366F1', textDecoration: 'none', fontWeight: 500 }}>
          Terms of Service
        </a>
      </footer>

      {/* AI Chat Assistant */}
      <AiChat clientId={clientId} />
    </div>
  );
}
