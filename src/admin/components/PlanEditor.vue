<script setup>
import { ref, reactive, watch, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { adminApi } from '../services/adminApi';
import { computeSeatLabel, computeAxisLabel, firstAxisLabel, ROW_FORMATS, COL_FORMATS, DIRECTIONS } from '../../services/seatLabel';
import { FREE_ZONE_ICONS, FREE_ZONE_PATTERNS, iconById, patternStyle } from '../../services/icons';
import PreviewPlan from './PreviewPlan.vue';
import { activePlanId, activePlanDirty, activePlanStatus } from '../services/activePlan.js';
import { apiMode } from '../services/auth.js';
const isSandbox = computed(() => apiMode.value === 'sandbox');

const props = defineProps({
  venueId: { type: String, required: true },
  eventId: { type: String, default: null },
  planStatus: { type: String, default: 'draft' },
  planPendingChanges: { type: Boolean, default: false },
  planName: { type: String, default: '' },
});
const emit = defineEmits(['changed']);

const categories = ref([]);
const zones = ref([]);
const seatRows = ref([]);
const freeZones = ref([]);
const tableZones = ref([]);
const tableSections = ref([]);
const textLabels = ref([]);
const imageLayers = ref([]);
const loading = ref(true);

// Outil actif pour placement au clic sur le canvas : null | 'seatRow' | 'freeZone' | 'tableZone' | 'tableSection'
const activeTool = ref(null);

// Historique des éléments placés depuis l'activation du tool courant
// { kind: 'seatRow'|'freeZone'|'tableZone'|'tableSection', id }
const placementHistory = ref([]);

function selectTool(tool) {
  activeTool.value = tool === null ? null : (activeTool.value === tool ? null : tool);
  if (activeTool.value) { marqueeMode.value = false; selectedObjects.clear(); }
  selected.value = null;
  panWasDrag = false;
  placementHistory.value = [];
}

async function undoLastPlacement() {
  if (placementHistory.value.length === 0) return;
  const last = placementHistory.value.pop();
  try {
    if (last.kind === 'seatRow' || last.kind === 'seatRowGroup') {
      await adminApi.deleteSeatRow(last.id, props.venueId);
      seatRows.value = seatRows.value.filter((x) => x.id !== last.id);
    } else if (last.kind === 'freeZone') {
      await adminApi.deleteFreeZone(last.id, props.venueId);
      freeZones.value = freeZones.value.filter((x) => x.id !== last.id);
    } else if (last.kind === 'tableZone') {
      await adminApi.deleteTableZone(last.id, props.venueId);
      tableZones.value = tableZones.value.filter((x) => x.id !== last.id);
    } else if (last.kind === 'tableSection') {
      await adminApi.deleteTableSection(last.id, props.venueId);
      tableSections.value = tableSections.value.filter((x) => x.id !== last.id);
    } else if (last.kind === 'textLabel') {
      await adminApi.deleteTextLabel(last.id, props.venueId);
      textLabels.value = textLabels.value.filter((x) => x.id !== last.id);
    } else if (last.kind === 'imageLayer') {
      await adminApi.deleteImageLayer(last.id, props.venueId);
      imageLayers.value = imageLayers.value.filter((x) => x.id !== last.id);
    }
    deselect();
    isDirty.value = true;
    emit('changed');
  } catch (e) {
    // re-push si échec
    placementHistory.value.push(last);
  }
}

function onCanvasContextMenu(ev) {
  if (!activeTool.value) return;
  ev.preventDefault();
  undoLastPlacement();
}

// Le champ visé est-il une saisie ? (on ne capte pas les raccourcis dedans)
function isEditableTarget(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

// Escape annule le mode placement · Ctrl/Cmd + C / V / D = copier / coller / dupliquer
function onKeyDown(ev) {
  if (ev.key === 'Escape') {
    if (activeTool.value)            { activeTool.value = null; ev.preventDefault(); return; }
    if (marqueeMode.value)           { marqueeMode.value = false; ev.preventDefault(); return; }
    if (selectedObjects.size)        { clearObjectSelection(); ev.preventDefault(); return; }
    return;
  }
  if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
  if (isEditableTarget(ev.target)) return;
  const k = (ev.key || '').toLowerCase();
  if (k === 'a')                              { ev.preventDefault(); selectAllObjects(); }
  else if (k === 'c' && duplicable.value)     { ev.preventDefault(); copySelected(); }
  else if (k === 'v' && clipboard.value)      { ev.preventDefault(); pasteClipboard(); }
  else if (k === 'd' && selectedObjects.size) { ev.preventDefault(); duplicateObjectSelection(); }
  else if (k === 'd' && duplicable.value)     { ev.preventDefault(); duplicateSelected(); }
}

// selected = { kind: 'zone' | 'seatRow' | 'freeZone' | 'seat', id, rowId?, seatId?, seatInfo? }
const selected = ref(null);
// Multi-sélection de sièges : clés "rowId|r-c"
const multiSelected = reactive(new Set());
const bulkCategoryChoice = ref('');

const deleteBlockMessage = ref('');

const canvasRef = ref(null);
const canvasContainerRef = ref(null);
const showProps = ref(false);
const showInfoTooltip = ref(false);
// Auto-ouvre le panneau propriétés sur mobile quand un élément est sélectionné
watch(selected, (v) => {
  deleteBlockMessage.value = '';
  if (v) selectedObjects.clear();
  if (v && window.innerWidth < 1024) showProps.value = true;
});

// ---- Zoom + Pan (translate libre) ----
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.15;
const zoom = ref(1);
const panX = ref(40);
const panY = ref(40);
const scrollerRef = ref(null);

function setZoom(next) {
  const el = scrollerRef.value;
  const prev = zoom.value;
  const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  if (!el) { zoom.value = clamped; return; }
  const rect = el.getBoundingClientRect();
  const cx = rect.width  / 2;
  const cy = rect.height / 2;
  // point fixe = centre du container
  panX.value = cx - (cx - panX.value) * (clamped / prev);
  panY.value = cy - (cy - panY.value) * (clamped / prev);
  zoom.value = clamped;
}
function zoomIn()    { setZoom(zoom.value + ZOOM_STEP); }
function zoomOut()   { setZoom(zoom.value - ZOOM_STEP); }
function zoomReset() { zoom.value = 1; panX.value = 40; panY.value = 40; }

function onWheel(ev) {
  ev.preventDefault();
  const el = scrollerRef.value;
  if (!el) return;
  const prev = zoom.value;
  const factor = ev.deltaY < 0 ? 1.12 : 0.9;
  const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev * factor));
  const rect = el.getBoundingClientRect();
  // point fixe = position de la souris dans le container
  const mx = ev.clientX - rect.left;
  const my = ev.clientY - rect.top;
  panX.value = mx - (mx - panX.value) * (next / prev);
  panY.value = my - (my - panY.value) * (next / prev);
  zoom.value = next;
}

const LOD_THRESHOLD = 0.5;
const isLod = computed(() => zoom.value < LOD_THRESHOLD);

function itemShowBadge(item) {
  return isLod.value || !!item.badgeVisible;
}

const drag = reactive({ active: false, mode: null, kind: null, id: null, offsetX: 0, offsetY: 0, startW: 0, startH: 0, startX: 0, startY: 0 });
const pan = reactive({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });
const rowReorder = reactive({
  active: false, seatRowId: null, displayPos: -1, dataR: -1,
  targetPos: -1, startY: 0, startX: 0, cellH: 28, cellW: 26,
  directionDecided: false, direction: null,
  initColOffset: 0,
});

let panWasDrag = false;

function canvasClickCoords(ev) {
  const rect = scrollerRef.value.getBoundingClientRect();
  return {
    x: Math.round((ev.clientX - rect.left - panX.value) / zoom.value),
    y: Math.round((ev.clientY - rect.top  - panY.value) / zoom.value),
  };
}

// Phase capture : si un outil est actif et qu'on clique sur un élément existant,
// on désactive l'outil avant que l'élément ne stoppe la propagation.
function onScrollerClickCapture(ev) {
  if (!activeTool.value || panWasDrag) return;
  if (ev.target !== scrollerRef.value && ev.target !== canvasRef.value) {
    activeTool.value = null;
    placementHistory.value = [];
    // Ne pas stopper la propagation : on laisse l'élément se sélectionner normalement
  }
}

async function onCanvasPlacementClick(ev) {
  if (!activeTool.value || panWasDrag) return;
  // Ne placer que sur zone vide (le capture handler a déjà géré les clics sur éléments existants)
  if (ev.target !== scrollerRef.value && ev.target !== canvasRef.value) return;
  const { x, y } = canvasClickCoords(ev);
  const tool = activeTool.value;
  panWasDrag = false;
  let created = null;
  if (tool === 'seatRow')      created = await addSeatRow(x, y);
  else if (tool === 'seatRowGroup') created = await addSeatRowGroup(x, y);
  else if (tool === 'freeZone')     created = await addFreeZone(x, y);
  else if (tool === 'tableZone')    created = await addTableZone(x, y);
  else if (tool === 'tableSection') created = await addTableSection(x, y);
  else if (tool === 'textLabel')    created = await addTextLabel(x, y);
  else if (tool === 'imageLayer')   created = await pickAndAddImageLayer(x, y);
  if (created) placementHistory.value.push({ kind: tool, id: created.id });
}

function startPan(ev) {
  if (ev.button !== 0) return;
  marqueeJustFinished = false;
  if (activeTool.value) return;
  // Mode sélection multiple (ou Maj enfoncée) : on trace un rectangle au lieu de déplacer la vue
  if (marqueeMode.value || ev.shiftKey) { ev.preventDefault(); startMarquee(ev); return; }
  // Groupe sélectionné : drag depuis le fond déplace le groupe, pas la vue
  if (selectedObjects.size > 1) {
    ev.preventDefault();
    const objs = objectsInSelection();
    if (objs.length) {
      const ref = objs[0];
      const canvasRect = canvasRef.value.getBoundingClientRect();
      const z = zoom.value;
      drag.active = true;
      drag.mode = 'move';
      drag.kind = ref.kind;
      drag.id = ref.obj.id;
      drag.moved = false;
      drag.originLeft = ref.obj.left || 0;
      drag.originTop  = ref.obj.top  || 0;
      drag.group = objs.map(({ kind: k, obj }) => ({ kind: k, id: obj.id, left: obj.left || 0, top: obj.top || 0 }));
      drag.offsetX = (ev.clientX - canvasRect.left) / z - (ref.obj.left || 0);
      drag.offsetY = (ev.clientY - canvasRect.top)  / z - (ref.obj.top  || 0);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', stopDrag);
    }
    return;
  }
  ev.preventDefault();
  panWasDrag = false;
  pan.active = true;
  pan.startX = ev.clientX; pan.startY = ev.clientY;
  pan.originX = panX.value; pan.originY = panY.value;
  ev.target.setPointerCapture(ev.pointerId);
  window.addEventListener('pointermove', onPan);
  window.addEventListener('pointerup', stopPan);
  window.addEventListener('pointercancel', stopPan);
}
function onPan(ev) {
  if (!pan.active) return;
  const dx = ev.clientX - pan.startX, dy = ev.clientY - pan.startY;
  if (Math.abs(dx) > 4 || Math.abs(dy) > 4) panWasDrag = true;
  panX.value = pan.originX + dx;
  panY.value = pan.originY + dy;
}
function stopPan() {
  pan.active = false;
  window.removeEventListener('pointermove', onPan);
  window.removeEventListener('pointerup', stopPan);
  window.removeEventListener('pointercancel', stopPan);
}

function onScrollerClick(ev) {
  if (zoom.value >= 0.5 || panWasDrag || marqueeJustFinished) return;
  const rect = scrollerRef.value.getBoundingClientRect();
  const cx = (ev.clientX - rect.left - panX.value) / zoom.value;
  const cy = (ev.clientY - rect.top  - panY.value) / zoom.value;
  const newZoom = 1.5;
  panX.value = rect.width  / 2 - cx * newZoom;
  panY.value = rect.height / 2 - cy * newZoom;
  zoom.value = newZoom;
}



// Statuts de sièges modifiés localement depuis l'éditeur (démo — non persistés en base)
const seatStatusOverrides = reactive({});

const CANVAS_PAD = 400;

function tableZoneSize(t) {
  return (t.tableSize || 30) + 2 * (t.seatSize || 15) + 16;
}
const TS_PAD = 4; // inner padding inside tableSection border
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

const canvasHeight = computed(() => {
  let max = 600;
  for (const z of zones.value)      max = Math.max(max, (z.top  || 0) + (z.height || 70)  + CANVAS_PAD);
  for (const r of seatRows.value)   max = Math.max(max, (r.top  || 0) + (r.rows || 1) * ((r.seatSize || 22) + 4) + 30 + CANVAS_PAD);
  for (const f of freeZones.value)  max = Math.max(max, (f.top  || 0) + (f.height || 50)  + CANVAS_PAD);
  for (const t of tableZones.value) max = Math.max(max, (t.top  || 0) + tableZoneSize(t)   + CANVAS_PAD);
  for (const ts of tableSections.value) max = Math.max(max, (ts.top || 0) + tableSectionHeight(ts) + CANVAS_PAD);
  for (const tl of textLabels.value) max = Math.max(max, (tl.top || 0) + (tl.fontSize || 16) * 2 + CANVAS_PAD);
  return max;
});

const canvasWidth = computed(() => {
  let max = 900;
  for (const z of zones.value)      max = Math.max(max, (z.left  || 0) + (z.width  || 200) + CANVAS_PAD);
  for (const r of seatRows.value)   max = Math.max(max, (r.left  || 0) + (r.cols || 1) * ((r.shape === 'rounded' ? (r.seatSize || 22) * 1.5 : (r.seatSize || 22)) + 4) + 28 + CANVAS_PAD);
  for (const f of freeZones.value)  max = Math.max(max, (f.left  || 0) + (f.width  || 100) + CANVAS_PAD);
  for (const t of tableZones.value) max = Math.max(max, (t.left  || 0) + tableZoneSize(t)   + CANVAS_PAD);
  for (const ts of tableSections.value) max = Math.max(max, (ts.left || 0) + tableSectionWidth(ts) + CANVAS_PAD);
  for (const tl of textLabels.value) max = Math.max(max, (tl.left || 0) + ((tl.caption?.length || 4) * (tl.fontSize || 16) * 0.6) + CANVAS_PAD);
  return max;
});

function initZCounter() {
  const all = [...zones.value, ...seatRows.value, ...freeZones.value, ...tableZones.value, ...tableSections.value];
  zCounter.value = all.reduce((max, o) => Math.max(max, o.zIndex || 0), 0);
}

const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const [cats, objects] = await Promise.all([
      adminApi.listCategories(props.venueId),
      adminApi.listChartObjects(props.venueId),
    ]);
    categories.value = cats;
    zones.value = objects.zones;
    seatRows.value = objects.seatRows;
    freeZones.value = objects.freeZones;
    tableZones.value = objects.tableZones;
    tableSections.value = objects.tableSections;
    textLabels.value = objects.textLabels || [];
    imageLayers.value = objects.imageLayers || [];
    initZCounter();
    emit('changed');
  } catch (e) {
    loadError.value = e.message || 'Erreur de chargement';
  } finally {
    loading.value = false;
  }
}

// ---- Gestion des catégories inline ----
const showCatPanel = ref(false);
const catBtnRef = ref(null);
const catPanelStyle = ref({});

const infoBtnRef = ref(null);
const infoTooltipStyle = ref({});

function toggleInfoTooltip() {
  if (!showInfoTooltip.value) {
    const rect = infoBtnRef.value?.getBoundingClientRect();
    if (rect) {
      infoTooltipStyle.value = { top: (rect.bottom + 6) + 'px', right: (window.innerWidth - rect.right) + 'px' };
    }
  }
  showInfoTooltip.value = !showInfoTooltip.value;
}

function toggleCatPanel() {
  if (!showCatPanel.value) {
    const rect = catBtnRef.value?.getBoundingClientRect();
    if (rect) {
      catPanelStyle.value = { top: (rect.bottom + 6) + 'px', left: rect.left + 'px' };
    }
  }
  showCatPanel.value = !showCatPanel.value;
  catFormOpen.value = false;
  catError.value = '';
}

const catForm = ref({ name: '', color: '#2554c7' });
const catEditing = ref(null);
const catSaving = ref(false);
const catError = ref('');
const catFormOpen = ref(false);

function openCatCreate() {
  catEditing.value = null;
  catForm.value = { name: '', color: '#2554c7' };
  catFormOpen.value = true;
}
function openCatEdit(c) {
  catEditing.value = c;
  catForm.value = { name: c.name, color: c.color };
  catFormOpen.value = true;
}
async function saveCat() {
  if (!catForm.value.name.trim()) return;
  catSaving.value = true;
  const payload = { name: catForm.value.name.trim().toUpperCase(), color: catForm.value.color };
  if (catEditing.value) {
    await adminApi.updateCategory(catEditing.value.id, payload, props.venueId, catEditing.value.key);
  } else {
    await adminApi.createCategory(props.venueId, payload);
  }
  catSaving.value = false;
  catFormOpen.value = false;
  categories.value = await adminApi.listCategories(props.venueId);
  emit('changed');
}
// ---- Toast ----
const toast = ref(null); // { message, type: 'success'|'error'|'info', timeout }
let toastTimer = null;
function showToast(message, type = 'success', duration = 3000) {
  clearTimeout(toastTimer);
  toast.value = { message, type };
  toastTimer = setTimeout(() => { toast.value = null; }, duration);
}

// ---- Suppressions de catégories en attente (effectives uniquement à la publication) ----
const pendingCatDeletions = reactive(new Set()); // Set<categoryId>

function removeCat(c) {
  catError.value = '';
  pendingCatDeletions.add(c.id);
  isDirty.value = true;
  showToast(`Catégorie « ${c.name} » marquée pour suppression — sera définitive à la prochaine publication.`, 'info', 4000);
}

function cancelCatDeletion(c) {
  pendingCatDeletions.delete(c.id);
}

async function flushPendingCatDeletions() {
  for (const id of pendingCatDeletions) {
    const cat = categories.value.find(c => c.id === id);
    if (cat) {
      try { await adminApi.deleteCategory(id, props.venueId, cat.key); } catch (_) {}
    }
  }
  pendingCatDeletions.clear();
  categories.value = await adminApi.listCategories(props.venueId);
}
watch(() => props.venueId, load, { immediate: true });

onMounted(() => window.addEventListener('keydown', onKeyDown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown));

function catById(id) {
  return categories.value.find((c) => c.id === id) || { color: '#999999', name: '—' };
}

function seatGrid(row) {
  const seats = [];
  const naming = { rowFormat: row.rowFormat, rowDirection: row.rowDirection, colFormat: row.colFormat, colDirection: row.colDirection };
  const disabledSeats = row.disabledSeats || [];
  const deletedSeats  = row.deletedSeats  || [];
  const overrides = row.categoryOverrides || {};
  const labelOverrides = row.seatLabelOverrides || {};
  const rowOverrides = row.rowOverrides || {};
  const section = row.section || row.label || row.id;
  for (let r = 0; r < row.rows; r++) {
    const rOver = rowOverrides[r] || {};
    const rowCols     = rOver.cols      != null ? rOver.cols      : row.cols;
    const colStartAt  = rOver.colStartAt != null ? rOver.colStartAt : 0;
    const rowLabel    = rOver.label     != null ? rOver.label     : computeAxisLabel(r, row.rows, naming.rowFormat, naming.rowDirection);
    for (let c = 0; c < rowCols; c++) {
      const posKey = `${r}-${c}`;
      const isDeleted  = deletedSeats.includes(posKey);
      const isDisabled = !isDeleted && disabledSeats.includes(posKey);
      const colLabel = computeAxisLabel(c, rowCols, naming.colFormat, naming.colDirection, colStartAt);
      const key = `${section}-${rowLabel}-${colLabel}`;
      const computedLabel = `${rowLabel}${colLabel}`;
      seats.push({
        key, r, c, posKey,
        rowLabel, colLabel,
        label: labelOverrides[posKey] ?? computedLabel,
        computedLabel,
        categoryId: overrides[posKey] || row.categoryId,
        status: isDeleted ? 'deleted' : isDisabled ? 'disabled' : (seatStatusOverrides[`${row.id}-${posKey}`] || 'available'),
      });
    }
  }
  return seats;
}

// Regroupe les sièges par rangée avec leur label — utilisé pour le rendu row-by-row
// Respecte rowOrder (permutation) pour le réordonnancement des rangées
function seatGridByRow(row) {
  const all = seatGrid(row);
  const rowOverrides = row.rowOverrides || {};
  const order = (row.rowOrder?.length === row.rows)
    ? row.rowOrder
    : Array.from({ length: row.rows }, (_, i) => i);
  return order.map((dataR, displayPos) => {
    const rOver = rowOverrides[dataR] || {};
    const rowLabel = rOver.label != null ? rOver.label : computeAxisLabel(dataR, row.rows, row.rowFormat || 'A-Z', row.rowDirection || 'normal');
    const colOffset = rOver.colOffset ?? 0;
    return { r: dataR, displayPos, rowLabel, colOffset, seats: all.filter((s) => s.r === dataR) };
  });
}

function tableSeats(t) {
  const section = t.section || t.label || t.id;
  const disabled = t.disabledSeats || [];
  return Array.from({ length: t.seatCount || 6 }, (_, i) => ({
    index: i,
    key: `${section}-${i + 1}`,
    status: disabled.includes(i) ? 'disabled' : (seatStatusOverrides[`tz:${t.id}|${i}`] || 'available'),
    categoryId: t.categoryId,
  }));
}

function tableSectionSeats(ts) {
  const section = ts.section || ts.label || ts.id;
  const disabled = ts.disabledSeats || [];
  const deleted  = ts.deletedSeats  || [];
  const cols = ts.tableCount || 3;
  const rows = ts.tableRows || 1;
  const totalTables = cols * rows;
  const seatsOverrides = ts.tableSeatsOverrides || {};
  const rotOverrides   = ts.tableRotationOverrides || {};
  const seats = [];
  for (let ti = 0; ti < totalTables; ti++) {
    const seatsCount = seatsOverrides[ti] !== undefined ? Number(seatsOverrides[ti]) : (ts.seatsPerTable || 6);
    const rotRad = ((rotOverrides[ti] || 0) * Math.PI) / 180;
    for (let si = 0; si < seatsCount; si++) {
      const posKey = `${ti}-${si}`;
      const isDeleted  = deleted.includes(posKey);
      const isDisabled = !isDeleted && disabled.includes(posKey);
      seats.push({
        tableIndex: ti, seatIndex: si, seatsCount, rotRad,
        key: `${section}-${ti + 1}-${si + 1}`,
        status: isDeleted ? 'deleted' : isDisabled ? 'disabled' : (seatStatusOverrides[`tse:${ts.id}|${ti}-${si}`] || 'available'),
        categoryId: ts.categoryId,
      });
    }
  }
  return seats;
}

// Computed: all seat keys (for duplicate detection)
const allSeatKeys = computed(() => {
  const keys = [];
  for (const r of seatRows.value) {
    const section = r.section || r.label || r.id;
    const disabled = r.disabledSeats || [];
    for (let row = 0; row < (r.rows || 0); row++) {
      for (let col = 0; col < (r.cols || 0); col++) {
        if (disabled.includes(`${row}-${col}`)) continue;
        const rl = computeAxisLabel(row, r.rows, r.rowFormat, r.rowDirection);
        const cl = computeAxisLabel(col, r.cols, r.colFormat, r.colDirection);
        keys.push(`${section}-${rl}-${cl}`);
      }
    }
  }
  for (const t of tableZones.value) {
    const section = t.section || t.label || t.id;
    const disabled = t.disabledSeats || [];
    for (let i = 0; i < (t.seatCount || 6); i++) {
      if (!disabled.includes(i)) keys.push(`${section}-${i + 1}`);
    }
  }
  for (const ts of tableSections.value) {
    const section = ts.section || ts.label || ts.id;
    const disabled = ts.disabledSeats || [];
    const totalTables = (ts.tableCount || 3) * (ts.tableRows || 1);
    for (let ti = 0; ti < totalTables; ti++) {
      for (let si = 0; si < (ts.seatsPerTable || 6); si++) {
        if (!disabled.includes(`${ti}-${si}`)) keys.push(`${section}-${ti + 1}-${si + 1}`);
      }
    }
  }
  return keys;
});

