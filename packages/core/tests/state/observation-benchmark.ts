/** Manual bounded microbenchmark; not a product fixture/layout/E2E performance claim. */
import { performance } from "node:perf_hooks";
import { EditorState } from "../../src/state/editor-state.ts";
import { copyOwned, freezeDTO } from "../../src/state/owned.ts";
const content = {
  format: "hwp5",
  paragraphs: Array.from({ length: 6000 }, (_, paragraph) => ({
    section: 0,
    paragraph,
    text: "x".repeat(440),
    selectionOwner: "section:0:body",
    editable: true,
  })),
};
const data = {
  editorId: "benchmark",
  documentId: "document",
  generation: 1,
  operationRevision: 1,
  viewRevision: 1,
  stateVersion: 1,
  status: "ready" as const,
  content,
};
let sink = 0;
function measure(iterations: number, action: () => void) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) action();
  return +(performance.now() - start).toFixed(3);
}
const constructMs = measure(10, () => {
  sink += new EditorState(data).operationRevision;
});
const state = new EditorState(data);
const stableReadMs = measure(100000, () => {
  sink += (state.content as typeof content).paragraphs.length;
});
const oldCloneReadMs = measure(100, () => {
  sink += freezeDTO(copyOwned(content, true)).paragraphs.length;
});
const bufferState = new EditorState({
  ...data,
  content: { bytes: new Uint8Array(3 * 1024 * 1024) },
});
const typedBufferReadMs = measure(100, () => {
  sink += (bufferState.content as { bytes: Uint8Array }).bytes.length;
});
console.log(
  JSON.stringify({
    runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.versions.node}`,
    syntheticJSONBytes: Buffer.byteLength(JSON.stringify(content)),
    paragraphs: content.paragraphs.length,
    construct: { iterations: 10, totalMs: constructMs },
    stableReads: { iterations: 100000, totalMs: stableReadMs },
    previousCloneReads: { iterations: 100, totalMs: oldCloneReadMs },
    typedBufferCopies: {
      iterations: 100,
      bytesPerCopy: 3 * 1024 * 1024,
      totalMs: typedBufferReadMs,
    },
    sink,
  }),
);
