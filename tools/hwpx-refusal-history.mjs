import assert from "node:assert/strict";

// Called only after the caller has independently classified a refused command.
export function verifyRefusalHistory(editor, { original, previousEdited, revision, context }) {
  assert.equal(editor.historyRevision(), revision, `${context}: refusal changed revision`);
  assert.deepEqual(Buffer.from(editor.save()), original, `${context}: refusal changed source`);
  assert.equal(editor.undo(), false, `${context}: refusal created undo entry`);
  assert.equal(editor.historyRevision(), revision, `${context}: empty undo changed revision`);
  assert.equal(editor.redo(), previousEdited !== null, `${context}: refusal changed redo availability`);
  if (previousEdited !== null) {
    assert.deepEqual(Buffer.from(editor.save()), previousEdited, `${context}: refusal changed redo checkpoint`);
    assert.equal(editor.undo(), true, `${context}: redo checkpoint cannot be undone`);
    assert.deepEqual(Buffer.from(editor.save()), original, `${context}: redo undo changed source`);
    assert.equal(editor.historyRevision(), revision, `${context}: redo undo changed revision`);
  }
}
