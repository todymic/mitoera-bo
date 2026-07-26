<script setup>
import { computed } from 'vue';

const props = defineProps({
  objects:  { type: Array,  default: () => [] },
  colorMap: { type: Object, default: () => ({}) },
  width:    { type: Number, default: 180 },
  height:   { type: Number, default: 120 },
});

function cat(categoryId) {
  const color = props.colorMap[categoryId] || '#9ca3af';
  return { color };
}

// ---- Geometry ----
function tableZoneSize(t) { return (t.tableSize || 30) + 2 * (t.seatSize || 15) + 16; }
const TS_PAD = 4;
function tsUnit(ts) { return (ts.tableSize || 30) + 2 * (ts.seatSize || 15) + 16; }
function tsW(ts) {
  const u = tsUnit(ts); const c = ts.tableCount || 3; const sp = ts.tableSpacing ?? 2;
  return c * u + (c - 1) * sp + 2 * TS_PAD;
}
function tsH(ts) {
  const u = tsUnit(ts); const r = ts.tableRows || 1; const sp = ts.tableSpacing ?? 2;
  return r * u + (r - 1) * sp + 2 * TS_PAD;
}

// Categorized objects
const zones         = computed(() => props.objects.filter(o => o._type === 'zone'));
const freeZones     = computed(() => props.objects.filter(o => o._type === 'freeZone'));
const seatRows      = computed(() => props.objects.filter(o => o._type === 'seatRow'));
const tableZones    = computed(() => props.objects.filter(o => o._type === 'tableZone'));
const tableSections = computed(() => props.objects.filter(o => o._type === 'tableSection'));

