import test from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../../src/editor/create-editor.ts";

function setup() {
  const calls: any[] = [];
  let created = 0;
  const editor = createEditor({
    runtimeFactory: () => {
      created++;
      return {
        request: async (message: any) => {
          calls.push(structuredClone(message));
          return {
            kind: message.kind,
            content: { format: "hwp5", paragraphs: [] },
            historyRevision: 0,
          };
        },
        dispose() {},
      };
    },
  });
  return {
    editor,
    calls,
    get created() {
      return created;
    },
  };
}
test("explicit available-section copy reaches load only and is scoped to one load", async () => {
  const f = setup();
  try {
    await f.editor.load(new Uint8Array([1]), { format: "hwp5", availableSectionCopy: true });
    assert.equal(f.calls[0].availableSectionCopy, true);
    assert.equal(f.calls[1].kind, "enable");
    assert.equal(f.calls[1].availableSectionCopy, undefined);
    await f.editor.load(new Uint8Array([2]), { format: "hwp5" });
    assert.equal(f.calls[2].availableSectionCopy, undefined);
  } finally {
    await f.editor.dispose();
  }
});
test("invalid source-policy combinations reject before replacing an active document", async () => {
  const f = setup();
  try {
    await f.editor.load(new Uint8Array([1]), { format: "hwp5" });
    const state = f.editor.getEditorState();
    for (const options of [
      { format: "hwp5", availableSectionCopy: "true" },
      { format: "hwpx", availableSectionCopy: true },
      { format: "hwp5", availableSectionCopy: true, enableOptions: { distribution: true } },
      { format: "hwp5", availableSectionCopy: true, enableOptions: { normalizeObservedCfb: true } },
    ]) {
      assert.throws(() => f.editor.load(new Uint8Array([2]), options as any));
      assert.equal(f.editor.getEditorState(), state);
      assert.equal(f.created, 1);
    }
  } finally {
    await f.editor.dispose();
  }
});
