<script setup>
import { ref, onMounted, computed } from 'vue';
import { apiFetch } from '../services/auth.js';

const plans        = ref({});
const subscription = ref(null);
const subLoading   = ref(true);
const subError     = ref('');
const checkoutLoading = ref('');
const portalLoading   = ref(false);

async function loadSubscription() {
  subLoading.value = true;
  subError.value   = '';
  try {
    const r = await apiFetch('/api/billing/subscription');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    plans.value        = d.plans;
    subscription.value = d.subscription;
  } catch (e) {
    subError.value = e.message;
  } finally {
    subLoading.value = false;
  }
}

onMounted(loadSubscription);

async function subscribe(planKey) {
  checkoutLoading.value = planKey;
  try {
    const r = await apiFetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planKey,
        successUrl: window.location.origin + '/subscription?success=1',
        cancelUrl:  window.location.origin + '/subscription',
      }),
    });
    const d = await r.json();
    if (d.url === 'upgraded') {
      await loadSubscription();
    } else if (d.url) {
      window.location.href = d.url;
    } else {
      alert(d.error ?? 'Erreur inconnue');
    }
  } catch (e) {
    alert(e.message);
  } finally {
    checkoutLoading.value = '';
  }
}

async function changePlan(planKey) {
  if (!confirm(`Passer au plan ${planKey} ?`)) return;
  checkoutLoading.value = planKey;
  try {
    const r = await apiFetch('/api/billing/change-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planKey,
        successUrl: window.location.origin + '/subscription?success=1',
        cancelUrl:  window.location.origin + '/subscription',
      }),
    });
    const d = await r.json();
    if (!r.ok) { alert(d.error ?? 'Erreur'); return; }
    if (d.url && d.url !== window.location.origin + '/subscription?success=1') {
      window.location.href = d.url;
    } else {
      await loadSubscription();
    }
  } catch (e) {
    alert(e.message);
  } finally {
    checkoutLoading.value = '';
  }
}

async function openPortal() {
  portalLoading.value = true;
  try {
    const r = await apiFetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnUrl: window.location.href }),
    });
    const d = await r.json();
    if (d.url) window.location.href = d.url;
    else alert(d.error ?? 'Erreur');
  } catch (e) {
    alert(e.message);
  } finally {
    portalLoading.value = false;
  }
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const STATUS_LABELS = {
  active:   { label: 'Actif',     cls: 'bg-green-100 text-green-700' },
  trialing: { label: 'Essai',     cls: 'bg-blue-100 text-blue-700' },
  past_due: { label: 'En retard', cls: 'bg-red-100 text-red-700' },
  canceled: { label: 'Annulé',    cls: 'bg-gray-100 text-gray-500' },
};
function statusBadge(s) { return STATUS_LABELS[s] ?? { label: s, cls: 'bg-gray-100 text-gray-500' }; }

const currentPlanKey = computed(() => subscription.value?.plan ?? null);

const PLAN_META = {
  base: { price: null,  features: ['Sans abonnement fixe', '0,15 € / siège vendu', 'Facturation mensuelle', 'Idéal pour les événements ponctuels'] },
  plus: { price: 300,   features: ['2 500 sièges / an inclus', 'Surplus : 0,15 € / siège', 'Facturation annuelle'] },
  max:  { price: 575,   features: ['5 000 sièges / an inclus', 'Surplus : 0,15 € / siège', 'Facturation annuelle', 'Support prioritaire'] },
};

const planList = computed(() =>
  Object.entries(plans.value).map(([key, p]) => ({
    key,
    label:    p.label,
    quota:    p.annual_seat_quota,
    payPerUse: p.pay_per_use,
    price:    PLAN_META[key]?.price ?? null,
    features: PLAN_META[key]?.features ?? [],
    isCurrent: key === currentPlanKey.value,
  }))
);
</script>

