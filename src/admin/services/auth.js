import { ref } from 'vue';

const TOKEN_KEY = 'bo_jwt';
const MODE_KEY = 'bo_api_mode';

function currentMode() {
  return localStorage.getItem(MODE_KEY) || 'prod';
}

export const apiMode = ref(currentMode());

function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export const auth = {
  loggedIn: ref(isTokenValid(localStorage.getItem(TOKEN_KEY))),

  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
    auth.loggedIn.value = true;
  },

  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(MODE_KEY);
    apiMode.value = 'prod';
    auth.loggedIn.value = false;
  },

  isLoggedIn() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!isTokenValid(token)) {
      if (token) auth.clear();
      return false;
    }
    return true;
  },

  async login(email, password) {
    const res = await fetch(`/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Identifiants invalides');
    const data = await res.json();
    auth.setToken(data.token);
    return data;
  },

  async me() {
    const res = await apiFetch('/auth/me');
    return res.json();
  },
};

export function getApiBase() {
  return '/api';
}

export function switchMode(mode) {
  if (apiMode.value === mode) return;
  localStorage.setItem(MODE_KEY, mode);
  apiMode.value = mode;
  window.location.reload();
}

// Clé API pour le mode embed (pas de JWT, pas de localStorage)
let _embedApiKey = null;

export function setEmbedApiKey(keyId, secret) {
  _embedApiKey = keyId && secret ? `${keyId}:${secret}` : null;
}

export function hasEmbedApiKey() {
  return !!_embedApiKey;
}

export async function apiFetch(path, options = {}) {
  const authHeader = _embedApiKey
    ? { Authorization: `Basic ${btoa(_embedApiKey)}` }
    : (() => { const t = auth.getToken(); return t ? { Authorization: `Bearer ${t}` } : {}; })();

  const headers = {
    'Content-Type': 'application/json',
    ...(apiMode.value === 'sandbox' ? { 'X-Api-Mode': 'sandbox' } : {}),
    ...authHeader,
    ...options.headers,
  };

  const url = path.startsWith('/api/')
    ? `${getApiBase()}${path.slice(4)}`
    : path;
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    if (_embedApiKey) throw new Error('SESSION_EXPIRED');
    // En mode sandbox, un 401 signifie que l'utilisateur n'existe pas dans la DB sandbox
    // → on repasse en prod sans déconnecter la session courante
    if (apiMode.value === 'sandbox') {
      switchMode('prod');
      throw new Error('SANDBOX_UNAVAILABLE');
    }
    auth.clear();
    window.location.href = '/admin/login';
    throw new Error('SESSION_EXPIRED');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.detail || `Erreur ${res.status}`);
  }

  return res;
}
