import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { inspect, records, readStreams } from "./style-preservation/text-record-oracle.mjs";
import { createTextStyle } from "../../web/preview/text-style.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";

const base = "legacy/rust/crates/hwp-core/tests/fixtures/";

test("legacy HWP5 compatibility coverage distinguishes absent, zero and encrypted inputs", () => {
  const counts = { readable: 0, absent: 0, zero: 0, encrypted: [] };
  for (const name of readdirSync(base).filter(name => /\.hwp$/i.test(name)).sort()) {
    const streams = readStreams(readFileSync(base + name));
    const flags = streams.get("FileHeader").readUInt32LE(36);
    if (flags & 2) { counts.encrypted.push(name); continue; }
    const bytes = streams.get("DocInfo");
    const rows = records(flags & 1 ? inflateRawSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }) : bytes);
    const targets = rows.filter(row => row.tag === 30), layouts = rows.filter(row => row.tag === 31);
    counts.readable++;
    if (!targets.length && !layouts.length) { counts.absent++; continue; }
    assert.equal(targets.length, 1, name);
    assert.equal(layouts.length, 1, name);
    assert.equal(targets[0].payload.length, 4, name);
    assert.equal(targets[0].payload.readUInt32LE(0), 0, name);
    assert.deepEqual(layouts[0].payload, Buffer.alloc(20), name);
    counts.zero++;
  }
  // This is an inventory gate, not evidence that nonzero compatibility bits work.
  assert.deepEqual(counts, { readable: 47, absent: 12, zero: 35, encrypted: ["password-12345.hwp"] });
});
for (const [name, count] of [["facename", 13], ["charshape", 7], ["linespacing", 26]]) {
  test(`HWP5 ${name}: declared font height and stored HTML line boxes`, () => {
    const input = readFileSync(`${base}${name}.hwp`), before = Buffer.from(input);
    const source = inspect(input);
    const characterShapes = records(source.decode(source.streams.get("DocInfo")))
      .filter(row => row.tag === 21).map((row, id) => ({ id, height: row.payload.readInt32LE(42) }));
    const style = createTextStyle({ format: "hwp5", characterShapes }, "16px sans-serif");
    const html = readFileSync(`${base}${name}.html`, "utf8");
    const boxes = [...html.matchAll(/<div class="hls [^"]*" style="([^"]*)"/g)]
      .map(match => Number(/(?:^|;)height:([\d.]+)mm;/.exec(match[1])?.[1]));
    const lines = [];
    for (const section of source.sections) {
      let fontIds = [];
      for (const row of records(section.bytes)) {
        if (row.tag === 66) fontIds = [];
        if (row.tag === 68) {
          assert.equal(row.payload.length % 8, 0);
          fontIds = Array.from({ length: row.payload.length / 8 }, (_, i) => row.payload.readUInt32LE(i * 8 + 4));
        }
        if (row.tag !== 69) continue;
        assert.equal(row.payload.length % 36, 0);
        for (let at = 0; at < row.payload.length; at += 36) {
          assert.ok(fontIds.length > 0);
          const heights = fontIds.map(id => {
            const paragraph = { text: "x", characterRanges: [{ start: 0, end: 1, charShapeId: id }] };
            return style.fontHeight(paragraph, 0);
          });
          lines.push({ stored: row.payload.readInt32LE(at + 8), nominal: Math.max(...heights) });
        }
      }
    }
    assert.equal(lines.length, count);
    assert.equal(boxes.length, count);
    for (const [index, line] of lines.entries()) {
      // HTML serializes millimetres to two decimal places, not exact binary units.
      assert.ok(Math.abs(boxes[index] - line.stored * 25.4 / 7200) <= 0.0051, `${name} HTML line ${index}`);
      assert.ok(Math.abs(line.nominal - line.stored / 75) < 1e-8, `${name} nominal line ${index}: ${line.nominal} vs ${line.stored / 75}`);
    }
    assert.deepEqual(input, before);
  });
}

test("HWP5 measured document rows do not impose the prototype 20px text floor", () => {
  const paragraph = { section: 0, paragraph: 0, text: "ab", label: "", editable: true,
    paragraphShape: { legacySpacingKind: 0, legacySpacing: 160 } };
  const content = { format: "hwp5", paragraphs: [paragraph] };
  const measure = () => ({ width: 10, height: 1000 / 75 });
  const result = layoutContent(content, 100, measure, 20, { documentBody: true });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].textHeight, 1000 / 75);
  assert.equal(result.rows[0].height, 1600 / 75);
  assert.equal(layoutContent({ ...content, format: "hwpx" }, 100, measure, 20, { documentBody: true }).rows[0].textHeight, 20);
  assert.equal(layoutContent(content, 100, () => 10, 20, { documentBody: true }).rows[0].textHeight, 20);
});

test("HWP5 wrapped and empty rows measure their own runs without first-font contamination", () => {
  const paragraph = { section: 0, paragraph: 0, text: "ab", label: "", editable: true,
    paragraphShape: { legacySpacingKind: 0, legacySpacing: 100 } };
  const content = { format: "hwp5", paragraphs: [paragraph] };
  const measure = (_, paragraph, unit) => ({ width: 10, height: unit === 0 ? 40 : 12 });
  const result = layoutContent(content, 10, measure, 20, { documentBody: true });
  assert.deepEqual(result.rows.map(row => row.textHeight), [40, 12]);
  for (const text of ["", "\n", "a\n"]) {
    const input = { ...content, paragraphs: [{ ...paragraph, text }] };
    const before = structuredClone(input);
    const rows = layoutContent(input, 100, () => ({ width: 0, height: 12 }), 20, { documentBody: true }).rows;
    assert.ok(rows.every(row => row.textHeight === 12 && row.height === 12));
    assert.equal(rows.length, text.includes("\n") ? 2 : 1);
    assert.deepEqual(input, before);
  }
  assert.throws(() => layoutContent(content, 100, () => ({ width: 10, height: NaN }), 20, { documentBody: true }), /InvalidTextMeasurement/);
});

test("nominal height is format-scoped and missing font sizes retain the explicit fallback", () => {
  const paragraph = { text: "x", characterRanges: [{ start: 0, end: 1, charShapeId: 0 }] };
  for (const height of [1, 900, 1000, 2000, 409600]) {
    const content = { format: "hwp5", characterShapes: [{ id: 0, height }] };
    const style = createTextStyle(content, "16px sans-serif");
    assert.ok(Math.abs(style.fontHeight(paragraph, 0) - height / 75) < 1e-8);
  }
  for (const height of [undefined, 0, -1, NaN]) {
    const style = createTextStyle({ format: "hwp5", characterShapes: [{ id: 0, height }] }, "16px sans-serif");
    assert.equal(style.fontHeight(paragraph, 0), 20);
  }
  for (const format of [undefined, "hwpx"]) {
    const style = createTextStyle({ format, characterShapes: [{ id: 0, height: 1000 }] }, "16px sans-serif");
    assert.equal(style.fontHeight(paragraph, 0), 20);
  }
});
