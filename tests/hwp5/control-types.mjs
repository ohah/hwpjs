import assert from "node:assert/strict";
const cases = [
  [2, ["secd", "cold"]],
  [
    3,
    [
      "%unk",
      "%dte",
      "%ddt",
      "%pat",
      "%bmk",
      "%mmg",
      "%xrf",
      "%fmu",
      "%clk",
      "%smr",
      "%usr",
      "%hlk",
      "%sig",
      "%%*d",
      "%%*a",
      "%%*C",
      "%%*S",
      "%%*T",
      "%%*P",
      "%%*L",
      "%%*c",
      "%%*h",
      "%%*A",
      "%%*i",
      "%%*t",
      "%%*r",
      "%%*l",
      "%%*n",
      "%%*e",
      "%spl",
      "%%mr",
      "%%me",
      "%cpr",
      "%toc",
    ],
  ],
  [11, ["tbl ", "gso ", "eqed"]],
  [15, ["tcmt"]],
  [16, ["head", "foot"]],
  [17, ["fn  ", "en  "]],
  [18, ["atno"]],
  [21, ["nwno", "pghd", "pgct", "pgnp"]],
  [22, ["idxm", "bokm"]],
  [23, ["tcps", "tdut"]],
];
const extended = [1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23];
const word = (v) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(v >>> 0);
  return b;
};
const frame = (tag, level, b) =>
  Buffer.concat([word(tag | (level << 10) | (b.length << 20)), b]);
export function typeActual(call, v, bytes) {
  const out = call(16, Buffer.concat([word(v), bytes]));
  assert.equal(out.length, 8);
  return [out.readUInt32LE(), out.readUInt32LE(4)];
}
export function typeEdges(call) {
  const make = (name, code) => {
    const id = Buffer.from(name, "latin1").readUInt32BE();
    const token = Buffer.alloc(16, 255);
    token.writeUInt16LE(code);
    token.writeUInt32LE(id, 2);
    token.writeUInt16LE(code, 14);
    return Buffer.concat([
      frame(66, 0, Buffer.alloc(24)),
      frame(67, 1, token),
      frame(71, 1, word(id)),
    ]);
  };
  let mismatches = 0,
    known = 0;
  for (const [expected, names] of cases)
    for (const name of names) {
      const good = make(name, expected);
      assert.deepEqual(typeActual(call, 0x05000307, good), [1, 0]);
      known++;
      for (const code of extended)
        if (code !== expected) {
          assert.throws(
            () => typeActual(call, 0x05000307, make(name, code)),
            /ControlCodeMismatch/,
          );
          assert.deepEqual(typeActual(call, 0x05000307, good), [1, 0]);
          mismatches++;
        }
    }
  for (const name of [
    "%zzz",
    "autn",
    "newn",
    "bkmk",
    "%crf",
    "%fml",
    "FN  ",
    "abcd",
  ]) {
    assert.deepEqual(typeActual(call, 0x05000307, make(name, 11)), [0, 1]);
  }
  assert.equal(known, 53);
  assert.equal(mismatches, 636);
  return { known, mismatches, recoveries: mismatches, unknown: 8 };
}
