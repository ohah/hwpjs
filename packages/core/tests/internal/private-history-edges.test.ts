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

test('정확한 text edge의 undo/redo만 owner를 반환하고 cursor·세대가 전진한다', () => {
  const f = fixture();
  assert.equal(f.start(), true);
  const owner = makeOwner();
  assert.equal(f.record(0, 1, owner), true);
  const cap = f.helper.capture()!;
  const undo = f.move(1, 0, 'undo')!;
  assert.ok(undo);
  assert.deepEqual(undo.owner, owner);
  assert.equal(f.helper.stats().currentRevision, 0);
  assert.ok(undo.generation > cap.generation);
  const redo = f.move(0, 1, 'redo')!;
  assert.ok(redo);
  assert.equal(redo.edgeToken, undo.edgeToken);
  assert.equal(redo.owner, undo.owner);
  assert.equal(f.helper.stats().currentRevision, 1);
  assert.ok(redo.generation > undo.generation);
  assert.equal(Object.isFrozen(redo), true);
  assert.equal(Object.isFrozen(redo.owner), true);
});

test('여러 owner의 edge를 각각 반환하며 owner scalar를 복사해 외부 변이를 차단한다', () => {
  const f = fixture();
  f.start();
  const one: any = makeOwner(1);
  f.record(0, 1, one);
  one.paragraph = 99;
  const two = makeOwner(2);
  f.record(1, 2, two);
  assert.deepEqual(f.move(2, 1, 'undo')!.owner, two);
  assert.equal(f.move(1, 0, 'undo')!.owner.paragraph, 1);
  assert.equal(Object.isFrozen(one), false);
});

test('반대 방향과 같은 from/to의 잘못된 kind는 불변성 근거가 아니다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  assert.equal(f.move(1, 0, 'redo'), null);
  assert.equal(f.helper.stats().enabled, false);
});

test('두 edge를 건너뛰는 undo는 owner를 추정하지 않는다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  f.record(1, 2);
  assert.equal(f.move(2, 0, 'undo'), null);
  assert.equal(f.helper.stats().edges, 0);
});

for (const kind of ['scope', 'lease'] as const)
  test(`값이 같은 ${kind} 복제본도 identity가 다르면 거부한다`, () => {
    const f = fixture();
    f.start();
    f.record(0, 1);
    const extra = kind === 'scope' ? { scope: makeScope() } : { resourceLease: Object.freeze({}) };
    assert.equal(f.move(1, 0, 'undo', extra), null);
    assert.equal(f.helper.stats().edges, 0);
  });

test('query의 scope와 lease도 실제 ACK와 별도로 exact identity 확인한다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  assert.equal(
    f.helper.lookup(f.query(1, 0, 'undo', { scope: makeScope() }), f.proof(f.ack(1, 0, 'undo'))),
    null,
  );
});

test('custom runtime의 same-id JSON/true flag는 private validated capsule이 아니다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const query = f.query(1, 0, 'undo');
  const before = f.calls.length;
  assert.equal(f.helper.lookup(query, { ...f.ack(1, 0, 'undo'), trustedNative: true }), null);
  assert.equal(f.calls.length, before + 1);
  assert.equal(f.helper.stats().enabled, false);
});

test('미검증 begin/record/prune도 authority를 만들지 못한다', () => {
  const f = fixture();
  assert.equal(f.helper.begin(f.base()), false);
  assert.equal(f.helper.capture(), null);
  f.start();
  assert.equal(f.helper.recordVerifiedTextEdge(f.edge(0, 1)), false);
  f.start();
  assert.equal(f.helper.pruneNativeReachable({ revision: 0, trusted: true }), false);
});

test('생성 후 options의 port/한도를 바꿔도 private gate를 교체할 수 없다', () => {
  const options: any = { maxEdges: 1, readValidated: () => undefined };
  const h = createPrivateHistoryEdges(options);
  options.maxEdges = 512;
  options.readValidated = (proof: any) => proof;
  assert.equal(
    h.begin({
      kind: 'baseline',
      scope: makeScope(),
      resourceLease: {},
      serial: 0,
      revision: 0,
      reachableRevisions: [0],
    }),
    false,
  );
  assert.equal(h.stats().limit, 1);
});

