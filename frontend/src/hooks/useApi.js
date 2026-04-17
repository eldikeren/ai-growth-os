// ─── API Hook ────────────────────────────────────────────────────
const API = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

export async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  // Read as text first so a non-JSON response (e.g. Vercel's HTML error page on
  // gateway timeout) doesn't throw "Unexpected token" — surface the real status + body.
  const text = await res.text();
  let d = null;
  if (text) {
    try { d = JSON.parse(text); }
    catch {
      const snippet = text.trim().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`HTTP ${res.status} ${res.statusText || ''} — ${snippet || 'non-JSON response'}`.trim());
    }
  }
  if (!res.ok) throw new Error((d && d.error) || `HTTP ${res.status} ${res.statusText || ''}`.trim());
  return d;
}

export { API };
