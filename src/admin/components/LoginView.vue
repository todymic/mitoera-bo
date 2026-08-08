<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { auth } from '../services/auth.js';

const router = useRouter();

// 'login' | 'register' | 'forgot' | 'reset'
const mode = ref('login');

// Login
const loginEmail    = ref('');
const loginPassword = ref('');

// Register
const firstName  = ref('');
const lastName   = ref('');
const regEmail   = ref('');
const regPassword = ref('');

// Forgot
const forgotEmail = ref('');
const resetToken  = ref('');

// Reset
const newPassword    = ref('');
const confirmPassword = ref('');

const message = ref('');
const error   = ref('');
const loading = ref(false);

function clearMessages() { error.value = ''; message.value = ''; }

async function submitLogin() {
  clearMessages();
  loading.value = true;
  try {
    await auth.login(loginEmail.value, loginPassword.value);
    router.push({ name: 'home' });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function submitRegister() {
  clearMessages();
  if (regPassword.value.length < 8) {
    error.value = 'Le mot de passe doit contenir au moins 8 caractères';
    return;
  }
  loading.value = true;
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: firstName.value, lastName: lastName.value, email: regEmail.value, password: regPassword.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Erreur lors de l\'inscription');
    message.value = 'Compte créé avec succès ! Vous pouvez vous connecter.';
    mode.value = 'login';
    loginEmail.value = regEmail.value;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function submitForgot() {
  clearMessages();
  loading.value = true;
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: forgotEmail.value }),
    });
    const data = await res.json();
    if (data.resetToken) {
      resetToken.value = data.resetToken;
      message.value = 'Lien de réinitialisation généré (mode dev).';
      mode.value = 'reset';
    } else {
      message.value = 'Si cet email existe, un lien de réinitialisation a été envoyé.';
    }
  } catch {
    error.value = 'Une erreur est survenue.';
  } finally {
    loading.value = false;
  }
}

