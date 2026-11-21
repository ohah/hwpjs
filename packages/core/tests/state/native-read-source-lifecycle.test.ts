import { surfaceOperation } from '../../src/commands/surface-protocol.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeReadSourceLifecycle } from '../../src/internal/native-read-source-origin.ts';
import {
  observeNativeReadSource,
  readNativeReadSourceEvidence,
  inheritNativeReadSource,
} from '../../src/internal/native-read-source-evidence.ts';
import { EditorState } from '../../src/state/editor-state.ts';
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
  format: 'hwp5',
  session: 's',
  epoch: '1',
  serial: '2',
};
// Private lifecycle logic only: this synthetic contract does not qualify a module.
const contract = { contract: 'hwp5-exclusive-text-delta-v1' as const, sha256: 'unit-only' };
const reply = (kind = 'enable') => ({
  kind,
  content: { format: 'hwp5' },
  documentTextReadBinding: binding,
});
const state = (content: object, operationRevision = 1) =>
  new EditorState({
    ...context,
    content,
    operationRevision,
    viewRevision: 1,
    stateVersion: 1,
    status: 'ready',
  });
function setup() {
  let valid = true;
  const life = createNativeReadSourceLifecycle(
    () => contract,
    () => valid,
  );
  const r = reply();
  life.publish(life.begin(r.kind), r, context, 1, true);
  const origin = life.consume(r, context)!;
  assert(origin);
  return {
    life,
    origin,
    stop: () => {
      valid = false;
    },
  };
}
test('unknown module and untrusted transport cannot mint authority from valid wire fields', () => {
  for (const [qualified, trusted] of [
    [false, true],
    [true, false],
    [false, false],
  ]) {
    const life = createNativeReadSourceLifecycle(
      () => (qualified ? contract : undefined),
      () => qualified,
    );
    const r = reply();
    life.publish(life.begin('enable'), r, context, 1, trusted);
    assert.equal(life.consume(r, context), undefined);
  }
});
test('read and save preserve current scope; transition revokes before awaiting its reply', () => {
  const { life, origin } = setup();
  life.begin('object-geometry-query', { ...context, requestId: 2 });
  assert(origin.authority(), 'reading object geometry must preserve document read authority');
  assert.equal(surfaceOperation('page-restarts-query'), undefined);
  assert.equal(surfaceOperation('edit-page-restart'), undefined);
  assert.equal(surfaceOperation('hwp5-equation-script-capture'), undefined);
  assert.equal(surfaceOperation('hwp5-equation-script-close'), undefined);
  assert.equal(surfaceOperation('hwp5-equation-script-edit'), undefined);
  life.begin('hwp5-equation-script-capture');
  assert(origin.authority());
  life.begin('hwp5-equation-script-close');
  assert(origin.authority());
  life.begin('page-restarts-query');
  assert(origin.authority(), 'typed restart query must preserve current read authority');
  life.begin('hwp5-chart-data-capture');
  assert(origin.authority());
  life.begin('save');
  assert(origin.authority());
  life.begin('hwp5-chart-data-apply');
  assert.equal(origin.authority(), false);
});
test('late read response cannot revive a revoked publication', () => {
  const { life, origin } = setup();
  const oldTicket = life.begin('document-text-read-binding');
  life.begin('undo');
  const r = reply('document-text-read-binding');
  life.publish(oldTicket, r, context, 2, true);
  assert.equal(life.consume(r, context), undefined);
  assert.equal(origin.authority(), false);
});
test('new content, dispose and adapter authority loss reject old states', () => {
  for (const mode of ['content', 'dispose', 'invalid']) {
    const { life, origin, stop } = setup();
    const s = state({ format: 'hwp5' });
    observeNativeReadSource(s, origin);
    assert(readNativeReadSourceEvidence(s));
    if (mode === 'content') {
      const r = reply('refresh');
      life.publish(life.begin('refresh'), r, context, 2, true);
    } else if (mode === 'dispose') life.revoke();
    else stop();
    assert.equal(readNativeReadSourceEvidence(s), undefined);
  }
});
test('wrong request context and consumed reply cannot replay origin', () => {
  const { life } = setup();
  const r = reply();
  life.publish(life.begin('enable'), r, context, 2, true);
  assert.equal(life.consume(r, { ...context, requestId: 99 }), undefined);
  assert.equal(life.consume(r, context), undefined);
});
test('successful apply, undo, redo and refresh need exact Core reserved publication revision', () => {
  for (const kind of [
    'hwp5-chart-data-apply',
    'edit-page-restart',
    'hwp5-equation-script-edit',
    'undo',
    'redo',
    'refresh',
  ]) {
    const { life } = setup();
    const r = reply(kind);
    life.publish(life.begin(kind), r, context, 2, true);
    const origin = life.consume(r, context)!;
    const s = state(r.content, 2);
    observeNativeReadSource(s, origin, context);
    assert.equal(readNativeReadSourceEvidence(s), undefined);
    observeNativeReadSource(s, origin, undefined, {
      context: { ...context, requestId: 99 },
      operationRevision: 2,
      kind,
    });
    assert.equal(readNativeReadSourceEvidence(s), undefined);
    observeNativeReadSource(s, origin, undefined, { context, operationRevision: 3, kind });
    assert.equal(readNativeReadSourceEvidence(s), undefined);
    observeNativeReadSource(s, origin, undefined, { context, operationRevision: 2, kind });
    assert(readNativeReadSourceEvidence(s));
  }
});
test('read query cannot use committed mutation revision and copied state has no private brand', () => {
  const { life } = setup();
  const r = reply('document-text-read-binding');
  life.publish(life.begin(r.kind), r, context, 2, true);
  const origin = life.consume(r, context)!;
  const s = state(r.content, 2);
  observeNativeReadSource(s, origin, undefined, {
    context,
    operationRevision: 2,
    kind: 'hwp5-chart-data-apply',
  });
  assert.equal(readNativeReadSourceEvidence(s), undefined);
  const current = state(r.content);
  observeNativeReadSource(current, origin);
  assert(readNativeReadSourceEvidence(current));
  assert.equal(readNativeReadSourceEvidence(state(r.content)), undefined);
});
test('save acknowledgement can inherit only identical document content operation and view', () => {
  const { origin } = setup();
  const content = { format: 'hwp5' };
  const s = state(content);
  observeNativeReadSource(s, origin);
  const saved = state(s.content as object);
  inheritNativeReadSource(s, saved);
  assert(readNativeReadSourceEvidence(saved));
  for (const next of [state({ format: 'hwp5' }), state(s.content as object, 2)]) {
    inheritNativeReadSource(s, next);
    assert.equal(readNativeReadSourceEvidence(next), undefined);
  }
});

