import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createTextStyle } from "../../web/preview/text-style.mjs";
import { createRelativeFontSize } from "../../web/preview/character-font-metric-display.mjs";

for (const format of ["hwp5", "hwpx"]) {
  test(`${format} relative Hangul size agrees with existing HTML without shrinking cached nominal rows`, async () => {
    const bytes = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`);
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
    const editor = format === "hwp5" ? await createExperimentalHwp5Editor(wasm, bytes) : await createHwpxEditor(wasm);
    try {
      if (format === "hwpx") editor.open(bytes);
      const metrics = editor.characterFontMetrics(), shapes = editor.characterShapes();
      const row = metrics.find(row => row.values.relativeSize?.[0] === 90 && row.values.relativeSize?.[1] === 100);
      assert.ok(row);
      const css = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/charshape_style.css", "utf8");
      const expected = Number(new RegExp(`\\.cs${row.id} \\{font-size:([\\d.]+)pt;`).exec(css)?.[1]);
      assert.equal(expected, 9);
      const paragraph = { text: "한A", characterRanges: [{ start: 0, end: 2, charShapeId: row.id }] };
      const style = createTextStyle({ format, characterShapes: shapes, characterFontMetrics: metrics }, "16px sans-serif");
      assert.equal(style(paragraph, 0), `${expected}pt sans-serif`);
      assert.equal(style(paragraph, 1), "10pt sans-serif");
      assert.equal(style(paragraph, 0, "number-prefix"), "10pt sans-serif");
      assert.ok(Math.abs(style.fontHeight(paragraph, 0) - 1000 / 75) < 1e-10);
      const saved = editor.save();
      assert.deepEqual(Buffer.from(format === "hwp5" ? saved.bytes : saved), bytes);
    } finally { editor.close(); }
  });
}

test("relative size reuses existing display language policy and rejects invalid or missing values", () => {
  const row = { id: 0, values: { relativeSize: [90, 80, 70, 60, 50, 40, 30] } };
  const content = { format: "hwpx", characterFontMetrics: [row] }, before = structuredClone(content);
  const size = createRelativeFontSize(content);
  for (const [text, expected] of [["한", 9], ["A", 8], ["7", 8], ["漢", 7], ["あ", 6], ["ش", 5], ["😀", 4]]) assert.equal(size(0, text, 0, 10), expected);
  for (const relative of [null, 0, -1, 9, 251, "90", NaN, Infinity]) assert.equal(createRelativeFontSize({ ...content, characterFontMetrics: [{ id: 0, values: { relativeSize: Array(7).fill(relative) } }] })(0, "한", 0, 10), 10);
  for (const [relative, expected] of [[10, 1], [250, 25]]) assert.equal(createRelativeFontSize({ ...content, characterFontMetrics: [{ id: 0, values: { relativeSize: Array(7).fill(relative) } }] })(0, "한", 0, 10), expected);
  assert.equal(size(9, "한", 0, 10), 10);
  assert.equal(size(0, "", 0, 10), 10);
  assert.equal(size(0, "\ufffc", 0, 10), 10);
  assert.equal(createRelativeFontSize({ ...content, format: "unknown" })(0, "한", 0, 10), 10);
  assert.deepEqual(content, before);
});

const expandedReference = "reference/rhwp/samples/task3307/issue3307_outline_number.hwpx";
test("relative font size rounds in source units before CSS conversion", () => {
  for (const [height, relative, expected] of [[1001, 90, 901], [1005, 90, 905], [1005, 10, 101], [1000, 128, 1280], [1000, 250, 2500]]) {
    for (const format of ["hwp5", "hwpx"]) {
      const paragraph = { text: "한", characterRanges: [{ start: 0, end: 1, charShapeId: 0 }] };
      const style = createTextStyle({ format, characterShapes: [{ id: 0, height }], characterFontMetrics: [{ id: 0, values: { relativeSize: Array(7).fill(relative) } }] }, "16px sans-serif");
      assert.equal(style(paragraph, 0), `${expected / 100}pt sans-serif`);
      assert.ok(Math.abs(style.fontHeight(paragraph, 0) - height / 75) < 1e-10);
    }
  }
});
test("actual 101 percent reference retains independently stored nominal text height", { skip: !existsSync(expandedReference) && "RHWP reference is not installed" }, async () => {
  const source = JSON.parse(execFileSync("python3", ["tests/hwpx/font-height-reference-oracle.py", expandedReference], { encoding: "utf8" }));
  const metrics = JSON.parse(execFileSync("python3", ["tests/hwpx/character-font-metrics-oracle.py", expandedReference], { encoding: "utf8" }));
  assert.equal(metrics.find(row => row.id === 64).values.relativeSize[0], 101);
  assert.equal(source.shapes.find(row => row.id === 64).height, 1200);
  assert.ok(source.lines.some(row => row.ids.length > 0 && row.ids.every(id => id === 64) && row.height === 1200));
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm"));
  try {
    editor.open(readFileSync(expandedReference));
    const style = createTextStyle({ format: "hwpx", characterShapes: editor.characterShapes(), characterFontMetrics: editor.characterFontMetrics() }, "16px sans-serif");
    const paragraph = { text: "비위의 유형", characterRanges: [{ start: 0, end: 6, charShapeId: 64 }] };
    assert.equal(style(paragraph, 0), "12.12pt sans-serif");
    assert.equal(style.fontHeight(paragraph, 0), 16);
  } finally { editor.close(); }
});
