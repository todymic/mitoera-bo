<script setup>
import { ref, onMounted } from 'vue';
import { apiFetch } from '../services/auth.js';

const invoices        = ref([]);
const invoicesLoading = ref(true);
const invoicesError   = ref('');

async function loadInvoices() {
  invoicesLoading.value = true;
  invoicesError.value   = '';
  try {
    const r = await apiFetch('/api/billing/invoices');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    invoices.value = d.invoices;
  } catch (e) {
    invoicesError.value = e.message;
  } finally {
    invoicesLoading.value = false;
  }
}

onMounted(loadInvoices);

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtAmount(amount, currency) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
}

const STATUS_LABELS = {
  Paid: { label: 'Payé',     cls: 'bg-green-100 text-green-700' },
  paid: { label: 'Payé',     cls: 'bg-green-100 text-green-700' },
  open: { label: 'En cours', cls: 'bg-amber-100 text-amber-700' },
  void: { label: 'Annulée',  cls: 'bg-gray-100 text-gray-500' },
};
function statusBadge(s) { return STATUS_LABELS[s] ?? { label: s, cls: 'bg-gray-100 text-gray-500' }; }
</script>

<template>
  <div class="flex-1 overflow-auto p-6 bg-gray-50 min-h-0">

    <div class="mb-6">
      <h2 class="text-2xl font-bold text-gray-900">Facturation</h2>
      <p class="text-sm text-gray-500 mt-0.5">Historique de vos factures</p>
    </div>

    <div v-if="invoicesError" class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
      {{ invoicesError }}
    </div>

    <div class="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <template v-if="invoicesLoading">
        <div v-for="i in 4" :key="i" class="px-6 py-4 border-b border-gray-50 flex gap-4 animate-pulse">
          <div class="h-4 bg-gray-100 rounded w-24"></div>
          <div class="h-4 bg-gray-100 rounded w-32"></div>
          <div class="h-4 bg-gray-100 rounded w-20"></div>
          <div class="h-4 bg-gray-100 rounded w-16"></div>
        </div>
      </template>

      <template v-else-if="invoices.length === 0">
        <div class="px-6 py-16 text-center text-gray-400 text-sm">
          Aucune facture disponible
        </div>
      </template>

      <template v-else>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
            <tr>
              <th class="px-6 py-3 text-left font-medium">Date d'échéance</th>
              <th class="px-6 py-3 text-left font-medium">Numéro de facture</th>
              <th class="px-6 py-3 text-left font-medium">Montant</th>
              <th class="px-6 py-3 text-left font-medium">Statut</th>
              <th class="px-6 py-3 text-right font-medium w-10"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            <tr v-for="inv in invoices" :key="inv.id" class="hover:bg-gray-50 transition">
              <td class="px-6 py-4 text-gray-700">{{ fmtDate(inv.dueDate ?? inv.date) }}</td>
              <td class="px-6 py-4 font-mono text-gray-800">{{ inv.number ?? inv.id }}</td>
              <td class="px-6 py-4 font-semibold text-gray-900">{{ fmtAmount(inv.amount, inv.currency) }}</td>
              <td class="px-6 py-4">
                <span :class="statusBadge(inv.status).cls"
                  class="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold">
                  {{ statusBadge(inv.status).label }}
                </span>
              </td>
              <td class="px-6 py-4 text-right">
                <div class="relative group inline-block">
                  <button class="text-gray-400 hover:text-gray-700 px-2 py-1 rounded transition text-lg leading-none">···</button>
                  <div class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg
                              py-1 min-w-[160px] z-20 hidden group-focus-within:block group-hover:block">
                    <a v-if="inv.pdfUrl" :href="inv.pdfUrl" target="_blank"
                      class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Télécharger PDF
                    </a>
                    <a v-if="inv.hostedUrl" :href="inv.hostedUrl" target="_blank"
                      class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                      </svg>
                      Voir en ligne
                    </a>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>

  </div>
</template>