const duplicateKeys = computed(() => {
  const counts = {};
  for (const k of allSeatKeys.value) counts[k] = (counts[k] || 0) + 1;
  return Object.keys(counts).filter(k => counts[k] > 1);
});

const anomaliesOpen = ref(true);
const hoveredTableSection = ref(null);
const anomalies = computed(() => {
  const issues = [];

  if (duplicateKeys.value.length > 0) {
    issues.push({ type: 'duplicate', label: `${duplicateKeys.value.length} siège(s) en doublon`, keys: duplicateKeys.value });
  }

  const missingSection = [
    ...seatRows.value.filter(x => !x.section).map(x => ({ id: x.id, kind: 'seatRow', label: x.label || x.id })),
    ...tableZones.value.filter(x => !x.section).map(x => ({ id: x.id, kind: 'tableZone', label: x.label || x.id })),
    ...tableSections.value.filter(x => !x.section).map(x => ({ id: x.id, kind: 'tableSection', label: x.label || x.id })),
  ];
  if (missingSection.length > 0) {
    issues.push({ type: 'section', label: `${missingSection.length} élément(s) sans section définie`, items: missingSection });
  }

  // catégories valides = existantes ET non marquées pour suppression
  const catIds = new Set(categories.value.filter(c => !pendingCatDeletions.has(c.id)).map(c => c.id));
  const missingCategory = [
    ...seatRows.value.filter(x => !x.categoryId || !catIds.has(x.categoryId)).map(x => ({ id: x.id, kind: 'seatRow', label: x.section || x.label || x.id })),
    ...tableZones.value.filter(x => !x.categoryId || !catIds.has(x.categoryId)).map(x => ({ id: x.id, kind: 'tableZone', label: x.section || x.label || x.id })),
    ...tableSections.value.filter(x => !x.categoryId || !catIds.has(x.categoryId)).map(x => ({ id: x.id, kind: 'tableSection', label: x.section || x.label || x.id })),
  ];
  if (missingCategory.length > 0) {
    issues.push({ type: 'category', label: `${missingCategory.length} élément(s) sans catégorie définie`, items: missingCategory });
  }

  return issues;
});

function findObjectByKey(key) {
  for (const r of seatRows.value) {
    const section = r.section || r.label || r.id;
    const disabled = r.disabledSeats || [];
    for (let row = 0; row < (r.rows || 0); row++) {
      for (let col = 0; col < (r.cols || 0); col++) {
        if (disabled.includes(`${row}-${col}`)) continue;
        const rl = computeAxisLabel(row, r.rows, r.rowFormat, r.rowDirection);
        const cl = computeAxisLabel(col, r.cols, r.colFormat, r.colDirection);
        if (`${section}-${rl}-${cl}` === key) return { kind: 'seatRow', obj: r };
      }
    }
  }
  for (const t of tableZones.value) {
    const section = t.section || t.label || t.id;
    const disabled = t.disabledSeats || [];
    for (let i = 0; i < (t.seatCount || 6); i++) {
      if (!disabled.includes(i) && `${section}-${i + 1}` === key) return { kind: 'tableZone', obj: t };
    }
  }
  for (const ts of tableSections.value) {
    const section = ts.section || ts.label || ts.id;
    const disabled = ts.disabledSeats || [];
    for (let ti = 0; ti < (ts.tableCount || 3); ti++) {
      for (let si = 0; si < (ts.seatsPerTable || 6); si++) {
        if (!disabled.includes(`${ti}-${si}`) && `${section}-${ti + 1}-${si + 1}` === key) return { kind: 'tableSection', obj: ts };
      }
    }
  }
  return null;
}

function selectAnomalyItem(anomaly, item = null) {
  if (anomaly.type === 'duplicate') {
    const key = item?.key ?? anomaly.keys?.[0];
    if (!key) return;
    const found = findObjectByKey(key);
    if (!found) return;
    if (found.kind === 'seatRow') selectSeatRow(found.obj);
    else if (found.kind === 'tableZone') selectTableZone(found.obj);
    else selectTableSection(found.obj);
  } else {
    const target = item ?? anomaly.items?.[0];
    if (!target) return;
    if (target.kind === 'seatRow') { const r = seatRows.value.find(x => x.id === target.id); if (r) selectSeatRow(r); }
    else if (target.kind === 'tableZone') { const t = tableZones.value.find(x => x.id === target.id); if (t) selectTableZone(t); }
    else { const ts = tableSections.value.find(x => x.id === target.id); if (ts) selectTableSection(ts); }
  }
}

const canSave = computed(() => anomalies.value.length === 0);

const selectedZone = computed(() => selected.value?.kind === 'zone' ? zones.value.find((z) => z.id === selected.value.id) : null);
const selectedSeatRow = computed(() => {
  if (selected.value?.kind === 'seatRow')    return seatRows.value.find((r) => r.id === selected.value.id) ?? null;
  if (selected.value?.kind === 'seatRowRow') return seatRows.value.find((r) => r.id === selected.value.rowId) ?? null;
  return null;
});
// Index de la rangée sélectionnée dans le bloc (-1 si le bloc entier est sélectionné)
const selectedRowIndex = computed(() => selected.value?.kind === 'seatRowRow' ? selected.value.r : -1);
const selectedFreeZone = computed(() => selected.value?.kind === 'freeZone' ? freeZones.value.find((f) => f.id === selected.value.id) : null);
const selectedTableZone = computed(() => selected.value?.kind === 'tableZone' ? tableZones.value.find((t) => t.id === selected.value.id) : null);
const selectedTableSection = computed(() => selected.value?.kind === 'tableSection' ? tableSections.value.find((ts) => ts.id === selected.value.id) : null);
const selectedTextLabel = computed(() => selected.value?.kind === 'textLabel' ? textLabels.value.find((tl) => tl.id === selected.value.id) : null);
const selectedImageLayer = computed(() => selected.value?.kind === 'imageLayer' ? imageLayers.value.find((il) => il.id === selected.value.id) : null);
const selectedTableSectionSeat = computed(() => {
  if (selected.value?.kind !== 'tableSectionSeat') return null;
  const ts = tableSections.value.find((x) => x.id === selected.value.tsId);
  if (!ts) return null;
  return { ts, ...selected.value.seatInfo };
});
const selectedTableSectionTable = computed(() => {
  if (selected.value?.kind !== 'tableSectionTable') return null;
  const ts = tableSections.value.find((x) => x.id === selected.value.tsId);
  if (!ts) return null;
  return { ts, tableIndex: selected.value.tableIndex };
});
const selectedSeat = computed(() => {
  if (selected.value?.kind !== 'seat') return null;
  const row = seatRows.value.find((r) => r.id === selected.value.rowId);
  if (!row) return null;
  return { row, ...selected.value.seatInfo };
});
const selectedTableSeat = computed(() => {
  if (selected.value?.kind !== 'tableSeat') return null;
  const t = tableZones.value.find((x) => x.id === selected.value.tableId);
  if (!t) return null;
  return { table: t, ...selected.value.seatInfo };
});

function selectZone(z) { selected.value = { kind: 'zone', id: z.id }; multiSelected.clear(); }
function selectSeatRow(r) { selected.value = { kind: 'seatRow', id: r.id }; multiSelected.clear(); }
function selectFreeZone(f) { selected.value = { kind: 'freeZone', id: f.id }; multiSelected.clear(); }
function selectTableZone(t) { selected.value = { kind: 'tableZone', id: t.id }; multiSelected.clear(); }
function selectTableSection(ts) { selected.value = { kind: 'tableSection', id: ts.id }; multiSelected.clear(); }
function selectTextLabel(tl) { selected.value = { kind: 'textLabel', id: tl.id }; multiSelected.clear(); }
function selectImageLayer(il) { selected.value = { kind: 'imageLayer', id: il.id }; multiSelected.clear(); }
function selectTableSectionTable(ts, tableIndex) { selected.value = { kind: 'tableSectionTable', tsId: ts.id, tableIndex }; multiSelected.clear(); }
function selectTableSectionSeat(ts, seat) {
  selected.value = { kind: 'tableSectionSeat', tsId: ts.id, seatInfo: seat };
  multiSelected.clear();
}
function selectSeat(row, seat) {
  selected.value = { kind: 'seat', rowId: row.id, seatId: seat.key, seatInfo: seat };
  multiSelected.clear();
}
function selectTableSeat(t, seat) {
  selected.value = { kind: 'tableSeat', tableId: t.id, seatInfo: seat };
  multiSelected.clear();
}
function deselect() { selected.value = null; multiSelected.clear(); selectedObjects.clear(); }

// ---------- Clic sur un siège : sélectionne toute la rangée ----------
function onSeatClick(row, seat, ev) {
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
    // Multi-sélection : on garde le comportement siège-par-siège
    selected.value = null;
    const key = `${row.id}|${seat.posKey}`;
    if (multiSelected.has(key)) multiSelected.delete(key); else multiSelected.add(key);
  } else {
    // Sélectionne toute la rangée (même r) pour l'édition
    selected.value = { kind: 'seatRowRow', rowId: row.id, r: seat.r };
    multiSelected.clear();
  }
}
// Helper : lire/écrire un champ dans rowOverrides[r]
function setRowOverride(row, r, field, value) {
  if (!row.rowOverrides) row.rowOverrides = {};
  if (!row.rowOverrides[r]) row.rowOverrides[r] = {};
  if (value === '' || value === undefined || value === null) {
    delete row.rowOverrides[r][field];
  } else {
    row.rowOverrides[r][field] = value;
  }
  scheduleSave();
}
function isMultiSelected(row, seat) {
  return multiSelected.has(`${row.id}|${seat.posKey}`);
}
function onTableSeatClick(t, seat, ev) {
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
    selected.value = null;
    const key = `tz:${t.id}|${seat.index}`;
    if (multiSelected.has(key)) multiSelected.delete(key); else multiSelected.add(key);
  } else {
    selectTableSeat(t, seat);
  }
}
function isMultiSelectedTableSeat(t, seat) {
  return multiSelected.has(`tz:${t.id}|${seat.index}`);
}
function onTableSectionSeatClick(ts, seat, ev) {
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
    selected.value = null;
    const key = `tse:${ts.id}|${seat.tableIndex}-${seat.seatIndex}`;
    if (multiSelected.has(key)) multiSelected.delete(key); else multiSelected.add(key);
  } else {
    selectTableSectionSeat(ts, seat);
  }
}
function isMultiSelectedTableSectionSeat(ts, seat) {
  return multiSelected.has(`tse:${ts.id}|${seat.tableIndex}-${seat.seatIndex}`);
}

// ---------- Déplacement (zones, blocs de sièges, zones libres) ----------
const zCounter = ref(1);
function bringToFront(item) {
  item.zIndex = ++zCounter.value;
}

function startDrag(ev, kind, item) {
  if (ev.button !== 0) return;
  marqueeJustFinished = false;
  // Ctrl/Cmd/Maj + clic : ajoute ou retire l'objet de la sélection multiple
  if (ev.ctrlKey || ev.metaKey || ev.shiftKey) {
    ev.preventDefault();
    ev.stopPropagation();
    toggleObjectSelection(kind, item);
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
  // Glisser un objet déjà dans la sélection déplace tout le groupe
  const inGroup = isObjectSelected(kind, item.id) && selectedObjects.size > 1;
  if (!inGroup) {
    clearObjectSelection();
    if (kind !== 'imageLayer') bringToFront(item);
    if (kind === 'zone') selectZone(item);
    else if (kind === 'seatRow') selectSeatRow(item);
    else if (kind === 'tableZone') selectTableZone(item);
    else if (kind === 'tableSection') selectTableSection(item);
    else if (kind === 'textLabel') selectTextLabel(item);
    else if (kind === 'imageLayer') selectImageLayer(item);
    else selectFreeZone(item);
  }
  const canvasRect = canvasRef.value.getBoundingClientRect();
  const z = zoom.value;
  drag.active = true;
  drag.mode = 'move';
  drag.kind = kind;
  drag.id = item.id;
  drag.moved = false;
  drag.originLeft = item.left;
  drag.originTop  = item.top;
  drag.group = inGroup
    ? objectsInSelection().map(({ kind: k, obj }) => ({ kind: k, id: obj.id, left: obj.left || 0, top: obj.top || 0 }))
    : null;
  drag.offsetX = (ev.clientX - canvasRect.left) / z - item.left;
  drag.offsetY = (ev.clientY - canvasRect.top)  / z - item.top;
  // Déterminer la zone parente d'un seatRow (pour contraindre le déplacement)
  drag.parentZone = (kind === 'seatRow' && !drag.group) ? findParentZone(item) : null;
  // Déplacer un bloc emmène les groupes de rangées qui lui sont rattachés
  const movedIds = drag.group ? drag.group.map((g) => g.id) : [item.id];
  drag.children = [];
  for (const mid of movedIds) {
    for (const c of attachedGroupsOf(mid)) {
      if (movedIds.includes(c.id)) continue; // déjà déplacé par la sélection multiple
      drag.children.push({ id: c.id, left: c.left || 0, top: c.top || 0 });
    }
  }
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDrag);
}

function seatRowPixelSize(row) {
  const cellSize = (row.seatSize || 22) + 4;
  return { w: (row.cols || 1) * cellSize + 28, h: (row.rows || 1) * cellSize + 20 };
}

// ---------- Groupes de rangées rattachés à une section ----------
// Un groupe est un seatRow marqué isGroup : mêmes réglages qu'un bloc, mais il
// vit à côté d'une section et adopte son préfixe de clés sans fusionner sa grille.
const hoveredSeatRowTarget = ref(null);

// Sections nommées déjà présentes sur le plan
const existingSections = computed(() => {
  const names = new Set();
  for (const r of seatRows.value)       if (r.section) names.add(r.section);
  for (const t of tableZones.value)     if (t.section) names.add(t.section);
  for (const ts of tableSections.value) if (ts.section) names.add(ts.section);
  return [...names].sort();
});

// Géométrie du rendu d'un bloc : bordure 1px + padding 6px de .editor-seat-card,
// puis une rangée tous les (seatSize + 6px de gap).
const CARD_INSET = 7;
const ROW_GAP = 6;
// Un groupe est rendu sans carte : ses sièges commencent à son bord exact
function cardInsetOf(row) { return row.isGroup ? 0 : CARD_INSET; }
function rowTopOffset(row, displayPos) {
  return cardInsetOf(row) + displayPos * ((row.seatSize || 22) + ROW_GAP);
}
// Groupes rattachés à un bloc — ils font partie de la section et suivent ses déplacements
function attachedGroupsOf(rowId) {
  return seatRows.value.filter((r) => r.isGroup && r.parentRowId === rowId);
}

// Faire pivoter un bloc doit emmener ses groupes : ils reprennent l'angle et
// leur position tourne autour du centre du bloc, sinon ils restent en place
// pendant que la section pivote sous eux.
function rotateAttachedGroups(parent, prevRotation) {
  const deltaDeg = (parent.rotation || 0) - (prevRotation || 0);
  if (!deltaDeg) return [];
  const rad = (deltaDeg * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const pb = seatRowPixelSize(parent);
  const pcx = (parent.left || 0) + pb.w / 2;
  const pcy = (parent.top  || 0) + pb.h / 2;

  const moved = [];
  for (const g of attachedGroupsOf(parent.id)) {
    const gb = seatRowPixelSize(g);
    // Les deux objets pivotent autour de leur propre centre : on déplace donc
    // le centre du groupe, pas son coin haut-gauche.
    const dx = (g.left || 0) + gb.w / 2 - pcx;
    const dy = (g.top  || 0) + gb.h / 2 - pcy;
    g.left = Math.round(pcx + dx * cos - dy * sin - gb.w / 2);
    g.top  = Math.round(pcy + dx * sin + dy * cos - gb.h / 2);
    g.rotation = parent.rotation || 0;
    moved.push(g);
  }
  return moved;
}

function onSeatRowRotate(row, value) {
  if (!row) return;
  const prev = Number(row.rotation || 0);
  row.rotation = Number(value) || 0;
  rotateAttachedGroups(row, prev);
  scheduleSave();
}

function displayOrder(row) {
  return (row.rowOrder?.length === row.rows)
    ? row.rowOrder
    : Array.from({ length: row.rows || 1 }, (_, i) => i);
}
function rowLabelAt(row, dataR) {
  const ov = (row.rowOverrides || {})[dataR] || {};
  return ov.label != null && ov.label !== ''
    ? String(ov.label)
    : computeAxisLabel(dataR, row.rows, row.rowFormat || 'A-Z', row.rowDirection || 'normal');
}
function rowColsAt(row, dataR) {
  const ov = (row.rowOverrides || {})[dataR] || {};
  return ov.cols != null ? ov.cols : (row.cols || 1);
}
function rowStartAt(row, dataR) {
  const ov = (row.rowOverrides || {})[dataR] || {};
  return ov.colStartAt != null ? ov.colStartAt : 0;
}
function setRowOver(row, dataR, patch) {
  const all = { ...(row.rowOverrides || {}) };
  all[dataR] = { ...(all[dataR] || {}), ...patch };
  row.rowOverrides = all;
}

// Cale le groupe sur la rangée du bloc la plus proche et lui en donne l'identité :
// même hauteur, mêmes sièges, même catégorie, même libellé de rangée, et une
// numérotation de colonnes qui prolonge celle du bloc du bon côté.
function snapGroupToRow(group, target) {
  const order = displayOrder(target);
  let bestPos = 0, bestDist = Infinity;
  for (let p = 0; p < order.length; p++) {
    const d = Math.abs((target.top || 0) + rowTopOffset(target, p) - ((group.top || 0) + cardInsetOf(group)));
    if (d < bestDist) { bestDist = d; bestPos = p; }
  }

  // Apparence reprise du bloc (avant le calcul de position : la hauteur en dépend)
  group.seatSize   = target.seatSize || 22;
  group.shape      = target.shape || 'square';
  group.categoryId = target.categoryId;
  group.rotation   = group.rotation || 0;

  // Aligner la 1re rangée du groupe sur celle du bloc, insets compris
  group.top = Math.max(0, Math.round(
    (target.top || 0) + rowTopOffset(target, bestPos) - cardInsetOf(group),
  ));

  const tBox = seatRowPixelSize(target);
  const gBox = seatRowPixelSize(group);
  const onLeft = (group.left || 0) + gBox.w / 2 < (target.left || 0) + tBox.w / 2;

  const labels = [];
  for (let k = 0; k < (group.rows || 1); k++) {
    const dataR = order[Math.min(bestPos + k, order.length - 1)];
    const label = rowLabelAt(target, dataR);
    const gCols = rowColsAt(group, k);
    if (onLeft) {
      // Le groupe précède le bloc : il prend les premiers numéros, le bloc décale d'autant
      setRowOver(group, k, { label, colStartAt: 0 });
      setRowOver(target, dataR, { colStartAt: gCols });
    } else {
      // Le groupe prolonge la rangée : il démarre après le dernier siège du bloc
      setRowOver(group, k, { label, colStartAt: rowStartAt(target, dataR) + rowColsAt(target, dataR) });
    }
    labels.push(label);
  }
  return { labels, onLeft, target };
}

async function attachGroupToSection(group, sectionName, target = null) {
  if (!group || !sectionName) return;
  group.section = sectionName;
  // À défaut de cible explicite (choix par la liste), on prend le bloc de la
  // section dont une rangée est la plus proche verticalement.
  const block = target ?? seatRows.value
    .filter((r) => !r.isGroup && r.section === sectionName)
    .sort((a, b) => Math.abs((a.top || 0) - (group.top || 0)) - Math.abs((b.top || 0) - (group.top || 0)))[0];

  let labels = [];
  if (block) {
    labels = snapGroupToRow(group, block).labels;
    await adminApi.updateSeatRow(block.id, { rowOverrides: block.rowOverrides }, props.venueId);
  }

  // Le lien parent fait du groupe un membre de la section : il suit le bloc
  group.parentRowId = block?.id ?? null;

  await adminApi.updateSeatRow(group.id, {
    section: group.section,
    parentRowId: group.parentRowId,
    top: group.top, left: group.left,
    seatSize: Number(group.seatSize), shape: group.shape,
    categoryId: group.categoryId,
    rowOverrides: group.rowOverrides,
  }, props.venueId);

  isDirty.value = true;
  emit('changed');
  showToast(block
    ? `Groupe calé sur la rangée ${labels.join(', ')} de « ${sectionName} »`
    : `Groupe rattaché à « ${sectionName} »`, 'success', 3500);
}

async function detachGroup(group) {
  if (!group) return;
  group.section = '';
  group.parentRowId = null;
  await adminApi.updateSeatRow(group.id, { section: '', parentRowId: null }, props.venueId);
  isDirty.value = true;
  emit('changed');
}

function onGroupSectionChange(ev) {
  const row = selectedSeatRow.value;
  if (!row) return;
  const name = ev.target.value;
  if (!name) { detachGroup(row); return; }
  attachGroupToSection(row, name);
}

function findParentZone(row) {
  const { w, h } = seatRowPixelSize(row);
  const cx = (row.left || 0) + w / 2;
  const cy = (row.top  || 0) + h / 2;
  return zones.value.find((z) =>
    cx >= (z.left || 0) && cx <= (z.left || 0) + (z.width  || 200) &&
    cy >= (z.top  || 0) && cy <= (z.top  || 0) + (z.height || 70)
  ) ?? null;
}

// ---------- Redimensionnement (zones + zones libres), par côté ----------
function startResize(ev, kind, item, side) {
  ev.preventDefault();
  ev.stopPropagation();
  if (kind === 'zone') selectZone(item); else selectFreeZone(item);
  drag.active = true;
  drag.mode = 'resize';
  drag.side = side;
  drag.kind = kind;
  drag.id = item.id;
  drag.moved = false;
  drag.startW = item.width;
  drag.startH = item.height;
  drag.startLeft = item.left;
  drag.startTop = item.top;
  drag.startX = ev.clientX;
  drag.startY = ev.clientY;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDrag);
}

// ---------- Redimensionnement dynamique d'un bloc de sièges, par côté ----------
// Côté gauche/droit -> ajoute/retire des COLONNES (sièges par rang) · côté haut/bas -> ajoute/retire des RANGÉES
function startResizeSeatRow(ev, row, side) {
  ev.preventDefault();
  ev.stopPropagation();
  selectSeatRow(row);
  drag.active = true;
  drag.mode = 'resizeSeatRow';
  drag.side = side;
  drag.kind = 'seatRow';
  drag.id = row.id;
  drag.baseRows = row.rows;
  drag.baseCols = row.cols;
  drag.moved = false;
  drag.cellSize = (row.seatSize || 18) + 6;
  drag.startX = ev.clientX;
  drag.startY = ev.clientY;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDrag);
}

function startResizeTableSection(ev, ts, side) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  ev.stopPropagation();
  selectTableSection(ts);
  drag.active = true;
  drag.mode = 'resizeTableSection';
  drag.side = side;
  drag.kind = 'tableSection';
  drag.id = ts.id;
  drag.baseTables = ts.tableCount || 3;
  drag.baseTableRows = ts.tableRows || 1;
  drag.startLeft = ts.left;
  drag.startTop = ts.top;
  drag.startW = tableSectionWidth(ts);
  drag.startH = tableSectionHeight(ts);
  drag.moved = false;
  drag.hCellSize = tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2);
  drag.startX = ev.clientX;
  drag.startY = ev.clientY;
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', stopDrag);
}

function listFor(kind) {
  if (kind === 'zone') return zones.value;
  if (kind === 'freeZone') return freeZones.value;
  if (kind === 'tableZone') return tableZones.value;
  if (kind === 'tableSection') return tableSections.value;
  if (kind === 'textLabel') return textLabels.value;
  if (kind === 'imageLayer') return imageLayers.value;
  return seatRows.value;
}

async function persistDragChildren() {
  const children = drag.children || [];
  drag.children = [];
  for (const c of children) {
    const o = seatRows.value.find((x) => x.id === c.id);
    if (o) await persistPosition('seatRow', o);
  }
}

// Reporte le déplacement du bloc sur ses groupes rattachés
function moveDragChildren(dLeft, dTop) {
  if (!drag.children?.length) return;
  for (const c of drag.children) {
    const o = seatRows.value.find((x) => x.id === c.id);
    if (o) { o.left = Math.max(0, Math.round(c.left + dLeft)); o.top = Math.max(0, Math.round(c.top + dTop)); }
  }
}

