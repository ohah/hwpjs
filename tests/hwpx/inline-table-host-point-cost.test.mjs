import test from 'node:test';
import assert from 'node:assert/strict';
import { inlineTableHostPoint } from '../../web/preview/inline-table-host-run.mjs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
test('overlapping covering intervals retain every table and any ordinary-ink interval', () => {
  const row = {
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 100 },
      { unit: 2, x: 0 },
      { unit: 3, x: 100 },
    ],
    inlineTables: [
      { unit: 0, tableNode: 7 },
      { unit: 2, tableNode: 8 },
    ],
  };
  const all = inlineTableHostPoint(row, 50);
  assert.deepEqual([...all.tableNodes], [7, 8]);
  assert.equal(all.hasHostInk, false);
  const mixed = inlineTableHostPoint({ ...row, inlineTables: row.inlineTables.slice(0, 1) }, 50);
  assert.deepEqual([...mixed.tableNodes], [7]);
  assert.equal(mixed.hasHostInk, true);
});
test('invalid table ids cannot join boxes and NaN units never acquire strict-equality paint membership', () => {
  const row = {
    boundaries: [
      { unit: 0, x: 0 },
      { unit: 1, x: 100 },
    ],
    inlineTables: [
      { unit: 0, tableNode: -1 },
      { unit: 0, tableNode: 1.5 },
      { unit: 0, tableNode: NaN },
    ],
  };
  const p = inlineTableHostPoint(row, 50);
  assert.equal(p.tableNodes.size, 0);
  assert.equal(p.hasHostInk, false);
  const unknown = inlineTableHostPoint(
    {
      boundaries: [
        { unit: NaN, x: 0 },
        { unit: 1, x: 100 },
      ],
      inlineTables: [{ unit: NaN, tableNode: 7 }],
    },
    50,
  );
  assert.equal(unknown.tableNodes.size, 0);
  assert.equal(unknown.hasHostInk, true);
});
test('boundary and anchor visitation is additive under many overlapping intervals', () => {
  for (const n of [128, 256, 512]) {
    let xReads = 0,
      anchorReads = 0;
    const boundaries = Array.from({ length: n + 1 }, (_, unit) => ({
      unit,
      get x() {
        xReads++;
        return unit % 2 ? 100 : 0;
      },
    }));
    const inlineTables = Array.from({ length: n }, (_, unit) => ({
      tableNode: unit + 7,
      get unit() {
        anchorReads++;
        return unit;
      },
    }));
    const point = inlineTableHostPoint({ boundaries, inlineTables }, 50);
    assert.equal(point.tableNodes.size, n / 2);
    assert.equal(point.hasHostInk, false);
    assert.equal(anchorReads, n);
    assert(xReads <= 2 * n);
  }
});
test('one click host computes anchor membership once across ink and intersecting unrelated boxes', () => {
  for (const inkBand of [false, true])
    for (const n of [1, 64, 512]) {
      let reads = 0;
      const host = {
        kind: 'text',
        section: 0,
        paragraph: 1,
        x: 0,
        y: 0,
        width: 100,
        height: 40,
        textTop: 0,
        textHeight: 10,
        text: '\ufffc',
        startUnit: 0,
        endUnit: 1,
        inlineTables: [
          {
            tableNode: 7,
            get unit() {
              reads++;
              return 0;
            },
          },
        ],
        boundaries: [
          { unit: 0, x: 0 },
          { unit: 1, x: 60 },
        ],
      };
      const rows = [host],
        boxes = Array.from({ length: n }, (_, i) => ({
          section: 0,
          tableNode: i + 100,
          listNode: i,
          x: 0,
          y: 0,
          width: 20,
          height: 40,
        }));
      if (inkBand) {
        rows.push({
          kind: 'text',
          section: 0,
          paragraph: 2,
          tableNode: 7,
          listNode: 9,
          x: 0,
          y: 0,
          width: 20,
          height: 1,
          textTop: 0,
          textHeight: 1,
          editable: true,
          selectable: true,
          text: '',
          boundaries: [{ unit: 0, x: 0 }],
        });
        boxes.unshift({ section: 0, tableNode: 7, listNode: 9, x: 0, y: 0, width: 20, height: 40 });
      }
      assert.equal(
        rowAtPoint({ spatialRows: true, rows, boxes }, 10, inkBand ? 5 : 32),
        inkBand ? 1 : 0,
      );
      assert.equal(reads, 1, `${inkBand ? 'ink+box' : 'box'}:${n}`);
    }
});
