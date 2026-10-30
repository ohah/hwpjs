import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateHistoryEdges } from '../../src/internal/private-history-edges.ts';
const variant = 'candidate';
type Method = 'begin' | 'record' | 'lookup' | 'prune';
type Effect = 'reset' | 'dispose' | 'rebase' | 'nested-prune' | 'nested-record';
function fixture() {
  const scope = Object.freeze({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    referenceScope: 'native',
    nativeContract: 'hwp5-exclusive-text-delta-v1',
  });
  const lease = Object.freeze({});
  const registered = new WeakMap<object, any>();
  let portHook: (() => void) | undefined;
  let portCalls = 0;
  const proof = (metadata: any) => {
    const p = Object.freeze({});
    registered.set(p, metadata);
    return p;
  };
  const h = createPrivateHistoryEdges({
    readValidated(p: any) {
      portCalls++;
      portHook?.();
      return registered.get(p);
    },
  });
  const common = () => ({ scope, resourceLease: lease });
  const base = () => ({
    kind: 'baseline',
    ...common(),
    serial: 0,
    revision: 0,
    reachableRevisions: [0],
  });
  const start = () => h.begin(proof(base()));
  const edge = () => ({
    kind: 'text-delta',
    ...common(),
    serial: 1,
    parentRevision: 0,
    childRevision: 1,
    owner: { section: 0, paragraph: 15, sourceNode: 87, parentNode: 81 },
    reachableRevisions: [0, 1],
  });
  const record = () => h.recordVerifiedTextEdge(proof(edge()));
  function prepare(method: Method) {
    start();
    if (method === 'lookup' || method === 'prune') record();
    const metadata =
      method === 'begin'
        ? base()
        : method === 'record'
          ? edge()
          : method === 'lookup'
            ? { kind: 'undo', ...common(), serial: 2, from: 1, to: 0, reachableRevisions: [0, 1] }
            : {
                kind: 'reachable',
                ...common(),
                serial: 1,
                revision: 1,
                reachableRevisions: [0, 1],
              };
    const capture = h.capture()!;
    const query: any = {
      from: 1,
      to: 0,
      kind: 'undo',
      ...common(),
      expectedGeneration: capture.generation,
      capture,
    };
    return { metadata: metadata as any, query };
  }
  const effect = (name: Effect) => {
    if (name === 'reset') h.reset('gap');
    else if (name === 'dispose') h.dispose();
    else if (name === 'rebase') start();
    else if (name === 'nested-prune')
      h.pruneNativeReachable(
        proof({
          kind: 'reachable',
          ...common(),
          serial: h.stats().serial,
          revision: h.stats().currentRevision,
          reachableRevisions: [0, 1],
        }),
      );
    else
      h.recordVerifiedTextEdge(
        proof({
          kind: 'text-delta',
          ...common(),
          serial: h.stats().serial! + 1,
          parentRevision: h.stats().currentRevision,
          childRevision: 99,
          owner: { section: 0, paragraph: 2, sourceNode: 2, parentNode: null },
          reachableRevisions: [0, 1, 99],
        }),
      );
  };
  const invoke = (method: Method, metadata: any, query: any) => {
    const p = proof(metadata);
    return method === 'begin'
      ? h.begin(p)
      : method === 'record'
        ? h.recordVerifiedTextEdge(p)
        : method === 'prune'
          ? h.pruneNativeReachable(p)
          : h.lookup(query, p);
  };
  return {
    h,
    prepare,
    effect,
    invoke,
    setPortHook: (fn?: () => void) => {
      portHook = fn;
    },
    get portCalls() {
      return portCalls;
    },
  };
}
function once(fn: () => void) {
  let ran = false;
  return () => {
    if (!ran) {
      ran = true;
      fn();
    }
  };
}

for (const effect of ['dispose', 'reset'] as const)
  test(`Oracle 확정경로 lookup reachable length ${effect}가 정상값을 반환해도 owner 반환 금지`, () => {
    const f = fixture(),
      { metadata, query } = f.prepare('lookup');
    const run = once(() => f.effect(effect));
    metadata.reachableRevisions = new Proxy([0, 1], {
      get(target, key, receiver) {
        if (key === 'length') run();
        return Reflect.get(target, key, receiver);
      },
    });
    const result = f.invoke('lookup', metadata, query);
    console.log(
      JSON.stringify({
        variant,
        oracleCase: effect,
        ownerReturned: result !== null,
        stats: f.h.stats(),
      }),
    );
    assert.equal(result, null);
    assert.equal(f.h.stats().edges, 0);
  });

