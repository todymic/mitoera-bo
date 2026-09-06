<script setup>
import { ref, reactive, computed, onMounted, nextTick, watch } from 'vue';
import { computeSeatLabel, computeAxisLabel } from '../../services/seatLabel';
import { iconById, patternStyle } from '../../services/icons';
import MiniMap from '../../components/MiniMap.vue';

const props = defineProps({
  categories: { type: Array, required: true },
  zones:      { type: Array, required: true },
  seatRows:   { type: Array, required: true },
  freeZones:  { type: Array, default: () => [] },
  tableZones:    { type: Array, default: () => [] },
  tableSections: { type: Array, default: () => [] },
});

function tableZoneSize(t) {
  return (t.tableSize || 30) + 2 * (t.seatSize || 15) + 16;
}
const TS_PAD = 4;
function tableSectionUnitSize(ts) {
  return (ts.tableSize || 30) + 2 * (ts.seatSize || 15) + 16;
}
function tableSectionWidth(ts) {
  const unit = tableSectionUnitSize(ts);
  return (ts.tableCount || 3) * unit + ((ts.tableCount || 3) - 1) * (ts.tableSpacing ?? 2) + 2 * TS_PAD;
}
function tableSectionHeight(ts) {
  const rows = ts.tableRows || 1;
  const unit = tableSectionUnitSize(ts);
  return rows * unit + (rows - 1) * (ts.tableSpacing ?? 2) + 2 * TS_PAD;
}
function buildTableSectionSeats(ts) {
  const section = ts.section || ts.label || ts.id;
  const disabled = ts.disabledSeats || [];
  const deleted  = ts.deletedSeats  || [];
  const totalTables = (ts.tableCount || 3) * (ts.tableRows || 1);
  const seats = [];
  for (let ti = 0; ti < totalTables; ti++) {
    for (let si = 0; si < (ts.seatsPerTable || 6); si++) {
      const posKey = `${ti}-${si}`;
      const isDeleted  = deleted.includes(posKey);
      const isDisabled = !isDeleted && disabled.includes(posKey);
      seats.push({
        tableIndex: ti, seatIndex: si,
        id: `${section}-${ti + 1}-${si + 1}`,
        label: String(si + 1),
        rowLabel: `T${ti + 1}`, colLabel: String(si + 1),
        section,
        categoryId: ts.categoryId,
        status: isDeleted ? 'deleted' : isDisabled ? 'disabled' : 'available',
      });
    }
  }
  return seats;
}

function buildTableSeats(t) {
  const section = t.section || t.label || t.id;
  const disabled = t.disabledSeats || [];
  return Array.from({ length: t.seatCount || 6 }, (_, i) => ({
    index: i,
    id: `${section}-${i + 1}`,
    label: String(i + 1),
    rowLabel: '—',
    colLabel: String(i + 1),
    section,
    categoryId: t.categoryId,
    status: disabled.includes(i) ? 'disabled' : 'available',
  }));
}

// ---- Tooltip hover ----
const hoveredSeat = ref(null);
function onSeatHover(ev, row, seat) {
  if (seat.status === 'disabled') { hoveredSeat.value = null; return; }
  hoveredSeat.value = { seat, row, x: ev.clientX, y: ev.clientY };
}
function onSeatLeave() { hoveredSeat.value = null; }

function catById(id) {
  return props.categories.find((c) => c.id === id) || { color: '#999999', name: '—' };
}

function buildSeats(row) {
  const seats = [];
  const disabled  = row.disabledSeats    || [];
  const deleted   = row.deletedSeats     || [];
  const catOver   = row.categoryOverrides || {};
  const rowOver   = row.rowOverrides     || {};
  const section   = row.section || row.label || row.id;
  for (let r = 0; r < row.rows; r++) {
    const rOver      = rowOver[r] || {};
    const cols       = rOver.cols      != null ? rOver.cols      : row.cols;
    const colStartAt = rOver.colStartAt != null ? rOver.colStartAt : 0;
    const rowLabel   = rOver.label     != null ? rOver.label     : computeAxisLabel(r, row.rows, row.rowFormat, row.rowDirection);
    for (let c = 0; c < cols; c++) {
      const posKey    = `${r}-${c}`;
      const isDeleted  = deleted.includes(posKey);
      const isDisabled = !isDeleted && disabled.includes(posKey);
      const colLabel   = computeAxisLabel(c, cols, row.colFormat, row.colDirection, colStartAt);
      seats.push({
        id: `${section}-${rowLabel}-${colLabel}`,
        posKey, r, c, cols,
        label: `${rowLabel}${colLabel}`,
        rowLabel, colLabel, section,
        categoryId: catOver[posKey] || row.categoryId,
        status: isDeleted ? 'deleted' : isDisabled ? 'disabled' : 'available',
      });
    }
  }
  return seats;
}

