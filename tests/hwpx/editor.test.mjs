import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";

const wasm = readFileSync("zig-out/bin/hwpjs.wasm");
const fixture = name => readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwpx`);

test("public HWPX refuses paired tabs containing otherwise unowned character data", async () => {
  const script = [
    "import io,re,sys,zipfile",
    "source=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))",
    "output=io.BytesIO()",
    "with zipfile.ZipFile(output,'w') as result:",
    "  for entry in source.infolist():",
    "    data=source.read(entry)",
    "    if entry.filename=='Contents/section0.xml': data,count=re.subn(rb'(<hp:tab\\b[^>]*?)/>',rb'\\1>hidden</hp:tab>',data,count=1)",
    "    result.writestr(entry,data)",
    "  result.comment=source.comment",
    "if count!=1: raise ValueError('Fixture topology drift')",
    "sys.stdout.buffer.write(output.getvalue())",
  ].join("\n");
  const derived = execFileSync("python3", ["-c", script], { input: fixture("tabdef") });
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  try {
    editor.open(derived);
    assert(reader.readTextEvents(derived).events.some(e => e.kind === "content" && e.value === "hidden"));
    assert.equal(editor.canEdit(0, 1), false);
    // This paragraph has only tabs: unsupported paired content prevents
    // materializing any owned text site, so refusal occurs at ownership first.
    assert.throws(() => editor.splice(0, 1, 0, 0, "new"), { message: "MissingTextSite" });
    assert.deepEqual(Buffer.from(editor.save()), derived);
  } finally { editor.close(); reader.close(); }
});

test("actual HWPX tabs retain source through boundary edits and refused deletion", async () => {
  const editor = await createHwpxEditor(wasm), reader = await createHwpxReader(wasm);
  const input = fixture("tabdef");
  const text = bytes => reader.readTextEvents(bytes).events.filter(e => e.paragraph === 1)
    .map(e => e.kind === "content" ? e.value : e.kind === "inline_empty" && e.inlineKind === "tab" ? "\t" : "").join("");
  try {
    editor.open(input);
    assert.equal(editor.canEdit(0, 1), true);
    assert.equal(text(input), "\t\t\t");
    for (const position of [0, 1, 2, 3]) {
      editor.splice(0, 1, position, 0, "한😀");
      const saved = editor.save();
      assert.equal(text(saved), "\t".repeat(position) + "한😀" + "\t".repeat(3 - position));
      const oracle = JSON.stringify({ before: input.toString("base64"), after: Buffer.from(saved).toString("base64"), position, text: "한😀" });
      for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "tools/hwpx-tab-edit-oracle.py"], { input: oracle });
      const tab = position === 0 ? 3 : 0;
      assert.throws(() => editor.splice(0, 1, tab, 1, ""), { message: "ProtectedInlineControl" });
      assert.deepEqual(editor.save(), saved);
      editor.splice(0, 1, position, 3, "");
      assert.deepEqual(Buffer.from(editor.save()), input);
    }
  } finally { editor.close(); reader.close(); }
});

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
    assert.equal(editor.canEdit(0, 1), true);
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

test("column metadata paragraph edit matches independent Python XML and ZIP decoder", async () => {
  const editor = await createHwpxEditor(wasm);
  const original = fixture("charshape");
  try {
    editor.open(original);
    editor.splice(0, 1, 0, 0, "검증😀<&\r");
    const saved = editor.save();
    const script = [
      "import base64, io, json, sys, zipfile",
      "import runpy",
      "compare_text_edit=runpy.run_path('tools/zip-replacement-oracle.py')['compare_text_edit']",
      "data=json.load(sys.stdin)",
      "before=zipfile.ZipFile(io.BytesIO(base64.b64decode(data['before'])))",
      "after=zipfile.ZipFile(io.BytesIO(base64.b64decode(data['after'])))",
      "if before.namelist()!=after.namelist() or after.testzip() is not None: raise ValueError('ZIP mismatch')",
      "for entry in before.infolist():",
      "  if entry.filename=='Contents/section0.xml': compare_text_edit(before.read(entry),after.read(entry.filename))",
      "  elif before.read(entry)!=after.read(entry.filename): raise ValueError('Other payload changed')",
      "  current=after.getinfo(entry.filename)",
      "  for field in ('compress_type','date_time','extra','comment','external_attr','internal_attr','create_system'):",
      "    if getattr(entry,field)!=getattr(current,field): raise ValueError('Metadata changed')",
      "if before.comment!=after.comment: raise ValueError('Archive comment changed')",
    ].join("\n");
    const data = JSON.stringify({ before: original.toString("base64"), after: Buffer.from(saved).toString("base64") });
    for (const flags of [[], ["-O"]]) execFileSync("python3", [...flags, "-c", script], { input: data });
  } finally { editor.close(); }
});
