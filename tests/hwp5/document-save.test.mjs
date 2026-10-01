import test from "node:test";
import assert from "node:assert/strict";
import { saveDocument } from "../../web/preview/document-save.mjs";
import { downloadDocument } from "../../web/preview/document-download.mjs";
import { guardGeneration } from "../../web/preview/worker-generation.mjs";

test("file generation rejects late successful downloads and worker failures equally", () => {
  let generation = 1, ready = true, downloads = 0;
  const oldError = guardGeneration(() => generation, 1, () => { ready = false; });
  const oldSave = guardGeneration(() => generation, 1, () => { downloads++; });
  generation = 2;
  oldError({ message: "OldWorkerFailed" }); oldSave({ bytes: new Uint8Array([1]) });
  assert.equal(ready, true); assert.equal(downloads, 0);
  guardGeneration(() => generation, 2, () => { downloads++; })({});
  assert.equal(downloads, 1);
  guardGeneration(() => generation, 2, () => { ready = false; })({});
  assert.equal(ready, false);
});

test("document save delegates only to native snapshot with explicit stale layout permission", () => {
  const calls = [], bytes = new Uint8Array([1, 2]);
  const editor = { save(options) { calls.push(options); return { bytes, layoutRequiresReflow: true }; } };
  assert.deepEqual(saveDocument(editor, "hwp5"), { bytes, format: "hwp5", layoutRequiresReflow: true });
  assert.deepEqual(calls, [{ allowStaleLayout: false }]);
  saveDocument(editor, "hwp5", true);
  assert.deepEqual(calls[1], { allowStaleLayout: true });
  assert.throws(() => saveDocument(editor, "hwp5", "true"), /InvalidStaleLayoutPolicy/);
  assert.throws(() => saveDocument(editor, "unknown"), /UnknownDocumentFormat/);
  assert.equal(calls.length, 2);
  assert.throws(() => saveDocument(null, "hwpx"), /EditorNotOpen/);
  assert.deepEqual(saveDocument({ save: () => bytes }, "hwpx"), { bytes, format: "hwpx", layoutRequiresReflow: true });
  assert.throws(() => saveDocument({ save() { throw new Error("SaveFailed"); } }, "hwpx"), /SaveFailed/);
});

test("download copies native snapshot to a sanitized name and cleans URLs on click failure", () => {
  for (const failure of [false, true]) {
    const calls = [], link = { click() { calls.push("click"); if (failure) throw new Error("BlockedDownload"); }, remove() { calls.push("remove"); } };
    let cleanup;
    const browser = { Blob, document: { createElement: () => link, body: { append: () => calls.push("append") } }, URL: { createObjectURL: blob => { assert.equal(blob.size, 2); return "blob:test"; }, revokeObjectURL: url => calls.push(url) }, setTimeout(fn, delay) { assert.equal(delay, 1000); cleanup = fn; } };
    const action = () => downloadDocument({ bytes: new Uint8Array([1, 2]), format: "hwpx" }, "../bad\u0000.HWPX", browser);
    if (failure) assert.throws(action, /BlockedDownload/); else action();
    assert.equal(link.download, "bad.edited.hwpx");
    assert.equal(link.href, "blob:test");
    assert.deepEqual(calls, ["append", "click", "remove"]);
    cleanup(); assert.equal(calls.at(-1), "blob:test");
  }
  for (const snapshot of [{ bytes: new Uint8Array(), format: "hwp5" }, { bytes: [1], format: "hwpx" }, { bytes: new Uint8Array([1]), format: "other" }]) assert.throws(() => downloadDocument(snapshot, "file"));
});
