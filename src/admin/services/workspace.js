import { ref } from 'vue';
import { apiFetch, auth, switchMode } from './auth.js';

export const workspaces = ref([]);        // tous les workspaces de l'utilisateur
export const workspace  = ref(null);      // workspace actif (current: true)
export const sandboxUnavailable = ref(false);

export async function loadWorkspaces(retries = 5) {
  if (!auth.isLoggedIn()) return;
  try {
    sandboxUnavailable.value = false;
    const res = await apiFetch('/api/workspaces');
    const list = await res.json();

    if (list.length === 0) {
      await createWorkspace('locale');
      return;
    }

    workspaces.value = list;
    const explicitCurrent = list.find(w => w.current);
    workspace.value = explicitCurrent ?? null;

    if (!explicitCurrent && list.length > 0) {
      try {
        await switchWorkspace(list[0].id);
        // switchWorkspace → loadWorkspaces : workspace.value est mis à jour par la suite
        return;
      } catch {
        workspace.value = list[0];
      }
    }
  } catch (e) {
    if (e.message === 'SANDBOX_UNAVAILABLE') {
      sandboxUnavailable.value = true;
      workspaces.value = [];
      workspace.value  = null;
      return;
    }
    workspaces.value = [];
    workspace.value  = null;
    if (retries > 0) {
      setTimeout(() => loadWorkspaces(retries - 1), 8000);
    }
  }
}

export async function switchWorkspace(id) {
  const res  = await apiFetch(`/api/workspaces/${id}/switch`, { method: 'POST' });
  const data = await res.json();
  auth.setToken(data.token);
  await loadWorkspaces();
}

export async function createWorkspace(name) {
  const res  = await apiFetch('/api/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la création');
  }
  const data = await res.json();
  auth.setToken(data.token);
  await loadWorkspaces();
  return data;
}
