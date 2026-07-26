<script setup>
import { computed } from 'vue';

const props = defineProps({
  objects:  { type: Array,  default: () => [] },
  colorMap: { type: Object, default: () => ({}) }, // { [categoryId]: color }
  width:    { type: Number, default: 140 },
  height:   { type: Number, default: 90 },
});

const FALLBACK_COLORS = ['#a78bfa','#f472b6','#fb923c','#34d399','#60a5fa','#facc15','#f87171','#2dd4bf'];

const fallbackMap = computed(() => {
  const map = {};
  let i = 0;
  for (const obj of props.objects) {
    const key = obj.categoryId || '__none__';
    if (!(key in map)) { map[key] = FALLBACK_COLORS[i % FALLBACK_COLORS.length]; i++; }
  }
  return map;
});

function catColor(obj) {
  const key = obj.categoryId || '__none__';
  return props.colorMap[key] || fallbackMap.value[key] || FALLBACK_COLORS[0];
}

function tableZoneSize(t) { return (t.tableSize || 30) + 2 * (t.seatSize || 15) + 16; }
const TS_PAD = 4;
function tsUnit(ts) { return (ts.tableSize || 30) + 2 * (ts.seatSize || 15) + 16; }

// Build a flat list of SVG primitives: { type:'rect'|'circle', x, y, w, h, r, fill, stroke }
const shapes = computed(() => {
  const out = [];
  props.objects.forEach((obj, idx) => {
    const color = catColor(obj);
    const ox = obj.left || 0;
    const oy = obj.top  || 0;

    if (obj._type === 'zone' || obj._type === 'freeZone') {
      out.push({ type: 'rect', x: ox, y: oy, w: obj.width || 80, h: obj.height || 60, rx: 4, fill: color + '22', stroke: color, sw: 1 });

    } else if (obj._type === 'seatRow') {
      const ss = obj.seatSize || 22;
      const gap = obj.seatGap ?? 4;
      const rows = obj.rows || 1, cols = obj.cols || 1;
      const disabled = obj.disabledSeats || [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (disabled.includes(`${r}-${c}`)) continue;
          out.push({ type: 'rect', x: ox + c * (ss + gap), y: oy + r * (ss + gap), w: ss, h: ss, rx: 2, fill: color, stroke: 'none', sw: 0 });
        }
      }

    } else if (obj._type === 'tableZone') {
      const sz = tableZoneSize(obj);
      const ts = obj.tableSize || 30;
      const ss = obj.seatSize || 15;
      const cx = ox + sz / 2, cy = oy + sz / 2;
      const orbit = ts / 2 + ss / 2;
      const count = obj.seatCount || 6;
      const disabled = obj.disabledSeats || [];
      // Table circle
      out.push({ type: 'circle', cx, cy, r: ts / 2, fill: color + '33', stroke: color, sw: 1.5 });
      // Seats
      for (let i = 0; i < count; i++) {
        if (disabled.includes(i)) continue;
        const angle = (2 * Math.PI * i) / count - Math.PI / 2;
        const sx = cx + orbit * Math.cos(angle) - ss / 2;
        const sy = cy + orbit * Math.sin(angle) - ss / 2;
        out.push({ type: 'rect', x: sx, y: sy, w: ss, h: ss, rx: ss / 2, fill: color, stroke: 'none', sw: 0 });
      }

    } else if (obj._type === 'tableSection') {
      const unit = tsUnit(obj);
      const ts = obj.tableSize || 30;
      const ss = obj.seatSize || 15;
      const cols = obj.tableCount || 3;
      const rows = obj.tableRows || 1;
      const sp = obj.tableSpacing ?? 2;
      const disabled = obj.disabledSeats || [];
      const deletedTables = obj.deletedTables || [];
      for (let ri = 1; ri <= rows; ri++) {
        for (let ci = 1; ci <= cols; ci++) {
          const ti = (ri - 1) * cols + (ci - 1);
          if (deletedTables.includes(ti)) continue;
          const tcx = ox + TS_PAD + (ci - 1) * (unit + sp) + unit / 2;
          const tcy = oy + TS_PAD + (ri - 1) * (unit + sp) + unit / 2;
          const rotRad = 0;
          const orbit = ts / 2 + ss / 2;
          const spt = obj.seatsPerTable || 6;
          // Table
          out.push({ type: 'circle', cx: tcx, cy: tcy, r: ts / 2, fill: color + '33', stroke: color, sw: 1.5 });
          // Seats
          for (let si = 0; si < spt; si++) {
            if (disabled.includes(`${ti}-${si}`)) continue;
            const angle = (2 * Math.PI * si) / spt - Math.PI / 2 + rotRad;
            const sx = tcx + orbit * Math.cos(angle) - ss / 2;
            const sy = tcy + orbit * Math.sin(angle) - ss / 2;
            out.push({ type: 'rect', x: sx, y: sy, w: ss, h: ss, rx: ss / 2, fill: color, stroke: 'none', sw: 0 });
          }
        }
      }
    }
  });
  return out;
});

const viewBox = computed(() => {
  if (!shapes.value.length) return '0 0 200 150';
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes.value) {
    if (s.type === 'circle') {
      minX = Math.min(minX, s.cx - s.r); minY = Math.min(minY, s.cy - s.r);
      maxX = Math.max(maxX, s.cx + s.r); maxY = Math.max(maxY, s.cy + s.r);
    } else {
      minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.w); maxY = Math.max(maxY, s.y + s.h);
    }
  }
  const pad = 10;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
});
</script>

<template>
  <svg
    :viewBox="viewBox"
    :width="width"
    :height="height"
    xmlns="http://www.w3.org/2000/svg"
    class="shrink-0 rounded-lg bg-white border border-gray-100"
    style="overflow: hidden;"
  >
    <rect width="100%" height="100%" fill="white" />

    <template v-for="(s, i) in shapes" :key="i">
      <circle v-if="s.type === 'circle'"
        :cx="s.cx" :cy="s.cy" :r="s.r"
        :fill="s.fill" :stroke="s.stroke" :stroke-width="s.sw" />
      <rect v-else
        :x="s.x" :y="s.y" :width="s.w" :height="s.h"
        :rx="s.rx" :ry="s.rx"
        :fill="s.fill" :stroke="s.stroke" :stroke-width="s.sw" />
    </template>

    <text v-if="!shapes.length"
      x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
      font-size="12" fill="#9ca3af">Vide</text>
  </svg>
</template>
