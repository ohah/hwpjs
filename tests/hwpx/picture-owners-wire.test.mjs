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
test("picture owner response rejects every truncation and unsafe numeric field", () => {
  const valid = wire([row]);
  for (let length = 0; length < valid.length; length++) assert.throws(() => decodePictureOwners(valid.subarray(0, length)), /InvalidPictureOwners/, `length ${length}`);
  for (const value of [-1, 0.5, 0x100000000, Number.MAX_SAFE_INTEGER, "1", true, null]) {
    assert.throws(() => decodePictureOwners(wire([{ ...row, picture_node: value }])), /InvalidPictureOwners/);
    for (const field of ["paragraph", "anchor_node", "anchor_unit"]) {
      assert.throws(() => decodePictureOwners(wire([{ ...row, owner: { ...row.owner, [field]: value } }])), /InvalidPictureOwners/);
    }
  }
  assert.deepEqual(decodePictureOwners(wire([])), []);
  assert.equal(decodePictureOwners(wire([{ ...row, picture_node: 0xffffffff, owner: { paragraph: 0xffffffff, anchor_node: 0xffffffff, anchor_unit: 0xffffffff } }]))[0].owner.anchorUnit, 0xffffffff);
});
