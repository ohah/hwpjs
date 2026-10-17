import test from "node:test";
import assert from "node:assert/strict";
import { createEditorControls } from "../../web/preview/editor-controls.mjs";
import { prepareNormalizationEnable, NORMALIZATION_WARNING } from "../../web/preview/normalization-consent.mjs";

test("normalization consent requires exact acceptance and does not affect edits", () => {
  for (const answer of [false, undefined, "yes", 1]) assert.equal(prepareNormalizationEnable({ kind: "enable" }, true, warning => { assert.equal(warning, NORMALIZATION_WARNING); return answer; }), null);
  assert.deepEqual(prepareNormalizationEnable({ kind: "enable" }, true, () => true), { kind: "enable", normalizeObservedCfb: true });
  const edit = { kind: "splice" };
  assert.equal(prepareNormalizationEnable(edit, true, () => { throw Error("UnexpectedPrompt"); }), edit);
  assert.deepEqual(prepareNormalizationEnable({ kind: "enable", distribution: true }, true, () => true), { kind: "enable", distribution: true, normalizeObservedCfb: true });
});

test("editor button cancellation leaves ready state unchanged and reset clears consent requirement", t => {
  const nodes = new Map(["#editor-panel", "#enable-edit", "#edit-fields", "#edit-status", "#edit-form", "#format-button"].map(key => [key, Object.assign(new EventTarget(), { textContent: "" })]));
  nodes.get("#edit-form").elements = { charShapeId: { value: "0", reportValidity: () => true } };
  const previous = globalThis.document;
  globalThis.document = { querySelector: key => nodes.get(key) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const sent = []; let accepted = false, prompts = 0;
  const controls = createEditorControls(message => sent.push(message), { confirmNormalization: warning => { prompts++; assert.equal(warning, NORMALIZATION_WARNING); return accepted; } });
  controls.reset(); controls.loaded({ normalization: true });
  nodes.get("#enable-edit").dispatchEvent(new Event("click"));
  assert.equal(sent.length, 0); assert.equal(controls.busy(), false); assert.equal(controls.ready(), false);
  assert.equal(nodes.get("#enable-edit").disabled, false);
  accepted = true; nodes.get("#enable-edit").dispatchEvent(new Event("click"));
  assert.deepEqual(sent, [{ kind: "enable", normalizeObservedCfb: true }]);
  assert.equal(controls.busy(), true);
  nodes.get("#enable-edit").dispatchEvent(new Event("click")); assert.equal(prompts, 2);
  controls.reset(); controls.loaded(); controls.request({ kind: "enable" });
  assert.deepEqual(sent.at(-1), { kind: "enable" }); assert.equal(prompts, 2);
  controls.reset(); controls.loaded({ distribution: true, normalization: true });
  accepted = false;
  const count = sent.length;
  controls.request({ kind: "enable" });
  assert.equal(sent.length, count);
  assert.equal(controls.busy(), false);
  accepted = true;
  controls.request({ kind: "enable" });
  assert.deepEqual(sent.at(-1), { kind: "enable", distribution: true, normalizeObservedCfb: true });
  controls.reset(); controls.loaded(); controls.request({ kind: "enable" });
  assert.deepEqual(sent.at(-1), { kind: "enable" });
});