for (const method of ['begin', 'record', 'lookup', 'prune'] as const)
  for (const effect of ['reset', 'dispose'] as const)
    for (const surface of [
      'port',
      'metadata-descriptor',
      'reachable-length',
      'reachable-descriptor',
    ] as const)
      test(`${method}: ${surface}의 ${effect} 재진입 후 commit/owner를 거부한다`, () => {
        const f = fixture();
        const prepared = f.prepare(method);
        let metadata = prepared.metadata;
        const run = once(() => f.effect(effect));
        if (surface === 'port') f.setPortHook(run);
        if (surface === 'metadata-descriptor')
          metadata = new Proxy(metadata, {
            getOwnPropertyDescriptor(target, key) {
              if (key === 'kind') run();
              return Reflect.getOwnPropertyDescriptor(target, key);
            },
          });
        if (surface.startsWith('reachable')) {
          metadata.reachableRevisions = new Proxy(metadata.reachableRevisions, {
            get(target, key, receiver) {
              if (surface === 'reachable-length' && key === 'length') run();
              return Reflect.get(target, key, receiver);
            },
            getOwnPropertyDescriptor(target, key) {
              if (surface === 'reachable-descriptor' && key === '0') run();
              return Reflect.getOwnPropertyDescriptor(target, key);
            },
          });
        }
        const result = f.invoke(method, metadata, prepared.query);
        assert.equal(result, method === 'lookup' ? null : false);
        assert.equal(f.h.stats().enabled, false);
        assert.equal(f.h.stats().edges, 0);
        assert.equal(f.h.stats().vertices, 0);
        assert.equal(f.h.capture(), null);
        if (effect === 'dispose') assert.equal(f.h.stats().disposed, true);
      });

for (const method of ['begin', 'record', 'lookup', 'prune'] as const)
  for (const effect of ['rebase', 'nested-prune', 'nested-record'] as const)
    test(`${method}: 정상값 반환 IDs trap의 ${effect}도 외부 ingress를 commit하지 못한다`, () => {
      const f = fixture(),
        prepared = f.prepare(method),
        run = once(() => f.effect(effect));
      prepared.metadata.reachableRevisions = new Proxy(prepared.metadata.reachableRevisions, {
        get(target, key, receiver) {
          if (key === 'length') run();
          return Reflect.get(target, key, receiver);
        },
      });
      const result = f.invoke(method, prepared.metadata, prepared.query);
      assert.equal(result, method === 'lookup' ? null : false);
      assert.equal(f.h.stats().enabled, false);
      assert.equal(f.h.stats().edges, 0);
    });

for (const effect of ['reset', 'dispose'] as const)
  test(`owner descriptor 판독 중 ${effect}도 record를 막는다`, () => {
    const f = fixture(),
      { metadata, query } = f.prepare('record');
    const run = once(() => f.effect(effect));
    metadata.owner = new Proxy(metadata.owner, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'section') run();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    assert.equal(f.invoke('record', metadata, query), false);
    assert.equal(f.h.stats().edges, 0);
  });

for (const effect of ['reset', 'dispose'] as const)
  test(`query descriptor 판독 중 ${effect}도 lookup owner를 막는다`, () => {
    const f = fixture(),
      { metadata, query } = f.prepare('lookup');
    const run = once(() => f.effect(effect));
    const q = new Proxy(query, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'from') run();
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    assert.equal(f.invoke('lookup', metadata, q), null);
    assert.equal(f.h.stats().edges, 0);
  });

test('port의 직접 nested begin은 private port를 재귀 호출하지 않고 fail closed', () => {
  const f = fixture(),
    { metadata, query } = f.prepare('begin');
  const run = once(() => f.effect('rebase'));
  f.setPortHook(run);
  const before = f.portCalls;
  assert.equal(f.invoke('begin', metadata, query), false);
  assert.equal(f.portCalls - before, 1);
  assert.equal(f.h.stats().enabled, false);
});

for (const method of ['begin', 'record', 'lookup', 'prune'] as const)
  test(`${method}: read-only stats 관측만으로는 정상 전이를 차단하지 않는다`, () => {
    const f = fixture(),
      { metadata, query } = f.prepare(method);
    f.setPortHook(() => f.h.stats());
    const result = f.invoke(method, metadata, query);
    if (method === 'lookup') assert.ok(result);
    else assert.equal(result, true);
  });
