import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createTextStyle } from "../../web/preview/text-style.mjs";
import { createCharacterFontMetricDisplay } from "../../web/preview/character-font-metric-display.mjs";
import {
  horizontalGlyphWidth,
  paintHorizontalGlyph,
} from "../../web/preview/glyph-horizontal-scale.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
import { caretGeometry, hitText, selectionRects } from "../../web/preview/text-geometry.mjs";
import { rowLeft, rowTop, rowTextTop } from "../../web/preview/row-geometry.mjs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";

test("horizontal ratio validates limits without changing vertical or raw values", () => {
  const row = {
    id: 0,
    values: { ratio: [50, 200, 95, 100, 75, 150, 100], relativeSize: Array(7).fill(100) },
  };
  const content = { format: "hwpx", characterFontMetrics: [row] },
    before = structuredClone(content);
  const metrics = createCharacterFontMetricDisplay(content);
  for (const [text, expected] of [
    ["한", 0.5],
    ["A", 2],
    ["漢", 0.95],
    ["あ", 1],
    ["ش", 0.75],
    ["😀", 1.5],
  ])
    assert.equal(metrics.horizontalScale(0, text, 0), expected);
  for (const value of [null, 0, 49, 201, "95", NaN, Infinity])
    assert.equal(
      createCharacterFontMetricDisplay({
        ...content,
        characterFontMetrics: [{ id: 0, values: { ratio: Array(7).fill(value) } }],
      }).horizontalScale(0, "한", 0),
      1,
    );
  assert.equal(metrics.horizontalScale(0, "\ufffc", 0), 1);
  assert.equal(
    createCharacterFontMetricDisplay({ ...content, format: "unknown" }).horizontalScale(0, "한", 0),
    1,
  );
  assert.deepEqual(content, before);
  assert.equal(horizontalGlyphWidth(20, 0.95), 19);
  for (const [width, scale] of [
    [-1, 1],
    [Infinity, 1],
    [20, NaN],
    [20, 0],
    [Number.MAX_VALUE, 2],
  ])
    assert.throws(() => horizontalGlyphWidth(width, scale), /InvalidHorizontalGlyphMeasurement/);
});

test("glyph transform preserves caller state and restores even when painting fails", () => {
  const calls = [],
    ctx = Object.fromEntries(
      ["save", "restore", "translate", "scale"].map((key) => [
        key,
        (...args) => calls.push([key, ...args]),
      ]),
    );
  assert.equal(
    paintHorizontalGlyph(ctx, 0.95, 20, 30, (x, y) => {
      calls.push(["paint", x, y]);
      return 7;
    }),
    7,
  );
  assert.deepEqual(calls, [
    ["save"],
    ["translate", 20, 30],
    ["scale", 0.95, 1],
    ["paint", 0, 0],
    ["restore"],
  ]);
  calls.length = 0;
  assert.throws(
    () =>
      paintHorizontalGlyph(ctx, 2, 5, 6, () => {
        throw Error("PaintFailure");
      }),
    /PaintFailure/,
  );
  assert.deepEqual(calls.at(-1), ["restore"]);
  calls.length = 0;
  paintHorizontalGlyph(ctx, 1, 5, 6, (x, y) => calls.push([x, y]));
  assert.deepEqual(calls, [[5, 6]]);
});

for (const format of ["hwp5", "hwpx"]) {
  test(`actual ${format} renderer applies ratio to both measurement and painting`, async (t) => {
    const h = await workerCanvasHarness(t, { paintFrames: true });
    const bytes = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/facename.${format === "hwp5" ? "hwp" : "hwpx"}`,
    );
    assert.equal((await h.send({ kind: "load", format, bytes })).error, undefined);
    const enabled = await h.send({ kind: "enable" }, false);
    assert.equal(enabled.error, undefined);
    const resource = enabled.content.characterFontMetrics.find(
      (row) => row.values.ratio?.[0] === 95 && row.values.ratio?.[1] === 95,
    );
    assert.ok(resource);
    const paragraph = {
      section: 0,
      paragraph: 1,
      text: "A가",
      editable: true,
      characterRanges: [{ start: 0, end: 2, charShapeId: resource.id }],
    };
    const scales = [],
      context = h.canvas.getContext("2d");
    context.scale = (x, y) => scales.push([x, y]);
    h.renderer.show({
      format,
      paragraphs: [paragraph],
      characterShapes: enabled.content.characterShapes,
      characterFontMetrics: enabled.content.characterFontMetrics,
    });
    h.paint();
    const row = h.renderer.layout().rows.find((row) => row.kind === "text");
    assert.deepEqual(
      row.boundaries.map((boundary) => boundary.x),
      [0, 7.6, 15.2],
    );
    assert.ok(scales.filter(([x, y]) => x === 0.95 && y === 1).length >= 2);
    assert.deepEqual(Buffer.from((await h.send({ kind: "save" }, false)).bytes), bytes);
  });
  test(`actual ${format} ratio resource shares advances with caret hit testing and selection`, async () => {
    const bytes = readFileSync(
      `legacy/rust/crates/hwp-core/tests/fixtures/facename.${format === "hwp5" ? "hwp" : "hwpx"}`,
    );
    const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
    const editor =
      format === "hwp5"
        ? await createExperimentalHwp5Editor(wasm, bytes)
        : await createHwpxEditor(wasm);
    try {
      if (format === "hwpx") editor.open(bytes);
      const metrics = editor.characterFontMetrics(),
        resource = metrics.find(
          (row) => row.values.ratio?.[0] === 95 && row.values.ratio?.[1] === 95,
        );
      assert.ok(resource);
      const paragraph = {
        section: 0,
        paragraph: 1,
        text: "A가",
        editable: true,
        characterRanges: [{ start: 0, end: 2, charShapeId: resource.id }],
      };
      const content = {
        format,
        characterShapes: editor.characterShapes(),
        characterFontMetrics: metrics,
        paragraphs: [paragraph],
      };
      const style = createTextStyle(content, "16px sans-serif");
      const measure = (text, p, unit, kind) => ({
        width: horizontalGlyphWidth(text.length ? 20 : 0, style.horizontalScale(p, unit, kind)),
        height: style.fontHeight(p, unit, kind),
      });
      const layout = layoutContent(content, 100, measure, 20, { documentBody: true });
      const row = layout.rows.find((row) => row.kind === "text");
      assert.deepEqual(
        row.boundaries.map((boundary) => boundary.x),
        [0, 19, 38],
      );
      const point = { section: 0, paragraph: 1, unit: 1 };
      assert.equal(caretGeometry(layout, point).x, rowLeft(row) + 19);
      assert.equal(
        hitText(layout, rowLeft(row) + 19, rowTop(row, 0) + rowTextTop(row) + 1).unit,
        1,
      );
      assert.equal(
        selectionRects(layout, { ...point, unit: 0 }, { ...point, unit: 2 })[0].width,
        38,
      );
      assert.equal(style.horizontalScale(paragraph, 0, "number-prefix"), 1);
      const wrapped = layoutContent(content, 37, measure, 20, { documentBody: true });
      assert.equal(wrapped.rows.filter((row) => row.kind === "text").length, 2);
    } finally {
      editor.close();
    }
  });
}
