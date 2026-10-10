import assert from "node:assert/strict";
import test from "node:test";
import { verifyRefusalHistory } from "../../tools/hwpx-refusal-history.mjs";

function fixture(hasRedo, defect) {
  const original = Buffer.from("original"), edited = Buffer.from("edited");
  let current = original, revision = defect === "revision" ? 9 : 0;
  let redone = false;
  const editor = {
    historyRevision: () => revision,
    save: () => defect === "source" ? Buffer.from("corrupt") : current,
    undo() {
      if (defect === "undo") return true;
      if (!redone) return false;
      redone = false; current = original; revision = defect === "restored-revision" ? 2 : 0;
      return true;
    },
    redo() {
      if (defect === "redo") return !hasRedo;
      if (!hasRedo) return false;
      redone = true; current = defect === "checkpoint" ? Buffer.from("wrong") : edited; revision = 1;
      return true;
    },
  };
  return { editor, expected: { original, previousEdited: hasRedo ? edited : null, revision: 0, context: "fixture" } };
}

test("refusal history preserves empty and existing redo checkpoints", () => {
  for (const hasRedo of [false, true]) {
    const { editor, expected } = fixture(hasRedo);
    verifyRefusalHistory(editor, expected);
    assert.deepEqual(editor.save(), expected.original);
    assert.equal(editor.historyRevision(), 0);
  }
});

test("refusal history rejects revision/source/undo/redo/checkpoint mutations", () => {
  for (const defect of ["revision", "source", "undo", "redo", "checkpoint", "restored-revision"]) {
    const { editor, expected } = fixture(true, defect);
    assert.throws(() => verifyRefusalHistory(editor, expected), { code: "ERR_ASSERTION" }, defect);
  }
});
