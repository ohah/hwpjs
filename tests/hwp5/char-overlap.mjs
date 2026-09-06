import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const frame = (p) =>
  Buffer.concat([
    w(71 | (Math.min(p.length + 4, 4095) << 20)),
    ...(p.length + 4 >= 4095 ? [w(p.length + 4)] : []),
    w(0x74637073),
    p,
  ]);
export const overlapInput = (v, b, shapes, mode = 1) =>
  Buffer.concat([w(v), Buffer.from([mode]), w(shapes), b]);
export function overlapActual(call, v, b, shapes = 0xffffffff, mode = 1) {
  const stats = Array(6).fill(0),
    raw = [];
  for (const r of documentRecords(b))
    if (r.tag === 71 && b.readUInt32LE(r.start) === 0x74637073) {
      const p = b.subarray(r.start + 4, r.end),
        units = p.readUInt16LE();
      let o = 2 + units * 2;
      assert.ok(o <= p.length);
      stats[0]++;
      stats[1] += units;
      if (mode) {
        const count = p.readUInt8(o + 3);
        o += 4;
        for (let i = 0; i < count; i++) {
          const id = p.readUInt32LE(o);
          o += 4;
          if (id === 0xffffffff) stats[3]++;
          else {
            assert.ok(id < shapes);
            stats[2]++;
          }
        }
      } else stats[4]++;
      stats[5] += p.length - o;
      raw.push(p);
    }
  assert.deepEqual(
    call(37, overlapInput(v, b, shapes, mode)),
    Buffer.concat([...stats.map(w), ...raw]),
  );
  return stats;
}
export function overlapEdges(call) {
  const v = 0x05010001;
  let accepted = 0,
    rejected = 0;
  const payload = (text, ids = [], flags = Buffer.from([255, 128, 255])) =>
    Buffer.concat([
      u(text.length / 2),
      text,
      flags,
      Buffer.from([ids.length]),
      ...ids.map(w),
    ]);
  const good = payload(Buffer.from([0, 0, 0, 216, 255, 254]), [0, 0xffffffff]);
  const check = (p, mode = 1, shapes = 1) => {
    accepted++;
    return overlapActual(call, v, frame(p), shapes, mode);
  };
  const reject = (p, mode = 1, shapes = 1, error = /UnexpectedEnd/) => {
    assert.throws(
      () => call(37, overlapInput(v, frame(p), shapes, mode)),
      error,
    );
    rejected++;
    check(good);
  };
  for (let n = 0; n < good.length; n++) reject(good.subarray(0, n));
  for (const size of [-128, -1, 0, 127]) {
    const f = Buffer.from([0, size & 255, 0]);
    check(payload(Buffer.alloc(0), [], f));
  }
  for (const count of [0, 1, 254, 255])
    check(payload(Buffer.alloc(0), Array(count).fill(0xffffffff)), 1, 0);
  for (const units of [0, 1, 32768, 65535]) {
    const p = payload(Buffer.alloc(units * 2, 255));
    check(p);
    reject(p.subarray(0, p.length - 1));
  }
  for (const id of [1, 0xfffffffe])
    reject(payload(Buffer.alloc(0), [id]), 1, 1, /InvalidResourceReference/);
  check(payload(Buffer.alloc(0), [0xfffffffe]), 1, 0xffffffff);
  const old = Buffer.from([1, 0, 0, 216]);
  check(old, 0, 0);
  reject(old);
  reject(old.subarray(0, 3), 0);
  check(Buffer.concat([old, Buffer.from([1, 2, 3])]), 0, 0);
  for (let len = 0; len < 4; len++)
    check(Buffer.concat([good, Buffer.alloc(len, 9)]));
  const mixed = Buffer.concat([
    frame(good),
    frame(payload(Buffer.alloc(0), [])),
  ]);
  overlapActual(call, v, mixed, 1);
  accepted++;
  return { accepted, rejected };
}