async function submitReset() {
  clearMessages();
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Les mots de passe ne correspondent pas';
    return;
  }
  loading.value = true;
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken.value, password: newPassword.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Lien invalide ou expiré');
    message.value = 'Mot de passe réinitialisé ! Vous pouvez vous connecter.';
    mode.value = 'login';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function go(m) { clearMessages(); mode.value = m; }
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="bg-white rounded-2xl shadow-sm p-10 w-full max-w-lg">

      <!-- Login -->
      <template v-if="mode === 'login'">
        <h1 class="text-xl font-bold text-gray-800 mb-1">Connexion</h1>
        <p class="text-xs text-gray-400 mb-6">Connectez-vous pour gérer les plans</p>

        <p v-if="message" class="text-xs text-green-600 mb-4 bg-green-50 p-2 rounded-lg">{{ message }}</p>
        <p v-if="error"   class="text-xs text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{{ error }}</p>

        <label class="text-sm font-semibold text-gray-500">Email</label>
        <input v-model="loginEmail" type="email" placeholder="admin@example.com" @keyup.enter="submitLogin"
          class="w-full mt-1 mb-3 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <label class="text-sm font-semibold text-gray-500">Mot de passe</label>
        <input v-model="loginPassword" type="password" placeholder="••••••••" @keyup.enter="submitLogin"
          class="w-full mt-1 mb-1 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <div class="text-right mb-5">
          <button @click="go('forgot')" class="text-xs text-indigo-500 hover:underline">Mot de passe oublié ?</button>
        </div>

        <button :disabled="loading" @click="submitLogin"
          class="w-full py-3 rounded-lg bg-gray-900 text-white text-base font-semibold hover:bg-gray-700 disabled:opacity-50">
          {{ loading ? 'Connexion…' : 'Se connecter' }}
        </button>

        <p class="text-xs text-center text-gray-400 mt-4">
          Pas encore de compte ?
          <button @click="go('register')" class="text-indigo-500 hover:underline font-medium">S'inscrire</button>
        </p>
      </template>

      <!-- Register -->
      <template v-else-if="mode === 'register'">
        <h1 class="text-xl font-bold text-gray-800 mb-1">Créer un compte</h1>
        <p class="text-xs text-gray-400 mb-6">Rejoignez Placio pour gérer vos événements</p>

        <p v-if="error" class="text-xs text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{{ error }}</p>

        <div class="flex gap-2 mb-3">
          <div class="flex-1">
            <label class="text-sm font-semibold text-gray-500">Prénom</label>
            <input v-model="firstName" type="text" placeholder="Jean"
              class="w-full mt-1 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />
          </div>
          <div class="flex-1">
            <label class="text-sm font-semibold text-gray-500">Nom</label>
            <input v-model="lastName" type="text" placeholder="Dupont"
              class="w-full mt-1 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />
          </div>
        </div>

        <label class="text-sm font-semibold text-gray-500">Email</label>
        <input v-model="regEmail" type="email" placeholder="jean@example.com"
          class="w-full mt-1 mb-3 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <label class="text-sm font-semibold text-gray-500">Mot de passe</label>
        <input v-model="regPassword" type="password" placeholder="8 caractères minimum" @keyup.enter="submitRegister"
          class="w-full mt-1 mb-5 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <button :disabled="loading" @click="submitRegister"
          class="w-full py-3 rounded-lg bg-indigo-600 text-white text-base font-semibold hover:bg-indigo-700 disabled:opacity-50">
          {{ loading ? 'Création…' : 'Créer mon compte' }}
        </button>

        <p class="text-xs text-center text-gray-400 mt-4">
          Déjà un compte ?
          <button @click="go('login')" class="text-indigo-500 hover:underline font-medium">Se connecter</button>
        </p>
      </template>

      <!-- Forgot password -->
      <template v-else-if="mode === 'forgot'">
        <h1 class="text-xl font-bold text-gray-800 mb-1">Mot de passe oublié</h1>
        <p class="text-xs text-gray-400 mb-6">Saisissez votre email pour recevoir un lien de réinitialisation</p>

        <p v-if="message" class="text-xs text-green-600 mb-4 bg-green-50 p-2 rounded-lg">{{ message }}</p>
        <p v-if="error"   class="text-xs text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{{ error }}</p>

        <label class="text-sm font-semibold text-gray-500">Email</label>
        <input v-model="forgotEmail" type="email" placeholder="jean@example.com" @keyup.enter="submitForgot"
          class="w-full mt-1 mb-5 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <button :disabled="loading" @click="submitForgot"
          class="w-full py-3 rounded-lg bg-indigo-600 text-white text-base font-semibold hover:bg-indigo-700 disabled:opacity-50">
          {{ loading ? 'Envoi…' : 'Envoyer le lien' }}
        </button>

        <p class="text-xs text-center text-gray-400 mt-4">
          <button @click="go('login')" class="text-indigo-500 hover:underline font-medium">← Retour à la connexion</button>
        </p>
      </template>

      <!-- Reset password -->
      <template v-else-if="mode === 'reset'">
        <h1 class="text-xl font-bold text-gray-800 mb-1">Nouveau mot de passe</h1>
        <p class="text-xs text-gray-400 mb-6">Choisissez un nouveau mot de passe</p>

        <p v-if="message" class="text-xs text-green-600 mb-4 bg-green-50 p-2 rounded-lg">{{ message }}</p>
        <p v-if="error"   class="text-xs text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{{ error }}</p>

        <label class="text-sm font-semibold text-gray-500">Nouveau mot de passe</label>
        <input v-model="newPassword" type="password" placeholder="8 caractères minimum"
          class="w-full mt-1 mb-3 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <label class="text-sm font-semibold text-gray-500">Confirmer le mot de passe</label>
        <input v-model="confirmPassword" type="password" placeholder="••••••••" @keyup.enter="submitReset"
          class="w-full mt-1 mb-5 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <button :disabled="loading" @click="submitReset"
          class="w-full py-3 rounded-lg bg-indigo-600 text-white text-base font-semibold hover:bg-indigo-700 disabled:opacity-50">
          {{ loading ? 'Enregistrement…' : 'Réinitialiser' }}
        </button>
      </template>

    </div>
  </div>
</template>
