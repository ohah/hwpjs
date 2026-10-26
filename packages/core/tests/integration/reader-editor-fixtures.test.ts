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
const prefix = "통합😀<&";
type Format = "hwp5" | "hwpx";
interface Paragraph {
  section: number;
  paragraph: number;
  text: string;
  editable: boolean;
  selectionOwner: string | null;
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
function paragraph(state: EditorState): Paragraph {
  const row = content(state).paragraphs.find((row) => row.section === 0 && row.paragraph === 1);
  assert(row, "charshape section 0 / display paragraph 1 must exist");
  assert.equal(row.editable, true);
  assert.equal(row.selectionOwner, "section:0:body");
  return row;
}
function target(state: EditorState, format: Format): SelectionTarget {
  const row = paragraph(state);
  return {
    ...state.token,
    format,
    coordinateSpace: "display",
    owner: row.selectionOwner!,
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
function verifySave(format: Format, before: Buffer, after: Uint8Array, inserted: string) {
  if (format === "hwp5") {
    verifyRaw(before, Buffer.from(after), 0, 1, 0, 0, inserted);
    assert.deepEqual(inspect(Buffer.from(after)).metadata, inspect(before).metadata);
    return;
  }
  const request = {
    before: before.toString("base64"),
    after: Buffer.from(after).toString("base64"),
    part: "Contents/section0.xml",
    index: 1,
    start: 0,
    end: 0,
    text: inserted,
  };
  for (const flags of [[], ["-O"]]) {
    execFileSync("python3", [...flags, "tools/hwpx-plain-splice-oracle.py"], {
      input: JSON.stringify(request),
      timeout: 30000,
    });
  }
}
function rejectWrongOracleExpectation(format: Format, before: Buffer, after: Uint8Array) {
  if (format === "hwp5") {
    assert.throws(
      () => verifyRaw(before, Buffer.from(after), 0, 1, 0, 0, "WRONG"),
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
            part: "Contents/section0.xml",
            index: 1,
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
  test(`public editor + actual ${format} charshape: typed edit/save/history/reopen with independent oracle`, async (t) => {
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
    const fixture = `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`;
    const input = readFileSync(fixture),
      original = Buffer.from(input);
    const loaded = await editor.load(input, { format }); // Real load + enable, not a runtime mock.
    assert.equal(loaded.status, "ready");
    assert.equal(content(loaded).format, format);
    assert.equal(loaded.nativeHistoryRevision, 0);
    const originalText = paragraph(loaded).text;
    const initial = await editor.save();
    assert.deepEqual(Buffer.from(initial.bytes), original);
    assert.equal(initial.operationRevision, loaded.operationRevision);
    assert.equal(initial.documentId, loaded.documentId);

    const edited = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: target(editor.getEditorState(), format),
      text: prefix,
    });
    committed(edited, "splice");
    assert.equal(edited.state.nativeHistoryRevision, 1);
    assert.equal(paragraph(edited.state).text, prefix + originalText);
    assert.equal(paragraph(loaded).text, originalText, "prior snapshot must remain unchanged");
    const saved = await editor.save({ allowStaleLayout: true });
    assert.equal(saved.format, format);
    assert.equal(saved.staleSnapshot, false);
    assert.equal(saved.layoutRequiresReflow, true);
    assert.equal(saved.nativeHistoryRevision, 1);
    assert.equal(saved.documentId, edited.state.documentId);
    assert.equal(saved.generation, edited.state.generation);
    assert.equal(saved.operationRevision, edited.state.operationRevision);
    assert.equal(editor.getEditorState().savedOperationRevision, saved.operationRevision);
    verifySave(format, original, saved.bytes, prefix);
    rejectWrongOracleExpectation(format, original, saved.bytes);

    const undone = await editor.dispatchCommand(UNDO_COMMAND, {
      token: editor.getEditorState().token,
    });
    committed(undone, "undo");
    assert.equal(undone.state.nativeHistoryRevision, 0);
    assert.equal(paragraph(undone.state).text, originalText);
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
    assert.equal(paragraph(redone.state).text, prefix + originalText);
    const redoSave = await editor.save({ allowStaleLayout: true });
    assert.deepEqual(redoSave.bytes, saved.bytes);
    verifySave(format, original, redoSave.bytes, prefix);

    const openedAgain = await reopened.load(redoSave.bytes, { format });
    assert.equal(openedAgain.status, "ready");
    assert.equal(paragraph(openedAgain).text, prefix + originalText);
    assert.equal(openedAgain.nativeHistoryRevision, 0, "reopen creates a fresh history baseline");
    assert.notEqual(openedAgain.documentId, redone.state.documentId);
    assert.deepEqual((await reopened.save({ allowStaleLayout: true })).bytes, saved.bytes);
    await reopened.dispose();
    assert.deepEqual(
      (await editor.save({ allowStaleLayout: true })).bytes,
      saved.bytes,
      "disposing reopened instance cannot affect original",
    );
    assert.deepEqual(input, original, "load/edit must not mutate caller fixture bytes");
    assert.deepEqual(errors, [], "source/meta/listener errors must never be swallowed");
    assert.deepEqual(reopenedErrors, []);
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
