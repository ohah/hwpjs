import test from "node:test";
import assert from "node:assert/strict";
import { attachHwpxPictures } from "../../web/preview/hwpx-picture-content.mjs";
const sites = [1, 2].map((pictureNode) => ({
  pictureNode,
  state: "unsupported_anchor",
  paragraph: 1,
}));
const content = () => ({ paragraphs: [{ section: 0, paragraph: 0 }] });
test("picture display shares a batch while preserving per-picture errors", () => {
  let batch = 0,
    scalar = 0;
  const editor = {
    pictureSites: () => sites,
    pictureOwners() {
      batch++;
      return [
        { pictureNode: 1, owner: { paragraph: 1, anchorNode: 1, anchorUnit: 0 }, error: null },
        { pictureNode: 2, owner: null, error: "UnsupportedPictureAnchor" },
      ];
    },
    pictureOwner() {
      scalar++;
      throw new Error("UnexpectedScalarFallback");
    },
  };
  const result = attachHwpxPictures(editor, content());
  assert.equal(batch, 1);
  assert.equal(scalar, 0);
  assert.equal(result.pictures[0].owner.paragraph, 0);
  assert.equal(result.pictures[1].ownerError, "UnsupportedPictureAnchor");
  editor.pictureOwners = () => [];
  assert.equal(
    attachHwpxPictures(editor, content()).pictures[0].ownerError,
    "MissingPictureOwnerBatchRow",
  );
  assert.equal(scalar, 0);
});
test("only missing optional picture-owner ABI permits the legacy scalar path", () => {
  let scalar = 0;
  const editor = {
    pictureSites: () => sites,
    pictureOwners() {
      throw new Error("HwpxPictureOwnersAbiUnavailable");
    },
    pictureOwner(_, pictureNode) {
      scalar++;
      return { paragraph: 1, anchorNode: pictureNode, anchorUnit: 0 };
    },
  };
  assert.equal(attachHwpxPictures(editor, content()).pictures[0].ownerError, null);
  assert.equal(scalar, 2);
  editor.pictureOwners = () => {
    throw new Error("OutOfMemory");
  };
  assert.equal(attachHwpxPictures(editor, content()).pictures[0].ownerError, "OutOfMemory");
  assert.equal(scalar, 2);
});
