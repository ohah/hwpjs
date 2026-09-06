import assert from "node:assert/strict";
import { sectionXml } from "./fixture-xml.mjs";
const word = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
export function cellActual(call, raw) {
  const flags = raw.readUInt32LE(4),
    extra = raw.subarray(34);
  const values = [
    flags,
    ...[16, 17, 18, 19].map((bit) => (flags >>> bit) & 1),
    Number(extra.length >= 4),
    extra.length >= 4 ? extra.readUInt32LE() : 0,
    Number(extra.length >= 5),
    extra.length >= 5 ? extra[4] : 0,
    Math.max(0, extra.length - 5),
  ];
  const out = call(20, raw);
  assert.deepEqual(
    out,
    Buffer.concat([...values.map(word), extra.subarray(5)]),
  );
  return values;
}
export function cellPair(call, rawCells, hwpx) {
  const xml = sectionXml(hwpx),
    blocks = [...xml.matchAll(/<hp:tc\b([^>]*)>/g)];
  assert.equal(blocks.length, rawCells.length);
  const positive = [0, 0, 0, 0];
  rawCells.forEach((raw, i) => {
    const expected = ["hasMargin", "protect", "header", "editable"].map(
      (key) => {
        const m = blocks[i][1].match(new RegExp(`\\b${key}="([01])"`));
        assert.ok(m);
        return Number(m[1]);
      },
    );
    assert.deepEqual(cellActual(call, raw).slice(1, 5), expected);
    expected.forEach((v, j) => {
      positive[j] += v;
    });
  });
  return [rawCells.length, ...positive];
}
export function cellEdges(call) {
  const b = Buffer.alloc(47, 0xa5);
  b.writeUInt32LE(0x89abcdef, 34);
  b[38] = 255;
  for (let n = 0; n < 38; n++) {
    if (n === 34) cellActual(call, b.subarray(0, n));
    else assert.throws(() => call(20, b.subarray(0, n)), /UnexpectedEnd/);
  }
  for (let n = 38; n <= 47; n++) cellActual(call, b.subarray(0, n));
  for (let bits = 0; bits < 16; bits++) {
    const raw = Buffer.from(b);
    raw.writeUInt32LE((0xf0f000ff | (bits << 16)) >>> 0, 4);
    cellActual(call, raw);
  }
  for (let i = 0; i < b.length; i++)
    for (let bit = 0; bit < 8; bit++) {
      const raw = Buffer.from(b);
      raw[i] ^= 1 << bit;
      cellActual(call, raw);
      cellActual(call, b);
    }
  return { mutations: 376, recoveries: 376 };
}
