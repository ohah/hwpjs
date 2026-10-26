import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingWrapPagePolicyError } from '../../web/preview/drawing-wrap-page-policy.mjs';

test('body drawing wrap requires explicit source geometry and ownership flags', () => {
  const source = {
    caption: null,
    geometry: { width: 100, height: 50 },
    rendering: { matrix: [1, 0, 0, 0, 1, 0], angle: 0, flip: [false, false], reverse: null },
    rendering_corners: [
      [0, 0],
      [100, 0],
      [100, 50],
      [0, 50],
    ],
  };
  const placement = {
    flow: { text_wrap: 1 },
    position: { relations: [0, 0, 0], flags: [false, false, true, false] },
  };
  const before = structuredClone({ source, placement });
  assert.equal(drawingWrapPagePolicyError(source, placement, false), null);
  for (const grouped of [true, {}])
    assert.equal(
      drawingWrapPagePolicyError(source, placement, grouped),
      'UnsupportedDrawingPageWrap',
    );
  for (const caption of [undefined, {}, false])
    assert.equal(
      drawingWrapPagePolicyError({ ...source, caption }, placement, false),
      'UnsupportedDrawingPageWrap',
    );
  for (const text_wrap of [undefined, 0, 3])
    assert.equal(
      drawingWrapPagePolicyError(source, { ...placement, flow: { text_wrap } }, false),
      'UnsupportedDrawingPageWrap',
    );
  assert.equal(drawingWrapPagePolicyError(source, null, false), 'UnsupportedDrawingPageWrap');
  assert.equal(drawingWrapPagePolicyError(null, placement, false), 'UnsupportedDrawingPageWrap');
  const changed = (index, value) => {
    const next = structuredClone(placement);
    next.position.flags[index] = value;
    return next;
  };
  for (const value of [undefined, true, 0])
    assert.equal(
      drawingWrapPagePolicyError(source, changed(1, value), false),
      'UnsupportedDrawingFlowWithText',
    );
  for (const value of [undefined, false, 1])
    assert.equal(
      drawingWrapPagePolicyError(source, changed(2, value), false),
      'UnsupportedDrawingOverlapPolicy',
    );
  const transformed = structuredClone(source);
  transformed.rendering.matrix[1] = 1;
  assert.equal(
    drawingWrapPagePolicyError(transformed, placement, false),
    'UnsupportedDrawingPageWrap',
  );
  assert.deepEqual({ source, placement }, before);
});