<template>
  <div class="flex-1 overflow-auto p-6 bg-gray-50 min-h-0">

    <div class="mb-6">
      <h2 class="text-2xl font-bold text-gray-900">Abonnement</h2>
      <p class="text-sm text-gray-500 mt-0.5">Choisissez le plan adapté à votre activité</p>
    </div>

    <div v-if="subError" class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-6">
      {{ subError }}
    </div>

    <!-- Abonnement actuel -->
    <div v-if="!subLoading && subscription" class="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p class="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Abonnement actuel</p>
          <div class="flex items-center gap-3">
            <span class="text-xl font-bold text-gray-900">{{ subscription.planLabel }}</span>
            <span :class="statusBadge(subscription.status).cls"
              class="px-2.5 py-0.5 rounded-full text-xs font-semibold">
              {{ statusBadge(subscription.status).label }}
            </span>
          </div>
          <p class="text-sm text-gray-500 mt-1">
            {{ subscription.seats?.toLocaleString('fr-FR') }} sièges / mois
            · Renouvellement le {{ fmtDate(subscription.currentPeriodEnd) }}
          </p>
          <p v-if="subscription.cancelAtPeriodEnd" class="text-sm text-amber-600 mt-1 font-medium">
            ⚠ Annulation programmée en fin de période
          </p>
        </div>

        <div v-if="subscription.card" class="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
          <svg class="w-8 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 14" stroke-width="1.5">
            <rect x="1" y="1" width="22" height="12" rx="2" stroke="currentColor"/>
            <path d="M1 5h22" stroke="currentColor"/>
          </svg>
          <div class="text-sm">
            <p class="font-semibold text-gray-800 capitalize">{{ subscription.card.brand }} •••• {{ subscription.card.last4 }}</p>
            <p class="text-gray-500 text-xs">Expire {{ subscription.card.expMonth }}/{{ subscription.card.expYear }}</p>
          </div>
        </div>
      </div>

      <div class="mt-4">
        <button @click="openPortal" :disabled="portalLoading"
          class="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
          {{ portalLoading ? 'Chargement…' : 'Gérer la carte / annuler' }}
        </button>
      </div>
    </div>

    <!-- Grille des plans -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div v-if="subLoading" v-for="i in 3" :key="i"
        class="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse h-64" />

      <div v-else v-for="plan in planList" :key="plan.key"
        class="bg-white rounded-2xl border-2 p-6 flex flex-col transition"
        :class="plan.isCurrent
          ? 'border-indigo-500 shadow-md shadow-indigo-100'
          : 'border-gray-200 hover:border-gray-300'">

        <div class="flex items-center justify-between mb-2">
          <span class="text-base font-bold text-gray-900">{{ plan.label }}</span>
          <span v-if="plan.isCurrent"
            class="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
            Plan actuel
          </span>
        </div>

        <!-- Prix -->
        <div class="mb-3">
          <span v-if="plan.price" class="text-2xl font-extrabold text-gray-900">{{ plan.price }} €</span>
          <span v-if="plan.price" class="text-xs text-gray-400 ml-1">/ an</span>
          <span v-else class="text-2xl font-extrabold text-gray-900">0,15 €</span>
          <span v-if="!plan.price" class="text-xs text-gray-400 ml-1">/ siège vendu</span>
        </div>

        <p class="text-xs text-gray-500 mb-4">
          <span v-if="plan.payPerUse">Sans abonnement — payez uniquement ce que vous vendez</span>
          <span v-else>{{ plan.quota.toLocaleString('fr-FR') }} sièges / an prépayés</span>
        </p>

        <ul class="flex-1 space-y-2 mb-6">
          <li v-for="f in plan.features" :key="f"
            class="flex items-center gap-2 text-sm text-gray-600">
            <svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            {{ f }}
          </li>
        </ul>

        <button
          @click="subscription ? changePlan(plan.key) : subscribe(plan.key)"
          :disabled="plan.isCurrent || checkoutLoading === plan.key"
          class="w-full py-2.5 rounded-xl text-sm font-semibold transition"
          :class="plan.isCurrent
            ? 'bg-indigo-50 text-indigo-400 cursor-default'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60'"
        >
          <span v-if="checkoutLoading === plan.key">Chargement…</span>
          <span v-else-if="plan.isCurrent">Plan actuel</span>
          <span v-else-if="!subscription">Commencer</span>
          <span v-else>Activer ce plan</span>
        </button>
      </div>
    </div>

  </div>
</template>
