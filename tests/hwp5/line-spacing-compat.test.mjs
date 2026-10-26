import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hwp5LineSpacing, roundedMulDiv } from "../../web/preview/hwp5-line-spacing.mjs";
import { paragraphLineAdvance, paragraphSpacing } from "../../web/preview/paragraph-geometry.mjs";
import { currentParagraphSpacing } from "../../web/preview/paragraph-spacing-source.mjs";
import { hwpxParagraphGeometry } from "../../web/preview/hwpx-paragraph-geometry.mjs";
import { layoutContent } from "../../web/preview/layout.mjs";
import { rowAtY, rowVisualHeight } from "../../web/preview/row-geometry.mjs";
import { caretGeometry } from "../../web/preview/text-geometry.mjs";
import { inspect, records } from "./style-preservation/text-record-oracle.mjs";
import { layoutDrawingText } from "../../web/preview/drawing-text-layout.mjs";
import { measureInlineObjectParagraph } from "../../web/preview/inline-object-paragraph-measurement.mjs";

test("round 1 arithmetic: signed ties, integer steps and exact counterexamples", () => {
  assert.equal(roundedMulDiv(1, 1, 2), 1);
  assert.equal(roundedMulDiv(-1, 1, 2), -1);
  assert.equal(roundedMulDiv(2147483647, 2147483647, 2147483647), 2147483647);
  assert.equal(roundedMulDiv(2147483647, 2, 1), null);
  assert.deepEqual(hwp5LineSpacing(0, 160, 1000), { extra: 600, advance: 1600 });
  assert.deepEqual(hwp5LineSpacing(0, 160, 1003), { extra: 600, advance: 1603 });
  assert.notEqual(hwp5LineSpacing(0, 160, 1003).advance, 1003 * 1.6);
  assert.deepEqual(hwp5LineSpacing(0, 0, 1000), { extra: -1000, advance: 0 });
  assert.deepEqual(hwp5LineSpacing(1, 1000, 1000), { extra: -500, advance: 500 });
  assert.deepEqual(hwp5LineSpacing(2, 4000, 1000), { extra: 2000, advance: 3000 });
  assert.deepEqual(hwp5LineSpacing(3, 1000, 1000), { extra: 0, advance: 1000 });
  for (let h = 0; h <= 2003; h += 17)
    for (const p of [0, 1, 99, 100, 101, 160, 500]) {
      const product = Math.trunc(h / 4) * (p - 100);
      const extra = 4 * Math.sign(product) * Math.floor((Math.abs(product) + 50) / 100) || 0;
      assert.deepEqual(hwp5LineSpacing(0, p, h), { extra, advance: h + extra });
    }
});

test("round 2 hostile inputs: no coercion, overflow, fabricated font basis or raw mutation", () => {
  for (const v of [undefined, null, "160", NaN, Infinity, -1, 1.5, 2147483648]) {
    assert.equal(hwp5LineSpacing(0, v, 1000), null);
    assert.equal(hwp5LineSpacing(0, 160, v), null);
  }
  for (const kind of [-1, 4, 16, 31, "0", null])
    assert.equal(hwp5LineSpacing(kind, 160, 1000), null);
  assert.equal(hwp5LineSpacing(0, 2147483647, 2147483647), null);
  assert.equal(hwp5LineSpacing(1, 2001, 1000), null);
  assert.deepEqual(hwp5LineSpacing(1, 2001, 1000, { relativeBase: 500 }), {
    extra: 4000,
    advance: 5000,
  });
  const shape = Object.freeze({
    legacySpacingKind: 0,
    legacySpacing: 160,
    modernSpacing: Object.freeze({ attributes: 0, value: 0 }),
  });
  assert.deepEqual(paragraphSpacing(shape), { kind: 0, value: 160 });
  for (const modernSpacing of [
    false,
    0,
    "0",
    [],
    { attributes: "0", value: 160 },
    { attributes: 0, value: NaN },
  ]) {
    const malformed = { ...shape, modernSpacing };
    assert.equal(currentParagraphSpacing(malformed), null);
    assert.equal(paragraphLineAdvance(malformed, 20, 28), 28);
  }
  assert.equal(paragraphLineAdvance({ legacySpacingKind: 7, legacySpacing: 160 }, 20, 28), 28);
  assert.equal(paragraphLineAdvance({ legacySpacingKind: 1, legacySpacing: 2001 }, 20, 28), 28);
});