function buildSeatsByRow(row) {
  const all = buildSeats(row);
  const order = (row.rowOrder?.length === row.rows) ? row.rowOrder : Array.from({ length: row.rows }, (_, i) => i);
  return order.map((dataR) => {
    const rOver = (row.rowOverrides || {})[dataR] || {};
    const colOffset = rOver.colOffset ?? 0;
    const placeholders = Array.from({ length: colOffset }, (_, i) => ({ id: `ph-${dataR}-${i}`, status: 'placeholder' }));
    const rowLabel = rOver.label != null
      ? rOver.label
      : computeAxisLabel(dataR, row.rows, row.rowFormat, row.rowDirection);
    return { r: dataR, rowLabel, seats: [...placeholders, ...all.filter((s) => s.r === dataR)] };
  });
}

// ---- Canvas dynamic size ----
const CANVAS_PAD = 150;
const canvasWidth = computed(() => {
  let max = 900;
  for (const z of props.zones)     max = Math.max(max, (z.left || 0) + (z.width  || 200) + CANVAS_PAD);
  for (const r of props.seatRows)  max = Math.max(max, (r.left || 0) + (r.cols || 1) * ((r.shape === 'rounded' ? (r.seatSize || 22) * 1.5 : (r.seatSize || 22)) + 4) + 28 + CANVAS_PAD);
  for (const f of props.freeZones) max = Math.max(max, (f.left || 0) + (f.width || 100) + CANVAS_PAD);
  for (const t of props.tableZones) max = Math.max(max, (t.left || 0) + tableZoneSize(t) + CANVAS_PAD);
  for (const ts of props.tableSections) max = Math.max(max, (ts.left || 0) + tableSectionWidth(ts) + CANVAS_PAD); // width already includes TS_PAD
  return max;
});
const canvasHeight = computed(() => {
  let max = 600;
  for (const z of props.zones)     max = Math.max(max, (z.top || 0) + (z.height || 70)  + CANVAS_PAD);
  for (const r of props.seatRows)  max = Math.max(max, (r.top || 0) + (r.rows || 1) * ((r.seatSize || 22) + 4) + 30 + CANVAS_PAD);
  for (const f of props.freeZones) max = Math.max(max, (f.top || 0) + (f.height || 50) + CANVAS_PAD);
  for (const t of props.tableZones) max = Math.max(max, (t.top || 0) + tableZoneSize(t) + CANVAS_PAD);
  for (const ts of props.tableSections) max = Math.max(max, (ts.top || 0) + tableSectionHeight(ts) + CANVAS_PAD); // height includes tableRows
  return max;
});

