import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFormAutoSizeFrames,
  resolveFormAutoSizeFrame,
} from '../web/preview/form-autosize-frame.mjs';
const context = () => ({
  kind: 'edit',
  label: 'A\r\nB',
  font: '11pt Test',
  lineHeight: 14.5,
  multiline: true,
  wordWrap: true,
  storedFrame: { width: 80, height: 20 },
});
const measured = { width: 140, height: 45, units: 'document-css-px', scale: 1 };
function setup() {
  const store = createFormAutoSizeFrames(),
    snapshot = {},
    owner = Object.freeze({ formNode: 7, editable: false });
  store.begin(snapshot, [owner]);
  return { store, snapshot, owner, ctx: context() };
}
test('derived display frame is separate from frozen source dimensions and permission', () => {
  const { store, snapshot, owner, ctx } = setup();
  Object.freeze(ctx.storedFrame);
  const ticket = store.issue(snapshot, owner, ctx);
  assert.equal(store.resolve(snapshot, owner, ctx), null);
  store.commit(ticket, measured);
  const got = store.resolve(snapshot, owner, ctx);
  assert.equal(got.width, 140);
  assert.deepEqual(got.storedFrame, { width: 80, height: 20 });
  assert.equal(owner.editable, false);
  assert.equal('editable' in got, false);
  assert(Object.isFrozen(got));
  assert(Object.isFrozen(got.storedFrame));
  assert.deepEqual(
    [1, 1.25, 2].map((z) => got.width * z),
    [140, 175, 280],
  );
  assert.deepEqual(ctx.storedFrame, { width: 80, height: 20 });
});
test('no authoritative measurement produces no guessed source-frame fallback', () => {
  const { store, snapshot, owner, ctx } = setup();
  assert.equal(resolveFormAutoSizeFrame(undefined, snapshot, owner, ctx), null);
  assert.equal(store.resolve(snapshot, owner, ctx), null);
  assert.equal(
    resolveFormAutoSizeFrame(
      {
        resolve() {
          return measured;
        },
      },
      snapshot,
      owner,
      ctx,
    ),
    null,
  );
});
test('foreign equal-number owner and different document cannot borrow receipt', () => {
  const { store, snapshot, owner, ctx } = setup();
  assert.throws(() => store.issue(snapshot, { formNode: 7 }, ctx), /Stale/);
  assert.throws(() => store.issue({}, owner, ctx), /Stale/);
  assert.equal(store.resolve(snapshot, { formNode: 7 }, ctx), null);
});
test('undo ABA with identical source object still needs a new epoch receipt', () => {
  const { store, snapshot, owner, ctx } = setup();
  const ticket = store.issue(snapshot, owner, ctx);
  store.begin({}, [owner]);
  store.begin(snapshot, [owner]);
  assert.throws(() => store.commit(ticket, measured), /Stale/);
  assert.equal(store.resolve(snapshot, owner, ctx), null);
});
test('font loading epoch invalidates even unchanged source/font strings', () => {
  const { store, snapshot, owner, ctx } = setup();
  const t = store.issue(snapshot, owner, ctx);
  store.commit(t, measured);
  store.begin(snapshot, [owner]);
  assert.equal(store.resolve(snapshot, owner, ctx), null);
});
test('raw EOL/font/line height/mode/source geometry must match current signature', () => {
  const { store, snapshot, owner, ctx } = setup();
  store.commit(store.issue(snapshot, owner, ctx), measured);
  for (const patch of [
    { label: 'A\nB' },
    { font: '22pt Test' },
    { lineHeight: 29 },
    { wordWrap: false },
    { multiline: false },
    { storedFrame: { width: 81, height: 20 } },
  ])
    assert.equal(store.resolve(snapshot, owner, { ...ctx, ...patch }), null);
});
test('superseded or duplicate receipt cannot replace current geometry', () => {
  const { store, snapshot, owner, ctx } = setup();
  const a = store.issue(snapshot, owner, ctx),
    b = store.issue(snapshot, owner, ctx);
  assert.throws(() => store.commit(a, measured), /Stale/);
  store.commit(b, measured);
  assert.throws(() => store.commit(b, measured), /Stale/);
});
test('screen-scaled, wrong units and invalid dimensions fail without a commit', () => {
  for (const patch of [
    { scale: 1.25 },
    { units: 'hwp-unit' },
    { width: 0 },
    { height: -1 },
    { width: Infinity },
    { height: NaN },
  ]) {
    const { store, snapshot, owner, ctx } = setup();
    const t = store.issue(snapshot, owner, ctx);
    assert.throws(() => store.commit(t, { ...measured, ...patch }), /Invalid/);
    assert.equal(store.resolve(snapshot, owner, ctx), null);
  }
});
test('untrusted context and repeated owner admission are rejected', () => {
  const store = createFormAutoSizeFrames(),
    owner = {};
  assert.throws(() => store.begin({}, [owner, owner]), /Invalid/);
  store.begin({}, [owner]);
  const { store: s, snapshot, owner: o, ctx } = setup();
  for (const patch of [
    { label: '\ud800' },
    { label: 'x'.repeat(65536) },
    { font: '' },
    { lineHeight: 0 },
  ])
    assert.throws(() => s.issue(snapshot, o, { ...ctx, ...patch }), /Invalid/);
});
test('dispose releases the active generation and refuses all old work', () => {
  const { store, snapshot, owner, ctx } = setup();
  const t = store.issue(snapshot, owner, ctx);
  store.dispose();
  assert.equal(store.resolve(snapshot, owner, ctx), null);
  assert.throws(() => store.commit(t, measured), /Stale/);
  assert.throws(() => store.begin(snapshot, [owner]), /Disposed/);
});

