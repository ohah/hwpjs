import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pictureResizeFixedAnchor,
  pictureResizeGuideGeometry,
  pictureResizeHandles,
} from '../../web/preview/picture-resize-geometry.mjs';
const basis = { origin: [-20, 15], x: [80, 40], y: [-30, 60], width: 400, height: 200 };
const anchors = [
  ['top_left', 0, 0],
  ['top_center', 0.5, 0],
  ['top_right', 1, 0],
  ['center_left', 0, 0.5],
  ['center_right', 1, 0.5],
  ['bottom_left', 0, 1],
  ['bottom_center', 0.5, 1],
  ['bottom_right', 1, 1],
];
test('fixed corner mapping uses opposite points for all eight canonical handles', () => {
  const names = [
    'top_left',
    'center_left',
    'top_center',
    'bottom_right',
    'bottom_left',
    'top_right',
    'bottom_center',
    'center_right',
  ];
  assert.deepEqual(pictureResizeHandles(basis).map(pictureResizeFixedAnchor), names);
  for (const h of [null, {}, { xSide: 0, ySide: 0 }, { xSide: 2, ySide: 1 }])
    assert.equal(pictureResizeFixedAnchor(h), null);
});
test('anchored guide preserves every fixed point for skew grow shrink aspect and no-op targets', () => {
  const original = structuredClone(basis);
  for (const size of [
    { width: 800, height: 400 },
    { width: 200, height: 100 },
    { width: 801, height: 200 },
    { width: 400, height: 200 },
  ]) {
    for (const [anchor, u, v] of anchors) {
      const preview = pictureResizeGuideGeometry({ basis, size, mode: 'anchored', anchor });
      assert(preview);
      const fixed = (origin, x, y) =>
        [0, 1].map((axis) => origin[axis] + u * x[axis] + v * y[axis]);
      const actual = fixed(preview.origin, preview.x, preview.y),
        expected = fixed(basis.origin, basis.x, basis.y);
      for (let axis = 0; axis < 2; axis++) assert(Math.abs(actual[axis] - expected[axis]) <= 1e-10);
    }
  }
  assert.deepEqual(basis, original);
});
test('legacy guide retains exact original origin and bottom right arithmetic', () => {
  const size = { width: 701, height: 333 };
  const expected = [0, 1].map(
    (axis) =>
      basis.origin[axis] +
      (basis.x[axis] * size.width) / basis.width +
      (basis.y[axis] * size.height) / basis.height,
  );
  assert.deepEqual(pictureResizeGuideGeometry({ basis, size }).point, expected);
  assert.deepEqual(pictureResizeGuideGeometry({ basis, size, mode: 'legacy' }).point, expected);
});
test('unknown modes anchors invalid sizes and nonfinite geometry never become legacy guides', () => {
  const size = { width: 800, height: 400 };
  for (const anchor of ['unknown', 'toString', null, 0, {}])
    assert.equal(pictureResizeGuideGeometry({ basis, size, mode: 'anchored', anchor }), null);
  assert.equal(pictureResizeGuideGeometry({ basis, size, mode: 'other' }), null);
  for (const width of [0, -1, 1.5, NaN, Infinity, 0x100000000])
    assert.equal(pictureResizeGuideGeometry({ basis, size: { width, height: 400 } }), null);
  assert.equal(pictureResizeGuideGeometry({ basis: { ...basis, x: [Infinity, 0] }, size }), null);
});