test('unchanged recovery requires authenticated reply, identical binding and same mutation request fence', () => {
  for (const [kind, mode] of [
    'same',
    'changed-binding',
    'other-operation',
    'other-document',
    'untrusted',
    'unknown-error',
    'new-transition',
  ].flatMap((mode) => ['hwp5-chart-data-apply', 'edit-page-restart'].map((kind) => [kind, mode]))) {
    const { life, origin } = setup();
    const mutationContext = { ...context, operationRevision: 2, requestId: 2 };
    const ticket = life.begin(kind, mutationContext);
    const unchanged = {
      kind,
      error: mode === 'unknown-error' ? 'Unknown' : 'Predictable',
      meta: { application: mode === 'unknown-error' ? 'unknown' : 'unapplied', changed: false },
    };
    life.publish(ticket, unchanged, mutationContext, 2, mode !== 'untrusted');
    assert.equal(origin.authority(), false);
    const queryContext = {
      ...mutationContext,
      requestId: 3,
      ...(mode === 'other-operation' ? { operationRevision: 3 } : {}),
      ...(mode === 'other-document' ? { documentId: 'other' } : {}),
    };
    if (mode === 'new-transition') life.begin('refresh', queryContext);
    const r = {
      kind: 'document-text-read-binding',
      documentTextReadBinding: {
        ...binding,
        ...(mode === 'changed-binding' ? { serial: '3' } : {}),
      },
    };
    life.publish(life.begin(r.kind, queryContext), r, queryContext, 3, true);
    const fresh = life.consume(r, queryContext);
    assert.equal(!!fresh, mode === 'same');
    assert.equal(origin.authority(), false);
    if (fresh) assert.notEqual(fresh.sourceContext, origin.sourceContext);
  }
});
