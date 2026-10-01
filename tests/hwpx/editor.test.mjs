import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`);

test("HWPX product editor opens all tracked unencrypted fixtures and preserves no-op ZIP", async () => {
  const paths = execFileSync("git", ["ls-files", "-z"]).toString().split("\0")
    .filter(path => path.includes("/fixtures/") && path.endsWith(".hwpx"));
  assert.equal(paths.length, 45);
  const editor = await createHwpxEditor(wasm);
  let opened = 0, encrypted = 0;
  try {
    for (const path of paths) {
      const input = readFileSync(path);
      if (path.endsWith("/password-12345.hwpx")) {
        assert.throws(() => editor.open(input), { message: "EncryptedDocument" });
        encrypted++;
      } else {
        assert(editor.open(input).sectionCount > 0, path);
        assert.deepEqual(Buffer.from(editor.save()), input, path);
        opened++;
      }
    }
    assert.equal(opened, 44); assert.equal(encrypted, 1);
  } finally { editor.close(); }
});

test("HWPX product editor preserves failed reopen and restores original ZIP", async () => {
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  const input = fixture("charshape");
  try {
    assert.throws(() => editor.save(), { message: "EditorNotOpen" });
    assert.deepEqual(editor.open(input), { sectionCount: 1 });
    assert.equal(editor.canEdit(0, 1), false);
    assert.equal(editor.canEdit(0, 2), true);
    assert.throws(() => editor.canEdit(1, 2), { message: "InvalidSectionIndex" });
    assert.deepEqual(Buffer.from(editor.save()), input);
    editor.splice(0, 2, 0, 0, "검증😀<&\r");
    const saved = editor.save();
    const events = reader.readTextEvents(saved).events;
    const text = events.filter(e => e.kind === "content" && e.paragraph === 2).map(e => e.value).join("");
    assert(text.startsWith("검증😀<&\r"));
    assert.throws(() => editor.open(fixture("password-12345")), { message: "EncryptedDocument" });
    assert.deepEqual(editor.save(), saved);
    assert.throws(() => editor.splice(0, 2, 3, 0, "x"), { message: "SplitSurrogatePair" });
    assert.deepEqual(editor.save(), saved);
    editor.splice(0, 2, 0, 7, "");
    assert.deepEqual(Buffer.from(editor.save()), input);
  } finally { editor.close(); reader.close(); }
  editor.close();
  assert.throws(() => editor.save(), { message: "EditorClosed" });
});

test("HWPX editor rejects JS coercions before mutating native state", async () => {
  const editor = await createHwpxEditor(wasm);
  try {
    editor.open(fixture("charshape"));
    const before = editor.save();
    for (const value of [-1, 0.5, NaN, Infinity, 0x100000000, "0"]) {
      assert.throws(() => editor.splice(value, 2, 0, 0, "x"), { message: "InvalidInteger" });
    }
    assert.throws(() => editor.splice(0, 2, 0, 0, "\ud800"), { message: "InvalidText" });
    assert.deepEqual(editor.save(), before);
  } finally { editor.close(); }
});

test("saved HWPX reopens as independently owned editable state", async () => {
  const first = await createHwpxEditor(wasm), second = await createHwpxEditor(wasm);
  const reader = await createHwpxReader(wasm);
  try {
    first.open(fixture("charshape"));
    first.splice(0, 2, 0, 0, "첫😀");
    const bytes = first.save(), preserved = bytes.slice();
    second.open(bytes);
    bytes.fill(0);
    assert.deepEqual(second.save(), preserved);
    second.splice(0, 2, 0, 3, "다음");
    const events = reader.readTextEvents(second.save()).events;
    assert(events.filter(e => e.kind === "content" && e.paragraph === 2).map(e => e.value).join("").startsWith("다음"));
    assert.deepEqual(first.save(), preserved);
    first.close();
    second.splice(0, 2, 0, 2, "");
    assert.equal(second.canEdit(0, 2), true);
  } finally { first.close(); second.close(); reader.close(); }
});
