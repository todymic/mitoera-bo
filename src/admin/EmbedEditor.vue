<script setup>
import { ref, onMounted } from 'vue';
import { auth, setEmbedApiKey, hasEmbedApiKey } from './services/auth.js';
import PlanEditor from './components/PlanEditor.vue';
import { adminApi } from './services/adminApi.js';

const params  = new URLSearchParams(window.location.search);
const planId  = params.get('planId');
const eventId = params.get('eventId') || null;

const ready = ref(false);
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
  } catch (e) {
    error.value = e.message || 'Erreur de chargement';
  }
});
</script>

<template>
  <div style="height:100vh;display:flex;flex-direction:column;background:#fff;font-family:sans-serif;">
    <div v-if="error" style="padding:24px;color:#e53e3e;">{{ error }}</div>

    <!-- Skeleton loader pendant le chargement -->
    <div v-else-if="!ready" class="embed-skeleton">
      <div class="embed-skeleton__toolbar"></div>
      <div class="embed-skeleton__canvas">
        <div class="embed-skeleton__pulse"></div>
      </div>
    </div>

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
  transition: opacity 0.45s ease, transform 0.45s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-enter-to {
  opacity: 1;
  transform: translateY(0);
}

.embed-skeleton {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.embed-skeleton__toolbar {
  height: 52px;
  background: #f3f4f6;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
}
.embed-skeleton__canvas {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
}
.embed-skeleton__pulse {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #e5e7eb;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.85); }
}
</style>
