import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
const base = {
  kind: 'text',
  section: 0,
  x: 0,
  y: 0,
  width: 160,
  height: 24,
  textTop: 0,
  textHeight: 10,
  editable: true,
  selectable: true,
  startUnit: 0,
  endUnit: 2,
};
const host = {
  ...base,
  paragraph: 1,
  text: '\ufffcA',
  boundaries: [
    { unit: 0, x: 0 },
    { unit: 1, x: 96 },
    { unit: 2, x: 108 },
  ],
  inlineTables: [{ tableNode: 38, unit: 0 }],
};
const cell = {
  ...base,
  paragraph: 2,
  tableNode: 38,
  listNode: 45,
  text: '',
  width: 48,
  height: 10,
  startUnit: 0,
  endUnit: 0,
  boundaries: [{ unit: 0, x: 0 }],
};
const box = { section: 0, tableNode: 38, listNode: 45, x: 0, y: 0, width: 48, height: 24 };
const scene = (h = host, c = cell, b = box) => ({ spatialRows: true, rows: [h, c], boxes: [b] });
test('actual produced four-cell geometry selects all 36 interior grid points, including bottom bands', () => {
  const l = JSON.parse(
    readFileSync(
      new URL('../fixtures/own-inline-table-hit/produced-solid-layout.json', import.meta.url),
    ),
  );
  const cells = l.boxes.filter((b) => b.tableNode === 38);
  assert.equal(cells.length, 4);
  let count = 0;
  for (const b of cells)
    for (const fx of [0.1, 0.5, 0.9])
      for (const fy of [0.1, 0.5, 0.9]) {
        const i = rowAtPoint(l, b.x + b.width * fx, b.y + b.height * fy),
          r = l.rows[i];
        assert.equal(r?.tableNode, 38, `${b.listNode}/${fx}/${fy} table`);
        assert.equal(r?.listNode, b.listNode, `${b.listNode}/${fx}/${fy} cell`);
        count++;
      }
  assert.equal(count, 36);
});
test('same-table box gets the no-ink host bottom band while ordinary direct text hit is unchanged', () => {
  assert.equal(rowAtPoint(scene(), 20, 20), 1);
  assert.equal(rowAtPoint(scene(), 102, 5), 0);
  assert.equal(rowAtPoint(scene(), 102, 20), 0);
});
test('wrong-table and out-of-host-span boxes cannot take host fallback', () => {
  assert.equal(
    rowAtPoint(scene(host, { ...cell, tableNode: 39 }, { ...box, tableNode: 39 }), 20, 20),
    0,
  );
  assert.equal(
    rowAtPoint(scene(host, { ...cell, width: 150 }, { ...box, width: 150 }), 130, 20),
    0,
  );
});
test('section and page owner mismatch cannot take host fallback', () => {
  assert.equal(rowAtPoint(scene(host, { ...cell, section: 1 }, { ...box, section: 1 }), 20, 20), 0);
  assert.equal(
    rowAtPoint(
      scene({ ...host, pageOrdinal: 0 }, { ...cell, pageOrdinal: 1 }, { ...box, pageOrdinal: 1 }),
      20,
      20,
    ),
    0,
  );
});
test('front/behind paint ordering is preserved for fallback boxes and their rows', () => {
  assert.equal(
    rowAtPoint(
      scene(
        { ...host, tablePaintLayer: 'front' },
        { ...cell, tablePaintLayer: 'behind' },
        { ...box, tablePaintLayer: 'behind' },
      ),
      20,
      20,
    ),
    0,
  );
  assert.equal(
    rowAtPoint(
      scene(
        { ...host, tablePaintLayer: 'behind' },
        { ...cell, tablePaintLayer: 'front' },
        { ...box, tablePaintLayer: 'front' },
      ),
      20,
      20,
    ),
    1,
  );
});
test('box or selected row outside the document clip cannot take host fallback', () => {
  const pageClip = { x: 0, y: 0, width: 48, height: 12 };
  assert.equal(rowAtPoint(scene(host, cell, { ...box, pageClip }), 20, 20), 0);
  assert.equal(rowAtPoint(scene(host, { ...cell, pageClip }, box), 20, 20), 0);
});
test('inverse transformed box and cell row share the correct nearest local position', () => {
  const transform = [2, 0, 0, 2, 40, 30];
  assert.equal(
    rowAtPoint(
      scene({ ...host, transform }, { ...cell, transform }, { ...box, transform }),
      80,
      70,
    ),
    1,
  );
});
test('nonselectable missing or unrelated cell rows leave the host fallback intact', () => {
  assert.equal(rowAtPoint(scene(host, { ...cell, editable: false, selectable: false }), 20, 20), 0);
  assert.equal(rowAtPoint(scene(host, { ...cell, listNode: 46 }), 20, 20), 0);
  assert.equal(rowAtPoint({ spatialRows: true, rows: [host], boxes: [box] }, 20, 20), 0);
});
test('real overlapping front glyph ink remains ahead of table-box fallback', () => {
  const ink = {
    ...cell,
    paragraph: 3,
    tableNode: undefined,
    listNode: undefined,
    text: 'B',
    endUnit: 1,
    width: 48,
    height: 24,
    textHeight: 24,
    tablePaintLayer: 'front',
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 48 },
    ],
  };
  assert.equal(rowAtPoint({ ...scene(), rows: [host, cell, ink] }, 20, 20), 2);
});
