// ─── AI Growth OS — Mission Control Live View ─────────────────
// Real-time visualization of agent activity. Renderer of truth, not simulator.
// Phase 1: Single customer live view (Phaser pixel office)
// Phase 2: Multi-customer wall (video-wall pods)
// Phase 3: Historical replay timeline (hour-by-hour activity)
// Phase 4: Premium 2.5D overlay (glow, glass, depth) applied to Phase 1
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Spin, Empty, Btn, Badge } from '../components/index.jsx';
import { Monitor, Zap, AlertTriangle, CheckCircle, Clock, XCircle, Eye,
  Grid3x3, Rewind, Maximize2, Users, Play, Pause, RefreshCw, ArrowLeft } from 'lucide-react';

// ── Dark theme overrides for this view ──────────────────────
const dark = {
  bg: '#07070f',
  surface: '#0d1117',
  surfaceLight: '#161b22',
  border: '#ffffff0a',
  text: '#e0e0e0',
  textMuted: '#666',
  textDim: '#444',
};

// ── Event type colors and labels ────────────────────────────
const EVENT_STYLES = {
  started:    { color: '#4285F4', label: 'STARTED' },
  completed:  { color: '#00E676', label: 'DONE' },
  failed:     { color: '#FF1744', label: 'FAILED' },
  queued:     { color: '#00BCD4', label: 'QUEUED' },
  blocked:    { color: '#FFAB00', label: 'BLOCKED' },
  reporting:  { color: '#34A853', label: 'REPORT' },
  validating: { color: '#2196F3', label: 'VALID' },
  retrying:   { color: '#FF9800', label: 'RETRY' },
  tool_call:  { color: '#9C27B0', label: 'TOOL' },
  approved:   { color: '#00E676', label: 'APPROVED' },
};

const ANIM_STATE_CONFIG = {
  idle:       { color: '#555', label: 'Idle', icon: '💤' },
  queued:     { color: '#00BCD4', label: 'Queued', icon: '⏳' },
  working:    { color: '#9C27B0', label: 'Working', icon: '⚙️' },
  reporting:  { color: '#34A853', label: 'Reporting', icon: '📤' },
  blocked:    { color: '#FFAB00', label: 'Blocked', icon: '🚫' },
  error:      { color: '#FF1744', label: 'Error', icon: '⚠️' },
  validating: { color: '#2196F3', label: 'Validating', icon: '🔍' },
  done:       { color: '#FFD600', label: 'Done', icon: '✅' },
};

