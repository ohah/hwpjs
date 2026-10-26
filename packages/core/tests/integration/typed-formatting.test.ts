import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createEditor } from "../../src/editor/create-editor.ts";
import {
  SET_CHARACTER_PROPERTIES_COMMAND as CHAR,
  SET_PARAGRAPH_ALIGNMENT_COMMAND as ALIGN,
  UNDO_COMMAND,
  REDO_COMMAND,
} from "../../src/commands/commands.ts";
import { createReaderRuntimeFactory } from "../../src/runtime.ts";
import { verifyCharacterProperties } from "../../../../tests/hwp5/style-preservation/character-property-oracle.mjs";
import { verifyParagraphProperty } from "../../../../tests/hwp5/style-preservation/paragraph-property-oracle.mjs";
import { execFileSync } from "../../../../tools/oracle-process.mjs";
const wasmPath =
  process.env.HWPJS_TEST_WASM ?? "zig-out/verification/hwp5-object-extra-u16/bin/hwpjs.wasm";
const wasm = readFileSync(wasmPath);
if (!process.env.HWPJS_TEST_WASM)
  assert.equal(
    createHash("sha256").update(wasm).digest("hex"),
    "fdbb6a476a16811d0136f484e9e03a327947bc5c9e361bc756a8a06b1dde1c51",
  );
for (const format of ["hwp5", "hwpx"] as const)
  for (const character of [true, false])
    test(`${format} typed ${character ? "character" : "alignment"} actual save/history/reopen oracle`, async (t) => {
      const factory = createReaderRuntimeFactory({ wasmModule: await WebAssembly.compile(wasm) });
      const e = createEditor({ runtimeFactory: factory }),
        r = createEditor({ runtimeFactory: factory });
      t.after(async () => {
        await e.dispose();
        await r.dispose();
      });
      const before = readFileSync(
        `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`,
      );
      await e.load(before, { format });
      const target = () => ({
        ...e.getEditorState().token,
        format,
        coordinateSpace: "display" as const,
        owner: "section:0:body",
        section: 0,
        paragraph: 1,
        startUnit: 0,
        endUnit: character ? 1 : 0,
        affinity: "forward" as const,
      });
      await e.setSelection(target());
      const properties = { size: 2400, bold: true, italic: false };
      const outcome = character
        ? await e.dispatchCommand(CHAR, { target: target(), properties })
        : await e.dispatchCommand(ALIGN, { target: target(), alignment: "CENTER" });
      assert.equal(outcome.status, "committed-with-snapshot", outcome.error);
      assert.equal(outcome.changed, true);
      assert.deepEqual(
        { ...(outcome.state.selection as object) },
        target(),
        "actual native formatting must preserve a validated selection",
      );
      const saved = await e.save({ allowStaleLayout: true });
      if (format === "hwp5") {
        if (character)
          verifyCharacterProperties(before, Buffer.from(saved.bytes), {
            section: 0,
            paragraph: 1,
            startUnit: 0,
            endUnit: 1,
            properties,
          });
        else
          verifyParagraphProperty(before, Buffer.from(saved.bytes), {
            section: 0,
            paragraph: 1,
            alignment: 3,
          });
      } else {
        const c: any = outcome.state.content;
        const row = c.paragraphs.find((p: any) => p.paragraph === 1);
        const request = {
          before: before.toString("base64"),
          after: Buffer.from(saved.bytes).toString("base64"),
          section: 0,
          localParagraph: 1,
          startUnit: 0,
          endUnit: 1,
          properties,
          mode: character ? undefined : "alignment",
          alignment: "CENTER",
          paraShapeId: row.paraShapeId,
        };
        for (const flags of [[], ["-O"]])
          execFileSync(
            "python3",
            [
              ...flags,
              character
                ? "tools/hwpx-character-property-oracle.py"
                : "tools/hwpx-paragraph-format-oracle.py",
            ],
            { input: JSON.stringify(request), timeout: 30000 },
          );
      }
      assert.equal(
        (await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token })).status,
        "committed-with-snapshot",
      );
      assert.deepEqual(Buffer.from((await e.save()).bytes), before);
      assert.equal(
        (await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token })).status,
        "committed-with-snapshot",
      );
      assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, saved.bytes);
      await r.load(saved.bytes, { format });
      assert.deepEqual((await r.save({ allowStaleLayout: true })).bytes, saved.bytes);
    });
