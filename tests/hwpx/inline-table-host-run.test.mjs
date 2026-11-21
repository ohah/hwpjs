import test from 'node:test';
import assert from 'node:assert/strict';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
import { hitText } from '../../web/preview/text-geometry.mjs';
import { isInlineTableHostUnit } from '../../web/preview/inline-table-host-run.mjs';
import { displayRunText } from '../../web/preview/text-measurement.mjs';
const base = {
  kind: 'text',
  section: 0,
  x: 0,
  y: 0,
  width: 150,
  height: 20,
  textTop: 0,
  textHeight: 20,
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
};
const cell = {
  ...base,
  paragraph: 2,
  tableNode: 38,
  listNode: 45,
  text: '',
  width: 96,
  startUnit: 0,
  endUnit: 0,
  boundaries: [{ unit: 0, x: 0 }],
};
const scene = (h = host, c = cell) => ({ spatialRows: true, rows: [h, c], boxes: [] });
const tableHost = { ...host, inlineTables: [{ tableNode: 38, unit: 0 }] };
test('table host run uses the same existing projected unit predicate as painting', () => {
  assert.equal(isInlineTableHostUnit(tableHost, 0), true);
  assert.equal(isInlineTableHostUnit(tableHost, 1), false);
  assert.equal(isInlineTableHostUnit(host, 0), false);
  assert.equal(rowAtPoint(scene(tableHost), 30, 10), 1);
  assert.deepEqual(hitText(scene(tableHost), 30, 10), {
    section: 0,
    paragraph: 2,
    unit: 0,
    affinity: 'forward',
  });
  assert.equal(rowAtPoint(scene(tableHost), 102, 10), 0);
});
test('recorded click geometry selects the empty cell with actual-source table anchor metadata', () => {
  const h = {
    ...tableHost,
    x: 133.38666666666666,
    y: 173.60000000000002,
    width: 566.9333333333334,
    height: 48,
    textHeight: 13.333333333333332,
    text: '\ufffc기울임진하게',
    endUnit: 7,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 96 },
      { unit: 7, x: Number('165.18264770507812') },
    ],
  };
  const c = {
    ...cell,
    x: h.x,
    y: h.y,
    width: 48,
    height: 13.333333333333332,
    textHeight: 13.333333333333332,
  };
  assert.equal(rowAtPoint(scene(h, c), 156.859375, 185), 1);
});
test('unowned replacement diamond remains actual visible text ink', () => {
  assert.equal(displayRunText('\ufffc', {}, 0, 'text'), '◇');
  const h = {
    ...host,
    text: '\ufffc',
    endUnit: 1,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 20 },
    ],
  };
  assert.equal(rowAtPoint(scene(h), 10, 10), 0);
});
test('automatic number glyph retains hit priority over a selectable empty cell', () => {
  const p = {
    text: '\ufffc',
    automaticNumbers: [
      {
        unit: 0,
        source: {
          values: { type_known: true, num: 7 },
          format: { type_known: true, supscript: false, raw: ['DIGIT', '', '', ''] },
        },
      },
    ],
  };
  assert.equal(displayRunText('\ufffc', p, 0, 'text'), '7');
  const h = {
    ...host,
    ...p,
    endUnit: 1,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 20 },
    ],
  };
  assert.equal(rowAtPoint(scene(h), 10, 10), 0);
});
test('another object unit is not suppressed by a different table anchor in the same row', () => {
  const h = {
    ...tableHost,
    text: '\ufffc\ufffc',
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 96 },
      { unit: 2, x: 116 },
    ],
  };
  assert.equal(rowAtPoint(scene(h, { ...cell, width: 116 }), 30, 10), 1);
  assert.equal(rowAtPoint(scene(h, { ...cell, width: 116 }), 106, 10), 0);
});
test('UTF16 nonzero start and astral prefix keep source unit alignment', () => {
  const h = {
    ...host,
    text: '😀\ufffcA',
    startUnit: 100,
    endUnit: 104,
    inlineTables: [{ tableNode: 38, unit: 102 }],
    boundaries: [
      { unit: 100, x: 0 },
      { unit: 102, x: 20 },
      { unit: 103, x: 116 },
      { unit: 104, x: 128 },
    ],
  };
  const c = { ...cell, width: 116 };
  assert.equal(rowAtPoint(scene(h, c), 10, 10), 0);
  assert.equal(rowAtPoint(scene(h, c), 30, 10), 1);
  assert.equal(rowAtPoint(scene(h, c), 122, 10), 0);
  const missingStart = { ...h };
  delete missingStart.startUnit;
  assert.equal(rowAtPoint(scene(missingStart, c), 30, 10), 1);
});
test('row-local inverse transform and document clip are preserved', () => {
  const transform = [2, 0, 0, 2, 40, 30];
  const h = { ...tableHost, transform },
    c = { ...cell, transform };
  assert.equal(rowAtPoint(scene(h, c), 100, 50), 1);
  const pageClip = { x: 0, y: 0, width: 20, height: 20 };
  assert.equal(rowAtPoint(scene({ ...h, pageClip }, { ...c, pageClip }), 100, 50), -1);
});
test('front actual glyph still beats behind text; table exclusion retains direct paint ordering', () => {
  const h = {
    ...host,
    text: '\ufffc',
    endUnit: 1,
    tablePaintLayer: 'front',
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 20 },
    ],
  };
  const c = {
    ...cell,
    text: 'B',
    endUnit: 1,
    tablePaintLayer: 'behind',
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 20 },
    ],
  };
  assert.equal(rowAtPoint(scene(h, c), 10, 10), 0);
  assert.equal(
    rowAtPoint(
      scene({ ...tableHost, tablePaintLayer: 'front' }, { ...cell, tablePaintLayer: 'behind' }),
      30,
      10,
    ),
    0,
  );
  assert.equal(
    rowAtPoint(
      scene({ ...tableHost, tablePaintLayer: 'behind' }, { ...cell, tablePaintLayer: 'front' }),
      30,
      10,
    ),
    1,
  );
});
test('ordinary overlapping text and no-cell fallback keep prior hit behavior', () => {
  assert.equal(rowAtPoint(scene({ ...host, text: 'VA' }), 30, 10), 0);
  assert.equal(rowAtPoint({ spatialRows: true, rows: [tableHost], boxes: [] }, 30, 10), 0);
});

test('an excluded interval does not suppress another matching ordinary interval', () => {
  const h = {
    ...tableHost,
    text: '\ufffcAB',
    endUnit: 3,
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 96 },
      { unit: 2, x: 48 },
      { unit: 3, x: 120 },
    ],
  };
  assert.equal(rowAtPoint(scene(h), 60, 10), 0);
});
