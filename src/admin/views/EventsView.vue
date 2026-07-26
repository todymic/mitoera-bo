<script setup>
import { ref, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { adminApi } from '../services/adminApi.js';

const router  = useRouter();
const events  = ref([]);
const plans   = ref([]);
const loading = ref(false);
const error   = ref('');

const showCreate  = ref(false);
const newTitle    = ref('');
const newId       = ref('');
const newChartId  = ref('');
const creating    = ref(false);

// Edition
const editingEvent = ref(null);
const editTitle    = ref('');
const editId       = ref('');
const editChartId  = ref('');
const saving       = ref(false);
const editError    = ref('');

watch(newTitle, (v) => {
  newId.value = v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
});

async function load() {
  loading.value = true;
  const [evts, allPlans] = await Promise.all([adminApi.listEvents(), adminApi.listVenues()]);
  events.value = evts;
  plans.value = allPlans;
  loading.value = false;
}

async function createEvent() {
  if (!newTitle.value.trim()) return;
  creating.value = true;
  try {
    const ev = await adminApi.createEvent({ title: newTitle.value, identifier: newId.value, chartId: newChartId.value || null });
    showCreate.value = false; newTitle.value = ''; newId.value = ''; newChartId.value = '';
    router.push(`/events/${ev.id}`);
  } catch (e) { error.value = e.message; }
  finally { creating.value = false; }
}

async function deleteEvent(ev) {
  if (!confirm(`Supprimer "${ev.title}" ?`)) return;
  await adminApi.deleteEvent(ev.id);
  await load();
}

function openEdit(ev) {
  editingEvent.value = ev;
  editTitle.value    = ev.title;
  editId.value       = ev.identifier;
  editChartId.value  = ev.chartId || '';
  editError.value    = '';
}

function closeEdit() {
  editingEvent.value = null;
}

async function saveEdit() {
  if (!editTitle.value.trim()) return;
  saving.value = true;
  editError.value = '';
  try {
    await adminApi.updateEvent(editingEvent.value.id, {
      title:      editTitle.value,
      identifier: editId.value,
      chartId:    editChartId.value || null,
    });
    closeEdit();
    await load();
  } catch (e) { editError.value = e.message; }
  finally { saving.value = false; }
}

onMounted(load);
</script>

<template>
  <div class="p-4 sm:p-8 overflow-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Événements</h2>
        <p class="text-sm text-gray-500 mt-0.5">Gérez vos événements et l'état des places.</p>
      </div>
      <button @click="showCreate = !showCreate"
        class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition">
        + Créer un événement
      </button>
    </div>

    <!-- Create form -->
    <div v-if="showCreate" class="mb-6 p-5 bg-white border border-gray-200 rounded-xl flex flex-col gap-3">
      <h3 class="font-semibold text-gray-800 text-sm">Nouvel événement</h3>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Titre</label>
          <input v-model="newTitle" placeholder="Concert 2026"
            class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label class="text-xs text-gray-500 mb-1 block">Identifiant</label>
          <input v-model="newId" placeholder="concert-2026"
            class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono" />
        </div>
      </div>
      <div>
        <label class="text-xs text-gray-500 mb-1 block">Plan associé (optionnel)</label>
        <select v-model="newChartId" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
          <option value="">— Aucun —</option>
          <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
      <div class="flex gap-2">
        <button @click="createEvent" :disabled="creating || !newTitle.trim()"
          class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40">
          {{ creating ? 'Création…' : 'Créer' }}
        </button>
        <button @click="showCreate = false" class="px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm">Annuler</button>
      </div>
      <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
    </div>

    <!-- Edit modal -->
    <Teleport to="body">
      <div v-if="editingEvent" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40" @click.self="closeEdit">
        <div class="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-gray-900">Modifier l'événement</h3>
            <button @click="closeEdit" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
          </div>
          <div class="flex flex-col gap-3">
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Titre</label>
              <input v-model="editTitle" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Identifiant</label>
              <input v-model="editId" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono" />
            </div>
            <div>
              <label class="text-xs text-gray-500 mb-1 block">Plan associé</label>
              <select v-model="editChartId" class="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm">
                <option value="">— Aucun —</option>
                <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
          </div>
          <p v-if="editError" class="text-red-500 text-xs">{{ editError }}</p>
          <div class="flex gap-2 justify-end">
            <button @click="closeEdit" class="px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm">Annuler</button>
            <button @click="saveEdit" :disabled="saving || !editTitle.trim()"
              class="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-40">
              {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- List -->
    <div v-if="loading" class="text-gray-400 text-sm">Chargement…</div>
    <div v-else-if="!events.length" class="bg-white border border-gray-200 rounded-xl p-10 text-center text-gray-400 text-sm">
      Aucun événement. Créez-en un pour commencer.
    </div>
    <div v-else class="flex flex-col gap-3">
      <div v-for="ev in events" :key="ev.id"
        class="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-sm transition">
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-800 truncate">{{ ev.title }}</p>
          <p class="text-xs text-gray-400 mt-0.5 font-mono">{{ ev.identifier }}</p>
          <p v-if="ev.chartName" class="text-xs text-indigo-500 mt-0.5">Plan : {{ ev.chartName }}</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <router-link :to="`/events/${ev.id}`"
            class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition">
            Gérer
          </router-link>
          <button @click="openEdit(ev)"
            class="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold transition">
            Modifier
          </button>
          <button @click="deleteEvent(ev)"
            class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-sm font-semibold transition">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
