import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { documentRecords } from "./documents.mjs";
const w = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const frame = (id, b) =>
  Buffer.concat([w((71 | ((b.length + 4) << 20)) >>> 0), w(id), b]);
const run = (call, v, b, mode = 1) =>
  call(35, Buffer.concat([w(v), Buffer.from([mode]), b]));
export function visibilityActual(call, v, b, mode = 1) {
  const stats = [0, 0, 0, 0, 0],
    raw = [];
  for (const r of documentRecords(b))
    if (r.tag === 71) {
      const p = b.subarray(r.start, r.end),
        id = p.readUInt32LE(0);
      if (id === 0x70676864) {
        const size = mode === 0 ? 2 : 4,
          n = size === 2 ? p.readUInt16LE(4) : p.readUInt32LE(4);
        stats[0]++;
        stats[3] += (n & 0xffffffc0) !== 0;
        stats[4] += p.length - 4 - size;
        raw.push(p);
      } else if (id === 0x70676374) {
        stats[1]++;
        stats[2] += (p.readUInt32LE(4) & 3) === 3;
        stats[4] += p.length - 8;
        raw.push(p);
      }
    }
  assert.deepEqual(
    run(call, v, b, mode),
    Buffer.concat([...stats.map(w), ...raw]),
  );
  return stats;
}
export function visibilityEdges(call) {
  const v = 0x05000107;
  let rejected = 0,
    accepted = 0;
  for (const mode of [0, 1])
    for (const id of [0x70676864, 0x70676374]) {
      const size = id === 0x70676864 && mode === 0 ? 2 : 4;
      const check = (b) => {
        visibilityActual(call, v, frame(id, b), mode);
        accepted++;
      };
      const good = Buffer.alloc(size, 255);
      for (let n = 0; n < size; n++) {
        assert.throws(
          () => run(call, v, frame(id, good.subarray(0, n)), mode),
          /UnexpectedEnd/,
        );
        rejected++;
        check(good);
      }
      for (let bit = 0; bit < size * 8; bit++) {
        const b = Buffer.alloc(size);
        b[bit >>> 3] = 1 << (bit & 7);
        check(b);
      }
      for (let len = 0; len < 4; len++)
        check(Buffer.concat([good, Buffer.alloc(len, 7)]));
    }
  assert.throws(
    () => run(call, v, frame(0x70676864, Buffer.alloc(2)), 1),
    /UnexpectedEnd/,
  );
  rejected++;
  assert.deepEqual(
    run(call, v, frame(0x70676164, Buffer.alloc(0))),
    Buffer.alloc(20),
  );
  return { accepted, rejected };
}
export function visibilityReference(call, cfb) {
  const path = new URL(
    "../../reference/rhwp/saved/pr360-edward.hwp",
    import.meta.url,
  );
  if (!existsSync(path)) return { skipped: "reference fixture unavailable" };
  cfb.parse(readFileSync(path), { strict: true });
  const h = Buffer.from(cfb.findExact("/FileHeader").content),
    raw = Buffer.from(cfb.findExact("/BodyText/Section0").content);
  assert.equal(h.readUInt32LE(36) & (2 | 4 | 16 | 256 | 1024), 0);
  const b = h.readUInt32LE(36) & 1 ? inflateRawSync(raw) : raw,
    v = h.readUInt32LE(32);
  assert.deepEqual(call(3, Buffer.concat([h, raw]), b.length), b);
  const stats = visibilityActual(call, v, b);
  assert.deepEqual(stats, [2, 0, 0, 0, 0]);
  let rejected = 0;
  for (const r of documentRecords(b))
    if (r.tag === 71 && b.readUInt32LE(r.start) === 0x70676864) {
      const short = Buffer.concat([
        b.subarray(0, r.end - 1),
        b.subarray(r.end),
      ]);
      short.writeUInt32LE(
        ((b.readUInt32LE(r.offset) & 0xfffff) |
          ((r.end - r.start - 1) << 20)) >>>
          0,
        r.offset,
      );
      assert.throws(() => run(call, v, short), /UnexpectedEnd/);
      rejected++;
      visibilityActual(call, v, b);
    }
  return { stats, rejected };
}