test('port는 각 begin/record/lookup/prune에서 정확히 한 번 읽고 추가 Native 조회를 하지 않는다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  f.move(1, 0, 'undo');
  f.prune([0, 1]);
  assert.deepEqual(f.calls, ['begin', 'record', 'lookup', 'prune']);
  assert.equal(f.helper.stats().serial, 2);
});

test('다른 operation으로 발급된 capsule은 재사용되지 않는다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const p = f.proof(f.ack(1, 0, 'undo'), ['record']);
  assert.equal(f.helper.lookup(f.query(1, 0, 'undo'), p), null);
});

test('동일 IDs prune도 capture를 무효화해 지연 ACK를 거부한다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const query = f.query(1, 0, 'undo');
  const ack = f.proof(f.ack(1, 0, 'undo'));
  f.prune([0, 1]);
  assert.equal(f.helper.lookup(query, ack), null);
});

test('undo→redo ABA 뒤 같은 from/to라도 옛 capture와 ACK를 재사용하지 않는다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const query = f.query(1, 0, 'undo'),
    old = f.proof(f.ack(1, 0, 'undo'));
  f.move(1, 0, 'undo');
  f.move(0, 1, 'redo');
  assert.equal(f.helper.lookup(query, old), null);
});

test('숫자 generation을 복제해도 capture identity는 위조할 수 없다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const query = f.query(1, 0, 'undo');
  assert.equal(
    f.helper.lookup(
      { ...query, capture: Object.freeze({ generation: query.expectedGeneration }) },
      f.proof(f.ack(1, 0, 'undo')),
    ),
    null,
  );
});

test('record 사이 지연 ACK와 transition serial gap을 모두 보수 거부한다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const query = f.query(1, 0, 'undo');
  f.record(1, 2);
  assert.equal(f.helper.lookup(query, f.proof(f.ack(1, 0, 'undo'))), null);
  f.start();
  assert.equal(f.record(0, 1, makeOwner(), { serial: 2 }), false);
});

test('실제 ACK from·to·kind·serial 중 하나라도 달라지면 거부한다', () => {
  for (const extra of [{ from: 0 }, { to: 2 }, { kind: 'redo' }, { serial: 7 }]) {
    const f = fixture();
    f.start();
    f.record(0, 1);
    assert.equal(f.move(1, 0, 'undo', extra), null);
  }
});

test('from은 cache 현재 cursor와 같아야 한다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  f.record(1, 2);
  assert.equal(f.move(1, 0, 'undo'), null);
});

test('분기는 Native reachable IDs로 옛 redo edge를 제거하며 새 owner를 보존한다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  f.record(1, 2, makeOwner(2));
  f.move(2, 1, 'undo');
  assert.equal(f.record(1, 3, makeOwner(3), { reachableRevisions: [0, 1, 3] }), true);
  assert.equal(f.helper.stats().edges, 2);
  assert.equal(f.move(3, 1, 'undo', { reachableRevisions: [0, 1, 3] })!.owner.paragraph, 3);
  assert.equal(f.move(1, 3, 'redo', { reachableRevisions: [0, 1, 3] })!.owner.paragraph, 3);
});

test('분기 뒤 same count의 옛 redo 목적지는 재사용하지 않는다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  f.record(1, 2);
  f.move(2, 1, 'undo');
  f.record(1, 3, makeOwner(3), { reachableRevisions: [0, 1, 3] });
  f.move(3, 1, 'undo', { reachableRevisions: [0, 1, 3] });
  assert.equal(f.move(1, 2, 'redo', { reachableRevisions: [0, 1, 3] }), null);
});

test('unreachable endpoint는 삭제하고 다시 같은 ID 목록을 받아도 edge를 재생성하지 않는다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  assert.equal(f.prune([1]), true);
  assert.equal(f.helper.stats().edges, 0);
  assert.equal(f.move(1, 0, 'undo'), null);
});

