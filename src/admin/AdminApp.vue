<script setup>
import { computed, onMounted, watch, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, apiMode, switchMode } from './services/auth.js';
import { workspace, workspaces, loadWorkspaces, switchWorkspace, createWorkspace } from './services/workspace.js';
import { activePlanId, activePlanDirty, activePlanStatus } from './services/activePlan.js';
import { adminApi } from './services/adminApi.js';

// Auto-login via token JWT passé en URL (?token=...)
// Le token doit être généré côté serveur via POST /api/auth/embed-token
// La clé secrète sk_bo_xxx ne doit JAMAIS apparaître dans l'URL
const urlToken = new URLSearchParams(window.location.search).get('token');
if (urlToken) auth.setToken(urlToken);

const isLoggedIn = auth.loggedIn;
const route  = useRoute();
const router = useRouter();
function logout() { auth.clear(); workspace.value = null; workspaces.value = []; router.push({ name: 'login' }); }

// Infos utilisateur extraites du JWT (pas d'appel API)
const currentUser = computed(() => {
  const token = auth.getToken?.() ?? localStorage.getItem('jwt_token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const email = payload.username ?? payload.email ?? '';
    const name  = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || email.split('@')[0];
    return { email, name, initials: name.slice(0, 2).toUpperCase() };
  } catch { return null; }
});
const isSandbox = computed(() => apiMode.value === 'sandbox');
function toggleMode() { switchMode(isSandbox.value ? 'prod' : 'sandbox'); }

onMounted(() => { if (auth.isLoggedIn()) loadWorkspaces(); });
watch(isLoggedIn, (v) => { if (v) loadWorkspaces(); });

// Workspace switcher dropdown
const switcherOpen   = ref(false);
const creatingWs     = ref(false);
const newWsName      = ref('');
const newWsError     = ref('');
const newWsLoading   = ref(false);

async function doSwitch(id) {
  if (workspace.value?.id === id) { switcherOpen.value = false; return; }

  // Si un plan publié est ouvert et a des modifications non sauvegardées,
  // le repasser en brouillon avant de changer de workspace.
  if (activePlanId.value && activePlanDirty.value && activePlanStatus.value === 'published') {
    try { await adminApi.updateVenueStatus(activePlanId.value, 'draft'); } catch (_) {}
  }

  await switchWorkspace(id);
  switcherOpen.value = false;
  // Retourner à la liste des plans si on était dans l'éditeur
  // (le plan appartient à l'ancien workspace)
  if (route.name === 'plan-editor') {
    window.location.href = '/plans';
  } else {
    window.location.reload();
  }
}

function openCreate() {
  creatingWs.value = true;
  newWsName.value  = '';
  newWsError.value = '';
}

async function submitCreate() {
  const name = newWsName.value.trim();
  if (!name) { newWsError.value = 'Le nom est requis.'; return; }
  newWsLoading.value = true;
  newWsError.value   = '';
  try {
    await createWorkspace(name);
    creatingWs.value   = false;
    switcherOpen.value = false;
    window.location.reload();
  } catch (e) {
    newWsError.value = e.message;
  } finally {
    newWsLoading.value = false;
  }
}

const isEmbed = computed(() => route.query.embed === 'true');
const isFullscreen = computed(() => route.name === 'docs');

const allNavItems = [
  {
    to: '/',
    label: 'Accueil',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
    match: (path) => path === '/',
  },
  {
    to: '/plans',
    label: 'Plans',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>',
    match: (path) => path.startsWith('/plans'),
  },
  {
    to: '/events',
    label: 'Événements',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
    match: (path) => path.startsWith('/events'),
  },
  {
    to: '/api-keys',
    label: 'Clés API',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>',
    match: (path) => path.startsWith('/api-keys'),
  },
  {
    to: '/usage',
    label: 'Usage',
    sandboxHidden: true,
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>',
    match: (path) => path.startsWith('/usage'),
  },
  {
    to: '/billing',
    label: 'Facturation',
    sandboxHidden: true,
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>',
    match: (path) => path.startsWith('/billing'),
  },
  {
    to: '/profile',
    label: 'Profil',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
    match: (path) => path.startsWith('/profile'),
  },
  {
    to: '/team',
    label: 'Équipe',
    sandboxHidden: true,
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    match: (path) => path.startsWith('/team'),
  },
  {
    to: '/settings',
    label: 'Paramètres',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    match: (path) => path.startsWith('/settings'),
  },
];

const navItems = computed(() =>
  isSandbox.value ? allNavItems.filter(i => !i.sandboxHidden) : allNavItems
);
</script>

