import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
import { fieldIds } from "./control-types.mjs";
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
const frame = (id, p) =>
  Buffer.concat([
    w(71 | (Math.min(p.length + 4, 4095) << 20)),
    ...(p.length + 4 >= 4095 ? [w(p.length + 4)] : []),
    w(id),
    p,
  ]);
export function fieldsActual(call, v, b) {
  const stats = Array(6).fill(0),
    raw = [];
  for (const r of documentRecords(b))
    if (r.tag === 71 && fieldIds.has(b.readUInt32LE(r.start))) {
      const p = b.subarray(r.start, r.end),
        attrs = p.readUInt32LE(4),
        units = p.readUInt16LE(9);
      assert.ok(15 + units * 2 <= p.length);
      stats[0]++;
      stats[1] += units;
      stats[2] += attrs & 1;
      stats[3] += Number((attrs & 0x8000) !== 0);
      stats[4] += Number((attrs & 0xffff07fe) !== 0);
      stats[5] += p.length - 15 - units * 2;
      raw.push(p);
    }
  assert.deepEqual(
    call(39, Buffer.concat([w(v), b])),
    Buffer.concat([...stats.map(w), ...raw]),
  );
  return stats;
}
export function fieldEdges(call) {
  const v = 0x05010001,
    good = Buffer.concat([
      w(0x8001),
      Buffer.from([255]),
      u(3),
      Buffer.from([0, 0, 0, 216, 255, 254]),
      w(0xffffffff),
    ]);
  let accepted = 0,
    rejected = 0;
  const check = (id, p) => {
    accepted++;
    return fieldsActual(call, v, frame(id, p));
  };
  for (const id of fieldIds) {
    for (let n = 0; n < good.length; n++) {
      assert.throws(
        () => call(39, Buffer.concat([w(v), frame(id, good.subarray(0, n))])),
        /UnexpectedEnd/,
      );
      rejected++;
      check(id, good);
    }
    check(id, Buffer.concat([good, Buffer.from([9, 8, 7])]));
  }
  const id = 0x25756e6b;
  for (let bit = 0; bit < 32; bit++) {
    const p = Buffer.from(good);
    p.writeUInt32LE((2 ** bit) >>> 0);
    check(id, p);
  }
  for (const units of [0, 1, 32768, 65535])
    check(
      id,
      Buffer.concat([
        w(0),
        Buffer.from([0]),
        u(units),
        Buffer.alloc(units * 2, 255),
        w(0),
      ]),
    );
  for (const unknown of [0x25252525, 0x257a7a7a, 0x74637073])
    assert.deepEqual(check(unknown, Buffer.alloc(0)), Array(6).fill(0));
  const mixed = Buffer.concat([frame(id, good), frame(0x25686c6b, good)]);
  fieldsActual(call, v, mixed);
  accepted++;
  return { knownIds: fieldIds.size, accepted, rejected };
}
