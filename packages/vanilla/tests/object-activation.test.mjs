import test from 'node:test';
import assert from 'node:assert/strict';
import { bindObjectActivation } from '../src/object-activation.ts';
const token = () => ({
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 0,
  viewRevision: 0,
});
function setup() {
  let state = { token: token() },
    ready = true,
    fresh = true;
  const canvas = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    }),
    viewport = { scrollTop: 200, scrollLeft: 100 };
  const calls = [],
    errors = [];
  let hit = (x, y) => {
    calls.push([x, y]);
    return Object.freeze({ kind: 'chart', section: 0, wrapper: 7 });
  };
  const binding = bindObjectActivation({
    canvas,
    viewport,
    renderer: {
      viewScale: () => 2,
      isPaintedFrameCurrent: () => fresh,
      objectAtLogicalPoint: (x, y) => hit(x, y),
    },
    capture: () => (ready ? state : undefined),
    onError: (e) => errors.push(e),
  });
  return {
    binding,
    canvas,
    calls,
    errors,
    change: () => {
      state = { token: token() };
    },
    stale: () => {
      fresh = false;
    },
    busy: () => {
      ready = false;
    },
    hit: (fn) => {
      hit = fn;
    },
    emit(props = {}) {
      const e = new Event('dblclick', { cancelable: true });
      Object.assign(e, {
        button: 0,
        clientX: 50,
        clientY: 60,
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        shiftKey: false,
        ...props,
      });
      canvas.dispatchEvent(e);
      return e;
    },
  };
}
test('double-click uses the canonical scroll and zoom projection and emits frozen identity only', () => {
  const f = setup(),
    events = [];
  f.binding.register((e) => events.push(e));
  const e = f.emit();
  assert.deepEqual(f.calls, [[70, 120]]);
  assert.equal(events.length, 1);
  assert.equal(events[0].target.wrapper, 7);
  assert.ok(Object.isFrozen(events[0]) && Object.isFrozen(events[0].token));
  assert.equal(e.defaultPrevented, true);
  f.binding.dispose();
});
test('modifier, busy, stale-frame and missed object events do not activate', () => {
  for (const mutate of [(f) => f.busy(), (f) => f.stale(), (f) => f.hit(() => null)]) {
    const f = setup();
    let n = 0;
    f.binding.register(() => n++);
    mutate(f);
    f.emit();
    assert.equal(n, 0);
    f.binding.dispose();
  }
  const f = setup();
  let n = 0;
  f.binding.register(() => n++);
  for (const props of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 2 },
  ])
    f.emit(props);
  assert.equal(n, 0);
  f.binding.dispose();
});
test('reentry during hit-test or a previous listener fences the remaining activation', () => {
  const f = setup();
  let n = 0;
  f.binding.register(() => n++);
  f.hit(() => {
    f.change();
    return { kind: 'chart', section: 0, wrapper: 7 };
  });
  f.emit();
  assert.equal(n, 0);
  f.binding.dispose();
  const g = setup();
  g.binding.register(() => g.change());
  g.binding.register(() => n++);
  g.emit();
  assert.equal(n, 0);
  g.binding.dispose();
});
test('unsubscribe, disposal and callback failures release owned listeners', async () => {
  const f = setup();
  let n = 0;
  const stop = f.binding.register(() => n++);
  stop();
  f.emit();
  assert.equal(n, 0);
  f.binding.register(() => {
    throw Error('sync');
  });
  f.binding.register(async () => {
    throw Error('async');
  });
  f.emit();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(
    f.errors.map((e) => e.message),
    ['sync', 'async'],
  );
  f.binding.dispose();
  f.emit();
  assert.equal(f.errors.length, 2);
});

test('opening the first UI modal does not suppress other listeners for the same current state', () => {
  let modal = false;
  const state = { token: token() },
    canvas = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    }),
    events = [];
  const binding = bindObjectActivation({
    canvas,
    viewport: { scrollTop: 0, scrollLeft: 0 },
    renderer: {
      viewScale: () => 1,
      isPaintedFrameCurrent: () => true,
      objectAtLogicalPoint: () => ({ kind: 'chart', section: 0, wrapper: 1 }),
    },
    capture: () => (modal ? undefined : state),
    current: (s) => s === state,
    onError: () => {},
  });
  binding.register(() => {
    modal = true;
  });
  binding.register((e) => events.push(e));
  const e = new Event('dblclick', { cancelable: true });
  Object.assign(e, { button: 0, clientX: 1, clientY: 1 });
  canvas.dispatchEvent(e);
  assert.equal(events.length, 1);
  binding.dispose();
});
