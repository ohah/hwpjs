import test from "node:test";
import assert from "node:assert/strict";
import {
  EditorState,
  getSelectionClipboard,
  createEditor,
  SPLICE_TEXT_COMMAND,
} from "../../src/index.ts";
function state({
  text = "A😀B",
  start = 1,
  end = 3,
  editable = true,
  owner = "section:0:body",
  targetPatch = {},
  rowPatch = {},
  status = "ready",
}: any = {}) {
  const token = {
    editorId: "e",
    documentId: "d",
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
  };
  return new EditorState({
    ...token,
    stateVersion: 7,
    status,
    content: {
      format: "hwpx",
      paragraphs: [
        { section: 0, paragraph: 0, text, editable, selectionOwner: "section:0:body", ...rowPatch },
      ],
    },
    selection: {
      ...token,
      coordinateSpace: "display",
      format: "hwpx",
      owner,
      section: 0,
      paragraph: 0,
      startUnit: start,
      endUnit: end,
      affinity: "forward",
      ...targetPatch,
    },
  });
}
test("public clipboard state uses selection SSOT for tokens, owner, scalar and clipping boundaries", () => {
  for (const [patch, reason] of [
    [{ targetPatch: { viewRevision: 2 } }, "StaleTarget"],
    [{ owner: "wrong" }, "InvalidSelectionOwner"],
    [{ start: 2 }, "InvalidScalarBoundary"],
    [{ rowPatch: { clipped: true } }, "InvalidSelectionOwner"],
    [{ end: 9 }, "InvalidTextPosition"],
  ] as const) {
    const result = getSelectionClipboard(state(patch));
    assert.equal(result.copyReason, reason);
    assert.equal(result.target, null);
  }
});
test("readonly copy and mutation authority are separate; collapsed insertion retains a target", () => {
  const observed = state({ editable: false }),
    before = observed.content;
  const copy = getSelectionClipboard(observed);
  assert.equal(copy.text, "😀");
  assert.equal(copy.copyReason, null);
  assert.equal(copy.editReason, "SelectionNotEditable");
  assert(Object.isFrozen(copy.target));
  assert.equal(copy.stateVersion, 7);
  assert.deepEqual(observed.content, before);
  const caret = getSelectionClipboard(state({ start: 1, end: 1 }));
  assert.equal(caret.copyReason, "EmptyClipboardSelection");
  assert.equal(caret.editReason, null);
  assert(caret.target);
});
test("opaque object placeholder and created cell mutations are not promoted to ordinary plain-text editing", () => {
  const object = getSelectionClipboard(state({ text: "A\ufffcB", start: 1, end: 2 }));
  assert.equal(object.copyReason, "ClipboardObjectSelectionUnsupported");
  assert.equal(object.target, null);
  const cell = getSelectionClipboard(state({ rowPatch: { createdCell: { id: 1 } } }));
  assert.equal(cell.copyReason, null);
  assert.equal(cell.editReason, "CreatedCellRequiresSurfacePort");
});
test("disposed and refresh fenced states never grant clipboard mutations", () => {
  assert.equal(getSelectionClipboard(state({ status: "disposed" })).editReason, "EditorNotReady");
  assert.equal(
    getSelectionClipboard(state({ status: "refresh-required" })).editReason,
    "RefreshRequired",
  );
});

test("HWP protected retained-unit width cannot be promoted to a cut/paste range", () => {
  const previous = state({ text: "A\tB", start: 1, end: 2 });
  const data = {
    ...previous.token,
    stateVersion: 7,
    status: "ready" as const,
    content: {
      format: "hwp5",
      paragraphs: [
        {
          section: 0,
          paragraph: 0,
          text: "A\tB",
          editable: true,
          selectionOwner: "section:0:body",
          sourceOffsets: [
            { at: 0, source: 0 },
            { at: 2, source: 9 },
          ],
        },
      ],
    },
    selection: { ...(previous.selection as any), format: "hwp5" },
  };
  const observed = getSelectionClipboard(new EditorState(data));
  assert.equal(observed.text, "\t");
  assert.equal(observed.copyReason, null);
  assert.equal(observed.editReason, "ProtectedAnchorRange");
});

test("asynchronous clipboard fence rejects moving away and back within the same document revision", async () => {
  let mutations = 0;
  const content = {
    format: "hwpx",
    paragraphs: [
      { section: 0, paragraph: 0, text: "AB AB", editable: true, selectionOwner: "section:0:body" },
    ],
  };
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(message) {
        if (message.kind === "splice") mutations++;
        return {
          kind: message.kind,
          content,
          meta: { application: "applied" as const, changed: message.kind === "splice" },
        };
      },
      dispose() {},
    }),
  });
  try {
    await editor.load(new Uint8Array([1]), { format: "hwpx" });
    const target = {
      ...editor.getEditorState().token,
      coordinateSpace: "display" as const,
      format: "hwpx" as const,
      owner: "section:0:body",
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 2,
      affinity: "forward" as const,
    };
    await editor.setSelection(target);
    const observed = getSelectionClipboard(editor.getEditorState());
    await editor.setSelection({ ...target, startUnit: 3, endUnit: 5 });
    await editor.setSelection(target);
    assert.equal(editor.getEditorState().operationRevision, target.operationRevision);
    const stale = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target,
      text: "X",
      selectionVersion: observed.stateVersion,
    });
    assert.equal(stale.status, "rejected-unapplied");
    assert.equal(stale.error, "StaleClipboardSelection");
    assert.equal(mutations, 0);
    const fresh = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target,
      text: "X",
      selectionVersion: editor.getEditorState().stateVersion,
    });
    assert.equal(fresh.status, "committed-with-snapshot");
    assert.equal(mutations, 1);
  } finally {
    await editor.dispose();
  }
});
