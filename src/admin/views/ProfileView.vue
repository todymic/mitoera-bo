<script setup>
import { ref, onMounted } from 'vue';
import { apiFetch } from '../services/auth.js';

const user = ref(null);
const loadError = ref('');

// Profile form
const firstName = ref('');
const lastName  = ref('');
const email     = ref('');
const profileMsg   = ref('');
const profileError = ref('');
const profileLoading = ref(false);

// Password form
const currentPassword  = ref('');
const newPassword      = ref('');
const confirmPassword  = ref('');
const passwordMsg      = ref('');
const passwordError    = ref('');
const passwordLoading  = ref(false);

async function loadMe() {
  try {
    const res  = await apiFetch('/api/auth/me');
    const data = await res.json();
    user.value      = data;
    firstName.value = data.firstName ?? '';
    lastName.value  = data.lastName  ?? '';
    email.value     = data.email     ?? '';
  } catch {
    loadError.value = 'Impossible de charger le profil.';
  }
}

async function saveProfile() {
  profileMsg.value   = '';
  profileError.value = '';
  profileLoading.value = true;
  try {
    const res  = await apiFetch('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({ firstName: firstName.value, lastName: lastName.value, email: email.value }),
    });
    const data = await res.json();
    user.value = data;
    profileMsg.value = 'Profil mis à jour.';
  } catch (e) {
    profileError.value = e.message;
  } finally {
    profileLoading.value = false;
  }
}

async function changePassword() {
  passwordMsg.value   = '';
  passwordError.value = '';
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'Les mots de passe ne correspondent pas';
    return;
  }
  passwordLoading.value = true;
  try {
    await apiFetch('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword: currentPassword.value, newPassword: newPassword.value }),
    });
    passwordMsg.value     = 'Mot de passe modifié.';
    currentPassword.value = '';
    newPassword.value     = '';
    confirmPassword.value = '';
  } catch (e) {
    passwordError.value = e.message;
  } finally {
    passwordLoading.value = false;
  }
}

onMounted(loadMe);
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6 md:p-8">
    <h2 class="text-2xl font-bold text-gray-900 mb-1">Profil</h2>
    <p class="text-sm text-gray-500 mb-8">Gérez vos informations personnelles et votre mot de passe.</p>

    <p v-if="loadError" class="text-sm text-red-500 bg-red-50 p-3 rounded-lg mb-6">{{ loadError }}</p>

    <div class="max-w-xl space-y-6">

      <!-- Informations personnelles -->
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <h3 class="text-base font-semibold text-gray-800 mb-4">Informations personnelles</h3>

        <p v-if="profileMsg"   class="text-xs text-green-600 bg-green-50 p-2 rounded-lg mb-4">{{ profileMsg }}</p>
        <p v-if="profileError" class="text-xs text-red-500 bg-red-50 p-2 rounded-lg mb-4">{{ profileError }}</p>

        <div class="flex gap-3 mb-4">
          <div class="flex-1">
            <label class="text-xs font-semibold text-gray-500 block mb-1">Prénom</label>
            <input v-model="firstName" type="text" placeholder="Jean"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
          </div>
          <div class="flex-1">
            <label class="text-xs font-semibold text-gray-500 block mb-1">Nom</label>
            <input v-model="lastName" type="text" placeholder="Dupont"
              class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
          </div>
        </div>

        <label class="text-xs font-semibold text-gray-500 block mb-1">Email</label>
        <input v-model="email" type="email"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 mb-4" />

        <div v-if="user" class="flex items-center gap-2 text-xs text-gray-400 mb-5">
          <span>Compte créé le {{ new Date(user.createdAt).toLocaleDateString('fr-FR') }}</span>
          <span>·</span>
          <span class="px-2 py-0.5 rounded-full text-xs font-medium"
            :class="user.roles.includes('ROLE_BACKOFFICE') ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'">
            {{ user.roles.includes('ROLE_BACKOFFICE') ? 'Backoffice' : 'Utilisateur' }}
          </span>
        </div>

        <button :disabled="profileLoading" @click="saveProfile"
          class="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-50">
          {{ profileLoading ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>

      <!-- Changement de mot de passe -->
      <div class="bg-white border border-gray-200 rounded-xl p-6">
        <h3 class="text-base font-semibold text-gray-800 mb-4">Changer le mot de passe</h3>

        <p v-if="passwordMsg"   class="text-xs text-green-600 bg-green-50 p-2 rounded-lg mb-4">{{ passwordMsg }}</p>
        <p v-if="passwordError" class="text-xs text-red-500 bg-red-50 p-2 rounded-lg mb-4">{{ passwordError }}</p>

        <label class="text-xs font-semibold text-gray-500 block mb-1">Mot de passe actuel</label>
        <input v-model="currentPassword" type="password" placeholder="••••••••"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 mb-3" />

        <label class="text-xs font-semibold text-gray-500 block mb-1">Nouveau mot de passe</label>
        <input v-model="newPassword" type="password" placeholder="8 caractères minimum"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 mb-3" />

        <label class="text-xs font-semibold text-gray-500 block mb-1">Confirmer le nouveau mot de passe</label>
        <input v-model="confirmPassword" type="password" placeholder="••••••••"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400 mb-5" />

        <button :disabled="passwordLoading" @click="changePassword"
          class="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {{ passwordLoading ? 'Modification…' : 'Modifier le mot de passe' }}
        </button>
      </div>

    </div>
  </div>
</template>
