// Source unique de vérité pour la géométrie et les clés d'un bloc de sièges.
//
// Ces formules étaient réimplémentées dans chaque rendu — éditeur, aperçu,
// vignette, vue événement, widget acheteur, et côté PHP à la création des
// sièges d'un événement. Elles ont divergé une à une : réglages par rangée
// ignorés, padding en trop, libellés de rangée présents ici et pas là,
// contenu du siège différent. Chaque divergence produit soit un plan qui ne
// ressemble pas à celui dessiné, soit — plus grave — des clés de sièges qui
// ne correspondent pas à celles vendues en base.
//
// Toute nouvelle vue doit passer par ce module. Les implémentations qui ne
// peuvent pas l'importer (le widget en IIFE dans mitoera-api, et le PHP)
// sont verrouillées par le jeu d'essai partagé de tests/fixtures/seatPlan.

import { computeAxisLabel } from './seatLabel.js';

// ---------- Géométrie du rendu ----------
// Un bloc est une carte (bordure 1px + padding 6px) contenant des rangées
// espacées de 6px. Les libellés de rangée occupent 16px de chaque côté, dans
// le flux, suivis du même gap : les omettre décale les sièges de 22px.
export const ROW_GAP = 6;
export const SEAT_GAP = 6;
export const CARD_BORDER = 1;
export const CARD_PADDING = 6;
export const CARD_INSET = CARD_BORDER + CARD_PADDING;
export const ROW_LABEL_WIDTH = 16;
// En dessous de cette taille, le numéro ne tient pas dans le siège
export const MIN_SEAT_SIZE_FOR_LABEL = 14;

// Un groupe de rangées n'a pas de carte : il fait partie d'une section
export function cardInset(row) {
  return row.isGroup ? 0 : CARD_INSET;
}

export function seatSizeOf(row) {
  return row.seatSize || 22;
}

export function showsRowLabels(row) {
  return !row.isGroup && seatSizeOf(row) >= MIN_SEAT_SIZE_FOR_LABEL;
}

export function showsSeatNumber(row) {
  return seatSizeOf(row) >= MIN_SEAT_SIZE_FOR_LABEL;
}

// Ordonnée du haut de la rangée affichée en position `displayPos`
export function rowTopOffset(row, displayPos) {
  return cardInset(row) + displayPos * (seatSizeOf(row) + ROW_GAP);
}

// ---------- Réglages par rangée ----------
export function rowOverride(row, dataR) {
  return (row.rowOverrides || {})[dataR] || {};
}

export function rowCols(row, dataR) {
  const ov = rowOverride(row, dataR);
  return ov.cols != null ? ov.cols : (row.cols || 1);
}

export function rowStartAt(row, dataR) {
  const ov = rowOverride(row, dataR);
  return ov.colStartAt != null ? ov.colStartAt : 0;
}

export function rowColOffset(row, dataR) {
  return rowOverride(row, dataR).colOffset ?? 0;
}

export function rowLabel(row, dataR) {
  const ov = rowOverride(row, dataR);
  return ov.label != null && ov.label !== ''
    ? String(ov.label)
    : computeAxisLabel(dataR, row.rows, row.rowFormat || 'A-Z', row.rowDirection || 'normal');
}

export function colLabel(row, dataR, c) {
  return computeAxisLabel(
    c, rowCols(row, dataR), row.colFormat || '1-9', row.colDirection || 'normal', rowStartAt(row, dataR),
  );
}

// rowOrder est une permutation d'AFFICHAGE : l'index de données reste la clé
export function displayOrder(row) {
  const n = row.rows || 1;
  return (row.rowOrder?.length === n)
    ? row.rowOrder
    : Array.from({ length: n }, (_, i) => i);
}

// ---------- Identité ----------
export function sectionOf(row) {
  return row.section || row.label || row.id;
}

export function seatKey(row, dataR, c) {
  return `${sectionOf(row)}-${rowLabel(row, dataR)}-${colLabel(row, dataR, c)}`;
}

// ---------- Encombrement ----------
// Largeur utile : la rangée la plus large, décalage horizontal compris
export function maxCols(row) {
  let max = 0;
  for (let r = 0; r < (row.rows || 1); r++) {
    max = Math.max(max, rowCols(row, r) + rowColOffset(row, r));
  }
  return max || (row.cols || 1);
}

export function seatRowSize(row) {
  const ss = seatSizeOf(row);
  const cols = maxCols(row);
  const rows = row.rows || 1;
  const inset = cardInset(row);
  return {
    w: 2 * inset + cols * ss + Math.max(0, cols - 1) * SEAT_GAP,
    h: 2 * inset + rows * ss + Math.max(0, rows - 1) * ROW_GAP,
  };
}

// ---------- Sièges ----------
/**
 * Tous les sièges d'un bloc, index de données croissant.
 * `status` vaut 'deleted' | 'disabled' | 'available' — l'état du PLAN, sans
 * rapport avec l'état commercial d'un événement, que les vues croisent
 * elles-mêmes via `key`.
 */
export function buildSeats(row) {
  const disabled = row.disabledSeats || [];
  const deleted = row.deletedSeats || [];
  const catOverrides = row.categoryOverrides || {};
  const labelOverrides = row.seatLabelOverrides || {};
  const section = sectionOf(row);
  const seats = [];

  for (let r = 0; r < (row.rows || 1); r++) {
    const rLabel = rowLabel(row, r);
    const cols = rowCols(row, r);
    for (let c = 0; c < cols; c++) {
      const posKey = `${r}-${c}`;
      const isDeleted = deleted.includes(posKey);
      const isDisabled = !isDeleted && disabled.includes(posKey);
      const cLabel = colLabel(row, r, c);
      seats.push({
        r, c, posKey, section,
        key: `${section}-${rLabel}-${cLabel}`,
        rowLabel: rLabel,
        colLabel: cLabel,
        // Écrit dans le siège : le numéro seul, la rangée étant donnée par les
        // libellés de part et d'autre
        displayLabel: cLabel,
        // Identifie le siège dans les tooltips et les modales
        label: labelOverrides[posKey] ?? `${rLabel}${cLabel}`,
        categoryId: catOverrides[posKey] || row.categoryId,
        status: isDeleted ? 'deleted' : isDisabled ? 'disabled' : 'available',
      });
    }
  }
  return seats;
}

/** Les sièges regroupés par rangée, dans l'ordre d'affichage. */
export function buildSeatsByRow(row) {
  const all = buildSeats(row);
  return displayOrder(row).map((dataR, displayPos) => ({
    r: dataR,
    displayPos,
    rowLabel: rowLabel(row, dataR),
    colOffset: rowColOffset(row, dataR),
    seats: all.filter((s) => s.r === dataR),
  }));
}

/** Les clés produites par un bloc — sièges supprimés et désactivés exclus. */
export function seatRowKeys(row) {
  return buildSeats(row)
    .filter((s) => s.status === 'available')
    .map((s) => s.key);
}
