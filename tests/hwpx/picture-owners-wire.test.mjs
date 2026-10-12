import test from "node:test";
import assert from "node:assert/strict";
import { decodePictureOwners } from "../../js/hwpx-picture-owners.mjs";
const wire = value => new TextEncoder().encode(JSON.stringify(value));
const row = { picture_node: 3, owner: { paragraph: 2, anchor_node: 4, anchor_unit: 0 }, failure: null };
test("picture owner batch validates identities exclusive results and UTF-8 boundaries", () => {
  const source = wire([row, { picture_node: 5, owner: null, failure: "UnsupportedPictureAnchor" }]);
  const framed = new Uint8Array(source.length + 8); framed.set(source, 4);
  assert.deepEqual(decodePictureOwners(framed.subarray(4, 4 + source.length))[0], { pictureNode: 3, owner: { paragraph: 2, anchorNode: 4, anchorUnit: 0 }, error: null });
  for (const invalid of [null, {}, [row, row], [{ ...row, picture_node: -1 }], [{ ...row, failure: "error" }], [{ ...row, owner: { ...row.owner, paragraph: 0 } }], [{ ...row, owner: null }], [{ ...row, owner: null, failure: "" }]]) {
    assert.throws(() => decodePictureOwners(wire(invalid)), /InvalidPictureOwners/);
  }
  assert.throws(() => decodePictureOwners(new Uint8Array([0xff])), /InvalidPictureOwners/);
});
