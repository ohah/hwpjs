import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pictureCropRect } from '../../web/preview/picture-crop-geometry.mjs';
import { pictureCropSourceOptions } from '../../web/preview/picture-crop-source.mjs';
import { paintInlinePicture } from '../../web/preview/picture-inline.mjs';
import { hwpUnitPixels } from '../../web/preview/hwp-units.mjs';
import { hwp5PictureTailLayout } from '../../web/preview/hwp5-picture-tail-profile.mjs';
const bitmap = { width: 64, height: 32 };
const dest = { width: hwpUnitPixels(7200), height: hwpUnitPixels(3600) };
function contractPicture(clip, dimensions = [null, null]) {
  return {
    crop: { clip, imageDimensions: dimensions },
    paintError: null,
    source: { border_width: 0, border_attributes: 0 },
    tailSource: { effects_flags: 0 },
  };
}
function draw(picture) {
  const calls = [];
  const ctx = {
    drawImage(...args) {
      calls.push(args);
    },
  };
  assert.equal(paintInlinePicture(ctx, bitmap, { picture, ...dest }, 10, 20), true);
  assert.equal(calls.length, 1);
  return calls[0];
}
test('r4 observed crop contract reproduces 96x48 source over 64x32 bitmap', () => {
  const picture = contractPicture([0, 7200, 0, 3600]);
  const mapped = pictureCropRect(picture.crop.clip, 64, 32, pictureCropSourceOptions(picture.crop));
  assert.equal(mapped.outsideSource, true);
  assert.deepEqual(draw(picture).slice(1), [0, 0, 96, 48, 10, 20, 96, 48]);
  // Canvas clips to the bitmap intersection, yielding the observed 64x32 footprint.
  assert.equal((dest.width * bitmap.width) / mapped.rectangle.width, 64);
  assert.equal((dest.height * bitmap.height) / mapped.rectangle.height, 32);
});
test('proposed legacy full source crop maps all pixels into unchanged 96x48 destination', () => {
  const sourceUnitsPerPixel = 7200 / 96;
  const picture = contractPicture([0, 64 * sourceUnitsPerPixel, 0, 32 * sourceUnitsPerPixel]);
  const mapped = pictureCropRect(picture.crop.clip, 64, 32, pictureCropSourceOptions(picture.crop));
  assert.equal(mapped.outsideSource, false);
  assert.deepEqual(mapped.rectangle, { x: 0, y: 0, width: 64, height: 32 });
  assert.deepEqual(draw(picture).slice(1), [0, 0, 64, 32, 10, 20, 96, 48]);
});
for (const [version, layout] of [
  [0x05000300, 'effects_only'],
  [0x05000304, 'dimensions8'],
  [0x05000500, 'dimensions8'],
  [0x05010001, 'with_alpha9'],
  [0x05010100, 'with_alpha9'],
])
  test(`existing version ${version.toString(16)} reader profile retains full raster source contract`, () => {
    assert.equal(hwp5PictureTailLayout(version), layout);
    const dimensions = layout === 'effects_only' ? [null, null] : [4800, 2400];
    const picture = contractPicture([0, 4800, 0, 2400], dimensions);
    assert.deepEqual(draw(picture).slice(1), [0, 0, 64, 32, 10, 20, 96, 48]);
    assert.deepEqual(picture.crop.imageDimensions, dimensions); // Never fabricate legacy dimensions.
  });
test('explicit noncanonical original references are preserved by the existing reader', () => {
  const picture = contractPicture([0, 12800, 0, 6400], [12800, 6400]);
  assert.deepEqual(draw(picture).slice(1), [0, 0, 64, 32, 10, 20, 96, 48]);
});
