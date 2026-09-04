const API_BASE  = 'https://api.mitoera.com/api';
const EDITOR_URL = 'https://bo.mitoera.com/embed-editor.html';

function isSandboxKey(keyId) {
  return keyId.startsWith('pk_test_');
}

async function fetchEmbedToken(keyId, secret) {
  const headers = { 'Content-Type': 'application/json' };
  if (isSandboxKey(keyId)) headers['X-Api-Mode'] = 'sandbox';

  const res = await fetch(`${API_BASE}/auth/embed-token`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ keyId, secret }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `embed-token failed (${res.status})`);
  }
  return (await res.json()).token;
}

class MitoeraChartDesigner {
  constructor({ divId, secretKey, chartKey, eventKey = null }) {
    if (!divId || !secretKey || !chartKey) {
      throw new Error('MitoeraChartDesigner: divId, secretKey et chartKey sont requis');
    }

    const colonIndex = secretKey.indexOf(':');
    if (colonIndex === -1) throw new Error('MitoeraChartDesigner: secretKey doit être au format "keyId:secret"');

    this._divId    = divId;
    this._keyId    = secretKey.slice(0, colonIndex);
    this._secret   = secretKey.slice(colonIndex + 1);
    this._chartKey = chartKey;
    this._eventKey = eventKey;
  }

  async render() {
    const el = document.getElementById(this._divId);
    if (!el) throw new Error(`MitoeraChartDesigner: div#${this._divId} introuvable`);

    el.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-family:sans-serif;color:#666">Chargement…</div>';

    try {
      const token = await fetchEmbedToken(this._keyId, this._secret);

      const params = new URLSearchParams({ planId: this._chartKey, token });
      if (this._eventKey) params.set('eventId', this._eventKey);
      if (isSandboxKey(this._keyId)) params.set('sandbox', '1');

      const iframe = document.createElement('iframe');
      iframe.src         = `${EDITOR_URL}?${params}`;
      iframe.style.cssText = 'width:100%;height:100%;border:none;display:block';
      iframe.allow       = 'fullscreen';

      el.innerHTML = '';
      el.appendChild(iframe);
      this._iframe = iframe;
    } catch (e) {
      el.innerHTML = `<div style="padding:16px;color:#e53e3e;font-family:sans-serif">${e.message}</div>`;
    }

    return this;
  }

  destroy() {
    const el = document.getElementById(this._divId);
    if (el) el.innerHTML = '';
  }
}

if (typeof window !== 'undefined') {
  window.mitoera = window.mitoera || {};
  window.mitoera.ChartDesigner = MitoeraChartDesigner;
}

export default MitoeraChartDesigner;