test('중간 revision이 빠진 Native IDs는 gap을 메우거나 transitive owner를 만들지 않는다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  f.record(1, 2);
  f.prune([0, 2]);
  assert.equal(f.helper.stats().edges, 0);
  assert.equal(f.move(2, 0, 'undo'), null);
});

test('self edge·cycle·conflicting child는 parent/current 숫자가 맞아도 거부한다', () => {
  for (const child of [0, 1, 2]) {
    const f = fixture();
    f.start();
    f.record(0, 1);
    f.record(1, 2);
    assert.equal(f.record(2, child, makeOwner(99), { reachableRevisions: [0, 1, 2] }), false);
    assert.equal(f.helper.stats().edges, 0);
  }
});

test('512 edge까지 보관하고 513번째는 disable하며 조용히 Native 이력을 자르지 않는다', () => {
  const f = fixture();
  f.start();
  for (let i = 1; i <= 512; i++) assert.equal(f.record(i - 1, i), true);
  assert.equal(f.helper.stats().edges, 512);
  assert.equal(f.helper.stats().vertices, 513);
  assert.equal(f.record(512, 513), false);
  assert.equal(f.helper.stats().enabled, false);
  assert.equal(f.helper.stats().edges, 0);
});

for (const limit of [0, -1, 513, NaN, Infinity, 1.5])
  test(`부적합 limit ${limit}은 저장을 enable하지 않는다`, () => {
    const f = fixture(limit);
    assert.equal(f.start(), false);
    assert.equal(f.helper.stats().edges, 0);
  });

test('작은 한도에서도 Native reachable branch pruning을 먼저 적용한다', () => {
  const f = fixture(1);
  f.start();
  f.record(0, 1);
  f.move(1, 0, 'undo');
  assert.equal(f.record(0, 2, makeOwner(2), { reachableRevisions: [0, 2] }), true);
  assert.equal(f.helper.stats().edges, 1);
});

for (const why of [
  'unknown-mutation',
  'refresh',
  'format',
  'gap',
  'document-generation',
  'poison',
] as const)
  test(`${why} reset은 edge와 캡처를 모두 버린다`, () => {
    const f = fixture();
    f.start();
    f.record(0, 1);
    const cap = f.helper.capture();
    f.helper.reset(why);
    assert.equal(f.helper.capture(), null);
    assert.equal(f.helper.stats().edges, 0);
    f.start();
    assert.notEqual(f.helper.capture(), cap);
    assert.equal(f.helper.stats().edges, 0);
  });

test('문서/세대/scope/lease 변경 baseline은 같은 revision도 이전 edge와 분리한다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  const old = f.helper.capture();
  const scope = makeScope({ generation: 2 });
  const lease = Object.freeze({});
  assert.equal(
    f.start({ scope, resourceLease: lease, revision: 1, serial: 5, reachableRevisions: [0, 1] }),
    true,
  );
  assert.equal(f.helper.stats().edges, 0);
  assert.notEqual(f.helper.capture(), old);
});

test('dispose는 terminal이며 같은 검증 capsule로 다시 enable할 수 없다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  f.helper.dispose();
  assert.equal(f.start(), false);
  assert.equal(f.helper.stats().disposed, true);
  assert.equal(f.helper.capture(), null);
  assert.equal(f.helper.stats().edges, 0);
});

test('getter·class·symbol/텍스트 추가 필드를 가진 metadata는 보관하지 않는다', () => {
  const f = fixture();
  let reads = 0;
  const bad: any = f.base();
  Object.defineProperty(bad, 'serial', {
    get() {
      reads++;
      return 0;
    },
  });
  assert.equal(f.helper.begin(f.proof(bad)), false);
  assert.equal(reads, 0);
  f.start();
  assert.equal(f.record(0, 1, { ...makeOwner(), text: 'do-not-retain' } as any), false);
  f.start();
  assert.equal(
    f.helper.recordVerifiedTextEdge(f.proof({ ...f.edge(0, 1), model: { text: 'not a cache' } })),
    false,
  );
  const extraScope = makeScope({ text: 'not scope metadata' });
  assert.equal(f.start({ scope: extraScope }), false);
  assert.equal(f.helper.stats().edges, 0);
});

