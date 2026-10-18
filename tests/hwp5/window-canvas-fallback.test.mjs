import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness } from "../canvas/worker-harness.mjs";

test("partial-table HWP5 window fallback retains explicit fragment scope and inexact page numbers", async t => {
  const harness = await workerCanvasHarness(t, { paintFrames: true });
  assert.equal((await harness.send({ kind: "load", format: "hwp5", bytes: readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/table.hwp") })).error, undefined);
  const query = await harness.send({ kind: "query-window", offset: 1, count: 1 });
  assert.equal(query.error, undefined);
  assert(query.content.tables.some(table => table.partial));
  harness.paint();
  assert.equal(harness.canvas.dataset.pageLayoutError, "IncompleteHwp5WindowTables");
  assert.equal(harness.canvas.dataset.pageLayoutScope, "paragraph-window-fragment");
  assert.equal(harness.canvas.dataset.documentPageNumbersExact, "false");
  const selected = query.content.paragraphs.find(row => !row.windowContext);
  assert(selected);
  assert.equal(harness.renderer.paragraph(selected).text, selected.text);
});