<template>
  <!-- Docs : rendu sans chrome BO -->
  <div v-if="isFullscreen">
    <RouterView />
  </div>

  <!-- Mode embed : contenu seul, sans chrome -->
  <div v-else-if="isEmbed" class="h-screen flex flex-col overflow-hidden">
    <RouterView />
  </div>

  <div v-else-if="!isLoggedIn" class="min-h-screen">
    <RouterView />
  </div>

  <div v-else class="min-h-screen flex flex-col bg-gray-100">

    <!-- Header -->
    <header class="h-14 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 shrink-0 z-10 gap-3">
      <div class="flex-1 flex items-center justify-center gap-2">
        <span class="text-lg sm:text-xl font-bold text-gray-900">Mitoera</span>

        <!-- Workspace switcher -->
        <div v-if="workspace" class="relative hidden sm:block">
          <button
            @click="switcherOpen = !switcherOpen"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition"
          >
            <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
            {{ workspace.name }}
            <svg class="w-3 h-3 transition-transform" :class="switcherOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>

          <!-- Dropdown -->
          <div v-if="switcherOpen" class="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 py-1 overflow-hidden">
            <button
              v-for="w in workspaces"
              :key="w.id"
              @click="doSwitch(w.id)"
              class="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-left hover:bg-gray-50 transition"
              :class="w.current ? 'text-indigo-700 font-semibold' : 'text-gray-700'"
            >
              <svg class="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
              <span class="flex-1 truncate">{{ w.name }}</span>
              <svg v-if="w.current" class="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            </button>

            <div class="border-t border-gray-100 mt-1 pt-1">
              <!-- Formulaire inline création -->
              <div v-if="creatingWs" class="px-3 py-2">
                <input
                  v-model="newWsName"
                  @keyup.enter="submitCreate"
                  @keyup.escape="creatingWs = false"
                  placeholder="Nom du workspace"
                  autofocus
                  class="w-full text-sm border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <p v-if="newWsError" class="text-xs text-red-500 mt-1">{{ newWsError }}</p>
                <div class="flex gap-1.5 mt-2">
                  <button
                    @click="submitCreate"
                    :disabled="newWsLoading"
                    class="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold disabled:opacity-50 transition"
                  >{{ newWsLoading ? '…' : 'Créer' }}</button>
                  <button
                    @click="creatingWs = false"
                    class="text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition"
                  >Annuler</button>
                </div>
              </div>
              <!-- Bouton pour ouvrir le formulaire -->
              <button
                v-else
                @click.stop="openCreate"
                class="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-indigo-700 transition"
              >
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/></svg>
                Nouveau workspace
              </button>
            </div>
          </div>

          <!-- Overlay to close dropdown -->
          <div v-if="switcherOpen" class="fixed inset-0 z-40" @click="switcherOpen = false; creatingWs = false" />
        </div>

        <span v-if="isSandbox" class="ml-1 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-400 text-amber-900">SANDBOX</span>
      </div>

      <!-- Toggle Prod / Sandbox -->
      <button
        @click="toggleMode"
        :title="isSandbox ? 'Passer en mode Production' : 'Passer en mode Sandbox'"
        class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition shrink-0"
        :class="isSandbox
          ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
          : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'"
      >
        <span v-if="isSandbox">⚗️ Sandbox → Prod</span>
        <span v-else>⚗️ Sandbox</span>
      </button>

      <!-- Utilisateur connecté -->
      <div v-if="currentUser" class="hidden sm:flex items-center gap-2 shrink-0">
        <div class="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
          {{ currentUser.initials }}
        </div>
        <div class="leading-tight">
          <p class="text-xs font-semibold text-gray-800 truncate max-w-[120px]">{{ currentUser.name }}</p>
          <p class="text-xs text-gray-400 truncate max-w-[120px]">{{ currentUser.email }}</p>
        </div>
      </div>

      <button @click="logout" class="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition shrink-0">
        Déconnexion
      </button>
    </header>

    <div class="flex flex-1 min-h-0">

      <!-- Sidebar -->
      <aside class="w-14 md:w-40 lg:w-48 shrink-0 bg-gray-900 text-gray-300 flex flex-col py-4">
        <nav class="flex flex-col gap-1 px-1.5">
          <router-link
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm transition w-full"
            :class="item.match(route.path) ? 'bg-gray-700 text-white' : 'hover:bg-gray-800 text-gray-400'"
            :title="item.label"
          >
            <span class="shrink-0 w-5 h-5 flex items-center justify-center" v-html="item.icon"></span>
            <span class="hidden md:block truncate">{{ item.label }}</span>
          </router-link>
        </nav>
      </aside>

      <!-- Main content -->
      <main class="flex-1 min-h-0 flex flex-col overflow-hidden">
        <RouterView />
      </main>

    </div>
  </div>
</template>
