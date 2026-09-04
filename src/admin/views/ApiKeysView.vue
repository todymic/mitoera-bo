<script setup>
import { ref, computed, onMounted } from 'vue';
import { adminApi } from '../services/adminApi.js';
import { apiFetch } from '../services/auth.js';

const keys       = ref([]);
const loading    = ref(false);
const rotating   = ref(null);
const revoking   = ref(null);
const copied     = ref('');
const newSecret     = ref(null);
const showSecret    = ref(false);

const subscription = ref(null);
const hasPlan      = computed(() => subscription.value !== null);

const publicKey  = computed(() => keys.value.find(k => k.scope === 'public'     && k.active) ?? null);
const secretKey  = computed(() => keys.value.find(k => k.scope === 'backoffice' && k.active) ?? null);

const BASE_URL = window.location.origin.replace(':5173', ':8000');
const widgetSnippet = computed(() => {
  const key = publicKey.value?.keyId ?? 'pk_pub_…';
  return `<div id="mitoera-chart"></div>
<script src="${BASE_URL}/mitoera-widget.js"><\/script>
<script>
  new Mitoera.SeatingChart({
    divId: 'mitoera-chart',
    workspaceKey: '${key}',
    event: 'VOTRE_EVENT_ID',
    onSeatSelected: (seat) => console.log('sélectionné', seat),
    onSeatDeselected: (seat) => console.log('désélectionné', seat),
    onCheckout: (seats) => console.log('validation', seats),
  }).render();
<\/script>`;
});

const embedSnippet = computed(() => {
  const keyId = secretKey.value?.keyId ?? 'pk_…';
  return `<div id="chartDesigner" style="height:600px"></div>
<script src="https://bo.mitoera.com/mitoera-editor.js"><\/script>
<script>
  new mitoera.ChartDesigner({
    divId: 'chartDesigner',
    secretKey: '${keyId}:VOTRE_SECRET',
    chartKey: 'UUID_DU_PLAN',
  }).render();
<\/script>`;
});

async function load() {
  loading.value = true;
  try { keys.value = await adminApi.listApiKeys(); }
  finally { loading.value = false; }
}

async function rotate(scope) {
  rotating.value = scope;
  newSecret.value = null;
  showSecret.value = false;
  try {
    const existing = keys.value.find(k => k.scope === scope && k.active);
    if (existing) await adminApi.deleteApiKey(existing.id);
    const label = scope === 'public' ? 'Clé publique' : 'Clé secrète';
    const res = await adminApi.createApiKey(label, scope);
    newSecret.value = { keyId: res.keyId, secret: res.secret, scope };
    await load();
  } finally { rotating.value = null; }
}

async function revoke(scope) {
  if (!confirm('Révoquer cette clé ? Les intégrations utilisant cette clé cesseront de fonctionner.')) return;
  revoking.value = scope;
  try {
    const existing = keys.value.find(k => k.scope === scope && k.active);
    if (existing) await adminApi.deleteApiKey(existing.id);
    await load();
  } finally { revoking.value = null; }
}

function copy(text, id) {
  navigator.clipboard.writeText(text);
  copied.value = id;
  setTimeout(() => { copied.value = ''; }, 2000);
}

async function loadSubscription() {
  try {
    const r = await apiFetch('/api/billing/subscription');
    if (r.ok) {
      const d = await r.json();
      subscription.value = d.subscription ?? null;
    }
  } catch { /* ignore */ }
}

onMounted(async () => {
  await Promise.all([load(), loadSubscription()]);
  // Auto-génération des clés sandbox (toujours)
  // Auto-génération des clés prod uniquement si un plan est actif
  if (hasPlan.value) {
    if (!keys.value.find(k => k.scope === 'public'     && k.active)) await rotate('public');
    if (!keys.value.find(k => k.scope === 'backoffice' && k.active)) await rotate('backoffice');
  }
});
</script>

