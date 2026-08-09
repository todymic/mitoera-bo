<script setup>
import { ref, onMounted, computed } from 'vue';
import { adminApi } from '../services/adminApi.js';
import { apiMode } from '../services/auth.js';

const loading = ref(true);
const saving = ref(false);
const saved = ref(false);
const error = ref('');

const holdDuration = ref(10);
const isSandbox = computed(() => apiMode.value === 'sandbox');
const resetting = ref(false);
const resetResult = ref(null);
const resetError = ref('');

onMounted(async () => {
  try {
    const settings = await adminApi.getSettings();
    holdDuration.value = parseInt(settings.default_hold_duration_minutes, 10) || 10;
  } catch (e) {
    error.value = 'Impossible de charger les paramètres.';
  } finally {
    loading.value = false;
  }
});

async function resetSandbox() {
  if (!confirm('Réinitialiser le sandbox ? Toutes les données seront supprimées.')) return;
  resetting.value = true;
  resetResult.value = null;
  resetError.value = '';
  try {
    resetResult.value = await adminApi.sandboxReset();
  } catch (e) {
    resetError.value = e.message;
  } finally {
    resetting.value = false;
  }
}

async function save() {
  saving.value = true;
  saved.value = false;
  error.value = '';
  try {
    await adminApi.updateSetting('default_hold_duration_minutes', holdDuration.value);
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 3000);
  } catch (e) {
    error.value = 'Erreur lors de la sauvegarde.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6">
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-900 mb-6">Paramètres globaux</h1>

      <div v-if="loading" class="flex items-center gap-2 text-gray-500">
        <div class="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
        Chargement…
      </div>

      <!-- Section Sandbox (visible uniquement en mode sandbox) -->
      <div v-if="isSandbox && !loading" class="bg-amber-50 rounded-xl border border-amber-200 p-6 mb-4">
        <h2 class="text-sm font-semibold text-amber-800 uppercase tracking-wide mb-3">⚗️ Environnement Sandbox</h2>
        <p class="text-sm text-amber-700 mb-4">
          Réinitialise toutes les données du sandbox et crée un compte démo + une clé API publique.
        </p>
        <button
          @click="resetSandbox"
          :disabled="resetting"
          class="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-sm font-semibold rounded-lg transition"
        >
          {{ resetting ? 'Réinitialisation…' : 'Réinitialiser le sandbox' }}
        </button>
        <div v-if="resetResult" class="mt-4 p-3 bg-white rounded-lg border border-amber-200 text-sm space-y-1">
          <p class="font-medium text-green-700">✓ Sandbox réinitialisé</p>
          <p>Email : <code class="bg-gray-100 px-1 rounded">{{ resetResult.demo_email }}</code></p>
          <p>Mot de passe : <code class="bg-gray-100 px-1 rounded">{{ resetResult.demo_password }}</code></p>
          <p>Clé API publique : <code class="bg-gray-100 px-1 rounded break-all">{{ resetResult.public_api_key }}</code></p>
        </div>
        <p v-if="resetError" class="mt-2 text-sm text-red-600">{{ resetError }}</p>
      </div>

      <div v-if="!loading" class="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <!-- Hold duration -->
        <div>
          <h2 class="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Réservation temporaire (Hold)</h2>
          <div class="flex items-center gap-4">
            <div class="flex-1">
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Durée de hold par défaut
              </label>
              <p class="text-xs text-gray-500 mb-2">
                Durée pendant laquelle un siège est réservé temporairement avant d'être libéré automatiquement.
                S'applique à tous les événements qui n'ont pas de durée explicitement définie.
              </p>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="holdDuration"
                  type="number"
                  min="1"
                  max="120"
                  class="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span class="text-sm text-gray-600">minutes</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3 pt-2 border-t border-gray-100">
          <button
            @click="save"
            :disabled="saving"
            class="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition"
          >
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
          <span v-if="saved" class="text-sm text-green-600 font-medium flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
            Enregistré
          </span>
          <span v-if="error" class="text-sm text-red-600">{{ error }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
