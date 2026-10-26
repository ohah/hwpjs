import test from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../../src/editor/create-editor.ts";
import {
  SET_CHARACTER_PROPERTIES_COMMAND as CHAR,
  SPLICE_TEXT_COMMAND,
} from "../../src/commands/commands.ts";
for (const change of [
  "none",
  "epoch",
  "scope",
  "text",
  "reference",
  "offsets",
  "owner",
  "absent",
  "clipped",
  "surrogate",
  "duplicate",
  "refresh-required",
  "splice",
])
  test(`format selection continuity: ${change}`, async () => {
    const row: any = {
      section: 0,
      paragraph: 0,
      text: "ABCD",
      editable: true,
      selectionOwner: "section:0:body",
      currentReference: { kind: "original", section: 0, id: "99", epoch: "2", scope: "1" },
    };
    const content: any = { format: "hwp5", characterPropertiesAvailable: true, paragraphs: [row] };
    const editor = createEditor({
      runtimeFactory: () => ({
        dispose() {},
        async request(m: any) {
          if (["load", "enable"].includes(m.kind)) return { kind: m.kind, content };
          if (change === "refresh-required")
            return { kind: m.kind, applied: true, error: "SnapshotFailure" };
          const next = structuredClone(content),
            p = next.paragraphs[0];
          if (change === "epoch") p.currentReference.epoch = "3";
          if (change === "scope") p.currentReference.scope = "2";
          if (change === "text") p.text = "WXYZ";
          if (change === "reference") p.currentReference.id = "100";
          if (change === "offsets") p.sourceOffsets = [{ at: 0, source: 1 }];
          if (change === "owner") p.selectionOwner = "other";
          if (change === "absent") next.paragraphs = [];
          if (change === "clipped") p.clipped = true;
          if (change === "surrogate") p.text = "A😀D";
          if (change === "duplicate") next.paragraphs.push({ ...p });
          return { kind: m.kind, content: next, meta: { application: "applied", changed: true } };
        },
      }),
    });
    try {
      await editor.load(new Uint8Array([1]), { format: "hwp5" });
      const target = {
        ...editor.getEditorState().token,
        coordinateSpace: "display" as const,
        format: "hwp5" as const,
        owner: "section:0:body",
        section: 0,
        paragraph: 0,
        startUnit: 0,
        endUnit: 2,
        affinity: "backward" as const,
      };
      await editor.setSelection(target);
      const result =
        change === "splice"
          ? await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: "Z" })
          : await editor.dispatchCommand(CHAR, { target, properties: { bold: true } });
      if (change === "none" || change === "epoch") {
        assert.deepEqual(
          { ...(result.state.selection as object) },
          { ...target, ...result.state.token },
        );
        assert.equal(
          (await editor.dispatchCommand(CHAR, { target, properties: { italic: true } })).error,
          "StaleTarget",
        );
        const current = result.state.selection as typeof target;
        assert.equal(
          (await editor.dispatchCommand(CHAR, { target: current, properties: { italic: true } }))
            .status,
          "committed-with-snapshot",
        );
      } else if (change === "refresh-required")
        assert.equal(result.state.status, "refresh-required");
      else assert.equal(result.state.selection, undefined);
    } finally {
      await editor.dispose();
    }
  });

for (const kind of ["drawingText", "drawingCaption"])
  for (const changed of [false, true])
    test(`drawing formatting selection continuity: ${kind}, metadata changed=${changed}`, async () => {
      const binding =
        kind === "drawingText"
          ? { drawingNode: 7, listNode: 9, textNode: 8 }
          : { drawingNode: 7, listNode: 9, captionNode: 8 };
      const row: any = {
        section: 0,
        paragraph: 0,
        text: "ABCD",
        editable: true,
        selectionOwner: null,
        [kind]: binding,
      };
      const content: any = {
        format: "hwpx",
        characterPropertiesAvailable: true,
        paragraphs: [row],
      };
      const editor = createEditor({
        runtimeFactory: () => ({
          dispose() {},
          async request(m: any) {
            if (["load", "enable"].includes(m.kind)) return { kind: m.kind, content };
            const next = structuredClone(content);
            if (changed)
              next.paragraphs[0][kind][kind === "drawingText" ? "textNode" : "captionNode"] = 10;
            return { kind: m.kind, content: next, meta: { application: "applied", changed: true } };
          },
        }),
      });
      try {
        await editor.load(new Uint8Array([1]), { format: "hwpx" });
        const target = {
          ...editor.getEditorState().token,
          coordinateSpace: "display" as const,
          format: "hwpx" as const,
          owner: `section:0:drawing:7:${kind === "drawingText" ? "text" : "caption"}:list:9`,
          section: 0,
          paragraph: 0,
          startUnit: 0,
          endUnit: 2,
          affinity: "forward" as const,
        };
        await editor.setSelection(target);
        const result = await editor.dispatchCommand(CHAR, { target, properties: { bold: true } });
        assert.equal(result.status, "committed-with-snapshot");
        if (changed) assert.equal(result.state.selection, undefined);
        else
          assert.deepEqual(
            { ...(result.state.selection as object) },
            { ...target, ...result.state.token },
          );
      } finally {
        await editor.dispose();
      }
    });