test("round 3 format isolation: HWPX is not halved and source absence is not zero", () => {
  for (const [type, expected] of [
    ["FIXED", 40],
    ["BETWEEN_LINES", 60],
    ["AT_LEAST", 40],
  ]) {
    const shape = hwpxParagraphGeometry({
      spacing_type: type,
      spacing: { value: 3000, unit: "HWPUNIT" },
      margins: [],
    });
    assert.equal(paragraphLineAdvance(shape, 20, 28), expected);
  }
  assert.equal(paragraphLineAdvance({ legacySpacingKind: 1, legacySpacing: 3000 }, 20, 28), 20);
  assert.equal(paragraphLineAdvance({ legacySpacingKind: 0, legacySpacing: 0 }, 20, 28), 0);
  assert.equal(paragraphLineAdvance({}, 20, 28), 28);
  assert.equal(
    paragraphLineAdvance(
      hwpxParagraphGeometry({ spacing_type: "PERCENT", spacing: { value: 0 }, margins: [] }),
      20,
      28,
    ),
    0,
  );
  assert.equal(
    paragraphLineAdvance(
      hwpxParagraphGeometry({
        spacing_type: "FIXED",
        spacing: { value: 3000, unit: "future" },
        margins: [],
      }),
      20,
      28,
    ),
    28,
  );
  assert.deepEqual(
    paragraphSpacing({
      legacySpacingKind: 0,
      legacySpacing: 0,
      modernSpacing: { attributes: 0, value: 160 },
    }),
    { kind: 0, value: 0 },
  );
});

test("round 4 actual linespacing fixture: independent offsets, cached extra and unchanged input", () => {
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/linespacing.hwp"),
    before = Buffer.from(input);
  const doc = inspect(input),
    version = doc.streams.get("FileHeader").readUInt32LE(32);
  const shapes = records(doc.decode(doc.streams.get("DocInfo")))
    .filter((r) => r.tag === 25)
    .map(({ payload: p }) => {
      const legacySpacingKind = p.readUInt32LE(0) & 3,
        legacySpacing = p.readInt32LE(24);
      return {
        legacySpacingKind,
        legacySpacing,
        modernSpacing:
          version >= 0x05000205 && p.length >= 54
            ? { attributes: p.readUInt32LE(46), value: p.readInt32LE(50) }
            : null,
      };
    });
  let checked = 0;
  const kinds = new Set();
  for (const section of doc.sections) {
    let shape;
    for (const row of records(section.bytes)) {
      if (row.tag === 66) shape = shapes[row.payload.readUInt16LE(8)];
      if (row.tag !== 69) continue;
      for (let at = 0; at < row.payload.length; at += 36) {
        const p = row.payload,
          height = p.readInt32LE(at + 8),
          basisHeight = p.readInt32LE(at + 12),
          spacing = paragraphSpacing(shape);
        const result = hwp5LineSpacing(spacing.kind, spacing.value, height, { basisHeight });
        assert.notEqual(result, null);
        assert.equal(result.extra, p.readInt32LE(at + 20));
        assert.ok(
          Math.abs(
            paragraphLineAdvance(shape, height / 75, 28, { spacingBasisHeight: basisHeight / 75 }) -
              result.advance / 75,
          ) < 1e-8,
        );
        kinds.add(spacing.kind);
        checked++;
      }
    }
  }
  assert.ok(checked >= 20);
  // This real fixture has no minimum-spacing paragraphs; round 1 owns that boundary.
  assert.deepEqual([...kinds].sort(), [0, 1, 2]);
  assert.deepEqual(input, before);
});

test("round 5 flow: zero advance terminates, ink stays selectable and basis excludes tall objects", () => {
  const paragraph = {
    section: 0,
    paragraph: 0,
    label: "",
    text: "abcd",
    editable: true,
    paragraphShape: { legacySpacingKind: 0, legacySpacing: 0 },
  };
  const flow = layoutContent({ paragraphs: [paragraph] }, 20, () => 10, 20, { documentBody: true });
  assert.equal(flow.rows.length, 2);
  assert.deepEqual(
    flow.rows.map((row) => row.y),
    [0, 0],
  );
  assert.deepEqual(
    flow.rows.map((row) => [row.startUnit, row.endUnit]),
    [
      [0, 2],
      [2, 4],
    ],
  );
  assert.equal(rowVisualHeight(flow.rows[1]), 28);
  assert.equal(rowAtY(flow, 10), 1);
  assert.ok(caretGeometry(flow, { section: 0, paragraph: 0, unit: 3 }));
  const capped = layoutContent({ paragraphs: [paragraph] }, 20, () => 10, 1, {
    documentBody: true,
  });
  assert.equal(capped.limited, true);
  assert.equal(capped.rows.length, 1);
  assert.equal(capped.rows[0].editable, false);
  assert.equal(hwp5LineSpacing(0, 160, 10000, { basisHeight: 1000 }).advance, 10600);
  assert.ok(
    Math.abs(
      paragraphLineAdvance({ legacySpacingKind: 0, legacySpacing: 160 }, 10000 / 75, 28, {
        spacingBasisHeight: 1000 / 75,
      }) -
        10600 / 75,
    ) < 1e-8,
  );
});

