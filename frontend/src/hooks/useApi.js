// ─── API Hook ────────────────────────────────────────────────────
const API = window.location.hostname === 'localhost' ? 'http://localhost:3001/api' : '/api';

export async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const d = await res.json();
  if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
  return d;
}

export { API };
