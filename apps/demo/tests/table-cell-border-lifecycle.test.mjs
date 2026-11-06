import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellToolController } from '../src/table-cell-tool-controller.ts';
const tick = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function setup() {
  const capture = {
    state: { editorId: 'e', documentId: 'd', generation: 1, status: 'ready' },
    cell: {},
    reason: null,
    writeReason: null,
  };
  const calls = [];
  let listener,
    handlers,
    stale = false,
    current = capture;
  const view = {
    focus: () => calls.push('focus-dialog'),
    setBusy: (value) => calls.push(['busy', value]),
    setStale: (value) => {
      stale = value;
    },
    setStatus: (value) => calls.push(['error', value]),
    destroy: () => calls.push('destroy'),
  };
  const port = {
    capture: () => {
      calls.push('capture');
      return current;
    },
    isCurrent: (value) => value === current,
    presentation: () => ({ enabled: true }),
    subscribe: (fn) => {
      listener = fn;
      return () => calls.push('unsubscribe');
    },
    apply: async () => ({ status: 'known-no-op' }),
    restoreSelection: async () => false,
    dispose: () => calls.push('dispose'),
  };
  const controller = createTableCellToolController({
    root: { querySelector: () => null },
    port,
    onStatus: (message) => calls.push(message),
    onClose: () => calls.push('focus-canvas'),
    reason: (code) => code,
    messages: { applied: 'applied', refresh: 'refresh', failed: 'failed', uncertain: 'uncertain' },
    createView(_root, _capture, value) {
      handlers = value;
      return view;
    },
  });
  return {
    controller,
    port,
    calls,
    view,
    get handlers() {
      return handlers;
    },
    get stale() {
      return stale;
    },
    publish(value) {
      current = value;
      listener(value.state);
    },
    capture,
  };
}
test('shared closed lifecycle never captures on publications or presentation; repeated open focuses one dialog', () => {
  const s = setup();
  for (let i = 0; i < 10; i++) {
    s.publish(s.capture);
    s.controller.presentation();
  }
  assert.deepEqual(s.calls, []);
  s.controller.open();
  s.controller.open();
  assert.equal(s.calls.filter((c) => c === 'capture').length, 1);
  assert.ok(s.calls.includes('focus-dialog'));
  s.controller.dispose();
  assert.deepEqual(s.calls.slice(-3), ['unsubscribe', 'destroy', 'dispose']);
});
test('shared rejection keeps view open; capability revocation stales and document replacement closes', async () => {
  const s = setup();
  s.port.apply = async () => ({ status: 'rejected-unapplied', error: 'denied' });
  s.controller.open();
  s.handlers.apply({});
  await tick();
  assert.ok(s.calls.some((c) => Array.isArray(c) && c[0] === 'error' && c[1] === 'denied'));
  assert.ok(!s.calls.includes('destroy'));
  s.publish({ ...s.capture, writeReason: 'ReadOnlyDocument' });
  assert.equal(s.stale, 'ReadOnlyDocument');
  s.publish({ ...s.capture, state: { ...s.capture.state, generation: 2 } });
  assert.ok(s.calls.includes('destroy'));
  assert.ok(!s.calls.includes('focus-canvas'));
  s.controller.dispose();
});
test('shared uncertain transport closes once and cannot refocus or reapply old dialog', async () => {
  const s = setup();
  let requests = 0;
  s.port.apply = async () => {
    requests++;
    throw Error('transport');
  };
  s.controller.open();
  const old = s.handlers;
  old.apply({});
  await tick();
  old.apply({});
  old.dismiss();
  await tick();
  assert.equal(requests, 1);
  assert.equal(s.calls.filter((c) => c === 'uncertain').length, 1);
  assert.ok(!s.calls.includes('focus-canvas'));
  s.controller.dispose();
});
