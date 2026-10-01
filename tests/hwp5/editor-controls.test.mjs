import assert from "node:assert/strict";
import test from "node:test";
import { createEditorControls } from "../../web/preview/editor-controls.mjs";

test("editor controls retain rejected edits but lock after committed display failure", t => {
  const nodes = new Map(["#editor-panel", "#enable-edit", "#edit-fields", "#edit-status", "#edit-form", "#format-button"].map(key => [key, Object.assign(new EventTarget(), { textContent: "" })]));
  nodes.get("#edit-form").elements = { charShapeId: {} };
  const original = globalThis.document;
  globalThis.document = { querySelector: key => nodes.get(key) };
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  const controls = createEditorControls(() => {}), panel = nodes.get("#editor-panel"), enable = nodes.get("#enable-edit"), fields = nodes.get("#edit-fields");
  controls.reset(); assert(panel.hidden); assert(fields.disabled);
  controls.loaded(); assert(!panel.hidden); assert(!enable.disabled);
  controls.message({ kind: "enable", charShapeCount: 7 }); assert(enable.disabled); assert(!fields.disabled);
  controls.message({ kind: "splice", error: "SplitSurrogatePair", applied: false }); assert(!fields.disabled);
  controls.message({ kind: "splice", error: "DisplayFailed", applied: true }); assert(fields.disabled); assert(enable.disabled);
  controls.reset(); controls.loaded(); assert(!enable.disabled); assert(fields.disabled);
});