test("round 5 drawing: zero advance cannot hide ink overflow or bypass row limits", () => {
  const drawing = {
    section: 0,
    drawingNode: 2,
    source: {
      text: {
        list_node: 4,
        text_direction: 0,
        line_wrap: 0,
        vertical_alignment: 0,
        margin_present: true,
        margins: [0, 0, 0, 0],
      },
    },
  };
  const paragraph = {
    section: 0,
    paragraph: 1,
    text: "abcd",
    editable: true,
    paragraphShape: { legacySpacingKind: 0, legacySpacing: 0 },
    drawingText: { drawingNode: 2, listNode: 4 },
  };
  const declaration = {
    count: 1,
    same_size: true,
    gap: 0,
    direction: "left",
    kind: "newspaper",
    ambiguous: false,
  };
  const measure = () => ({ width: 10, height: 20 });
  const box = { x: 0, y: 0, width: 20, height: 28 };
  const result = layoutDrawingText(drawing, [paragraph], declaration, box, measure);
  assert.equal(result.state, "placed");
  assert.deepEqual(
    result.rows.map((row) => row.y),
    [0, 0],
  );
  assert.equal(
    layoutDrawingText(drawing, [paragraph], declaration, { ...box, height: 27 }, measure).error,
    "DrawingTextOverflow",
  );
  assert.equal(
    layoutDrawingText(drawing, [paragraph], declaration, box, measure, { maxRows: 1 }).error,
    "DrawingTextLayoutLimit",
  );
});

test("round 5 negative controls reject naive multiplication, doubled units and minimum clamps", async () => {
  const sourceUrl = new URL("../../web/preview/hwp5-line-spacing.mjs", import.meta.url);
  const source = readFileSync(sourceUrl, "utf8");
  const dependency = '"./integer-mul-div.mjs"';
  assert.ok(source.includes(dependency));
  // A data URL has no hierarchical base; keep the real shared dependency.
  const linked = source.replaceAll(
    dependency,
    JSON.stringify(new URL("./integer-mul-div.mjs", sourceUrl).href),
  );
  const mutants = [
    [
      "Math.trunc(basisHeight / 4)",
      "basisHeight / 4",
      [0, 160, 1003],
      { extra: 600, advance: 1603 },
    ],
    ["Math.trunc(value / 2)", "value", [1, 4000, 1000], { extra: 1000, advance: 2000 }],
    [
      "const advance = height + extra",
      "const advance = Math.max(height, height + extra)",
      [0, 0, 1000],
      { extra: -1000, advance: 0 },
    ],
  ];
  for (const [from, to, args, expected] of mutants) {
    assert.ok(source.includes(from));
    const candidate = await import(
      `data:text/javascript;base64,${Buffer.from(linked.replace(from, to)).toString("base64")}`
    );
    assert.notDeepEqual(candidate.hwp5LineSpacing(...args), expected);
    assert.deepEqual(hwp5LineSpacing(...args), expected);
  }
});

test("round 5 inline object: signed spacing is not clamped back to object height", () => {
  const paragraph = {
    section: 0,
    paragraph: 0,
    text: "\ufffca",
    paragraphShape: { legacySpacingKind: 0, legacySpacing: 0 },
  };
  const before = structuredClone(paragraph);
  const result = measureInlineObjectParagraph(
    paragraph,
    [{ objectNode: 1, unit: 0, width: 10, height: 10000 / 75 }],
    100,
    () => ({ width: 10, height: 1000 / 75 }),
  );
  assert.equal(result.state, "measured");
  assert.equal(result.rows[0].height, 9000 / 75);
  assert.equal(result.anchors[0].height, 10000 / 75);
  assert.deepEqual(paragraph, before);
});
