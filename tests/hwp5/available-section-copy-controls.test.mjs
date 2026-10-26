import test from "node:test";
import assert from "node:assert/strict";
import {
  createAvailableSectionCopyControls,
  availableSectionCopySummary,
} from "../../web/preview/available-section-copy-controls.mjs";

const reply = { kind: "load", error: "SectionCountMismatch", availableSectionCopyAvailable: true };
const content = {
  format: "hwp5",
  readOnly: false,
  normalizationInfo: {
    normalized: true,
    historyBaseline: "available-sections-copy",
    missingContentRecovered: false,
    sectionInventory: { declared: 2, available: 1, mismatch: true },
  },
};
function harness(confirm, reopen) {
  const handlers = new Map(),
    note = { textContent: "" };
  const button = {
    hidden: false,
    disabled: false,
    addEventListener(kind, fn) {
      handlers.set(kind, fn);
    },
    removeEventListener(kind, fn) {
      assert.equal(handlers.get(kind), fn);
      handlers.delete(kind);
    },
    click() {
      handlers.get("click")?.();
    },
  };
  const controls = createAvailableSectionCopyControls({ button, note, confirm, reopen });
  return { controls, button, note, handlers };
}

test("copy choice requires exact capability and explicit consent and preserves original selection on cancel", () => {
  let accepted = false,
    prompts = 0;
  const calls = [],
    source = Object.freeze({ name: "original.hwp" });
  const h = harness(
    (message) => {
      prompts++;
      assert(message.includes("복원되지"));
      assert(message.includes("원본 파일은 변경하지"));
      return accepted;
    },
    (file) => calls.push(file),
  );
  for (const bad of [
    { ...reply, kind: "save" },
    { ...reply, error: "InvalidFat" },
    { ...reply, availableSectionCopyAvailable: "true" },
    { kind: "load", error: "SectionCountMismatch" },
  ])
    assert.equal(h.controls.offer(source, bad), false);
  assert.equal(h.controls.offer(source, reply), true);
  assert.deepEqual(calls, []);
  h.button.click();
  assert.equal(prompts, 1);
  assert.equal(h.button.hidden, false);
  assert(h.note.textContent.includes("취소"));
  assert.deepEqual(calls, []);
  accepted = true;
  h.button.click();
  h.button.click();
  assert.deepEqual(calls, [source]);
  assert.equal(prompts, 2);
  h.controls.loaded(content);
  assert(h.note.textContent.includes("선언 2구역"));
  assert(h.note.textContent.includes("저장된 1구역"));
  assert(h.note.textContent.includes("저장·실행 취소 기준"));
  h.controls.close();
  assert.equal(h.handlers.size, 0);
});

test("stale consent and failures cannot reopen another file or overwrite its warning", async () => {
  let h, reject;
  h = harness(
    () => {
      h.controls.reset();
      return true;
    },
    () => assert.fail("stale consent"),
  );
  h.controls.offer({}, reply);
  h.button.click();
  assert.equal(h.note.textContent, "");
  h.controls.close();
  h = harness(
    () => true,
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  h.controls.offer({}, reply);
  h.button.click();
  h.controls.loaded({ format: "hwpx" });
  reject(new Error("old"));
  await Promise.resolve();
  assert.equal(h.note.textContent, "");
  h.controls.offer({}, reply);
  h.button.click();
  reject(new Error("current"));
  await Promise.resolve();
  assert(h.note.textContent.includes("current"));
  h.controls.close();
  assert.equal(h.controls.offer({}, reply), false);
});

test("copy summary rejects misleading recovered metadata and clears on ordinary load", () => {
  assert.equal(availableSectionCopySummary({ format: "hwpx" }), null);
  for (const changes of [
    { normalized: false },
    { missingContentRecovered: true },
    { sectionInventory: { declared: 1, available: 1, mismatch: false } },
    { sectionInventory: { declared: 2, available: 1, mismatch: false } },
  ])
    assert.throws(() =>
      availableSectionCopySummary({
        ...content,
        normalizationInfo: { ...content.normalizationInfo, ...changes },
      }),
    );
  assert.throws(() => availableSectionCopySummary({ ...content, readOnly: true }));
  assert.throws(() => availableSectionCopySummary({ ...content, format: "hwpx" }));
});
