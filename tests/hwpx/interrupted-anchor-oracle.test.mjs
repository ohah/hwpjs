import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { createHwpxReader } from "../../js/hwpx.mjs";
import { insertPrefix } from "../../tools/hwpx-prefix-edit-probe.mjs";
import { hwpxParagraphCoordinates } from "../../tools/hwpx-paragraph-coordinates.mjs";
import { execFileSync } from "../../tools/oracle-process.mjs";

test("the real anchored paragraph interrupted by oracle ENOSPC preserves XML and history", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const path = "reference/rhwp/samples/3-11월_실전_통합_2024-구분선위0미주사이20구분선아래2.hwpx";
  const input = readFileSync(path),
    wasm = readFileSync(process.env.HWPJS_TEST_WASM);
  const editor = await createHwpxEditor(wasm),
    reader = await createHwpxReader(wasm);
  const content = (events, paragraph) =>
    events
      .filter((e) => e.kind === "content" && e.section === 0 && e.paragraph === paragraph)
      .map((e) => e.value)
      .join("");
  try {
    editor.open(input);
    editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
    const original = reader.readTextEvents(input);
    const coordinates = hwpxParagraphCoordinates(original.events);
    assert.equal(coordinates.length, 1203);
    const target = coordinates.find((p) => p.section === 0 && p.paragraph === 870);
    assert(target);
    assert.equal(editor.canEdit(0, 870), false);
    editor.anchorText(0, 870);
    const revision = editor.historyRevision(),
      text = "경로😀<&";
    insertPrefix(editor, 0, 870, text);
    assert(editor.historyRevision() > revision);
    const saved = Buffer.from(editor.save());
    for (const flags of [[], ["-O"]]) {
      const request = {
        mode: "anchored",
        before: input.toString("base64"),
        after: saved.toString("base64"),
        section: 0,
        paragraph: target.localParagraph,
        text,
      };
      execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
        input: JSON.stringify(request),
        timeout: 30000,
      });
      assert.throws(
        () =>
          execFileSync("python3", [...flags, "tools/hwpx-anchor-prefix-oracle.py"], {
            input: JSON.stringify({ ...request, text: "wrong" }),
            timeout: 30000,
          }),
        (error) =>
          error.status === 1 &&
          error.signal === null &&
          !error.code &&
          String(error.stderr).includes("complete XML mismatch"),
      );
    }
    assert.equal(
      content(reader.readTextEvents(saved).events, 870),
      text + content(original.events, 870),
    );
    assert.equal(editor.undo(), true);
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
    const reopened = await createHwpxEditor(wasm);
    try {
      reopened.open(saved);
      assert.deepEqual(Buffer.from(reopened.save()), saved);
    } finally {
      reopened.close();
    }
    assert.equal(
      content(reader.readTextEvents(saved).events, 870),
      text + content(original.events, 870),
    );
    assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
    reader.close();
  }
});
