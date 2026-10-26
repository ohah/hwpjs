import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootnoteColumnReservation } from '../../web/preview/footnote-column-reservation.mjs';

test('generated body line reserves only its original note references on its physical page', () => {
  const notes = [4, 5].map((anchorUnit, index) => ({
    section: 0,
    kind: 'footnote',
    hostParagraph: 0,
    anchorUnit,
    noteNode: index,
    width: 100,
    height: 20,
    rows: [{ kind: 'text', text: '주', y: 0, height: 20 }],
  }));
  const policy = {
    state: 'selected',
    kind: 'footnote',
    section: 0,
    aboveLine: 2,
    belowLine: 3,
    betweenNotes: 4,
    beneathText: false,
  };
  const reservation = createFootnoteColumnReservation(notes, policy, 1);
  assert.equal(reservation.state, 'ready');
  const source = { kind: 'text', section: 0, paragraph: 0, startUnit: 4, endUnit: 5 };
  const slot = {
    kind: 'gap',
    section: 0,
    paragraph: 0,
    createdHost: '0:0',
    referenceRows: [source],
    pageOrdinal: 1,
    columnOrdinal: 0,
  };
  const before = structuredClone({ notes, source, slot });
  assert.deepEqual(reservation.notesFor([slot], 1, 0), [notes[0]]);
  assert.deepEqual(reservation.notesFor([slot], 0, 0), []);
  assert.deepEqual(reservation.notesFor([slot], 1, 1), []);
  const context = {
    column: { x: 0, y: 0, width: 100, height: 200 },
    pageOrdinal: 1,
    columnOrdinal: 0,
    placedRows: [],
  };
  assert.equal(reservation.columnBottom(slot, context), 174);
  assert.equal(
    reservation.columnBottom({ ...slot, referenceRows: [{ ...source, endUnit: 6 }] }, context),
    150,
  );
  assert.equal(
    reservation.columnBottom({ ...slot, referenceRows: [{ ...source, paragraph: 1 }] }, context),
    200,
  );
  assert.equal(
    reservation.columnBottom({ ...slot, referenceRows: [{ ...source, section: 1 }] }, context),
    200,
  );
  assert.equal(reservation.columnBottom({ ...slot, createdHost: undefined }, context), 200);
  assert.deepEqual({ notes, source, slot }, before);
});
