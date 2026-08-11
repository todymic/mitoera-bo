<script setup>
import { ref, onMounted } from 'vue';
import { auth, setEmbedApiKey, hasEmbedApiKey } from './services/auth.js';
import PlanEditor from './components/PlanEditor.vue';
import { adminApi } from './services/adminApi.js';

const params  = new URLSearchParams(window.location.search);
const planId  = params.get('planId');
const eventId = params.get('eventId') || null;

const ready = ref(false);
const spinnerVisible = ref(true);
const error = ref('');
const plan  = ref(null);

onMounted(async () => {
  if (!planId) { error.value = "Paramètre planId manquant dans l'URL"; return; }

  // Mode embed via API key (aucun compte mitoera requis)
  const keyId  = params.get('keyId');
  const secret = params.get('secret');
  if (keyId && secret) {
    setEmbedApiKey(keyId, secret);
  } else {
    // Fallback : JWT backoffice transmis en ?token= (usage interne BO)
    const urlToken = params.get('token');
    if (urlToken) auth.setToken(urlToken);
    if (!auth.isLoggedIn()) { error.value = 'Non authentifié : fournir keyId + secret ou token'; return; }
  }

  try {
    const venues = await adminApi.listVenues();
    plan.value = venues.find(p => p.id === planId) || null;
    ready.value = true;
    setTimeout(() => { spinnerVisible.value = false; }, 80);
  } catch (e) {
    spinnerVisible.value = false;
    error.value = e.message || 'Erreur de chargement';
  }
});
</script>

<template>
  <div style="height:100vh;display:flex;flex-direction:column;background:#fff;font-family:sans-serif;position:relative;">
    <div v-if="error" style="padding:24px;color:#e53e3e;">{{ error }}</div>

    <!-- Spinner loader -->
    <Transition name="spinner-fade">
      <div v-if="spinnerVisible" class="embed-spinner">
        <div class="embed-spinner__ring"></div>
      </div>
    </Transition>

    <Transition name="fade">
      <PlanEditor
        v-if="ready"
        :venue-id="planId"
        :event-id="eventId"
        :plan-status="plan?.status || 'draft'"
        :plan-pending-changes="plan?.pendingChanges || false"
        :plan-name="plan?.name || ''"
        style="flex:1;min-height:0;"
      />
    </Transition>
  </div>
</template>

<style scoped>
.fade-enter-active {
  transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center center;
}
.fade-enter-from {
  opacity: 0;
  transform: scale(0.92);
}
.fade-enter-to {
  opacity: 1;
  transform: scale(1);
}

.embed-spinner {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 10;
}
.embed-spinner__ring {
  width: 36px;
  height: 36px;
  border: 3px solid #e5e7eb;
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: embed-spin 0.7s linear infinite;
}
@keyframes embed-spin { to { transform: rotate(360deg); } }

.spinner-fade-leave-active { transition: opacity 0.2s ease; }
.spinner-fade-leave-to     { opacity: 0; }
</style>