// ---- Zoom / pan (translate libre) ----
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.15;
const zoom = ref(1);
const panX = ref(40);
const panY = ref(40);
const viewportEl = ref(null);
const viewport = reactive({ left: 0, top: 0, width: 900, height: 500 });
const panning = reactive({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

function updateViewport() {
  const el = viewportEl.value;
  if (!el) return;
  viewport.left   = -panX.value / zoom.value;
  viewport.top    = -panY.value / zoom.value;
  viewport.width  = el.clientWidth  / zoom.value;
  viewport.height = el.clientHeight / zoom.value;
}

function setZoom(next) {
  const el = viewportEl.value;
  const prev = zoom.value;
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  if (!el) { zoom.value = clamped; return; }
  const rect = el.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  panX.value = cx - (cx - panX.value) * (clamped / prev);
  panY.value = cy - (cy - panY.value) * (clamped / prev);
  zoom.value = clamped;
  updateViewport();
}
function zoomIn()    { setZoom(zoom.value + ZOOM_STEP); }
function zoomOut()   { setZoom(zoom.value - ZOOM_STEP); }
function zoomReset() { fitToView(); }


function startPan(ev) {
  if (ev.button !== 0) return;
  panning.active = true;
  panning.startX = ev.clientX; panning.startY = ev.clientY;
  panning.originX = panX.value; panning.originY = panY.value;
  ev.target.setPointerCapture(ev.pointerId);
  window.addEventListener('pointermove', onPan);
  window.addEventListener('pointerup', stopPan);
  window.addEventListener('pointercancel', stopPan);
}
function onPan(ev) {
  if (!panning.active) return;
  panX.value = panning.originX + (ev.clientX - panning.startX);
  panY.value = panning.originY + (ev.clientY - panning.startY);
  updateViewport();
}
function stopPan() {
  panning.active = false;
  window.removeEventListener('pointermove', onPan);
  window.removeEventListener('pointerup', stopPan);
  window.removeEventListener('pointercancel', stopPan);
}

function navigateTo({ x, y }) {
  const el = viewportEl.value;
  if (!el) return;
  panX.value = el.clientWidth  / 2 - x * zoom.value;
  panY.value = el.clientHeight / 2 - y * zoom.value;
  updateViewport();
}

// Seat interactions disabled — preview is display-only

const LOD_THRESHOLD = 0.5;
const isLod = computed(() => zoom.value < LOD_THRESHOLD);

function contentBounds() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (l, t, w, h) => {
    minX = Math.min(minX, l); minY = Math.min(minY, t);
    maxX = Math.max(maxX, l + w); maxY = Math.max(maxY, t + h);
  };
  for (const z  of props.zones)         add(z.left||0, z.top||0, z.width||200, z.height||70);
  for (const r  of props.seatRows)      add(r.left||0, r.top||0, (r.cols||1)*((r.seatSize||22)+4)+28, (r.rows||1)*((r.seatSize||22)+4)+30);
  for (const f  of props.freeZones)     add(f.left||0, f.top||0, f.width||100, f.height||50);
  for (const t  of props.tableZones)    add(t.left||0, t.top||0, tableZoneSize(t), tableZoneSize(t));
  for (const ts of props.tableSections) add(ts.left||0, ts.top||0, tableSectionWidth(ts), tableSectionHeight(ts));
  if (minX === Infinity) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function fitToView() {
  const el = viewportEl.value;
  if (!el) return;
  const b = contentBounds();
  if (!b) return;
  const pad = 32;
  const vw = el.clientWidth;
  const vh = el.clientHeight;
  const z = Math.min((vw - pad * 2) / b.w, (vh - pad * 2) / b.h, 1);
  zoom.value = Math.max(ZOOM_MIN, z);
  panX.value = (vw - b.w * zoom.value) / 2 - b.x * zoom.value;
  panY.value = (vh - b.h * zoom.value) / 2 - b.y * zoom.value;
  updateViewport();
}

let _animRaf = null;
function zoomIntoSection(ev) {
  if (!isLod.value) return;
  const el = viewportEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const worldX = (ev.clientX - rect.left - panX.value) / zoom.value;
  const worldY = (ev.clientY - rect.top  - panY.value) / zoom.value;
  const targetZoom = Math.min(1, zoom.value * 3);
  const targetPanX = el.clientWidth  / 2 - worldX * targetZoom;
  const targetPanY = el.clientHeight / 2 - worldY * targetZoom;

  const startZoom = zoom.value;
  const startPanX = panX.value;
  const startPanY = panY.value;
  const duration = 400; // ms
  const startTime = performance.now();

  if (_animRaf) cancelAnimationFrame(_animRaf);

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const e = easeInOutCubic(t);
    zoom.value = startZoom + (targetZoom - startZoom) * e;
    panX.value = startPanX + (targetPanX - startPanX) * e;
    panY.value = startPanY + (targetPanY - startPanY) * e;
    updateViewport();
    if (t < 1) _animRaf = requestAnimationFrame(step);
  }

  _animRaf = requestAnimationFrame(step);
}

onMounted(() => { nextTick(fitToView); });
watch(zoom, () => nextTick(updateViewport));
watch(
  [() => props.zones, () => props.seatRows, () => props.freeZones, () => props.tableZones, () => props.tableSections],
  () => { nextTick(fitToView); },
  { once: true },
);
</script>

<template>
  <div class="bg-white rounded-2xl shadow-sm p-5 flex flex-col min-h-0 h-full">
    <div class="mb-1 shrink-0">
      <h3 class="font-bold text-gray-800">Aperçu du plan</h3>
    </div>
    <p class="text-xs text-gray-400 mb-3 shrink-0">Rendu identique à ce que verra le client. Survolez un siège pour les infos, cliquez pour le sélectionner.</p>

    <div class="flex gap-4 flex-1 min-h-0 overflow-hidden">
      <!-- Canvas -->
      <div
        ref="viewportEl"
        class="overflow-hidden flex-1 min-w-0 rounded-xl relative bg-gray-400"
        :class="panning.active ? 'cursor-grabbing' : 'cursor-grab'"
        style="touch-action: none;"
        @pointerdown="startPan"
      >
        <!-- Zoom overlay — bas droite -->
        <div class="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm rounded-lg shadow p-0.5 pointer-events-auto">
          <button @click.stop="zoomOut"   class="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md text-lg font-bold transition">−</button>
          <button @click.stop="zoomReset" class="px-2 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-md text-xs font-semibold transition min-w-[44px]">{{ Math.round(zoom * 100) }}%</button>
          <button @click.stop="zoomIn"    class="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md text-lg font-bold transition">+</button>
        </div>

          <div
            class="absolute plan-canvas shadow-xl"
            :style="{ width: canvasWidth + 'px', height: canvasHeight + 'px', transform: `translate(${panX}px, ${panY}px) scale(${zoom})`, transformOrigin: '0 0' }"
          >

            <!-- Zones génériques -->
            <div
              v-for="z in zones" :key="z.id"
              class="absolute rounded-lg border flex flex-col items-center justify-center text-center px-2 select-none"
              :class="z.shape === 'pill' ? 'rounded-full' : ''"
              :style="{
                top: z.top + 'px', left: z.left + 'px', width: z.width + 'px', height: z.height + 'px',
                background: catById(z.categoryId).color + '14',
                borderColor: catById(z.categoryId).color + '55',
              }"
            >
              <p class="font-bold" :style="{ color: catById(z.categoryId).color, fontSize: (z.labelFontSize || 11) + 'px' }">{{ z.label }}</p>
              <p class="text-gray-400" :style="{ fontSize: Math.max(8, (z.labelFontSize || 11) - 2) + 'px' }">{{ z.capacity }} places</p>
            </div>

            <!-- Zones libres -->
            <div
              v-for="fz in freeZones" :key="fz.id"
              class="absolute rounded-lg flex flex-col items-center justify-center text-center gap-0.5 select-none pointer-events-none"
              :style="{
                top: fz.top + 'px', left: fz.left + 'px', width: fz.width + 'px', height: fz.height + 'px',
                background: fz.color,
                border: `1px solid ${fz.color}40`,
              }"
            >
              <span v-if="iconById(fz.icon).emoji" style="line-height:1" :style="{ fontSize: (fz.iconSize || Math.max(12, fz.height * 0.32)) + 'px' }">{{ iconById(fz.icon).emoji }}</span>
              <span class="font-bold uppercase tracking-wide" :style="{ color: fz.textColor || '#000000', fontSize: (fz.labelFontSize || 10) + 'px' }">{{ fz.label }}</span>
            </div>

            <!-- Tables rondes -->
            <div
              v-for="t in tableZones" :key="t.id"
              class="absolute select-none"
              :style="{
                top: t.top + 'px', left: t.left + 'px',
                width: tableZoneSize(t) + 'px', height: tableZoneSize(t) + 'px',
                zIndex: t.zIndex || 1,
                transform: `rotate(${t.rotation || 0}deg)`,
              }"
            >
              <template v-for="seat in buildTableSeats(t)" :key="seat.index">
                <div
                  class="absolute flex items-center justify-center text-white font-bold rounded-full cursor-default"
                  :style="{
                    width: (t.seatSize || 15) + 'px', height: (t.seatSize || 15) + 'px',
                    fontSize: (t.seatLabelFontSize || 9) + 'px',
                    background: seat.status === 'disabled' ? '#eef0f2' : catById(t.categoryId).color,
                    border: seat.status === 'disabled' ? '1px solid #d8dade' : 'none',
                    color: seat.status === 'disabled' ? '#9ca3af' : '#fff',
                    left: (tableZoneSize(t) / 2 + ((t.tableSize || 30) / 2 + (t.seatSize || 15) / 2) * Math.cos((2 * Math.PI * seat.index) / (t.seatCount || 6) - Math.PI / 2) - (t.seatSize || 15) / 2) + 'px',
                    top:  (tableZoneSize(t) / 2 + ((t.tableSize || 30) / 2 + (t.seatSize || 15) / 2) * Math.sin((2 * Math.PI * seat.index) / (t.seatCount || 6) - Math.PI / 2) - (t.seatSize || 15) / 2) + 'px',
                  }"
                  @mouseenter="onSeatHover($event, t, seat)"
                  @mouseleave="onSeatLeave"
                >{{ seat.label }}</div>
              </template>
              <div
                class="absolute rounded-full flex items-center justify-center"
                :style="{
                  width: (t.tableSize || 30) + 'px', height: (t.tableSize || 30) + 'px',
                  left: (tableZoneSize(t) - (t.tableSize || 30)) / 2 + 'px',
                  top:  (tableZoneSize(t) - (t.tableSize || 30)) / 2 + 'px',
                  background: catById(t.categoryId).color + '22',
                  border: `2px solid ${catById(t.categoryId).color}88`,
                }"
              >
                <span class="font-bold text-center leading-tight"
                  :style="{ color: catById(t.categoryId).color, fontSize: (t.tableLabelFontSize || 13) + 'px' }">
                  {{ t.section || catById(t.categoryId).name }}
                </span>
              </div>
            </div>

            <!-- Blocs de sièges -->
            <div
              v-for="row in seatRows" :key="row.id"
              class="absolute seat-block select-none"
              :class="isLod ? 'cursor-zoom-in' : ''"
              :style="{ top: row.top + 'px', left: row.left + 'px', transform: `rotate(${row.rotation || 0}deg)` }"
              @click="zoomIntoSection($event)"
            >
              <!-- Badge LOD centré (visible seulement en vue dézoomée) -->
              <div v-if="isLod" class="row-badge row-badge--lod"
                :style="{
                  color: catById(row.categoryId).color,
                  borderColor: catById(row.categoryId).color + '55',
                  fontSize: (row.rowLabelFontSize || 10) + 'px',
                }">
                {{ row.section || catById(row.categoryId).name }}
              </div>
              <div :class="row.isGroup ? '' : 'seat-block-card'"
                :style="{
                  background: row.isGroup ? 'transparent' : catById(row.categoryId).color + '14',
                  borderColor: row.isGroup ? 'transparent' : catById(row.categoryId).color + '55',
                }">
                <!-- Rendu rangée par rangée pour respecter les overrides par rangée -->
                <div :class="isLod ? 'lod-blur' : ''" class="flex flex-col gap-1.5">
                  <template v-for="rowGroup in buildSeatsByRow(row)" :key="rowGroup.r">
                    <div class="flex gap-1.5" style="align-items:center;">
                      <!-- Libellé de rangée GAUCHE — dans le flux, comme dans l'éditeur :
                           c'est ce décalage de 16px + 6px qui doit être reproduit ici,
                           sinon les sièges ne tombent pas au même endroit que sur le plan. -->
                      <div v-if="!row.isGroup && (row.seatSize || 22) >= 12"
                        class="shrink-0 flex items-center justify-end font-bold leading-none select-none"
                        :style="{
                          width: '16px', opacity: 0.6,
                          fontSize: Math.max(7, Math.floor((row.seatSize || 22) * 0.45)) + 'px',
                          color: catById(row.categoryId).color,
                        }">{{ rowGroup.rowLabel }}</div>
                      <div
                        v-for="seat in rowGroup.seats" :key="seat.id"
                        class="seat flex items-center justify-center leading-none font-semibold cursor-default"
                        :class="[
                          seat.status === 'disabled' ? 'seat-disabled' : '',
                          row.shape === 'rounded' ? 'seat-rounded' : '',
                        ]"
                        :style="{
                          height: (row.seatSize || 22) + 'px',
                          minWidth: row.shape === 'rounded' ? ((row.seatSize || 22) * 1.5) + 'px' : (row.seatSize || 22) + 'px',
                          padding: row.shape === 'rounded' ? '0 6px' : '0',
                          borderRadius: row.shape === 'round' ? '50%' : row.shape === 'rounded' ? '10px' : '4px',
                          visibility: (seat.status === 'deleted' || seat.status === 'placeholder') ? 'hidden' : 'visible',
                          color: seat.status === 'disabled' ? '#9ca3af' : '#fff',
                          background: seat.status === 'disabled' ? '#eef0f2' : (seat.categoryId ? catById(seat.categoryId).color : 'transparent'),
                          border: seat.status === 'disabled' ? '1px solid #d8dade' : 'none',
                        }"
                        @mouseenter="seat.status !== 'deleted' && seat.status !== 'placeholder' && onSeatHover($event, row, seat)"
                        @mouseleave="onSeatLeave"
                      ></div>
                      <!-- Libellé de rangée DROITE — dans le flux également -->
                      <div v-if="!row.isGroup && (row.seatSize || 22) >= 12"
                        class="shrink-0 flex items-center justify-start font-bold leading-none select-none"
                        :style="{
                          width: '16px', opacity: 0.6,
                          fontSize: Math.max(7, Math.floor((row.seatSize || 22) * 0.45)) + 'px',
                          color: catById(row.categoryId).color,
                        }">{{ rowGroup.rowLabel }}</div>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- Sections de tables -->
            <div
              v-for="ts in tableSections" :key="ts.id"
              class="absolute select-none"
              :class="isLod ? 'cursor-zoom-in' : ''"
              :style="{
                top: ts.top + 'px', left: ts.left + 'px',
                width: tableSectionWidth(ts) + 'px',
                height: tableSectionHeight(ts) + 'px',
                zIndex: ts.zIndex || 1,
                background: catById(ts.categoryId).color + '14',
                border: `1px solid ${catById(ts.categoryId).color}55`,
                borderRadius: '10px',
                transform: `rotate(${ts.rotation || 0}deg)`,
              }"
              @click="zoomIntoSection($event)"
            >
              <!-- LOD: centered section badge -->
              <div v-if="isLod"
                class="lod-section-badge"
                :style="{
                  color: catById(ts.categoryId).color,
                  borderColor: catById(ts.categoryId).color + '55',
                  fontSize: (ts.rowLabelFontSize || 10) + 'px',
                }"
              >{{ ts.section || catById(ts.categoryId).name }}</div>

              <!-- Seats & tables (blurred in LOD) -->
              <div :class="isLod ? 'lod-blur' : ''">
                <template v-for="ri in (ts.tableRows || 1)" :key="'r' + ri">
                  <template v-for="ci in (ts.tableCount || 3)" :key="'r' + ri + 'c' + ci">
                  <template v-if="!(ts.deletedTables || []).includes((ri - 1) * (ts.tableCount || 3) + (ci - 1))">
                    <template v-for="seat in buildTableSectionSeats(ts).filter(s => s.tableIndex === (ri - 1) * (ts.tableCount || 3) + (ci - 1))" :key="seat.tableIndex + '-' + seat.seatIndex">
                      <div
                        v-if="seat.status !== 'deleted'"
                        class="absolute flex items-center justify-center text-white font-bold rounded-full cursor-default"
                        :style="{
                          width: (ts.seatSize || 15) + 'px', height: (ts.seatSize || 15) + 'px',
                          fontSize: (ts.seatLabelFontSize || 9) + 'px',
                          background: seat.status === 'disabled' ? '#eef0f2' : catById(ts.categoryId).color,
                          border: seat.status === 'disabled' ? '1px solid #d8dade' : 'none',
                          color: seat.status === 'disabled' ? '#9ca3af' : '#fff',
                          left: (TS_PAD + (ci - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + tableSectionUnitSize(ts) / 2 + ((ts.tableSize || 30) / 2 + (ts.seatSize || 15) / 2) * Math.cos((2 * Math.PI * seat.seatIndex) / (ts.seatsPerTable || 6) - Math.PI / 2) - (ts.seatSize || 15) / 2) + 'px',
                          top:  (TS_PAD + (ri - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + tableSectionUnitSize(ts) / 2 + ((ts.tableSize || 30) / 2 + (ts.seatSize || 15) / 2) * Math.sin((2 * Math.PI * seat.seatIndex) / (ts.seatsPerTable || 6) - Math.PI / 2) - (ts.seatSize || 15) / 2) + 'px',
                        }"
                        @mouseenter="onSeatHover($event, ts, seat)"
                        @mouseleave="onSeatLeave"
                      >{{ seat.label }}</div>
                    </template>
                    <div
                      class="absolute rounded-full flex items-center justify-center pointer-events-none"
                      :style="{
                        width: (ts.tableSize || 30) + 'px', height: (ts.tableSize || 30) + 'px',
                        left: (TS_PAD + (ci - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + (tableSectionUnitSize(ts) - (ts.tableSize || 30)) / 2) + 'px',
                        top:  (TS_PAD + (ri - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + (tableSectionUnitSize(ts) - (ts.tableSize || 30)) / 2) + 'px',
                        background: catById(ts.categoryId).color + '22',
                        border: `2px solid ${catById(ts.categoryId).color}88`,
                      }"
                    >
                      <span class="font-bold leading-tight pointer-events-none"
                        :style="{ color: catById(ts.categoryId).color, fontSize: (ts.tableLabelFontSize || 13) + 'px' }">
                        T{{ (ri - 1) * (ts.tableCount || 3) + ci }}
                      </span>
                    </div>
                  </template><!-- /v-if deletedTables -->
                  </template>
                </template>
              </div>
            </div>

            <div v-if="zones.length === 0 && seatRows.length === 0 && freeZones.length === 0 && tableZones.length === 0 && tableSections.length === 0"
              class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
              Aucun élément défini pour ce plan.
            </div>
          </div>

        <!-- Mini-plan (affiché seulement si zoom > 100%) -->
        <MiniMap
          v-if="zoom > 1"
          :categories="categories"
          :zones="zones"
          :seat-zones="seatRows"
          :content-width="canvasWidth"
          :content-height="canvasHeight"
          :pan-x="panX"
          :pan-y="panY"
          :zoom="zoom"
          :viewport-pixel-w="viewportEl ? viewportEl.clientWidth : 900"
          :viewport-pixel-h="viewportEl ? viewportEl.clientHeight : 500"
          @navigate="navigateTo"
        />
      </div>

    </div>
  </div>

  <!-- Tooltip hover siège -->
  <Teleport to="body">
    <div
      v-if="hoveredSeat"
      class="fixed z-50 pointer-events-none shadow-xl rounded-xl overflow-hidden"
      style="min-width: 180px; background:#fff; border:1px solid #e5e7eb;"
      :style="{ left: hoveredSeat.x + 16 + 'px', top: hoveredSeat.y - 30 + 'px' }"
    >
      <div class="flex divide-x divide-gray-100 px-1 pt-2 pb-1">
        <div class="flex-1 flex flex-col items-center px-2">
          <span class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Section</span>
          <span class="text-sm font-bold text-gray-900 mt-0.5">{{ hoveredSeat.seat.section || catById(hoveredSeat.seat.categoryId).name }}</span>
        </div>
        <div class="flex-1 flex flex-col items-center px-2">
          <span class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Rangée</span>
          <span class="text-sm font-bold text-gray-900 mt-0.5">{{ hoveredSeat.seat.rowLabel || '—' }}</span>
        </div>
        <div class="flex-1 flex flex-col items-center px-2">
          <span class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Siège</span>
          <span class="text-sm font-bold text-gray-900 mt-0.5">{{ hoveredSeat.seat.colLabel || hoveredSeat.seat.label }}</span>
        </div>
      </div>
      <div
        class="flex items-center justify-center gap-2 px-3 py-1.5 mt-1 text-white text-xs font-bold"
        :style="{ background: catById(hoveredSeat.seat.categoryId).color }"
      >
        <span>{{ catById(hoveredSeat.seat.categoryId).name }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.plan-canvas {
  background-color: #ffffff;
}
.seat-block {
  /* Aucun padding : l'editeur n'en met pas et le badge LOD est en position absolue.
     Un padding-top ici decalerait tous les blocs vers le bas par rapport au plan. */
}
.seat-block-card {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px;
}
.row-badge {
  position: absolute;
  top: -4px;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  z-index: 2;
  white-space: nowrap;
}
.lod-blur {
  filter: blur(2px);
  opacity: 0.5;
  transition: filter 0.2s, opacity 0.2s;
  pointer-events: none;
}
.lod-seat-grid {
  transition: filter 0.2s, opacity 0.2s;
}
.row-badge--lod {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 3;
}
.lod-section-badge {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  z-index: 3;
  white-space: nowrap;
  pointer-events: none;
}
.seat {
  cursor: pointer;
  transition: filter 0.1s;
}
.seat:hover:not(.seat-disabled) {
  filter: brightness(1.15);
}
.seat-disabled {
  cursor: not-allowed;
}
.seat-rounded {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}
</style>