test('one request per pending signature and no repeated provider calls after commit', () => {
  const { store, snapshot, owner, ctx } = setup();
  let calls = 0,
    complete;
  const run = ({ commit }) => {
    calls++;
    complete = commit;
  };
  assert.equal(store.request(snapshot, owner, ctx, run), null);
  assert.equal(store.request(snapshot, owner, ctx, run), null);
  assert.equal(calls, 1);
  complete(measured);
  assert.equal(store.request(snapshot, owner, ctx, run).width, 140);
  assert.equal(calls, 1);
});
test('asynchronous provider commit cannot cross font reset or disposal', () => {
  const { store, snapshot, owner, ctx } = setup();
  let finish;
  store.request(snapshot, owner, ctx, ({ commit }) => {
    finish = commit;
  });
  store.begin(snapshot, [owner]);
  assert.throws(() => finish(measured), /Stale/);
  assert.equal(store.resolve(snapshot, owner, ctx), null);
});

test('failed superseded request cannot erase a newer successfully committed frame', () => {
  const { store, snapshot, owner, ctx } = setup();
  assert.throws(
    () =>
      store.request(snapshot, owner, ctx, () => {
        const changed = { ...ctx, label: 'new current' };
        store.request(snapshot, owner, changed, ({ commit }) => commit(measured));
        throw Error('old provider failed');
      }),
    /old provider failed/,
  );
  assert.equal(store.resolve(snapshot, owner, { ...ctx, label: 'new current' }).width, 140);
  assert.equal(store.resolve(snapshot, owner, ctx), null);
});
test('measurement dimension getters are consumed only once', () => {
  const { store, snapshot, owner, ctx } = setup();
  let reads = 0;
  store.commit(store.issue(snapshot, owner, ctx), {
    get width() {
      reads++;
      return reads === 1 ? 140 : Infinity;
    },
    height: 45,
    units: 'document-css-px',
    scale: 1,
  });
  assert.equal(reads, 1);
  assert.equal(store.resolve(snapshot, owner, ctx).width, 140);
});
test('Name fallback stays distinguishable from empty Text until official mapping is established', () => {
  const { store, snapshot, owner, ctx } = setup();
  const empty = { ...ctx, label: '', name: 'FormName' };
  store.commit(store.issue(snapshot, owner, empty), measured);
  assert.equal(store.resolve(snapshot, owner, { ...empty, name: 'Other' }), null);
  assert.equal(store.resolve(snapshot, owner, { ...empty, label: 'FormName' }), null);
  assert.throws(
    () => store.issue(snapshot, owner, { ...empty, name: 'x'.repeat(65536) }),
    /Invalid/,
  );
});

test('r5: measurement getters cannot publish an old receipt into a reset epoch', () => {
  const { store, snapshot, owner, ctx } = setup();
  const ticket = store.issue(snapshot, owner, ctx);
  assert.throws(
    () =>
      store.commit(ticket, {
        get width() {
          store.begin(snapshot, [owner]);
          return 140;
        },
        height: 45,
        units: 'document-css-px',
        scale: 1,
      }),
    /StaleFormAutoSizeMeasurement/,
  );
  assert.equal(store.resolve(snapshot, owner, ctx), null);
});
