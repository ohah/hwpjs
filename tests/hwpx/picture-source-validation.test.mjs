import test from "node:test";
import assert from "node:assert/strict";
import {
  hasPictureSourceErrors,
  hasFinitePictureCrop,
} from "../../web/preview/picture-source-validation.mjs";
import { drawingPictureScope } from "../../web/preview/drawing-picture-scope.mjs";
import { inlinePictureIndex } from "../../web/preview/picture-inline.mjs";

test("picture source failures distinguish absent/null from present error values", () => {
  for (const field of [
    "ownerError",
    "geometryError",
    "positionError",
    "flowError",
    "cropError",
    "transformError",
    "renderingCornersError",
  ]) {
    assert.equal(hasPictureSourceErrors({ [field]: null }), false);
    assert.equal(hasPictureSourceErrors({ [field]: undefined }), false);
    for (const value of ["InvalidSource", "", false, 0])
      assert.equal(hasPictureSourceErrors({ [field]: value }), true);
  }
  for (const value of [null, undefined, [], "picture"])
    assert.equal(hasPictureSourceErrors(value), true);
});

test("crop structure rejects sparse and nonfinite arrays without asserting coordinate semantics", () => {
  const valid = { crop: { clip: [-10, 20, 0, 30] } },
    before = structuredClone(valid);
  assert.equal(hasFinitePictureCrop(valid), true);
  assert.deepEqual(valid, before);
  for (const clip of [
    undefined,
    null,
    [],
    [0, 1, 2],
    [0, 1, 2, 3, 4],
    [0, NaN, 2, 3],
    [0, Infinity, 2, 3],
    // oxlint-disable-next-line no-sparse-arrays -- 희소 배열 입력을 거부하는 음성 oracle이며 배열 구멍을 undefined 값으로 대체하지 않는다.
    [0, , 2, 3],
    new Float64Array(4),
  ]) {
    assert.equal(hasFinitePictureCrop({ crop: { clip } }), false);
  }
  const picture = {
    state: "located",
    section: 0,
    paragraph: 1,
    pictureNode: 3,
    anchorUnit: 0,
    owner: { anchorNode: 3 },
    geometry: {
      treatAsCharacter: true,
      width: 1500,
      height: 1500,
      widthRelative: 4,
      heightRelative: 2,
    },
    transform: { identity: true },
    // oxlint-disable-next-line no-sparse-arrays -- 희소 배열 입력을 거부하는 음성 oracle이며 배열 구멍을 undefined 값으로 대체하지 않는다.
    crop: { clip: [0, , 2, 3] },
  };
  const p = { section: 0, paragraph: 1, text: "\ufffc", drawingText: { drawingNode: 2 } };
  assert.equal(
    drawingPictureScope({ paragraphs: [p], pictures: [picture] }, []).error,
    "InvalidDrawingLocalPicture",
  );
  assert.equal(inlinePictureIndex({ paragraphs: [p], pictures: [picture] }).size, 0);
});
