<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { adminApi } from '../services/adminApi.js';
import { workspaceReady } from '../services/workspace.js';
import { computeSeatLabel, computeAxisLabel } from '../../services/seatLabel';
import EventPlanView from './EventPlanView.vue';
import PlanThumbnail from './PlanThumbnail.vue';

const props = defineProps({
  categories: { type: Array, default: () => [] },
});

// ---- State ----
const events = ref([]);
const plans  = ref([]);

const planObjectsMap = computed(() => {
  const map = {};
  for (const p of plans.value) {
    const objs = p.publishedSnapshot ?? p.objects ?? [];
    map[p.id] = objs;
  }
  return map;
});
const loading = ref(false);
const error   = ref('');

// ---- Selected event (detail view) ----
const selectedEvent = ref(null);
const activeTab     = ref('summary');
const eventDetail   = ref(null); // { id, title, identifier, chartId, chartName, seats, chartObjects }
const detailLoading = ref(false);

// ---- Create form ----
const showCreate  = ref(false);
const newTitle    = ref('');
const newId       = ref('');
const newChartId  = ref('');
const creating    = ref(false);

// Auto-slug from title
watch(newTitle, (v) => {
  newId.value = v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
});

// ---- Load ----
async function load() {
  loading.value = true;
  error.value = '';
  try {
    [events.value, plans.value] = await Promise.all([
      adminApi.listEvents(),
      adminApi.listVenues(),
    ]);
  } catch (e) { error.value = e.message; }
  finally { loading.value = false; }
}
// Attend que le workspace (et son token) soit confirmé avant de charger les
// events — évite de recevoir des events d'un autre workspace au switch de mode.
onMounted(() => workspaceReady.then(load));

// ---- CRUD ----
async function createEvent() {
  if (!newTitle.value.trim()) return;
  creating.value = true;
  try {
    await adminApi.createEvent({ title: newTitle.value, identifier: newId.value, chartId: newChartId.value || null });
    newTitle.value = ''; newId.value = ''; newChartId.value = '';
    showCreate.value = false;
    await load();
  } catch (e) { error.value = e.message; }
  finally { creating.value = false; }
}

async function deleteEvent(ev) {
  if (!confirm(`Supprimer l'événement "${ev.title}" ?`)) return;
  await adminApi.deleteEvent(ev.id);
  await load();
}

// ---- Open detail ----
async function openEvent(ev) {
  selectedEvent.value = ev;
  activeTab.value = 'summary';
  detailLoading.value = true;
  try {
    eventDetail.value = await adminApi.getEvent(ev.id);
  } finally { detailLoading.value = false; }
}
function backToList() { selectedEvent.value = null; eventDetail.value = null; }

// ---- Seat status map from detail ----
const seatStatusMap = computed(() => {
  if (!eventDetail.value) return {};
  const map = {};
  for (const s of eventDetail.value.seats || []) map[s.seatKey] = s.status;
  return map;
});

// ---- Build all seats from chartObjects ----
function buildSeats(chartObjects) {
  if (!chartObjects?.length) return [];
  const all = [];
  for (const obj of chartObjects) {
    const type = obj._type;
    if (type === 'seatRow') {
      const section = obj.section || obj.label || obj.id || 'S';
      const rows = obj.rows || 1, cols = obj.cols || 1;
      const disabled = obj.disabledSeats || [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const posKey = `${r}-${c}`;
          if (disabled.includes(posKey)) continue;
          const rowLabel = computeAxisLabel(r, rows, obj.rowFormat || 'A-Z', obj.rowDirection || 'normal');
          const colLabel = computeAxisLabel(c, cols, obj.colFormat || '1-9', obj.colDirection || 'normal');
          all.push({ key: `${section}-${rowLabel}-${colLabel}`, section, categoryId: obj.categoryId });
        }
      }
    } else if (type === 'tableSection') {
      const section = obj.section || obj.label || obj.id || 'TS';
      const totalTables = (obj.tableCount || 3) * (obj.tableRows || 1);
      const spt = obj.seatsPerTable || 6;
      const disabled = obj.disabledSeats || [];
      const deleted  = obj.deletedSeats  || [];
      const deletedTables = obj.deletedTables || [];
      for (let ti = 0; ti < totalTables; ti++) {
        if (deletedTables.includes(ti)) continue;
        for (let si = 0; si < spt; si++) {
          const posKey = `${ti}-${si}`;
          if (disabled.includes(posKey) || deleted.includes(posKey)) continue;
          all.push({ key: `${section}-${ti+1}-${si+1}`, section, categoryId: obj.categoryId });
        }
      }
    } else if (type === 'tableZone') {
      const section = obj.section || obj.label || obj.id || 'T';
      const seatCount = obj.seatCount || 6;
      const disabled = obj.disabledSeats || [];
      for (let i = 0; i < seatCount; i++) {
        if (disabled.includes(i)) continue;
        all.push({ key: `${section}-${i+1}`, section, categoryId: obj.categoryId });
      }
    }
  }
  return all;
}

