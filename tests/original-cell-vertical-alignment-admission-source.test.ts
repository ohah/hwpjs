import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderEditorRuntime } from '../packages/core/src/runtime/reader-runtime.ts';
import { createWorkerEditorRuntime } from '../packages/core/src/worker-runtime.ts';
import {
  hasRuntimeAdmission,
  requestAtRuntimeAdmission,
} from '../packages/core/src/internal/runtime-admission.ts';
import { surfaceOperation } from '../packages/core/src/commands/surface-protocol.ts';
const kinds = ['original-cell-vertical-alignment-query', 'original-cell-vertical-alignment-set'];
// Empty header only: no product engine is compiled, instantiated or qualified.
const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
const context = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 0,
  requestId: 1,
};
test('alignment owner query is read and commit is mutation in canonical surface protocol', () => {
  assert.equal(surfaceOperation(kinds[0]), 'read');
  assert.equal(surfaceOperation(kinds[1]), 'mutation');
});
test('unqualified in-process module cannot admit original cell query or mutation', async () => {
  const runtime = createReaderEditorRuntime({ wasmModule: module });
  try {
    for (const kind of kinds) {
      assert.equal(hasRuntimeAdmission(runtime, kind), false);
      assert.throws(
        () => requestAtRuntimeAdmission(runtime, { kind }, context, () => {}),
        /UnsupportedAtomicRuntime/,
      );
    }
  } finally {
    await runtime.dispose();
  }
});
test('custom worker and counterfeit alignment capability cannot admit either operation', async () => {
  let sent = 0,
    terminated = 0;
  const worker: any = {
    addEventListener() {},
    removeEventListener() {},
    postMessage() {
      sent++;
    },
    terminate() {
      terminated++;
    },
  };
  const runtime = createWorkerEditorRuntime({ wasmModule: module, workerFactory: () => worker });
  try {
    for (const kind of kinds) {
      assert.equal(hasRuntimeAdmission(runtime, kind), false);
      assert.throws(
        () =>
          requestAtRuntimeAdmission(
            runtime,
            { kind, originalCellVerticalAlignmentAvailable: true },
            context,
            () => {},
          ),
        /UnsupportedAtomicRuntime/,
      );
    }
    assert.equal(sent, 0);
  } finally {
    await runtime.dispose();
  }
  assert.equal(terminated, 1);
});
