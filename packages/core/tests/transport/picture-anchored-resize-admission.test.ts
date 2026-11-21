import {
  queryPictureAnchoredResize,
  commitPictureAnchoredResize,
} from '../../../../web/preview/picture-anchored-resize-command.mjs';
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
const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
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
test('unknown in-process module cannot admit picture read or mutation', async () => {
  const runtime = createReaderEditorRuntime({ wasmModule: module });
  try {
    for (const kind of ['picture-anchored-resize-query', 'picture-anchored-resize-set']) {
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
    for (const kind of ['picture-anchored-resize-query', 'picture-anchored-resize-set']) {
      assert.equal(hasRuntimeAdmission(runtime, kind), false);
      assert.throws(
        () =>
          requestAtRuntimeAdmission(
            runtime,
            { kind, historyProtocol: 2, pictureAnchoredResizeAvailable: true },
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
test('picture owner read preserves current read origin and replace revokes it before reply', () => {
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
  const readTicket = life.begin('picture-anchored-resize-query', context);
  assert(origin.authority());
  life.begin('picture-anchored-resize-set', context);
  assert.equal(origin.authority(), false);
  const stale = { ...reply, kind: 'picture-anchored-resize-query' };
  life.publish(readTicket, stale, context, 2, true);
  assert.equal(life.consume(stale, context), undefined);
});

for (const format of ['hwp5', 'hwpx'])
  test(`${format} backend accepts structured clone and performs one setter, no legacy fallback`, () => {
    const before: any =
      format === 'hwp5'
        ? {
            profileVersion: 1,
            format,
            section: 0,
            pictureNode: 7,
            width: 4,
            height: 6,
            horizontalOffset: -2,
            verticalOffset: 3,
            historyRevision: 0,
            lease: '18446744073709551615',
          }
        : {
            profileVersion: 1,
            expected: {
              section: 0,
              pictureNode: 7,
              size: [4, 6],
              offsets: [-2, 3],
              sourceSha256: Array(32).fill(7),
              serial: '18446744073709551615',
            },
            binding: { session: 's', revision: 0 },
          };
    let reads = 0,
      writes = 0;
    const outcome = { nativeCode: 1, application: 'applied', changed: true };
    const editor = {
      supportsPictureAnchoredResize: () => true,
      pictureAnchoredResize: (section: number, node: number) => {
        reads++;
        assert.equal(section, 0);
        assert.equal(node, 7);
        return before;
      },
      setPictureAnchoredResize: (input: any) => {
        writes++;
        assert.deepEqual(input.before, before);
        return outcome;
      },
      resizePicture: () => {
        throw Error('LegacyFallbackForbidden');
      },
    };
    const observed = queryPictureAnchoredResize(editor, format, { section: 0, pictureNode: 7 });
    assert.deepEqual(observed, before);
    assert.equal(
      commitPictureAnchoredResize(editor, format, {
        before: structuredClone(observed),
        width: 8,
        height: 10,
        anchor: 'bottom_right',
      }),
      outcome,
    );
    assert.equal(reads, 1);
    assert.equal(writes, 1);
    assert.throws(() =>
      commitPictureAnchoredResize(editor, format, {
        before,
        width: 0,
        height: 10,
        anchor: 'bottom_right',
      }),
    );
    assert.equal(writes, 1);
    for (const unsupported of [{}, { ...editor, supportsPictureAnchoredResize: () => false }])
      assert.throws(
        () =>
          commitPictureAnchoredResize(unsupported, format, {
            before,
            width: 8,
            height: 10,
            anchor: 'bottom_right',
          }),
        /AnchoredPictureResizeUnavailable/,
      );
    assert.equal(writes, 1);
  });
