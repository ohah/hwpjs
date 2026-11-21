import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderEditorRuntime } from '../../src/runtime/reader-runtime.ts';
import { createWorkerEditorRuntime } from '../../src/worker-runtime.ts';
import {
  hasRuntimeAdmission,
  requestAtRuntimeAdmission,
} from '../../src/internal/runtime-admission.ts';
import { createNativeReadSourceLifecycle } from '../../src/internal/native-read-source-origin.ts';

const context = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 0,
  requestId: 1,
};
// Empty unqualified module and private fake transport: no real Native engine is executed.
const module = Object.freeze({}) as WebAssembly.Module;
class FakeWorker {
  sent: unknown[] = [];
  terminations = 0;
  addEventListener() {}
  removeEventListener() {}
  postMessage(value: unknown) {
    this.sent.push(value);
  }
  terminate() {
    this.terminations++;
  }
}
test('unknown in-process module cannot admit margin read or mutation', async () => {
  const runtime = createReaderEditorRuntime({ wasmModule: module });
  try {
    for (const kind of ['hwp5-vertical-object-margins-query', 'hwp5-vertical-object-margins-set']) {
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
test('custom Worker plus counterfeit capability fields cannot admit either operation', async () => {
  const worker = new FakeWorker();
  const runtime = createWorkerEditorRuntime({ wasmModule: module, workerFactory: () => worker });
  try {
    for (const kind of ['hwp5-vertical-object-margins-query', 'hwp5-vertical-object-margins-set']) {
      assert.equal(hasRuntimeAdmission(runtime, kind), false);
      assert.throws(
        () =>
          requestAtRuntimeAdmission(
            runtime,
            {
              kind,
              historyProtocol: 2,
              verticalMarginsQualified: true,
              hwp5VerticalMarginsAvailable: true,
            },
            context,
            () => {},
          ),
        /UnsupportedAtomicRuntime/,
      );
    }
    assert.equal(worker.sent.length, 0);
  } finally {
    await runtime.dispose();
  }
  assert.equal(worker.terminations, 1);
});
test('margin owner read preserves current read origin and margin write revokes it before reply', () => {
  const contract = {
    contract: 'hwp5-exclusive-text-delta-v1' as const,
    sha256: 'private-unit-only',
  };
  const life = createNativeReadSourceLifecycle(
    () => contract,
    () => true,
  );
  const reply = {
    kind: 'enable',
    content: { format: 'hwp5' },
    documentTextReadBinding: {
      schemaVersion: 1,
      scope: 'native-document-text-read-binding',
      executionAuthority: false,
      format: 'hwp5',
      session: 's',
      epoch: '1',
      serial: '1',
    },
  };
  life.publish(life.begin('enable'), reply, context, 1, true);
  const origin = life.consume(reply, context);
  assert(origin);
  assert(origin.authority());
  const readTicket = life.begin('hwp5-vertical-object-margins-query', context);
  assert(origin.authority());
  life.begin('hwp5-vertical-object-margins-set', context);
  assert.equal(origin.authority(), false);
  const stale = { ...reply, kind: 'hwp5-vertical-object-margins-query' };
  life.publish(readTicket, stale, context, 2, true);
  assert.equal(life.consume(stale, context), undefined);
});

test('raw1 raw module and caller hash fields cannot issue qualification', async () => {
  const { hwp5VerticalMarginsArtifactQualified, hwp5VerticalMarginsBackendQualified } =
    await import('../../../../js/hwp5-vertical-margins-qualification.mjs');
  assert.equal(hwp5VerticalMarginsArtifactQualified('48174a0c'), false);
  assert.equal(hwp5VerticalMarginsBackendQualified({ qualified: true, sha256: '48174a0c' }), false);
});
