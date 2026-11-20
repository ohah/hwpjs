import { createDocumentTextIndex } from '../../src/state/document-text-search.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { nativeReadSourceOrigin } from '../../src/internal/native-read-source-origin.ts';
import {
  observeNativeReadSource,
  readNativeReadSourceEvidence,
  inheritNativeReadSource,
} from '../../src/internal/native-read-source-evidence.ts';
const context = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 1,
  requestId: 1,
};
const binding = {
  schemaVersion: 1,
  scope: 'native-document-text-read-binding',
  executionAuthority: false,
  format: 'hwpx',
  session: 's1',
  epoch: '1',
  serial: '0',
};
const contract = {
  contract: 'hwp5-exclusive-text-delta-v1' as const,
  sha256: 'controlled-test-not-an-actual-native-module',
};
const state = (content: any, patch: any = {}) =>
  new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
    content,
    capabilities: { readOnly: true },
    ...patch,
  });
// Pure private-origin/evidence logic only. No Runtime or Native qualification is claimed.
test('read source retains actual Native-named serial separately from missing History revision', () => {
  const content = { format: 'hwpx', readOnly: true },
    s = state(content);
  let scope: any = {};
  const captured = scope;
  const origin = nativeReadSourceOrigin(
    { kind: 'load', documentTextReadBinding: binding },
    context,
    1,
    contract,
    captured,
    () => scope === captured,
  );
  observeNativeReadSource(s, origin);
  const result = readNativeReadSourceEvidence(s);
  assert.equal(result?.serial, '0');
  assert.equal(s.nativeHistoryRevision, undefined);
  assert(!Object.hasOwn(result!, 'nativeRevision'));
  assert.equal(result?.executionAuthority, false);
  scope = {};
  assert.equal(readNativeReadSourceEvidence(s), undefined);
});
test('unknown module, missing source context and wrong Native scope cannot issue read evidence', () => {
  const reply = { kind: 'load', documentTextReadBinding: binding };
  assert.equal(
    nativeReadSourceOrigin(reply, context, 1, undefined, {}, () => true),
    undefined,
  );
  assert.equal(
    nativeReadSourceOrigin(reply, undefined, 1, contract, {}, () => true),
    undefined,
  );
  for (const patch of [
    { scope: 'native-document-text-selection' },
    { epoch: '0' },
    { serial: '-1' },
    { executionAuthority: true },
    { revision: 0 },
  ])
    assert.equal(
      nativeReadSourceOrigin(
        { ...reply, documentTextReadBinding: { ...binding, ...patch } },
        context,
        1,
        contract,
        {},
        () => true,
      ),
      undefined,
    );
});
test('selection-only state can inherit, doc/view/content transitions cannot inherit', () => {
  const s = state({ format: 'hwpx' });
  const origin = nativeReadSourceOrigin(
    { kind: 'load', documentTextReadBinding: binding },
    context,
    1,
    contract,
    {},
    () => true,
  );
  observeNativeReadSource(s, origin);
  const selected = state(s.content, { stateVersion: 2 });
  inheritNativeReadSource(s, selected);
  assert(readNativeReadSourceEvidence(selected));
  for (const patch of [
    { documentId: 'other' },
    { generation: 2 },
    { operationRevision: 2 },
    { viewRevision: 2 },
    { content: { format: 'hwpx' } },
  ]) {
    const next = state(s.content, patch);
    inheritNativeReadSource(s, next);
    assert.equal(readNativeReadSourceEvidence(next), undefined);
  }
});
test('runtime authority loss and source-format mismatch fail closed without write fallback', () => {
  const s = state({ format: 'hwpx' });
  let alive = true;
  const o = nativeReadSourceOrigin(
    { kind: 'load', documentTextReadBinding: binding },
    context,
    1,
    contract,
    {},
    () => alive,
  );
  observeNativeReadSource(s, o);
  alive = false;
  assert.equal(readNativeReadSourceEvidence(s), undefined);
  const h = state({ format: 'hwp5' });
  observeNativeReadSource(h, o);
  assert.equal(readNativeReadSourceEvidence(h), undefined);
});

test('operation change needs exact candidate admission context and cannot relabel a read query', () => {
  const s = state({ format: 'hwpx' }, { operationRevision: 2 });
  const load = nativeReadSourceOrigin(
    { kind: 'load', documentTextReadBinding: binding },
    context,
    1,
    contract,
    {},
    () => true,
  );
  observeNativeReadSource(s, load);
  assert.equal(readNativeReadSourceEvidence(s), undefined);
  observeNativeReadSource(s, load, { ...context, requestId: 99 });
  assert.equal(readNativeReadSourceEvidence(s), undefined);
  observeNativeReadSource(s, load, context);
  assert(readNativeReadSourceEvidence(s));
  const other = state({ format: 'hwpx' }, { operationRevision: 2 });
  const query = nativeReadSourceOrigin(
    { kind: 'document-text-snapshot', documentTextReadBinding: binding },
    context,
    1,
    contract,
    {},
    () => true,
  );
  observeNativeReadSource(other, query, context);
  assert.equal(readNativeReadSourceEvidence(other), undefined);
});

test('Native search snapshot must match the published read-source lifetime and serial', () => {
  const s = state({ format: 'hwpx' });
  const origin = nativeReadSourceOrigin(
    { kind: 'load', documentTextReadBinding: binding },
    context,
    1,
    contract,
    {},
    () => true,
  );
  observeNativeReadSource(s, origin);
  const snapshot = {
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format: 'hwpx',
    binding: { session: 's1', revision: null },
    readBinding: { epoch: '1', serial: '0' },
    coverage: { totalParagraphs: 0, sections: [] },
    rows: [],
  };
  assert(createDocumentTextIndex(s, snapshot));
  for (const patch of [
    { binding: { session: 's2', revision: null } },
    { readBinding: { epoch: '2', serial: '0' } },
    { readBinding: { epoch: '1', serial: '1' } },
    { readBinding: undefined },
  ])
    assert.throws(
      () => createDocumentTextIndex(s, { ...snapshot, ...patch }),
      /StaleDocumentTextReadBinding|IncompleteDocumentTextSnapshot/,
    );
  assert.equal(s.nativeHistoryRevision, undefined);
});
