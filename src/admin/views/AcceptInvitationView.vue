<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth } from '../services/auth.js';
import { loadWorkspaces } from '../services/workspace.js';

const route  = useRoute();
const router = useRouter();

const token       = route.query.token ?? '';
const step        = ref('loading'); // loading | form | success | error
const invitation  = ref(null);
const errorMsg    = ref('');

// Form fields
const firstName = ref('');
const lastName  = ref('');
const password  = ref('');
const loading   = ref(false);
const formError = ref('');

async function fetchInvitation() {
  if (!token) { step.value = 'error'; errorMsg.value = 'Lien d\'invitation invalide.'; return; }
  try {
    const res = await fetch(`/api/invitations/${token}`);
    if (!res.ok) {
      const d = await res.json();
      errorMsg.value = d.error ?? 'Invitation invalide ou expirée.';
      step.value = 'error';
      return;
    }
    invitation.value = await res.json();
    step.value = 'form';
  } catch {
    errorMsg.value = 'Erreur réseau.';
    step.value = 'error';
  }
}

async function submit() {
  formError.value = '';
  if (password.value.length < 8) { formError.value = 'Mot de passe trop court (8 caractères min).'; return; }
  loading.value = true;
  try {
    const body = { password: password.value };
    if (!invitation.value.userExists) {
      body.firstName = firstName.value;
      body.lastName  = lastName.value;
    }
    const res = await fetch(`/api/invitations/${token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { formError.value = data.error ?? 'Erreur lors de l\'acceptation.'; return; }
    auth.setToken(data.token);
    await loadWorkspaces();
    step.value = 'success';
    setTimeout(() => router.push('/'), 2000);
  } catch {
    formError.value = 'Erreur réseau.';
  } finally {
    loading.value = false;
  }
}

onMounted(fetchInvitation);
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4">
    <div class="w-full max-w-md">

      <!-- Logo -->
      <div class="text-center mb-8">
        <span class="text-2xl font-bold text-indigo-600 tracking-tight">Mitoera</span>
      </div>

      <!-- Loading -->
      <div v-if="step === 'loading'" class="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
        <svg class="animate-spin h-5 w-5 mx-auto mb-3 text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        Vérification de l'invitation…
      </div>

      <!-- Error -->
      <div v-else-if="step === 'error'" class="bg-white rounded-xl border border-red-200 shadow-sm p-8 text-center">
        <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-1">Invitation invalide</h2>
        <p class="text-sm text-gray-500">{{ errorMsg }}</p>
      </div>

      <!-- Success -->
      <div v-else-if="step === 'success'" class="bg-white rounded-xl border border-green-200 shadow-sm p-8 text-center">
        <div class="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg class="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
          </svg>
        </div>
        <h2 class="text-lg font-semibold text-gray-900 mb-1">Bienvenue !</h2>
        <p class="text-sm text-gray-500">Vous avez rejoint <strong>{{ invitation.workspaceName }}</strong>. Redirection…</p>
      </div>

      <!-- Form -->
      <div v-else class="bg-white rounded-xl border border-gray-200 shadow-sm p-8">
        <h2 class="text-xl font-bold text-gray-900 mb-1">Rejoindre {{ invitation.workspaceName }}</h2>
        <p class="text-sm text-gray-500 mb-6">
          Invitation pour <span class="font-medium text-gray-700">{{ invitation.email }}</span>
        </p>

        <div v-if="!invitation.userExists" class="flex gap-3 mb-4">
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
            <input v-model="firstName" type="text" placeholder="Marie"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input v-model="lastName" type="text" placeholder="Dupont"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          </div>
        </div>

        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-1">
            {{ invitation.userExists ? 'Votre mot de passe' : 'Choisissez un mot de passe' }}
          </label>
          <input v-model="password" type="password" placeholder="••••••••"
            @keydown.enter="submit"
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"/>
          <p v-if="!invitation.userExists" class="text-xs text-gray-400 mt-1">8 caractères minimum</p>
        </div>

        <div v-if="formError" class="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {{ formError }}
        </div>

        <button @click="submit" :disabled="loading"
          class="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold transition">
          {{ loading ? 'Chargement…' : (invitation.userExists ? 'Me connecter et rejoindre' : 'Créer mon compte et rejoindre') }}
        </button>

        <p v-if="invitation.userExists" class="text-center text-xs text-gray-400 mt-4">
          Vous avez oublié votre mot de passe ?
          <a href="/admin/login" class="text-indigo-600 hover:underline">Connexion classique</a>
        </p>
      </div>

    </div>
  </div>
</template>
