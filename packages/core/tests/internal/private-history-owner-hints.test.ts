import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPrivateHistoryEdges,
  type HistoryScope,
  type HistoryOwner,
  type ValidatedHistoryMetadata,
} from '../../src/internal/private-history-edges.ts';

const makeScope = (extra = {}): HistoryScope =>
  Object.freeze({
    editorId: 'editor',
    documentId: 'document',
    generation: 1,
    referenceScope: 'native-scope',
    nativeContract: 'hwp5-exclusive-text-delta-v1',
    ...extra,
  });
const makeOwner = (paragraph = 15, extra = {}): HistoryOwner => ({
  section: 0,
  paragraph,
  sourceNode: paragraph + 100,
  parentNode: 81,
  ...extra,
});

function fixture(limit = 512) {
  const scope = makeScope(),
    lease = Object.freeze({});
  // Simulates a controller-private validated capsule port, NOT helper authority.
  const proofs = new WeakMap<object, { metadata: any; operations: Set<string> }>();
  const calls: string[] = [];
  const helper = createPrivateHistoryEdges({
    maxEdges: limit,
    readValidated(proof, operation) {
      calls.push(operation);
      return proof && typeof proof === 'object' && proofs.get(proof)?.operations.has(operation)
        ? (proofs.get(proof)!.metadata as ValidatedHistoryMetadata)
        : undefined;
    },
  });
  const proof = (metadata: any, operations = ['begin', 'record', 'lookup', 'prune']) => {
    const token = Object.freeze({});
    proofs.set(token, { metadata, operations: new Set(operations) });
    return token;
  };
  const base = (extra = {}) => ({
    kind: 'baseline',
    scope,
    resourceLease: lease,
    serial: 0,
    revision: 0,
    reachableRevisions: [0],
    ...extra,
  });
  const start = (extra = {}) => helper.begin(proof(base(extra)));
  const edge = (parent: number, child: number, owner = makeOwner(), extra = {}) => ({
    kind: 'text-delta',
    scope,
    resourceLease: lease,
    serial: helper.stats().serial! + 1,
    parentRevision: parent,
    childRevision: child,
    owner,
    reachableRevisions: Array.from({ length: child + 1 }, (_, i) => i),
    ...extra,
  });
  const record = (parent: number, child: number, owner = makeOwner(), extra = {}) =>
    helper.recordVerifiedTextEdge(proof(edge(parent, child, owner, extra)));
  const ack = (from: number, to: number, kind: 'undo' | 'redo', extra = {}) => ({
    kind,
    from,
    to,
    scope,
    resourceLease: lease,
    serial: helper.stats().serial! + 1,
    reachableRevisions: Array.from({ length: Math.max(from, to) + 1 }, (_, i) => i),
    ...extra,
  });
  const query = (from: number, to: number, kind: 'undo' | 'redo', extra = {}) => ({
    from,
    to,
    kind,
    scope,
    resourceLease: lease,
    expectedGeneration: helper.stats().generation,
    capture: helper.capture()!,
    ...extra,
  });
  const move = (from: number, to: number, kind: 'undo' | 'redo', extra = {}) =>
    helper.lookup(query(from, to, kind), proof(ack(from, to, kind, extra)));
  const prune = (ids: any, extra = {}) =>
    helper.pruneNativeReachable(
      proof({
        kind: 'reachable',
        scope,
        resourceLease: lease,
        serial: helper.stats().serial,
        revision: helper.stats().currentRevision,
        reachableRevisions: ids,
        ...extra,
      }),
    );
  return { helper, scope, lease, proof, calls, base, start, edge, record, ack, query, move, prune };
}

test('read-only owner hint neither consumes ACK proof nor advances cursor', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const ticket = f.helper.capture()!;
  const before = f.helper.stats(),
    calls = f.calls.length;
  const hint = f.helper.hint('undo', ticket)!;
  assert(hint);
  assert.equal(hint.from, 1);
  assert.equal(hint.to, 0);
  assert.deepEqual(f.helper.stats(), before);
  assert.equal(f.calls.length, calls);
  assert.equal(f.helper.hint('undo', {} as any), null);
  const actual = f.move(1, 0, 'undo')!;
  assert.equal(actual.edgeToken, hint.edgeToken);
  assert.equal(f.helper.hint('redo', ticket), null, 'old capture cannot plan next operation');
  assert.equal(f.helper.hint('redo', f.helper.capture()!)!.to, 1);
});
test('branch owner hint picks exact retained edge, not last/current owner', () => {
  const f = fixture();
  f.start();
  f.record(0, 1, makeOwner(1));
  f.record(1, 2, makeOwner(2));
  assert.equal(f.helper.hint('undo', f.helper.capture()!)!.owner.paragraph, 2);
  f.move(2, 1, 'undo');
  assert.equal(f.helper.hint('undo', f.helper.capture()!)!.owner.paragraph, 1);
  f.record(1, 3, makeOwner(3), { reachableRevisions: [0, 1, 3] });
  assert.equal(f.helper.hint('undo', f.helper.capture()!)!.to, 1);
  f.move(3, 1, 'undo', { reachableRevisions: [0, 1, 3] });
  assert.equal(f.helper.hint('redo', f.helper.capture()!)!.to, 3);
});
test('512-edge eviction disables hints without changing Native history', () => {
  const f = fixture();
  f.start();
  for (let i = 0; i < 512; i++) assert(f.record(i, i + 1));
  assert(f.helper.hint('undo', f.helper.capture()!));
  assert.equal(f.record(512, 513), false);
  assert.equal(f.helper.hint('undo', f.helper.capture()!), null);
});
for (const reason of ['format', 'unknown-mutation', 'document-generation', 'gap'])
  test(`owner hint invalidated by ${reason}`, () => {
    const f = fixture();
    f.start();
    f.record(0, 1);
    const cap = f.helper.capture()!;
    f.helper.reset(reason as any);
    assert.equal(f.helper.hint('undo', cap), null);
  });
test('dispose blocks hints and metadata cache retains no document text', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const cap = f.helper.capture()!,
    h = f.helper.hint('undo', cap)!;
  assert.deepEqual(Object.keys(h).sort(), ['edgeToken', 'from', 'generation', 'owner', 'to']);
  assert.deepEqual(Object.keys(h.owner).sort(), [
    'paragraph',
    'parentNode',
    'section',
    'sourceNode',
  ]);
  f.helper.dispose();
  assert.equal(f.helper.hint('undo', cap), null);
});

test('round3 owner descriptor reentrancy invalidates capture and cannot expose a hint', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const cap = f.helper.capture()!;
  let nested: unknown = 'not-called';
  const owner = new Proxy(makeOwner(2), {
    ownKeys(target) {
      nested = f.helper.hint('undo', cap);
      f.helper.reset('unknown-mutation');
      return Reflect.ownKeys(target);
    },
  });
  assert.equal(f.record(1, 2, owner), false);
  assert.equal(nested, null);
  assert.equal(f.helper.hint('undo', cap), null);
});
