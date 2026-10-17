import test from "node:test";
import assert from "node:assert/strict";
import { presentSaveFailure } from "../../web/preview/save-failure-guidance.mjs";

test("layout refusal reveals explicit consent without selecting it or sending commands", () => {
  const note = { textContent: "" }, actions = [], label = { hidden: false, scrollIntoView: options => actions.push(["scroll-label", options]) };
  const consent = { checked: false, disabled: false, closest: () => label,
    focus: options => actions.push(["focus", options]), scrollIntoView: () => assert.fail("checkbox-only scrolling clips the warning text") };
  const message = { kind: "save", error: "LayoutReflowRequired" }, before = structuredClone(message);
  assert.equal(presentSaveFailure(note, message, { format: "hwp5", consent }), true);
  assert.match(note.textContent, /재계산되지 않았습니다/);
  assert.match(note.textContent, /직접 선택한 뒤 다시 저장/);
  assert.deepEqual(actions, [["focus", { preventScroll: true }], ["scroll-label", { block: "center", inline: "nearest" }]]);
  assert.equal(consent.checked, false);
  assert.deepEqual(message, before);
});

test("other formats errors hidden disabled and unready consent never steal focus", () => {
  for (const format of ["hwp5", "hwpx", null]) for (const error of ["LayoutReflowRequired", "NativeRefused"]) {
    for (const disabled of [false, true]) for (const hidden of [false, true]) {
      let actions = 0;
      const note = { textContent: "" }, consent = { disabled, checked: false, closest: () => ({ hidden, scrollIntoView() { actions++; } }), focus() { actions++; }, scrollIntoView() { assert.fail("scroll the complete label"); } };
      presentSaveFailure(note, { kind: "save", error }, { format, consent });
      const guided = format === "hwp5" && error === "LayoutReflowRequired" && !disabled && !hidden;
      assert.equal(actions, guided ? 2 : 0);
      assert.equal(consent.checked, false);
      assert.equal(note.textContent.includes("직접 선택"), guided);
    }
  }
  for (const message of [null, {}, { kind: "load", error: "LayoutReflowRequired" }, { kind: "save" }]) {
    const note = { textContent: "unchanged" };
    assert.equal(presentSaveFailure(note, message, { format: "hwp5", consent: null }), false);
    assert.equal(note.textContent, "unchanged");
  }
  for (const consent of [null, { disabled: false, closest: () => null }]) {
    const note = { textContent: "" };
    assert.equal(presentSaveFailure(note, { kind: "save", error: "LayoutReflowRequired" }, { format: "hwp5", consent }), true);
    assert.equal(note.textContent, "저장 실패: LayoutReflowRequired");
  }
});
