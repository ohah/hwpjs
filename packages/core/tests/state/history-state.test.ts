import { test, expect } from "bun:test";
import { EditorState, getHistoryAvailability, createEditor } from "../../src/index.ts";
function state(
  current?: number,
  revisions?: readonly number[],
  status: "ready" | "refresh-required" | "empty" = "ready",
) {
  return new EditorState({
    editorId: "e",
    documentId: "d",
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status,
    nativeHistoryRevision: current,
    nativeHistoryRevisions: revisions,
  });
}
test("Native reachability, not positive revision or list index, determines undo/redo", () => {
  for (const [current, revisions, undo, redo] of [
    [0, [0], false, false],
    [149, [149, 0, 1], true, false],
    [1, [1, 0, 149], true, true],
    [0, [0, 149, 1], false, true],
    [150, [150, 1, 149], true, false],
    [99, [99], false, false],
  ] as const) {
    expect(getHistoryAvailability(state(current, revisions))).toEqual({
      available: true,
      canUndo: undo,
      canRedo: redo,
    });
  }
});
test("missing, stale, malformed, and incomplete history cannot enable actions", () => {
  for (const [current, revisions] of [
    [undefined, undefined],
    [2, undefined],
    [2, []],
    [2, [1, 2]],
    [1, [1, 1]],
    [1, [1, -1]],
    [1, [1, 0xffffffff]],
  ] as const) {
    expect(getHistoryAvailability(state(current, revisions))).toEqual({
      available: false,
      canUndo: false,
      canRedo: false,
    });
  }
  expect(() => state(1, [1, NaN])).toThrow("InvalidNumber");
  expect(getHistoryAvailability(state(1, [1, 0], "refresh-required")).available).toBe(false);
});
test("owned immutable history survives selection updates and does not alias runtime buffers", async () => {
  const revisions = [1, 0];
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(message) {
        return {
          kind: message.kind,
          content: { format: "hwpx", paragraphs: [] },
          historyRevision: 1,
          historyRevisions: revisions,
        };
      },
      dispose() {},
    }),
  });
  try {
    await editor.load(new Uint8Array([1]), { format: "hwpx" });
    const first = editor.getEditorState();
    revisions[1] = 100;
    expect(first.nativeHistoryRevisions).toEqual([1, 0]);
    expect(Object.isFrozen(first.nativeHistoryRevisions)).toBe(true);
    await editor.setSelection(null);
    expect(getHistoryAvailability(editor.getEditorState())).toEqual({
      available: true,
      canUndo: true,
      canRedo: false,
    });
    await editor.dispose();
    expect(getHistoryAvailability(editor.getEditorState()).available).toBe(false);
    expect(first.nativeHistoryRevisions).toEqual([1, 0]);
  } finally {
    await editor.dispose();
  }
});
