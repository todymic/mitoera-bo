<script setup>
import { ref, onMounted } from 'vue';
import { apiFetch } from '../services/auth.js';
import { workspace, workspaces } from '../services/workspace.js';

const members  = ref([]);
const loading  = ref(true);
const error    = ref('');
const menuOpen = ref(null);

// Invite modal
const showInvite   = ref(false);
const inviteEmail  = ref('');
const inviteLoading = ref(false);
const inviteError  = ref('');
const inviteSuccess = ref('');

async function sendInvite() {
  inviteError.value   = '';
  inviteSuccess.value = '';
  if (!inviteEmail.value) return;
  inviteLoading.value = true;
  try {
    await apiFetch('/api/workspaces/invite', {
      method: 'POST',
      body: JSON.stringify({ email: inviteEmail.value }),
    });
    inviteSuccess.value = `Invitation envoyée à ${inviteEmail.value}`;
    inviteEmail.value   = '';
  } catch (e) {
    inviteError.value = e.message;
  } finally {
    inviteLoading.value = false;
  }
}

function closeInvite() {
  showInvite.value    = false;
  inviteEmail.value   = '';
  inviteError.value   = '';
  inviteSuccess.value = '';
}

const roleLabel = { owner: 'Admin', member: 'Membre' };

async function load() {
  try {
    const res = await apiFetch('/api/workspaces/members');
    members.value = await res.json();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function toggleMenu(id) {
  menuOpen.value = menuOpen.value === id ? null : id;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

onMounted(load);
</script>

<template>
  <div class="flex-1 overflow-auto p-6 bg-gray-50">
    <div class="max-w-5xl mx-auto">

      <!-- En-tête -->
      <div class="mb-6 flex items-start justify-between">
        <div>
          <h1 class="text-2xl font-bold text-gray-900">Team members</h1>
          <p v-if="workspace" class="mt-1 text-sm text-gray-500">
            Workspace <span class="font-medium text-gray-700">{{ workspace.name }}</span>
          </p>
        </div>
        <!-- Invite (placeholder) -->
        <button @click="showInvite = true" class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition">
          + Inviter un membre
        </button>
      </div>

      <!-- Chargement -->
      <div v-if="loading" class="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
        <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Chargement…
      </div>

      <!-- Erreur -->
      <div v-else-if="error" class="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
        {{ error }}
      </div>

      <!-- Tableau -->
      <div v-else class="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-left px-5 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Email or Name</th>
              <th class="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">2FA</th>
              <th class="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Created on</th>
              <th class="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Status</th>
              <th class="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide">Role</th>
              <th class="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden lg:table-cell">Workspaces</th>
              <th class="text-left px-4 py-3.5 font-semibold text-gray-500 text-xs uppercase tracking-wide hidden md:table-cell">Sandbox</th>
              <th class="w-10"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="m in members" :key="m.id" class="hover:bg-gray-50 transition group">

              <!-- Email / Name -->
              <td class="px-5 py-4">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                    {{ (m.name || m.email).slice(0, 1).toUpperCase() }}
                  </div>
                  <div class="min-w-0">
                    <p class="font-medium text-gray-900 truncate">{{ m.name || m.email }}</p>
                    <p v-if="m.name" class="text-xs text-gray-400 truncate">{{ m.email }}</p>
                  </div>
                </div>
              </td>

              <!-- 2FA -->
              <td class="px-4 py-4">
                <!-- Pas encore implémenté → ✗ par défaut -->
                <svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </td>

              <!-- Created on -->
              <td class="px-4 py-4 text-gray-500 whitespace-nowrap">{{ formatDate(m.joinedAt) }}</td>

              <!-- Status -->
              <td class="px-4 py-4">
                <span class="px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700 uppercase tracking-wide">Active</span>
              </td>

              <!-- Role -->
              <td class="px-4 py-4">
                <span class="flex items-center gap-1.5 text-gray-700">
                  <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                  </svg>
                  {{ roleLabel[m.role] ?? m.role }}
                </span>
              </td>

              <!-- Workspaces (tous les workspaces visibles par cet utilisateur) -->
              <td class="px-4 py-4 hidden lg:table-cell">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="w in workspaces"
                    :key="w.id"
                    class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs font-medium"
                  >{{ w.name }}</span>
                  <span v-if="!workspaces.length" class="text-gray-400">—</span>
                </div>
              </td>

              <!-- Sandbox -->
              <td class="px-4 py-4 text-gray-400 hidden md:table-cell">—</td>

              <!-- Actions -->
              <td class="px-3 py-4 relative">
                <button
                  @click="toggleMenu(m.id)"
                  class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition opacity-0 group-hover:opacity-100"
                >
                  <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"/>
                  </svg>
                </button>
                <div v-if="menuOpen === m.id" class="absolute right-4 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 text-sm">
                  <button class="w-full text-left px-3.5 py-2 hover:bg-gray-50 text-gray-700 transition opacity-50 cursor-not-allowed" disabled>Modifier le rôle</button>
                  <button class="w-full text-left px-3.5 py-2 hover:bg-red-50 text-red-600 transition opacity-50 cursor-not-allowed" disabled>Retirer du workspace</button>
                </div>
                <div v-if="menuOpen === m.id" class="fixed inset-0 z-0" @click="menuOpen = null"/>
              </td>

            </tr>
            <tr v-if="!members.length">
              <td colspan="8" class="px-5 py-12 text-center text-sm text-gray-400">Aucun membre trouvé.</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>
  </div>

  <!-- Modal invitation -->
  <Teleport to="body">
    <div v-if="showInvite" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/40" @click="closeInvite"/>
      <div class="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 class="text-lg font-bold text-gray-900 mb-1">Inviter un membre</h2>
        <p class="text-sm text-gray-500 mb-5">
          Un email d'invitation sera envoyé à l'adresse saisie.
        </p>

        <label class="block text-sm font-medium text-gray-700 mb-1">Adresse email</label>
        <input
          v-model="inviteEmail"
          type="email"
          placeholder="nom@exemple.com"
          @keydown.enter="sendInvite"
          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
        />

        <div v-if="inviteError" class="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{{ inviteError }}</div>
        <div v-if="inviteSuccess" class="mb-3 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{{ inviteSuccess }}</div>

        <div class="flex gap-2 justify-end">
          <button @click="closeInvite" class="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition">Annuler</button>
          <button
            @click="sendInvite"
            :disabled="inviteLoading || !inviteEmail"
            class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition"
          >
            {{ inviteLoading ? 'Envoi…' : 'Envoyer l\'invitation' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