test('scope는 불변 plain DTO이어야 하며 helper가 외부 입력을 freeze하지 않는다', () => {
  const f = fixture();
  const mutable = { ...f.scope };
  assert.equal(f.start({ scope: mutable }), false);
  assert.equal(Object.isFrozen(mutable), false);
});

test('raw proof는 열거하지 않고 opaque lease 내부도 읽지 않는다', () => {
  const f = fixture();
  let reads = 0;
  const token: any = new Proxy(
    {},
    {
      get() {
        reads++;
        throw Error('proof read');
      },
      ownKeys() {
        reads++;
        throw Error('proof keys');
      },
    },
  );
  assert.equal(f.helper.begin(token), false);
  assert.equal(reads, 0);
  const lease = new Proxy(
    {},
    {
      get() {
        reads++;
        throw Error('lease read');
      },
      ownKeys() {
        reads++;
        throw Error('lease keys');
      },
    },
  );
  assert.equal(f.start({ resourceLease: lease }), true);
  assert.equal(reads, 0);
});

test('뒤늦은 외부 metadata/IDs 변이는 저장된 edge owner를 바꾸지 않는다', () => {
  const f = fixture();
  f.start();
  const meta: any = f.edge(0, 1);
  f.helper.recordVerifiedTextEdge(f.proof(meta));
  meta.owner.sourceNode = 999;
  meta.childRevision = 55;
  meta.reachableRevisions.length = 0;
  assert.equal(f.move(1, 0, 'undo')!.owner.sourceNode, 115);
});

test('Native reachable IDs의 hole/중복/unsafe/current 누락은 reset한다', () => {
  const hole: number[] = [];
  hole.length = 1;
  for (const ids of [hole, [0, 0], [0xffffffff], [Number.MAX_SAFE_INTEGER], []]) {
    const f = fixture();
    assert.equal(f.start({ reachableRevisions: ids }), false);
  }
});

test('revision과 owner 좌표의 unsafe/u32 sentinel을 거부하며 parent null은 보존한다', () => {
  for (const value of [-1, NaN, Infinity, 0xffffffff, Number.MAX_SAFE_INTEGER]) {
    const f = fixture();
    f.start();
    assert.equal(
      f.helper.recordVerifiedTextEdge(f.proof({ ...f.edge(0, 1), childRevision: value })),
      false,
    );
    const g = fixture();
    g.start();
    assert.equal(g.record(0, 1, makeOwner(1, { sourceNode: value })), false);
  }
  const h = fixture();
  h.start();
  h.record(0, 1, makeOwner(1, { parentNode: null }));
  assert.equal(h.move(1, 0, 'undo')!.owner.parentNode, null);
});

test('class와 symbol payload도 curated metadata를 대신하지 못한다', () => {
  const f = fixture();
  class Fake {
    kind = 'baseline';
  }
  assert.equal(f.helper.begin(f.proof(new Fake())), false);
  const raw: any = f.base();
  raw[Symbol('model')] = { text: 'not retained' };
  assert.equal(f.helper.begin(f.proof(raw)), false);
});

test('reachable capsule의 cursor/serial/scope도 현재와 같아야 한다', () => {
  for (const extra of [
    { revision: 0 },
    { serial: 99 },
    { scope: makeScope() },
    { resourceLease: {} },
  ]) {
    const f = fixture();
    f.start();
    f.record(0, 1);
    assert.equal(f.prune([0, 1], extra), false);
    assert.equal(f.helper.stats().enabled, false);
  }
});

test('reachable getter/Proxy 예외는 밖으로 던지지 않고 reset한다', () => {
  const f = fixture();
  const ids = new Proxy([0], {
    get() {
      throw Error('bad ids');
    },
  });
  assert.doesNotThrow(() => assert.equal(f.start({ reachableRevisions: ids }), false));
});

test('private port 예외/Promise/unknown kind는 fail closed이며 모델을 보관하지 않는다', () => {
  for (const readValidated of [
    () => {
      throw Error('unknown');
    },
    () => Promise.resolve({}),
    () => ({ kind: 'format' }),
  ]) {
    const h = createPrivateHistoryEdges({ readValidated: readValidated as any });
    assert.equal(h.begin({}), false);
    assert.equal(h.stats().edges, 0);
  }
});

