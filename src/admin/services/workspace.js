import { ref } from 'vue';
import { apiFetch, auth } from './auth.js';

export const workspaces = ref([]);   // tous les workspaces de l'utilisateur
export const workspace  = ref(null); // workspace actif (current: true)

export async function loadWorkspaces(retries = 5) {
  if (!auth.isLoggedIn()) return;
  try {
    const res = await apiFetch('/api/workspaces');
    const list = await res.json();

    // En sandbox, si l'utilisateur n'a pas encore de workspace → créer "Sandbox" automatiquement
    if (list.length === 0) {
      await createWorkspace('Sandbox');
      return;
    }

    workspaces.value = list;
    const current = list.find(w => w.current) ?? list[0] ?? null;
    workspace.value = current;

    if (current && !list.find(w => w.current)) {
      try {
        await switchWorkspace(current.id);
      } catch {
        // switch failed — workspace reste visible, sera corrigé au prochain rechargement
      }
    }
  } catch (e) {
    // SANDBOX_UNAVAILABLE : on vient de basculer en prod, recharger avec le bon mode
    if (e.message === 'SANDBOX_UNAVAILABLE') {
      await loadWorkspaces(retries);
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