<template>
  <div class="flex flex-col h-full">

    <!-- Bannière sticky : pas de plan sélectionné -->
    <div v-if="!hasPlan && subscription !== undefined"
      class="sticky top-0 z-20 flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-6 py-3 shadow-sm">
      <svg class="w-5 h-5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      <p class="text-sm text-amber-800 flex-1">
        <strong>Aucun plan actif.</strong>
        Les clés API prod sont désactivées — choisissez un plan pour les débloquer.
        Les clés sandbox restent accessibles.
      </p>
      <router-link to="/billing" class="text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg transition shrink-0">
        Choisir un plan →
      </router-link>
    </div>

  <div class="p-4 sm:p-8 overflow-auto max-w-xl">
    <h2 class="text-2xl font-bold text-gray-900 mb-1">Clés API</h2>
    <p class="text-sm text-gray-500 mb-8">Accès à votre espace de travail.</p>

    <!-- Alerte secret visible une seule fois -->
    <div v-if="newSecret" class="mb-6 bg-amber-50 border border-amber-300 rounded-xl p-4">
      <p class="text-xs font-semibold text-amber-800 mb-2">⚠ Secret généré — sauvegardez-le maintenant, il ne sera plus affiché.</p>
      <div class="flex items-center gap-2">
        <code class="flex-1 bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm font-mono break-all">
          {{ newSecret.scope === 'backoffice' ? `${newSecret.keyId}:${newSecret.secret}` : newSecret.secret }}
        </code>
        <button @click="copy(newSecret.scope === 'backoffice' ? `${newSecret.keyId}:${newSecret.secret}` : newSecret.secret, 'new-secret')" class="text-xs px-2 py-1.5 rounded-lg bg-amber-200 hover:bg-amber-300 text-amber-800 shrink-0">
          {{ copied === 'new-secret' ? '✓' : 'Copier' }}
        </button>
      </div>
      <p v-if="newSecret.scope === 'backoffice'" class="text-xs text-amber-700 mt-2">Utilisez ce string complet comme <code class="bg-amber-100 px-1 rounded">secretKey</code> dans le SDK éditeur.</p>
      <button @click="newSecret = null; showSecret = false" class="mt-2 text-xs text-amber-600 underline">Compris</button>
    </div>

    <div v-if="loading" class="text-sm text-gray-400">Chargement…</div>

    <template v-else>

      <!-- Bloc prod désactivé si pas de plan -->
      <div v-if="!hasPlan" class="mb-8 bg-gray-50 border border-dashed border-gray-300 rounded-2xl p-6 text-center">
        <svg class="w-8 h-8 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"/>
        </svg>
        <p class="text-sm text-gray-500 mb-3">Les clés prod (secrète &amp; publique) sont disponibles après activation d'un plan.</p>
        <router-link to="/billing" class="text-sm font-semibold text-indigo-600 hover:text-indigo-800 underline">
          Choisir un plan →
        </router-link>
      </div>

      <!-- Clé secrète (prod uniquement) -->
      <div v-if="hasPlan" class="mb-6">
        <h3 class="font-semibold text-gray-900 mb-2">Clé secrète (back-office)</h3>

        <!-- keyId — toujours visible -->
        <div class="mb-2">
          <p class="text-xs text-gray-500 mb-1">Identifiant public</p>
          <div class="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <code class="flex-1 text-sm font-mono text-gray-700 break-all">{{ secretKey?.keyId ?? '…' }}</code>
            <button @click="copy(secretKey?.keyId, 'sk-id')" title="Copier le keyId"
              class="text-gray-400 hover:text-gray-700 shrink-0 p-1 rounded hover:bg-gray-100">
              <svg v-if="copied !== 'sk-id'" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- secret — affiché une seule fois + actions -->
        <div>
          <p class="text-xs text-gray-500 mb-1">Secret</p>
          <div class="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
            <code class="flex-1 text-sm font-mono break-all" :class="showSecret && newSecret ? 'text-gray-700' : 'text-gray-400'">
              {{ showSecret && newSecret ? newSecret.secret : '••••••••••••••••••••••••' }}
            </code>
            <!-- Toggle œil — actif seulement si le secret vient d'être généré -->
            <button
              v-if="newSecret"
              @click="showSecret = !showSecret"
              :title="showSecret ? 'Masquer' : 'Afficher le secret'"
              class="text-gray-400 hover:text-gray-700 shrink-0 p-1 rounded hover:bg-gray-100">
              <svg v-if="!showSecret" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
            </button>
            <button @click="rotate('backoffice')" :disabled="rotating === 'backoffice' || revoking === 'backoffice'" title="Régénérer"
              class="text-gray-400 hover:text-gray-700 shrink-0 p-1 rounded hover:bg-gray-100 disabled:opacity-40"
              :class="{ 'animate-spin': rotating === 'backoffice' }">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </button>
            <button @click="revoke('backoffice')" :disabled="rotating === 'backoffice' || revoking === 'backoffice'" title="Révoquer"
              class="text-red-400 hover:text-red-600 shrink-0 p-1 rounded hover:bg-red-50 disabled:opacity-40">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"/>
              </svg>
            </button>
          </div>
        </div>
        <p class="text-xs text-gray-400 mt-1">SDK éditeur : <code class="bg-gray-100 px-1 rounded">secretKey: "{{ secretKey?.keyId ?? 'keyId' }}:VOTRE_SECRET"</code></p>
      </div>

      <!-- Clé publique (prod uniquement) -->
      <div v-if="hasPlan" class="mb-8">
        <h3 class="font-semibold text-gray-900 mb-2">Clé publique (widget)</h3>
        <div class="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3">
          <code class="flex-1 text-sm font-mono text-gray-700 truncate">{{ publicKey?.keyId ?? '…' }}</code>
          <button @click="copy(publicKey?.keyId, 'pk')" title="Copier"
            class="text-gray-400 hover:text-gray-700 shrink-0 p-1 rounded hover:bg-gray-100">
            <svg v-if="copied !== 'pk'" xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
          </button>
          <button @click="rotate('public')" :disabled="rotating === 'public' || revoking === 'public'" title="Régénérer"
            class="text-gray-400 hover:text-gray-700 shrink-0 p-1 rounded hover:bg-gray-100 disabled:opacity-40"
            :class="{ 'animate-spin': rotating === 'public' }">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
          <button @click="revoke('public')" :disabled="rotating === 'public' || revoking === 'public'" title="Révoquer"
            class="text-red-400 hover:text-red-600 shrink-0 p-1 rounded hover:bg-red-50 disabled:opacity-40">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 715.636 5.636m12.728 12.728L5.636 5.636"/>
            </svg>
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-1">Intégrée dans le widget client (mode vente).</p>
      </div>

      <!-- Widget snippet -->
      <div class="bg-white border border-gray-200 rounded-xl p-5 mb-4">
        <h3 class="font-semibold text-gray-900 mb-1">Intégration widget</h3>
        <p class="text-xs text-gray-500 mb-3">Copiez ce code dans votre site. Remplacez <code class="bg-gray-100 px-1 rounded">VOTRE_EVENT_ID</code> par l'UUID de votre événement.</p>
        <div class="flex items-start gap-2">
          <pre class="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">{{ widgetSnippet }}</pre>
          <button @click="copy(widgetSnippet, 'widget')"
            class="text-xs px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 mt-0.5">
            {{ copied === 'widget' ? '✓ Copié' : 'Copier' }}
          </button>
        </div>
      </div>

      <!-- Embed editor snippet -->
      <div class="bg-white border border-gray-200 rounded-xl p-5">
        <h3 class="font-semibold text-gray-900 mb-1">Intégration éditeur de plan</h3>
        <p class="text-xs text-gray-500 mb-3">Remplacez <code class="bg-gray-100 px-1 rounded">VOTRE_SECRET</code> par le secret de votre clé secrète (affiché une seule fois lors de la génération) et <code class="bg-gray-100 px-1 rounded">UUID_DU_PLAN</code> par l'identifiant du plan.</p>
        <div class="flex items-start gap-2">
          <pre class="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 overflow-x-auto whitespace-pre-wrap break-all">{{ embedSnippet }}</pre>
          <button @click="copy(embedSnippet, 'embed-snippet')"
            class="text-xs px-2 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shrink-0 mt-0.5">
            {{ copied === 'embed-snippet' ? '✓ Copié' : 'Copier' }}
          </button>
        </div>
      </div>
    </template>
  </div>
  </div>
</template>
