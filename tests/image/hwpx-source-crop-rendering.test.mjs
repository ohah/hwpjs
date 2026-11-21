import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pictureCropRect } from '../../web/preview/picture-crop-geometry.mjs';
import { pictureCropSourceOptions } from '../../web/preview/picture-crop-source.mjs';
import { paintInlinePicture } from '../../web/preview/picture-inline.mjs';
function draw(clip, width, height, dimensions = [null, null]) {
  const bitmap = { width: 64, height: 32 };
  const picture = { crop: { clip, imageDimensions: dimensions }, paintError: null };
  const calls = [];
  const ctx = {
    drawImage(...args) {
      calls.push(args);
    },
  };
  assert.equal(paintInlinePicture(ctx, bitmap, { picture, width, height }, 10, 20), true);
  assert.equal(calls.length, 1);
  return {
    args: calls[0].slice(1),
    crop: pictureCropRect(clip, 64, 32, pictureCropSourceOptions(picture.crop)),
  };
}
test('r5 observed HX clip without imgDim asks for source96x48 over bitmap64x32', () => {
  const result = draw([0, 7200, 0, 3600], 96, 48);
  assert.equal(result.crop.outsideSource, true);
  assert.deepEqual(result.args, [0, 0, 96, 48, 10, 20, 96, 48]);
});
test('old smaller display used only the top left quarter of the original raster', () => {
  const result = draw([0, 2400, 0, 1200], 32, 16);
  assert.equal(result.crop.outsideSource, false);
  assert.deepEqual(result.args, [0, 0, 32, 16, 10, 20, 32, 16]);
});
for (const [width, height] of [
  [96, 48],
  [32, 16],
  [32, 48],
])
  test(`HX candidate absent imgDim full64x32 source fits display${width}x${height}`, () => {
    const result = draw([0, 4800, 0, 2400], width, height);
    assert.equal(result.crop.outsideSource, false);
    assert.deepEqual(result.args, [0, 0, 64, 32, 10, 20, width, height]);
  });
test('existing explicit independent imgDim keeps its own reference and partial crop', () => {
  const result = draw([3200, 9600, 1600, 4800], 96, 48, [12800, 6400]);
  assert.deepEqual(result.args, [16, 8, 32, 16, 10, 20, 96, 48]);
});