function onPointerMove(ev) {
  if (!drag.active) return;
  drag.moved = true;
  const z = zoom.value;
  if (drag.mode === 'move') {
    const canvasRect = canvasRef.value.getBoundingClientRect();
    let newLeft = Math.max(0, Math.round((ev.clientX - canvasRect.left) / z - drag.offsetX));
    let newTop  = Math.max(0, Math.round((ev.clientY - canvasRect.top)  / z - drag.offsetY));
    const item = listFor(drag.kind).find((x) => x.id === drag.id);
    if (item) {
      if (drag.group) {
        // Borner le déplacement du groupe, pas chaque objet : sinon un objet
        // collé au bord se bloque et la mise en page se déforme.
        const minLeft = Math.min(...drag.group.map((g) => g.left));
        const minTop  = Math.min(...drag.group.map((g) => g.top));
        const dLeft = Math.max(newLeft - drag.originLeft, -minLeft);
        const dTop  = Math.max(newTop  - drag.originTop,  -minTop);
        for (const g of drag.group) {
          const o = listFor(g.kind).find((x) => x.id === g.id);
          if (o) { o.left = Math.round(g.left + dLeft); o.top = Math.round(g.top + dTop); }
        }
        moveDragChildren(dLeft, dTop);
      } else {
        // Contraindre le seatRow à rester dans sa zone parente
        if (drag.parentZone) {
          const pz = drag.parentZone;
          const { w, h } = seatRowPixelSize(item);
          newLeft = Math.max(pz.left || 0, Math.min((pz.left || 0) + (pz.width  || 200) - w, newLeft));
          newTop  = Math.max(pz.top  || 0, Math.min((pz.top  || 0) + (pz.height || 70)  - h, newTop));
        }
        item.left = newLeft; item.top = newTop;
        // Delta réellement appliqué (le clamp de zone parente a pu le réduire)
        moveDragChildren(item.left - drag.originLeft, item.top - drag.originTop);
      }
    }
    // Détection de survol d'une tableSection lors du drag d'une tableZone (jamais en groupe)
    if (drag.kind === 'tableZone' && item && !drag.group) {
      const tzSize = tableZoneSize(item);
      const tzCX = item.left + tzSize / 2;
      const tzCY = item.top  + tzSize / 2;
      hoveredTableSection.value = tableSections.value.find((ts) =>
        tzCX >= ts.left && tzCX <= ts.left + tableSectionWidth(ts) &&
        tzCY >= ts.top  && tzCY <= ts.top  + tableSectionHeight(ts)
      ) ?? null;
    } else {
      hoveredTableSection.value = null;
    }
    // Bloc visé pendant le déplacement d'un groupe de rangées.
    // Le groupe se pose à CÔTÉ du bloc (il en prolonge une rangée), donc on
    // accepte une marge horizontale au lieu d'exiger un recouvrement.
    if (drag.kind === 'seatRow' && item && item.isGroup && !drag.group) {
      const g = seatRowPixelSize(item);
      const cx = item.left + g.w / 2;
      const cy = item.top  + g.h / 2;
      const MARGIN = 160;
      let best = null, bestDist = Infinity;
      for (const r of seatRows.value) {
        if (r.id === item.id || r.isGroup || !r.section) continue;
        const b = seatRowPixelSize(r);
        // bande verticale du bloc, élargie d'une rangée
        const rowH = (r.seatSize || 22) + ROW_GAP;
        if (cy < r.top - rowH || cy > r.top + b.h + rowH) continue;
        // distance horizontale au rectangle du bloc (0 si à l'intérieur)
        const dx = Math.max(r.left - cx, 0, cx - (r.left + b.w));
        if (dx > MARGIN) continue;
        if (dx < bestDist) { bestDist = dx; best = r; }
      }
      hoveredSeatRowTarget.value = best;
    } else {
      hoveredSeatRowTarget.value = null;
    }
  } else if (drag.mode === 'resize') {
    const item = listFor(drag.kind).find((x) => x.id === drag.id);
    if (item) {
      const dx = (ev.clientX - drag.startX) / z;
      const dy = (ev.clientY - drag.startY) / z;
      if (drag.side === 'right') {
        item.width = Math.max(40, Math.round(drag.startW + dx));
      } else if (drag.side === 'left') {
        const newW = Math.max(40, Math.round(drag.startW - dx));
        item.left = Math.max(0, Math.round(drag.startLeft + (drag.startW - newW)));
        item.width = newW;
      } else if (drag.side === 'bottom') {
        item.height = Math.max(30, Math.round(drag.startH + dy));
      } else if (drag.side === 'top') {
        const newH = Math.max(30, Math.round(drag.startH - dy));
        item.top = Math.max(0, Math.round(drag.startTop + (drag.startH - newH)));
        item.height = newH;
      }
    }
  } else if (drag.mode === 'resizeSeatRow') {
    const item = seatRows.value.find((x) => x.id === drag.id);
    if (item) {
      // Ramène le déplacement souris dans le repère du bloc (rotation inverse).
      const rot = ((item.rotation || 0) * Math.PI) / 180;
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const mx = (ev.clientX - drag.startX) / z;
      const my = (ev.clientY - drag.startY) / z;
      const dx =  mx * cos + my * sin;
      const dy = -mx * sin + my * cos;
      if (drag.side === 'right') {
        item.cols = Math.max(1, drag.baseCols + Math.round(dx / drag.cellSize));
      } else if (drag.side === 'left') {
        item.cols = Math.max(1, drag.baseCols - Math.round(dx / drag.cellSize));
      } else if (drag.side === 'bottom') {
        item.rows = Math.max(1, drag.baseRows + Math.round(dy / drag.cellSize));
      } else if (drag.side === 'top') {
        item.rows = Math.max(1, drag.baseRows - Math.round(dy / drag.cellSize));
      }
    }
  } else if (drag.mode === 'resizeTableSection') {
    const item = tableSections.value.find((x) => x.id === drag.id);
    if (item) {
      const dx = (ev.clientX - drag.startX) / z;
      const dy = (ev.clientY - drag.startY) / z;
      if (drag.side === 'right') {
        item.tableCount = Math.max(1, drag.baseTables + Math.round(dx / drag.hCellSize));
      } else if (drag.side === 'left') {
        const newCount = Math.max(1, drag.baseTables - Math.round(dx / drag.hCellSize));
        item.left = Math.max(0, Math.round(drag.startLeft + drag.startW - tableSectionWidth(item)));
        item.tableCount = newCount;
      } else if (drag.side === 'bottom') {
        item.tableRows = Math.max(1, drag.baseTableRows + Math.round(dy / drag.hCellSize));
      } else if (drag.side === 'top') {
        const newRows = Math.max(1, drag.baseTableRows - Math.round(dy / drag.hCellSize));
        item.top = Math.max(0, Math.round(drag.startTop + drag.startH - tableSectionHeight({ ...item, tableRows: newRows })));
        item.tableRows = newRows;
      }
    }
  }
}

async function stopDrag() {
  if (!drag.active) return;
  const mode = drag.mode, kind = drag.kind, id = drag.id;
  drag.active = false;
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', stopDrag);

  const item = listFor(kind).find((x) => x.id === id);
  if (!item || !drag.moved) {
    hoveredTableSection.value = null;
    hoveredSeatRowTarget.value = null;
    drag.group = null;
    drag.children = [];
    return;
  }
  isDirty.value = true;

  // Déplacement groupé : on enregistre la nouvelle position de chaque objet
  if (mode === 'move' && drag.group) {
    const group = drag.group;
    drag.group = null;
    hoveredTableSection.value = null;
    for (const g of group) {
      const o = listFor(g.kind).find((x) => x.id === g.id);
      if (o) await persistPosition(g.kind, o);
    }
    await persistDragChildren();
    emit('changed');
    scheduleAutoSave();
    return;
  }

  // Fusion d'une tableZone dans une tableSection survolée
  if (mode === 'move' && kind === 'tableZone' && hoveredTableSection.value) {
    const ts = hoveredTableSection.value;
    hoveredTableSection.value = null;
    const unit = tableSectionUnitSize(ts);
    const newIndex = (ts.tableCount || 3); // index 0-based de la nouvelle table
    const dropXInSection = item.left - ts.left;
    const rawSpacing = newIndex > 0
      ? (dropXInSection - TS_PAD - newIndex * unit) / newIndex
      : (ts.tableSpacing ?? 2);
    ts.tableSpacing = Math.max(0, Math.round(rawSpacing));
    // Hérite catégorie et section de la tableZone si la section n'en a pas
    if (!ts.categoryId && item.categoryId) ts.categoryId = item.categoryId;
    if (!ts.section && item.section) ts.section = item.section;
    // Copie du nombre de sièges si différent du défaut de la section
    if (item.seatCount && item.seatCount !== (ts.seatsPerTable || 6)) {
      if (!ts.tableSeatsOverrides) ts.tableSeatsOverrides = {};
      ts.tableSeatsOverrides[newIndex] = item.seatCount;
    }
    ts.tableCount = newIndex + 1;
    tableZones.value = tableZones.value.filter((x) => x.id !== item.id);
    await adminApi.deleteTableZone(item.id, props.venueId);
    await adminApi.updateTableSection(ts.id, {
      tableCount: ts.tableCount,
      tableSpacing: ts.tableSpacing,
      tableSeatsOverrides: ts.tableSeatsOverrides || {},
      categoryId: ts.categoryId,
      section: ts.section,
    }, props.venueId);
    emit('changed');
    scheduleAutoSave();
    return;
  }
  hoveredTableSection.value = null;

  // Rattachement d'un groupe de rangées lâché sur le bloc d'une section
  if (mode === 'move' && kind === 'seatRow' && item.isGroup && hoveredSeatRowTarget.value) {
    const target = hoveredSeatRowTarget.value;
    hoveredSeatRowTarget.value = null;
    await attachGroupToSection(item, target.section, target);
    scheduleAutoSave();
    return;
  }
  hoveredSeatRowTarget.value = null;

  if (mode === 'move') {
    await persistPosition(kind, item);
    await persistDragChildren();
  } else if (mode === 'resize') {
    if (kind === 'zone') await adminApi.updateZone(item.id, { width: item.width, height: item.height, top: item.top, left: item.left }, props.venueId);
    else await adminApi.updateFreeZone(item.id, { width: item.width, height: item.height, top: item.top, left: item.left }, props.venueId);
  } else if (mode === 'resizeTableSection') {
    await adminApi.updateTableSection(item.id, { tableCount: item.tableCount, tableRows: item.tableRows || 1, top: item.top, left: item.left }, props.venueId);
  } else if (mode === 'resizeSeatRow') {
    await adminApi.updateSeatRow(item.id, { rows: item.rows, cols: item.cols }, props.venueId);
  }
  emit('changed');
  // Les coordonnées ont muté pendant le pointermove (drag.active bloquait alors
  // l'auto-save) : on relance explicitement le compte à rebours après le drop.
  scheduleAutoSave();
}

// ---------- Réordonnancement des rangées à l'intérieur d'un bloc de sièges ----------
function startRowReorder(ev, row, displayPos, dataR) {
  ev.preventDefault();
  ev.stopPropagation();
  rowReorder.active = true;
  rowReorder.seatRowId = row.id;
  rowReorder.displayPos = displayPos;
  rowReorder.dataR = dataR;
  rowReorder.targetPos = displayPos;
  rowReorder.startY = ev.clientY;
  rowReorder.startX = ev.clientX;
  rowReorder.cellH = (row.seatSize || 22) + 6;
  rowReorder.cellW = (row.seatSize || 22) + 4;
  rowReorder.directionDecided = false;
  rowReorder.direction = null;
  rowReorder.initColOffset = row.rowOverrides?.[dataR]?.colOffset ?? 0;
  window.addEventListener('pointermove', onRowReorderMove);
  window.addEventListener('pointerup', stopRowReorder);
}

function onRowReorderMove(ev) {
  if (!rowReorder.active) return;
  const row = seatRows.value.find((r) => r.id === rowReorder.seatRowId);
  if (!row) return;
  const rawDx = (ev.clientX - rowReorder.startX) / zoom.value;
  const rawDy = (ev.clientY - rowReorder.startY) / zoom.value;

  // Quand le bloc est pivoté à 90°/270° les axes visuels sont inversés :
  // le mouvement Y de la souris correspond au déplacement latéral des sièges (colOffset)
  // et le mouvement X correspond à l'empilement des rangées (reorder).
  const rotated = (row.rotation || 0) % 180 !== 0;
  const dx = rotated ? rawDy : rawDx;
  const dy = rotated ? rawDx : rawDy;

  if (!rowReorder.directionDecided && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
    rowReorder.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    rowReorder.directionDecided = true;
  }
  if (!rowReorder.directionDecided) return;

  if (rowReorder.direction === 'horizontal') {
    const newOffset = Math.max(0, rowReorder.initColOffset + Math.round(dx / rowReorder.cellW));
    setRowOverride(row, rowReorder.dataR, 'colOffset', newOffset || null);
  } else {
    const shift = Math.round(dy / rowReorder.cellH);
    rowReorder.targetPos = Math.max(0, Math.min(row.rows - 1, rowReorder.displayPos + shift));
  }
}

function stopRowReorder() {
  window.removeEventListener('pointermove', onRowReorderMove);
  window.removeEventListener('pointerup', stopRowReorder);
  if (!rowReorder.active) return;
  const row = seatRows.value.find((r) => r.id === rowReorder.seatRowId);
  if (row && rowReorder.direction === 'vertical' && rowReorder.targetPos !== rowReorder.displayPos) {
    const base = Array.from({ length: row.rows }, (_, i) => i);
    const order = [...(row.rowOrder?.length === row.rows ? row.rowOrder : base)];
    const [moved] = order.splice(rowReorder.displayPos, 1);
    order.splice(rowReorder.targetPos, 0, moved);
    row.rowOrder = order;
    isDirty.value = true;
    scheduleAutoSave();
  }
  rowReorder.active = false;
  rowReorder.seatRowId = null;
  rowReorder.directionDecided = false;
  rowReorder.direction = null;
}

// ---------- Ajout ----------
async function addZone() {
  if (categories.value.length === 0) return;
  const z = await adminApi.createZone(props.venueId, {
    label: 'Nouvelle zone', categoryId: categories.value[0].id,
    top: 40, left: 40, width: 200, height: 70, capacity: 50, shape: 'rect', labelFontSize: 11,
  });
  zones.value.push(z);
  selectZone(z);
  isDirty.value = true;
  emit('changed');
}
async function addSeatRow(left = 40, top = 40) {
  if (categories.value.length === 0) return null;
  const r = await adminApi.createSeatRow(props.venueId, {
    section: '', label: 'Nouveau bloc', categoryId: categories.value[0].id,
    top, left, rows: 3, cols: 6, shape: 'square', seatSize: 20, rotation: 0,
  });
  seatRows.value.push(r);
  selectSeatRow(r);
  isDirty.value = true;
  emit('changed');
  return r;
}
// Petit groupe autonome : une rangée de 3 sièges, sans section tant qu'il n'est pas rattaché
async function addSeatRowGroup(left = 40, top = 40) {
  if (categories.value.length === 0) return null;
  const r = await adminApi.createSeatRow(props.venueId, {
    section: '', label: 'Groupe de rangées', categoryId: categories.value[0].id,
    top, left, rows: 1, cols: 3, shape: 'square', seatSize: 20, rotation: 0,
    isGroup: true,
  });
  seatRows.value.push(r);
  selectSeatRow(r);
  isDirty.value = true;
  emit('changed');
  return r;
}

async function addFreeZone(left = 300, top = 40) {
  const fz = await adminApi.createFreeZone(props.venueId, {
    label: 'Zone libre', icon: 'none', color: '#6b7280', pattern: 'solid',
    top, left, width: 110, height: 50, labelFontSize: 10,
  });
  freeZones.value.push(fz);
  selectFreeZone(fz);
  isDirty.value = true;
  emit('changed');
  return fz;
}
async function addTableSection(left = 80, top = 80) {
  if (categories.value.length === 0) return null;
  const ts = await adminApi.createTableSection(props.venueId, {
    section: '', label: 'Tables groupées', tableCount: 3, seatsPerTable: 6,
    tableRows: 1, tableSize: 30, seatSize: 13, seatLabelFontSize: 9, tableSpacing: 0,
    categoryId: categories.value[0].id,
    top, left, rowLabelFontSize: 10, disabledSeats: [],
  });
  tableSections.value.push(ts);
  selectTableSection(ts);
  isDirty.value = true;
  emit('changed');
  return ts;
}
async function addTableZone(left = 200, top = 80) {
  if (categories.value.length === 0) return null;
  const t = await adminApi.createTableZone(props.venueId, {
    section: '', label: 'Table', seatCount: 6,
    tableSize: 30, seatSize: 13, seatLabelFontSize: 9,
    categoryId: categories.value[0].id,
    top, left, rowLabelFontSize: 10, disabledSeats: [],
  });
  tableZones.value.push(t);
  selectTableZone(t);
  isDirty.value = true;
  emit('changed');
  return t;
}

// Ref pour le file input caché (outil Image)
const imageFileInputRef = ref(null);
let pendingImagePos = null; // { x, y } en coordonnées canvas

function pickAndAddImageLayer(x, y) {
  pendingImagePos = { x, y };
  imageFileInputRef.value?.click();
  // La création réelle se fait dans onImageFilePicked, retourne null ici
  // (on ne veut pas mettre en pause onCanvasPlacementClick)
  return null;
}

async function onImageFilePicked(ev) {
  const file = ev.target.files?.[0];
  ev.target.value = '';
  if (!file) return;
  const pos = pendingImagePos || { x: 40, y: 40 };
  pendingImagePos = null;
  const src = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
  const { w, h } = await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  });
  // Remplacement d'une image existante
  if (pos.replaceId) {
    const existing = imageLayers.value.find(il => il.id === pos.replaceId);
    if (existing) {
      existing.src = src;
      existing.naturalWidth = w;
      existing.naturalHeight = h;
      existing.fileName = file.name;
      existing.fileSize = file.size;
      await adminApi.updateImageLayer(existing.id, { src, naturalWidth: w, naturalHeight: h, fileName: file.name, fileSize: file.size }, props.venueId);
      isDirty.value = true;
      emit('changed');
    }
    return;
  }
  // Nouvelle image
  const il = await adminApi.createImageLayer(props.venueId, {
    src, naturalWidth: w, naturalHeight: h,
    left: pos.x, top: pos.y,
    scale: 1, rotation: 0, opacity: 1, layer: 'background',
    fileName: file.name, fileSize: file.size,
  });
  imageLayers.value.push(il);
  selectImageLayer(il);
  placementHistory.value.push({ kind: 'imageLayer', id: il.id });
  isDirty.value = true;
  emit('changed');
}

async function addTextLabel(left = 100, top = 100) {
  const tl = await adminApi.createTextLabel(props.venueId, {
    caption: 'Texte', fontSize: 16, color: '#111827',
    fontFamily: 'sans-serif', bold: false, italic: false,
    rotation: 0, top, left, zIndex: 1,
  });
  textLabels.value.push(tl);
  selectTextLabel(tl);
  isDirty.value = true;
  emit('changed');
  return tl;
}

// ---------- Copier / Coller / Dupliquer ----------
const KIND_LABELS = {
  zone: 'Zone', seatRow: 'Bloc de sièges', freeZone: 'Zone libre',
  tableZone: 'Table', tableSection: 'Section de tables',
  textLabel: 'Texte', imageLayer: 'Image',
};

const clipboard = ref(null); // { kind, data, name }
const pasting = ref(false);
let pasteCount = 0;          // décalage en cascade des collages successifs

// Élément sélectionné s'il est duplicable (un siège seul ne l'est pas)
const duplicable = computed(() => {
  if (selectedZone.value)         return { kind: 'zone',         obj: selectedZone.value };
  if (selectedSeatRow.value)      return { kind: 'seatRow',      obj: selectedSeatRow.value };
  if (selectedFreeZone.value)     return { kind: 'freeZone',     obj: selectedFreeZone.value };
  if (selectedTableZone.value)    return { kind: 'tableZone',    obj: selectedTableZone.value };
  if (selectedTableSection.value) return { kind: 'tableSection', obj: selectedTableSection.value };
  if (selectedTextLabel.value)    return { kind: 'textLabel',    obj: selectedTextLabel.value };
  if (selectedImageLayer.value)   return { kind: 'imageLayer',   obj: selectedImageLayer.value };
  return null;
});

function objectName(kind, obj) {
  return obj.section || obj.label || obj.caption || KIND_LABELS[kind];
}

