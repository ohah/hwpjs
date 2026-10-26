import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { projectHwp5OwnedWindow } from "../../web/preview/hwp5-window-projection.mjs";
import { attachHwp5Tables } from "../../web/preview/hwp5-table-content.mjs";
import { attachHwp5WindowCaptions } from "../../web/preview/hwp5-window-caption-content.mjs";
import { hwp5WindowTableSourceEditor } from "../../web/preview/hwp5-window-table-sources.mjs";
import { attachHwp5TableLayoutSources } from "../../web/preview/hwp5-table-layout-content.mjs";

test("actual eight-table caption document attaches only selected table sources", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table-caption.hwp");
  const editor = await createExperimentalHwp5Editor(wasm, input),
    reader = await createHwp5Reader(wasm);
  try {
    const preview = reader.readText(input),
      bindings = editor.tableBindings(0);
    assert.equal(editor.tablePlacements(0).length, 8);
    const content = projectHwp5OwnedWindow(editor, preview, {
      offset: bindings[0].paragraph,
      count: 1,
    });
    attachHwp5Tables(editor, preview, content);
    assert(content.tables.length > 0 && content.tables.length < 8);
    for (const key of [
      "tableBindingsErrors",
      "tablePlacementsErrors",
      "tableLayoutSourceErrors",
      "cellLayoutSourceErrors",
      "tableAnchorErrors",
      "tableGeometryErrors",
    ])
      assert.deepEqual(content[key], [], key);
    assert(
      content.tables.every(
        (table) =>
          table.layoutSource &&
          table.anchorSource &&
          table.cells.every((cell) => cell.layoutSource),
      ),
    );
    attachHwp5WindowCaptions(editor, content);
    assert.deepEqual(content.hwp5CaptionErrors, []);
    assert(content.hwp5Captions.length > 0);
    assert(
      content.hwp5Captions.every((caption) =>
        content.tables.some((table) => table.tableNode === caption.tableNode),
      ),
    );
    const missing = {
      ...content,
      paragraphs: content.paragraphs.filter(
        (row) =>
          !content.hwp5Captions.some((caption) => caption.paragraphs.includes(row.paragraph)),
      ),
    };
    assert.throws(() => attachHwp5WindowCaptions(editor, missing), /MissingHwp5CaptionBody/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
    reader.close();
  }
});

test("window table source scope keeps exact selected inventory without relaxing full attachment", () => {
  const sources = [
    { table_record_node: 10, rows: 1, columns: 1 },
    { table_record_node: 20, rows: 1, columns: 1 },
  ];
  const editor = {
    tableLayoutSources: () => sources,
    tableAnchors: () => sources,
    cellLayoutSources: () => [{ list_node: 11 }, { list_node: 21 }],
  };
  const content = () => ({
    paragraphs: [{ section: 0, paragraph: 0 }],
    tables: [
      {
        section: 0,
        tableNode: 10,
        rows: 1,
        columns: 1,
        hostParagraph: 0,
        cells: [{ listNode: 11 }],
      },
    ],
  });
  const full = content();
  attachHwp5TableLayoutSources(editor, full);
  assert.equal(full.tableLayoutSourceErrors[0].error, "IncompleteTableLayoutInventory");
  const window = content(),
    scoped = hwp5WindowTableSourceEditor(editor, window);
  attachHwp5TableLayoutSources(scoped, window);
  assert.deepEqual(window.tableLayoutSourceErrors, []);
  assert.equal(window.tables[0].layoutSource, sources[0]);
  assert.deepEqual(scoped.tableAnchors(0), [sources[0]]);
  assert.deepEqual(scoped.cellLayoutSources(0), [{ list_node: 11 }]);
  assert.equal(editor.tableLayoutSources(0).length, 2);
  sources.push({ ...sources[1] });
  assert.throws(() => scoped.tableLayoutSources(0), /AmbiguousTableLayoutSource/);
});
