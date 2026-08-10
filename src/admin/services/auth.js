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
    const base = getApiBase();
    const res = await fetch(`${base}/auth/login`, {
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
  return apiMode.value === 'sandbox' ? '/sandbox-api' : '/api';
}

export function switchMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  apiMode.value = mode;
  window.location.reload();
}

export async function apiFetch(path, options = {}) {
  const token = auth.getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  // Remplace le préfixe /api par /sandbox-api si on est en mode sandbox
  const url = path.startsWith('/api/')
    ? `${getApiBase()}${path.slice(4)}`
    : path;
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
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
