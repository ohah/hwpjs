import test from "node:test";
import assert from "node:assert/strict";
import { decodeHwp5ParagraphFlow } from "../../js/hwp5-flow-sources.mjs";
import { paginateBodyRows } from "../../web/preview/page-row-flow.mjs";

test("HWP5 generated flow admits only explicit body page or column break intent", () => {
  const encode = rows => new TextEncoder().encode(JSON.stringify(rows));
  const base = { paragraph: 0, source_node: null, template_node: 1, parent_node: null, generated: true, top_level: true };
  for (let flags = 0; flags < 256; flags++) {
    const row = { ...base, break_flags: flags, section_break: Boolean(flags & 1), multicolumn_break: Boolean(flags & 2), page_break: Boolean(flags & 4), column_break: Boolean(flags & 8) };
    if ([0, 4, 8].includes(flags)) assert.deepEqual(decodeHwp5ParagraphFlow(encode([row])), [row]);
    else assert.throws(() => decodeHwp5ParagraphFlow(encode([row])), /InvalidHwp5ParagraphFlow/);
    if (flags !== 0) assert.throws(() => decodeHwp5ParagraphFlow(encode([{ ...row, parent_node: 2, top_level: false }])), /InvalidHwp5ParagraphFlow/);
  }
});

test("explicit known single column break advances to a fresh page without guessing missing declarations", () => {
  const setting = { width: 7200, height: 7200, orientation: "widely", gutter_type: "left_only", duplicate_margins: 0, margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 } };
  const row = paragraph => ({ kind: "text", section: 0, paragraph, height: 48, text: "text" });
  const flow = paragraph => ({ section: 0, paragraph, top_level: true, page_break: false, column_break: false });
  const declaration = { count: 1, gap: 720, same_size: true, direction: "left", kind: "newspaper", ambiguous: false };
  const rows = [row(0), row(1), row(1)];
  const known = { ...flow(1), column_break: true, single_column: true, column_declaration: declaration };
  const layout = paginateBodyRows(rows, setting, [flow(0), known]);
  assert.equal(layout.state, "paginated", layout.error);
  assert.deepEqual(layout.rows.map(item => item.pageOrdinal), [0, 1, 1]);
  for (const change of [{ single_column: false }, { column_declaration: undefined }, { column_declaration: { ...declaration, count: 2 } }, { column_declaration: { ...declaration, gap: -1 } }, { column_declaration: { ...declaration, same_size: false, sizes: [{ width: 500, gap: 0 }] } }]) {
    assert.equal(paginateBodyRows(rows, setting, [flow(0), { ...known, ...change }]).error, "UnsupportedPageFlow");
  }
});
