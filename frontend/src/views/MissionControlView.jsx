// ─── AI Growth OS — Mission Control Live View ─────────────────
// Real-time visualization of agent activity. Renderer of truth, not simulator.
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight } from '../theme.js';
import { Spin, Empty } from '../components/index.jsx';
import { Monitor, Zap, AlertTriangle, CheckCircle, Clock, XCircle, Eye } from 'lucide-react';

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

// ── Main View ───────────────────────────────────────────────
export default function MissionControlView({ clientId }) {
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
        {/* Phaser canvas container */}
        <div
          ref={phaserRef}
          style={{ flex: 1, position: 'relative' }}
          onClick={() => setTooltip(null)}
        />

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
