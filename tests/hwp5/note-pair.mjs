import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
// Existing MIT legacy ZIP reader is a test oracle only, never a product dependency.
export function notePair(call, section, hwpx) {
  const context = {
    module: { exports: {} },
    require: createRequire(import.meta.url),
    Buffer,
    process,
    console,
  };
  runInNewContext(
    readFileSync(new URL("../../legacy/cfb.js", import.meta.url), "utf8"),
    context,
  );
  const CFB = context.module.exports;
  const zip = CFB.read(hwpx, { type: "buffer" });
  const index = zip.FullPaths.findIndex((path) =>
    path.endsWith("/Contents/section0.xml"),
  );
  assert.ok(index >= 0);
  const xml = Buffer.from(zip.FileIndex[index].content).toString("utf8");
  const notes = [];
  for (let p = 0; p < section.length; ) {
    const bits = section.readUInt32LE(p);
    p += 4;
    let n = bits >>> 20;
    if (n === 4095) {
      n = section.readUInt32LE(p);
      p += 4;
    }
    if ((bits & 1023) === 74) notes.push(section.subarray(p, p + n));
    p += n;
  }
  const blocks = [
    ...xml.matchAll(
      /<hp:(?:footNotePr|endNotePr)>([\s\S]*?)<\/hp:(?:footNotePr|endNotePr)>/g,
    ),
  ].map((m) => m[1]);
  assert.equal(notes.length, 2);
  assert.equal(blocks.length, 2);
  const results = [];
  for (let i = 0; i < 2; i++) {
    const line = blocks[i].match(/<hp:noteLine\b[^>]*>/)[0];
    const spacing = blocks[i].match(/<hp:noteSpacing\b[^>]*>/)[0];
    const attr = (text, key) =>
      Number(text.match(new RegExp(`\\b${key}="(-?\\d+)"`))[1]);
    const expected = [
      attr(line, "length"),
      attr(spacing, "aboveLine"),
      attr(spacing, "belowLine"),
      attr(spacing, "betweenNotes"),
    ];
    const out = call(12, notes[i]);
    const actual = Array.from({ length: 4 }, (_, j) => out.readInt32LE(j * 4));
    assert.deepEqual(actual, expected);
    results.push(actual);
  }
  assert.deepEqual(results, [
    [-1, 850, 567, 283],
    [14692344, 850, 567, 0],
  ]);
  return results;
}
