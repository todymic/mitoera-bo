<template>
  <div class="p-8">
    <h2 class="text-2xl font-bold text-gray-900 mb-1">Accueil</h2>
    <p class="text-sm text-gray-500 mb-8">Bienvenue dans le backoffice Placio.</p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <router-link to="/plans" class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition flex flex-col gap-2">
        <svg class="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
        <p class="font-semibold text-gray-900">Plans de salle</p>
        <p class="text-xs text-gray-400">Créez et gérez vos plans.</p>
      </router-link>
      <router-link to="/events" class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition flex flex-col gap-2">
        <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        <p class="font-semibold text-gray-900">Événements</p>
        <p class="text-xs text-gray-400">Gérez vos événements et réservations.</p>
      </router-link>
      <router-link to="/api-keys" class="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition flex flex-col gap-2">
        <svg class="w-8 h-8 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8"><path stroke-linecap="round" stroke-linejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg>
        <p class="font-semibold text-gray-900">Clés API</p>
        <p class="text-xs text-gray-400">Gérez vos clés d'accès API.</p>
      </router-link>
    </div>
  </div>
</template>
