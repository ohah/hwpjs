import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerCanvasHarness, dispatchCanvasEvent } from "./worker-harness.mjs";
import { rowAtPoint } from "../../web/preview/row-geometry.mjs";
import { layoutNoteBodyPages } from "../../web/preview/note-body-page-layout.mjs";

export async function createdBodyNoteCase(t, format) {
  const h = await workerCanvasHarness(t, { paintFrames: true });
  const bytes = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/footnote-endnote.${format === "hwp5" ? "hwp" : "hwpx"}`);
  assert.equal((await h.send({ kind: "load", format, bytes })).error, undefined);
  const enabled = await h.send({ kind: "enable" }); assert.equal(enabled.error, undefined);
  const notes = format === "hwpx" ? enabled.content.paragraphs.filter(p => p.automaticNumberPrefixes?.length)
    : enabled.content.hwp5Notes.map(note => enabled.content.paragraphs.find(p => p.section === note.section && p.paragraph === note.paragraphs[0]));
  assert.equal(notes.length, 4);
  const bodyIds = new Set((enabled.content.currentParagraphFlows ?? enabled.content.paragraphFlows).filter(flow => flow.host === "body").map(flow => flow.paragraph));
  const body = enabled.content.paragraphs.find(p => bodyIds.has(p.paragraph));
  assert(body);
  const resources = Object.fromEntries(Object.entries(enabled.content.tableCreationResources).map(([key, values]) => [key, values[0]]));
  const identities = [];
  let current;
  for (const [index, host] of [body, ...notes].entries()) {
    const position = index > 0 && format === "hwp5" ? 1 : 0;
    assert.equal(h.controller.selectTextRange({ section: host.section, paragraph: host.paragraph, startUnit: position, endUnit: position }), true);
    assert.equal(h.controller.insertTable({ rows: 1, columns: 1, width: 7200, rowHeight: 1800, resources }), true);
    const created = await h.flush(); assert.equal(created.error, undefined);
    identities.push(created.identity);
    assert.equal(h.renderer.layout().pageLayoutMode, "measured-note-created-inline", `${format} target${index}: ${h.renderer.layout().pageLayoutError}`);
    assert.equal(h.input.readOnly, false);
    const text = `혼합${index}😀`;
    dispatchCanvasEvent(h.input, "beforeinput", { inputType: "insertText", data: text });
    h.input.value = text; h.input.setSelectionRange(text.length, text.length);
    dispatchCanvasEvent(h.input, "input");
    current = await h.flush();
    assert.equal(current.error, undefined);
  }
  const layout = h.renderer.layout();
  assert.equal(layout.boxes.length, 5);
  assert.deepEqual(new Set(layout.boxes.map(box => box.createdCell.identity)), new Set(identities));
  for (const box of layout.boxes) {
    const hit = layout.rows[rowAtPoint(layout, box.x + box.width - 1, box.y + box.height - 1)];
    assert.equal(hit.createdCell.identity, box.createdCell.identity);
    assert.equal(hit.pageOrdinal, box.pageOrdinal);
    assert(box.y >= box.referenceBoxes.page.y && box.y + box.height <= box.referenceBoxes.page.y + box.referenceBoxes.page.height);
  }
  for (const host of [body, ...notes]) assert.equal(layout.rows.filter(row => !row.createdCell && row.kind === "text" && row.section === host.section && row.paragraph === host.paragraph).map(row => row.text).join(""), host.text);
  for (const page of layout.pages) {
    const footnotes = layout.rows.filter(row => row.pageOrdinal === page.ordinal && row.noteKind === "footnote");
    if (!footnotes.length) continue;
    const bodyBottom = Math.max(...layout.rows.filter(row => row.pageOrdinal === page.ordinal && row.noteKind !== "footnote").map(row => row.y + row.height));
    assert(bodyBottom <= Math.min(...footnotes.map(row => row.y)), "body and endnotes must not overlap reserved footnotes");
  }
  const duplicate = structuredClone(current.content);
  duplicate.createdTables[1].identity = duplicate.createdTables[0].identity;
  const measure = text => ({ width: [...text].length * 8, height: 16 });
  if (format === "hwpx") {
    assert.equal(layoutNoteBodyPages(duplicate, measure).error, "AmbiguousCreatedTableNoteOwner");
    assert.equal(layoutNoteBodyPages(current.content, measure, 1).state, "unavailable");
  }
  h.paint();
  const saved = await h.send({ kind: "save", allowStaleLayout: true }); assert.equal(saved.error, undefined);
  for (let index = 0; index < 10; index++) assert.equal((await h.send({ kind: "undo" })).error, undefined);
  assert.deepEqual(Buffer.from((await h.send({ kind: "save", allowStaleLayout: true })).bytes), bytes);
  for (let index = 0; index < 10; index++) assert.equal((await h.send({ kind: "redo" })).error, undefined);
  assert.deepEqual((await h.send({ kind: "save", allowStaleLayout: true })).bytes, saved.bytes);
  const reopened = await h.send({ kind: "load", format, bytes: saved.bytes });
  assert.equal(reopened.error, undefined);
  for (let index = 0; index < 5; index++) assert(reopened.content.paragraphs.some(paragraph => paragraph.text === `혼합${index}😀`));
}
