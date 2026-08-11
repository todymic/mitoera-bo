import { ref } from 'vue';
import { apiFetch, auth } from './auth.js';

export const workspaces = ref([]);   // tous les workspaces de l'utilisateur
export const workspace  = ref(null); // workspace actif (current: true)

export async function loadWorkspaces() {
  if (!auth.isLoggedIn()) return;
  try {
    const res = await apiFetch('/api/workspaces');
    const list = await res.json();
    workspaces.value = list;
    const current = list.find(w => w.current) ?? list[0] ?? null;
    workspace.value = current;

    // JWT sans workspaceId (ancien token) — auto-switch sur le premier workspace
    // pour obtenir un JWT enrichi sans forcer une déconnexion manuelle
    if (current && !list.find(w => w.current)) {
      await switchWorkspace(current.id);
    }
  } catch {
    workspaces.value = [];
    workspace.value  = null;
  }
}

export async function switchWorkspace(id) {
  const res  = await apiFetch(`/api/workspaces/${id}/switch`, { method: 'POST' });
  const data = await res.json();
  auth.setToken(data.token);
  await loadWorkspaces();
}
