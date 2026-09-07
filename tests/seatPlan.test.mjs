// Rejoue le contrat partagé (tests/fixtures/seat-plan.json) contre le module
// du back-office. Le renderer acheteur et EventService.php ont chacun leur
// test sur le MÊME fichier : c'est ce qui empêche les trois implémentations
// de diverger à nouveau.
//
//   node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  seatRowKeys, buildSeats, buildSeatsByRow, displayOrder,
  seatRowSize, rowTopOffset, cardInset, maxCols,
} from '../src/services/seatPlan.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, 'fixtures/seat-plan.json'), 'utf8'));

test('les clés produites correspondent au contrat partagé', async (t) => {
  for (const c of fixture.cases) {
    await t.test(c.name, () => {
      assert.deepEqual(seatRowKeys(c.row), c.keys);
    });
  }
});

test("rowOrder ne change que l'ordre d'affichage", () => {
  const c = fixture.cases.find((x) => x.displayOrder);
  assert.deepEqual(displayOrder(c.row), c.displayOrder);
  // les clés restent dans l'ordre des index de données
  assert.deepEqual(seatRowKeys(c.row), c.keys);
  // et les rangées affichées suivent la permutation
  assert.deepEqual(buildSeatsByRow(c.row).map((r) => r.r), c.displayOrder);
});

test('géométrie du rendu', async (t) => {
  for (const g of fixture.geometry) {
    await t.test(g.name, () => {
      assert.deepEqual(seatRowSize(g.row), g.size);
      g.rowTopOffset.forEach((expected, pos) => {
        assert.equal(rowTopOffset(g.row, pos), expected);
      });
    });
  }
});

test("un groupe n'a pas de carte, un bloc en a une", () => {
  assert.equal(cardInset({ id: 'a' }), 7);
  assert.equal(cardInset({ id: 'b', isGroup: true }), 0);
});

test('le siège affiche le numéro seul, le libellé complet sert à identifier', () => {
  const row = {
    id: 'x', section: 'S', rows: 1, cols: 2,
    rowFormat: 'A-Z', rowDirection: 'normal', colFormat: '1-9', colDirection: 'normal',
  };
  const [first] = buildSeats(row);
  assert.equal(first.displayLabel, '1');
  assert.equal(first.label, 'A1');
  assert.equal(first.key, 'S-A-1');
});

test('un libellé de siège personnalisé ne change pas la clé', () => {
  const row = {
    id: 'x', section: 'S', rows: 1, cols: 1,
    rowFormat: 'A-Z', rowDirection: 'normal', colFormat: '1-9', colDirection: 'normal',
    seatLabelOverrides: { '0-0': 'Fauteuil du maire' },
  };
  const [seat] = buildSeats(row);
  assert.equal(seat.label, 'Fauteuil du maire');
  assert.equal(seat.key, 'S-A-1');
});

test('les sièges désactivés gardent leur place mais sortent des clés', () => {
  const row = {
    id: 'x', section: 'S', rows: 1, cols: 3,
    rowFormat: 'A-Z', rowDirection: 'normal', colFormat: '1-9', colDirection: 'normal',
    disabledSeats: ['0-1'],
  };
  assert.equal(buildSeats(row).length, 3);
  assert.equal(seatRowKeys(row).length, 2);
  assert.equal(maxCols(row), 3);
});
