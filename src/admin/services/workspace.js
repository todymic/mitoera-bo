import { ref } from 'vue';
import { apiFetch, auth, switchMode } from './auth.js';

export const workspaces = ref([]);        // tous les workspaces de l'utilisateur
export const workspace  = ref(null);      // workspace actif (current: true)
export const sandboxUnavailable = ref(false);

// Resolve quand le workspace initial est confirmé (token correct en place).
// Les vues de données (EventManager, etc.) doivent await cette promesse
// avant de charger pour éviter de recevoir des données du mauvais workspace.
let _readyResolve;
export const workspaceReady = new Promise((r) => { _readyResolve = r; });

function markReady() {
  _readyResolve?.();
  _readyResolve = null; // idempotent
}

export async function loadWorkspaces(retries = 5) {
  if (!auth.isLoggedIn()) return;
  try {
    sandboxUnavailable.value = false;
    const res = await apiFetch('/api/workspaces');
    const list = await res.json();

    if (list.length === 0) {
      await createWorkspace('locale');
      markReady();
      return;
    }

    workspaces.value = list;

    // Après un switch de mode (prod↔sandbox), on force TOUJOURS un appel
    // switchWorkspace pour obtenir un token valide dans le nouveau mode —
    // même si le workspace cible est déjà marqué current dans la DB.
    // Sans ça, le token JWT du mode précédent reste actif : le serveur ne
    // trouve pas le workspaceId dans la nouvelle DB et retourne tous les events.
    const pendingName = localStorage.getItem('mitoera_pending_workspace_name');
    if (pendingName) {
      localStorage.removeItem('mitoera_pending_workspace_name');
      const target = list.find(w => w.name === pendingName) ?? list[0];
      try {
        await switchWorkspace(target.id);
        // switchWorkspace appelle loadWorkspaces() en interne → markReady() sera appelé
        // par le chemin normal, pas besoin de recharger la page.
      } catch {
        workspace.value = target;
        markReady();
      }
      return;
    }

    const explicitCurrent = list.find(w => w.current);
    if (!explicitCurrent && list.length > 0) {
      workspace.value = null;
      try {
        await switchWorkspace(list[0].id);
      } catch {
        workspace.value = list[0];
        markReady();
      }
      return;
    }

    workspace.value = explicitCurrent ?? null;
    markReady();
  } catch (e) {
    if (e.message === 'SANDBOX_UNAVAILABLE') {
      sandboxUnavailable.value = true;
      workspaces.value = [];
      workspace.value  = null;
      markReady();
    } else {
      workspaces.value = [];
      workspace.value  = null;
      if (retries > 0) {
        setTimeout(() => loadWorkspaces(retries - 1), 8000);
        // workspaceReady reste en attente jusqu'au retry
      } else {
        markReady(); // abandon, on débloque quand même les vues
      }
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
