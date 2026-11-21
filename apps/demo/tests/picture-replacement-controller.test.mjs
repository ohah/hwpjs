import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureReplacementController } from '../src/picture-replacement-controller.ts';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const listeners = new Map(),
    calls = [],
    availability = [],
    statuses = [],
    busy = [];
  let valid = true,
    close = 0,
    clicks = 0,
    removed = false;
  const owner = Object.freeze({ state: {} });
  const file = {
    dataset: {},
    files: [],
    value: '',
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => {
      if (listeners.get(name) === fn) listeners.delete(name);
    },
    click: () => {
      clicks++;
    },
    remove: () => {
      removed = true;
    },
  };
  const port = {
    capture: async () => owner,
    current: (value) => valid && value === owner,
    submit: async (value, bytes) => {
      calls.push({ value, bytes });
      return { status: 'committed-with-snapshot' };
    },
  };
  const controller = createPictureReplacementController({
    root: { ownerDocument: { createElement: () => file }, append() {} },
    port,
    setAvailability: (...value) => availability.push(value),
    setBusy: (value) => busy.push(value),
    onStatus: (value) => statuses.push(value),
    onClose: () => {
      close++;
      controller.dispose();
    },
  });
  return {
    controller,
    port,
    file,
    calls,
    availability,
    statuses,
    busy,
    listeners,
    stale: () => {
      valid = false;
    },
    stats: () => ({ close, clicks, removed }),
    change: () => listeners.get('change')(),
    cancel: () => listeners.get('cancel')(),
  };
}
const file = () => ({ size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
test('chooser stays unavailable until Native owner preparation, then one file creates one command', async () => {
  const f = fixture();
  f.controller.choose();
  assert.equal(f.stats().clicks, 0);
  await f.controller.prepare();
  assert.equal(f.availability.at(-1)[0], true);
  f.controller.choose();
  assert.equal(f.stats().clicks, 1);
  f.file.files = [file()];
  await f.change();
  assert.equal(f.calls.length, 1);
  assert.deepEqual([...f.calls[0].bytes], [1, 2, 3]);
  assert.equal(f.stats().close, 1);
  assert.equal(f.stats().removed, true);
  assert.equal(f.listeners.size, 0);
});
test('cancelled chooser sends nothing and can choose the same filename again', async () => {
  const f = fixture();
  await f.controller.prepare();
  f.controller.choose();
  f.cancel();
  assert.equal(f.calls.length, 0);
  f.controller.choose();
  f.file.files = [file()];
  await f.change();
  assert.equal(f.calls.length, 1);
  assert.equal(f.stats().clicks, 2);
});
test('selection change during file read refuses before command dispatch', async () => {
  const f = fixture(),
    wait = deferred();
  await f.controller.prepare();
  f.controller.choose();
  f.file.files = [{ size: 3, arrayBuffer: () => wait.promise }];
  const pending = f.change();
  f.stale();
  f.controller.check();
  wait.resolve(new ArrayBuffer(3));
  await pending;
  assert.equal(f.calls.length, 0);
  assert.equal(f.availability.at(-1)[0], false);
  f.controller.dispose();
});
test('disposing the dialog during file read prevents late command and removes listeners', async () => {
  const f = fixture(),
    wait = deferred();
  await f.controller.prepare();
  f.controller.choose();
  f.file.files = [{ size: 3, arrayBuffer: () => wait.promise }];
  const pending = f.change();
  f.controller.dispose();
  wait.resolve(new ArrayBuffer(3));
  await pending;
  assert.equal(f.calls.length, 0);
  assert.equal(f.listeners.size, 0);
});
test('Native unavailable result never opens a chooser', async () => {
  const f = fixture();
  f.port.capture = async () => {
    throw Error('PictureReplacementAbiUnavailable');
  };
  await f.controller.prepare();
  f.controller.choose();
  assert.equal(f.stats().clicks, 0);
  assert.equal(f.availability.at(-1)[0], false);
  f.controller.dispose();
});
test('unknown commit is reported once and never automatically retried', async () => {
  const f = fixture();
  f.port.submit = async () => {
    f.calls.push({});
    throw Error('unknown');
  };
  await f.controller.prepare();
  f.controller.choose();
  f.file.files = [file()];
  await f.change();
  assert.equal(f.calls.length, 1);
  assert.equal(f.stats().close, 1);
  assert.equal(f.statuses.length, 1);
  f.controller.choose();
  assert.equal(f.stats().clicks, 1);
});
