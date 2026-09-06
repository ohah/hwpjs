import assert from "node:assert/strict";
import { documentRecords } from "./documents.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const u = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const props = (a, b, dummy = 0) =>
  Buffer.concat([u(a.length / 2), a, u(b.length / 2), b, u(dummy)]);
const frame = (b, id = 0x6964786d) => {
  const size = b.length + 4;
  return Buffer.concat([
    w((71 | (Math.min(size, 4095) << 20)) >>> 0),
    ...(size >= 4095 ? [w(size)] : []),
    w(id),
    b,
  ]);
};
export function indexMarkActual(call, version, bytes) {
  const stats = [0, 0, 0, 0],
    raw = [];
  for (const r of documentRecords(bytes))
    if (r.tag === 71 && bytes.readUInt32LE(r.start) === 0x6964786d) {
      const b = bytes.subarray(r.start + 4, r.end),
        first = b.readUInt16LE(0),
        second = b.readUInt16LE(2 + 2 * first);
      const used = 6 + 2 * (first + second);
      assert.ok(used <= b.length);
      stats[0]++;
      stats[1] += first;
      stats[2] += second;
      stats[3] += b.length - used;
      raw.push(b);
    }
  assert.deepEqual(
    call(34, Buffer.concat([w(version), bytes])),
    Buffer.concat([...stats.map(w), ...raw]),
  );
  return stats;
}
export function indexMarkEdges(call) {
  let accepted = 0,
    rejected = 0;
  const check = (b) => {
    indexMarkActual(call, 0x05000107, frame(b));
    accepted++;
  };
  const good = props(
    Buffer.from([0, 0xd8]),
    Buffer.from([0, 0, 0xff, 0xfe]),
    65535,
  );
  for (let n = 0; n < good.length; n++) {
    assert.throws(
      () =>
        call(34, Buffer.concat([w(0x05000107), frame(good.subarray(0, n))])),
      /UnexpectedEnd/,
    );
    rejected++;
    check(good);
  }
  for (const side of [0, 1])
    for (const count of [0, 1, 127, 32768, 65535]) {
      const fields = [Buffer.alloc(0), Buffer.alloc(0)];
      fields[side] = Buffer.alloc(count * 2, 0xd8);
      check(props(...fields));
    }
  check(props(Buffer.alloc(65535 * 2, 7), Buffer.alloc(65535 * 2, 8)));
  for (const b of [
    Buffer.from([255, 255, 0, 0, 0, 0]),
    Buffer.from([0, 0, 255, 255, 0, 0]),
  ]) {
    assert.throws(
      () => call(34, Buffer.concat([w(0x05000107), frame(b)])),
      /UnexpectedEnd/,
    );
    rejected++;
  }
  for (const d of [0, 1, 0x8000, 65535])
    check(props(Buffer.alloc(0), Buffer.alloc(0), d));
  for (let len = 1; len <= 3; len++)
    check(Buffer.concat([good, Buffer.alloc(len, 7)]));
  indexMarkActual(
    call,
    0x05000107,
    Buffer.concat([
      frame(good),
      frame(props(Buffer.alloc(0), Buffer.alloc(0))),
    ]),
  );
  accepted++;
  assert.deepEqual(
    call(
      34,
      Buffer.concat([w(0x05000107), frame(Buffer.alloc(0), 0x626b6d6b)]),
    ),
    Buffer.alloc(16),
  );
  return { accepted, rejected };
}
