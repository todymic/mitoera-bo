import { ref } from 'vue';
import { apiFetch, auth } from './auth.js';

export const workspaces = ref([]);   // tous les workspaces de l'utilisateur
export const workspace  = ref(null); // workspace actif (current: true)

export async function loadWorkspaces(retries = 5) {
  if (!auth.isLoggedIn()) return;
  try {
    const res = await apiFetch('/api/workspaces');
    const list = await res.json();
    workspaces.value = list;
    const current = list.find(w => w.current) ?? list[0] ?? null;
    workspace.value = current;

    // JWT sans workspaceId (ancien token) — auto-switch sur le premier workspace
    // pour obtenir un JWT enrichi sans forcer une déconnexion manuelle.
    // Erreur isolée : si le switch échoue (ex: 502 pendant restart container),
    // on conserve workspace.value = current déjà positionné ci-dessus.
    if (current && !list.find(w => w.current)) {
      try {
        await switchWorkspace(current.id);
      } catch {
        // switch failed — workspace reste visible, sera corrigé au prochain rechargement
      }
    }
  } catch {
    workspaces.value = [];
    workspace.value  = null;
    // Retry si échec temporaire (ex: container qui redémarre après deploy)
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
