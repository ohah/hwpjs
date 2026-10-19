import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const expected = new Map([
  ["menu-insert-table", 'document.querySelector("#table-creation-focus")'],
  ["menu-insert-page-break", '{ get disabled() { return direct?.canInsertParagraphBreak() !== true; }, click: () => direct.insertParagraphBreak("page") }'],
  ["menu-insert-column-break", '{ get disabled() { return direct?.canInsertParagraphBreak() !== true; }, click: () => direct.insertParagraphBreak("column") }'],
  ["menu-open", "input"], ["menu-save", "download"],
  ["menu-undo", 'document.querySelector("#undo")'],
  ["menu-redo", 'document.querySelector("#redo")'],
  ["menu-find", '{ click: () => findControls.focus() }'],
  ["menu-copy", '{ get disabled() { return direct?.canTransferSelection() !== true; }, click: () => direct.transferSelection() }'],
  ["menu-cut", '{ get disabled() { return direct?.canTransferSelection(true) !== true; }, click: () => direct.transferSelection({ cut: true }) }'],
  ["menu-paste", '{ get disabled() { return direct?.canPasteSelection() !== true; }, click: () => direct.pasteSelection() }'],
  ["menu-delete", '{ get disabled() { return direct?.canDeleteSelection() !== true; }, click: () => direct.deleteSelection() }'],
  ["menu-properties", 'document.querySelector("#inspector-toggle")'],
  ["menu-bold", 'document.querySelector("#canvas-bold-toggle")'],
  ["menu-italic", 'document.querySelector("#canvas-italic-toggle")'],
  ["menu-underline", 'document.querySelector("#canvas-underline-toggle")'],
  ["menu-strike", 'document.querySelector("#canvas-strike-toggle")'],
  ["menu-align-left", `document.querySelector('#paragraph-format-form [data-alignment="LEFT"]')`],
  ["menu-align-center", `document.querySelector('#paragraph-format-form [data-alignment="CENTER"]')`],
  ["menu-align-right", `document.querySelector('#paragraph-format-form [data-alignment="RIGHT"]')`],
  ["menu-align-justify", `document.querySelector('#paragraph-format-form [data-alignment="JUSTIFY"]')`],
  ["menu-align-distribute", `document.querySelector('#paragraph-format-form [data-alignment="DISTRIBUTE"]')`],
  ["menu-align-space", `document.querySelector('#paragraph-format-form [data-alignment="DISTRIBUTE_SPACE"]')`],
]);
function verifyWiring(html, app) {
  const block = app.match(/documentMenuControls = createDocumentMenuControls\(\[([\s\S]*?)\]\);/);
  assert(block, "missing menu authority");
  const entries = [...block[1].matchAll(/\{ button: document\.querySelector\("#([^"]+)"\), target: ([^\n]+) \},/g)];
  assert.equal(entries.length, expected.size, "missing or extra menu binding");
  const seen = new Set();
  for (const [, id, target] of entries) {
    assert(expected.has(id), "unknown menu binding");
    assert(!seen.has(id), "duplicate menu binding"); seen.add(id);
    assert.equal(target, expected.get(id), "wrong command authority");
    assert.equal(html.match(new RegExp(`id="${id}"`, "g"))?.length, 1, "missing or duplicate DOM id");
  }
}
test("all document menu entries bind once to the existing control authority", () => {
  const html = readFileSync(new URL("../../web/preview/index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../web/preview/app.mjs", import.meta.url), "utf8");
  verifyWiring(html, app);
  assert.throws(() => verifyWiring(html, app.replace('target: download },', 'target: input },')), /wrong command authority/);
  assert.throws(() => verifyWiring(html.replace('id="menu-save"', 'id="menu-open"'), app), /duplicate DOM id/);
  assert.throws(() => verifyWiring(html, app.replace('"#menu-redo"', '"#menu-undo"')), /duplicate menu binding/);
  assert.throws(() => verifyWiring(html, app.replace('target: document.querySelector("#table-creation-focus")', 'target: document.querySelector("#table-creation-submit")')), /wrong command authority/);
  assert.throws(() => verifyWiring(html, app.replace(/^.*button: document.querySelector\("#menu-insert-table"\).*\n/m, '')), /missing or extra menu binding/);
});
