<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { formatPrice } from '../services/format';

const props = defineProps({
  categories: { type: Array, required: true },
  activeCategory: { type: String, default: null },
});

const emit = defineEmits(['toggle']);

const scrollerRef = ref(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function updateScrollState() {
  const el = scrollerRef.value;
  if (!el) return;
  canScrollLeft.value = el.scrollLeft > 1;
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

function scrollBy(direction) {
  const el = scrollerRef.value;
  if (!el) return;
  el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.7), behavior: 'smooth' });
}

let resizeObserver;

onMounted(() => {
  nextTick(updateScrollState);
  resizeObserver = new ResizeObserver(updateScrollState);
  if (scrollerRef.value) resizeObserver.observe(scrollerRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

watch(() => props.categories, () => nextTick(updateScrollState), { deep: true });
</script>

<template>
  <div class="sticky top-0 z-20 bg-white border-b border-gray-200">
    <div class="relative flex items-center">
      <button
        v-if="canScrollLeft"
        type="button"
        aria-label="Défiler vers la gauche"
        @click="scrollBy(-1)"
        class="absolute left-0 z-10 flex items-center justify-center h-full px-1.5 bg-gradient-to-r from-white via-white to-transparent"
      >
        <span class="flex items-center justify-center w-6 h-6 rounded-full border border-gray-200 bg-white shadow-sm text-gray-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </span>
      </button>

      <div
        ref="scrollerRef"
        @scroll="updateScrollState"
        class="flex gap-2 overflow-x-auto px-4 py-3 scroll-smooth"
      >
        <button
          v-for="c in categories"
          :key="c.id"
          @click="emit('toggle', c.id)"
          class="flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition shrink-0"
          :class="activeCategory === c.id ? 'border-current shadow-sm' : 'border-gray-200 text-gray-700'"
          :style="activeCategory === c.id ? { color: c.color } : {}"
        >
          <span class="w-3.5 h-3.5 rounded-sm" :style="{ background: c.color }"></span>
          {{ c.name }}
          <span class="font-normal text-gray-400">{{ formatPrice(c.price) }}</span>
        </button>
      </div>

      <button
        v-if="canScrollRight"
        type="button"
        aria-label="Défiler vers la droite"
        @click="scrollBy(1)"
        class="absolute right-0 z-10 flex items-center justify-center h-full px-1.5 bg-gradient-to-l from-white via-white to-transparent"
      >
        <span class="flex items-center justify-center w-6 h-6 rounded-full border border-gray-200 bg-white shadow-sm text-gray-600">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </button>
    </div>
  </div>
</template>
