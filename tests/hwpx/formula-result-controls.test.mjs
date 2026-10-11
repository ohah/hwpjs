import test from "node:test";
import assert from "node:assert/strict";
import { createFormulaControls } from "../../web/preview/formula-controls.mjs";

function setup() {
  const form = new EventTarget(), choices = new EventTarget(), input = {}, note = {}, fields = {}, definitionApply = {};
  const result = { fields: {}, input: new EventTarget(), apply: new EventTarget() }, requests = [];
  let ready = true;
  form.reportValidity = () => true;
  choices.ownerDocument = { createElement: () => ({}) };
  choices.replaceChildren = (...nodes) => { choices.value = nodes[0]?.value ?? ""; };
  const controls = createFormulaControls({ form, fields, choices, input, note, definitionApply, result, ready: () => ready, request: value => { requests.push(value); return true; } });
  const first = { section: 0, beginElement: 7, formula: "=SUM(A1:A2)", last_result: "4" };
  const content = { formulas: [first], formulaDefinitionAvailable: true, manualFormulaResultAvailable: true };
  controls.message({ kind: "load", content });
  return { controls, form, fields, choices, input, note, result, definitionApply, requests, content, first, ready: value => { ready = value; } };
}

test("manual result controls require capability enabled session readiness and target", () => {
  const s = setup();
  s.result.apply.dispatchEvent(new Event("click"));
  assert.equal(s.requests.length, 0);
  s.controls.message({ kind: "enable", content: s.content });
  s.ready(false); s.result.apply.dispatchEvent(new Event("click"));
  assert.equal(s.requests.length, 0);
  s.ready(true); s.result.input.value = ""; s.result.apply.dispatchEvent(new Event("click"));
  assert.deepEqual(s.requests[0], { kind: "manual-formula-result", origin: "formula", section: 0, beginElement: 7, display: "" });
  s.controls.message({ kind: "splice", content: { ...s.content, manualFormulaResultAvailable: false } });
  assert.equal(s.result.fields.hidden, true);
  s.result.apply.dispatchEvent(new Event("click"));
  assert.equal(s.requests.length, 1);
  s.controls.message({ kind: "unlock", content: s.content });
  assert.equal(s.result.fields.disabled, true);
  s.controls.close(); s.controls.close();
  s.controls.message({ kind: "enable", content: s.content });
  s.result.apply.dispatchEvent(new Event("click"));
  assert.equal(s.requests.length, 1);
});

test("manual result drafts preserve exact identity and yield to current results and history", () => {
  const s = setup();
  s.controls.message({ kind: "enable", content: s.content });
  s.result.input.value = "draft";
  s.controls.message({ kind: "splice", content: s.content });
  assert.equal(s.result.input.value, "draft");
  s.controls.message({ kind: "manual-formula-result", error: "LimitExceeded", content: s.content });
  assert.equal(s.result.input.value, "draft");
  assert.match(s.note.textContent, /LimitExceeded/);
  for (const kind of ["manual-formula-result", "formula-definition", "undo", "redo"]) {
    s.result.input.value = "draft";
    s.controls.message({ kind, content: s.content });
    assert.equal(s.result.input.value, "4", kind);
  }
  const other = { ...s.first, section: 1, last_result: "8" };
  s.controls.message({ kind: "splice", content: { ...s.content, formulas: [s.first, other] } });
  s.controls.selectCanvas(other);
  assert.equal(s.result.input.value, "8");
  s.result.input.value = "draft";
  s.controls.message({ kind: "splice", content: { ...s.content, formulas: [s.first] } });
  assert.equal(s.result.input.value, "4");
});

test("manual result capability is independent of definition capability and Enter respects IME", () => {
  const s = setup(), content = { ...s.content, formulaDefinitionAvailable: false };
  s.controls.message({ kind: "enable", content });
  assert.equal(s.fields.disabled, false);
  assert.equal(s.definitionApply.disabled, true);
  s.form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.equal(s.requests.length, 0);
  const enter = composing => { const event = new Event("keydown", { cancelable: true }); Object.assign(event, { key: "Enter", isComposing: composing }); s.result.input.dispatchEvent(event); return event; };
  assert.equal(enter(true).defaultPrevented, false);
  assert.equal(s.requests.length, 0);
  s.result.input.value = "수동😀";
  assert.equal(enter(false).defaultPrevented, true);
  assert.equal(s.requests[0].display, "수동😀");
  s.controls.close();
  enter(false);
  assert.equal(s.requests.length, 1);
});