const allSeats = computed(() => buildSeats(eventDetail.value?.chartObjects || []));

// ---- Stats ----
const stats = computed(() => {
  const total = allSeats.value.length;
  const booked = allSeats.value.filter(s => seatStatusMap.value[s.key] === 'booked').length;
  const hold   = allSeats.value.filter(s => seatStatusMap.value[s.key] === 'hold').length;
  const avail  = total - booked - hold;
  return { total, booked, hold, avail };
});

// Category stats
const categoryStats = computed(() => {
  const map = {};
  for (const s of allSeats.value) {
    const catId = s.categoryId || 'none';
    if (!map[catId]) map[catId] = { total: 0, booked: 0 };
    map[catId].total++;
    if (seatStatusMap.value[s.key] === 'booked') map[catId].booked++;
  }
  return map;
});

function catById(id) {
  return props.categories.find(c => c.id === id) || { color: '#9ca3af', name: 'Sans catégorie' };
}

// ---- Bulk status change (Status tab) ----
const selectedSeats = ref(new Set());
const updating = ref(false);

function toggleSeat(key) {
  if (selectedSeats.value.has(key)) selectedSeats.value.delete(key);
  else selectedSeats.value.add(key);
}
function selectAll()   { selectedSeats.value = new Set(allSeats.value.map(s => s.key)); }
function selectNone()  { selectedSeats.value = new Set(); }
function selectBooked() { selectedSeats.value = new Set(allSeats.value.filter(s => seatStatusMap.value[s.key] === 'booked').map(s => s.key)); }
function selectAvail()  { selectedSeats.value = new Set(allSeats.value.filter(s => (seatStatusMap.value[s.key] || 'available') === 'available').map(s => s.key)); }

async function applyStatus(status) {
  if (!selectedSeats.value.size || !selectedEvent.value) return;
  updating.value = true;
  try {
    await adminApi.bulkUpdateEventSeats(selectedEvent.value.id, [...selectedSeats.value], status);
    eventDetail.value = await adminApi.getEvent(selectedEvent.value.id);
    selectedSeats.value = new Set();
  } finally { updating.value = false; }
}

// ---- Split chartObjects by type for EventPlanView ----
function splitObjects(objects = []) {
  const zones = [], seatRows = [], freeZones = [], tableZones = [], tableSections = [];
  for (const o of objects) {
    if (o._type === 'zone')         zones.push(o);
    else if (o._type === 'seatRow')      seatRows.push(o);
    else if (o._type === 'freeZone')     freeZones.push(o);
    else if (o._type === 'tableZone')    tableZones.push(o);
    else if (o._type === 'tableSection') tableSections.push(o);
  }
  return { zones, seatRows, freeZones, tableZones, tableSections };
}
const planObjects = computed(() => splitObjects(eventDetail.value?.chartObjects || []));

// ---- Seats grouped by section ----
const seatsBySection = computed(() => {
  const groups = {};
  for (const seat of allSeats.value) {
    const section = seat.section || 'Autre';
    if (!groups[section]) groups[section] = [];
    const parts = seat.key.split('-');
    const shortKey = parts.slice(-2).join('-');
    groups[section].push({ ...seat, shortKey });
  }
  return groups;
});

// ---- Status color ----
function seatColor(key) {
  const status = seatStatusMap.value[key] || 'available';
  if (status === 'booked')    return '#22c55e';
  if (status === 'hold')      return '#f59e0b';
  if (status === 'canceled')  return '#ef4444';
  return '#e5e7eb';
}
function seatTextColor(key) {
  const status = seatStatusMap.value[key] || 'available';
  return (status === 'available') ? '#374151' : '#fff';
}
</script>

