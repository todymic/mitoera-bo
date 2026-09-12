<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center px-4">
    <div class="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8 text-center">
      <!-- Logo -->
      <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
           style="background: linear-gradient(135deg, #f97316, #ea580c);">
        <svg v-if="!error" class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
        </svg>
        <svg v-else class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </div>

      <template v-if="!error">
        <h1 class="text-xl font-bold text-gray-900 mb-2">Email confirmé !</h1>
        <p class="text-sm text-gray-500 mb-6">
          Votre adresse email a bien été vérifiée. Vous pouvez maintenant vous connecter.
        </p>

        <!-- Plan sélectionné -->
        <div v-if="plan" class="mb-6 px-4 py-3 rounded-xl bg-orange-50 border border-orange-100">
          <p class="text-xs text-orange-700 font-medium">
            Plan sélectionné : <strong>{{ PLAN_LABELS[plan] ?? plan }}</strong>
          </p>
          <p class="text-xs text-orange-600 mt-1">
            Vous serez redirigé vers Stripe pour enregistrer votre carte après connexion.
          </p>
        </div>

        <a :href="loginUrl"
           class="block w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
           style="background: linear-gradient(135deg, #f97316, #ea580c);">
          Se connecter{{ plan ? ' et activer mon plan' : '' }}
        </a>
      </template>

      <template v-else>
        <h1 class="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
        <p class="text-sm text-gray-500 mb-6">{{ error }}</p>

        <a href="/login"
           class="block w-full py-3 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
           style="background: linear-gradient(135deg, #f97316, #ea580c);">
          Retour à la connexion
        </a>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const PLAN_LABELS = { base: 'Base', plus: 'Plus', pro: 'Pro' };

const plan  = computed(() => route.query.plan  || null);
const error = computed(() => route.query.error || null);

const loginUrl = computed(() => {
  const base = '/login';
  return plan.value ? `${base}?plan=${encodeURIComponent(plan.value)}` : base;
});
</script>