// Une copie ne doit jamais réutiliser la même section : les clés de sièges seraient en doublon.
function uniqueSection(base) {
  const taken = new Set(
    [...seatRows.value, ...tableZones.value, ...tableSections.value].map((o) => o.section).filter(Boolean),
  );
  let i = 2;
  while (taken.has(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}
function uniqueLabel(kind, base) {
  const taken = new Set(listFor(kind).map((o) => o.label).filter(Boolean));
  if (!taken.has(`${base} (copie)`)) return `${base} (copie)`;
  let i = 2;
  while (taken.has(`${base} (copie ${i})`)) i++;
  return `${base} (copie ${i})`;
}

function selectByKind(kind, obj) {
  if (kind === 'zone') selectZone(obj);
  else if (kind === 'seatRow') selectSeatRow(obj);
  else if (kind === 'freeZone') selectFreeZone(obj);
  else if (kind === 'tableZone') selectTableZone(obj);
  else if (kind === 'tableSection') selectTableSection(obj);
  else if (kind === 'textLabel') selectTextLabel(obj);
  else if (kind === 'imageLayer') selectImageLayer(obj);
}

async function createFromClone(kind, src, dx, dy) {
  if (pasting.value) return null;
  pasting.value = true;
  try {
    const clone = JSON.parse(JSON.stringify(src));
    delete clone.id;
    delete clone.venueId;
    delete clone._type;
    clone.left = Math.max(0, Math.round((src.left || 0) + dx));
    clone.top  = Math.max(0, Math.round((src.top  || 0) + dy));
    if (clone.section) clone.section = uniqueSection(clone.section);
    if (clone.label)   clone.label   = uniqueLabel(kind, clone.label);
    // Les images sont empilées par leur `layer`, pas par le zIndex.
    if (kind !== 'imageLayer') clone.zIndex = ++zCounter.value;

    let created = null;
    if (kind === 'zone')              created = await adminApi.createZone(props.venueId, clone);
    else if (kind === 'seatRow')      created = await adminApi.createSeatRow(props.venueId, clone);
    else if (kind === 'freeZone')     created = await adminApi.createFreeZone(props.venueId, clone);
    else if (kind === 'tableZone')    created = await adminApi.createTableZone(props.venueId, clone);
    else if (kind === 'tableSection') created = await adminApi.createTableSection(props.venueId, clone);
    else if (kind === 'textLabel')    created = await adminApi.createTextLabel(props.venueId, clone);
    else if (kind === 'imageLayer')   created = await adminApi.createImageLayer(props.venueId, clone);
    if (!created) return null;

    listFor(kind).push(created);
    selectByKind(kind, created);
    isDirty.value = true;
    emit('changed');
    return created;
  } catch (e) {
    showToast(`Copie impossible : ${e.message}`, 'error', 4000);
    return null;
  } finally {
    pasting.value = false;
  }
}

function copySelected() {
  const sel = duplicable.value;
  if (!sel) return;
  clipboard.value = {
    kind: sel.kind,
    data: JSON.parse(JSON.stringify(sel.obj)),
    name: objectName(sel.kind, sel.obj),
  };
  pasteCount = 0;
  showToast(`${KIND_LABELS[sel.kind]} « ${clipboard.value.name} » copié`, 'info', 2000);
}

async function pasteClipboard() {
  if (!clipboard.value || pasting.value) return;
  pasteCount += 1;
  const off = 24 * pasteCount;
  const created = await createFromClone(clipboard.value.kind, clipboard.value.data, off, off);
  if (created) showToast(`${KIND_LABELS[clipboard.value.kind]} collé`, 'success', 2000);
}

async function duplicateSelected() {
  const sel = duplicable.value;
  if (!sel || pasting.value) return;
  const created = await createFromClone(sel.kind, sel.obj, 24, 24);
  if (created) showToast(`${KIND_LABELS[sel.kind]} dupliqué`, 'success', 2000);
}

// ---------- Sélection multiple d'objets ----------
const OBJECT_KINDS = ['zone', 'seatRow', 'freeZone', 'tableZone', 'tableSection', 'textLabel', 'imageLayer'];

const selectedObjects = reactive(new Set()); // clés "kind:id"
const marqueeMode = ref(false);
const marquee = reactive({ active: false, x0: 0, y0: 0, x1: 0, y1: 0 });
// Empêche le clic de fin de rectangle de vider la sélection qu'il vient de faire
let marqueeJustFinished = false;

function objKey(kind, id) { return `${kind}:${id}`; }
function splitObjKey(key) { const i = key.indexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; }
function isObjectSelected(kind, id) { return selectedObjects.has(objKey(kind, id)); }
function clearObjectSelection() { selectedObjects.clear(); }

function objectsInSelection() {
  return [...selectedObjects]
    .map(splitObjKey)
    .map(([kind, id]) => ({ kind, obj: listFor(kind).find((x) => x.id === id) }))
    .filter((x) => x.obj);
}

function toggleObjectSelection(kind, item) {
  const key = objKey(kind, item.id);
  if (selectedObjects.has(key)) selectedObjects.delete(key);
  else selectedObjects.add(key);
  selected.value = null;
  multiSelected.clear();
}

function selectAllObjects() {
  selected.value = null;
  multiSelected.clear();
  selectedObjects.clear();
  for (const kind of OBJECT_KINDS) {
    for (const o of listFor(kind)) selectedObjects.add(objKey(kind, o.id));
  }
  showToast(selectedObjects.size
    ? `${selectedObjects.size} objet(s) sélectionné(s)`
    : 'Aucun objet sur le plan', 'info', 2000);
}

function toggleMarqueeMode() {
  marqueeMode.value = !marqueeMode.value;
  if (marqueeMode.value) { activeTool.value = null; placementHistory.value = []; }
}

// Encombrement d'un objet en coordonnées canvas (même formules que canvasWidth/Height)
function objectBox(kind, o) {
  const ss = o.seatSize || 22;
  if (kind === 'seatRow') {
    const colW = (o.shape === 'rounded' ? ss * 1.5 : ss) + 4;
    return { left: o.left || 0, top: o.top || 0,
             width: (o.cols || 1) * colW + 28, height: (o.rows || 1) * (ss + 4) + 30 };
  }
  if (kind === 'tableZone') {
    const sz = tableZoneSize(o);
    return { left: o.left || 0, top: o.top || 0, width: sz, height: sz };
  }
  if (kind === 'tableSection') {
    return { left: o.left || 0, top: o.top || 0, width: tableSectionWidth(o), height: tableSectionHeight(o) };
  }
  if (kind === 'textLabel') {
    const fs = o.fontSize || 16;
    return { left: o.left || 0, top: o.top || 0,
             width: Math.max(24, (o.caption?.length || 4) * fs * 0.6), height: fs * 1.4 };
  }
  if (kind === 'imageLayer') {
    const sc = o.scale ?? 1;
    return { left: o.left || 0, top: o.top || 0,
             width: (o.naturalWidth || 100) * sc, height: (o.naturalHeight || 100) * sc };
  }
  return { left: o.left || 0, top: o.top || 0, width: o.width || 100, height: o.height || 50 };
}

const selectionBoxes = computed(() => objectsInSelection().map(({ kind, obj }) => ({
  key: objKey(kind, obj.id), ...objectBox(kind, obj),
})));

// Cadre englobant, affiché à partir de deux objets
const selectionBounds = computed(() => {
  const boxes = selectionBoxes.value;
  if (boxes.length < 2) return null;
  const l = Math.min(...boxes.map((b) => b.left));
  const t = Math.min(...boxes.map((b) => b.top));
  const r = Math.max(...boxes.map((b) => b.left + b.width));
  const b = Math.max(...boxes.map((b) => b.top + b.height));
  return { left: l, top: t, width: r - l, height: b - t };
});

const marqueeRect = computed(() => ({
  left: Math.min(marquee.x0, marquee.x1),
  top: Math.min(marquee.y0, marquee.y1),
  width: Math.abs(marquee.x1 - marquee.x0),
  height: Math.abs(marquee.y1 - marquee.y0),
}));

function startMarquee(ev) {
  const { x, y } = canvasClickCoords(ev);
  marquee.active = true;
  marquee.x0 = marquee.x1 = x;
  marquee.y0 = marquee.y1 = y;
  selectedObjects.clear();
  selected.value = null;
  multiSelected.clear();
  window.addEventListener('pointermove', onMarqueeMove);
  window.addEventListener('pointerup', stopMarquee);
  window.addEventListener('pointercancel', stopMarquee);
}
function onMarqueeMove(ev) {
  if (!marquee.active) return;
  const { x, y } = canvasClickCoords(ev);
  marquee.x1 = x;
  marquee.y1 = y;
}
function stopMarquee() {
  if (!marquee.active) return;
  window.removeEventListener('pointermove', onMarqueeMove);
  window.removeEventListener('pointerup', stopMarquee);
  window.removeEventListener('pointercancel', stopMarquee);
  marquee.active = false;
  const r = marqueeRect.value;
  if (r.width < 4 && r.height < 4) return; // simple clic
  for (const kind of OBJECT_KINDS) {
    for (const o of listFor(kind)) {
      const b = objectBox(kind, o);
      const hit = b.left < r.left + r.width && b.left + b.width > r.left
               && b.top  < r.top + r.height && b.top + b.height > r.top;
      if (hit) selectedObjects.add(objKey(kind, o.id));
    }
  }
  marqueeJustFinished = true;
  if (selectedObjects.size) {
    // Retour au mode normal : le pan et le déplacement de groupe redeviennent possibles.
    marqueeMode.value = false;
    showToast(`${selectedObjects.size} objet(s) sélectionné(s)`, 'info', 1800);
  }
}

// Clic sur le fond : ne pas annuler la sélection que le rectangle vient de produire
function onCanvasBackgroundClick() {
  if (activeTool.value || marqueeJustFinished) return;
  deselect();
}

async function persistPosition(kind, item) {
  const pos = { top: item.top, left: item.left };
  if (kind === 'zone')              await adminApi.updateZone(item.id, pos, props.venueId);
  else if (kind === 'freeZone')     await adminApi.updateFreeZone(item.id, pos, props.venueId);
  else if (kind === 'tableZone')    await adminApi.updateTableZone(item.id, pos, props.venueId);
  else if (kind === 'tableSection') await adminApi.updateTableSection(item.id, pos, props.venueId);
  else if (kind === 'textLabel')    await adminApi.updateTextLabel(item.id, pos, props.venueId);
  else if (kind === 'imageLayer')   await adminApi.updateImageLayer(item.id, pos, props.venueId);
  else                              await adminApi.updateSeatRow(item.id, pos, props.venueId);
}

async function deleteObject(kind, id) {
  if (kind === 'zone')              { await adminApi.deleteZone(id, props.venueId);         zones.value         = zones.value.filter((x) => x.id !== id); }
  else if (kind === 'seatRow')      {
    // Les groupes rattachés redeviennent autonomes plutôt que de pointer dans le vide
    for (const g of attachedGroupsOf(id)) await detachGroup(g);
    await adminApi.deleteSeatRow(id, props.venueId);
    seatRows.value = seatRows.value.filter((x) => x.id !== id);
  }
  else if (kind === 'freeZone')     { await adminApi.deleteFreeZone(id, props.venueId);     freeZones.value     = freeZones.value.filter((x) => x.id !== id); }
  else if (kind === 'tableZone')    { await adminApi.deleteTableZone(id, props.venueId);    tableZones.value    = tableZones.value.filter((x) => x.id !== id); }
  else if (kind === 'tableSection') { await adminApi.deleteTableSection(id, props.venueId); tableSections.value = tableSections.value.filter((x) => x.id !== id); }
  else if (kind === 'textLabel')    { await adminApi.deleteTextLabel(id, props.venueId);    textLabels.value    = textLabels.value.filter((x) => x.id !== id); }
  else if (kind === 'imageLayer')   { await adminApi.deleteImageLayer(id, props.venueId);   imageLayers.value   = imageLayers.value.filter((x) => x.id !== id); }
}

async function duplicateObjectSelection() {
  if (!selectedObjects.size || pasting.value) return;
  const items = objectsInSelection();
  const created = [];
  for (const { kind, obj } of items) {
    const c = await createFromClone(kind, obj, 24, 24);
    if (c) created.push(objKey(kind, c.id));
  }
  selected.value = null;
  selectedObjects.clear();
  created.forEach((k) => selectedObjects.add(k));
  showToast(`${created.length} objet(s) dupliqué(s)`, 'success', 2500);
}

async function removeObjectSelection() {
  if (!selectedObjects.size) return;
  deleteBlockMessage.value = '';
  const items = objectsInSelection();
  // Rien n'est supprimé si une seule section contient des sièges réservés
  for (const { kind, obj } of items) {
    if (!['seatRow', 'tableZone', 'tableSection'].includes(kind)) continue;
    const blocked = await checkBookedSeats(sectionPrefix(obj));
    if (blocked.length > 0) {
      deleteBlockMessage.value = `« ${sectionPrefix(obj)} » contient ${blocked.length} siège(s) réservé(s) — suppression groupée annulée.`;
      showProps.value = true;
      return;
    }
  }
  for (const { kind, obj } of items) {
    try { await deleteObject(kind, obj.id); } catch (_) {}
  }
  const n = items.length;
  selectedObjects.clear();
  deselect();
  isDirty.value = true;
  emit('changed');
  showToast(`${n} objet(s) supprimé(s)`, 'success', 2500);
}

// ---------- Édition via panneau latéral ----------
let saveTimer = null;
function scheduleSave() {
  isDirty.value = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistSelected, 350);
}
async function persistSelected() {
  if (selectedZone.value) {
    const z = selectedZone.value;
    await adminApi.updateZone(z.id, {
      label: z.label, categoryId: z.categoryId, shape: z.shape,
      width: Number(z.width), height: Number(z.height), capacity: Number(z.capacity),
      labelFontSize: Number(z.labelFontSize),
    }, props.venueId);
  } else if (selectedSeatRow.value) {
    const r = selectedSeatRow.value;
    await adminApi.updateSeatRow(r.id, {
      section: r.section, label: r.label, categoryId: r.categoryId,
      rows: Number(r.rows), cols: Number(r.cols),
      shape: r.shape, seatSize: Number(r.seatSize),
      rowFormat: r.rowFormat, rowDirection: r.rowDirection,
      colFormat: r.colFormat, colDirection: r.colDirection,
      rowLabelFontSize: Number(r.rowLabelFontSize),
      rotation: Number(r.rotation || 0),
      badgeVisible: !!r.badgeVisible,
      deletedSeats: r.deletedSeats || [],
      seatLabelOverrides: r.seatLabelOverrides || {},
      rowOverrides: r.rowOverrides || {},
      rowOrder: r.rowOrder || [],
      isGroup: !!r.isGroup,
      parentRowId: r.parentRowId ?? null,
    }, props.venueId);
    // Les groupes rattachés ont pu être déplacés ou pivotés avec le bloc
    for (const g of attachedGroupsOf(r.id)) {
      await adminApi.updateSeatRow(g.id, {
        top: g.top, left: g.left, rotation: Number(g.rotation || 0),
      }, props.venueId);
    }
  } else if (selectedFreeZone.value) {
    const f = selectedFreeZone.value;
    await adminApi.updateFreeZone(f.id, {
      label: f.label, icon: f.icon, color: f.color, pattern: f.pattern,
      textColor: f.textColor || null, iconSize: f.iconSize ? Number(f.iconSize) : null,
      width: Number(f.width), height: Number(f.height), labelFontSize: Number(f.labelFontSize),
    }, props.venueId);
  } else if (selectedTableZone.value) {
    const t = selectedTableZone.value;
    await adminApi.updateTableZone(t.id, {
      section: t.section, label: t.label, categoryId: t.categoryId,
      seatCount: Number(t.seatCount), tableSize: Number(t.tableSize),
      seatSize: Number(t.seatSize), seatLabelFontSize: Number(t.seatLabelFontSize || 9),
      tableLabelFontSize: Number(t.tableLabelFontSize || 13),
      rowLabelFontSize: Number(t.rowLabelFontSize), rotation: Number(t.rotation || 0),
      disabledSeats: t.disabledSeats || [],
    }, props.venueId);
  } else if (selectedTableSection.value) {
    const ts = selectedTableSection.value;
    await adminApi.updateTableSection(ts.id, {
      section: ts.section, label: ts.label, categoryId: ts.categoryId,
      tableCount: Number(ts.tableCount), tableRows: Number(ts.tableRows || 1), seatsPerTable: Number(ts.seatsPerTable),
      tableSize: Number(ts.tableSize), seatSize: Number(ts.seatSize),
      seatLabelFontSize: Number(ts.seatLabelFontSize || 9),
      tableLabelFontSize: Number(ts.tableLabelFontSize || 13),
      tableSpacing: Number(ts.tableSpacing), rowLabelFontSize: Number(ts.rowLabelFontSize),
      rotation: Number(ts.rotation || 0),
      badgeVisible: !!ts.badgeVisible,
      disabledSeats: ts.disabledSeats || [],
      deletedSeats: ts.deletedSeats || [],
      tableSeatsOverrides: ts.tableSeatsOverrides || {},
      tableRotationOverrides: ts.tableRotationOverrides || {},
      deletedTables: ts.deletedTables || [],
    }, props.venueId);
  } else if (selectedTextLabel.value) {
    const tl = selectedTextLabel.value;
    await adminApi.updateTextLabel(tl.id, {
      caption: tl.caption, fontSize: Number(tl.fontSize), color: tl.color,
      fontFamily: tl.fontFamily || 'sans-serif', bold: !!tl.bold, italic: !!tl.italic,
      rotation: Number(tl.rotation || 0),
    }, props.venueId);
  } else if (selectedImageLayer.value) {
    const il = selectedImageLayer.value;
    await adminApi.updateImageLayer(il.id, {
      scale: Number(il.scale ?? 1), rotation: Number(il.rotation ?? 0),
      opacity: Number(il.opacity ?? 1), layer: il.layer || 'background',
    }, props.venueId);
  }
  emit('changed');
}

function resetFreeZone() {
  const f = selectedFreeZone.value;
  if (!f) return;
  f.color = '#6b7280';
  f.textColor = '#000000';
  f.icon = 'none';
  f.iconSize = null;
  f.pattern = 'solid';
  f.labelFontSize = 10;
  scheduleSave();
}

function sectionPrefix(item) {
  return item.section || item.label || item.id;
}

async function checkBookedSeats(prefix) {
  if (!props.eventId) return [];
  try {
    const seats = await adminApi.getEventSeats(props.eventId);
    const list = Array.isArray(seats) ? seats : (seats.seats || []);
    return list.filter(s =>
      (s.status === 'booked' || s.status === 'hold') &&
      (s.seatKey || '').startsWith(prefix + '-')
    );
  } catch (_) { return []; }
}

async function removeSelected() {
  deleteBlockMessage.value = '';

  let prefix = null;
  if (selectedSeatRow.value)    prefix = sectionPrefix(selectedSeatRow.value);
  else if (selectedTableZone.value)   prefix = sectionPrefix(selectedTableZone.value);
  else if (selectedTableSection.value) prefix = sectionPrefix(selectedTableSection.value);

  if (prefix) {
    const blocked = await checkBookedSeats(prefix);
    if (blocked.length > 0) {
      const statuses = [...new Set(blocked.map(s => s.status))];
      const label = statuses.includes('booked') ? 'réservés' : 'en attente';
      deleteBlockMessage.value = `Cette section contient ${blocked.length} siège(s) ${label}. Libérez-les avant de supprimer la section.`;
      return;
    }
  }

  if (selectedZone.value) {
    const z = selectedZone.value;
    await adminApi.deleteZone(z.id, props.venueId);
    zones.value = zones.value.filter((x) => x.id !== z.id);
  } else if (selectedSeatRow.value) {
    const r = selectedSeatRow.value;
    // Les groupes rattachés redeviennent autonomes plutôt que de pointer dans le vide
    for (const g of attachedGroupsOf(r.id)) await detachGroup(g);
    await adminApi.deleteSeatRow(r.id, props.venueId);
    seatRows.value = seatRows.value.filter((x) => x.id !== r.id);
  } else if (selectedFreeZone.value) {
    const f = selectedFreeZone.value;
    await adminApi.deleteFreeZone(f.id, props.venueId);
    freeZones.value = freeZones.value.filter((x) => x.id !== f.id);
  } else if (selectedTableZone.value) {
    const t = selectedTableZone.value;
    await adminApi.deleteTableZone(t.id, props.venueId);
    tableZones.value = tableZones.value.filter((x) => x.id !== t.id);
  } else if (selectedTableSection.value) {
    const ts = selectedTableSection.value;
    await adminApi.deleteTableSection(ts.id, props.venueId);
    tableSections.value = tableSections.value.filter((x) => x.id !== ts.id);
  } else if (selectedTextLabel.value) {
    const tl = selectedTextLabel.value;
    await adminApi.deleteTextLabel(tl.id, props.venueId);
    textLabels.value = textLabels.value.filter((x) => x.id !== tl.id);
  } else if (selectedImageLayer.value) {
    const il = selectedImageLayer.value;
    await adminApi.deleteImageLayer(il.id, props.venueId);
    imageLayers.value = imageLayers.value.filter((x) => x.id !== il.id);
  }
  deselect();
  isDirty.value = true;
  emit('changed');
}

// ---------- Action sur le siège sélectionné (démo locale : statut vendu) ----------
function toggleSelectedSeatStatus() {
  const s = selected.value;
  if (!s || s.kind !== 'seat') return;
  const current = seatStatusOverrides[s.seatId] || 'available';
  seatStatusOverrides[s.seatId] = current === 'sold' ? 'available' : 'sold';
  s.seatInfo.status = seatStatusOverrides[s.seatId];
  isDirty.value = true;
}

// ---------- Activer/désactiver un siège (persisté) ----------
async function toggleSelectedSeatDisabled() {
  const s = selected.value;
  if (!s || s.kind !== 'seat') return;
  const row = seatRows.value.find((r) => r.id === s.rowId);
  if (!row) return;
  const list = row.disabledSeats ? [...row.disabledSeats] : [];
  const idx = list.indexOf(s.seatInfo.posKey);
  if (idx >= 0) list.splice(idx, 1); else list.push(s.seatInfo.posKey);
  row.disabledSeats = list;
  s.seatInfo.status = idx >= 0 ? (seatStatusOverrides[s.seatId] || 'available') : 'disabled';
  await adminApi.updateSeatRow(row.id, { disabledSeats: list }, props.venueId);
  isDirty.value = true;
  emit('changed');
}

async function toggleSelectedTableSeatDisabled() {
  const s = selectedTableSeat.value;
  if (!s) return;
  const t = tableZones.value.find((x) => x.id === s.table.id);
  if (!t) return;
  const list = new Set(t.disabledSeats || []);
  if (list.has(s.index)) { list.delete(s.index); } else { list.add(s.index); }
  t.disabledSeats = [...list];
  s.status = list.has(s.index) ? 'disabled' : 'available';
  await adminApi.updateTableZone(t.id, { disabledSeats: t.disabledSeats }, props.venueId);
  isDirty.value = true;
  emit('changed');
}

async function toggleSelectedTableSectionSeatDisabled() {
  const s = selectedTableSectionSeat.value;
  if (!s) return;
  const ts = tableSections.value.find((x) => x.id === s.ts.id);
  if (!ts) return;
  const posKey = `${s.tableIndex}-${s.seatIndex}`;
  const list = new Set(ts.disabledSeats || []);
  if (list.has(posKey)) { list.delete(posKey); } else { list.add(posKey); }
  ts.disabledSeats = [...list];
  s.status = list.has(posKey) ? 'disabled' : 'available';
  await adminApi.updateTableSection(ts.id, { disabledSeats: ts.disabledSeats }, props.venueId);
  isDirty.value = true;
  emit('changed');
}

async function deleteSeat() {
  const s = selected.value;
  if (!s || s.kind !== 'seat') return;
  const row = seatRows.value.find((r) => r.id === s.rowId);
  if (!row) return;
  const list = [...(row.deletedSeats || [])];
  if (!list.includes(s.seatInfo.posKey)) list.push(s.seatInfo.posKey);
  row.deletedSeats = list;
  s.seatInfo.status = 'deleted';
  await adminApi.updateSeatRow(row.id, { deletedSeats: list }, props.venueId);
  isDirty.value = true;
  emit('changed');
  deselect();
}

async function deleteTableSectionSeat() {
  const s = selectedTableSectionSeat.value;
  if (!s) return;
  const ts = tableSections.value.find((x) => x.id === s.ts.id);
  if (!ts) return;
  const posKey = `${s.tableIndex}-${s.seatIndex}`;
  const list = new Set(ts.deletedSeats || []);
  list.add(posKey);
  ts.deletedSeats = [...list];
  await adminApi.updateTableSection(ts.id, { deletedSeats: ts.deletedSeats }, props.venueId);
  isDirty.value = true;
  emit('changed');
  deselect();
}

async function disableTableSectionTable() {
  const s = selectedTableSectionSeat.value;
  if (!s) return;
  const ts = tableSections.value.find((x) => x.id === s.ts.id);
  if (!ts) return;
  const count = (ts.tableSeatsOverrides?.[s.tableIndex] !== undefined) ? Number(ts.tableSeatsOverrides[s.tableIndex]) : (ts.seatsPerTable || 6);
  const list = new Set(ts.disabledSeats || []);
  for (let si = 0; si < count; si++) list.add(`${s.tableIndex}-${si}`);
  ts.disabledSeats = [...list];
  await adminApi.updateTableSection(ts.id, { disabledSeats: ts.disabledSeats }, props.venueId);
  isDirty.value = true;
  emit('changed');
  deselect();
}

// Actions sur une table entière sélectionnée via son cercle
async function toggleTableDisabled() {
  const sel = selectedTableSectionTable.value;
  if (!sel) return;
  const { ts, tableIndex } = sel;
  const count = (ts.tableSeatsOverrides?.[tableIndex] !== undefined) ? Number(ts.tableSeatsOverrides[tableIndex]) : (ts.seatsPerTable || 6);
  const deleted = new Set(ts.deletedSeats || []);
  const disabled = new Set(ts.disabledSeats || []);
  // Vérifie si tous les sièges actifs (non supprimés) sont déjà désactivés
  const activeKeys = [];
  for (let si = 0; si < count; si++) {
    const key = `${tableIndex}-${si}`;
    if (!deleted.has(key)) activeKeys.push(key);
  }
  const allDisabled = activeKeys.every((k) => disabled.has(k));
  if (allDisabled) {
    activeKeys.forEach((k) => disabled.delete(k));
  } else {
    activeKeys.forEach((k) => disabled.add(k));
  }
  ts.disabledSeats = [...disabled];
  await adminApi.updateTableSection(ts.id, { disabledSeats: ts.disabledSeats }, props.venueId);
  isDirty.value = true;
  emit('changed');
}

async function deleteEntireTable() {
  const sel = selectedTableSectionTable.value;
  if (!sel) return;
  const { ts, tableIndex } = sel;
  const count = (ts.tableSeatsOverrides?.[tableIndex] !== undefined) ? Number(ts.tableSeatsOverrides[tableIndex]) : (ts.seatsPerTable || 6);
  const seats = new Set(ts.deletedSeats || []);
  for (let si = 0; si < count; si++) seats.add(`${tableIndex}-${si}`);
  ts.deletedSeats = [...seats];
  const tables = new Set(ts.deletedTables || []);
  tables.add(tableIndex);
  ts.deletedTables = [...tables];
  await adminApi.updateTableSection(ts.id, { deletedSeats: ts.deletedSeats, deletedTables: ts.deletedTables }, props.venueId);
  isDirty.value = true;
  emit('changed');
  deselect();
}

async function restoreDeletedTable(ts, tableIndex) {
  const tables = new Set(ts.deletedTables || []);
  tables.delete(tableIndex);
  ts.deletedTables = [...tables];

  // Restaurer aussi les sièges de cette table
  const count = (ts.tableSeatsOverrides?.[tableIndex] !== undefined)
    ? Number(ts.tableSeatsOverrides[tableIndex])
    : (ts.seatsPerTable || 6);
  const seats = new Set(ts.deletedSeats || []);
  for (let si = 0; si < count; si++) seats.delete(`${tableIndex}-${si}`);
  ts.deletedSeats = [...seats];

  await adminApi.updateTableSection(ts.id, { deletedSeats: ts.deletedSeats, deletedTables: ts.deletedTables }, props.venueId);
  isDirty.value = true;
  emit('changed');
}

function updateTableSeatsCount(seatsCount) {
  const sel = selectedTableSectionTable.value;
  if (!sel) return;
  const { ts, tableIndex } = sel;
  if (!ts.tableSeatsOverrides) ts.tableSeatsOverrides = {};
  ts.tableSeatsOverrides[tableIndex] = Number(seatsCount);
  scheduleSave();
}

function updateTableRotation(deg) {
  const sel = selectedTableSectionTable.value;
  if (!sel) return;
  const { ts, tableIndex } = sel;
  if (!ts.tableRotationOverrides) ts.tableRotationOverrides = {};
  ts.tableRotationOverrides[tableIndex] = Number(deg);
  scheduleSave();
}

// ---------- Actions groupées (multi-sélection de sièges) ----------
function splitMultiSelection() {
  const rowGroups = new Map();    // rowId -> [posKey...]
  const tableGroups = new Map();  // tableId -> [index (number)...]
  const tsGroups = new Map();     // tsId -> ['ti-si'...]
  for (const key of multiSelected) {
    if (key.startsWith('tse:')) {
      const [tsId, posPart] = key.slice(4).split('|');
      if (!tsGroups.has(tsId)) tsGroups.set(tsId, []);
      tsGroups.get(tsId).push(posPart);
    } else if (key.startsWith('tz:')) {
      const [tableId, idx] = key.slice(3).split('|');
      if (!tableGroups.has(tableId)) tableGroups.set(tableId, []);
      tableGroups.get(tableId).push(Number(idx));
    } else {
      const [rowId, posKey] = key.split('|');
      if (!rowGroups.has(rowId)) rowGroups.set(rowId, []);
      rowGroups.get(rowId).push(posKey);
    }
  }
  return { rowGroups, tableGroups, tsGroups };
}

async function bulkSetDisabled(disabled) {
  const { rowGroups, tableGroups, tsGroups } = splitMultiSelection();
  for (const [rowId, posKeys] of rowGroups) {
    const row = seatRows.value.find((r) => r.id === rowId);
    if (!row) continue;
    const list = new Set(row.disabledSeats || []);
    posKeys.forEach((pk) => (disabled ? list.add(pk) : list.delete(pk)));
    row.disabledSeats = [...list];
    await adminApi.updateSeatRow(rowId, { disabledSeats: row.disabledSeats }, props.venueId);
  }
  for (const [tableId, indices] of tableGroups) {
    const t = tableZones.value.find((x) => x.id === tableId);
    if (!t) continue;
    const list = new Set(t.disabledSeats || []);
    indices.forEach((i) => (disabled ? list.add(i) : list.delete(i)));
    t.disabledSeats = [...list];
    await adminApi.updateTableZone(tableId, { disabledSeats: t.disabledSeats }, props.venueId);
  }
  for (const [tsId, posParts] of tsGroups) {
    const ts = tableSections.value.find((x) => x.id === tsId);
    if (!ts) continue;
    const list = new Set(ts.disabledSeats || []);
    posParts.forEach((p) => (disabled ? list.add(p) : list.delete(p)));
    ts.disabledSeats = [...list];
    await adminApi.updateTableSection(tsId, { disabledSeats: ts.disabledSeats }, props.venueId);
  }
  isDirty.value = true;
  emit('changed');
}

function bulkSetStatus(status) {
  for (const key of multiSelected) {
    if (key.startsWith('tse:') || key.startsWith('tz:')) {
      seatStatusOverrides[key] = status;
    } else {
      const [rowId, posKey] = key.split('|');
      seatStatusOverrides[`${rowId}-${posKey}`] = status;
    }
  }
}

async function bulkChangeCategory() {
  if (!bulkCategoryChoice.value) return;
  const { rowGroups } = splitMultiSelection();
  for (const [rowId, posKeys] of rowGroups) {
    const row = seatRows.value.find((r) => r.id === rowId);
    if (!row) continue;
    const overrides = { ...(row.categoryOverrides || {}) };
    posKeys.forEach((pk) => { overrides[pk] = bulkCategoryChoice.value; });
    row.categoryOverrides = overrides;
    await adminApi.updateSeatRow(rowId, { categoryOverrides: overrides }, props.venueId);
  }
  isDirty.value = true;
  emit('changed');
}

function clearMultiSelection() {
  multiSelected.clear();
  bulkCategoryChoice.value = '';
}

// ---------- Sauvegarde explicite ----------
const saving = ref(false);
const saveError = ref('');
const saveSuccess = ref(false);
// ---------- Nom modifiable ----------
const localName = ref(props.planName);
const savingName = ref(false);
watch(() => props.planName, (v) => { localName.value = v; });
async function saveName() {
  const n = localName.value.trim();
  if (!n || n === props.planName) return;
  savingName.value = true;
  try { await adminApi.updateVenue(props.venueId, { name: n }); emit('changed'); } catch (_) {}
  savingName.value = false;
}

// Armé par la première modification faite par l'utilisateur dans cette session :
// évite qu'ouvrir un plan déjà « en attente » déclenche une publication toute seule.
const autoSaveArmed = ref(false);

const _isDirtyFlag = ref(props.planPendingChanges);
const isDirty = computed({
  get: () => _isDirtyFlag.value || pendingCatDeletions.size > 0,
  set: (v) => { _isDirtyFlag.value = v; if (v) autoSaveArmed.value = true; },
});

watch(() => props.planPendingChanges, (v) => {
  if (v) _isDirtyFlag.value = true;
});

watch(isDirty, async (dirty) => {
  if (dirty) {
    try { await adminApi.markVenuePendingChanges(props.venueId); } catch (_) {}
  }
  activePlanDirty.value = dirty;
}, { immediate: true });

watch(() => props.planStatus, (s) => { activePlanStatus.value = s; }, { immediate: true });
watch(() => props.venueId,    (id) => { activePlanId.value = id; },   { immediate: true });

onBeforeUnmount(() => {
  clearTimeout(autoSaveTimer);
  clearTimeout(saveTimer);
  clearTimeout(toastTimer);
  activePlanId.value     = null;
  activePlanDirty.value  = false;
  activePlanStatus.value = null;
});

const showPreview = ref(false);

// ---------- Auto-sauvegarde ----------
const AUTOSAVE_DELAY = 2000;
const AUTOSAVE_STORAGE_KEY = 'mitoera.editor.autosave';
const autoSaveEnabled = ref(localStorage.getItem(AUTOSAVE_STORAGE_KEY) !== 'off');
const autoSaving = ref(false);
let autoSaveTimer = null;

function autoSaveReady() {
  return autoSaveEnabled.value && autoSaveArmed.value
    && !loading.value && !saving.value && !drag.active && !pasting.value
    && isDirty.value && canSave.value;
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  if (!autoSaveReady()) return;
  autoSaveTimer = setTimeout(() => {
    if (!autoSaveReady()) return;
    saveAll({ auto: true });
  }, AUTOSAVE_DELAY);
}

function toggleAutoSave() {
  autoSaveEnabled.value = !autoSaveEnabled.value;
  localStorage.setItem(AUTOSAVE_STORAGE_KEY, autoSaveEnabled.value ? 'on' : 'off');
  if (autoSaveEnabled.value) {
    scheduleAutoSave();
    showToast('Auto-sauvegarde activée', 'info', 2000);
  } else {
    clearTimeout(autoSaveTimer);
    showToast('Auto-sauvegarde désactivée', 'info', 2000);
  }
}

// Toute mutation locale (drag, panneau, ajout/suppression, catégories) relance le compte à rebours.
watch(
  () => [
    zones.value, seatRows.value, freeZones.value, tableZones.value,
    tableSections.value, textLabels.value, imageLayers.value, categories.value,
    pendingCatDeletions.size, isDirty.value, canSave.value, autoSaveEnabled.value,
  ],
  scheduleAutoSave,
  { deep: true },
);


async function saveAll(opts = {}) {
  const auto = opts && opts.auto === true;
  if (!canSave.value || saving.value) return;
  clearTimeout(autoSaveTimer);
  saveError.value = '';
  saveSuccess.value = false;
  saving.value = true;
  autoSaving.value = auto;
  try {
    const activeCats = categories.value.filter(c => !pendingCatDeletions.has(c.id));
    // textLabels / imageLayers doivent être transmis : le PUT /objects remplace la liste complète.
    await adminApi.saveAllObjects(
      props.venueId, zones.value, seatRows.value, freeZones.value, activeCats,
      tableZones.value, tableSections.value, textLabels.value, imageLayers.value,
    );
    await Promise.all([
      adminApi.publishVenue(props.venueId),
      adminApi.updateVenueStatus(props.venueId, 'published'),
    ]);
    // Suppressions définitives uniquement après publication réussie
    await flushPendingCatDeletions();
    saveSuccess.value = true;
    isDirty.value = false;
    // Désarmé jusqu'à la prochaine modification : pas de boucle de republication.
    autoSaveArmed.value = false;
    emit('changed');
    setTimeout(() => { saveSuccess.value = false; }, 2500);
  } catch (e) {
    saveError.value = e.message;
  } finally {
    saving.value = false;
    autoSaving.value = false;
  }
}
</script>

<template>
  <div class="flex gap-2 h-full min-h-0 overflow-hidden relative">

    <!-- ── Sidebar gauche : outils de placement ── -->
    <div class="hidden sm:flex flex-col gap-1.5 bg-white rounded-2xl shadow-sm p-2 shrink-0 items-center justify-center">

      <!-- Sélection (pointeur) -->
      <div class="relative group">
        <button
          @click="selectTool(null); marqueeMode = false"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition"
          :class="activeTool === null && !marqueeMode
            ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 2.5L4 17.5L8.5 13.5L11.5 21L13.5 20L10.5 13H16L4 2.5Z"/>
          </svg>
        </button>
        <div class="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
          bg-gray-900 text-white text-xs font-semibold whitespace-nowrap rounded-lg px-2.5 py-1.5 shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity">
          Sélection
          <div class="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
        </div>
      </div>

      <!-- Sélection multiple (rectangle) -->
      <div class="relative group">
        <button
          @click="toggleMarqueeMode"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition"
          :class="marqueeMode
            ? 'bg-blue-600 text-white ring-2 ring-blue-500 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/>
            <path d="M11 11l6 2.4-2.4 1L13.4 17z" fill="currentColor" stroke="none"/>
          </svg>
        </button>
        <div class="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
          bg-gray-900 text-white text-xs font-semibold whitespace-nowrap rounded-lg px-2.5 py-1.5 shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity">
          Sélection multiple — glissez un rectangle
          <div class="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
        </div>
      </div>

      <div class="w-6 h-px bg-gray-100 my-0.5"></div>

      <!-- Rangée de sièges (avec sous-options) -->
      <div class="relative group">
        <button
          :disabled="categories.length === 0"
          @click="selectTool('seatRow')"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition disabled:opacity-40 relative"
          :class="activeTool === 'seatRow' || activeTool === 'seatRowGroup'
            ? 'bg-gray-900 text-white ring-2 ring-gray-900 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <!-- Chevron : signale les sous-options -->
          <span class="absolute right-0.5 bottom-0.5 leading-none text-[8px] opacity-60">▸</span>
          <!-- Icône rangées de sièges : 3 lignes de petits ronds -->
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle cx="5"  cy="8" r="2" fill="currentColor"/>
            <circle cx="12" cy="8" r="2" fill="currentColor"/>
            <circle cx="19" cy="8" r="2" fill="currentColor"/>
            <circle cx="5"  cy="14" r="2" fill="currentColor"/>
            <circle cx="12" cy="14" r="2" fill="currentColor"/>
            <circle cx="19" cy="14" r="2" fill="currentColor"/>
            <rect x="3" y="17.5" width="18" height="2" rx="1" fill="currentColor" opacity="0.4"/>
          </svg>
        </button>
        <!-- Sous-options : le padding gauche garde le survol continu jusqu'au panneau -->
        <div class="absolute left-full top-1/2 -translate-y-1/2 pl-2 z-50 hidden group-hover:block">
          <div class="bg-white rounded-xl shadow-xl border border-gray-200 p-1.5 flex flex-col gap-1 w-52">
            <button
              :disabled="categories.length === 0"
              @click="selectTool('seatRow')"
              class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition disabled:opacity-40"
              :class="activeTool === 'seatRow' ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-700'">
              <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="5" cy="8" r="2" fill="currentColor"/><circle cx="12" cy="8" r="2" fill="currentColor"/><circle cx="19" cy="8" r="2" fill="currentColor"/>
                <circle cx="5" cy="14" r="2" fill="currentColor"/><circle cx="12" cy="14" r="2" fill="currentColor"/><circle cx="19" cy="14" r="2" fill="currentColor"/>
                <rect x="3" y="17.5" width="18" height="2" rx="1" fill="currentColor" opacity="0.4"/>
              </svg>
              <span class="min-w-0">
                <span class="block text-xs font-semibold">Bloc de rangées</span>
                <span class="block text-[10px] opacity-60 leading-tight">Grille complète, porte la section</span>
              </span>
            </button>
            <button
              :disabled="categories.length === 0"
              @click="selectTool('seatRowGroup')"
              class="flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition disabled:opacity-40"
              :class="activeTool === 'seatRowGroup' ? 'bg-gray-900 text-white' : 'hover:bg-gray-100 text-gray-700'">
              <svg class="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>
                <rect x="1.5" y="7.5" width="21" height="9" rx="2" stroke="currentColor" stroke-width="1.3" stroke-dasharray="3 2" fill="none"/>
              </svg>
              <span class="min-w-0">
                <span class="block text-xs font-semibold">Groupe de rangées</span>
                <span class="block text-[10px] opacity-60 leading-tight">Autonome, à rattacher à une section</span>
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- Zone libre -->
      <div class="relative group">
        <button
          @click="selectTool('freeZone')"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition"
          :class="activeTool === 'freeZone'
            ? 'bg-indigo-600 text-white ring-2 ring-indigo-500 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2" fill="none"/>
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v8M8 12h8"/>
          </svg>
        </button>
        <div class="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
          bg-gray-900 text-white text-xs font-semibold whitespace-nowrap rounded-lg px-2.5 py-1.5 shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity">
          Zone libre
          <div class="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
        </div>
      </div>

      <!-- Table -->
      <div class="relative group">
        <button
          :disabled="categories.length === 0"
          @click="selectTool('tableZone')"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition disabled:opacity-40"
          :class="activeTool === 'tableZone'
            ? 'bg-indigo-600 text-white ring-2 ring-indigo-500 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <circle cx="12" cy="12" r="4" stroke="currentColor" fill="none"/>
            <circle cx="12" cy="4"  r="1.5" fill="currentColor"/>
            <circle cx="12" cy="20" r="1.5" fill="currentColor"/>
            <circle cx="4"  cy="12" r="1.5" fill="currentColor"/>
            <circle cx="20" cy="12" r="1.5" fill="currentColor"/>
          </svg>
        </button>
        <div class="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
          bg-gray-900 text-white text-xs font-semibold whitespace-nowrap rounded-lg px-2.5 py-1.5 shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity">
          Table
          <div class="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
        </div>
      </div>

      <!-- Tables groupées -->
      <div class="relative group">
        <button
          :disabled="categories.length === 0"
          @click="selectTool('tableSection')"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition disabled:opacity-40"
          :class="activeTool === 'tableSection'
            ? 'bg-indigo-600 text-white ring-2 ring-indigo-500 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <!-- 4 petits ronds groupés (2×2) -->
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle cx="7"  cy="7"  r="3.5" stroke="currentColor" stroke-width="1.8" fill="none"/>
            <circle cx="7"  cy="7"  r="1.2" fill="currentColor"/>
            <circle cx="17" cy="7"  r="3.5" stroke="currentColor" stroke-width="1.8" fill="none"/>
            <circle cx="17" cy="7"  r="1.2" fill="currentColor"/>
            <circle cx="7"  cy="17" r="3.5" stroke="currentColor" stroke-width="1.8" fill="none"/>
            <circle cx="7"  cy="17" r="1.2" fill="currentColor"/>
            <circle cx="17" cy="17" r="3.5" stroke="currentColor" stroke-width="1.8" fill="none"/>
            <circle cx="17" cy="17" r="1.2" fill="currentColor"/>
          </svg>
        </button>
        <div class="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
          bg-gray-900 text-white text-xs font-semibold whitespace-nowrap rounded-lg px-2.5 py-1.5 shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity">
          Tables groupées
          <div class="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
        </div>
      </div>

      <!-- Image -->
      <div class="relative group">
        <button
          @click="selectTool('imageLayer')"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition"
          :class="activeTool === 'imageLayer'
            ? 'bg-indigo-600 text-white ring-2 ring-indigo-500 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="5" width="18" height="14" rx="2"/>
            <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none"/>
            <path stroke-linejoin="round" d="M3 17l5-5 3.5 3.5L15 11l6 6"/>
          </svg>
        </button>
        <div class="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
          bg-gray-900 text-white text-xs font-semibold whitespace-nowrap rounded-lg px-2.5 py-1.5 shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity">
          Image
          <div class="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
        </div>
      </div>

      <!-- Texte -->
      <div class="relative group">
        <button
          @click="selectTool('textLabel')"
          class="w-10 h-10 rounded-xl flex items-center justify-center transition"
          :class="activeTool === 'textLabel'
            ? 'bg-indigo-600 text-white ring-2 ring-indigo-500 ring-offset-1'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 4h14v3h-2V6H13v12h2v2H9v-2h2V6H7v1H5V4z"/>
          </svg>
        </button>
        <div class="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50
          bg-gray-900 text-white text-xs font-semibold whitespace-nowrap rounded-lg px-2.5 py-1.5 shadow-lg
          opacity-0 group-hover:opacity-100 transition-opacity">
          Texte
          <div class="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
        </div>
      </div>
    </div>

    <div class="flex-1 min-w-0 bg-white rounded-2xl shadow-sm p-3 sm:p-4 flex flex-col min-h-0">
      <!-- Toolbar -->
      <div class="flex items-center gap-2 mb-2 overflow-x-auto pb-1 scrollbar-thin shrink-0">
        <div class="flex items-center gap-1.5 shrink-0">
          <span
            class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
            :class="{
              'bg-yellow-100 text-yellow-700': props.planStatus === 'draft',
              'bg-green-100 text-green-600':  props.planStatus === 'published',
              'bg-gray-100 text-gray-500':    props.planStatus === 'archived',
            }"
          >{{ { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' }[props.planStatus] }}</span>
          <!-- État de sauvegarde -->
          <span v-if="autoSaving" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600 shrink-0 flex items-center gap-1">
            <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25"/>
              <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            </svg>
            <span class="hidden sm:inline">Enregistrement…</span>
          </span>
          <span v-else-if="saveSuccess" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-600 shrink-0 flex items-center gap-1">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
            </svg>
            <span class="hidden sm:inline">Enregistré</span>
          </span>
          <span v-else-if="isDirty" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 shrink-0 hidden sm:inline">
            {{ autoSaveEnabled ? 'Enregistrement en attente…' : 'Modif. non sauvegardées' }}
          </span>
        </div>
        <!-- Nom du plan -->
        <input
          v-model="localName"
          class="min-w-0 flex-1 text-sm font-semibold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-400 focus:outline-none px-1 py-0.5 transition truncate"
          :title="localName"
          @blur="saveName"
          @keydown.enter.prevent="$event.target.blur()"
        />
        <!-- Catégories -->
        <div class="shrink-0">
          <button ref="catBtnRef" @click="toggleCatPanel"
            class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold transition"
            :class="showCatPanel ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'">
            <span class="flex gap-0.5">
              <span v-for="c in categories.slice(0, 5)" :key="c.id"
                class="inline-block w-3 h-3 rounded-full border border-white/60"
                :style="{ background: c.color }"></span>
              <span v-if="categories.length === 0" class="text-gray-400 italic text-[10px]">Aucune</span>
            </span>
            <span class="hidden sm:inline">Catégories</span>
            <svg class="w-3 h-3 text-gray-400 transition-transform" :class="showCatPanel ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
        </div>

        <!-- Panel catégories — Teleport sur body pour éviter le clipping overflow -->
        <Teleport to="body">
          <div v-if="showCatPanel"
            class="fixed z-[9999] w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
            :style="catPanelStyle"
            @click.stop>
            <div class="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span class="text-xs font-bold text-gray-700">Catégories</span>
              <button @click="openCatCreate"
                class="text-[10px] font-semibold bg-gray-900 text-white px-2 py-1 rounded-md hover:bg-gray-700">
                + Ajouter
              </button>
            </div>
            <p v-if="catError" class="text-[10px] text-red-500 px-3 pt-2">{{ catError }}</p>
            <div v-if="categories.length === 0 && !catFormOpen" class="px-3 py-4 text-xs text-gray-400 text-center">
              Aucune catégorie — créez-en une pour commencer.
            </div>
            <ul v-else-if="!catFormOpen" class="max-h-52 overflow-y-auto divide-y divide-gray-50">
              <li v-for="c in categories" :key="c.id"
                class="flex items-center gap-2 px-3 py-2"
                :class="pendingCatDeletions.has(c.id) ? 'bg-red-50' : 'hover:bg-gray-50'">
                <span class="w-4 h-4 rounded-full shrink-0 border border-gray-200 transition-opacity"
                  :class="pendingCatDeletions.has(c.id) ? 'opacity-30' : ''"
                  :style="{ background: c.color }"></span>
                <span class="flex-1 text-xs font-semibold truncate"
                  :class="pendingCatDeletions.has(c.id) ? 'text-red-400 line-through' : 'text-gray-800'">
                  {{ c.name }}
                </span>
                <template v-if="pendingCatDeletions.has(c.id)">
                  <span class="text-[10px] text-red-400 italic shrink-0">à supprimer</span>
                  <button @click="cancelCatDeletion(c)" title="Annuler la suppression"
                    class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-100 text-red-400 hover:text-red-600 text-xs">↩</button>
                </template>
                <template v-else>
                  <button @click="openCatEdit(c)" class="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 text-xs">✎</button>
                  <button @click="removeCat(c)" class="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-300 hover:text-red-500 text-xs">✕</button>
                </template>
              </li>
            </ul>
            <!-- Formulaire ajout/édition -->
            <form v-if="catFormOpen" @submit.prevent="saveCat" class="px-3 py-3 flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <input type="color" v-model="catForm.color" class="w-8 h-8 rounded cursor-pointer border border-gray-200 shrink-0" />
                <input v-model="catForm.name" placeholder="Nom de la catégorie" autofocus
                  class="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400" />
              </div>
              <div class="flex gap-2">
                <button type="submit" :disabled="catSaving"
                  class="flex-1 text-xs font-semibold bg-gray-900 text-white py-1.5 rounded-md hover:bg-gray-700 disabled:opacity-50">
                  {{ catSaving ? '…' : (catEditing ? 'Enregistrer' : 'Créer') }}
                </button>
                <button type="button" @click="catFormOpen = false"
                  class="flex-1 text-xs font-semibold bg-gray-100 text-gray-600 py-1.5 rounded-md hover:bg-gray-200">
                  Annuler
                </button>
              </div>
            </form>
          </div>
          <!-- Overlay invisible pour fermer au clic extérieur -->
          <div v-if="showCatPanel" class="fixed inset-0 z-[9998]" @click="showCatPanel = false" />

          <!-- Toast notifications -->
          <Transition name="toast">
            <div v-if="toast"
              class="fixed bottom-6 left-1/2 -translate-x-1/2 z-[10001] px-4 py-2.5 rounded-xl shadow-xl text-sm font-semibold text-white pointer-events-none"
              :class="toast.type === 'error' ? 'bg-red-500' : 'bg-gray-900'">
              {{ toast.message }}
            </div>
          </Transition>
        </Teleport>

        <div class="flex gap-1.5 ml-auto shrink-0">
          <!-- Auto-sauvegarde -->
          <button @click="toggleAutoSave"
            :title="autoSaveEnabled
              ? 'Auto-sauvegarde activée — le plan est publié automatiquement dès qu’il est valide. Cliquez pour désactiver.'
              : 'Auto-sauvegarde désactivée — cliquez pour l’activer.'"
            class="text-xs font-semibold rounded-lg flex items-center gap-1.5 px-2 py-1.5 transition"
            :class="autoSaveEnabled
              ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 hover:bg-emerald-100'
              : 'bg-gray-100 text-gray-400 hover:bg-gray-200'">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            <span class="hidden md:inline whitespace-nowrap">Auto</span>
          </button>
          <!-- Publier -->
          <button :disabled="saving || !canSave" @click="saveAll()" title="Publier"
            class="text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 px-2 py-1.5 sm:px-3"
            :title="!canSave ? 'Corrigez les anomalies avant de publier' : 'Publier'">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span class="hidden sm:inline whitespace-nowrap">{{ saving ? 'Publication…' : 'Publier' }}</span>
          </button>
          <!-- Aperçu -->
          <button @click="showPreview = !showPreview" title="Aperçu"
            class="text-xs font-semibold rounded-lg flex items-center gap-1.5 px-2 py-1.5 sm:px-2.5 transition"
            :class="showPreview ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'">
            <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            <span class="hidden sm:inline whitespace-nowrap">Aperçu</span>
          </button>
          <!-- Info — Teleport pour éviter le clipping overflow -->
          <button ref="infoBtnRef" @click="toggleInfoTooltip" title="Aide"
            class="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </button>
          <Teleport to="body">
            <div v-if="showInfoTooltip"
              class="fixed z-[9999] w-72 bg-gray-900 text-gray-200 text-xs rounded-xl p-3 shadow-xl leading-relaxed"
              :style="infoTooltipStyle"
              @click.stop>
              <button @click="showInfoTooltip = false" class="float-right text-gray-400 hover:text-white ml-2 leading-none">✕</button>
              Glissez pour <strong class="text-white">déplacer</strong> · tirez un bord pour <strong class="text-white">redimensionner</strong> (bloc de sièges : gauche/droit = sièges par rang, haut/bas = rangées) · cliquez un siège pour le <strong class="text-white">sélectionner</strong>, <strong class="text-white">Ctrl/Cmd-clic</strong> ou <strong class="text-white">Maj-clic</strong> pour en sélectionner plusieurs.
              <span class="block mt-2 pt-2 border-t border-gray-700">
                <strong class="text-white">Plusieurs objets</strong> : outil « Sélection multiple » ou <strong class="text-white">Maj + glisser</strong> sur le fond pour les encadrer, <strong class="text-white">Ctrl/Cmd-clic</strong> sur un objet pour l'ajouter, <strong class="text-white">Ctrl/Cmd + A</strong> pour tout sélectionner. Glissez-en un pour tous les déplacer.
              </span>
              <span class="block mt-2">
                <strong class="text-white">Raccourcis</strong> : Ctrl/Cmd + C copier · V coller · D dupliquer.
              </span>
            </div>
            <div v-if="showInfoTooltip" class="fixed inset-0 z-[9998]" @click="showInfoTooltip = false" />
          </Teleport>
          <!-- Toggle propriétés (mobile) -->
          <button @click="showProps = !showProps" title="Propriétés"
            class="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition"
            :class="showProps ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        </div>
      </div>
      <p v-if="saveSuccess" class="text-xs text-green-600 bg-green-50 p-2 rounded-lg mb-2">Plan enregistré avec succès.</p>

      <!-- Panneau d'anomalies -->
      <div v-if="anomalies.length > 0" class="mb-3 rounded-xl border border-red-200 bg-red-50 overflow-hidden">
        <button class="flex items-center justify-between w-full gap-2 px-3 py-2 bg-red-100 border-b border-red-200 hover:bg-red-200 transition-colors" @click="anomaliesOpen = !anomaliesOpen">
          <span class="text-red-600 font-bold text-xs">⚠ Anomalies détectées — sauvegarde bloquée</span>
          <svg class="w-3.5 h-3.5 text-red-500 shrink-0 transition-transform" :class="anomaliesOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
        </button>
        <ul v-if="anomaliesOpen" class="px-3 py-2 flex flex-col gap-2 max-h-40 overflow-y-auto">
          <li v-for="a in anomalies" :key="a.type">
            <button
              class="text-xs text-red-700 font-semibold hover:text-red-900 hover:underline text-left w-full"
              @click="selectAnomalyItem(a)"
            >• {{ a.label }}</button>

            <!-- Duplicate keys list -->
            <ul v-if="a.keys && a.keys.length" class="mt-1 ml-3 flex flex-col gap-0.5">
              <li v-for="k in a.keys.slice(0, 8)" :key="k">
                <button
                  class="font-mono text-[10px] text-red-500 hover:text-red-700 hover:underline text-left"
                  @click="selectAnomalyItem(a, { key: k })"
                >{{ k }}</button>
              </li>
              <li v-if="a.keys.length > 8" class="text-[10px] text-red-400">… et {{ a.keys.length - 8 }} autre(s)</li>
            </ul>

            <!-- Missing section/category items list -->
            <ul v-if="a.items && a.items.length" class="mt-1 ml-3 flex flex-col gap-0.5">
              <li v-for="item in a.items" :key="item.id">
                <button
                  class="text-[10px] text-red-500 hover:text-red-700 hover:underline text-left flex items-center gap-1"
                  @click="selectAnomalyItem(a, item)"
                >
                  <span class="font-mono">{{ item.label }}</span>
                  <span class="text-red-300 italic">
                    {{ item.kind === 'seatRow' ? '(bloc)' : item.kind === 'tableZone' ? '(table)' : '(section de tables)' }}
                  </span>
                </button>
              </li>
            </ul>
          </li>
        </ul>
      </div>
      <p v-if="saveError" class="text-xs text-red-500 bg-red-50 p-2 rounded-lg mb-2">{{ saveError }}</p>

      <!-- Barre d'actions — objets sélectionnés -->
      <div v-if="selectedObjects.size > 0" class="mb-3 p-3 rounded-lg bg-blue-600 text-white flex items-center flex-wrap gap-2 text-xs">
        <span class="font-semibold">{{ selectedObjects.size }} objet(s) sélectionné(s)</span>
        <span class="border-l border-blue-400 h-5 mx-1"></span>
        <button @click="selectAllObjects" class="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 font-semibold">Tout sélectionner</button>
        <button @click="duplicateObjectSelection" :disabled="pasting" class="px-3 py-1.5 rounded-md bg-blue-500 hover:bg-blue-400 font-semibold disabled:opacity-40">Dupliquer</button>
        <button @click="removeObjectSelection" class="px-3 py-1.5 rounded-md bg-red-500 hover:bg-red-400 font-semibold">Supprimer</button>
        <span class="hidden sm:inline text-blue-100">Glissez un des objets pour les déplacer ensemble</span>
        <button @click="clearObjectSelection" class="ml-auto px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 font-semibold">Tout désélectionner</button>
      </div>

      <!-- Barre d'actions groupées -->
      <div v-if="multiSelected.size > 0" class="mb-3 p-3 rounded-lg bg-gray-900 text-white flex items-center flex-wrap gap-2 text-xs">
        <span class="font-semibold">{{ multiSelected.size }} siège(s) sélectionné(s)</span>
        <span class="border-l border-gray-600 h-5 mx-1"></span>
        <select v-model="bulkCategoryChoice" class="px-2 py-1.5 rounded-md text-gray-800 text-xs">
          <option value="" disabled>Changer catégorie…</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button @click="bulkChangeCategory" :disabled="!bulkCategoryChoice" class="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 font-semibold disabled:opacity-40">Appliquer</button>
        <button @click="clearMultiSelection" class="ml-auto px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 font-semibold">Tout désélectionner</button>
      </div>

      <!-- Input file caché pour l'outil Image — hors du v-if/v-else chain -->
      <input ref="imageFileInputRef" type="file" accept="image/*" class="hidden" @change="onImageFilePicked" />

      <div v-if="loading" class="text-sm text-gray-400 py-10 text-center">Chargement…</div>
      <div v-else-if="loadError" class="text-sm text-red-500 py-10 text-center">{{ loadError }}</div>

      <PreviewPlan v-else-if="showPreview"
        :categories="categories"
        :zones="zones"
        :seat-rows="seatRows"
        :free-zones="freeZones"
        :table-zones="tableZones"
        :table-sections="tableSections"
        class="flex-1 min-h-0 rounded-xl overflow-hidden"
      />

      <div v-else ref="scrollerRef"
        class="overflow-hidden rounded-xl flex-1 min-h-0 bg-gray-400 relative"
        :class="activeTool || marqueeMode ? 'cursor-crosshair' : pan.active ? 'cursor-grabbing' : 'cursor-grab'"
        style="touch-action: none;"
        @wheel.prevent="onWheel"
        @pointerdown="startPan($event); showInfoTooltip = false; showCatPanel = false"
        @click.capture="onScrollerClickCapture"
        @click="activeTool ? onCanvasPlacementClick($event) : onScrollerClick($event)"
        @contextmenu="onCanvasContextMenu"
      >
        <!-- Zoom overlay — en bas à droite du canvas -->
        <div class="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm rounded-lg shadow p-0.5 pointer-events-auto">
          <button @click.stop="zoomOut" class="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md font-bold transition text-base">−</button>
          <button @click.stop="zoomReset" class="px-1.5 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded-md text-[11px] font-semibold transition min-w-[42px]">{{ Math.round(zoom * 100) }}%</button>
          <button @click.stop="zoomIn"  class="w-7 h-7 flex items-center justify-center text-gray-600 hover:bg-gray-100 rounded-md font-bold transition text-base">+</button>
        </div>

        <!-- Indicateur mode sélection multiple -->
        <div v-if="marqueeMode && !activeTool" class="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none
          bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
          <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 3"/>
          </svg>
          Glissez pour encadrer plusieurs objets · Échap pour quitter
        </div>

        <!-- Indicateur mode placement -->
        <div v-if="activeTool" class="absolute top-3 left-1/2 -translate-x-1/2 z-50 pointer-events-none
          bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
          Cliquez sur le plan pour placer · Échap pour annuler
        </div>

        <div ref="canvasRef" class="absolute bg-white shadow-xl"
          :style="{
            width: canvasWidth + 'px', height: canvasHeight + 'px',
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }"
          @pointerdown.self="activeTool ? null : deselect()"
          @click.self="onCanvasBackgroundClick">

          <!-- Rectangle de sélection en cours de tracé -->
          <div v-if="marquee.active"
            class="absolute pointer-events-none border-2 border-blue-500 bg-blue-500/10 rounded-sm"
            :style="{ left: marqueeRect.left + 'px', top: marqueeRect.top + 'px',
                      width: marqueeRect.width + 'px', height: marqueeRect.height + 'px', zIndex: 980 }"></div>

          <!-- Cadre englobant du groupe sélectionné -->
          <div v-if="selectionBounds"
            class="absolute pointer-events-none border border-blue-400"
            :style="{ left: (selectionBounds.left - 6) + 'px', top: (selectionBounds.top - 6) + 'px',
                      width: (selectionBounds.width + 12) + 'px', height: (selectionBounds.height + 12) + 'px', zIndex: 960 }"></div>

          <!-- Cadre bleu autour de chaque objet sélectionné -->
          <div v-for="b in selectionBoxes" :key="b.key"
            class="absolute pointer-events-none border-2 border-blue-500 rounded"
            :style="{ left: (b.left - 2) + 'px', top: (b.top - 2) + 'px',
                      width: (b.width + 4) + 'px', height: (b.height + 4) + 'px', zIndex: 970 }"></div>

          <!-- Filigrane TEST en mode sandbox -->
          <svg v-if="isSandbox"
            class="absolute inset-0 pointer-events-none select-none"
            :width="canvasWidth" :height="canvasHeight"
            style="z-index:9999;opacity:0.07"
            xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="watermark-test" x="0" y="0" width="220" height="220" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                <text x="10" y="80" font-family="Arial, sans-serif" font-size="52" font-weight="900" fill="#1e293b" letter-spacing="6">TEST</text>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#watermark-test)" />
          </svg>

          <!-- Images (background + foreground) — zIndex piloté par layer, jamais par bringToFront -->
          <img
            v-for="il in imageLayers" :key="il.id"
            :src="il.src"
            class="absolute select-none"
            :class="selected && selected.kind==='imageLayer' && selected.id===il.id ? 'outline outline-2 outline-indigo-500 outline-offset-2' : ''"
            :style="{
              left: il.left + 'px', top: il.top + 'px',
              width: (il.naturalWidth * (il.scale ?? 1)) + 'px',
              height: (il.naturalHeight * (il.scale ?? 1)) + 'px',
              opacity: il.opacity ?? 1,
              transform: il.rotation ? `rotate(${il.rotation}deg)` : undefined,
              transformOrigin: '0 0',
              zIndex: il.layer === 'foreground' ? 500 : 0,
              cursor: 'move',
            }"
            draggable="false"
            @pointerdown="startDrag($event, 'imageLayer', il)"
            @click.stop="selectImageLayer(il)"
          />

          <!-- Zones génériques -->
          <div
            v-for="z in zones" :key="z.id"
            class="absolute rounded-lg border flex flex-col items-center justify-center text-center px-2 cursor-move select-none"
            :class="[z.shape === 'pill' ? 'rounded-full' : '', selected && selected.kind==='zone' && selected.id===z.id ? 'ring-2 ring-gray-900' : '']"
            :style="{
              top: z.top + 'px', left: z.left + 'px', width: z.width + 'px', height: z.height + 'px',
              background: catById(z.categoryId).color + '20',
              borderColor: catById(z.categoryId).color + '70',
              zIndex: z.zIndex || 1,
            }"
            @pointerdown="startDrag($event, 'zone', z)"
          >
            <p class="font-bold pointer-events-none" :style="{ color: catById(z.categoryId).color, fontSize: (z.labelFontSize || 11) + 'px' }">{{ z.label }}</p>
            <p class="text-gray-400 pointer-events-none" :style="{ fontSize: Math.max(8, (z.labelFontSize || 11) - 2) + 'px' }">{{ z.capacity }} places</p>
            <template v-if="z.shape !== 'pill'">
              <div class="absolute left-2 right-2 -top-1 h-2 cursor-ns-resize" @pointerdown="startResize($event, 'zone', z, 'top')"></div>
              <div class="absolute left-2 right-2 -bottom-1 h-2 cursor-ns-resize" @pointerdown="startResize($event, 'zone', z, 'bottom')"></div>
              <div class="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize" @pointerdown="startResize($event, 'zone', z, 'left')"></div>
              <div class="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize" @pointerdown="startResize($event, 'zone', z, 'right')"></div>
            </template>
          </div>

          <!-- Zones libres (scène, portes, sanitaires, zones inaccessibles…) -->
          <div
            v-for="fz in freeZones" :key="fz.id"
            class="absolute rounded-lg flex flex-col items-center justify-center text-center gap-0.5 cursor-move select-none"
            :class="selected && selected.kind==='freeZone' && selected.id===fz.id ? 'ring-2 ring-gray-900' : ''"
            :style="{
              top: fz.top + 'px', left: fz.left + 'px', width: fz.width + 'px', height: fz.height + 'px',
              background: fz.color,
              border: `1px solid ${fz.color}55`,
              zIndex: fz.zIndex || 1,
            }"
            @pointerdown="startDrag($event, 'freeZone', fz)"
          >
            <span v-if="iconById(fz.icon).emoji" class="pointer-events-none" style="line-height:1" :style="{ fontSize: (fz.iconSize || Math.max(12, fz.height * 0.3)) + 'px' }">{{ iconById(fz.icon).emoji }}</span>
            <span class="font-bold uppercase pointer-events-none" :style="{ color: fz.textColor || '#000000', fontSize: (fz.labelFontSize || 10) + 'px' }">{{ fz.label }}</span>
            <div class="absolute left-2 right-2 -top-1 h-2 cursor-ns-resize" @pointerdown="startResize($event, 'freeZone', fz, 'top')"></div>
            <div class="absolute left-2 right-2 -bottom-1 h-2 cursor-ns-resize" @pointerdown="startResize($event, 'freeZone', fz, 'bottom')"></div>
            <div class="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize" @pointerdown="startResize($event, 'freeZone', fz, 'left')"></div>
            <div class="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize" @pointerdown="startResize($event, 'freeZone', fz, 'right')"></div>
          </div>

          <!-- Tables rondes avec sièges autour -->
          <div
            v-for="t in tableZones" :key="t.id"
            class="absolute cursor-move select-none"
            :style="{
              top: t.top + 'px', left: t.left + 'px',
              width: tableZoneSize(t) + 'px', height: tableZoneSize(t) + 'px',
              zIndex: t.zIndex || 1,
              transform: `rotate(${t.rotation || 0}deg)`,
            }"
            @pointerdown="startDrag($event, 'tableZone', t)"
          >
            <!-- Sièges autour de la table (positionnés absolument) -->
            <template v-for="seat in tableSeats(t)" :key="seat.index">
              <div
                class="absolute flex items-center justify-center text-white font-bold rounded-full"
                style="pointer-events: auto; cursor: pointer;"
                :class="[
                  selected && selected.kind==='tableSeat' && selected.tableId===t.id && selected.seatInfo?.index===seat.index ? 'ring-2 ring-offset-1 ring-gray-900' : '',
                  isMultiSelectedTableSeat(t, seat) ? 'ring-2 ring-offset-1 ring-blue-500' : '',
                ]"
                :style="{
                  width: (t.seatSize || 15) + 'px', height: (t.seatSize || 15) + 'px',
                  fontSize: (t.seatLabelFontSize || 9) + 'px',
                  background: seat.status === 'disabled' ? '#eef0f2' : catById(t.categoryId).color,
                  border: seat.status === 'disabled' ? '1px solid #d8dade' : 'none',
                  color: seat.status === 'disabled' ? '#9ca3af' : '#fff',
                  left: (tableZoneSize(t) / 2 + ((t.tableSize || 30) / 2 + (t.seatSize || 15) / 2) * Math.cos((2 * Math.PI * seat.index) / (t.seatCount || 6) - Math.PI / 2) - (t.seatSize || 15) / 2) + 'px',
                  top:  (tableZoneSize(t) / 2 + ((t.tableSize || 30) / 2 + (t.seatSize || 15) / 2) * Math.sin((2 * Math.PI * seat.index) / (t.seatCount || 6) - Math.PI / 2) - (t.seatSize || 15) / 2) + 'px',
                }"
                @pointerdown.stop
                @click.stop="onTableSeatClick(t, seat, $event)"
              >{{ seat.index + 1 }}</div>
            </template>
            <!-- Table ronde au centre -->
            <div
              class="absolute rounded-full flex items-center justify-center pointer-events-none"
              :style="{
                width: (t.tableSize || 30) + 'px', height: (t.tableSize || 30) + 'px',
                left: (tableZoneSize(t) - (t.tableSize || 30)) / 2 + 'px',
                top:  (tableZoneSize(t) - (t.tableSize || 30)) / 2 + 'px',
                background: catById(t.categoryId).color + '22',
                border: `2px solid ${catById(t.categoryId).color}88`,
                outline: selected && selected.kind==='tableZone' && selected.id===t.id ? `2px solid ${catById(t.categoryId).color}` : 'none',
                outlineOffset: '3px',
              }"
            >
              <span class="font-bold text-center leading-tight pointer-events-none"
                :style="{ color: catById(t.categoryId).color, fontSize: (t.tableLabelFontSize || 13) + 'px' }">
                {{ t.section || catById(t.categoryId).name }}
              </span>
            </div>
          </div>

          <!-- Sections de tables (groupes de tables circulaires) -->
          <div
            v-for="ts in tableSections" :key="ts.id"
            class="absolute cursor-move select-none"
            :style="{
              top: ts.top + 'px', left: ts.left + 'px',
              width: tableSectionWidth(ts) + 'px',
              height: tableSectionHeight(ts) + 'px',
              zIndex: ts.zIndex || 1,
              background: catById(ts.categoryId).color + '14',
              border: `1px solid ${catById(ts.categoryId).color}55`,
              borderRadius: '10px',
              outline: hoveredTableSection?.id === ts.id
                ? `3px dashed ${catById(ts.categoryId).color}`
                : selected && selected.kind==='tableSection' && selected.id===ts.id ? `2px solid ${catById(ts.categoryId).color}` : 'none',
              outlineOffset: '2px',
              transform: `rotate(${ts.rotation || 0}deg)`,
            }"
            @pointerdown="startDrag($event, 'tableSection', ts)"
          >
            <!-- Badge LOD centré -->
            <div v-if="itemShowBadge(ts)"
              class="lod-section-badge"
              :style="{
                color: catById(ts.categoryId).color,
                borderColor: catById(ts.categoryId).color + '55',
                fontSize: (ts.rowLabelFontSize || 10) + 'px',
              }">
              {{ ts.section || catById(ts.categoryId).name }}
            </div>

            <!-- Grille de tables : tableRows rangées × tableCount colonnes -->
            <div :class="itemShowBadge(ts) ? 'lod-blur' : ''">
              <template v-for="ri in (ts.tableRows || 1)" :key="'r' + ri">
                <template v-for="ci in (ts.tableCount || 3)" :key="'r' + ri + 'c' + ci">
                  <!-- Index global de la table (0-based) -->
                  <template v-if="!(ts.deletedTables || []).includes((ri - 1) * (ts.tableCount || 3) + (ci - 1))">
                  <template v-for="seat in tableSectionSeats(ts).filter(s => s.tableIndex === (ri - 1) * (ts.tableCount || 3) + (ci - 1))" :key="seat.tableIndex + '-' + seat.seatIndex">

                    <div
                      v-if="seat.status !== 'deleted'"
                      class="absolute flex items-center justify-center text-white font-bold rounded-full"
                      style="pointer-events: auto; cursor: pointer;"
                      :class="[
                        selected && selected.kind==='tableSectionSeat' && selected.tsId===ts.id && selected.seatInfo?.tableIndex===seat.tableIndex && selected.seatInfo?.seatIndex===seat.seatIndex ? 'ring-2 ring-offset-1 ring-gray-900' : '',
                        isMultiSelectedTableSectionSeat(ts, seat) ? 'ring-2 ring-offset-1 ring-blue-500' : '',
                      ]"
                      :style="{
                        width: (ts.seatSize || 15) + 'px', height: (ts.seatSize || 15) + 'px',
                        fontSize: (ts.seatLabelFontSize || 9) + 'px',
                        background: seat.status === 'disabled' ? '#eef0f2' : catById(ts.categoryId).color,
                        border: seat.status === 'disabled' ? '1px solid #d8dade' : 'none',
                        color: seat.status === 'disabled' ? '#9ca3af' : '#fff',
                        left: (TS_PAD + (ci - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + tableSectionUnitSize(ts) / 2 + ((ts.tableSize || 30) / 2 + (ts.seatSize || 15) / 2) * Math.cos((2 * Math.PI * seat.seatIndex) / seat.seatsCount - Math.PI / 2 + seat.rotRad) - (ts.seatSize || 15) / 2) + 'px',
                        top:  (TS_PAD + (ri - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + tableSectionUnitSize(ts) / 2 + ((ts.tableSize || 30) / 2 + (ts.seatSize || 15) / 2) * Math.sin((2 * Math.PI * seat.seatIndex) / seat.seatsCount - Math.PI / 2 + seat.rotRad) - (ts.seatSize || 15) / 2) + 'px',
                      }"
                      @pointerdown.stop
                      @click.stop="onTableSectionSeatClick(ts, seat, $event)"
                    >{{ seat.seatIndex + 1 }}</div>
                  </template>
                  <!-- Table circle (cliquable pour sélectionner la table) -->
                  <div
                    class="absolute rounded-full flex items-center justify-center cursor-pointer"
                    style="pointer-events: auto;"
                    :style="{
                      width: (ts.tableSize || 30) + 'px', height: (ts.tableSize || 30) + 'px',
                      left: (TS_PAD + (ci - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + (tableSectionUnitSize(ts) - (ts.tableSize || 30)) / 2) + 'px',
                      top:  (TS_PAD + (ri - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + (tableSectionUnitSize(ts) - (ts.tableSize || 30)) / 2) + 'px',
                      background: catById(ts.categoryId).color + '22',
                      border: selected && selected.kind === 'tableSectionTable' && selected.tsId === ts.id && selected.tableIndex === ((ri - 1) * (ts.tableCount || 3) + (ci - 1))
                        ? `3px solid ${catById(ts.categoryId).color}`
                        : `2px solid ${catById(ts.categoryId).color}88`,
                      boxShadow: selected && selected.kind === 'tableSectionTable' && selected.tsId === ts.id && selected.tableIndex === ((ri - 1) * (ts.tableCount || 3) + (ci - 1))
                        ? `0 0 0 2px #fff, 0 0 0 4px ${catById(ts.categoryId).color}`
                        : 'none',
                    }"
                    @pointerdown.stop
                    @click.stop="selectTableSectionTable(ts, (ri - 1) * (ts.tableCount || 3) + (ci - 1))"
                  >
                    <span class="font-bold text-center leading-tight pointer-events-none"
                      :style="{ color: catById(ts.categoryId).color, fontSize: (ts.tableLabelFontSize || 13) + 'px' }">
                      T{{ (ri - 1) * (ts.tableCount || 3) + ci }}
                    </span>
                  </div>
                  </template>
                  <!-- Placeholder table supprimée — clic pour restaurer -->
                  <template v-else>
                    <div
                      class="absolute rounded-full flex items-center justify-center cursor-pointer"
                      style="pointer-events: auto;"
                      :style="{
                        width: (ts.tableSize || 30) + 'px', height: (ts.tableSize || 30) + 'px',
                        left: (TS_PAD + (ci - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + (tableSectionUnitSize(ts) - (ts.tableSize || 30)) / 2) + 'px',
                        top:  (TS_PAD + (ri - 1) * (tableSectionUnitSize(ts) + (ts.tableSpacing ?? 2)) + (tableSectionUnitSize(ts) - (ts.tableSize || 30)) / 2) + 'px',
                        border: `2px dashed ${catById(ts.categoryId).color}55`,
                        background: 'transparent',
                        color: catById(ts.categoryId).color,
                        opacity: 0.5,
                        fontSize: (ts.tableLabelFontSize || 13) + 'px',
                      }"
                      title="Restaurer cette table"
                      @pointerdown.stop
                      @click.stop="restoreDeletedTable(ts, (ri - 1) * (ts.tableCount || 3) + (ci - 1))"
                    >+</div>
                  </template><!-- /v-else deletedTables -->
                </template>
              </template>
            </div>
            <!-- Handles de resize tableSection -->
            <div class="absolute left-4 right-4 -bottom-1 h-2 cursor-ns-resize" style="pointer-events:auto" @pointerdown.stop="startResizeTableSection($event, ts, 'bottom')"></div>
            <div class="absolute left-4 right-4 -top-1 h-2 cursor-ns-resize" style="pointer-events:auto" @pointerdown.stop="startResizeTableSection($event, ts, 'top')"></div>
            <div class="absolute top-4 bottom-4 -left-1 w-2 cursor-ew-resize" style="pointer-events:auto" @pointerdown.stop="startResizeTableSection($event, ts, 'left')"></div>
            <div class="absolute top-4 bottom-4 -right-1 w-2 cursor-ew-resize" style="pointer-events:auto" @pointerdown.stop="startResizeTableSection($event, ts, 'right')"></div>
          </div>

          <!-- Blocs de sièges nominatifs -->
          <div
            v-for="row in seatRows" :key="row.id"
            class="absolute cursor-move select-none"
            :style="{
              top: row.top + 'px', left: row.left + 'px',
              zIndex: (row.zIndex || 1) + (row.isGroup ? 2000 : 1000),
              transform: `rotate(${row.rotation || 0}deg)`,
            }"
            @pointerdown="startDrag($event, 'seatRow', row)"
          >
            <!-- Carte dont la couleur suit la catégorie.
                 Un groupe n'en a pas : il fait partie de la section, son encadré
                 doit coller aux sièges comme une simple poignée de sélection. -->
            <div class="pointer-events-none" :class="row.isGroup ? '' : 'editor-seat-card'" style="pointer-events:none"
              :style="{
                background: row.isGroup ? 'transparent' : catById(row.categoryId).color + '14',
                borderColor: row.isGroup ? 'transparent' : catById(row.categoryId).color + '55',
                outline: hoveredSeatRowTarget?.id === row.id
                  ? `3px dashed ${catById(row.categoryId).color}`
                  : selected && selected.kind==='seatRow' && selected.id===row.id
                    ? (row.isGroup ? `1.5px solid ${catById(row.categoryId).color}` : `2px solid ${catById(row.categoryId).color}`)
                    : row.isGroup && !row.section
                      ? '1.5px dashed #9ca3af'
                      : 'none',
                outlineOffset: row.isGroup ? '3px' : '2px',
                borderRadius: row.isGroup ? '4px' : undefined,
                position: 'relative',
              }">
              <!-- Badge LOD centré — pas sur un groupe, la section l'affiche déjà -->
              <div v-if="itemShowBadge(row) && !row.isGroup"
                class="lod-section-badge"
                :style="{
                  color: catById(row.categoryId).color,
                  borderColor: catById(row.categoryId).color + '55',
                  fontSize: (row.rowLabelFontSize || 10) + 'px',
                }">
                {{ row.section || catById(row.categoryId).name }}
              </div>
              <!-- Rendu rangée par rangée : label à gauche + sièges + label à droite -->
              <div :class="itemShowBadge(row) ? 'lod-blur' : ''" style="display:flex;flex-direction:column;gap:6px;">
                <div v-for="{ r: rIdx, displayPos: dPos, rowLabel, colOffset, seats: rowSeats } in seatGridByRow(row)" :key="rIdx"
                  style="display:flex;align-items:center;gap:6px;position:relative;"
                  :style="{
                    background: selected && selected.kind==='seatRowRow' && selected.rowId===row.id && selected.r===rIdx
                      ? catById(row.categoryId).color + '22' : 'transparent',
                    borderRadius: '4px',
                    opacity: rowReorder.active && rowReorder.seatRowId===row.id && rowReorder.displayPos===dPos ? 0.35 : 1,
                    outline: rowReorder.active && rowReorder.seatRowId===row.id && rowReorder.targetPos===dPos && rowReorder.displayPos!==dPos
                      ? '2px dashed ' + catById(row.categoryId).color : 'none',
                    outlineOffset: '1px',
                  }"
                >
                  <!-- Poignée réordonnancement (visible seulement quand le bloc est sélectionné) -->
                  <div v-if="!row.isGroup && selected && selected.kind==='seatRow' && selected.id===row.id"
                    class="shrink-0 flex flex-col items-center justify-center gap-0.5 cursor-grab active:cursor-grabbing"
                    style="width:8px;padding:2px 0;pointer-events:auto;"
                    :title="'Glisser pour déplacer la rangée ' + rowLabel"
                    @pointerdown.stop="startRowReorder($event, row, dPos, rIdx)"
                  >
                    <span style="width:6px;height:1.5px;border-radius:1px;background:currentColor;display:block;opacity:0.4;"></span>
                    <span style="width:6px;height:1.5px;border-radius:1px;background:currentColor;display:block;opacity:0.4;"></span>
                    <span style="width:6px;height:1.5px;border-radius:1px;background:currentColor;display:block;opacity:0.4;"></span>
                  </div>
                  <!-- Label rangée GAUCHE — masqué sur un groupe, le bloc l'affiche déjà -->
                  <div v-if="!row.isGroup && (row.seatSize || 22) >= 12"
                    class="shrink-0 flex items-center justify-end font-bold leading-none pointer-events-none select-none"
                    :style="{
                      width: '16px',
                      fontSize: Math.max(7, Math.floor((row.seatSize || 22) * 0.45)) + 'px',
                      color: catById(row.categoryId).color,
                      opacity: selected && selected.kind==='seatRowRow' && selected.rowId===row.id && selected.r===rIdx ? 1 : 0.6,
                    }">{{ rowLabel }}</div>
                  <!-- Placeholders décalage horizontal (colOffset) -->
                  <div
                    v-for="pi in colOffset" :key="'ph-' + pi"
                    class="shrink-0 pointer-events-none"
                    :style="{
                      height: (row.seatSize || 22) + 'px',
                      minWidth: (row.seatSize || 22) + 'px',
                      visibility: 'hidden',
                    }"
                  ></div>
                  <!-- Sièges -->
                  <div
                    v-for="seat in rowSeats" :key="seat.key"
                    class="flex items-center justify-center text-white font-semibold leading-none"
                    :class="seat.status === 'deleted' ? '' : 'cursor-pointer'"
                    :style="{
                      height: (row.seatSize || 22) + 'px',
                      minWidth: row.shape === 'rounded' ? ((row.seatSize || 22) * 1.5) + 'px' : (row.seatSize || 22) + 'px',
                      padding: row.shape === 'rounded' ? '0 6px' : '0',
                      fontSize: Math.max(6, Math.floor((row.seatSize || 22) * 0.42)) + 'px',
                      borderRadius: row.shape === 'round' ? '50%' : row.shape === 'rounded' ? '10px' : '4px',
                      visibility: seat.status === 'deleted' ? 'hidden' : 'visible',
                      background: seat.status === 'sold' ? '#9ca3af' : seat.status === 'disabled' ? '#eef0f2' : catById(seat.categoryId).color,
                      color: seat.status === 'disabled' ? '#9ca3af' : '#fff',
                      opacity: seat.status === 'sold' ? 0.55 : 1,
                      border: seat.status === 'disabled' ? '1px solid #d8dade' : 'none',
                      outline: isMultiSelected(row, seat) ? '2px solid #3b82f6' : 'none',
                      outlineOffset: '1px',
                      pointerEvents: seat.status === 'deleted' ? 'none' : 'auto',
                    }"
                    @pointerdown.stop
                    @click.stop="onSeatClick(row, seat, $event)"
                  >{{ (row.seatSize || 22) >= 14 && seat.status !== 'deleted' ? seat.colLabel : '' }}</div>
                  <!-- Label rangée DROITE — masqué sur un groupe -->
                  <div v-if="!row.isGroup && (row.seatSize || 22) >= 12"
                    class="shrink-0 flex items-center justify-start font-bold leading-none pointer-events-none select-none"
                    :style="{
                      width: '16px',
                      fontSize: Math.max(7, Math.floor((row.seatSize || 22) * 0.45)) + 'px',
                      color: catById(row.categoryId).color,
                      opacity: selected && selected.kind==='seatRowRow' && selected.rowId===row.id && selected.r===rIdx ? 1 : 0.6,
                    }">{{ rowLabel }}</div>
                </div>
              </div>
            </div>

            <div class="absolute left-2 right-2 -top-1 h-2 cursor-ns-resize" @pointerdown="startResizeSeatRow($event, row, 'top')"></div>
            <div class="absolute left-2 right-2 -bottom-1 h-2 cursor-ns-resize" @pointerdown="startResizeSeatRow($event, row, 'bottom')"></div>
            <div class="absolute top-2 bottom-2 -left-1 w-2 cursor-ew-resize" @pointerdown="startResizeSeatRow($event, row, 'left')"></div>
            <div class="absolute top-2 bottom-2 -right-1 w-2 cursor-ew-resize" @pointerdown="startResizeSeatRow($event, row, 'right')"></div>
          </div>

          <!-- Étiquettes texte libres -->
          <div
            v-for="tl in textLabels" :key="tl.id"
            class="absolute select-none cursor-move whitespace-nowrap"
            :class="selected && selected.kind==='textLabel' && selected.id===tl.id ? 'outline outline-2 outline-indigo-500 outline-offset-2 rounded-sm' : ''"
            :style="{
              top: tl.top + 'px',
              left: tl.left + 'px',
              fontSize: (tl.fontSize || 16) + 'px',
              color: tl.color || '#111827',
              fontFamily: tl.fontFamily || 'sans-serif',
              fontWeight: tl.bold ? 'bold' : 'normal',
              fontStyle: tl.italic ? 'italic' : 'normal',
              transform: tl.rotation ? `rotate(${tl.rotation}deg)` : undefined,
              transformOrigin: '0 0',
              zIndex: tl.zIndex || 10,
              lineHeight: 1.2,
            }"
            @pointerdown="startDrag($event, 'textLabel', tl)"
            @click.stop="selectTextLabel(tl)"
          >{{ tl.caption }}</div>

          <div v-if="zones.length===0 && seatRows.length===0 && freeZones.length===0 && tableZones.length===0 && tableSections.length===0" class="absolute inset-0 flex items-center justify-center text-gray-400 text-sm pointer-events-none">
            Cliquez sur "+ Zone", "+ Bloc de sièges", "+ Zone libre", "+ Table" ou "+ Section de tables" pour commencer.
          </div>
        </div>
      </div>
    </div>

    <!-- Panneau latéral de configuration -->
    <!-- Mobile: overlay absolu depuis le haut -->
    <!-- Desktop: colonne à droite -->
    <div
      class="bg-white rounded-2xl shadow-sm p-4 overflow-y-auto text-sm transition-all"
      :class="[
        'lg:relative lg:w-72 lg:shrink-0 lg:flex lg:flex-col',
        showProps
          ? 'absolute inset-y-0 right-0 z-20 w-64 shadow-xl lg:shadow-sm'
          : 'hidden lg:flex'
      ]"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-bold text-gray-800">Propriétés</h3>
        <button @click="showProps = false"
          class="lg:hidden w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- Presse-papiers : copier / dupliquer / coller l'objet sélectionné -->
      <div class="mb-3 pb-3 border-b border-gray-100">
        <div class="grid grid-cols-3 gap-1">
          <button @click="copySelected" :disabled="!duplicable"
            title="Copier l'objet sélectionné (Ctrl/Cmd + C)"
            class="flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition
                   bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900
                   disabled:opacity-40 disabled:hover:bg-gray-100 disabled:hover:text-gray-600 disabled:cursor-not-allowed">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
              <rect x="9" y="9" width="11" height="11" rx="2"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15H4a1 1 0 01-1-1V5a2 2 0 012-2h9a1 1 0 011 1v1"/>
            </svg>
            Copier
          </button>
          <button @click="duplicateSelected" :disabled="!duplicable || pasting"
            title="Dupliquer sur place (Ctrl/Cmd + D)"
            class="flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition
                   bg-indigo-50 text-indigo-600 hover:bg-indigo-100
                   disabled:opacity-40 disabled:hover:bg-indigo-50 disabled:cursor-not-allowed">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
              <rect x="9" y="9" width="11" height="11" rx="2"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15H4a1 1 0 01-1-1V5a2 2 0 012-2h9a1 1 0 011 1v1"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M14.5 12v5M12 14.5h5"/>
            </svg>
            Dupliquer
          </button>
          <button @click="pasteClipboard" :disabled="!clipboard || pasting"
            title="Coller (Ctrl/Cmd + V)"
            class="flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition
                   bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900
                   disabled:opacity-40 disabled:hover:bg-gray-100 disabled:hover:text-gray-600 disabled:cursor-not-allowed">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.8">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 4h6a1 1 0 011 1v1H8V5a1 1 0 011-1z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 6H6a2 2 0 00-2 2v11a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2h-2"/>
            </svg>
            Coller
          </button>
        </div>
        <p v-if="clipboard" class="mt-1.5 text-[10px] text-gray-400 truncate">
          Presse-papiers : <span class="font-semibold text-gray-500">{{ clipboard.name }}</span>
        </p>
        <p v-else class="mt-1.5 text-[10px] text-gray-300">
          Sélectionnez un objet puis Ctrl/Cmd + C · V · D
        </p>
      </div>

      <!-- Blocked deletion warning -->
      <div v-if="deleteBlockMessage" class="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <p class="font-semibold mb-1">⚠ Suppression impossible</p>
        <p>{{ deleteBlockMessage }}</p>
        <p class="mt-2 text-xs text-amber-700">
          Allez dans <strong>Gestion des statuts</strong> pour libérer les sièges avant de supprimer cette section.
        </p>
      </div>

      <div v-if="selectedObjects.size > 0" class="flex flex-col gap-3">
        <p class="font-bold text-gray-800">{{ selectedObjects.size }} objet(s) sélectionné(s)</p>
        <p class="text-xs text-gray-500 leading-relaxed">
          Glissez n'importe lequel d'entre eux sur le plan pour <strong>tous</strong> les déplacer.
          Ctrl/Cmd-clic ou Maj-clic sur un objet pour l'ajouter ou le retirer.
        </p>
        <ul class="text-[11px] text-gray-500 flex flex-col gap-0.5 max-h-40 overflow-y-auto">
          <li v-for="o in objectsInSelection()" :key="o.kind + o.obj.id" class="truncate">
            • <span class="font-semibold">{{ KIND_LABELS[o.kind] }}</span>
            <span class="text-gray-400">{{ o.obj.section || o.obj.label || o.obj.caption || '' }}</span>
          </li>
        </ul>
        <button @click="duplicateObjectSelection" :disabled="pasting"
          class="w-full py-2 rounded-lg bg-indigo-50 text-indigo-600 text-sm font-semibold hover:bg-indigo-100 disabled:opacity-40">
          Dupliquer la sélection
        </button>
        <button @click="removeObjectSelection"
          class="w-full py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer la sélection
        </button>
        <button @click="clearObjectSelection"
          class="w-full py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200">
          Tout désélectionner
        </button>
      </div>

      <div v-else-if="!selected && multiSelected.size === 0" class="text-sm text-gray-400 py-6 text-center">
        Sélectionnez un élément du plan.
        <p class="mt-2 text-[11px] text-gray-300 leading-relaxed">
          Outil « Sélection multiple » (ou Maj + glisser) pour encadrer plusieurs objets · Ctrl/Cmd + A pour tout sélectionner
        </p>
      </div>
      <div v-else-if="multiSelected.size > 0" class="text-sm text-gray-500 py-4">
        {{ multiSelected.size }} siège(s) sélectionné(s). Utilisez la barre d'actions au-dessus du plan pour les
        désactiver ou changer leur catégorie en une fois.
      </div>

      <!-- Propriétés d'une zone -->
      <div v-else-if="selectedZone" class="flex flex-col gap-3">
        <div>
          <label class="text-xs font-semibold text-gray-500">Libellé</label>
          <input v-model="selectedZone.label" @input="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Catégorie</label>
          <select v-model="selectedZone.categoryId" @change="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Forme</label>
          <select v-model="selectedZone.shape" @change="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400">
            <option value="rect">Rectangle</option>
            <option value="pill">Arrondie</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-gray-500">Largeur</label>
            <input v-model="selectedZone.width" @input="scheduleSave" type="number"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Hauteur</label>
            <input v-model="selectedZone.height" @input="scheduleSave" type="number"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Capacité</label>
          <input v-model="selectedZone.capacity" @input="scheduleSave" type="number" min="1"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Taille de police du libellé (px)</label>
          <input v-model="selectedZone.labelFontSize" @input="scheduleSave" type="number" min="6" max="24"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <p class="text-[11px] text-gray-300">Position : {{ Math.round(selectedZone.left) }}, {{ Math.round(selectedZone.top) }} · tirez un bord de la zone sur le plan pour la redimensionner de ce côté</p>
        <button @click="removeSelected" class="w-full mt-2 py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer cette zone
        </button>
      </div>

      <!-- Propriétés d'une zone libre -->
      <div v-else-if="selectedFreeZone" class="flex flex-col gap-3">
        <div>
          <label class="text-xs font-semibold text-gray-500">Libellé</label>
          <input v-model="selectedFreeZone.label" @input="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Icône</label>
          <select v-model="selectedFreeZone.icon" @change="scheduleSave" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option v-for="i in FREE_ZONE_ICONS" :key="i.id" :value="i.id">{{ i.emoji ? i.emoji + ' ' : '' }}{{ i.label }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Taille icône (px)</label>
          <input v-model="selectedFreeZone.iconSize" @input="scheduleSave" type="number" min="10" max="120" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Couleur de fond</label>
          <div class="flex items-center gap-2 mt-1">
            <input v-model="selectedFreeZone.color" @input="scheduleSave" type="color" class="w-10 h-9 rounded border border-gray-200 cursor-pointer" />
            <input v-model="selectedFreeZone.color" @input="scheduleSave" type="text" class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Couleur du texte</label>
          <div class="flex items-center gap-2 mt-1">
            <input :value="selectedFreeZone.textColor || '#000000'" @input="selectedFreeZone.textColor = $event.target.value; scheduleSave()" type="color" class="w-10 h-9 rounded border border-gray-200 cursor-pointer" />
            <input :value="selectedFreeZone.textColor || '#000000'" @input="selectedFreeZone.textColor = $event.target.value; scheduleSave()" type="text" class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-gray-500">Largeur</label>
            <input v-model="selectedFreeZone.width" @input="scheduleSave" type="number" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Hauteur</label>
            <input v-model="selectedFreeZone.height" @input="scheduleSave" type="number" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Taille de police du libellé (px)</label>
          <input v-model="selectedFreeZone.labelFontSize" @input="scheduleSave" type="number" min="6" max="24" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <p class="text-[11px] text-gray-300">Zone non liée à une catégorie (scène, porte, sanitaires, zone inaccessible…). Tirez un bord pour redimensionner.</p>
        <div class="flex gap-2 mt-2">
          <button @click="resetFreeZone" class="flex-1 py-2 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200">
            Réinitialiser
          </button>
          <button @click="removeSelected" class="flex-1 py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
            Supprimer
          </button>
        </div>
      </div>

      <!-- Propriétés d'une étiquette texte -->
      <div v-else-if="selectedTextLabel" class="flex flex-col gap-3">
        <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">Texte</p>
        <div>
          <label class="text-xs font-semibold text-gray-500">Contenu</label>
          <input v-model="selectedTextLabel.caption" @input="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Taille (px)</label>
          <div class="flex items-center gap-2 mt-1">
            <button @click="selectedTextLabel.fontSize = Math.max(6, (selectedTextLabel.fontSize || 16) - 1); scheduleSave()"
              class="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 font-bold text-base">−</button>
            <span class="flex-1 text-center text-sm font-semibold">{{ selectedTextLabel.fontSize || 16 }} pt</span>
            <button @click="selectedTextLabel.fontSize = (selectedTextLabel.fontSize || 16) + 1; scheduleSave()"
              class="w-7 h-7 rounded border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-100 font-bold text-base">+</button>
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Couleur</label>
          <div class="flex items-center gap-2 mt-1">
            <input :value="selectedTextLabel.color || '#111827'" @input="selectedTextLabel.color = $event.target.value; scheduleSave()"
              type="color" class="w-10 h-9 rounded border border-gray-200 cursor-pointer" />
            <input :value="selectedTextLabel.color || '#111827'" @input="selectedTextLabel.color = $event.target.value; scheduleSave()"
              type="text" class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Style</label>
          <div class="flex gap-2 mt-1">
            <button @click="selectedTextLabel.bold = !selectedTextLabel.bold; scheduleSave()"
              :class="selectedTextLabel.bold ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
              class="flex-1 py-1.5 rounded-lg text-sm font-bold transition">B</button>
            <button @click="selectedTextLabel.italic = !selectedTextLabel.italic; scheduleSave()"
              :class="selectedTextLabel.italic ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
              class="flex-1 py-1.5 rounded-lg text-sm italic transition">I</button>
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Police</label>
          <select v-model="selectedTextLabel.fontFamily" @change="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="sans-serif">Sans-serif</option>
            <option value="serif">Serif</option>
            <option value="monospace">Monospace</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Courier New', monospace">Courier New</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Rotation (°)</label>
          <div class="flex items-center gap-2 mt-1">
            <input v-model="selectedTextLabel.rotation" @input="scheduleSave" type="range" min="-180" max="180" step="1"
              class="flex-1" />
            <span class="text-sm font-semibold w-10 text-right">{{ selectedTextLabel.rotation || 0 }}°</span>
          </div>
        </div>
        <button @click="removeSelected" class="w-full mt-2 py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer
        </button>
      </div>

      <!-- Propriétés d'une image -->
      <div v-else-if="selectedImageLayer" class="flex flex-col gap-3">
        <p class="text-xs font-bold text-gray-500 uppercase tracking-wide">Image</p>
        <!-- Info fichier -->
        <div class="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600 flex items-center justify-between">
          <span class="truncate max-w-[120px]" :title="selectedImageLayer.fileName">{{ selectedImageLayer.fileName || 'image' }}</span>
          <span class="text-xs text-gray-400 shrink-0 ml-2">{{ selectedImageLayer.fileSize ? Math.round(selectedImageLayer.fileSize / 1024) + ' kB' : '' }}</span>
        </div>
        <!-- Remplacer -->
        <button @click="() => { pendingImagePos = { replaceId: selectedImageLayer.id }; imageFileInputRef.value?.click(); }"
          class="w-full py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200">
          Remplacer l'image
        </button>

        <div class="border-t border-gray-100 pt-3">
          <p class="text-xs font-bold text-gray-700 mb-2">Forme</p>
          <!-- Scale -->
          <div class="mb-2">
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-semibold text-gray-500">Échelle</label>
              <span class="text-xs font-semibold text-gray-700">{{ Math.round((selectedImageLayer.scale ?? 1) * 100) }} %</span>
            </div>
            <input v-model.number="selectedImageLayer.scale" @input="scheduleSave" type="range" min="0.05" max="5" step="0.01" class="w-full" />
          </div>
          <!-- Rotation -->
          <div class="mb-2">
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-semibold text-gray-500">Rotation</label>
              <span class="text-xs font-semibold text-gray-700">{{ selectedImageLayer.rotation ?? 0 }} °</span>
            </div>
            <input v-model.number="selectedImageLayer.rotation" @input="scheduleSave" type="range" min="-180" max="180" step="1" class="w-full" />
          </div>
          <!-- Opacity -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="text-xs font-semibold text-gray-500">Opacité</label>
              <span class="text-xs font-semibold text-gray-700">{{ Math.round((selectedImageLayer.opacity ?? 1) * 100) }} %</span>
            </div>
            <input v-model.number="selectedImageLayer.opacity" @input="scheduleSave" type="range" min="0" max="1" step="0.01" class="w-full" />
          </div>
        </div>

        <div class="border-t border-gray-100 pt-3">
          <label class="text-xs font-bold text-gray-700 mb-1 block">Couche</label>
          <select v-model="selectedImageLayer.layer" @change="scheduleSave"
            class="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option value="background">Arrière-plan</option>
            <option value="foreground">Premier plan</option>
          </select>
        </div>

        <button @click="removeSelected" class="w-full mt-2 py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer
        </button>
      </div>

      <!-- Propriétés d'une table individuelle dans une section -->
      <div v-else-if="selectedTableSectionTable" class="flex flex-col gap-3">
        <div>
          <p class="text-xs font-bold text-gray-700">
            Table T{{ selectedTableSectionTable.tableIndex + 1 }}
            <span class="font-normal text-gray-400 ml-1">dans {{ selectedTableSectionTable.ts.section || selectedTableSectionTable.ts.label }}</span>
          </p>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Nombre de sièges</label>
          <input
            :value="(selectedTableSectionTable.ts.tableSeatsOverrides?.[selectedTableSectionTable.tableIndex] !== undefined)
              ? selectedTableSectionTable.ts.tableSeatsOverrides[selectedTableSectionTable.tableIndex]
              : (selectedTableSectionTable.ts.seatsPerTable || 6)"
            @input="updateTableSeatsCount($event.target.value)"
            type="number" min="1" max="20"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Rotation (°)</label>
          <div class="flex items-center gap-2 mt-1">
            <input
              :value="selectedTableSectionTable.ts.tableRotationOverrides?.[selectedTableSectionTable.tableIndex] || 0"
              @input="updateTableRotation($event.target.value)"
              type="range" min="0" max="359" step="1"
              class="flex-1 accent-indigo-500" />
            <input
              :value="selectedTableSectionTable.ts.tableRotationOverrides?.[selectedTableSectionTable.tableIndex] || 0"
              @input="updateTableRotation($event.target.value)"
              type="number" min="0" max="359"
              class="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center" />
          </div>
        </div>
        <div class="flex flex-col gap-2 mt-1">
          <button @click="deleteEntireTable"
            class="w-full py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
            Supprimer la table
          </button>
        </div>
        <button @click="selectTableSection(selectedTableSectionTable.ts)"
          class="text-xs text-indigo-500 hover:underline text-left">
          ← Retour à la section
        </button>
      </div>

      <!-- Propriétés d'une section de tables -->
      <div v-else-if="selectedTableSection" class="flex flex-col gap-3">
        <div>
          <label class="text-xs font-semibold text-gray-500">Section</label>
          <input v-model="selectedTableSection.section" @input="scheduleSave" placeholder="ex. VIP-TABLES"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
          <p class="text-[10px] text-gray-400 mt-0.5">Préfixe des sièges (section-table-siège, ex. VIP-1-1)</p>
        </div>
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-gray-500">Afficher section</label>
          <button
            @click="selectedTableSection.badgeVisible = !selectedTableSection.badgeVisible; scheduleSave()"
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
            :class="selectedTableSection.badgeVisible ? 'bg-indigo-500' : 'bg-gray-200'"
          >
            <span class="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200"
              :class="selectedTableSection.badgeVisible ? 'translate-x-4' : 'translate-x-0'" />
          </button>
        </div>
        <div v-if="selectedTableSection.badgeVisible">
          <label class="text-xs font-semibold text-gray-500">Taille badge (px)</label>
          <input v-model="selectedTableSection.rowLabelFontSize" @input="scheduleSave" type="number" min="6" max="24"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Catégorie</label>
          <select v-model="selectedTableSection.categoryId" @change="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-gray-500">Nb. tables</label>
            <input v-model="selectedTableSection.tableCount" @input="scheduleSave" type="number" min="1" max="20"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Sièges / table</label>
            <input v-model="selectedTableSection.seatsPerTable" @input="scheduleSave" type="number" min="2" max="20"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille table (px)</label>
            <input v-model="selectedTableSection.tableSize" @input="scheduleSave" type="number" min="20" max="200"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille nom table (px)</label>
            <input v-model="selectedTableSection.tableLabelFontSize" @input="scheduleSave" type="number" min="6" max="24"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Écart tables (px)</label>
            <input v-model="selectedTableSection.tableSpacing" @input="scheduleSave" type="number" min="0" max="100"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille n° siège (px)</label>
            <input v-model="selectedTableSection.seatLabelFontSize" @input="scheduleSave" type="number" min="0" max="24"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Rotation (°)</label>
          <div class="flex items-center gap-2 mt-1">
            <input v-model="selectedTableSection.rotation" @input="scheduleSave" type="range" min="0" max="359" step="1"
              class="flex-1 accent-indigo-500" />
            <input v-model="selectedTableSection.rotation" @input="scheduleSave" type="number" min="0" max="359"
              class="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center" />
          </div>
        </div>
        <p class="text-xs text-gray-400">{{ (selectedTableSection.tableCount || 3) * (selectedTableSection.seatsPerTable || 6) }} sièges au total</p>
        <button @click="removeSelected" class="w-full mt-2 py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer cette section
        </button>
      </div>

      <!-- Propriétés d'une table ronde -->
      <div v-else-if="selectedTableZone" class="flex flex-col gap-3">
        <div>
          <label class="text-xs font-semibold text-gray-500">Section</label>
          <input v-model="selectedTableZone.section" @input="scheduleSave" placeholder="ex. TABLE-VIP"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
          <p class="text-[10px] text-gray-400 mt-0.5">Identifiant unique — préfixe des sièges (section-1, section-2…)</p>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Catégorie</label>
          <select v-model="selectedTableZone.categoryId" @change="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Nombre de sièges</label>
          <input v-model="selectedTableZone.seatCount" @input="scheduleSave" type="number" min="2" max="20"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille table (px)</label>
            <input v-model="selectedTableZone.tableSize" @input="scheduleSave" type="number" min="30" max="200"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille siège (px)</label>
            <input v-model="selectedTableZone.seatSize" @input="scheduleSave" type="number" min="10" max="50"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille nom table (px)</label>
            <input v-model="selectedTableZone.tableLabelFontSize" @input="scheduleSave" type="number" min="6" max="24"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille n° siège (px)</label>
            <input v-model="selectedTableZone.seatLabelFontSize" @input="scheduleSave" type="number" min="0" max="24"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Rotation (°)</label>
          <div class="flex items-center gap-2 mt-1">
            <input v-model="selectedTableZone.rotation" @input="scheduleSave" type="range" min="0" max="359" step="1"
              class="flex-1 accent-indigo-500" />
            <input v-model="selectedTableZone.rotation" @input="scheduleSave" type="number" min="0" max="359"
              class="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center" />
          </div>
        </div>
        <button @click="removeSelected" class="w-full mt-2 py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer cette table
        </button>
      </div>

      <!-- Propriétés d'un bloc de sièges -->
      <div v-else-if="selectedSeatRow" class="flex flex-col gap-3">
        <!-- Groupe de rangées : rattachement à une section existante -->
        <div v-if="selectedSeatRow.isGroup">
          <label class="text-xs font-semibold text-gray-500">Section de rattachement</label>
          <select :value="selectedSeatRow.section || ''" @change="onGroupSectionChange($event)"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400">
            <option value="">— Non rattaché —</option>
            <option v-for="sec in existingSections" :key="sec" :value="sec">{{ sec }}</option>
          </select>
          <p class="text-[10px] text-gray-400 mt-0.5">
            Au rattachement, le groupe se cale sur la rangée du bloc la plus proche : il en prend
            la hauteur, la taille de sièges et la catégorie, et devient cette rangée. Sa numérotation
            de sièges prolonge celle du bloc — ou la précède s'il est posé à gauche.
          </p>
          <p v-if="!selectedSeatRow.section" class="text-[10px] text-amber-600 mt-1">
            Non rattaché — glissez-le près du bloc d'une section, ou choisissez-la ci-dessus.
          </p>
          <p v-else class="text-[10px] text-gray-500 mt-1">
            Rangée(s) :
            <span class="font-mono font-semibold">{{ seatGridByRow(selectedSeatRow).map(r => r.rowLabel).join(', ') }}</span>
          </p>
        </div>
        <div v-else>
          <label class="text-xs font-semibold text-gray-500">Section</label>
          <input v-model="selectedSeatRow.section" @input="scheduleSave" placeholder="ex. TRIBUNE-NORD"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
          <p class="text-[10px] text-gray-400 mt-0.5">Identifiant unique — préfixe des clés de sièges (section-rangée-siège)</p>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Entrée la plus proche</label>
          <input v-model="selectedSeatRow.entrance" @input="scheduleSave" placeholder="Ex: Entrée A, Porte Nord…"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400" />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-xs font-semibold text-gray-500">Afficher section</label>
          <button
            @click="selectedSeatRow.badgeVisible = !selectedSeatRow.badgeVisible; scheduleSave()"
            class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200"
            :class="selectedSeatRow.badgeVisible ? 'bg-indigo-500' : 'bg-gray-200'"
          >
            <span class="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200"
              :class="selectedSeatRow.badgeVisible ? 'translate-x-4' : 'translate-x-0'" />
          </button>
        </div>
        <div v-if="selectedSeatRow.badgeVisible">
          <label class="text-xs font-semibold text-gray-500">Taille du badge (px)</label>
          <input v-model="selectedSeatRow.rowLabelFontSize" @input="scheduleSave" type="number" min="6" max="24"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Catégorie</label>
          <select v-model="selectedSeatRow.categoryId" @change="scheduleSave"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold text-gray-500">Rangs</label>
            <input v-model="selectedSeatRow.rows" @input="scheduleSave" type="number" min="1" max="40"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Sièges / rang</label>
            <input v-model="selectedSeatRow.cols" @input="scheduleSave" type="number" min="1" max="60"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Forme des sièges</label>
            <select v-model="selectedSeatRow.shape" @change="scheduleSave" class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
              <option value="square">Carré</option>
              <option value="rounded">Rectangle arrondi</option>
              <option value="round">Rond</option>
            </select>
          </div>
          <div>
            <label class="text-xs font-semibold text-gray-500">Taille (px)</label>
            <input v-model="selectedSeatRow.seatSize" @input="scheduleSave" type="number" min="10" max="40"
              class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm" />
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold text-gray-500">Rotation (°)</label>
          <div class="flex items-center gap-2 mt-1">
            <input :value="selectedSeatRow.rotation || 0" @input="onSeatRowRotate(selectedSeatRow, $event.target.value)"
              type="range" min="0" max="359" step="1" class="flex-1 accent-indigo-500" />
            <input :value="selectedSeatRow.rotation || 0" @input="onSeatRowRotate(selectedSeatRow, $event.target.value)"
              type="number" min="0" max="359"
              class="w-16 px-2 py-2 border border-gray-200 rounded-lg text-sm text-center" />
          </div>
          <button v-if="selectedSeatRow.rotation" @click="onSeatRowRotate(selectedSeatRow, 0)"
            class="mt-1 text-[10px] text-gray-400 hover:text-gray-600 underline">Remettre à 0°</button>
        </div>

        <div class="border-t border-gray-100 pt-3">
          <p class="text-xs font-bold text-gray-700 mb-2">Nommage des rangées</p>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label class="text-[11px] text-gray-500">Format</label>
              <select v-model="selectedSeatRow.rowFormat" @change="scheduleSave" class="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option v-for="f in ROW_FORMATS" :key="f.id" :value="f.id">{{ f.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-[11px] text-gray-500">Sens</label>
              <button
                @click="selectedSeatRow.rowDirection = (!selectedSeatRow.rowDirection || selectedSeatRow.rowDirection === 'normal') ? 'reversed' : 'normal'; scheduleSave()"
                class="w-full mt-1 flex items-center justify-between gap-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition font-mono"
                :title="(!selectedSeatRow.rowDirection || selectedSeatRow.rowDirection === 'normal') ? 'Cliquez pour inverser' : 'Cliquez pour remettre en ordre normal'"
              >
                <span v-if="!selectedSeatRow.rowDirection || selectedSeatRow.rowDirection === 'normal'" class="text-gray-600">A B C ↓</span>
                <span v-else class="text-gray-600">↑ C B A</span>
                <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
              </button>
            </div>
          </div>

          <p class="text-xs font-bold text-gray-700 mb-2">Nommage des colonnes</p>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-[11px] text-gray-500">Format</label>
              <select v-model="selectedSeatRow.colFormat" @change="scheduleSave" class="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs">
                <option v-for="f in COL_FORMATS" :key="f.id" :value="f.id">{{ f.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-[11px] text-gray-500">Sens</label>
              <button
                @click="selectedSeatRow.colDirection = (!selectedSeatRow.colDirection || selectedSeatRow.colDirection === 'normal') ? 'reversed' : 'normal'; scheduleSave()"
                class="w-full mt-1 flex items-center justify-between gap-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs hover:bg-gray-50 transition font-mono"
                :title="(!selectedSeatRow.colDirection || selectedSeatRow.colDirection === 'normal') ? 'Cliquez pour inverser' : 'Cliquez pour remettre en ordre normal'"
              >
                <span v-if="!selectedSeatRow.colDirection || selectedSeatRow.colDirection === 'normal'" class="text-gray-600">1 2 3 →</span>
                <span v-else class="text-gray-600">← 3 2 1</span>
                <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Propriétés de la rangée sélectionnée -->
        <div v-if="selectedRowIndex >= 0" class="border border-indigo-100 bg-indigo-50 rounded-lg p-3 flex flex-col gap-3">
          <p class="text-xs font-bold text-indigo-700">
            Rangée
            <strong>{{ (selectedSeatRow.rowOverrides?.[selectedRowIndex]?.label != null ? selectedSeatRow.rowOverrides[selectedRowIndex].label : computeAxisLabel(selectedRowIndex, selectedSeatRow.rows, selectedSeatRow.rowFormat || 'A-Z', selectedSeatRow.rowDirection || 'normal')) }}</strong>
            sélectionnée
          </p>
          <div>
            <label class="text-[11px] text-gray-500">Label de la rangée (laissez vide = automatique)</label>
            <input
              :value="selectedSeatRow.rowOverrides?.[selectedRowIndex]?.label ?? ''"
              @input="setRowOverride(selectedSeatRow, selectedRowIndex, 'label', $event.target.value || null)"
              :placeholder="computeAxisLabel(selectedRowIndex, selectedSeatRow.rows, selectedSeatRow.rowFormat || 'A-Z', selectedSeatRow.rowDirection || 'normal')"
              class="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white" />
          </div>
          <div>
            <label class="text-[11px] text-gray-500">Nombre de sièges dans cette rangée</label>
            <input
              :value="selectedSeatRow.rowOverrides?.[selectedRowIndex]?.cols ?? selectedSeatRow.cols"
              @input="setRowOverride(selectedSeatRow, selectedRowIndex, 'cols', Number($event.target.value) || null)"
              type="number" min="1" max="200"
              class="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white" />
          </div>
          <div>
            <label class="text-[11px] text-gray-500">
              Numérotation démarre à
              <span class="text-indigo-500 font-semibold">(actuellement : {{ firstAxisLabel(selectedSeatRow.colFormat || '1-9', selectedSeatRow.colDirection || 'normal', selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colStartAt ?? 0) }})</span>
            </label>
            <div class="flex items-center gap-2 mt-1">
              <button @click="setRowOverride(selectedSeatRow, selectedRowIndex, 'colStartAt', Math.max(0, (selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colStartAt ?? 0) - 1))"
                class="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-bold">−</button>
              <span class="flex-1 text-center text-xs font-semibold text-gray-700">
                {{ firstAxisLabel(selectedSeatRow.colFormat || '1-9', selectedSeatRow.colDirection || 'normal', selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colStartAt ?? 0) }}
              </span>
              <button @click="setRowOverride(selectedSeatRow, selectedRowIndex, 'colStartAt', (selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colStartAt ?? 0) + 1)"
                class="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center text-sm font-bold">+</button>
              <button v-if="selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colStartAt"
                @click="setRowOverride(selectedSeatRow, selectedRowIndex, 'colStartAt', 0)"
                class="text-[10px] text-gray-400 hover:text-gray-600 underline">Reset</button>
            </div>
          </div>
          <div>
            <label class="text-[11px] text-gray-500">Décalage horizontal (alignement colonnes)</label>
            <div class="flex items-center gap-2 mt-1">
              <button @click="setRowOverride(selectedSeatRow, selectedRowIndex, 'colOffset', Math.max(0, (selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colOffset ?? 0) - 1) || null)"
                class="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center font-bold">←</button>
              <span class="flex-1 text-center text-xs font-semibold text-gray-700">
                {{ selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colOffset ?? 0 }} col.
              </span>
              <button @click="setRowOverride(selectedSeatRow, selectedRowIndex, 'colOffset', (selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colOffset ?? 0) + 1)"
                class="w-7 h-7 rounded border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 flex items-center justify-center font-bold">→</button>
              <button v-if="selectedSeatRow.rowOverrides?.[selectedRowIndex]?.colOffset"
                @click="setRowOverride(selectedSeatRow, selectedRowIndex, 'colOffset', null)"
                class="text-[10px] text-gray-400 hover:text-gray-600 underline">Reset</button>
            </div>
          </div>
          <button @click="selected.value = { kind: 'seatRow', id: selectedSeatRow.id }; scheduleSave()"
            class="text-[10px] text-indigo-500 hover:underline text-left">← Propriétés du bloc entier</button>
        </div>

        <p class="text-xs text-gray-400">
          {{ Number(selectedSeatRow.rows) * Number(selectedSeatRow.cols) || 0 }} sièges · aperçu :
          <strong>{{ computeAxisLabel(0, selectedSeatRow.rows, selectedSeatRow.rowFormat || 'A-Z', selectedSeatRow.rowDirection || 'normal') }}{{ computeAxisLabel(0, selectedSeatRow.cols, selectedSeatRow.colFormat || '1-9', selectedSeatRow.colDirection || 'normal') }}</strong>…
        </p>
        <p class="text-[11px] text-gray-300">Cliquez sur un siège pour sélectionner sa rangée et la configurer. Tirez le bord du bloc pour ajouter/retirer des sièges.</p>
        <button @click="removeSelected" class="w-full mt-2 py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer ce bloc
        </button>
      </div>

      <!-- Propriétés d'un siège individuel -->
      <div v-else-if="selectedSeat" class="flex flex-col gap-3">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-3 h-3 rounded-sm" :style="{ background: catById(selectedSeat.categoryId).color }"></span>
          <p class="font-bold text-gray-800">Siège {{ selectedSeat.label }}</p>
        </div>
        <dl class="text-sm flex flex-col gap-1.5">
          <div class="flex justify-between"><dt class="text-gray-400">Section</dt><dd class="font-medium text-gray-700">{{ selectedSeat.row.section || selectedSeat.row.label }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-400">Rangée</dt><dd class="font-medium text-gray-700">{{ selectedSeat.rowLabel }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-400">Colonne</dt><dd class="font-medium text-gray-700">{{ selectedSeat.colLabel }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-400">Catégorie</dt><dd class="font-medium text-gray-700">{{ catById(selectedSeat.categoryId).name }}</dd></div>
        </dl>
        <div>
          <label class="text-xs font-semibold text-gray-500">Libellé</label>
          <div class="flex gap-1.5 mt-1">
            <input
              :value="selectedSeat.label"
              @input="async (e) => {
                const row = seatRows.find(r => r.id === selectedSeat.row.id);
                const lo = { ...(row.seatLabelOverrides || {}) };
                const val = e.target.value.trim();
                if (val === '' || val === selectedSeat.computedLabel) {
                  delete lo[selectedSeat.posKey];
                } else {
                  lo[selectedSeat.posKey] = val;
                }
                row.seatLabelOverrides = lo;
                selectedSeat.label = val || selectedSeat.computedLabel;
                await adminApi.updateSeatRow(row.id, { seatLabelOverrides: lo }, props.venueId);
                emit('changed');
              }"
              :placeholder="selectedSeat.computedLabel"
              class="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-400"
            />
            <button
              v-if="selectedSeat.label !== selectedSeat.computedLabel"
              title="Réinitialiser"
              @click="async () => {
                const row = seatRows.find(r => r.id === selectedSeat.row.id);
                const lo = { ...(row.seatLabelOverrides || {}) };
                delete lo[selectedSeat.posKey];
                row.seatLabelOverrides = lo;
                selectedSeat.label = selectedSeat.computedLabel;
                await adminApi.updateSeatRow(row.id, { seatLabelOverrides: lo }, props.venueId);
                emit('changed');
              }"
              class="w-8 h-9 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 text-base"
            >↺</button>
          </div>
          <p v-if="selectedSeat.label !== selectedSeat.computedLabel" class="text-[11px] text-indigo-500 mt-0.5">Libellé personnalisé · libellé calculé : {{ selectedSeat.computedLabel }}</p>
        </div>
        <div>
          <label class="text-xs font-semibold text-gray-500">Catégorie</label>
          <select :value="selectedSeat.categoryId" @change="async (e) => {
              const row = seatRows.find(r => r.id === selectedSeat.row.id);
              const overrides = { ...(row.categoryOverrides || {}) };
              overrides[selectedSeat.posKey] = e.target.value;
              row.categoryOverrides = overrides;
              selectedSeat.categoryId = e.target.value;
              await adminApi.updateSeatRow(row.id, { categoryOverrides: overrides }, props.venueId);
              emit('changed');
            }"
            class="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <button @click="deleteSeat" class="w-full py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer ce siège
        </button>
      </div>

      <!-- Propriétés d'un siège de section de tables -->
      <div v-else-if="selectedTableSectionSeat" class="flex flex-col gap-3">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-3 h-3 rounded-full" :style="{ background: catById(selectedTableSectionSeat.ts.categoryId).color }"></span>
          <p class="font-bold text-gray-800">Table {{ selectedTableSectionSeat.tableIndex + 1 }} · Siège {{ selectedTableSectionSeat.seatIndex + 1 }}</p>
        </div>
        <dl class="text-sm flex flex-col gap-1.5">
          <div class="flex justify-between"><dt class="text-gray-400">Section</dt><dd class="font-medium text-gray-700">{{ selectedTableSectionSeat.ts.section || selectedTableSectionSeat.ts.label }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-400">Catégorie</dt><dd class="font-medium text-gray-700">{{ catById(selectedTableSectionSeat.ts.categoryId).name }}</dd></div>
        </dl>
        <button @click="deleteTableSectionSeat" class="w-full py-2 rounded-lg bg-red-50 text-red-500 text-sm font-semibold hover:bg-red-100">
          Supprimer ce siège
        </button>
      </div>

      <!-- Propriétés d'un siège de table individuel -->
      <div v-else-if="selectedTableSeat" class="flex flex-col gap-3">
        <div class="flex items-center gap-2 mb-1">
          <span class="w-3 h-3 rounded-full" :style="{ background: catById(selectedTableSeat.table.categoryId).color }"></span>
          <p class="font-bold text-gray-800">Siège {{ selectedTableSeat.index + 1 }}</p>
        </div>
        <dl class="text-sm flex flex-col gap-1.5">
          <div class="flex justify-between"><dt class="text-gray-400">Section</dt><dd class="font-medium text-gray-700">{{ selectedTableSeat.table.section || selectedTableSeat.table.label }}</dd></div>
          <div class="flex justify-between"><dt class="text-gray-400">Catégorie</dt><dd class="font-medium text-gray-700">{{ catById(selectedTableSeat.table.categoryId).name }}</dd></div>
        </dl>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-seat-card {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 6px;
}
.editor-row-badge {
  position: relative;
  width: fit-content;
  margin: 0 auto -8px auto;
  background: #fff;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 2px 12px;
  font-weight: 700;
  z-index: 2;
  left: 50%;
  transform: translateX(-50%);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.lod-blur {
  filter: blur(2px);
  opacity: 0.5;
  transition: filter 0.2s, opacity 0.2s;
  pointer-events: none;
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
.toast-enter-active, .toast-leave-active { transition: opacity 0.2s, transform 0.2s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