// Compute bounding box of all objects
const bbox = computed(() => {
  let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
  for (const o of props.objects) {
    const x = o.left || 0, y = o.top || 0;
    let w = 0, h = 0;
    if (o._type === 'zone' || o._type === 'freeZone') { w = o.width || 80; h = o.height || 60; }
    else if (o._type === 'seatRow') {
      const ss = o.seatSize || 22, gap = o.seatGap ?? 4;
      w = (o.cols || 1) * (ss + gap); h = (o.rows || 1) * (ss + gap) + 14;
    }
    else if (o._type === 'tableZone') { const sz = tableZoneSize(o); w = sz; h = sz; }
    else if (o._type === 'tableSection') { w = tsW(o); h = tsH(o); }
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, w: 200, h: 150 };
  const pad = 16;
  return { minX: minX - pad, minY: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
});

const scale = computed(() => {
  const sx = props.width  / bbox.value.w;
  const sy = props.height / bbox.value.h;
  return Math.min(sx, sy);
});

const transform = computed(() => {
  const s = scale.value;
  return `translate(${-bbox.value.minX * s}px, ${-bbox.value.minY * s}px) scale(${s})`;
});

// Seat helpers
function seatColCount(row) { return row.cols || 1; }
function buildTableSeats(t) {
  const count = t.seatCount || 6;
  const disabled = t.disabledSeats || [];
  const seats = [];
  for (let i = 0; i < count; i++) {
    if (!disabled.includes(i)) seats.push({ index: i });
  }
  return seats;
}
function buildSectionSeats(ts, ti, ri, ci) {
  const spt = ts.seatsPerTable || 6;
  const disabled = ts.disabledSeats || [];
  const seats = [];
  for (let si = 0; si < spt; si++) {
    if (!disabled.includes(`${ti}-${si}`)) seats.push({ si, spt });
  }
  return seats;
}
</script>

<template>
  <div class="shrink-0 rounded-lg bg-white border border-gray-100 overflow-hidden relative"
    :style="{ width: width + 'px', height: height + 'px' }">

    <div v-if="!objects.length"
      class="absolute inset-0 flex items-center justify-center text-xs text-gray-300">
      Vide
    </div>

    <!-- Canvas at full scale, clipped by container -->
    <div class="absolute" style="transform-origin: 0 0; pointer-events: none;"
      :style="{ transform }">

      <!-- Zones -->
      <div v-for="z in zones" :key="z.id"
        class="absolute rounded-xl border-2 flex items-center justify-center select-none"
        :style="{ top: z.top+'px', left: z.left+'px', width: (z.width||80)+'px', height: (z.height||60)+'px',
          background: cat(z.categoryId).color+'18', borderColor: cat(z.categoryId).color+'66' }">
        <span class="bg-white rounded-full font-bold px-3 py-1 shadow-sm"
          :style="{ color: cat(z.categoryId).color, fontSize: (z.labelFontSize||12)+'px', border: `1.5px solid ${cat(z.categoryId).color}33` }">
          {{ z.label }}
        </span>
      </div>

      <!-- Zones libres -->
      <div v-for="fz in freeZones" :key="fz.id"
        class="absolute rounded-lg flex flex-col items-center justify-center text-center gap-0.5 select-none"
        :style="{ top: fz.top+'px', left: fz.left+'px', width: (fz.width||80)+'px', height: (fz.height||60)+'px',
          background: fz.color, border: `1px solid ${fz.color}40` }">
        <span v-if="fz.icon" :style="{ fontSize: (fz.iconSize || Math.max(12,(fz.height||60)*0.32))+'px' }">{{ fz.icon }}</span>
        <span class="font-bold uppercase tracking-wide leading-tight"
          :style="{ color: fz.textColor||'#000', fontSize: (fz.labelFontSize||10)+'px' }">{{ fz.label }}</span>
      </div>

      <!-- Blocs de sièges -->
      <div v-for="row in seatRows" :key="row.id"
        class="absolute select-none"
        :style="{ top: row.top+'px', left: row.left+'px', paddingTop: '14px' }">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white border rounded-full px-3 py-0.5 text-xs font-bold whitespace-nowrap z-10"
          :style="{ color: cat(row.categoryId).color, borderColor: cat(row.categoryId).color+'55', fontSize: '10px' }">
          {{ row.section || '?' }}
        </div>
        <div class="rounded-lg p-1.5"
          :style="{ background: cat(row.categoryId).color+'14', border: `1px solid ${cat(row.categoryId).color}55` }">
          <div class="grid"
            :style="{ gridTemplateColumns: `repeat(${seatColCount(row)}, ${row.seatSize||22}px)`, gap: (row.seatGap??4)+'px' }">
            <template v-for="r in (row.rows||1)" :key="r">
              <template v-for="c in (row.cols||1)" :key="c">
                <div v-if="!(row.disabledSeats||[]).includes(`${r-1}-${c-1}`)"
                  class="rounded flex items-center justify-center font-bold"
                  :style="{ width: (row.seatSize||22)+'px', height: (row.seatSize||22)+'px',
                    background: cat(row.categoryId).color, color: '#fff',
                    fontSize: (row.seatLabelFontSize||9)+'px', borderRadius: row.shape==='rounded' ? '50%' : '3px' }">
                </div>
                <div v-else :style="{ width: (row.seatSize||22)+'px', height: (row.seatSize||22)+'px' }" />
              </template>
            </template>
          </div>
        </div>
      </div>

      <!-- Tables rondes -->
      <div v-for="t in tableZones" :key="t.id"
        class="absolute select-none"
        :style="{ top: t.top+'px', left: t.left+'px', width: tableZoneSize(t)+'px', height: tableZoneSize(t)+'px', transform: `rotate(${t.rotation||0}deg)` }">
        <div v-for="seat in buildTableSeats(t)" :key="seat.index"
          class="absolute flex items-center justify-center rounded-full font-bold"
          :style="{
            width: (t.seatSize||15)+'px', height: (t.seatSize||15)+'px',
            background: cat(t.categoryId).color, color: '#fff',
            fontSize: (t.seatLabelFontSize||9)+'px',
            left: (tableZoneSize(t)/2 + ((t.tableSize||30)/2+(t.seatSize||15)/2)*Math.cos((2*Math.PI*seat.index)/(t.seatCount||6)-Math.PI/2)-(t.seatSize||15)/2)+'px',
            top:  (tableZoneSize(t)/2 + ((t.tableSize||30)/2+(t.seatSize||15)/2)*Math.sin((2*Math.PI*seat.index)/(t.seatCount||6)-Math.PI/2)-(t.seatSize||15)/2)+'px',
          }" />
        <div class="absolute rounded-full flex items-center justify-center"
          :style="{ width:(t.tableSize||30)+'px', height:(t.tableSize||30)+'px',
            left:(tableZoneSize(t)-(t.tableSize||30))/2+'px', top:(tableZoneSize(t)-(t.tableSize||30))/2+'px',
            background: cat(t.categoryId).color+'22', border:`2px solid ${cat(t.categoryId).color}88` }">
          <span class="font-bold" :style="{ color: cat(t.categoryId).color, fontSize:(t.tableLabelFontSize||11)+'px' }">{{ t.section }}</span>
        </div>
      </div>

      <!-- Sections de tables -->
      <div v-for="ts in tableSections" :key="ts.id"
        class="absolute select-none rounded-lg"
        :style="{ top: ts.top+'px', left: ts.left+'px', width: tsW(ts)+'px', height: tsH(ts)+'px',
          background: cat(ts.categoryId).color+'14', border: `1px solid ${cat(ts.categoryId).color}55` }">
        <template v-for="ri in (ts.tableRows||1)" :key="ri">
          <template v-for="ci in (ts.tableCount||3)" :key="ci">
            <template v-if="!(ts.deletedTables||[]).includes((ri-1)*(ts.tableCount||3)+(ci-1))">
              <!-- Seats around table -->
              <div v-for="seat in buildSectionSeats(ts, (ri-1)*(ts.tableCount||3)+(ci-1), ri, ci)" :key="seat.si"
                class="absolute rounded-full"
                :style="{
                  width: (ts.seatSize||15)+'px', height: (ts.seatSize||15)+'px',
                  background: cat(ts.categoryId).color,
                  left: (TS_PAD + (ci-1)*(tsUnit(ts)+(ts.tableSpacing??2)) + tsUnit(ts)/2 + ((ts.tableSize||30)/2+(ts.seatSize||15)/2)*Math.cos((2*Math.PI*seat.si)/seat.spt - Math.PI/2) - (ts.seatSize||15)/2)+'px',
                  top:  (TS_PAD + (ri-1)*(tsUnit(ts)+(ts.tableSpacing??2)) + tsUnit(ts)/2 + ((ts.tableSize||30)/2+(ts.seatSize||15)/2)*Math.sin((2*Math.PI*seat.si)/seat.spt - Math.PI/2) - (ts.seatSize||15)/2)+'px',
                }" />
              <!-- Table circle -->
              <div class="absolute rounded-full flex items-center justify-center"
                :style="{
                  width: (ts.tableSize||30)+'px', height: (ts.tableSize||30)+'px',
                  left: (TS_PAD + (ci-1)*(tsUnit(ts)+(ts.tableSpacing??2)) + (tsUnit(ts)-(ts.tableSize||30))/2)+'px',
                  top:  (TS_PAD + (ri-1)*(tsUnit(ts)+(ts.tableSpacing??2)) + (tsUnit(ts)-(ts.tableSize||30))/2)+'px',
                  background: cat(ts.categoryId).color+'22', border: `2px solid ${cat(ts.categoryId).color}88`,
                }">
                <span class="font-bold" :style="{ color: cat(ts.categoryId).color, fontSize:(ts.tableLabelFontSize||10)+'px' }">
                  T{{ (ri-1)*(ts.tableCount||3)+ci }}
                </span>
              </div>
            </template>
          </template>
        </template>
      </div>

    </div>
  </div>
</template>
