import test from "node:test";
import assert from "node:assert/strict";
import { decodeFieldTargets } from "../../js/hwpx-field-target-wire.mjs";

test("field target decoder shares exact bounded list wire and honors byte offsets", () => {
  const data = new Uint8Array(20),
    bytes = data.subarray(2, 18);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  [1, 37, 2, 9].forEach((value, index) => view.setUint32(index * 4, value, true));
  assert.deepEqual(decodeFieldTargets(bytes), [{ beginElement: 37, start: 2, end: 9 }]);
  assert.deepEqual(decodeFieldTargets(new Uint8Array(4)), []);
  assert.throws(() => decodeFieldTargets(bytes.subarray(0, 15)), /InvalidFieldTargets/);
  view.setUint32(12, 1, true);
  assert.throws(() => decodeFieldTargets(bytes), /InvalidFieldTargets/);
  view.setUint32(0, 4097, true);
  assert.throws(() => decodeFieldTargets(bytes), /InvalidFieldTargets/);
  assert.throws(() => decodeFieldTargets(new Uint8Array(3)), /InvalidFieldTargets/);
  assert.throws(() => decodeFieldTargets([]), /InvalidFieldTargets/);
});
