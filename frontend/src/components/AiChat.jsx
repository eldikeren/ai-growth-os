// ─── AI Growth OS — In-App AI Chat Assistant ────────────────────
// Connected to OpenAI, Supabase, all app data. Can edit prompts, query data, etc.
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Sparkles, Bot, User, Loader, Minimize2, Maximize2 } from 'lucide-react';
import { api } from '../hooks/useApi.js';
import { colors, spacing, radius, fontSize, fontWeight, shadows, transitions } from '../theme.js';

// ─── Markdown-lite renderer ──────────────────────────────────
function renderText(text) {
  if (!text) return null;
  // Split by code blocks
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const code = part.replace(/```\w*\n?/, '').replace(/```$/, '');
      return (
        <pre key={i} style={{
          background: '#0F0F1A', color: '#A5B4FC', padding: 12,
          borderRadius: 8, fontSize: 11, overflow: 'auto',
          maxHeight: 300, margin: '8px 0', direction: 'ltr', textAlign: 'left',
          border: '1px solid rgba(99,102,241,0.2)',
        }}>
          {code}
        </pre>
      );
    }
    // Handle inline formatting
    return (
      <span key={i}>
        {part.split('\n').map((line, j) => {
          // Bold
          let formatted = line.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
          // Inline code
          formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:#EEF2FF;color:#4338CA;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
          // Bullet points
          if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
            return <div key={j} style={{ paddingLeft: 12, marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: '• ' + formatted.replace(/^[\s-•]+/, '') }} />;
          }
          // Numbered items
          if (/^\d+\.\s/.test(line.trim())) {
            return <div key={j} style={{ paddingLeft: 8, marginBottom: 2 }} dangerouslySetInnerHTML={{ __html: formatted }} />;
          }
          return <span key={j}>{j > 0 && <br />}<span dangerouslySetInnerHTML={{ __html: formatted }} /></span>;
        })}
      </span>
    );
  });
}

// ─── Chat Message ────────────────────────────────────────────
function ChatMessage({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 12,
      flexDirection: isUser ? 'row-reverse' : 'row',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isUser ? colors.primaryGradient : 'linear-gradient(135deg, #10B981, #059669)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isUser ? <User size={14} color="#fff" /> : <Bot size={14} color="#fff" />}
      </div>
      <div style={{
        maxWidth: '80%', padding: '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser ? colors.primary : colors.surface,
        color: isUser ? '#fff' : colors.text,
        fontSize: fontSize.sm, lineHeight: 1.6,
        boxShadow: shadows.sm,
        border: isUser ? 'none' : `1px solid ${colors.border}`,
      }}>
        {renderText(msg.content)}
      </div>
    </div>
  );
}

// ─── Quick Actions ───────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: '📝 Edit a prompt', msg: 'Show me all agent prompts so I can choose which one to edit' },
  { label: '📊 Show KPIs', msg: 'Show me all current KPI baselines and their targets' },
  { label: '🔍 Recent runs', msg: 'Show me the last 5 agent runs and their results' },
  { label: '💾 Add memory', msg: 'I want to add a new memory item about this client' },
  { label: '🔧 Troubleshoot', msg: 'Help me troubleshoot — check what\'s failing and why' },
];

