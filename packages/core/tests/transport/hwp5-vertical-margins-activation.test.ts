import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hwp5VerticalMarginsArtifactQualified,
  hwp5VerticalMarginsBackendQualified,
  copyHwp5VerticalMarginsModuleBytes,
  verifiedHwp5VerticalMarginsBytes,
  compileHwp5VerticalMarginsModule,
} from '../../../../js/hwp5-vertical-margins-qualification.mjs';
import { createReaderEditorRuntime } from '../../src/runtime/reader-runtime.ts';
import { createWorkerEditorRuntime } from '../../src/worker-runtime.ts';
import { hasRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
const sha256 = 'e8c4676c862dd8cdc59acb6c3b0658d7100b0e5d1ecc592e9095729b64f419a5';
const fake = Object.freeze({
  sha256,
  qualified: true,
  verticalMarginsQualified: true,
  exports: { hwp5_edit_vertical_outer_margins_version: () => 1 },
});
test('exact artifact lookup is metadata and cannot qualify a raw module shape', () => {
  assert.equal(hwp5VerticalMarginsArtifactQualified(sha256), true);
  for (const value of [
    fake,
    { ...fake },
    structuredClone({ sha256, qualified: true }),
    {},
    undefined,
    null,
  ]) {
    assert.equal(hwp5VerticalMarginsBackendQualified(value), false);
    assert.equal(copyHwp5VerticalMarginsModuleBytes(value), undefined);
  }
});
for (const bad of [
  new Uint8Array(),
  new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]),
  { byteLength: 5577426, sha256 },
  sha256,
  null,
])
  test(`non-artifact bytes reject before compilation ${String(bad?.constructor?.name)}`, async () => {
    await assert.rejects(verifiedHwp5VerticalMarginsBytes(bad as any));
    await assert.rejects(compileHwp5VerticalMarginsModule(bad as any));
    assert.equal(hwp5VerticalMarginsBackendQualified(fake), false);
  });
test('right-length synthetic bytes reject on actual digest before compilation', async () => {
  const wrong = new Uint8Array(5577426);
  await assert.rejects(
    verifiedHwp5VerticalMarginsBytes(wrong),
    /UnqualifiedHwp5VerticalMarginsArtifact/,
  );
  await assert.rejects(
    compileHwp5VerticalMarginsModule(wrong),
    /UnqualifiedHwp5VerticalMarginsArtifact/,
  );
  assert.equal(copyHwp5VerticalMarginsModuleBytes(fake), undefined);
});
test('caller claims cannot admit in-process runtime', async () => {
  const runtime = createReaderEditorRuntime({
    wasmModule: fake,
    sha256,
    verticalMarginsQualified: true,
  } as any);
  try {
    for (const kind of ['hwp5-vertical-object-margins-query', 'hwp5-vertical-object-margins-set'])
      assert.equal(hasRuntimeAdmission(runtime, kind), false);
  } finally {
    await runtime.dispose();
  }
});
test('caller claims and custom Worker cannot admit either operation', async () => {
  const worker = {
    postMessage() {},
    terminate() {},
    addEventListener() {},
    removeEventListener() {},
  };
  const runtime = createWorkerEditorRuntime({
    wasmModule: fake,
    workerFactory: () => worker,
    sha256,
    verticalMarginsQualified: true,
  } as any);
  try {
    for (const kind of ['hwp5-vertical-object-margins-query', 'hwp5-vertical-object-margins-set'])
      assert.equal(hasRuntimeAdmission(runtime, kind), false);
  } finally {
    await runtime.dispose();
  }
});
