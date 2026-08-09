<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth, apiMode, switchMode } from './services/auth.js';

// Token passé en URL depuis hetsika-bo (?token=...) — auto-login sans formulaire
const urlToken = new URLSearchParams(window.location.search).get('token');
if (urlToken) auth.setToken(urlToken);

const isLoggedIn = auth.loggedIn;
const router = useRouter();
function logout() { auth.clear(); router.push({ name: 'login' }); }
const isSandbox = computed(() => apiMode.value === 'sandbox');
function toggleMode() { switchMode(isSandbox.value ? 'prod' : 'sandbox'); }

const route = useRoute();
const isEmbed = computed(() => route.query.embed === 'true');

const navItems = [
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
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>',
    match: (path) => path.startsWith('/usage'),
  },
  {
    to: '/billing',
    label: 'Facturation',
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
    to: '/settings',
    label: 'Paramètres',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>',
    match: (path) => path.startsWith('/settings'),
  },
];
</script>

<template>
  <!-- Mode embed : contenu seul, sans chrome -->
  <div v-if="isEmbed" class="h-screen flex flex-col overflow-hidden">
    <RouterView />
  </div>

  <div v-else-if="!isLoggedIn" class="min-h-screen">
    <RouterView />
  </div>

  <div v-else class="min-h-screen flex flex-col bg-gray-100">

    <!-- Header -->
    <header class="h-14 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 shrink-0 z-10 gap-3">
      <span class="text-lg sm:text-xl font-bold text-gray-900 flex-1 text-center">
        Mitoera
        <span v-if="isSandbox" class="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-amber-400 text-amber-900">SANDBOX</span>
      </span>

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
