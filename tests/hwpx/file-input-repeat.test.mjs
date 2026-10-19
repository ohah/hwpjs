import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bindFileInput } from "../../web/preview/file-input-events.mjs";

class FileInput extends EventTarget {
  files = [];
  path = "";
  get value() { return this.path; }
  set value(value) { assert.equal(value, ""); this.path = ""; this.files = []; }
  choose(file, dispatch = true) {
    const path = file ? "C:\\fakepath\\" + file.name : "";
    if (path === this.path) return false;
    this.path = path; this.files = file ? [file] : [];
    if (dispatch) this.dispatchEvent(new Event("change"));
    return true;
  }
}

test("same local file can be selected twice after its File object is handed off", () => {
  const input = new FileInput(), file = { name: "document.hwpx" }, seen = [];
  bindFileInput(input, () => seen.push(input.files[0]));
  assert.equal(input.choose(file), true);
  assert.equal(input.value, "");
  assert.equal(input.files.length, 0);
  assert.equal(input.choose(file), true);
  assert.deepEqual(seen, [file, file]);
});

test("preselected files use the same handoff and reset path", () => {
  const input = new FileInput(), file = { name: "early.hwp" }, seen = [];
  input.choose(file, false);
  bindFileInput(input, () => seen.push(input.files[0]));
  assert.deepEqual(seen, [file]);
  assert.equal(input.value, "");
  assert.equal(input.choose(file), true);
  assert.deepEqual(seen, [file, file]);
});

test("file bytes remain available asynchronously after native selection is cleared", async () => {
  const input = new FileInput(), file = new File([new Uint8Array([1, 2, 3])], "bytes.hwp"), reads = [];
  bindFileInput(input, () => {
    const selected = input.files[0];
    reads.push(Promise.resolve().then(() => selected.arrayBuffer()));
  });
  input.choose(file); input.choose(file);
  assert.equal(input.files.length, 0);
  assert.deepEqual((await Promise.all(reads)).map(bytes => [...new Uint8Array(bytes)]), [[1, 2, 3], [1, 2, 3]]);
});

test("an independently superseding selection is not cleared by the older handoff", () => {
  const input = new FileInput(), first = { name: "first.hwp" }, second = { name: "second.hwpx" };
  bindFileInput(input, () => input.choose(second, false));
  input.choose(first);
  assert.equal(input.files[0], second);
  assert(input.value.endsWith("second.hwpx"));
});

test("a failed initial callback still permits selecting that file again", () => {
  const input = new FileInput(), file = { name: "retry.hwp" };
  input.choose(file, false);
  assert.throws(() => bindFileInput(input, () => { throw Error("load refused"); }), /load refused/);
  assert.equal(input.value, "");
  assert.equal(input.files.length, 0);
});

test("empty file change returns before replacing the active document generation", () => {
  const source = readFileSync(new URL("../../web/preview/app.mjs", import.meta.url), "utf8");
  assert.match(source, /async function openSelectedFile\(selected,[^\n]*\n\s*if \(!selected\) return;\n\s*const epoch = \+\+generation;/);
});

test("shared browser audit checks same-path reload and empty change without bypassing the picker", () => {
  const source = readFileSync(new URL("../../tools/browser/document-menu-roundtrip.mjs", import.meta.url), "utf8");
  for (const witness of ["LocalFileHandoffMustClearSelection", "SameFileMustOpenANewSession", "same-local-file-reopened", "EmptyFileChangeMustPreserveCurrentEdit", "empty-file-change-preserved-edit"]) assert(source.includes(witness));
  assert(source.includes('sourcePaths.push("web/preview/file-input-events.mjs")'));
});