test('receipt serial은 actual transition 연속+1이며 revision 숫자 순서를 대신 권위로 쓰지 않는다', () => {
  const f = fixture();
  f.start({ revision: 9, serial: 20, reachableRevisions: [9] });
  assert.equal(f.record(9, 3, makeOwner(), { reachableRevisions: [9, 3], serial: 21 }), true);
  assert.ok(f.move(3, 9, 'undo', { reachableRevisions: [9, 3], serial: 22 }));
});

test('한 record를 다시 전달해도 이력 수를 늘리거나 duplicate를 허용하지 않는다', () => {
  const f = fixture();
  f.start();
  const proof = f.proof(f.edge(0, 1));
  assert.equal(f.helper.recordVerifiedTextEdge(proof), true);
  assert.equal(f.helper.recordVerifiedTextEdge(proof), false);
  assert.equal(f.helper.stats().edges, 0);
});

test('query coercion/getter는 실행하지 않고 stats/owner에는 텍스트·모델 payload가 없다', () => {
  const f = fixture();
  f.start();
  f.record(0, 1);
  let calls = 0;
  const q: any = f.query(1, 0, 'undo');
  q.kind = {
    toString() {
      calls++;
      return 'undo';
    },
  };
  assert.equal(f.helper.lookup(q, f.proof(f.ack(1, 0, 'undo'))), null);
  assert.equal(calls, 0);
  const g = fixture();
  g.start();
  g.record(0, 1);
  const result = g.move(1, 0, 'undo')!;
  assert.deepEqual(Object.keys(result.owner), ['section', 'paragraph', 'sourceNode', 'parentNode']);
  assert.deepEqual(Object.keys(result), ['owner', 'edgeToken', 'generation']);
  assert.equal(JSON.stringify(g.helper.stats()).includes('text'), false);
  assert.deepEqual(Object.keys(result.edgeToken), []);
});

test('별도 유한 이력 reference의 300개 분기/undo/redo 전이와 owner가 일치한다', () => {
  const f = fixture(8);
  f.start();
  const undo: number[] = [],
    redo: number[] = [];
  const reference = new Map<number, { parent: number; owner: HistoryOwner }>();
  let current = 0,
    next = 1,
    serial = 0,
    seed = 123456;
  for (let step = 0; step < 300; step++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const action = seed % 3;
    const from = current;
    serial++;
    if (action === 1 && undo.length) {
      const to = undo.pop()!;
      redo.push(current);
      current = to;
      const ids = [...new Set([...undo, current, ...redo])].reverse();
      const before = ids.slice();
      const result = f.helper.lookup(
        f.query(from, to, 'undo'),
        f.proof(f.ack(from, to, 'undo', { serial, reachableRevisions: ids })),
      )!;
      assert.ok(result);
      assert.deepEqual(result.owner, reference.get(from)!.owner);
      assert.deepEqual(ids, before);
    } else if (action === 2 && redo.length) {
      const to = redo.pop()!;
      undo.push(current);
      current = to;
      const ids = [...new Set([...undo, current, ...redo])].reverse();
      const result = f.helper.lookup(
        f.query(from, to, 'redo'),
        f.proof(f.ack(from, to, 'redo', { serial, reachableRevisions: ids })),
      )!;
      assert.ok(result);
      assert.deepEqual(result.owner, reference.get(to)!.owner);
    } else {
      const child = next++,
        owner = makeOwner(step % 31);
      reference.set(child, { parent: current, owner });
      undo.push(current);
      if (undo.length > 8) undo.shift();
      redo.length = 0;
      current = child;
      const ids = [...undo, current].reverse();
      assert.equal(f.record(from, child, owner, { serial, reachableRevisions: ids }), true);
    }
    assert.equal(f.helper.stats().currentRevision, current);
    assert.equal(f.helper.stats().serial, serial);
    assert.ok(f.helper.stats().edges <= 8);
    assert.ok(f.helper.stats().vertices <= 9);
  }
  assert.equal(f.calls.length, 301); // simulated ACKs only; not actual Native call evidence
});
