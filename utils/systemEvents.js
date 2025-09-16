// utils/systemEvents.js

async function ensureFetch() {
  if (typeof fetch === 'function') return fetch;
  try {
    // Fallback for older Node versions
    const mod = await import('node-fetch');
    return mod.default || mod;
  } catch {
    throw new Error('fetch is not available and node-fetch is not installed');
  }
}

function buildUrl(path) {
  const base = (process.env.API_BASE || '').replace(/\/+$/, '');
  if (!base) throw new Error('API_BASE env not set');
  if (!path.startsWith('/')) path = `/${path}`;
  return `${base}${path}`;
}

async function postSystemEvent(path, body) {
  try {
    const f = await ensureFetch();
    const url = buildUrl(path);
    const res = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-system-secret': process.env.SYSTEM_EVENTS_SECRET || ''
      },
      body: JSON.stringify(body || {})
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn('[SYSTEM-EVENTS] Post failed', res.status, text);
    }
  } catch (e) {
    console.warn('[SYSTEM-EVENTS] Post error', e && e.message ? e.message : e);
  }
}

module.exports = { postSystemEvent };


