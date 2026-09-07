<script setup>
import { computed } from 'vue';

const props = defineProps({
  objects:  { type: Array,  default: () => [] },
  colorMap: { type: Object, default: () => ({}) },
  width:    { type: Number, default: 180 },
  height:   { type: Number, default: 120 },
});

// ── couleur par catégorie ──────────────────────────────────────────────────
function catColor(categoryId) {
  return props.colorMap[categoryId] || '#9ca3af';
}

// ── helpers géométriques (mêmes formules que l'éditeur) ───────────────────
const TS_PAD = 4;
function tsUnit(ts) { return (ts.tableSize || 30) + 2 * (ts.seatSize || 15) + 16; }
function tsW(ts) {
  const u = tsUnit(ts), c = ts.tableCount || 3, sp = ts.tableSpacing ?? 2;
  return c * u + (c - 1) * sp + 2 * TS_PAD;
}
function tsH(ts) {
  const u = tsUnit(ts), r = ts.tableRows || 1, sp = ts.tableSpacing ?? 2;
  return r * u + (r - 1) * sp + 2 * TS_PAD;
}
function tzSize(t) { return (t.tableSize || 30) + 2 * (t.seatSize || 15) + 16; }

// Dimensions naturelles d'un seatRow (avant rotation)
// padding p-1.5 = 6px de chaque côté + 14px pour le label
function rowW(row) {
  const ss = row.seatSize || 22, gap = row.seatGap ?? 4, cols = row.cols || 1;
  return 12 + cols * ss + (cols - 1) * gap;
}
function rowH(row) {
  const ss = row.seatSize || 22, gap = row.seatGap ?? 4, rows = row.rows || 1;
  return 12 + rows * ss + (rows - 1) * gap;
}
// Centre de rotation : centre géométrique de l'élément complet (label inclus)
function rowCx(row) { return (row.left || 0) + rowW(row) / 2; }
function rowCy(row) { return (row.top  || 0) + 7 + rowH(row) / 2; } // 7 = 14/2

// ── objets par type ───────────────────────────────────────────────────────
const zones         = computed(() => props.objects.filter(o => o._type === 'zone'));
const freeZones     = computed(() => props.objects.filter(o => o._type === 'freeZone'));
const seatRows      = computed(() => props.objects.filter(o => o._type === 'seatRow'));
const tableZones    = computed(() => props.objects.filter(o => o._type === 'tableZone'));
const tableSections = computed(() => props.objects.filter(o => o._type === 'tableSection'));

// ── bounding box (même logique que l'ancienne version) ────────────────────
const bbox = computed(() => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of props.objects) {
    const x = o.left || 0, y = o.top || 0;
    let w = 0, h = 0;
    if (o._type === 'zone' || o._type === 'freeZone') {
      w = o.width || 80; h = o.height || 60;
    } else if (o._type === 'seatRow') {
      w = rowW(o); h = 14 + rowH(o);
    } else if (o._type === 'tableZone') {
      const sz = tzSize(o); w = sz; h = sz;
    } else if (o._type === 'tableSection') {
      w = tsW(o); h = tsH(o);
    }
    minX = Math.min(minX, x);     minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, w: 200, h: 150 };
  const pad = 16;
  return { minX: minX - pad, minY: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
});

const viewBox = computed(() =>
  `${bbox.value.minX} ${bbox.value.minY} ${bbox.value.w} ${bbox.value.h}`
);

// ── sièges d'un seatRow ───────────────────────────────────────────────────
function rowSeats(row) {
  const disabled = row.disabledSeats || [];
  const result = [];
  for (let r = 0; r < (row.rows || 1); r++) {
    for (let c = 0; c < (row.cols || 1); c++) {
      result.push({ r, c, on: !disabled.includes(`${r}-${c}`) });
    }
  }
  return result;
}

// ── sièges d'une table ronde ──────────────────────────────────────────────
function tableSeats(t) {
  const count = t.seatCount || 6, disabled = t.disabledSeats || [];
  return Array.from({ length: count }, (_, i) => i).filter(i => !disabled.includes(i));
}