// ── Orchestrator Bar ────────────────────────────────────────
function OrchestratorBar({ state }) {
  const summary = state?.summary;
  const workingCount = summary?.working || 0;
  const queuedCount = summary?.queued || 0;
  const totalDone = summary?.done || 0;
  const errors = summary?.errors || 0;

  let message = 'Waiting for mission...';
  if (workingCount > 0) message = `Orchestrating ${workingCount} agent${workingCount > 1 ? 's' : ''}... ${queuedCount} queued`;
  else if (totalDone > 0 && errors === 0) message = 'All agents reported — standing by';
  else if (errors > 0) message = `${errors} agent${errors > 1 ? 's' : ''} need attention`;
  else if (queuedCount > 0) message = `${queuedCount} agent${queuedCount > 1 ? 's' : ''} queued, waiting to start`;

  const pct = summary?.total > 0
    ? Math.round(((summary.done + summary.idle) / summary.total) * 100)
    : 0;

  return (
    <div style={{
      padding: '6px 16px',
      background: '#0a1628ee',
      borderBottom: '1px solid #4285F422',
      display: 'flex', alignItems: 'center', gap: 10,
      fontFamily: "'Courier New', monospace",
      fontSize: '9px', color: '#4285F4',
      backdropFilter: 'blur(4px)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 14 }}>🤖</span>
      <span style={{ fontWeight: 700, letterSpacing: 2, color: '#4285F4aa', fontSize: 8 }}>ORCHESTRATOR</span>
      <span style={{ flex: 1, fontStyle: 'italic', color: '#667' }}>{message}</span>
      <div style={{
        width: 120, height: 3,
        background: '#ffffff08', borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'linear-gradient(90deg, #4285F4, #00E676)',
          borderRadius: 2,
          transition: 'width 0.5s ease',
          boxShadow: '0 0 6px #4285F4',
        }} />
      </div>
      <span style={{ fontSize: 10, color: '#4285F4', fontWeight: 700, minWidth: 30, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

// ── Stats Bar ───────────────────────────────────────────────
function StatsBar({ summary }) {
  const stats = [
    { key: 'working', label: 'ACTIVE', color: '#9C27B0', value: summary?.working || 0 },
    { key: 'queued', label: 'QUEUED', color: '#00BCD4', value: summary?.queued || 0 },
    { key: 'done', label: 'DONE', color: '#00E676', value: summary?.done || 0 },
    { key: 'errors', label: 'ERRORS', color: '#FF1744', value: summary?.errors || 0 },
    { key: 'blocked', label: 'BLOCKED', color: '#FFAB00', value: summary?.blocked || 0 },
    { key: 'idle', label: 'IDLE', color: '#555', value: summary?.idle || 0 },
  ];

  return (
    <div style={{
      padding: '5px 16px',
      background: dark.surface,
      borderBottom: `1px solid ${dark.border}`,
      display: 'flex', gap: 8, alignItems: 'center',
      fontFamily: "'Courier New', monospace",
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 8, color: dark.textDim, letterSpacing: 2, marginRight: 8 }}>
        AGENTS: {summary?.total || 0}
      </span>
      {stats.map(s => (
        <div key={s.key} style={{
          textAlign: 'center',
          background: '#ffffff05',
          borderRadius: 6, padding: '3px 10px',
          border: '1px solid #ffffff0a',
          minWidth: 48,
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.value}</div>
          <div style={{ fontSize: 7, color: dark.textDim, letterSpacing: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Log Panel ───────────────────────────────────────────────
function LogPanel({ events }) {
  return (
    <div style={{
      width: 230,
      background: dark.surface,
      borderLeft: `1px solid ${dark.border}`,
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Courier New', monospace",
      flexShrink: 0,
    }}>
      <div style={{
        padding: '8px 12px',
        fontSize: 8, color: dark.textDim, letterSpacing: 3,
        borderBottom: `1px solid ${dark.border}`,
      }}>
        LIVE ACTIVITY LOG
      </div>

      <div style={{
        flex: 1, overflowY: 'auto', padding: '6px 10px',
      }}>
        {events.length === 0 && (
          <div style={{ fontSize: 8, color: dark.textDim, padding: '10px 0', textAlign: 'center' }}>
            No recent activity
          </div>
        )}
        {events.map((evt, i) => {
          const style = EVENT_STYLES[evt.event_type] || EVENT_STYLES.started;
          const time = new Date(evt.created_at).toLocaleTimeString('en-GB', { hour12: false });
          return (
            <div key={evt.id || i} style={{
              padding: '4px 0',
              borderBottom: '1px solid #ffffff04',
              fontSize: 8, lineHeight: 1.5,
              animation: i === 0 ? 'fadeIn 0.3s ease' : undefined,
            }}>
              <span style={{ fontWeight: 700, color: style.color }}>{evt.agent_name}</span>
              <br />
              <span style={{ color: dark.textDim }}>{time} — {evt.message || style.label}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        padding: '10px 12px',
        borderTop: `1px solid ${dark.border}`,
        flexShrink: 0,
      }}>
        {[
          { color: '#00BCD4', label: 'Walking / Queued' },
          { color: '#9C27B0', label: 'Working' },
          { color: '#34A853', label: 'Reporting' },
          { color: '#FF1744', label: 'Error' },
          { color: '#FFD600', label: 'Done' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 8, color: dark.textDim }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Agent Tooltip (shown on click) ──────────────────────────
function AgentTooltip({ info, onClose }) {
  if (!info) return null;

  const stateConfig = ANIM_STATE_CONFIG[info.animState] || ANIM_STATE_CONFIG.idle;

  return (
    <div style={{
      position: 'absolute',
      left: Math.min(info.screenX, window.innerWidth - 250),
      top: Math.max(info.screenY - 120, 10),
      width: 220,
      background: dark.surfaceLight,
      border: `1px solid ${stateConfig.color}44`,
      borderRadius: 8,
      padding: 12,
      zIndex: 200,
      fontFamily: "'Courier New', monospace",
      boxShadow: `0 4px 20px ${dark.bg}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: dark.text }}>{info.name}</span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: dark.textDim, fontSize: 12 }}>x</span>
      </div>
      <div style={{ fontSize: 8, color: dark.textMuted, marginBottom: 6 }}>{info.lane}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: stateConfig.color }} />
        <span style={{ fontSize: 9, color: stateConfig.color, fontWeight: 600 }}>{stateConfig.label}</span>
      </div>
      {info.lastRunAt && (
        <div style={{ fontSize: 8, color: dark.textDim }}>
          Last run: {new Date(info.lastRunAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {info.runCount > 0 && (
        <div style={{ fontSize: 8, color: dark.textDim }}>
          Total runs: {info.runCount}
        </div>
      )}
      {info.stateDetail?.elapsedSeconds && (
        <div style={{ fontSize: 8, color: '#9C27B0', marginTop: 4 }}>
          Running for {info.stateDetail.elapsedSeconds}s
        </div>
      )}
      {info.stateDetail?.error && (
        <div style={{ fontSize: 8, color: '#FF1744', marginTop: 4 }}>
          Error: {info.stateDetail.error.slice(0, 80)}
        </div>
      )}
    </div>
  );
}

// ── Phase 1: Single Customer Live View ─────────────────────
function SingleCustomerLive({ clientId }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState(null);
  const phaserRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    try {
      const data = await api(`/clients/${clientId}/mission-control/state`);
      setState(data);
      if (sceneRef.current?.updateAgentStates) {
        sceneRef.current.updateAgentStates(data.agents);
      }
    } catch (e) {
      console.error('Mission control fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Initial load
  useEffect(() => { setLoading(true); load(); }, [load]);

  // Poll every 5s
  useEffect(() => {
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  // Initialize Phaser
  useEffect(() => {
    if (!phaserRef.current || gameRef.current) return;

    import('phaser').then((PhaserModule) => {
      const Phaser = PhaserModule.default || PhaserModule;
      import('./mission-control/OfficeScene.js').then((mod) => {
        const OfficeScene = mod.default;
        const scene = new OfficeScene();
        sceneRef.current = scene;

        gameRef.current = new Phaser.Game({
          type: Phaser.AUTO,
          parent: phaserRef.current,
          width: phaserRef.current.clientWidth,
          height: phaserRef.current.clientHeight,
          backgroundColor: '#07070f',
          scene,
          scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          render: { antialias: false, pixelArt: true },
        });
      });
    });

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  // Resize handler
  useEffect(() => {
    const onResize = () => {
      if (gameRef.current && phaserRef.current) {
        gameRef.current.scale.resize(
          phaserRef.current.clientWidth,
          phaserRef.current.clientHeight,
        );
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Listen for agent clicks from Phaser
  useEffect(() => {
    const handler = (e) => {
      const { slug, name, lane, x, y } = e.detail;
      const agentData = state?.agents?.find(a => a.slug === slug);
      if (agentData) {
        // Convert Phaser coords to screen coords (approximate)
        const canvas = phaserRef.current?.querySelector('canvas');
        const rect = canvas?.getBoundingClientRect();
        setTooltip({
          ...agentData,
          screenX: (rect?.left || 0) + x * (rect?.width / (canvas?.width || 1)),
          screenY: (rect?.top || 0) + y * (rect?.height / (canvas?.height || 1)),
        });
      }
    };
    window.addEventListener('mc-agent-click', handler);
    return () => window.removeEventListener('mc-agent-click', handler);
  }, [state]);

  if (!clientId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
        <Empty icon={Monitor} msg="Select a client to view Mission Control" />
      </div>
    );
  }

  return (
    <div style={{
      position: 'relative',
      height: 'calc(100vh - 80px)',
      display: 'flex',
      flexDirection: 'column',
      background: dark.bg,
      color: dark.text,
    }}>
      {/* CSS for fadeIn animation */}
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>

      <OrchestratorBar state={state} />
      <StatsBar summary={state?.summary} />

      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* Phaser canvas container — with Phase 4 depth overlay */}
        <div
          ref={phaserRef}
          style={{
            flex: 1, position: 'relative',
            boxShadow: 'inset 0 0 120px rgba(66,133,244,0.08), inset 0 0 40px rgba(0,0,0,0.4)',
          }}
          onClick={() => setTooltip(null)}
        />
        {/* Phase 4: Subtle vignette overlay for depth */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.4) 100%)',
          zIndex: 5,
        }} />
        {/* Phase 4: Scanline effect (very subtle) */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(66,133,244,0.015) 2px, rgba(66,133,244,0.015) 3px)',
          zIndex: 6, mixBlendMode: 'overlay',
        }} />

        {/* Agent tooltip overlay */}
        <AgentTooltip info={tooltip} onClose={() => setTooltip(null)} />

        {/* Log panel */}
        <LogPanel events={state?.events || []} />

        {/* Loading overlay */}
        {loading && !state && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `${dark.bg}cc`,
            zIndex: 100,
          }}>
            <div style={{ textAlign: 'center' }}>
              <Spin />
              <div style={{ fontSize: 10, color: dark.textMuted, marginTop: 8, fontFamily: "'Courier New', monospace" }}>
                Connecting to agents...
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 2 — MULTI-CUSTOMER WALL VIEW
// Video-wall showing all clients as pods with live status
// ═══════════════════════════════════════════════════════════════
function CustomerWall({ clients, onSelectClient }) {
  const [states, setStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchAll = useCallback(async () => {
    if (!clients.length) { setLoading(false); return; }
    const results = await Promise.allSettled(
      clients.map(c =>
        api(`/clients/${c.id}/mission-control/state`)
          .then(s => [c.id, s])
          .catch(() => [c.id, null])
      )
    );
    const next = {};
    results.forEach(r => {
      if (r.status === 'fulfilled' && r.value[1]) next[r.value[0]] = r.value[1];
    });
    setStates(next);
    setLastRefresh(new Date());
    setLoading(false);
  }, [clients]);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useEffect(() => {
    const id = setInterval(fetchAll, 8000);
    return () => clearInterval(id);
  }, [fetchAll]);

  if (loading) {
    return (
      <div style={{ height: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark.bg }}>
        <Spin />
      </div>
    );
  }
  if (!clients.length) {
    return (
      <div style={{ padding: spacing.xl, background: dark.bg, minHeight: 'calc(100vh - 180px)' }}>
        <Empty icon={Users} msg="No clients to display" />
      </div>
    );
  }

  return (
    <div style={{
      padding: spacing.md,
      background: dark.bg,
      minHeight: 'calc(100vh - 180px)',
      color: dark.text,
      fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 3 }}>OPS WALL</div>
          <div style={{ fontSize: 9, color: '#4285F4', letterSpacing: 3 }}>
            {clients.length} CLIENTS • {lastRefresh && `UPDATED ${lastRefresh.toLocaleTimeString('en-GB', { hour12: false })}`}
          </div>
        </div>
        <button
          onClick={fetchAll}
          style={{
            background: 'linear-gradient(135deg,#4285F4,#1a73e8)',
            border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'inherit',
            fontSize: 10, fontWeight: 700, letterSpacing: 2, padding: '8px 16px',
            cursor: 'pointer', boxShadow: '0 0 16px #4285F466',
          }}
        >
          <RefreshCw size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          REFRESH
        </button>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: spacing.md,
      }}>
        {clients.map(client => {
          const s = states[client.id];
          const summary = s?.summary || { total: 0, working: 0, errors: 0, blocked: 0, done: 0, queued: 0, idle: 0 };
          const hasTrouble = summary.errors > 0 || summary.blocked > 0;
          const isBusy = summary.working > 0 || summary.queued > 0;
          const borderCol = hasTrouble ? '#FF1744' : isBusy ? '#9C27B0' : '#ffffff14';
          const glow = hasTrouble ? '#FF174466' : isBusy ? '#9C27B066' : 'transparent';
          return (
            <div
              key={client.id}
              onClick={() => onSelectClient(client)}
              style={{
                cursor: 'pointer',
                background: dark.surface,
                border: `2px solid ${borderCol}`,
                borderRadius: 12, padding: 14,
                boxShadow: isBusy || hasTrouble ? `0 0 24px ${glow}` : 'none',
                transition: 'all 0.3s',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Pulse animation background */}
              {isBusy && !hasTrouble && (
                <div style={{
                  position: 'absolute', inset: 0, pointerEvents: 'none',
                  background: 'radial-gradient(circle at 50% 50%, #9C27B015 0%, transparent 70%)',
                  animation: 'pulse 3s ease-in-out infinite',
                }} />
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, position: 'relative' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 2 }}>{client.name}</div>
                  <div style={{ fontSize: 8, color: dark.textDim, letterSpacing: 2 }}>{summary.total} AGENTS</div>
                </div>
                {hasTrouble && (
                  <span style={{
                    fontSize: 7, fontWeight: 700, letterSpacing: 2,
                    background: '#FF174422', color: '#FF1744',
                    padding: '3px 8px', borderRadius: 4, border: '1px solid #FF174444',
                  }}>NEEDS ATTENTION</span>
                )}
                {!hasTrouble && isBusy && (
                  <span style={{
                    fontSize: 7, fontWeight: 700, letterSpacing: 2,
                    background: '#9C27B022', color: '#9C27B0',
                    padding: '3px 8px', borderRadius: 4, border: '1px solid #9C27B044',
                  }}>ACTIVE</span>
                )}
                {!hasTrouble && !isBusy && (
                  <span style={{
                    fontSize: 7, fontWeight: 700, letterSpacing: 2,
                    background: '#ffffff08', color: dark.textDim,
                    padding: '3px 8px', borderRadius: 4, border: '1px solid #ffffff14',
                  }}>IDLE</span>
                )}
              </div>

              {/* Mini stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10, position: 'relative' }}>
                <PodStat label="WORK" value={summary.working} color="#9C27B0" />
                <PodStat label="QUEUE" value={summary.queued} color="#00BCD4" />
                <PodStat label="ERR" value={summary.errors} color="#FF1744" />
                <PodStat label="DONE" value={summary.done} color="#00E676" />
              </div>

              {/* Agent dots */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', minHeight: 14, position: 'relative' }}>
                {(s?.agents || []).slice(0, 16).map(a => {
                  const stateCfg = ANIM_STATE_CONFIG[a.animState] || ANIM_STATE_CONFIG.idle;
                  return (
                    <span
                      key={a.slug}
                      title={`${a.name} — ${stateCfg.label}`}
                      style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: stateCfg.color,
                        boxShadow: a.animState === 'working' ? `0 0 6px ${stateCfg.color}` :
                                   a.animState === 'error' ? `0 0 6px ${stateCfg.color}` : 'none',
                        animation: a.animState === 'working' ? 'pulse 1.5s ease-in-out infinite' : undefined,
                      }}
                    />
                  );
                })}
                {(s?.agents?.length || 0) > 16 && (
                  <span style={{ fontSize: 8, color: dark.textDim }}>+{s.agents.length - 16}</span>
                )}
              </div>

              {/* Recent event preview */}
              {s?.events?.[0] && (
                <div style={{
                  marginTop: 10, paddingTop: 8,
                  borderTop: `1px solid ${dark.border}`,
                  fontSize: 8, color: dark.textDim, position: 'relative',
                }}>
                  <span style={{ color: (EVENT_STYLES[s.events[0].event_type]?.color) || '#666' }}>
                    {EVENT_STYLES[s.events[0].event_type]?.label || s.events[0].event_type}
                  </span>
                  {' '}— {s.events[0].agent_name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

function PodStat({ label, value, color }) {
  return (
    <div style={{
      textAlign: 'center',
      background: `${color}0d`,
      border: `1px solid ${color}22`,
      borderRadius: 6, padding: '4px 2px',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color, fontFamily: "'Courier New', monospace" }}>{value}</div>
      <div style={{ fontSize: 6, color: dark.textDim, letterSpacing: 2, marginTop: 1 }}>{label}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 3 — HISTORICAL REPLAY TIMELINE
// Hour-by-hour bar chart of activity + full event log
// ═══════════════════════════════════════════════════════════════
function ReplayView({ clientId, clientName, onExit }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | errors | completions

  useEffect(() => {
    if (!clientId) return;
    setLoading(true);
    api(`/clients/${clientId}/mission-control/state`)
      .then(s => { setEvents(s.events || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [clientId]);

  if (!clientId) {
    return <div style={{ padding: spacing.xl, background: dark.bg, minHeight: 'calc(100vh - 180px)' }}>
      <Empty icon={Clock} msg="Select a client to view history" />
    </div>;
  }
  if (loading) {
    return <div style={{ height: 'calc(100vh - 180px)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dark.bg }}>
      <Spin />
    </div>;
  }

  // Group events by hour
  const buckets = {};
  events.forEach(ev => {
    const hour = new Date(ev.created_at);
    hour.setMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(ev);
  });
  const sortedKeys = Object.keys(buckets).sort();
  // Fill in missing hours for the last 24 hours
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const filledHours = [];
  for (let i = 23; i >= 0; i--) {
    const t = new Date(now.getTime() - i * 3600000);
    filledHours.push(t.toISOString());
  }

  const counts = filledHours.map(k => ({
    hour: k,
    total: (buckets[k] || []).length,
    completed: (buckets[k] || []).filter(e => e.event_type === 'completed').length,
    failed: (buckets[k] || []).filter(e => e.event_type === 'failed').length,
    started: (buckets[k] || []).filter(e => e.event_type === 'started').length,
  }));
  const maxCount = Math.max(1, ...counts.map(c => c.total));

  // Agent activity breakdown
  const byAgent = {};
  events.forEach(ev => {
    if (!byAgent[ev.agent_slug]) byAgent[ev.agent_slug] = { name: ev.agent_name, started: 0, completed: 0, failed: 0, total: 0 };
    byAgent[ev.agent_slug].total++;
    if (ev.event_type === 'completed') byAgent[ev.agent_slug].completed++;
    else if (ev.event_type === 'failed') byAgent[ev.agent_slug].failed++;
    else if (ev.event_type === 'started') byAgent[ev.agent_slug].started++;
  });
  const agentList = Object.values(byAgent).sort((a, b) => b.total - a.total);

  // Filter events
  const filteredEvents = filter === 'errors' ? events.filter(e => e.event_type === 'failed' || e.event_type === 'blocked')
    : filter === 'completions' ? events.filter(e => e.event_type === 'completed')
    : events;

  const totalEvents = events.length;
  const totalCompleted = events.filter(e => e.event_type === 'completed').length;
  const totalFailed = events.filter(e => e.event_type === 'failed').length;
  const successRate = totalCompleted + totalFailed > 0 ? Math.round((totalCompleted / (totalCompleted + totalFailed)) * 100) : 100;

  return (
    <div style={{
      padding: spacing.md,
      background: dark.bg,
      minHeight: 'calc(100vh - 180px)',
      color: dark.text,
      fontFamily: "'Courier New', monospace",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onExit} style={{
            background: 'transparent', border: '1px solid #ffffff14',
            color: dark.text, borderRadius: 6, padding: '6px 10px',
            cursor: 'pointer', fontFamily: 'inherit', fontSize: 10,
          }}>
            <ArrowLeft size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            BACK
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 3 }}>SPRINT REPLAY</div>
            <div style={{ fontSize: 9, color: '#4285F4', letterSpacing: 3 }}>
              {clientName?.toUpperCase() || 'CLIENT'} • LAST 24H
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')} label="ALL" />
          <FilterBtn active={filter === 'completions'} onClick={() => setFilter('completions')} label="WINS" color="#00E676" />
          <FilterBtn active={filter === 'errors'} onClick={() => setFilter('errors')} label="ERRORS" color="#FF1744" />
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: spacing.sm, marginBottom: spacing.md }}>
        <KpiCard label="TOTAL EVENTS" value={totalEvents} color="#4285F4" />
        <KpiCard label="COMPLETED" value={totalCompleted} color="#00E676" />
        <KpiCard label="FAILED" value={totalFailed} color="#FF1744" />
        <KpiCard label="SUCCESS RATE" value={`${successRate}%`} color={successRate >= 80 ? '#00E676' : successRate >= 50 ? '#FFAB00' : '#FF1744'} />
      </div>

      {/* Timeline bar chart */}
      <div style={{
        background: dark.surface, border: `1px solid ${dark.border}`,
        borderRadius: 10, padding: 16, marginBottom: spacing.md,
      }}>
        <div style={{ fontSize: 9, color: dark.textDim, letterSpacing: 3, marginBottom: 12 }}>ACTIVITY BY HOUR</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
          {counts.map((c, idx) => {
            const h = Math.round((c.total / maxCount) * 100);
            return (
              <div key={c.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div
                  title={`${new Date(c.hour).toLocaleString('en-GB', { hour12: false })} — ${c.total} events (${c.completed} done, ${c.failed} failed)`}
                  style={{
                    width: '80%', height: `${Math.max(h, 2)}%`, minHeight: 2,
                    background: c.failed > 0
                      ? 'linear-gradient(to top, #FF1744 0%, #9C27B0 50%, #4285F4 100%)'
                      : 'linear-gradient(to top, #4285F4 0%, #00E676 100%)',
                    borderRadius: 3,
                    boxShadow: c.total > 0 ? '0 0 8px #4285F466' : 'none',
                    transition: 'all 0.3s',
                  }}
                />
                <span style={{ fontSize: 7, color: dark.textDim }}>
                  {new Date(c.hour).getHours().toString().padStart(2, '0')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent breakdown & event log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: spacing.md }}>
        {/* Top agents */}
        <div style={{
          background: dark.surface, border: `1px solid ${dark.border}`,
          borderRadius: 10, padding: 16,
        }}>
          <div style={{ fontSize: 9, color: dark.textDim, letterSpacing: 3, marginBottom: 12 }}>TOP AGENTS</div>
          {agentList.length === 0 && (
            <div style={{ fontSize: 9, color: dark.textDim, textAlign: 'center', padding: 20 }}>
              No agent activity in this window
            </div>
          )}
          {agentList.slice(0, 10).map(a => (
            <div key={a.name} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 0', borderBottom: `1px solid ${dark.border}`,
              fontSize: 10,
            }}>
              <span style={{ color: dark.text }}>{a.name}</span>
              <div style={{ display: 'flex', gap: 8, fontSize: 8 }}>
                <span style={{ color: '#4285F4' }}>{a.started}▶</span>
                <span style={{ color: '#00E676' }}>{a.completed}✓</span>
                {a.failed > 0 && <span style={{ color: '#FF1744' }}>{a.failed}✗</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Event log */}
        <div style={{
          background: dark.surface, border: `1px solid ${dark.border}`,
          borderRadius: 10, padding: 16,
          display: 'flex', flexDirection: 'column', maxHeight: 400,
        }}>
          <div style={{ fontSize: 9, color: dark.textDim, letterSpacing: 3, marginBottom: 12 }}>
            EVENT LOG ({filteredEvents.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredEvents.length === 0 && (
              <div style={{ fontSize: 9, color: dark.textDim, textAlign: 'center', padding: 20 }}>
                No events match this filter
              </div>
            )}
            {filteredEvents.slice(0, 100).map((ev, i) => {
              const style = EVENT_STYLES[ev.event_type] || EVENT_STYLES.started;
              const time = new Date(ev.created_at).toLocaleString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={ev.id || i} style={{
                  padding: 6, marginBottom: 4,
                  borderLeft: `3px solid ${style.color}`,
                  background: `${style.color}0a`,
                  borderRadius: 4,
                  fontSize: 9,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: style.color, fontWeight: 700 }}>{style.label}</span>
                    <span style={{ color: dark.textDim }}>{time}</span>
                  </div>
                  <div style={{ color: dark.text, marginTop: 2 }}>{ev.agent_name}</div>
                  {ev.message && <div style={{ color: dark.textMuted, marginTop: 2 }}>{ev.message}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterBtn({ active, onClick, label, color }) {
  const c = color || '#4285F4';
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${c}33` : 'transparent',
        border: `1px solid ${active ? c : '#ffffff14'}`,
        color: active ? c : '#888', borderRadius: 6, padding: '6px 12px',
        fontFamily: 'inherit', fontSize: 9, letterSpacing: 2, fontWeight: 700,
        cursor: 'pointer', transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{
      background: dark.surface, border: `1px solid ${dark.border}`,
      borderRadius: 10, padding: 14,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at 100% 0%, ${color}22 0%, transparent 60%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ fontSize: 8, color: dark.textDim, letterSpacing: 2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, position: 'relative' }}>{value}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PHASE 4 — PREMIUM 2.5D OVERLAY
// Applied as CSS effects over the Phase 1 Phaser canvas
// (glass panels, glow, depth) — handled by view wrapper
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// MAIN EXPORT — Mode switcher wrapping all phases
// ═══════════════════════════════════════════════════════════════
export default function MissionControlView({ clientId, clients = [], setClientId }) {
  const [mode, setMode] = useState('live');

  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div style={{
      background: dark.bg,
      minHeight: 'calc(100vh - 80px)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Mode switcher header */}
      <div style={{
        padding: '10px 16px',
        background: '#07070fee',
        borderBottom: `1px solid ${dark.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
        backdropFilter: 'blur(8px)',
        fontFamily: "'Courier New', monospace",
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 13, fontWeight: 900, color: '#fff',
          letterSpacing: 4, textShadow: '0 0 20px #4285F4',
        }}>
          AGENT MISSION CONTROL
        </div>
        <div style={{ flex: 1 }} />
        <ModeButton active={mode === 'live'} onClick={() => setMode('live')} icon={Maximize2} label="LIVE" />
        <ModeButton active={mode === 'wall'} onClick={() => setMode('wall')} icon={Grid3x3} label="WALL" />
        <ModeButton active={mode === 'replay'} onClick={() => setMode('replay')} icon={Rewind} label="REPLAY" />
      </div>

      {/* Mode content */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {mode === 'live' && (
          <SingleCustomerLive clientId={clientId} />
        )}
        {mode === 'wall' && (
          <CustomerWall
            clients={clients}
            onSelectClient={(c) => { if (setClientId) setClientId(c.id); setMode('live'); }}
          />
        )}
        {mode === 'replay' && (
          <ReplayView
            clientId={clientId}
            clientName={selectedClient?.name}
            onExit={() => setMode('live')}
          />
        )}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 14px', borderRadius: 8,
        background: active ? 'linear-gradient(135deg,#4285F4,#1a73e8)' : 'transparent',
        color: active ? '#fff' : '#888',
        border: `1px solid ${active ? 'transparent' : '#ffffff14'}`,
        fontFamily: 'inherit', fontSize: 10, fontWeight: 700, letterSpacing: 2,
        cursor: 'pointer', transition: 'all 0.15s',
        boxShadow: active ? '0 0 20px #4285F466' : 'none',
      }}
    >
      <Icon size={12} />
      {label}
    </button>
  );
}
