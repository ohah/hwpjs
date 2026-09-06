import assert from "node:assert/strict";
import { checkBody } from "./body.mjs";
import { sectionXml } from "./fixture-xml.mjs";
const word = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const version = 0x05000307;
const frame = (b) =>
  Buffer.concat([word(71 | ((b.length + 4) << 20)), word(0x636f6c64), b]);
function sample(count, same) {
  const variable = count >= 2 && !same;
  const b = Buffer.alloc(variable ? 10 + count * 4 : 12);
  b.writeUInt16LE((count << 2) | (same ? 4096 : 0));
  if (variable)
    for (let i = 0; i < count; i++) {
      b.writeUInt16LE(i + 100, 4 + i * 4);
      b.writeUInt16LE(i + 3, 6 + i * 4);
    }
  return b;
}
export function columnEdges(call) {
  for (const count of [1, 2, 3, 255])
    for (const same of [false, true]) {
      const b = sample(count, same);
      for (let n = 0; n < b.length; n++)
        assert.throws(() => call(14, b.subarray(0, n)), /UnexpectedEnd/);
      checkBody(call, version, frame(b));
      checkBody(
        call,
        version,
        frame(Buffer.concat([b, Buffer.from([1, 2, 3])])),
      );
      assert.equal(call(14, b).readUInt32LE(), count);
    }
  assert.throws(() => call(14, Buffer.alloc(12)), /InvalidColumnCount/);
  const original = Buffer.concat([
    sample(3, false),
    Buffer.from([128, 255, 17]),
  ]);
  let accepted = 0,
    rejected = 0;
  for (let pos = 0; pos < original.length; pos++)
    for (let bit = 0; bit < 8; bit++) {
      const b = Buffer.from(original);
      b[pos] ^= 1 << bit;
      const flags = b.readUInt16LE(),
        count = (flags >>> 2) & 255;
      const needed = count >= 2 && !(flags & 4096) ? 10 + count * 4 : 12;
      if (!count || b.length < needed) {
        assert.throws(
          () => call(14, b),
          !count ? /InvalidColumnCount/ : /UnexpectedEnd/,
        );
        rejected++;
      } else {
        checkBody(call, version, frame(b));
        accepted++;
      }
      checkBody(call, version, frame(original));
    }
  assert.equal(accepted + rejected, 200);
  return { mutations: 200, accepted, rejected, recoveries: 200 };
}
export function columnPair(call, section, hwpx) {
  const xml = sectionXml(hwpx),
    defs = [];
  for (let p = 0; p < section.length; ) {
    const bits = section.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = section.readUInt32LE(p);
      p += 4;
    }
    const b = section.subarray(p, p + n);
    p += n;
    if ((bits & 1023) === 71 && b.readUInt32LE() === 0x636f6c64)
      defs.push(b.subarray(4));
  }
  const blocks = [
    ...xml.matchAll(/<hp:colPr\b([^>]*)>([\s\S]*?)<\/hp:colPr>/g),
  ];
  assert.equal(defs.length, 3);
  assert.equal(blocks.length, 3);
  const attr = (text, name) =>
    Number(text.match(new RegExp(`\\b${name}="(-?\\d+)"`))[1]);
  for (let i = 0; i < defs.length; i++) {
    const [, head, body] = blocks[i],
      count = attr(head, "colCount"),
      same = attr(head, "sameSz");
    const cols = [...body.matchAll(/<hp:colSz\b([^>]*)\/>/g)].flatMap((m) => [
      attr(m[1], "width"),
      attr(m[1], "gap"),
    ]);
    const expected = [
      count,
      same,
      same || count < 2 ? attr(head, "sameGap") : -2147483648,
      ...cols,
    ];
    const out = call(14, defs[i]);
    assert.deepEqual(
      Array.from({ length: out.length / 4 }, (_, j) => out.readInt32LE(j * 4)),
      expected,
    );
  }
  return defs.length;
}
