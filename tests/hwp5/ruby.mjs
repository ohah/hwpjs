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
export const rubyPayload = (main, sub, values = [0, 0, 0, 0, 0]) =>
  Buffer.concat([
    u(main.length / 2),
    main,
    u(sub.length / 2),
    sub,
    ...values.map(w),
  ]);
const frame = (p) =>
  Buffer.concat([
    w(71 | (Math.min(p.length + 4, 4095) << 20)),
    ...(p.length + 4 >= 4095 ? [w(p.length + 4)] : []),
    w(0x74647574),
    p,
  ]);
export function rubyActual(call, v, b) {
  const stats = Array(6).fill(0),
    raw = [];
  for (const r of documentRecords(b))
    if (r.tag === 71 && b.readUInt32LE(r.start) === 0x74647574) {
      const p = b.subarray(r.start + 4, r.end),
        main = p.readUInt16LE(),
        sub = p.readUInt16LE(2 + main * 2),
        offset = 4 + (main + sub) * 2;
      assert.ok(offset + 20 <= p.length);
      stats[0]++;
      stats[1] += main;
      stats[2] += sub;
      stats[3] += Number(p.readUInt32LE(offset) > 2);
      stats[4] += Number(p.readUInt32LE(offset + 16) > 5);
      stats[5] += p.length - offset - 20;
      raw.push(p);
    }
  assert.deepEqual(
    call(40, Buffer.concat([w(v), b])),
    Buffer.concat([...stats.map(w), ...raw]),
  );
  return stats;
}
export function rubyEdges(call) {
  const v = 0x05010001,
    good = rubyPayload(
      Buffer.from([0, 216]),
      Buffer.from([0, 0, 255, 254]),
      [2, 0x100, 0xffffffff, 0x10000, 5],
    );
  let accepted = 0,
    rejected = 0;
  const check = (p) => {
    accepted++;
    return rubyActual(call, v, frame(p));
  };
  const reject = (p) => {
    assert.throws(
      () => call(40, Buffer.concat([w(v), frame(p)])),
      /UnexpectedEnd/,
    );
    rejected++;
    check(good);
  };
  for (let n = 0; n < good.length; n++) reject(good.subarray(0, n));
  for (const slot of [0, 1])
    for (const units of [0, 1, 127, 32768, 65535]) {
      const strings = [Buffer.alloc(0), Buffer.alloc(0)];
      strings[slot] = Buffer.alloc(units * 2, 255);
      check(rubyPayload(...strings));
    }
  check(rubyPayload(Buffer.alloc(131070, 255), Buffer.alloc(131070, 255)));
  for (let field = 0; field < 5; field++)
    for (const n of [0, 1, 2, 3, 5, 6, 255, 256, 65535, 65536, 0xffffffff]) {
      const values = Array(5).fill(0);
      values[field] = n;
      check(rubyPayload(Buffer.alloc(0), Buffer.alloc(0), values));
    }
  for (let n = 0; n < 4; n++) check(Buffer.concat([good, Buffer.alloc(n, 9)]));
  for (const b of [
    Buffer.from([255, 255, 0, 0]),
    Buffer.from([0, 0, 255, 255]),
    Buffer.alloc(18),
  ])
    reject(b);
  rubyActual(call, v, Buffer.concat([frame(good), frame(Buffer.alloc(24))]));
  accepted++;
  const alias = frame(Buffer.alloc(0));
  alias.writeUInt32LE(0x636d7474, 4);
  assert.deepEqual(call(40, Buffer.concat([w(v), alias])), Buffer.alloc(24));
  return { accepted, rejected };
}
