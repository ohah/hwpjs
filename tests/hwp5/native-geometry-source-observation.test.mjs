// Controlled-registry model tests; actual SDK evidence is verified separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeGeometryDeps } from '../../web/preview/native-geometry-deps.mjs';
const prepareOnly = createNativeGeometryDeps;
function fixture() {
  const scope = {},
    lease = {},
    a = Object.freeze({ section: 0, paragraph: 0 });
  const host = {
    width: 800,
    scale: 1,
    dpr: 1,
    fontEpoch: 1,
    decodedResourceEpoch: 1,
    fontKey: 'font',
    textBoundaryIdentity: Object.freeze({}),
    measurementPolicy: Object.freeze({}),
  };
  let current;
  const snapshot = (revision, changes = {}) => {
    const p = Object.freeze({ section: 0, paragraph: 1 });
    const content = Object.freeze({
      format: 'hwp5',
      limited: false,
      paragraphs: Object.freeze([a, p]),
    });
    const evidence = Object.freeze({
      scope,
      resourceLease: lease,
      nativeEpoch: String(revision),
      nativeRevision: revision,
      kind: revision ? 'exclusive-text' : 'full-baseline',
      owner: Object.freeze({ section: 0, paragraph: 1 }),
      ownerTextRunGeneration: revision,
      beforeEpoch: String(revision - 1),
      beforeRevision: revision - 1,
      ...changes,
    });
    current = { content, evidence, p };
    return current;
  };
  const readEvidence = (e, c) =>
    current?.evidence === e && current?.content === c ? e : undefined;
  return { a, host, snapshot, readEvidence };
}
test('source observation preserves continuous owner generations without intermediate preparation', () => {
  const f = fixture(),
    observed = createNativeGeometryDeps(f),
    every = prepareOnly(f),
    skipped = prepareOnly(f);
  let state = f.snapshot(0);
  const first = observed.prepare(state.content, state.evidence, f.host),
    a0 = every.prepare(state.content, state.evidence, f.host),
    b0 = skipped.prepare(state.content, state.evidence, f.host);
  for (let i = 1; i <= 3; i++) {
    state = f.snapshot(i);
    assert.equal(observed.observe(state.content, state.evidence), true);
    assert.equal(observed.stats().accepted, 1);
    assert.equal(observed.stats().enabled, false);
    assert.equal(first.stamp(f.a), null);
    assert.equal(every.prepare(state.content, state.evidence, f.host).key, a0.key);
  }
  const final = observed.prepare(state.content, state.evidence, f.host);
  assert.equal(final.key, first.key);
  assert.equal(final.stamp(f.a), 'native:baseline');
  assert.equal(final.stamp(state.p), 'native:3');
  assert.equal(observed.stats().rebases, 1);
  assert.equal(observed.stats().hostMisses, 1);
  assert.notEqual(skipped.prepare(state.content, state.evidence, f.host).key, b0.key);
  assert.equal(skipped.stats().rebases, 2);
});
test('observe emits no measurement scope and a stale registry observation clears prior stamps', () => {
  const f = fixture(),
    deps = createNativeGeometryDeps(f),
    old = f.snapshot(0);
  const before = deps.prepare(old.content, old.evidence, f.host);
  const next = f.snapshot(1);
  assert.equal(deps.observe(next.content, next.evidence), true);
  assert.equal(deps.stats().accepted, 1);
  assert.equal(deps.observe(old.content, old.evidence), false);
  assert.equal(before.stamp(f.a), null);
  assert.equal(deps.stats().enabled, false);
});
test('source lease changes and gaps remain conservative rebases', () => {
  for (const changes of [{ resourceLease: {} }, { beforeEpoch: 'unknown' }]) {
    const f = fixture(),
      deps = createNativeGeometryDeps(f);
    let x = f.snapshot(0);
    const old = deps.prepare(x.content, x.evidence, f.host);
    x = f.snapshot(1, changes);
    deps.observe(x.content, x.evidence);
    const next = deps.prepare(x.content, x.evidence, f.host);
    assert.notEqual(next.key, old.key);
    assert.equal(deps.stats().rebases, 2);
    assert.equal(old.stamp(f.a), null);
  }
});
test('same-epoch replacement invalidates old content membership before host preparation', () => {
  const f = fixture(),
    deps = createNativeGeometryDeps(f);
  const x = f.snapshot(0);
  const old = deps.prepare(x.content, x.evidence, f.host);
  const y = f.snapshot(0);
  deps.observe(y.content, y.evidence);
  assert.equal(old.stamp(x.p), null);
  const next = deps.prepare(y.content, y.evidence, f.host);
  assert.equal(next.key, old.key);
  assert.equal(next.stamp(y.p), 'native:baseline');
});
test('prepare retains host-before-evidence error precedence', () => {
  const f = fixture(),
    deps = createNativeGeometryDeps(f);
  const x = f.snapshot(1, { kind: 'bad', ownerTextRunGeneration: -1 });
  for (const h of [null, {}, { ...f.host, dpr: 0 }, f.host]) {
    assert.equal(deps.prepare(x.content, x.evidence, h), null);
    assert.equal(
      deps.stats().lastFallback,
      h === f.host ? 'InvalidRegisteredEvidence' : 'UnknownHostDependencies',
    );
  }
});
test('observe never substitutes source validation for current host eligibility', () => {
  const f = fixture(),
    deps = createNativeGeometryDeps(f),
    x = f.snapshot(0);
  deps.observe(x.content, x.evidence);
  assert.equal(deps.stats().enabled, false);
  assert.equal(deps.prepare(x.content, x.evidence, { ...f.host, fontEpoch: -1 }), null);
  assert.equal(deps.stats().lastFallback, 'UnknownHostDependencies');
  const result = deps.prepare(x.content, x.evidence, f.host);
  assert.ok(result);
  deps.clear();
  assert.equal(result.stamp(f.a), null);
});
