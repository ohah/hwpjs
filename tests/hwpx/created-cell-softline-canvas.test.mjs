import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "../canvas/worker-harness.mjs";

async function cell(t) {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const bytes = readFileSync("legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwpx");
  assert.equal((await h.send({ kind: "load", format: "hwpx", bytes })).error, undefined);
  assert.equal((await h.send({ kind: "enable" })).error, undefined);
  const resources = Object.fromEntries(Object.entries(h.controller.tableCreationResources()).map(([key, ids]) => [key, key === "border_fill" && ids.includes(1) ? 1 : ids[0]]));
  assert.equal(h.controller.selectTextRange({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0 }), true);
  assert.equal(h.controller.insertTable({ rows: 2, columns: 2, width: 21600, rowHeight: 7200, resources }), true);
  const created = await h.flush(); assert.equal(created.error, undefined);
  assert.equal(h.input.readOnly, false);
  return { h, created };
}

test("generated cell Canvas replacement ShiftEnter and input line break preserve cell ownership and history", async t => {
  const { h, created } = await cell(t);
  assert.equal(created.content.createdTables[0].cells[0].softLineBreakAvailable, true);
  assert.equal(h.controller.replaceSelection("원😀문"), true);
  assert.equal(h.controller.replaceSelection("pending"), false);
  assert.equal((await h.flush()).error, undefined);
  h.input.setSelectionRange(1, 3);
  assert.equal(h.controller.replaceSelection("첫\r\n둘"), true);
  assert.equal(h.requests.at(-1).kind, "created-cell-text");
  assert.equal(h.requests.at(-1).paragraph, undefined);
  assert.equal((await h.flush()).error, undefined);
  assert.equal(h.input.value, "원첫\n둘문");
  h.input.setSelectionRange(h.input.value.length, h.input.value.length);
  assert.equal(dispatchCanvasEvent(h.input, "keydown", { key: "Enter", shiftKey: true }).defaultPrevented, true);
  assert.equal((await h.flush()).error, undefined);
  assert.equal(dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertLineBreak" }).defaultPrevented, true);
  const changed = await h.flush(); assert.equal(changed.error, undefined);
  assert.deepEqual(changed.content.createdTables[0].cells.map(cell => cell.text), ["원첫\n둘문\n\n", "", "", ""]);
  assert.equal(h.renderer.layout().pageLayoutMode, "measured-created-inline");
  h.paint();
  const saved = await h.send({ kind: "save" }); assert.equal(saved.error, undefined);
  assert.equal(h.controller.history("undo"), true); assert.equal((await h.flush()).error, undefined);
  assert.equal(h.controller.replaceSelection("\ud800"), false);
  const beforeRefusal = await h.send({ kind: "save" }); assert.equal(beforeRefusal.error, undefined);
  const originalText = h.input.value;
  assert.equal(h.controller.replaceSelection("\n\u0000"), true);
  const refused = await h.flush(); assert.match(refused.error, /InvalidXmlCharacter/);
  assert.equal(h.input.value, originalText);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, beforeRefusal.bytes);
  assert.equal(h.controller.history("redo"), true); assert.equal((await h.flush()).error, undefined);
  assert.deepEqual((await h.send({ kind: "save" })).bytes, saved.bytes);
  const reopened = await h.send({ kind: "load", format: "hwpx", bytes: saved.bytes });
  assert.equal(reopened.error, undefined);
  assert(reopened.content.paragraphs.some(p => p.text === "원첫\n둘문\n\n"));
});

for (const value of [undefined, 0, 2, true]) test(`generated cell soft lines reject unsupported capability ${value} before mutation`, async t => {
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, "instantiate", async (...args) => {
    const instance = await instantiate(...args), exports = { ...instance.exports };
    if (value === undefined) delete exports.hwpx_edit_created_cell_soft_line_breaks;
    else exports.hwpx_edit_created_cell_soft_line_breaks = () => value;
    return { exports };
  });
  const { h, created } = await cell(t);
  assert.equal(created.content.createdTables[0].cells[0].softLineBreakAvailable, undefined);
  const before = await h.send({ kind: "save" }); assert.equal(before.error, undefined);
  const count = h.requests.length;
  assert.equal(h.controller.replaceSelection("첫\r\n끝"), false);
  dispatchCanvasEvent(h.input, "keydown", { key: "Enter", shiftKey: true });
  dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertLineBreak" });
  assert.equal(h.requests.length, count);
  assert.equal(h.input.value, "");
  assert.deepEqual((await h.send({ kind: "save" })).bytes, before.bytes);
  assert.equal(h.controller.replaceSelection("한 줄😀"), true);
  assert.equal((await h.flush()).error, undefined);
  assert.equal(h.input.value, "한 줄😀");
});