// ─── Main Chat Component ─────────────────────────────────────
export default function AiChat({ clientId }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const sendMessage = async (text) => {
    if (!text?.trim()) return;
    const userMsg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await api('/chat', {
        method: 'POST',
        body: { messages: newMessages, clientId },
      });
      setMessages(prev => [...prev, { role: 'assistant', content: res.message }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `❌ Error: ${e.message}\n\nMake sure your OpenAI API key is configured in Credentials.`,
      }]);
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Floating button when closed
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI Assistant"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
          width: 56, height: 56, borderRadius: '50%',
          background: colors.primaryGradient,
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          transition: transitions.fast,
          animation: 'pulse 2s infinite',
        }}
        onMouseEnter={e => { e.target.style.transform = 'scale(1.1)'; e.target.style.boxShadow = '0 6px 28px rgba(99,102,241,0.5)'; }}
        onMouseLeave={e => { e.target.style.transform = 'scale(1)'; e.target.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)'; }}
      >
        <Sparkles size={24} color="#fff" />
      </button>
    );
  }

  const chatWidth = expanded ? 700 : 420;
  const chatHeight = expanded ? '85vh' : '550px';

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 1000,
      width: chatWidth, maxWidth: 'calc(100vw - 48px)',
      height: chatHeight, maxHeight: 'calc(100vh - 48px)',
      display: 'flex', flexDirection: 'column',
      background: colors.surface, borderRadius: radius.xl,
      border: `1px solid ${colors.border}`,
      boxShadow: '0 12px 48px rgba(0,0,0,0.15), 0 4px 12px rgba(99,102,241,0.1)',
      overflow: 'hidden',
      animation: 'slideUp 0.3s ease-out',
      transition: 'width 0.3s ease, height 0.3s ease',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 16px',
        background: colors.primaryGradient,
        color: '#fff',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: fontWeight.bold, fontSize: fontSize.md }}>AI Assistant</div>
          <div style={{ fontSize: fontSize.micro, opacity: 0.8 }}>Edit prompts, query data, make changes</div>
        </div>
        <button onClick={() => setExpanded(!expanded)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
          width: 28, height: 28, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          {expanded ? <Minimize2 size={14} color="#fff" /> : <Maximize2 size={14} color="#fff" />}
        </button>
        <button onClick={() => setOpen(false)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6,
          width: 28, height: 28, cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <X size={14} color="#fff" />
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflow: 'auto', padding: 16,
        background: colors.background,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={28} color="#fff" />
            </div>
            <div style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text, marginBottom: 4 }}>
              Hi! I'm your AI assistant
            </div>
            <div style={{ fontSize: fontSize.sm, color: colors.textMuted, marginBottom: 16, lineHeight: 1.5 }}>
              I can edit agent prompts, query your data, add memory items, update KPIs, and troubleshoot issues.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {QUICK_ACTIONS.map((qa, i) => (
                <button key={i} onClick={() => sendMessage(qa.msg)} style={{
                  padding: '6px 12px', borderRadius: radius.full,
                  border: `1px solid ${colors.border}`, background: colors.surface,
                  cursor: 'pointer', fontSize: fontSize.xs, color: colors.textSecondary,
                  fontWeight: fontWeight.medium, transition: transitions.fast,
                  fontFamily: 'inherit',
                }}
                  onMouseEnter={e => { e.target.style.borderColor = colors.primary; e.target.style.color = colors.primary; }}
                  onMouseLeave={e => { e.target.style.borderColor = colors.border; e.target.style.color = colors.textSecondary; }}
                >
                  {qa.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}

        {loading && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={14} color="#fff" />
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: '16px 16px 16px 4px',
              background: colors.surface, border: `1px solid ${colors.border}`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: colors.primary }} />
              <span style={{ fontSize: fontSize.sm, color: colors.textMuted }}>Thinking...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px', borderTop: `1px solid ${colors.border}`,
        background: colors.surface, display: 'flex', gap: 8,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask me anything... (Enter to send)"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: `1.5px solid ${colors.border}`,
            borderRadius: radius.lg, padding: '10px 14px',
            fontSize: fontSize.sm, fontFamily: 'inherit', color: colors.text,
            background: colors.background, outline: 'none',
            transition: transitions.fast, maxHeight: 100, overflow: 'auto',
          }}
          onFocus={e => e.target.style.borderColor = colors.primary}
          onBlur={e => e.target.style.borderColor = colors.border}
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          style={{
            width: 40, height: 40, borderRadius: radius.lg,
            background: (!input.trim() || loading) ? colors.borderLight : colors.primaryGradient,
            border: 'none', cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: transitions.fast, flexShrink: 0,
          }}
        >
          <Send size={16} color={(!input.trim() || loading) ? colors.textDisabled : '#fff'} />
        </button>
      </div>
    </div>
  );
}
