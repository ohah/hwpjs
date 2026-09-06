import assert from "node:assert/strict";
import { checkBody } from "./body.mjs";
const word = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const frame = (tag, level, b) =>
  Buffer.concat([word(tag | (level << 10) | (b.length << 20)), b]);
const version = 0x05000307;
export function sectionActual(call, v, counts, bytes) {
  const out = call(11, Buffer.concat([word(v), ...counts.map(word), bytes]));
  return Array.from({ length: 5 }, (_, i) => out.readUInt32LE(i * 4));
}
export function sectionEdges(call) {
  let mutations = 0;
  for (const [tag, prefix, min] of [
    [71, word(0x73656364), 26],
    [73, Buffer.alloc(0), 40],
    [74, Buffer.alloc(0), 28],
    [75, Buffer.alloc(0), 14],
  ]) {
    const raw = Buffer.from(
      Array.from({ length: min + 3 }, (_, i) => (i * 71 + 128) & 255),
    );
    for (const v of [0x05000104, 0x05000105, version])
      for (let n = 0; n <= raw.length; n++) {
        const b = frame(tag, 0, Buffer.concat([prefix, raw.subarray(0, n)]));
        if (n < (tag === 71 && v < 0x05000105 ? 24 : min))
          assert.throws(
            () => call(8, Buffer.concat([word(v), b])),
            /UnexpectedEnd/,
          );
        else checkBody(call, v, b);
      }
    for (let i = 0; i < raw.length; i++)
      for (let bit = 0; bit < 8; bit++) {
        const b = Buffer.from(raw);
        b[i] ^= 1 << bit;
        checkBody(call, version, frame(tag, 0, Buffer.concat([prefix, b])));
        checkBody(call, version, frame(tag, 0, Buffer.concat([prefix, raw])));
        mutations++;
      }
  }
  const h = frame(66, 0, Buffer.alloc(24)),
    d = Buffer.alloc(26);
  d.writeUInt16LE(1, 14);
  const ctrl = () => frame(71, 1, Buffer.concat([word(0x73656364), d]));
  const page = frame(73, 2, Buffer.alloc(40)),
    border = Buffer.alloc(14);
  const good = () => Buffer.concat([h, ctrl(), page, frame(75, 2, border)]);
  assert.deepEqual(
    sectionActual(call, version, [1, 1], good()),
    [1, 1, 1, 0, 0],
  );
  for (const [bytes, error] of [
    [h, /MissingSectionDefinition/],
    [Buffer.concat([h, ctrl()]), /MissingPageDefinition/],
    [Buffer.concat([good(), page]), /DuplicatePageDefinition/],
    [Buffer.concat([good(), ctrl()]), /DuplicateSectionDefinition/],
    [Buffer.concat([good(), frame(75, 1, border)]), /OrphanSectionRecord/],
  ]) {
    assert.throws(() => sectionActual(call, version, [1, 1], bytes), error);
    sectionActual(call, version, [1, 1], good());
  }
  d.writeUInt16LE(2, 14);
  assert.throws(
    () => sectionActual(call, version, [1, 1], good()),
    /InvalidResourceReference/,
  );
  d.writeUInt16LE(0, 14);
  assert.deepEqual(
    sectionActual(call, version, [1, 1], good()),
    [1, 1, 1, 1, 0],
  );
  border.writeUInt16LE(2, 12);
  assert.throws(
    () => sectionActual(call, version, [1, 1], good()),
    /InvalidResourceReference/,
  );
  border.writeUInt16LE(1, 12);
  sectionActual(call, version, [1, 1], good());
  const note = frame(74, 2, Buffer.alloc(28));
  assert.deepEqual(
    sectionActual(call, version, [1, 1], Buffer.concat([good(), note, note])),
    [1, 1, 1, 1, 2],
  );
  assert.throws(
    () =>
      sectionActual(
        call,
        version,
        [1, 1],
        Buffer.concat([good(), note, note, note]),
      ),
    /ExcessNoteShapes/,
  );
  assert.throws(
    () =>
      sectionActual(
        call,
        version,
        [1, 1],
        Buffer.concat([good(), frame(74, 1, Buffer.alloc(28))]),
      ),
    /OrphanSectionRecord/,
  );
  assert.equal(mutations, 960);
  return { mutations, recoveries: mutations };
}
