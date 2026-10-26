import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEditor, SPLICE_TEXT_COMMAND } from "../../src/index.ts";
import { createReaderRuntimeFactory } from "../../src/runtime.ts";
import { modulePromise } from "../runtime/runtime-test-fixtures.ts";
for (const format of ["hwp5", "hwpx"] as const)
  test(`${format} actual sessions sharing an editor label reject foreign document targets`, async () => {
    const factory = createReaderRuntimeFactory({ wasmModule: await modulePromise });
    let foreignNativeCalls = 0;
    const a = createEditor({ editorId: "same-name", runtimeFactory: factory });
    const b = createEditor({
      editorId: "same-name",
      runtimeFactory: async () => {
        const r = await factory();
        return {
          dispose: r.dispose,
          request(m: any, c: any) {
            if (m.kind === "splice") foreignNativeCalls++;
            return r.request(m, c);
          },
        };
      },
    });
    try {
      const bytes = readFileSync(
        `legacy/rust/crates/hwp-core/tests/fixtures/charshape.${format === "hwp5" ? "hwp" : "hwpx"}`,
      );
      await a.load(bytes, { format });
      await b.load(bytes, { format });
      const token = {
        ...a.getEditorState().token,
        format,
        coordinateSpace: "display" as const,
        owner: "section:0:body",
        section: 0,
        paragraph: 1,
        startUnit: 0,
        endUnit: 0,
        affinity: "forward" as const,
      };
      const prior = b.getEditorState();
      assert.notEqual(prior.documentId, token.documentId);
      const result = await b.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: token,
        text: "FOREIGN",
      });
      assert.equal(result.error, "StaleTarget");
      assert.equal(result.status, "rejected-unapplied");
      assert.equal(foreignNativeCalls, 0);
      assert.equal(b.getEditorState(), prior);
      assert.deepEqual(Buffer.from((await b.save()).bytes), bytes);
      assert.deepEqual(Buffer.from((await a.save()).bytes), bytes);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });
