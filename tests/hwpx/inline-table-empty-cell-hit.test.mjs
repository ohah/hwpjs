import test from 'node:test';
import assert from 'node:assert/strict';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
const textRow = {
  kind: 'text',
  section: 0,
  x: 133,
  y: 173,
  editable: true,
  selectable: true,
  textTop: 0,
  textHeight: 24,
};
const host = {
  ...textRow,
  paragraph: 1,
  startUnit: 0,
  width: 567,
  height: 48,
  text: '\ufffc가',
  inlineTables: [{ tableNode: 38, unit: 0 }],
  boundaries: [
    { unit: 0, x: 0 },
    { unit: 1, x: 96 },
    { unit: 2, x: 108 },
  ],
};
const cell = {
  ...textRow,
  paragraph: 2,
  startUnit: 0,
  width: 48,
  height: 13,
  tableNode: 38,
  listNode: 45,
  text: '',
  boundaries: [{ unit: 0, x: 0 }],
};
const box = { ...cell, height: 24 };
const layout = { spatialRows: true, rows: [host, cell], boxes: [box] };
test('inline table advance does not act as body glyph ink over a selectable empty cell', () => {
  assert.equal(rowAtPoint(layout, 157, 185), 1);
  assert.equal(rowAtPoint(layout, 235, 185), 0);
});
test('inline object advance keeps the host fallback when no cell can be selected', () => {
  assert.equal(rowAtPoint({ ...layout, rows: [host], boxes: [] }, 157, 185), 0);
});
