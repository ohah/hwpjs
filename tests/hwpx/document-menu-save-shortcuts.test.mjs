import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSaveShortcutProof,
  changedDownloadNames,
} from "../../tools/browser/save-shortcuts.mjs";

test("browser save proof requires trusted consumed keys with the exact modifier", () => {
  for (const modifier of ["Control", "Meta"]) {
    const proof = {
      key: "s",
      trusted: true,
      consumed: true,
      ctrl: modifier === "Control",
      meta: modifier === "Meta",
    };
    assert.doesNotThrow(() => assertSaveShortcutProof(proof, modifier));
    for (const patch of [
      { key: "x" },
      { trusted: false },
      { consumed: false },
      { ctrl: !proof.ctrl },
      { meta: !proof.meta },
    ]) {
      assert.throws(
        () => assertSaveShortcutProof({ ...proof, ...patch }, modifier),
        /SaveShortcut/,
      );
    }
    for (const key of [null, 42, undefined])
      assert.throws(
        () => assertSaveShortcutProof({ ...proof, key }, modifier),
        /SaveShortcutWrongKey/,
      );
    assert.throws(() => assertSaveShortcutProof(proof, "Alt"), /SaveShortcutInvalidModifier/);
  }
});

test("save proof detects overwritten download names but rejects unchanged old files", () => {
  const original = new Map([["document.edited.hwpx", "inode:21:100:100"]]);
  assert.deepEqual(changedDownloadNames(original, new Map(original)), []);
  assert.deepEqual(
    changedDownloadNames(original, new Map([["document.edited.hwpx", "inode:21:101:101"]])),
    ["document.edited.hwpx"],
  );
  assert.deepEqual(
    changedDownloadNames(
      original,
      new Map([...original, ["other.edited.hwpx", "other:21:102:102"]]),
    ),
    ["other.edited.hwpx"],
  );
});
