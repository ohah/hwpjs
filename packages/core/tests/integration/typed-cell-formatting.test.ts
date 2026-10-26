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
import type { SelectionTarget } from "../../src/commands/commands.ts";
import { createReaderRuntimeFactory } from "../../src/runtime.ts";
import { verifyCharacterProperties } from "../../../../tests/hwp5/style-preservation/character-property-oracle.mjs";
import { verifyParagraphProperty } from "../../../../tests/hwp5/style-preservation/paragraph-property-oracle.mjs";
import { paragraphSelectionOwner } from "../../../../web/preview/paragraph-selection.mjs";
import { sourceTextChange } from "../../../../web/preview/text-offsets.mjs";
import { execFileSync } from "../../../../tools/oracle-process.mjs";

const wasm = readFileSync(
  process.env.HWPJS_TEST_WASM ?? "zig-out/verification/hwp5-object-extra-u16/bin/hwpjs.wasm",
);
if (!process.env.HWPJS_TEST_WASM)
  assert.equal(
    createHash("sha256").update(wasm).digest("hex"),
    "fdbb6a476a16811d0136f484e9e03a327947bc5c9e361bc756a8a06b1dde1c51",
  );
const properties = { bold: true, italic: true, size: 1800 };

for (const format of ["hwp5", "hwpx"] as const)
  for (const character of [true, false]) {
    test(`${format} noori original table CELL typed ${character ? "character properties" : "paragraph alignment"} save/history/reopen`, async (t) => {
      const factory = createReaderRuntimeFactory({ wasmModule: await WebAssembly.compile(wasm) });
      const calls: string[] = [];
      const e = createEditor({
        runtimeFactory: async () => {
          const runtime = await factory();
          return {
            dispose: runtime.dispose,
            request(message: any, context: any) {
              calls.push(message.kind);
              return runtime.request(message, context);
            },
          };
        },
      });
      const reopened = createEditor({ runtimeFactory: factory });
      t.after(async () => {
        await e.dispose();
        await reopened.dispose();
      });
      const before = readFileSync(
        `legacy/rust/crates/hwp-core/tests/fixtures/noori.${format === "hwp5" ? "hwp" : "hwpx"}`,
      );
      await e.load(before, { format });
      const rows = (e.getEditorState().content as any).paragraphs;
      const row = rows.find(
        (p: any) =>
          p.tableCell &&
          p.editable &&
          !p.clipped &&
          !p.createdCell &&
          p.text.length > 0 &&
          !/[\uD800-\uDFFF\uFFFC\t]/.test(p.text[0]) &&
          (format !== "hwp5" || p.currentReference?.kind === "original"),
      );
      assert(row, "noori must contain an editable original table cell with text");
      const owner = paragraphSelectionOwner(row);
      assert.match(owner, /^section:\d+:table:\d+:list:\d+$/);
      const target = (): SelectionTarget => ({
        ...e.getEditorState().token,
        format,
        coordinateSpace: "display",
        owner,
        section: row.section,
        paragraph: row.paragraph,
        startUnit: 0,
        endUnit: character ? 1 : 0,
        affinity: "forward",
      });
      const alignment =
        row.paragraphShape?.alignment === 3 || row.paragraphShape?.alignment === "CENTER"
          ? "RIGHT"
          : "CENTER";
      const rawAlignment = alignment === "RIGHT" ? 2 : 3;
      const dispatch = (selection: SelectionTarget) =>
        character
          ? e.dispatchCommand(CHAR, { target: selection, properties })
          : e.dispatchCommand(ALIGN, { target: selection, alignment });
      await e.setSelection(target());
      for (const [bad, error] of [
        [{ ...target(), owner: `section:${row.section}:body` }, "InvalidSelectionOwner"],
        [{ ...target(), viewRevision: target().viewRevision + 1 }, "StaleTarget"],
      ] as const) {
        const prior = e.getEditorState(),
          count = calls.length;
        const rejected = await dispatch(bad);
        assert.equal(rejected.status, "rejected-unapplied");
        assert.equal(rejected.error, error);
        assert.equal(e.getEditorState(), prior);
        assert.deepEqual(
          calls.slice(count),
          [],
          "rejection must neither mutate native state nor save",
        );
      }
      const selected = target();
      const outcome = await dispatch(selected);
      assert.equal(outcome.status, "committed-with-snapshot", outcome.error);
      assert.equal(
        outcome.changed,
        true,
        "requested properties must actually change the original cell",
      );
      assert.deepEqual(
        { ...(outcome.state.selection as object) },
        target(),
        "formatting preserves the canonical cell selection",
      );
      const saved = await e.save({ allowStaleLayout: true });
      assert.notDeepEqual(Buffer.from(saved.bytes), before);
      const updated = (outcome.state.content as any).paragraphs.find(
        (p: any) => p.section === row.section && p.paragraph === row.paragraph,
      );
      assert.equal(paragraphSelectionOwner(updated), owner);
      const mapped =
        format === "hwp5"
          ? sourceTextChange({ startUnit: 0, endUnit: 1, text: "" }, row.sourceOffsets)
          : { startUnit: 0, endUnit: 1 };
      const position = {
        section: row.section,
        paragraph: row.paragraph,
        startUnit: mapped.startUnit,
        endUnit: mapped.endUnit,
      };
      if (format === "hwp5") {
        if (character) {
          verifyCharacterProperties(before, Buffer.from(saved.bytes), { ...position, properties });
          assert.throws(() =>
            verifyCharacterProperties(before, Buffer.from(saved.bytes), {
              ...position,
              properties: { ...properties, size: 1900 },
            }),
          );
        } else {
          verifyParagraphProperty(before, Buffer.from(saved.bytes), {
            ...position,
            alignment: rawAlignment,
          });
          assert.throws(() =>
            verifyParagraphProperty(before, Buffer.from(saved.bytes), {
              ...position,
              alignment: rawAlignment === 3 ? 2 : 3,
            }),
          );
        }
      } else {
        // HWPX content uses document ordinals; the XML oracle requires section-local ordinals.
        const localParagraph = rows
          .filter((p: any) => p.section === row.section)
          .findIndex((p: any) => p.paragraph === row.paragraph);
        assert(localParagraph >= 0);
        const request = {
          before: before.toString("base64"),
          after: Buffer.from(saved.bytes).toString("base64"),
          section: row.section,
          localParagraph,
          startUnit: 0,
          endUnit: 1,
          properties,
          mode: character ? undefined : "alignment",
          alignment,
          paraShapeId: updated.paraShapeId,
        };
        const oracle = character
          ? "tools/hwpx-character-property-oracle.py"
          : "tools/hwpx-paragraph-format-oracle.py";
        for (const flags of [[], ["-O"]]) {
          const verify = (input: object) =>
            execFileSync("python3", [...flags, oracle], {
              input: JSON.stringify(input),
              timeout: 30000,
            });
          verify(request);
          assert.throws(
            () =>
              verify(
                character
                  ? { ...request, properties: { ...properties, size: 1900 } }
                  : { ...request, alignment: alignment === "CENTER" ? "RIGHT" : "CENTER" },
              ),
            "independent oracle must reject a bogus expected edit",
          );
        }
      }
      // A once-valid selection must not be silently rebased after a real mutation.
      const prior = e.getEditorState(),
        count = calls.length;
      const stale = await dispatch(selected);
      assert.equal(stale.status, "rejected-unapplied");
      assert.equal(stale.error, "StaleTarget");
      assert.equal(e.getEditorState(), prior);
      assert.deepEqual(calls.slice(count), []);
      assert.equal(
        (await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token })).status,
        "committed-with-snapshot",
      );
      assert.deepEqual(Buffer.from((await e.save()).bytes), before);
      assert.equal(
        (await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token })).status,
        "committed-with-snapshot",
      );
      assert.deepEqual(
        Buffer.from((await e.save({ allowStaleLayout: true })).bytes),
        Buffer.from(saved.bytes),
      );
      await reopened.load(saved.bytes, { format });
      const reopenedRow = (reopened.getEditorState().content as any).paragraphs.find(
        (p: any) => p.section === row.section && p.paragraph === row.paragraph,
      );
      assert.equal(reopenedRow.text, row.text);
      assert.equal(paragraphSelectionOwner(reopenedRow), owner);
      assert.deepEqual(
        Buffer.from((await reopened.save({ allowStaleLayout: true })).bytes),
        Buffer.from(saved.bytes),
      );
    });
  }
