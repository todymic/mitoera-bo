<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { apiFetch } from '../services/auth.js';

// ── state ─────────────────────────────────────────────────────────────────────
const loading       = ref(true);
const error         = ref('');
const monthly       = ref([]);
const byEvent       = ref([]);
const seatList      = ref([]);
const seatListEvent = ref(null); // { eventId, eventTitle }
const seatListLoading = ref(false);

const now          = new Date();
const selectedYear = ref(now.getFullYear());
const selectedMonth = ref(null); // null = all months of year
const viewMode     = ref('12m'); // '12m' | 'all'

const years = computed(() => {
  const set = new Set(monthly.value.map(r => r.year));
  set.add(now.getFullYear());
  return [...set].sort((a, b) => b - a);
});

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
                'Jui', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// ── api calls ─────────────────────────────────────────────────────────────────
async function api(path) {
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function loadAll() {
  loading.value = true;
  error.value = '';
  try {
    const [m, e] = await Promise.all([
      api('/api/reporting/seats/monthly'),
      api(`/api/reporting/seats/by-event?year=${selectedYear.value}${selectedMonth.value ? `&month=${selectedMonth.value}` : ''}`),
    ]);
    monthly.value = m.data;
    byEvent.value = e.data;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function loadEventSeats(event) {
  seatListEvent.value = event;
  seatList.value = [];
  seatListLoading.value = true;
  try {
    const d = await api(`/api/reporting/seats/event/${event.eventId}`);
    seatList.value = d.seats;
  } catch {
    seatList.value = [];
  } finally {
    seatListLoading.value = false;
  }
}

onMounted(loadAll);
watch([selectedYear, selectedMonth], loadAll);

// ── chart data ────────────────────────────────────────────────────────────────
const chartData = computed(() => {
  let rows = monthly.value;

  if (viewMode.value === '12m') {
    // last 12 months
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    rows = rows.filter(r => {
      const d = new Date(r.year, r.month - 1, 1);
      return d >= cutoff;
    });
  }

  // fill all months in range
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);
  const first  = sorted[0];
  const last   = sorted[sorted.length - 1];
  const map    = new Map(rows.map(r => [`${r.year}-${r.month}`, r.count]));
  const result = [];
  let y = first.year, m = first.month;
  while (y < last.year || (y === last.year && m <= last.month)) {
    result.push({ year: y, month: m, count: map.get(`${y}-${m}`) ?? 0 });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
});

const maxCount = computed(() => Math.max(...chartData.value.map(r => r.count), 1));

const totalDisplayed = computed(() => byEvent.value.reduce((s, e) => s + e.usedSeats, 0));

function fmtDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function selectBar(row) {
  selectedYear.value  = row.year;
  selectedMonth.value = row.month;
}
</script>

<template>
  <div class="flex-1 overflow-auto p-6 bg-gray-50 min-h-0">

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-2xl font-bold text-gray-900">Usage des sièges</h2>
        <p class="text-sm text-gray-500 mt-0.5">Sièges comptabilisés comme utilisés (hold ou booked)</p>
      </div>
    </div>

    <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
      {{ error }}
    </div>

    <!-- Skeleton -->
    <template v-if="loading">
      <div class="bg-white rounded-2xl border border-gray-200 h-56 animate-pulse mb-6" />
      <div class="bg-white rounded-2xl border border-gray-200 h-48 animate-pulse" />
    </template>

    <template v-else>

      <!-- ── Chart card ─────────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">

        <!-- Controls -->
        <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div class="flex items-center gap-2">
            <select v-model="selectedYear"
              class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option v-for="y in years" :key="y" :value="y">{{ y }}</option>
            </select>
            <select v-model="selectedMonth"
              class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option :value="null">Tous les mois</option>
              <option v-for="(m, i) in MONTHS" :key="i" :value="i+1">{{ m }}</option>
            </select>
          </div>
          <div class="flex rounded-lg overflow-hidden border border-gray-200 text-sm">
            <button @click="viewMode='12m'"
              :class="viewMode==='12m' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
              class="px-3 py-1.5 transition font-medium">12 derniers mois</button>
            <button @click="viewMode='all'"
              :class="viewMode==='all' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'"
              class="px-3 py-1.5 transition font-medium border-l border-gray-200">Tout</button>
          </div>
        </div>

        <!-- Bar chart -->
        <div v-if="chartData.length" class="relative">
          <!-- Y-axis hints -->
          <div class="flex flex-col justify-between absolute left-0 top-0 h-48 text-xs text-gray-400 text-right pr-2" style="width:36px">
            <span>{{ maxCount }}</span>
            <span>{{ Math.round(maxCount / 2) }}</span>
            <span>0</span>
          </div>
          <!-- Bars -->
          <div class="ml-10 flex items-end gap-1 h-48 border-b border-gray-100">
            <div v-for="row in chartData" :key="`${row.year}-${row.month}`"
              class="flex-1 flex flex-col items-center group cursor-pointer min-w-0"
              @click="selectBar(row)">
              <div class="relative w-full flex justify-center">
                <!-- Tooltip -->
                <div class="absolute bottom-full mb-1 bg-gray-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap
                            opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 -translate-x-1/2 left-1/2">
                  {{ MONTHS[row.month-1] }} {{ row.year }} — {{ row.count }} siège{{ row.count !== 1 ? 's' : '' }}
                </div>
                <div
                  class="w-full max-w-[28px] rounded-t-md transition-all duration-300 group-hover:opacity-80"
                  :class="row.count > 0 ? 'bg-indigo-500' : 'bg-gray-100'"
                  :style="{ height: `${Math.max(row.count / maxCount * 180, row.count > 0 ? 4 : 1)}px` }"
                />
              </div>
            </div>
          </div>
          <!-- X labels -->
          <div class="ml-10 flex gap-1 mt-1">
            <div v-for="row in chartData" :key="`lbl-${row.year}-${row.month}`"
              class="flex-1 text-center text-[10px] text-gray-400 truncate min-w-0">
              {{ MONTHS[row.month-1] }}
            </div>
          </div>
        </div>
        <div v-else class="h-48 flex items-center justify-center text-gray-400 text-sm">
          Aucune donnée pour cette période
        </div>

        <!-- Legend -->
        <div class="flex items-center gap-2 mt-4 text-xs text-gray-500">
          <span class="inline-block w-3 h-3 rounded-sm bg-indigo-500"></span>
          Sièges utilisés
        </div>
      </div>

      <!-- ── By-event table ──────────────────────────────────────────────── -->
      <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
        <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-gray-900">
              {{ totalDisplayed }} siège{{ totalDisplayed !== 1 ? 's' : '' }} utilisés
              <span class="font-normal text-gray-400 text-sm">
                — {{ selectedMonth ? `${MONTHS[selectedMonth-1]} ${selectedYear}` : String(selectedYear) }}
              </span>
            </h3>
          </div>
        </div>

        <div v-if="byEvent.length === 0" class="px-6 py-10 text-center text-sm text-gray-400">
          Aucun siège utilisé pour cette période
        </div>

        <table v-else class="w-full text-sm">
          <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th class="px-6 py-3 text-left font-medium">Événement</th>
              <th class="px-6 py-3 text-right font-medium">Sièges utilisés</th>
              <th class="px-6 py-3 text-right font-medium w-24"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <template v-for="ev in byEvent" :key="ev.eventId">
              <tr class="hover:bg-gray-50 transition">
                <td class="px-6 py-3 font-medium text-gray-800">{{ ev.eventTitle }}</td>
                <td class="px-6 py-3 text-right">
                  <span class="inline-flex items-center gap-1.5 font-semibold text-gray-900">
                    {{ ev.usedSeats }}
                    <span class="text-xs font-normal text-gray-400">siège{{ ev.usedSeats !== 1 ? 's' : '' }}</span>
                  </span>
                </td>
                <td class="px-6 py-3 text-right">
                  <button @click="seatListEvent?.eventId === ev.eventId ? seatListEvent = null : loadEventSeats(ev)"
                    class="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition">
                    {{ seatListEvent?.eventId === ev.eventId ? 'Masquer' : 'Détail →' }}
                  </button>
                </td>
              </tr>

              <!-- Inline seat list -->
              <tr v-if="seatListEvent?.eventId === ev.eventId" :key="`detail-${ev.eventId}`">
                <td colspan="3" class="px-6 py-4 bg-gray-50">
                  <div v-if="seatListLoading" class="text-xs text-gray-400">Chargement…</div>
                  <div v-else-if="seatList.length === 0" class="text-xs text-gray-400">Aucun siège trouvé</div>
                  <div v-else>
                    <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      {{ seatList.length }} siège{{ seatList.length !== 1 ? 's' : '' }}
                    </div>
                    <div class="overflow-auto max-h-64">
                      <table class="w-full text-xs">
                        <thead>
                          <tr class="text-gray-400">
                            <th class="text-left py-1 pr-4 font-medium">Siège</th>
                            <th class="text-left py-1 pr-4 font-medium">Raison</th>
                            <th class="text-left py-1 font-medium">Date d'utilisation</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100">
                          <tr v-for="s in seatList" :key="s.seatKey">
                            <td class="py-1.5 pr-4 font-mono text-gray-700">{{ s.seatKey }}</td>
                            <td class="py-1.5 pr-4">
                              <span :class="s.reason === 'booked'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'"
                                class="px-2 py-0.5 rounded-full font-semibold text-[11px]">
                                {{ s.reason === 'booked' ? 'Réservé' : 'Hold' }}
                              </span>
                            </td>
                            <td class="py-1.5 text-gray-500">{{ fmtDate(s.usedAt) }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>

    </template>
  </div>
</template>