<template>
  <!-- ===== LIST VIEW ===== -->
  <div v-if="!selectedEvent" class="p-6 max-w-4xl">
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold text-gray-900">Événements</h2>
      <button @click="showCreate = !showCreate"
        class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition">
        + Créer un événement
      </button>
    </div>

    <!-- Create form -->
    <div v-if="showCreate" class="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl flex flex-col gap-3">
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
        <button @click="showCreate = false" class="px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm">
          Annuler
        </button>
      </div>
      <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
    </div>

    <!-- List -->
    <div v-if="loading" class="text-gray-400 text-sm">Chargement…</div>
    <div v-else-if="!events.length" class="text-gray-400 text-sm">Aucun événement.</div>
    <div v-else class="flex flex-col gap-3">
      <div v-for="ev in events" :key="ev.id"
        class="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-4 hover:shadow-sm transition">
        <!-- Mini plan thumbnail -->
        <PlanThumbnail
          v-if="ev.chartId && planObjectsMap[ev.chartId]?.length"
          :objects="planObjectsMap[ev.chartId]"
          :width="80" :height="56"
          class="shrink-0"
        />
        <div v-else class="w-20 h-14 shrink-0 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
        </div>
        <!-- Info -->
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-800 truncate">{{ ev.title }}</p>
          <p v-if="ev.chartName" class="text-xs text-indigo-500 mt-0.5 truncate">{{ ev.chartName }}</p>
          <p v-else class="text-xs text-gray-400 mt-0.5">Aucun plan associé</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button @click="openEvent(ev)"
            class="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition">
            Gérer
          </button>
          <button @click="deleteEvent(ev)"
            class="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 text-sm font-semibold transition">
            Supprimer
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- ===== DETAIL VIEW ===== -->
  <div v-else class="flex flex-col h-full">
    <!-- Header -->
    <div class="px-6 pt-4 pb-3 shrink-0 bg-gray-100 border-b border-gray-200">
      <div class="flex items-center gap-2 mb-3 text-sm">
        <button @click="backToList" class="flex items-center gap-1 text-indigo-600 hover:underline">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7"/>
          </svg>
          Événements
        </button>
        <span class="text-gray-400">/</span>
        <span class="font-semibold text-gray-800">{{ selectedEvent.title }}</span>
        <span v-if="selectedEvent.chartName" class="text-xs text-gray-400">— {{ selectedEvent.chartName }}</span>
      </div>
      <div class="flex gap-2">
        <button v-for="tab in ['summary','status','for-sale','categories','settings']" :key="tab"
          @click="activeTab = tab; selectedSeats = new Set()"
          class="px-4 py-2 rounded-lg text-sm font-semibold transition capitalize"
          :class="activeTab === tab ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'">
          {{ { summary: 'Résumé', status: 'Statuts', 'for-sale': 'Pour la vente', categories: 'Catégories', settings: 'Paramètres' }[tab] }}
        </button>
      </div>
    </div>

    <div v-if="detailLoading" class="flex-1 flex items-center justify-center text-gray-400">Chargement…</div>
    <div v-else-if="eventDetail" class="flex-1 min-h-0 p-4 flex flex-col">

      <!-- ===== SUMMARY ===== -->
      <div v-if="activeTab === 'summary'" class="flex flex-col gap-4 h-full min-h-0">
        <!-- Stats bar -->
        <div class="bg-white border border-gray-200 rounded-xl p-4 shrink-0">
          <div class="flex justify-between text-xs text-gray-500 mb-1">
            <span>{{ stats.booked }} réservés</span>
            <span>{{ stats.total }} places au total</span>
          </div>
          <div class="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full bg-green-500 rounded-full transition-all"
              :style="{ width: stats.total ? (stats.booked / stats.total * 100) + '%' : '0%' }"></div>
          </div>
          <div class="flex gap-4 mt-2 text-xs">
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>{{ stats.booked }} réservés</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>{{ stats.hold }} en attente</span>
            <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-gray-200 inline-block border border-gray-300"></span>{{ stats.avail }} disponibles</span>
            <span class="ml-auto text-gray-400">Identifiant : <span class="font-mono">{{ eventDetail.identifier }}</span></span>
          </div>
        </div>
        <!-- Plan -->
        <div class="flex-1 min-h-0">
          <EventPlanView
            :categories="categories"
            v-bind="planObjects"
            :seat-status-map="seatStatusMap"
            mode="view"
          />
        </div>
      </div>

      <!-- ===== STATUS ===== -->
      <div v-else-if="activeTab === 'status'" class="flex flex-col gap-3 h-full min-h-0">
        <div class="flex items-center gap-3 flex-wrap shrink-0">
          <span class="text-sm text-gray-600 font-medium">{{ selectedSeats.size }} siège(s) sélectionné(s)</span>
          <button @click="selectAll"    class="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50">Tout</button>
          <button @click="selectNone"   class="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50">Aucun</button>
          <button @click="selectBooked" class="text-xs px-2.5 py-1 rounded border border-green-200 text-green-700 hover:bg-green-50">Réservés</button>
          <button @click="selectAvail"  class="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50">Disponibles</button>
          <div class="ml-auto flex gap-2">
            <button :disabled="!selectedSeats.size || updating" @click="applyStatus('booked')"
              class="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-40">
              Marquer réservés
            </button>
            <button :disabled="!selectedSeats.size || updating" @click="applyStatus('available')"
              class="px-3 py-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold disabled:opacity-40">
              Marquer disponibles
            </button>
          </div>
        </div>
        <div class="flex-1 min-h-0">
          <EventPlanView
            :categories="categories"
            v-bind="planObjects"
            :seat-status-map="seatStatusMap"
            :selected-seats="selectedSeats"
            mode="select"
            @toggle-seat="toggleSeat"
          />
        </div>
        <p v-if="!allSeats.length" class="text-gray-400 text-sm shrink-0">Aucun siège — associez un plan à cet événement.</p>
      </div>

      <!-- ===== FOR SALE ===== -->
      <div v-else-if="activeTab === 'for-sale'" class="flex flex-col gap-3 h-full min-h-0">
        <div class="flex items-center gap-3 flex-wrap shrink-0">
          <span class="text-sm text-gray-600 font-medium">{{ selectedSeats.size }} siège(s) sélectionné(s)</span>
          <button @click="selectAll"  class="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50">Tout</button>
          <button @click="selectNone" class="text-xs px-2.5 py-1 rounded border border-gray-200 hover:bg-gray-50">Aucun</button>
          <div class="ml-auto flex gap-2">
            <button :disabled="!selectedSeats.size || updating" @click="applyStatus('available')"
              class="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-40">
              Mettre en vente
            </button>
            <button :disabled="!selectedSeats.size || updating" @click="applyStatus('canceled')"
              class="px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 text-sm font-semibold disabled:opacity-40">
              Retirer de la vente
            </button>
          </div>
        </div>
        <div class="flex-1 min-h-0">
          <EventPlanView
            :categories="categories"
            v-bind="planObjects"
            :seat-status-map="seatStatusMap"
            :selected-seats="selectedSeats"
            mode="select"
            @toggle-seat="toggleSeat"
          />
        </div>
      </div>

      <!-- ===== SETTINGS ===== -->
      <div v-else-if="activeTab === 'settings'" class="max-w-sm flex flex-col gap-4">
        <p class="text-sm text-gray-500">La durée d'expiration des sièges en attente est configurée dans les <router-link to="/settings" class="text-indigo-600 hover:underline">paramètres globaux</router-link>.</p>
      </div>

      <!-- ===== CATEGORIES ===== -->
      <div v-else-if="activeTab === 'categories'" class="max-w-xl flex flex-col gap-4">
        <div v-for="(stat, catId) in categoryStats" :key="catId"
          class="bg-white border border-gray-200 rounded-xl p-4">
          <div class="flex items-center gap-2 mb-2">
            <span class="w-3 h-3 rounded-full inline-block" :style="{ background: catById(catId).color }"></span>
            <span class="font-semibold text-gray-800 text-sm">{{ catById(catId).name }}</span>
            <span class="ml-auto text-xs text-gray-500">{{ stat.booked }} / {{ stat.total }}</span>
          </div>
          <div class="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all"
              :style="{ width: stat.total ? (stat.booked / stat.total * 100) + '%' : '0%', background: catById(catId).color }"></div>
          </div>
          <div class="flex justify-between text-[11px] text-gray-400 mt-1">
            <span>{{ stat.booked }} réservés</span>
            <span>{{ stat.total - stat.booked }} disponibles</span>
          </div>
        </div>
        <p v-if="!Object.keys(categoryStats).length" class="text-gray-400 text-sm">Aucune donnée.</p>
      </div>

    </div>
  </div>
</template>

