const API_BASE   = 'https://api.mitoera.com';
const EDITOR_URL = 'https://bo.mitoera.com/embed-editor.html';

async function fetchEmbedToken(apiKey, secret) {
  const res = await fetch(`${API_BASE}/api/auth/embed-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyId: apiKey, secret }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `embed-token failed (${res.status})`);
  }
  return (await res.json()).token;
}

class MitoeraEditor {
  constructor({ container, planId, eventId = null, apiKey, secret }) {
    if (!container || !planId || !apiKey || !secret) {
      throw new Error('MitoeraEditor: container, planId, apiKey et secret sont requis');
    }

    const el = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!el) throw new Error(`MitoeraEditor: conteneur introuvable "${container}"`);

    this._el = el;
    this._init(el, planId, eventId, apiKey, secret);
  }

  async _init(el, planId, eventId, apiKey, secret) {
    // Placeholder pendant le chargement du token
    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;color:#666">Chargement…</div>';

    try {
      const token = await fetchEmbedToken(apiKey, secret);

      const params = new URLSearchParams({ planId, token });
      if (eventId) params.set('eventId', eventId);

      const iframe = document.createElement('iframe');
      iframe.src    = `${EDITOR_URL}?${params}`;
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block';
      iframe.allow  = 'fullscreen';

      el.innerHTML = '';
      el.appendChild(iframe);
      this._iframe = iframe;
    } catch (e) {
      el.innerHTML = `<div style="padding:16px;color:#e53e3e;font-family:sans-serif">${e.message}</div>`;
    }
  }

  destroy() {
    if (this._el) this._el.innerHTML = '';
  }
}

if (typeof window !== 'undefined') {
  window.MitoeraEditor = MitoeraEditor;
}

export default MitoeraEditor;
