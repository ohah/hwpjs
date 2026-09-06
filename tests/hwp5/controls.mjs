import assert from "node:assert/strict";
import { checkBody } from "./body.mjs";
export function controlEdges(call) {
  const version = Buffer.from([7, 3, 0, 5]);
  const frame = (tag, bytes) => {
    const out = Buffer.alloc(4 + bytes.length);
    out.writeUInt32LE(tag | (bytes.length << 20));
    bytes.copy(out, 4);
    return out;
  };
  let mutations = 0;
  for (const [tag, min] of [
    [71, 4],
    [72, 6],
  ]) {
    const raw = Buffer.from([
      32, 108, 98, 116, 255, 0, 128, 129, 85, 170, 0, 1, 2,
    ]);
    for (let n = 0; n <= raw.length; n++) {
      const record = frame(tag, raw.subarray(0, n));
      if (n < min)
        assert.throws(
          () => call(8, Buffer.concat([version, record])),
          /UnexpectedEnd/,
        );
      else checkBody(call, version.readUInt32LE(), record);
    }
    for (let offset = 0; offset < raw.length; offset++)
      for (let bit = 0; bit < 8; bit++) {
        const changed = Buffer.from(raw);
        changed[offset] ^= 1 << bit;
        checkBody(call, version.readUInt32LE(), frame(tag, changed));
        checkBody(call, version.readUInt32LE(), frame(tag, raw));
        mutations++;
      }
  }
  assert.equal(mutations, 208);
  return { mutations, recoveries: mutations };
}
