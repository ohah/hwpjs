import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
export const scriptFixture = (
  fields = [Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)],
) =>
  Buffer.concat([
    ...fields.flatMap((b) => [w(b.length / 2), b]),
    w(0xffffffff),
  ]);
const run = (call, kind, b) =>
  call(28, Buffer.concat([Buffer.from([kind]), b]));
export function scriptsActual(call, cfb, h, used) {
  const result = Array(10).fill(0);
  for (const [kind, name] of ["JScriptVersion", "DefaultJScript"].entries()) {
    const path = `/Scripts/${name}`,
      entry = cfb.findExact(path);
    if (!entry) continue;
    const raw = Buffer.from(entry.content);
    const b = h.readUInt32LE(36) & 1 ? inflateRawSync(raw) : raw;
    assert.deepEqual(run(call, kind, b), b);
    used.add(path.toLowerCase());
    result[8] += b.length;
    if (kind === 0) {
      result[0] = 1;
      result[1] = b.readUInt32LE(0);
      result[2] = b.readUInt32LE(4);
      result[9] += b.length - 8;
    } else {
      result[3] = 1;
      let offset = 0;
      for (let i = 0; i < 4; i++) {
        const n = b.readUInt32LE(offset);
        result[4 + i] = n;
        offset += 4 + 2 * n;
        assert.ok(offset <= b.length);
      }
      assert.equal(b.readUInt32LE(offset), 0xffffffff);
      result[9] += b.length - offset - 4;
    }
  }
  return result;
}
export function scriptEdges(call) {
  let rejected = 0;
  const good = scriptFixture([
    Buffer.from([0, 0xd8]),
    Buffer.from([0, 0]),
    Buffer.from("pre", "utf16le"),
    Buffer.from("post", "utf16le"),
  ]);
  const reject = (kind, b, re) => {
    assert.throws(() => run(call, kind, b), re);
    assert.deepEqual(run(call, 1, good), good);
    rejected++;
  };
  for (const [kind, b] of [
    [0, Buffer.concat([w(0xffffffff), w(0x80000000)])],
    [1, good],
  ]) {
    assert.deepEqual(run(call, kind, b), b);
    for (let i = 0; i < b.length; i++)
      reject(kind, b.subarray(0, i), /UnexpectedEnd/);
    const tail = Buffer.concat([b, Buffer.from([0, 255, 7])]);
    assert.deepEqual(run(call, kind, tail), tail);
  }
  for (let bit = 0; bit < 32; bit++) {
    const b = Buffer.from(good);
    b.writeUInt32LE((0xffffffff ^ (1 << bit)) >>> 0, b.length - 4);
    reject(1, b, /InvalidScriptEndFlag/);
  }
  for (let field = 0; field < 4; field++) {
    for (const n of [1, 0x7fffffff, 0x80000000, 0xffffffff]) {
      const b = scriptFixture();
      b.writeUInt32LE(n, field * 4);
      reject(1, b, /UnexpectedEnd/);
    }
    // Independent values at each field position, including boundary-sized strings.
    for (const count of [0, 1, 127, 32768, 65536]) {
      const fields = Array.from({ length: 4 }, () => Buffer.alloc(0));
      fields[field] = Buffer.alloc(count * 2, 0xd8);
      const b = scriptFixture(fields);
      assert.deepEqual(run(call, 1, b), b);
    }
  }
  return { rejected };
}
