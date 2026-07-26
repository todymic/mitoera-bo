<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { auth } from './services/auth.js';
import LoginView from './components/LoginView.vue';

const isLoggedIn = auth.loggedIn;
function onLoggedIn() { isLoggedIn.value = true; }
function logout() { auth.clear(); }

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
    to: '/profile',
    label: 'Profil',
    icon: '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>',
    match: (path) => path.startsWith('/profile'),
  },
];
</script>

<template>
  <LoginView v-if="!isLoggedIn" @logged-in="onLoggedIn" />

  <!-- Mode embed : contenu seul, sans chrome -->
  <div v-else-if="isEmbed" class="h-screen flex flex-col overflow-hidden">
    <RouterView />
  </div>

  <div v-else class="min-h-screen flex flex-col bg-gray-100">

    <!-- Header -->
    <header class="h-14 bg-white border-b border-gray-200 flex items-center px-4 sm:px-6 shrink-0 z-10 gap-3">
      <span class="text-lg sm:text-xl font-bold text-gray-900 flex-1 text-center">Placio</span>
      <span class="text-sm text-gray-500 hidden sm:flex items-center gap-1">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
        Backoffice
      </span>
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
