import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
import { hitText } from '../../web/preview/text-geometry.mjs';
import {
  hitTableBoundary,
  tableBoundaryFrames,
} from '../../web/preview/table-boundary-geometry.mjs';
import { cellTextAtBoundaryPoint } from '../../web/preview/table-boundary-text-hit.mjs';
import { hitDrawingBoundary } from '../../web/preview/drawing-boundary-hit.mjs';
const recorded = JSON.parse(
  readFileSync(
    new URL('../fixtures/own-inline-table-hit/actual807-full-layout.json', import.meta.url),
  ),
).renderers[0];
const layout = recorded.layout;
const paragraphAt = (t) => (t.section === 0 && t.paragraph === 1 ? recorded.hostParagraph : null);
const compose = (l, x, y, target = null) =>
  hitTableBoundary(l, x, y, paragraphAt, target) ??
  hitDrawingBoundary(l, x, y, target) ??
  hitText(l, x, y, target);
const points = [
  { name: 'top-left', x: 157.38666666666666, y: 195.20000000000002, paragraph: 2, listNode: 45 },
  { name: 'top-right', x: 205.38666666666666, y: 195.20000000000002, paragraph: 3, listNode: 54 },
  { name: 'bottom-left', x: 157.38666666666666, y: 219.20000000000002, paragraph: 4, listNode: 64 },
  {
    name: 'bottom-right',
    x: 205.38666666666666,
    y: 219.20000000000002,
    paragraph: 5,
    listNode: 73,
  },
];
for (const p of points)
  test(`actual807 full composed pointer path: ${p.name} cell padding wins`, () => {
    const row = layout.rows[rowAtPoint(layout, p.x, p.y)];
    assert.equal(row.listNode, p.listNode);
    assert.equal(
      cellTextAtBoundaryPoint(layout, p.x, p.y),
      false,
      'padding is not falsely called glyph ink',
    );
    assert.equal(hitTableBoundary(layout, p.x, p.y, paragraphAt), null);
    const found = compose(layout, p.x, p.y);
    assert.equal(found.paragraph, p.paragraph);
    assert.equal(found.unit, 0);
    assert.equal(found.tableNode, undefined);
  });
test('exact outer frame and outside tolerance retain protected before/after table caret', () => {
  const box = tableBoundaryFrames(layout).find((f) => f.tableNode === 38).rectangle,
    bottom = box.y + box.height;
  for (const x of [box.x + box.width * 0.25, box.x + box.width * 0.75]) {
    for (const y of [bottom, bottom + 2])
      assert.equal(hitTableBoundary(layout, x, y, paragraphAt)?.tableNode, 38);
    assert.equal(hitTableBoundary(layout, x, bottom + 5, paragraphAt), null);
  }
  assert.equal(hitTableBoundary(layout, box.x, box.y + box.height / 2, paragraphAt)?.tableNode, 38);
});
test('same-table selectable padding is opt-in to the frame context, not a new glyph claim', () => {
  const p = points[2],
    frame = tableBoundaryFrames(layout).find((f) => f.tableNode === 38);
  assert.equal(cellTextAtBoundaryPoint(layout, p.x, p.y), false);
  assert.equal(cellTextAtBoundaryPoint(layout, p.x, p.y, frame), true);
  assert.equal(cellTextAtBoundaryPoint(layout, p.x, p.y, { ...frame, tableNode: 39 }), false);
  assert.equal(cellTextAtBoundaryPoint(layout, p.x, p.y, { ...frame, pageOrdinal: 1 }), false);
});
test('nonselectable matching cell cannot suppress the outer anchor tolerance', () => {
  const l = structuredClone(layout);
  for (const r of l.rows)
    if (r.tableNode === 38 && r.listNode === 64) {
      r.editable = false;
      r.selectable = false;
    }
  assert.equal(hitTableBoundary(l, points[2].x, points[2].y, paragraphAt)?.paragraph, 1);
});
test('cell box clip excludes padding priority without changing the border policy', () => {
  const l = structuredClone(layout),
    b = l.boxes.find((b) => b.listNode === 64);
  b.pageClip = { x: b.x, y: b.y, width: b.width, height: 10 };
  const frame = tableBoundaryFrames(l).find((f) => f.tableNode === 38);
  assert.equal(cellTextAtBoundaryPoint(l, points[2].x, points[2].y, frame), false);
  assert.equal(hitTableBoundary(l, points[2].x, points[2].y, paragraphAt)?.paragraph, 1);
});
test('constrained text selection keeps its cell target and existing boundary target filter', () => {
  const p = points[2],
    target = { section: 0, paragraph: 4 };
  assert.equal(hitTableBoundary(layout, p.x, p.y, paragraphAt, target), null);
  assert.equal(compose(layout, p.x, p.y, target).paragraph, 4);
});
