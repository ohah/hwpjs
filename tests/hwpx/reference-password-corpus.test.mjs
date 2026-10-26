import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxPasswordDecoder } from "../../js/hwpx-password.mjs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { hwpxParagraphCoordinates } from "../../tools/hwpx-paragraph-coordinates.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("decrypted reference HWPX verifies every plain and anchored paragraph prefix independently", async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? "zig-out/bin/hwpjs.wasm");
  const input = readFileSync("reference/rhwp/samples/HWP5-password-123456.hwpx"),
    original = Buffer.from(input);
  const decoder = await createHwpxPasswordDecoder(wasm),
    editor = await createHwpxEditor(wasm),
    reader = await createHwpxReader(wasm);
  let plain;
  const counts = { plain: 0, anchored: 0, independent: 0, history: 0 };
  const text = "전체검증😀<&";
  try {
    plain = decoder.decryptToPlaintext(input, "123456");
    const source = Buffer.from(plain),
      coordinates = hwpxParagraphCoordinates(reader.readTextEvents(plain).events);
    assert.equal(coordinates.length, 418);
    for (const p of coordinates) {
      editor.open(plain);
      editor.enableHistory({ maxEntries: 2, maxCheckpointBytes: 64 * 1024 * 1024 });
      const mode = editor.canEdit(p.section, p.paragraph) ? "plain_text" : "anchored";
      if (mode === "plain_text") editor.splice(p.section, p.paragraph, 0, 0, text);
      else {
        editor.anchorText(p.section, p.paragraph);
        editor.spliceAnchored(p.section, p.paragraph, 0, 0, text);
      }
      const saved = editor.save();
      const payload = {
        mode,
        before: source.toString("base64"),
        after: Buffer.from(saved).toString("base64"),
        section: p.section,
        paragraph: p.localParagraph,
        text,
      };
      for (const flags of [[], ["-O"]])
        execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
          input: JSON.stringify(payload),
          timeout: 30000,
        });
      counts.independent++;
      const reopened = await createHwpxEditor(wasm);
      try {
        reopened.open(saved);
        assert.deepEqual(reopened.save(), saved);
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), source);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save(), saved);
      counts.history++;
      counts[mode === "plain_text" ? "plain" : "anchored"]++;
      assert.deepEqual(Buffer.from(plain), source);
    }
    assert.deepEqual(counts, { plain: 388, anchored: 30, independent: 418, history: 418 });
    assert.deepEqual(input, original);
  } finally {
    reader.close();
    editor.close();
    decoder.close();
    plain?.fill(0);
  }
});
