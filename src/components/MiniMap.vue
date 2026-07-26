<script setup>
import { ref, computed, onUnmounted } from 'vue';

const props = defineProps({
  categories:     { type: Array,  required: true },
  zones:          { type: Array,  required: true },
  seatZones:      { type: Array,  required: true },
  contentWidth:   { type: Number, default: 1400 },
  contentHeight:  { type: Number, default: 660 },
  viewportPixelW: { type: Number, required: true },
  viewportPixelH: { type: Number, required: true },
  panX: { type: Number, required: true },
  panY: { type: Number, required: true },
  zoom: { type: Number, required: true },
});
const emit = defineEmits(['navigate']);

const MAP_W = 260;
const MAP_H = 140;
const mapBoxRef = ref(null);

function scaleX(v) { return (v / props.contentWidth)  * MAP_W; }
function scaleY(v) { return (v / props.contentHeight) * MAP_H; }
function catById(id) {
  return props.categories.find((c) => c.id === id) || { color: '#999999' };
}

const viewportRect = computed(() => {
  const worldW    = props.viewportPixelW / props.zoom;
  const worldH    = props.viewportPixelH / props.zoom;
  const worldLeft = -props.panX / props.zoom;
  const worldTop  = -props.panY / props.zoom;
  const l = Math.max(0,     scaleX(worldLeft));
  const t = Math.max(0,     scaleY(worldTop));
  const r = Math.min(MAP_W, scaleX(worldLeft + worldW));
  const b = Math.min(MAP_H, scaleY(worldTop  + worldH));
  const fullW = Math.max(2, r - l);
  const fullH = Math.max(2, b - t);
  // Cap display size to 40% of mini-map, centered on actual viewport center
  const displayW = Math.min(MAP_W * 0.4, fullW);
  const displayH = Math.min(MAP_H * 0.4, fullH);
  const cx = l + fullW / 2;
  const cy = t + fullH / 2;
  return { left: cx - displayW / 2, top: cy - displayH / 2, width: displayW, height: displayH };
});

// ---------- Drag ----------
let dragging = false;
// offset du curseur par rapport au centre du cadre (en px mini-carte)
let dragOffsetX = 0;
let dragOffsetY = 0;

function mapCoords(clientX, clientY) {
  const rect = mapBoxRef.value.getBoundingClientRect();
  return {
    mx: (clientX - rect.left),
    my: (clientY - rect.top),
  };
}

function emitFromMapCenter(cx, cy) {
  // cx, cy = centre du cadre en px mini-carte → world point → navigate
  const wx = Math.max(0, Math.min(props.contentWidth,  cx / MAP_W * props.contentWidth));
  const wy = Math.max(0, Math.min(props.contentHeight, cy / MAP_H * props.contentHeight));
  emit('navigate', { x: wx, y: wy });
}

function onWindowMove(ev) {
  if (!dragging) return;
  const { mx, my } = mapCoords(ev.clientX, ev.clientY);
  // Centre souhaité du cadre = position souris - offset initial
  emitFromMapCenter(mx - dragOffsetX, my - dragOffsetY);
}
function onWindowUp() {
  dragging = false;
  window.removeEventListener('pointermove', onWindowMove);
  window.removeEventListener('pointerup',   onWindowUp);
}

function onMapPointerDown(ev) {
  ev.preventDefault();
  ev.stopPropagation(); // empêche le viewport parent de démarrer un pan
  const { mx, my } = mapCoords(ev.clientX, ev.clientY);
  const vr = viewportRect.value;
  const boxCX = vr.left + vr.width  / 2;
  const boxCY = vr.top  + vr.height / 2;

  if (mx >= vr.left && mx <= vr.left + vr.width &&
      my >= vr.top  && my <= vr.top  + vr.height) {
    // Clic SUR le cadre → drag avec offset conservé
    dragOffsetX = mx - boxCX;
    dragOffsetY = my - boxCY;
  } else {
    // Clic EN DEHORS → on centre directement le cadre sur la souris
    dragOffsetX = 0;
    dragOffsetY = 0;
    emitFromMapCenter(mx, my);
  }

  dragging = true;
  window.addEventListener('pointermove', onWindowMove);
  window.addEventListener('pointerup',   onWindowUp);
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onWindowMove);
  window.removeEventListener('pointerup',   onWindowUp);
});
</script>

<template>
  <div class="absolute bottom-3 right-3 bg-white/95 backdrop-blur border border-gray-200 rounded-xl shadow-lg p-2 select-none">
    <p class="text-[9px] font-bold text-gray-400 tracking-wide mb-1 px-0.5">VUE D'ENSEMBLE</p>
    <div
      ref="mapBoxRef"
      class="relative bg-[#EBEFF5] rounded-md overflow-hidden"
      :style="{ width: MAP_W + 'px', height: MAP_H + 'px' }"
      @pointerdown="onMapPointerDown"
    >
      <div v-for="z in zones" :key="'mz-' + z.id" class="absolute rounded-sm pointer-events-none"
        :style="{
          left: scaleX(z.left) + 'px', top: scaleY(z.top) + 'px',
          width: Math.max(2, scaleX(z.width)) + 'px', height: Math.max(2, scaleY(z.height)) + 'px',
          background: catById(z.categoryId).color,
        }"
      ></div>
      <div v-for="sz in seatZones" :key="'msz-' + sz.id" class="absolute rounded-sm pointer-events-none"
        :style="{
          left: scaleX(sz.left) + 'px', top: scaleY(sz.top) + 'px',
          width: Math.max(2, scaleX(sz.cols * (sz.seatSize + 4))) + 'px',
          height: Math.max(2, scaleY(sz.rows * (sz.seatSize + 4))) + 'px',
          background: catById(sz.categoryId).color,
        }"
      ></div>

      <!-- Cadre rouge draggable -->
      <div
        class="absolute border border-red-500 bg-red-500/10 rounded-[2px] pointer-events-none"
        :style="{
          left:   viewportRect.left   + 'px',
          top:    viewportRect.top    + 'px',
          width:  viewportRect.width  + 'px',
          height: viewportRect.height + 'px',
          cursor: 'grab',
        }"
      ></div>

      <!-- Curseur adapté selon position souris -->
      <div class="absolute inset-0" style="cursor: crosshair;"></div>
    </div>
  </div>
</template>