// ── sièges autour d'une table dans une section ────────────────────────────
function sectionSeats(ts, ti) {
  const spt = ts.seatsPerTable || 6, disabled = ts.disabledSeats || [];
  return Array.from({ length: spt }, (_, si) => ({ si, spt }))
    .filter(({ si }) => !disabled.includes(`${ti}-${si}`));
}
</script>

<template>
  <svg
    :width="width" :height="height"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    xmlns="http://www.w3.org/2000/svg"
    class="shrink-0 rounded-lg border border-gray-100"
    style="display:block; background:#fff; overflow:hidden;"
  >
    <!-- Plan vide -->
    <text v-if="!objects.length"
      :x="bbox.minX + bbox.w / 2" :y="bbox.minY + bbox.h / 2"
      text-anchor="middle" dominant-baseline="middle"
      fill="#d1d5db" font-size="14" font-family="system-ui"
    >Vide</text>

    <!-- ── Zones de places ──────────────────────────────────────────── -->
    <g v-for="z in zones" :key="z.id">
      <rect
        :x="z.left" :y="z.top"
        :width="z.width || 80" :height="z.height || 60"
        :fill="catColor(z.categoryId) + '18'"
        :stroke="catColor(z.categoryId) + '66'"
        stroke-width="2" rx="12"
      />
      <!-- Fond de l'étiquette (pill) -->
      <rect
        :x="(z.left || 0) + (z.width || 80) / 2 - ((z.label || '').length * (z.labelFontSize || 12) * 0.33 + 12)"
        :y="(z.top  || 0) + (z.height || 60) / 2 - (z.labelFontSize || 12) * 0.6"
        :width="(z.label || '').length * (z.labelFontSize || 12) * 0.66 + 24"
        :height="(z.labelFontSize || 12) * 1.2 + 8"
        fill="white" rx="999"
        :stroke="catColor(z.categoryId) + '33'" stroke-width="1.5"
      />
      <text
        :x="(z.left || 0) + (z.width || 80) / 2"
        :y="(z.top  || 0) + (z.height || 60) / 2"
        text-anchor="middle" dominant-baseline="middle"
        :fill="catColor(z.categoryId)"
        :font-size="z.labelFontSize || 12"
        font-weight="bold" font-family="system-ui"
      >{{ z.label }}</text>
    </g>

    <!-- ── Zones libres ─────────────────────────────────────────────── -->
    <g v-for="fz in freeZones" :key="fz.id">
      <rect
        :x="fz.left" :y="fz.top"
        :width="fz.width || 80" :height="fz.height || 60"
        :fill="fz.color"
        :stroke="(fz.color || '#000') + '40'" stroke-width="1"
        rx="8"
      />
      <!-- Icône -->
      <text v-if="fz.icon"
        :x="(fz.left || 0) + (fz.width || 80) / 2"
        :y="fz.label
          ? (fz.top || 0) + (fz.height || 60) / 2 - (fz.labelFontSize || 10) / 2 - 2
          : (fz.top || 0) + (fz.height || 60) / 2"
        text-anchor="middle" dominant-baseline="middle"
        :font-size="fz.iconSize || Math.max(12, (fz.height || 60) * 0.32)"
        font-family="system-ui"
      >{{ fz.icon }}</text>
      <!-- Label -->
      <text
        :x="(fz.left || 0) + (fz.width || 80) / 2"
        :y="fz.icon
          ? (fz.top || 0) + (fz.height || 60) / 2 + (fz.iconSize || Math.max(12, (fz.height || 60) * 0.32)) / 2 + 4
          : (fz.top || 0) + (fz.height || 60) / 2"
        text-anchor="middle" dominant-baseline="middle"
        :fill="fz.textColor || '#000'"
        :font-size="fz.labelFontSize || 10"
        font-weight="bold" font-family="system-ui"
      >{{ fz.label }}</text>
    </g>

    <!-- ── Blocs de sièges (seatRow) ────────────────────────────────── -->
    <g v-for="row in seatRows" :key="row.id"
      :transform="`rotate(${row.rotation || 0}, ${rowCx(row)}, ${rowCy(row)})`"
    >
      <!-- Étiquette de section au-dessus du bloc -->
      <rect
        :x="(row.left || 0) + rowW(row) / 2 - ((row.section || '?').length * 5 + 10)"
        :y="(row.top || 0)"
        :width="(row.section || '?').length * 10 + 20"
        height="13"
        fill="white" rx="999"
        :stroke="catColor(row.categoryId) + '55'" stroke-width="1"
      />
      <text
        :x="(row.left || 0) + rowW(row) / 2"
        :y="(row.top || 0) + 6.5"
        text-anchor="middle" dominant-baseline="middle"
        :fill="catColor(row.categoryId)"
        font-size="9" font-weight="bold" font-family="system-ui"
      >{{ row.section || '?' }}</text>

      <!-- Fond du bloc de sièges -->
      <rect
        :x="row.left || 0"
        :y="(row.top || 0) + 14"
        :width="rowW(row)"
        :height="rowH(row)"
        :fill="catColor(row.categoryId) + '14'"
        :stroke="catColor(row.categoryId) + '55'"
        stroke-width="1" rx="6"
      />

      <!-- Sièges -->
      <template v-for="seat in rowSeats(row)" :key="`${seat.r}-${seat.c}`">
        <template v-if="seat.on">
          <!-- Siège actif -->
          <circle v-if="row.shape === 'rounded'"
            :cx="(row.left || 0) + 6 + seat.c * ((row.seatSize || 22) + (row.seatGap ?? 4)) + (row.seatSize || 22) / 2"
            :cy="(row.top || 0) + 14 + 6 + seat.r * ((row.seatSize || 22) + (row.seatGap ?? 4)) + (row.seatSize || 22) / 2"
            :r="(row.seatSize || 22) / 2"
            :fill="catColor(row.categoryId)"
          />
          <rect v-else
            :x="(row.left || 0) + 6 + seat.c * ((row.seatSize || 22) + (row.seatGap ?? 4))"
            :y="(row.top || 0) + 14 + 6 + seat.r * ((row.seatSize || 22) + (row.seatGap ?? 4))"
            :width="row.seatSize || 22" :height="row.seatSize || 22"
            :fill="catColor(row.categoryId)"
            rx="3"
          />
        </template>
        <template v-else>
          <!-- Siège désactivé (gris transparent pour garder l'espace) -->
          <circle v-if="row.shape === 'rounded'"
            :cx="(row.left || 0) + 6 + seat.c * ((row.seatSize || 22) + (row.seatGap ?? 4)) + (row.seatSize || 22) / 2"
            :cy="(row.top || 0) + 14 + 6 + seat.r * ((row.seatSize || 22) + (row.seatGap ?? 4)) + (row.seatSize || 22) / 2"
            :r="(row.seatSize || 22) / 2"
            fill="#e5e7eb"
          />
          <rect v-else
            :x="(row.left || 0) + 6 + seat.c * ((row.seatSize || 22) + (row.seatGap ?? 4))"
            :y="(row.top || 0) + 14 + 6 + seat.r * ((row.seatSize || 22) + (row.seatGap ?? 4))"
            :width="row.seatSize || 22" :height="row.seatSize || 22"
            fill="#e5e7eb" rx="3"
          />
        </template>
      </template>
    </g>

    <!-- ── Tables rondes (tableZone) ────────────────────────────────── -->
    <g v-for="t in tableZones" :key="t.id"
      :transform="`translate(${t.left || 0}, ${t.top || 0}) rotate(${t.rotation || 0}, ${tzSize(t) / 2}, ${tzSize(t) / 2})`"
    >
      <!-- Sièges autour de la table -->
      <circle
        v-for="si in tableSeats(t)" :key="si"
        :cx="tzSize(t) / 2 + ((t.tableSize || 30) / 2 + (t.seatSize || 15) / 2) * Math.cos(2 * Math.PI * si / (t.seatCount || 6) - Math.PI / 2)"
        :cy="tzSize(t) / 2 + ((t.tableSize || 30) / 2 + (t.seatSize || 15) / 2) * Math.sin(2 * Math.PI * si / (t.seatCount || 6) - Math.PI / 2)"
        :r="(t.seatSize || 15) / 2"
        :fill="catColor(t.categoryId)"
      />
      <!-- Table (cercle central) -->
      <circle
        :cx="tzSize(t) / 2" :cy="tzSize(t) / 2"
        :r="(t.tableSize || 30) / 2"
        :fill="catColor(t.categoryId) + '22'"
        :stroke="catColor(t.categoryId) + '88'" stroke-width="2"
      />
      <text
        :x="tzSize(t) / 2" :y="tzSize(t) / 2"
        text-anchor="middle" dominant-baseline="middle"
        :fill="catColor(t.categoryId)"
        :font-size="t.tableLabelFontSize || 11"
        font-weight="bold" font-family="system-ui"
      >{{ t.section }}</text>
    </g>

    <!-- ── Sections de tables (tableSection) ────────────────────────── -->
    <g v-for="ts in tableSections" :key="ts.id">
      <!-- Fond de section -->
      <rect
        :x="ts.left || 0" :y="ts.top || 0"
        :width="tsW(ts)" :height="tsH(ts)"
        :fill="catColor(ts.categoryId) + '14'"
        :stroke="catColor(ts.categoryId) + '55'"
        stroke-width="1" rx="6"
      />
      <template v-for="ri in (ts.tableRows || 1)" :key="ri">
        <template v-for="ci in (ts.tableCount || 3)" :key="ci">
          <template v-if="!(ts.deletedTables || []).includes((ri - 1) * (ts.tableCount || 3) + (ci - 1))">
            <!-- Centre de cette table dans la grille -->
            <!-- cx_table = left + TS_PAD + (ci-1)*(tsUnit+spacing) + tsUnit/2 -->
            <!-- cy_table = top  + TS_PAD + (ri-1)*(tsUnit+spacing) + tsUnit/2 -->
            <circle
              v-for="seat in sectionSeats(ts, (ri - 1) * (ts.tableCount || 3) + (ci - 1))"
              :key="seat.si"
              :cx="(ts.left || 0) + TS_PAD + (ci - 1) * (tsUnit(ts) + (ts.tableSpacing ?? 2)) + tsUnit(ts) / 2
                + ((ts.tableSize || 30) / 2 + (ts.seatSize || 15) / 2) * Math.cos(2 * Math.PI * seat.si / seat.spt - Math.PI / 2)"
              :cy="(ts.top  || 0) + TS_PAD + (ri - 1) * (tsUnit(ts) + (ts.tableSpacing ?? 2)) + tsUnit(ts) / 2
                + ((ts.tableSize || 30) / 2 + (ts.seatSize || 15) / 2) * Math.sin(2 * Math.PI * seat.si / seat.spt - Math.PI / 2)"
              :r="(ts.seatSize || 15) / 2"
              :fill="catColor(ts.categoryId)"
            />
            <!-- Table -->
            <circle
              :cx="(ts.left || 0) + TS_PAD + (ci - 1) * (tsUnit(ts) + (ts.tableSpacing ?? 2)) + tsUnit(ts) / 2"
              :cy="(ts.top  || 0) + TS_PAD + (ri - 1) * (tsUnit(ts) + (ts.tableSpacing ?? 2)) + tsUnit(ts) / 2"
              :r="(ts.tableSize || 30) / 2"
              :fill="catColor(ts.categoryId) + '22'"
              :stroke="catColor(ts.categoryId) + '88'" stroke-width="2"
            />
            <text
              :x="(ts.left || 0) + TS_PAD + (ci - 1) * (tsUnit(ts) + (ts.tableSpacing ?? 2)) + tsUnit(ts) / 2"
              :y="(ts.top  || 0) + TS_PAD + (ri - 1) * (tsUnit(ts) + (ts.tableSpacing ?? 2)) + tsUnit(ts) / 2"
              text-anchor="middle" dominant-baseline="middle"
              :fill="catColor(ts.categoryId)"
              :font-size="ts.tableLabelFontSize || 10"
              font-weight="bold" font-family="system-ui"
            >T{{ (ri - 1) * (ts.tableCount || 3) + ci }}</text>
          </template>
        </template>
      </template>
    </g>
  </svg>
</template>
