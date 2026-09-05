<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../services/adminApi.js';
import PlanPreview from '../components/PlanPreview.vue';

const router = useRouter();

const plans        = ref([]);
const planColors   = ref({});  // { [planId]: { [categoryId]: color } }
const loading      = ref(false);
const error       = ref('');
const newPlanName = ref('');
const creating    = ref(false);
const editingPlan = ref(null);
const editingName = ref('');

const STATUS_LABELS = { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' };
const STATUS_COLORS = { draft: 'bg-yellow-100 text-yellow-700', published: 'bg-green-100 text-green-700', archived: 'bg-gray-100 text-gray-500' };

async function loadPlans() {
  loading.value = true;
  error.value = '';
  try {
    plans.value = await adminApi.listVenues();
    // Fetch categories in parallel for plans that have objects
    const results = await Promise.all(
      plans.value
        .filter(p => p.objects?.length)
        .map(async p => {
          try {
            const cats = await adminApi.listCategories(p.id);
            return [p.id, Object.fromEntries(cats.map(c => [c.id, c.color]))];
          } catch { return [p.id, {}]; }
        })
    );
    planColors.value = Object.fromEntries(results);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function createPlan() {
  if (!newPlanName.value.trim()) return;
  error.value = '';
  creating.value = true;
  try {
    await adminApi.createVenue({ name: newPlanName.value });
    newPlanName.value = '';
    await loadPlans();
  } catch (e) { error.value = e.message; }
  finally { creating.value = false; }
}

async function updatePlanStatus(plan, status) {
  await adminApi.updateVenueStatus(plan.id, status);
  await loadPlans();
}

async function deletePlan(plan) {
  if (!confirm(`Supprimer le plan "${plan.name}" ?`)) return;
  try {
    await adminApi.deleteVenue(plan.id);
    await loadPlans();
  } catch (e) {
    error.value = e.message;
  }
}

function startRename(plan) { editingPlan.value = plan; editingName.value = plan.name; }
async function saveName(plan) {
  if (!editingName.value.trim()) return;
  await adminApi.updateVenue(plan.id, { name: editingName.value });
  editingPlan.value = null;
  await loadPlans();
}

onMounted(loadPlans);
</script>

<template>
  <div class="p-4 sm:p-8 overflow-auto">
    <h2 class="text-2xl font-bold text-gray-900 mb-1">Plans de salle</h2>
    <p class="text-sm text-gray-500 mb-6">Créez et gérez les plans de salle.</p>

    <p v-if="error" class="text-xs text-red-500 bg-red-50 p-2 rounded-lg mb-4">{{ error }}</p>

    <!-- Nouveau plan -->
    <div class="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <h3 class="font-semibold text-gray-800 mb-4">Nouveau plan</h3>
      <div class="flex flex-col sm:flex-row gap-3">
        <input v-model="newPlanName" type="text" placeholder="Nom du plan" @keyup.enter="createPlan"
          class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
        <button :disabled="!newPlanName.trim() || creating" @click="createPlan"
          class="px-5 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white text-sm font-semibold transition sm:shrink-0">
          {{ creating ? 'Création…' : 'Créer le plan' }}
        </button>
      </div>
    </div>

    <!-- Liste -->
    <div class="bg-white rounded-xl border border-gray-200 p-5">
      <h3 class="font-semibold text-gray-800 mb-4">Liste des plans</h3>
      <div v-if="loading" class="text-sm text-gray-400 py-4 text-center">Chargement…</div>
      <div v-else-if="!plans.length" class="text-sm text-gray-400 py-4 text-center">Aucun plan.</div>
      <div v-else class="flex flex-col gap-3">
        <div v-for="plan in plans" :key="plan.id"
          class="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg border border-gray-100 hover:border-gray-200">
          <PlanPreview :objects="plan.objects || []" :color-map="planColors[plan.id] || {}" :width="180" :height="120" />
          <div class="flex-1 min-w-0">
            <template v-if="editingPlan?.id === plan.id">
              <input v-model="editingName" @keyup.enter="saveName(plan)" @blur="saveName(plan)"
                class="font-semibold text-gray-800 border-b border-gray-400 focus:outline-none w-full" autofocus />
            </template>
            <template v-else>
              <p class="font-semibold text-gray-800 truncate">{{ plan.name }}</p>
            </template>
            <div class="flex flex-wrap items-center gap-2 mt-0.5">
              <span :class="STATUS_COLORS[plan.status || 'draft']" class="text-xs font-semibold px-2 py-0.5 rounded-full">
                {{ STATUS_LABELS[plan.status || 'draft'] }}
              </span>
              <span v-if="plan.pendingChanges" class="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600">
                Modif. non sauvegardées
              </span>
            </div>
            <p v-if="plan.updatedAt" class="text-xs text-gray-400 mt-0.5">{{ new Date(plan.updatedAt).toLocaleString('fr-FR') }}</p>
          </div>
          <div class="flex flex-wrap gap-2 shrink-0">
            <router-link :to="`/plans/${plan.id}`"
              class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition">
              Éditer
            </router-link>
            <button @click="startRename(plan)"
              class="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold transition">
              Renommer
            </button>
            <button v-if="plan.status !== 'archived'" @click="updatePlanStatus(plan, 'archived')"
              class="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold transition">
              Archiver
            </button>
            <button v-else @click="deletePlan(plan)"
              class="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition">
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
