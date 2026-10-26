import test from "node:test";
import assert from "node:assert/strict";
import {
  createEditor,
  SET_CHARACTER_UNDERLINE_COMMAND as UNDERLINE,
  type SelectionTarget,
} from "../../src/index.ts";
async function fixture(capability = true) {
  const calls: any[] = [];
  const content = {
    format: "hwp5",
    characterPropertiesAvailable: false,
    characterUnderlineAvailable: capability,
    characterUnderlines: [{ id: 0, kind: "none" }],
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: "A😀B",
        editable: true,
        selectionOwner: "section:0:body",
        sourceOffsets: [{ at: 0, source: 8 }],
        currentReference: { kind: "original", section: 0, id: "99", scope: "1", epoch: "2" },
        characterRanges: [{ start: 0, end: 4, charShapeId: 0 }],
      },
    ],
  };
  const e = createEditor({
    runtimeFactory: () => ({
      dispose() {},
      async request(m: any) {
        calls.push(m);
        return {
          kind: m.kind,
          content,
          ...(!["load", "enable"].includes(m.kind)
            ? { meta: { application: "applied", changed: true } }
            : {}),
        };
      },
    }),
  });
  await e.load(new Uint8Array([1]), { format: "hwp5" });
  const target: SelectionTarget = {
    ...e.getEditorState().token,
    format: "hwp5",
    coordinateSpace: "display",
    owner: "section:0:body",
    section: 0,
    paragraph: 0,
    startUnit: 1,
    endUnit: 3,
    affinity: "forward",
  };
  return { e, calls, target };
}
test("typed underline uses canonical source offsets and independent capability, retaining selection", async () => {
  const { e, calls, target } = await fixture();
  try {
    await e.setSelection(target);
    const result = await e.dispatchCommand(UNDERLINE, { target, kind: "bottom" });
    assert.equal(result.status, "committed-with-snapshot");
    assert.equal(result.changed, true);
    const request = calls.at(-1);
    assert.equal(request.kind, "character-underline");
    assert.equal(request.underlineKind, "bottom");
    assert.equal(request.startUnit, 9);
    assert.equal(request.endUnit, 11);
    assert.equal(Object.hasOwn(request, "reference"), false);
    assert.deepEqual(
      { ...(result.state.selection as object) },
      { ...target, ...result.state.token },
    );
  } finally {
    await e.dispose();
  }
});
test("invalid underline targets and names cannot enter native or consume the current selection", async () => {
  const { e, calls, target } = await fixture();
  try {
    await e.setSelection(target);
    const invalid = [
      { kind: "BOTTOM", target },
      { kind: 0, target },
      { kind: "bottom", target: { ...target, endUnit: 1 } },
      { kind: "bottom", target: { ...target, startUnit: 2, endUnit: 3 } },
      { kind: "bottom", target: { ...target, viewRevision: 99 } },
      { kind: "bottom", target: { ...target, owner: "section:0:table:7:list:8" } },
    ];
    for (const payload of invalid) {
      const prior = e.getEditorState(),
        count = calls.length;
      const answer = await e.dispatchCommand(UNDERLINE, payload as any);
      assert.equal(answer.status, "rejected-unapplied");
      assert.equal(e.getEditorState(), prior);
      assert.equal(calls.length, count);
    }
  } finally {
    await e.dispose();
  }
  const missing = await fixture(false);
  try {
    const n = missing.calls.length;
    const answer = await missing.e.dispatchCommand(UNDERLINE, {
      target: missing.target,
      kind: "bottom",
    });
    assert.equal(answer.error, "FormattingCapabilityUnavailable");
    assert.equal(missing.calls.length, n);
  } finally {
    await missing.e.dispose();
  }
});
