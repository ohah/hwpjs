import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeContextTransport } from '../canvas/context-transport.ts';
// Protocol doubles only: never a substitute for Native Canvas/iOS execution.
function binding(overrides: Record<string, unknown> = {}) {
  const counts = { created: 0, requests: 0, disposed: 0 };
  const source = {
    contextProtocol: 'hwpjs.native-context/1',
    createContextPort() {
      counts.created++;
      return {
        descriptor: {
          protocol: 'hwpjs.native-context/1',
          abiVersion: 1,
          projection: 'format-native-wire',
          snapshotProtocol: 'hwpjs.native-snapshot/2',
          renderSourcesProtocol: 'hwpjs.native-render-sources/3',
          ...overrides,
        },
        async request() {
          counts.requests++;
          throw Error('NoNativeEngineInProtocolTest');
        },
        invalidate() {},
        async dispose() {
          counts.disposed++;
          return { kind: 'dispose', status: 0, meta: { application: 'unapplied', changed: false } };
        },
      };
    },
  };
  return {
    source: source as unknown as Parameters<typeof createNativeContextTransport>[0],
    counts,
  };
}
test('ON advertises only explicit compatible snapshot/render protocols', async () => {
  const { source, counts } = binding();
  const runtime = await createNativeContextTransport(source);
  assert.equal(counts.created, 1);
  assert.equal(counts.requests, 0);
  await assert.rejects(runtime.renderSources(0), /NativeDocumentNotLoaded/);
  await runtime.dispose();
  assert.equal(counts.disposed, 1);
});
test('snapshot OFF refuses before Native open and releases owned port', async () => {
  const { source, counts } = binding({ snapshotProtocol: undefined });
  await assert.rejects(createNativeContextTransport(source), /NativeSnapshotUnavailable/);
  assert.deepEqual(counts, { created: 1, requests: 0, disposed: 1 });
});
test('legacy v1 does not impersonate Canvas v2', async () => {
  const { source, counts } = binding({ snapshotProtocol: 'hwpjs.native-snapshot/1' });
  await assert.rejects(createNativeContextTransport(source), /NativeSnapshotUnavailable/);
  assert.equal(counts.requests, 0);
  assert.equal(counts.disposed, 1);
});
test('render OFF refuses even when snapshot ON', async () => {
  const { source, counts } = binding({ renderSourcesProtocol: undefined });
  await assert.rejects(createNativeContextTransport(source), /NativeRenderSourcesUnavailable/);
  assert.deepEqual(counts, { created: 1, requests: 0, disposed: 1 });
});
test('unknown render revision is refused rather than inferred', async () => {
  const { source, counts } = binding({ renderSourcesProtocol: 'hwpjs.native-render-sources/4' });
  await assert.rejects(createNativeContextTransport(source), /NativeRenderSourcesUnavailable/);
  assert.equal(counts.disposed, 1);
});
test('raw descriptor ABI/projection mismatch refuses before document requests', async () => {
  for (const override of [{ abiVersion: 2 }, { projection: 'browser' }, { protocol: 'bad' }]) {
    const { source, counts } = binding(override);
    await assert.rejects(createNativeContextTransport(source), /NativeContextProtocolMismatch/);
    assert.equal(counts.requests, 0);
    assert.equal(counts.disposed, 1);
  }
});
test('missing binding is an explicit unavailable result, never a WebView fallback', async () => {
  await assert.rejects(createNativeContextTransport(undefined as never), {
    code: 'NativeBackendUnavailable',
  });
});
