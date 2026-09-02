<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { auth } from '../services/auth.js';

const router = useRouter();
const route  = useRoute();

// 'login' | 'register' | 'forgot' | 'reset'
const mode = ref('login');

// Plan choisi depuis la page pricing (mora | soa | tsena)
const pendingPlan = ref(null);

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
const showPassword = ref(false);

const PLAN_LABELS = { mora: 'Mora', soa: 'Soa', tsena: 'Tsena' };

onMounted(() => {
  // Lire le mode depuis l'URL (?mode=register)
  if (route.query.mode === 'register') mode.value = 'register';

  // Lien de réinitialisation depuis l'email (?token=xxx)
  if (route.query.token) {
    resetToken.value = route.query.token;
    mode.value = 'reset';
  }

  // Plan choisi depuis la page pricing
  if (route.query.plan) {
    pendingPlan.value = route.query.plan;
    localStorage.setItem('pendingPlan', route.query.plan);
  }

  // Email vérifié avec succès — forcer la déconnexion de la session courante
  if (route.query.verified === '1') {
    auth.clear();
    message.value = 'Email vérifié ✓ Vous pouvez maintenant vous connecter.';
    const stored = localStorage.getItem('pendingPlan');
    if (stored) pendingPlan.value = stored;
  }

  // Erreur de vérification
  if (route.query.error) {
    error.value = decodeURIComponent(route.query.error);
  }
});

function clearMessages() { error.value = ''; message.value = ''; }

async function submitLogin() {
  clearMessages();
  loading.value = true;
  try {
    await auth.login(loginEmail.value, loginPassword.value);

    // Si un plan est en attente, lancer le checkout
    const plan = pendingPlan.value || localStorage.getItem('pendingPlan');
    if (plan) {
      localStorage.removeItem('pendingPlan');
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${auth.token()}` },
        body: JSON.stringify({
          planKey:    plan,
          successUrl: window.location.origin + '/billing?success=1',
          cancelUrl:  window.location.origin + '/billing',
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) { window.location.href = data.url; return; }
    }

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

    // Envoyer l'email de vérification
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: regEmail.value }),
    });

    message.value = `Compte créé ! Un email de vérification a été envoyé à ${regEmail.value}. Vérifiez votre boîte mail avant de vous connecter.`;
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

      <!-- Logo -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style="background:#E8713A">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="10" width="4" height="8" rx="1"/><rect x="10" y="6" width="4" height="12" rx="1"/><rect x="17" y="10" width="4" height="8" rx="1"/>
          </svg>
        </div>
        <span class="text-2xl font-bold text-gray-900 tracking-tight">Mitoera</span>
      </div>

      <!-- Register -->
      <template v-if="mode === 'register'">
        <h1 class="text-xl font-bold text-gray-800 mb-1 text-center">Créer un compte</h1>
        <p v-if="pendingPlan" class="text-xs text-center mb-4 px-3 py-2 rounded-lg bg-orange-50 text-orange-700 font-medium">
          Plan sélectionné : <strong>{{ PLAN_LABELS[pendingPlan] ?? pendingPlan }}</strong> — vous serez redirigé vers le paiement après connexion.
        </p>
        <p v-else class="text-xs text-gray-400 mb-6 text-center">Créez votre compte Mitoera</p>

        <p v-if="message" class="text-xs text-green-600 mb-4 bg-green-50 p-2 rounded-lg">{{ message }}</p>
        <p v-if="error"   class="text-xs text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{{ error }}</p>

        <div class="flex gap-3 mb-3">
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
          class="w-full py-3 rounded-lg text-white text-base font-semibold disabled:opacity-50"
          style="background:#E8713A">
          {{ loading ? 'Création…' : 'Créer mon compte' }}
        </button>

        <p class="text-xs text-center text-gray-400 mt-4">
          Déjà un compte ?
          <button @click="go('login')" class="text-indigo-500 hover:underline font-medium">Se connecter</button>
        </p>
      </template>

      <!-- Login -->
      <template v-else-if="mode === 'login'">
        <h1 class="text-xl font-bold text-gray-800 mb-1 text-center">Connexion</h1>
        <p v-if="pendingPlan" class="text-xs text-center mb-4 px-3 py-2 rounded-lg bg-orange-50 text-orange-700 font-medium">
          Plan <strong>{{ PLAN_LABELS[pendingPlan] ?? pendingPlan }}</strong> sélectionné — connectez-vous pour activer.
        </p>
        <p v-else class="text-xs text-gray-400 mb-6 text-center">Connectez-vous pour gérer les plans</p>

        <p v-if="message" class="text-xs text-green-600 mb-4 bg-green-50 p-2 rounded-lg">{{ message }}</p>
        <p v-if="error"   class="text-xs text-red-500 mb-4 bg-red-50 p-2 rounded-lg">{{ error }}</p>

        <label class="text-sm font-semibold text-gray-500">Email</label>
        <input v-model="loginEmail" type="email" placeholder="admin@example.com" @keyup.enter="submitLogin"
          class="w-full mt-1 mb-3 px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />

        <label class="text-sm font-semibold text-gray-500">Mot de passe</label>
        <div class="relative mt-1 mb-1">
          <input v-model="loginPassword" :type="showPassword ? 'text' : 'password'" placeholder="••••••••" @keyup.enter="submitLogin"
            class="w-full px-4 py-3 pr-11 border border-gray-200 rounded-lg text-base focus:outline-none focus:border-gray-400" />
          <button type="button" @click="showPassword = !showPassword"
            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg v-if="!showPassword" xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"/>
            </svg>
          </button>
        </div>

        <div class="text-right mb-5">
          <button @click="go('forgot')" class="text-xs text-indigo-500 hover:underline">Mot de passe oublié ?</button>
        </div>

        <button :disabled="loading" @click="submitLogin"
          class="w-full py-3 rounded-lg text-white text-base font-semibold disabled:opacity-50"
          style="background:#E8713A">
          {{ loading ? 'Connexion…' : 'Se connecter' }}
        </button>

        <p class="text-xs text-center text-gray-400 mt-4">
          Pas encore de compte ?
          <button @click="go('register')" class="text-indigo-500 hover:underline font-medium">Créer un compte</button>
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
