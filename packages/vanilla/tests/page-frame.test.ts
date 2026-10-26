import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasSurfacePageFrame } from '../src/page-frame.ts';

const page = { state: 'paginated', pages: [{ paper: { x: 10, width: 794 } }] };
test('paper center matches the root center without changing document coordinates', () => {
  const before = structuredClone(page);
  for (const available of [1000, 1280, 1600])
    for (const scale of [0.5, 1]) {
      const frame = canvasSurfacePageFrame(page, available, scale)!;
      assert.equal(frame.marginLeft + (10 + 794 / 2) * scale, available / 2);
      assert(frame.marginLeft >= 0 && frame.marginLeft + frame.width <= available);
    }
  assert.deepEqual(page, before);
});
test('narrow roots and zoom overflow preserve a reachable left origin', () => {
  for (const [available, scale] of [
    [500, 1],
    [1000, 2],
  ]) {
    const frame = canvasSurfacePageFrame(page, available, scale)!;
    assert.equal(frame.width, available);
    assert.equal(frame.marginLeft, 0);
    assert(frame.contentWidth > available);
  }
});
test('classic scrollbars cannot consume the paper at small zoom', () => {
  const frame = canvasSurfacePageFrame(page, 1000, 0.5, 15)!;
  assert(frame.width - 15 >= (10 + 794) * 0.5);
  assert.equal(frame.marginLeft + (10 + 794 / 2) * 0.5, 500);
  assert.equal(canvasSurfacePageFrame(page, 1000, 1, -1), null);
});
test('mixed pages and memo extents remain inside the frame', () => {
  const layout = {
    ...page,
    pages: [...page.pages, { paper: { x: 10, width: 1120 } }],
    memoPaneRight: 1500,
  };
  const frame = canvasSurfacePageFrame(layout, 1600)!;
  assert(frame.marginLeft + frame.width <= 1600);
  assert(frame.width >= 1500);
});
test('unavailable or malformed geometry does not invent a paper size', () => {
  for (const layout of [
    undefined,
    {},
    { state: 'unavailable' },
    { state: 'paginated', pages: [] },
    { ...page, pages: [{ paper: { x: 10, width: Infinity } }] },
    { ...page, memoPaneRight: NaN },
  ])
    assert.equal(canvasSurfacePageFrame(layout, 1280), null);
});
