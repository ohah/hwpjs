import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  createEditor,
  SPLICE_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  type SelectionTarget,
  type EditorError,
  type EditorState,
  type CommandResult,
} from "../../src/index.ts";
import { createReaderRuntimeFactory } from "../../src/runtime.ts";
import {
  inspect,
  verifyRaw,
} from "../../../../tests/hwp5/style-preservation/text-record-oracle.mjs";
import { paragraphSelectionOwner } from "../../../../web/preview/paragraph-selection.mjs";
import { execFileSync } from "../../../../tools/oracle-process.mjs";

// Public source entries; published tarball/build integration belongs to main.
// Never silently substitute zig-out/bin or another candidate for this source/artifact pairing.
const wasmPath =
  process.env.HWPJS_TEST_WASM ?? "zig-out/verification/hwp5-object-extra-u16/bin/hwpjs.wasm";
const wasmBytes = readFileSync(wasmPath);
const wasmHash = createHash("sha256").update(wasmBytes).digest("hex");
if (!process.env.HWPJS_TEST_WASM)
  assert.equal(wasmHash, "fdbb6a476a16811d0136f484e9e03a327947bc5c9e361bc756a8a06b1dde1c51");
const modulePromise = WebAssembly.compile(wasmBytes);
const prefix = "검증😀";
type Kind = "drawingText" | "drawingCaption";
type Format = "hwp5" | "hwpx";
interface Paragraph {
  section: number;
  paragraph: number;
  text: string;
  editable: boolean;
  selectionOwner: string | null;
  clipped?: boolean;
  drawingText?: unknown;
  drawingCaption?: unknown;
  currentReference?: { kind: string };
}
interface Content {
  format: Format;
  paragraphs: readonly Paragraph[];
}
function content(state: EditorState): Content {
  const value = state.content as Content;
  assert(value && Array.isArray(value.paragraphs), "actual runtime snapshot required");
  return value;
}
function paragraph(
  state: EditorState,
  kind: Kind,
  expectedPrefix = kind === "drawingText" ? "글상자" : "그림 ",
): Paragraph {
  const row = content(state).paragraphs.find(
    (row) =>
      row[kind] &&
      row.editable &&
      !row.clipped &&
      row.text.startsWith(expectedPrefix) &&
      (content(state).format !== "hwp5" || row.currentReference?.kind === "original"),
  );
  assert(
    row,
    `textbox must contain editable original ${kind} starting with ${JSON.stringify(expectedPrefix)}`,
  );
  assert.equal(Boolean(row.drawingText), kind === "drawingText");
  assert.equal(Boolean(row.drawingCaption), kind === "drawingCaption");
  const owner = paragraphSelectionOwner(row);
  assert.equal(typeof owner, "string");
  assert.match(
    owner,
    new RegExp(
      `^section:${row.section}:drawing:\\d+:${kind === "drawingText" ? "text" : "caption"}:list:\\d+$`,
    ),
  );
  return row;
}
function target(state: EditorState, format: Format, row: Paragraph): SelectionTarget {
  return {
    ...state.token,
    format,
    coordinateSpace: "display",
    owner: paragraphSelectionOwner(row),
    section: row.section,
    paragraph: row.paragraph,
    startUnit: 0,
    endUnit: 0,
    affinity: "forward",
  };
}
function committed(result: CommandResult, kind: string) {
  assert.equal(result.error, undefined, `${kind}: ${result.error}`);
  assert.equal(
    result.status,
    "committed-with-snapshot",
    `${kind} must not degrade to refresh-required/no-op`,
  );
  assert.equal(result.changed, true, `${kind}: Native history must prove a change`);
  assert.equal(result.reply?.kind, kind);
  assert.equal(result.reply?.error, undefined);
  assert.equal(result.reply?.meta?.application, "applied");
  assert.equal(result.reply?.meta?.changed, true);
  assert(result.reply?.meta?.context, `${kind}: request metadata required`);
  // Public owned DTOs intentionally have a null prototype; compare every own field.
  assert.deepEqual(
    { ...result.reply.meta.context },
    { ...result.context },
    `${kind}: exact request metadata required`,
  );
  assert.equal(result.state.status, "ready");
}
function verifySave(
  format: Format,
  before: Buffer,
  after: Uint8Array,
  inserted: string,
  row: Paragraph,
  rows: readonly Paragraph[],
) {
  if (format === "hwp5") {
    verifyRaw(before, Buffer.from(after), row.section, row.paragraph, 0, 0, inserted);
    assert.deepEqual(inspect(Buffer.from(after)).metadata, inspect(before).metadata);
    return;
  }
  const request = {
    before: before.toString("base64"),
    after: Buffer.from(after).toString("base64"),
    ...(row.drawingCaption ? { preserve_automatic_numbers: true } : {}),
    part: `Contents/section${row.section}.xml`,
    index: rows
      .filter((p) => p.section === row.section)
      .findIndex((p) => p.paragraph === row.paragraph),
    start: 0,
    end: 0,
    text: inserted,
  };
  const failures: unknown[] = [];
  for (const flags of [[], ["-O"]]) {
    try {
      execFileSync("python3", [...flags, "tools/hwpx-plain-splice-oracle.py"], {
        input: JSON.stringify(request),
        timeout: 30000,
      });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "Whole ZIP/XML splice oracle failed (Python normal and -O both attempted)",
    );
}
function rejectWrongOracleExpectation(
  format: Format,
  before: Buffer,
  after: Uint8Array,
  row: Paragraph,
  rows: readonly Paragraph[],
) {
  if (format === "hwp5") {
    assert.throws(
      () => verifyRaw(before, Buffer.from(after), row.section, row.paragraph, 0, 0, "WRONG"),
      /complete Section/,
    );
    return;
  }
  for (const flags of [[], ["-O"]]) {
    assert.throws(
      () =>
        execFileSync("python3", [...flags, "tools/hwpx-plain-splice-oracle.py"], {
          input: JSON.stringify({
            before: before.toString("base64"),
            after: Buffer.from(after).toString("base64"),
            ...(row.drawingCaption ? { preserve_automatic_numbers: true } : {}),
            part: `Contents/section${row.section}.xml`,
            index: rows
              .filter((p) => p.section === row.section)
              .findIndex((p) => p.paragraph === row.paragraph),
            start: 0,
            end: 0,
            text: "WRONG",
          }),
          timeout: 30000,
        }),
      (error: any) => error.status === 1 && /Whole XML mismatch/.test(String(error.stderr)),
    );
  }
}

for (const format of ["hwp5", "hwpx"] as const)
  for (const kind of ["drawingText", "drawingCaption"] as const)
    test(`public editor + actual ${format} textbox ${kind}: typed edit/save/history/reopen with independent oracle`, async (t) => {
      const runtimeFactory = createReaderRuntimeFactory({ wasmModule: await modulePromise });
      const errors: EditorError[] = [],
        updates: EditorState[] = [];
      const editor = createEditor({
        runtimeFactory,
        onError: (event) => {
          errors.push(event);
        },
      });
      const reopenedErrors: EditorError[] = [];
      const reopened = createEditor({
        runtimeFactory,
        onError: (event) => {
          reopenedErrors.push(event);
        },
      });
      t.after(async () => {
        await editor.dispose();
        await reopened.dispose();
      });
      editor.registerErrorListener((event) => {
        errors.push(event);
      });
      editor.registerUpdateListener((state) => {
        updates.push(state);
      });
      const fixture = `legacy/rust/crates/hwp-core/tests/fixtures/textbox.${format === "hwp5" ? "hwp" : "hwpx"}`;
      const input = readFileSync(fixture),
        original = Buffer.from(input);
      const sourceHash = createHash("sha256").update(original).digest("hex");
      t.after(() => {
        assert.equal(
          createHash("sha256").update(input).digest("hex"),
          sourceHash,
          "caller input hash must stay unchanged even on failure",
        );
        assert.equal(
          createHash("sha256").update(readFileSync(fixture)).digest("hex"),
          sourceHash,
          "source fixture hash must stay unchanged even on failure",
        );
      });
      const loaded = await editor.load(input, { format }); // Real load + enable, not a runtime mock.
      assert.equal(loaded.status, "ready");
      assert.equal(content(loaded).format, format);
      assert.equal(loaded.nativeHistoryRevision, 0);
      const row = paragraph(loaded, kind),
        rows = content(loaded).paragraphs;
      const originalText = row.text;
      const inputHash = createHash("sha256").update(input).digest("hex");
      const initial = await editor.save();
      assert.deepEqual(Buffer.from(initial.bytes), original);
      assert.equal(initial.operationRevision, loaded.operationRevision);
      assert.equal(initial.documentId, loaded.documentId);

      const edited = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: target(editor.getEditorState(), format, row),
        text: prefix,
      });
      committed(edited, "splice");
      assert.equal(edited.state.nativeHistoryRevision, 1);
      assert.equal(
        paragraph(edited.state, kind, prefix + originalText).text,
        prefix + originalText,
      );
      assert.equal(
        paragraph(loaded, kind).text,
        originalText,
        "prior snapshot must remain unchanged",
      );
      const saved = await editor.save({ allowStaleLayout: true });
      assert.equal(saved.format, format);
      assert.equal(saved.staleSnapshot, false);
      assert.equal(saved.layoutRequiresReflow, true);
      assert.equal(saved.nativeHistoryRevision, 1);
      assert.equal(saved.documentId, edited.state.documentId);
      assert.equal(saved.generation, edited.state.generation);
      assert.equal(saved.operationRevision, edited.state.operationRevision);
      assert.equal(editor.getEditorState().savedOperationRevision, saved.operationRevision);
      verifySave(format, original, saved.bytes, prefix, row, rows);
      rejectWrongOracleExpectation(format, original, saved.bytes, row, rows);

      const undone = await editor.dispatchCommand(UNDO_COMMAND, {
        token: editor.getEditorState().token,
      });
      committed(undone, "undo");
      assert.equal(undone.state.nativeHistoryRevision, 0);
      assert.equal(paragraph(undone.state, kind).text, originalText);
      assert(
        undone.state.operationRevision > edited.state.operationRevision,
        "public revision must not rewind with Native history",
      );
      const restored = await editor.save();
      assert.deepEqual(
        Buffer.from(restored.bytes),
        original,
        "undo restores original container bytes",
      );
      assert.equal(restored.nativeHistoryRevision, 0);

      const redone = await editor.dispatchCommand(REDO_COMMAND, {
        token: editor.getEditorState().token,
      });
      committed(redone, "redo");
      assert.equal(redone.state.nativeHistoryRevision, 1);
      assert(redone.state.operationRevision > undone.state.operationRevision);
      assert.equal(
        paragraph(redone.state, kind, prefix + originalText).text,
        prefix + originalText,
      );
      const redoSave = await editor.save({ allowStaleLayout: true });
      assert.deepEqual(redoSave.bytes, saved.bytes);
      verifySave(format, original, redoSave.bytes, prefix, row, rows);

      const openedAgain = await reopened.load(redoSave.bytes, { format });
      assert.equal(openedAgain.status, "ready");
      assert.equal(paragraph(openedAgain, kind, prefix + originalText).text, prefix + originalText);
      assert.equal(openedAgain.nativeHistoryRevision, 0, "reopen creates a fresh history baseline");
      assert.notEqual(openedAgain.documentId, redone.state.documentId);
      assert.deepEqual((await reopened.save({ allowStaleLayout: true })).bytes, saved.bytes);
      const reopenedRow = paragraph(openedAgain, kind, prefix + originalText);
      await reopened.setSelection(target(openedAgain, format, reopenedRow));
      const oldDocumentTarget = target(
        editor.getEditorState(),
        format,
        paragraph(editor.getEditorState(), kind, prefix + originalText),
      );
      const prior = reopened.getEditorState();
      await assert.rejects(reopened.setSelection(oldDocumentTarget), /StaleTarget/);
      const rejected = await reopened.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: oldDocumentTarget,
        text: prefix,
      });
      assert.equal(rejected.status, "rejected-unapplied");
      assert.equal(rejected.error, "StaleTarget");
      assert.equal(reopened.getEditorState(), prior);
      assert.deepEqual((await reopened.save({ allowStaleLayout: true })).bytes, saved.bytes);
      await reopened.dispose();
      assert.deepEqual(
        (await editor.save({ allowStaleLayout: true })).bytes,
        saved.bytes,
        "disposing reopened instance cannot affect original",
      );
      assert.deepEqual(input, original, "load/edit must not mutate caller fixture bytes");
      assert.equal(createHash("sha256").update(input).digest("hex"), inputHash);
      assert.equal(
        createHash("sha256").update(readFileSync(fixture)).digest("hex"),
        inputHash,
        "fixture on disk must stay unchanged",
      );
      assert.deepEqual(errors, [], "source/meta/listener errors must never be swallowed");
      assert(
        reopenedErrors.every((event) => String(event.error ?? event).includes("StaleTarget")),
        "only intentional old-document rejection errors are allowed",
      );
      assert.deepEqual(
        updates.map((state) => state.nativeHistoryRevision),
        [0, 1, 0, 1],
      );
      t.diagnostic(
        JSON.stringify({
          fixture,
          wasmPath,
          wasmHash,
          typedCommands: ["splice-text", "undo", "redo"],
          nativeHistory: updates.map((state) => state.nativeHistoryRevision),
          independentOracle:
            format === "hwp5" ? "CFB/full records + metadata" : "ZIP/full XML, Python normal + -O",
          reopen: true,
        }),
      );
    });
