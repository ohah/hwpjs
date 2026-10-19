import test from "node:test";
import assert from "node:assert/strict";
import { pictureCaptionPageFit, pictureFramePaperFit } from "../../web/preview/picture-caption-page-fit.mjs";

test("caption paper bounds distinguish fit, recoverable bottom overflow and invalid geometry", () => {
  const paper = { x: 20, y: 20, width: 100, height: 200 }, frame = { x: 20, y: 170, width: 100, height: 50 };
  const before = structuredClone({ paper, frame });
  assert.equal(pictureFramePaperFit(frame, paper).state, "fits");
  assert.equal(pictureFramePaperFit({ ...frame, y: 171 }, paper).state, "advance");
  for (const changed of [{ ...frame, height: 201 }, { ...frame, width: 101 }, { ...frame, x: 19 },
    { ...frame, y: 19 }, { ...frame, height: 0 }, { ...frame, y: NaN }]) {
    assert.equal(pictureFramePaperFit(changed, paper).error, "PictureCaptionPageOverflow");
  }
  assert.equal(pictureFramePaperFit(frame, null).state, "unavailable");
  assert.equal(pictureCaptionPageFit({ rectangle: frame }, null).state, "fits", "non-caption reservation retains its old policy");
  assert.equal(pictureCaptionPageFit({ flowRectangle: frame }, { paper }).state, "fits");
  assert.deepEqual({ paper, frame }, before);
});
