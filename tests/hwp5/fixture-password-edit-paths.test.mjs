import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createHwp5PasswordDecoder } from "../../js/hwp5-password.mjs";
import { createHwpxPasswordDecoder } from "../../js/hwpx-password.mjs";
import { createHwp5Reader } from "../../js/hwp5.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { createExperimentalHwp5Editor } from "../../js/hwp5-editor.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { verifyRaw } from "./style-preservation/text-record-oracle.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

assert(process.env.HWPJS_TEST_WASM, "Explicit candidate required");
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
const marker = "암호사본😀";

test("tracked encrypted HWP5 fixture is edited only after explicit password conversion with exact source preservation", async () => {
  const path = "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwp", input = readFileSync(path);
  assert.equal(createHash("sha256").update(input).digest("hex"), "e86aac42e3efbcc2e06cc50e628705dce710bec0c252961b7d52c87e3c6b0660");
  const decoder = await createHwp5PasswordDecoder(wasm), reader = await createHwp5Reader(wasm);
  let editor, plaintext;
  try {
    assert.throws(() => reader.readText(input), /UnsupportedEncryption/);
    assert.throws(() => decoder.decryptToPlaintext(input, "wrong"), /WrongPasswordOrCorruptPayload/);
    plaintext = decoder.decryptToPlaintext(input, "12345");
    assert.equal(reader.readText(plaintext).sections[0].paragraphs.length, 2);
    editor = await createExperimentalHwp5Editor(wasm, plaintext);
    editor.enableHistory();
    editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: marker });
    const saved = editor.save({ allowStaleLayout: true }).bytes;
    verifyRaw(plaintext, saved, 0, 0, 0, 0, marker);
    const reopened = await createExperimentalHwp5Editor(wasm, saved);
    try { assert.equal(reopened.text(0, 0), editor.text(0, 0)); } finally { reopened.close(); }
    assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save().bytes), Buffer.from(plaintext));
    assert.equal(editor.redo(), true); assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
    assert.throws(() => reader.readText(input), /UnsupportedEncryption/);
    assert.deepEqual(readFileSync(path), input);
  } finally { editor?.close(); decoder.close(); reader.close(); plaintext?.fill(0); }
});

test("tracked encrypted HWPX fixture follows explicit conversion and independent complete XML verification", async () => {
  const path = "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", input = readFileSync(path);
  assert.equal(createHash("sha256").update(input).digest("hex"), "1d54f5dd6f0716ded516252c4acac92178d23d846d04b4f76d74dd8f97ae3e3f");
  const decoder = await createHwpxPasswordDecoder(wasm), reader = await createHwpxReader(wasm), editor = await createHwpxEditor(wasm);
  let plaintext;
  try {
    assert.throws(() => reader.readTextEvents(input), /EncryptedDocument/);
    assert.throws(() => decoder.decryptToPlaintext(input, "wrong"), /WrongPasswordOrCorruptPayload/);
    plaintext = decoder.decryptToPlaintext(input, "12345");
    const events = reader.readTextEvents(plaintext); assert.equal(events.paragraphCount, 2);
    editor.open(plaintext); editor.enableHistory();
    assert.equal(editor.canEdit(0, 1), true);
    editor.splice(0, 1, 0, 0, marker);
    const saved = editor.save(), request = { mode: "plain_text", before: Buffer.from(plaintext).toString("base64"), after: Buffer.from(saved).toString("base64"), section: 0, paragraph: 1, text: marker };
    for (const flags of [[], ["-O"]]) {
      execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify(request), timeout: 30000 });
      assert.throws(() => execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], { input: JSON.stringify({ ...request, text: "wrong" }), timeout: 30000 }), error => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)));
    }
    assert(reader.readTextEvents(saved).events.some(row => row.kind === "content" && row.value.includes(marker)));
    assert.equal(editor.undo(), true); assert.deepEqual(Buffer.from(editor.save()), Buffer.from(plaintext));
    assert.equal(editor.redo(), true); assert.deepEqual(editor.save(), saved);
    editor.open(saved); assert.equal(reader.readTextEvents(editor.save()).paragraphCount, 2);
    assert.throws(() => reader.readTextEvents(input), /EncryptedDocument/);
    assert.deepEqual(readFileSync(path), input);
  } finally { editor.close(); decoder.close(); reader.close(); plaintext?.fill(0); }
});
