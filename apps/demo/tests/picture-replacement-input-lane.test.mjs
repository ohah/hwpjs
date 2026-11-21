import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureReplacementInputLane } from '../src/picture-replacement-input-lane.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  const owner = Object.freeze({});
  const calls = [];
  let selected = owner;
  const port = {
    capture: () => selected,
    isCurrent: (value) => value === selected,
    async submit(value, bytes) {
      calls.push({ owner: value, bytes });
      return { status: 'committed-with-snapshot' };
    },
  };
  const lane = createPictureReplacementInputLane(port);
  return {
    lane,
    port,
    owner,
    calls,
    select: (value) => {
      selected = value;
    },
  };
}
const file = (buffer = new Uint8Array([137, 80, 78, 71]).buffer) => ({
  size: buffer.byteLength,
  arrayBuffer: async () => buffer,
});

test('one input sends exact copied bytes once with the captured owner', async () => {
  const f = fixture(),
    buffer = new Uint8Array([1, 2, 3]).buffer;
  const ticket = f.lane.capture();
  assert.equal((await f.lane.read(ticket, file(buffer))).status, 'committed-with-snapshot');
  new Uint8Array(buffer).fill(9);
  assert.deepEqual([...f.calls[0].bytes], [1, 2, 3]);
  assert.equal(f.calls[0].owner, f.owner);
  assert.equal((await f.lane.read(ticket, file())).status, 'rejected-unapplied');
  assert.equal(f.calls.length, 1);
});
test('selection changed before chooser return refuses without reading', async () => {
  const f = fixture(),
    ticket = f.lane.capture();
  f.select({});
  const result = await f.lane.read(ticket, {
    size: 1,
    arrayBuffer() {
      assert.fail();
    },
  });
  assert.equal(result.error, 'StalePictureReplacementSelection');
  assert.equal(f.calls.length, 0);
});
for (const action of ['selection', 'invalidate', 'cancel', 'dispose']) {
  test(`pending file read refuses after ${action}`, async () => {
    const f = fixture(),
      wait = deferred(),
      ticket = f.lane.capture();
    const pending = f.lane.read(ticket, { size: 4, arrayBuffer: () => wait.promise });
    if (action === 'selection') f.select({});
    else if (action === 'invalidate') f.lane.invalidate();
    else if (action === 'cancel') f.lane.cancel(ticket);
    else f.lane.dispose();
    wait.resolve(new ArrayBuffer(4));
    assert.equal((await pending).error, 'StalePictureReplacementSelection');
    assert.equal(f.calls.length, 0);
  });
}
test('selection away and back remains invalidated', async () => {
  const f = fixture(),
    ticket = f.lane.capture();
  f.select({});
  f.lane.invalidate();
  f.select(f.owner);
  assert.equal((await f.lane.read(ticket, file())).status, 'rejected-unapplied');
  assert.equal(f.calls.length, 0);
});
test('reentrant current-state callback cannot revive an invalidated capture', async () => {
  const f = fixture(),
    ticket = f.lane.capture();
  f.port.isCurrent = () => {
    f.lane.invalidate();
    return true;
  };
  assert.equal((await f.lane.read(ticket, file())).status, 'rejected-unapplied');
  assert.equal(f.calls.length, 0);
});
test('oversized and empty files are refused before allocation', async () => {
  const f = fixture();
  for (const size of [0, 8 * 1024 * 1024 + 1, NaN, -1]) {
    const result = await f.lane.read(f.lane.capture(), {
      size,
      arrayBuffer() {
        assert.fail();
      },
    });
    assert.equal(result.error, 'InvalidPictureReplacementFileSize');
  }
  assert.equal(f.calls.length, 0);
});
test('duplicate read and chooser attempts cannot enqueue a second command', async () => {
  const f = fixture(),
    wait = deferred(),
    ticket = f.lane.capture();
  const pending = f.lane.read(ticket, { size: 4, arrayBuffer: () => wait.promise });
  assert.equal(f.lane.capture(), null);
  assert.equal((await f.lane.read(ticket, file())).status, 'rejected-unapplied');
  wait.resolve(new ArrayBuffer(4));
  await pending;
  assert.equal(f.calls.length, 1);
});
test('unknown command rejection propagates without automatic retry', async () => {
  const f = fixture();
  let attempted = 0;
  f.port.submit = async () => {
    attempted++;
    throw Error('UnknownCommit');
  };
  await assert.rejects(f.lane.read(f.lane.capture(), file()), /UnknownCommit/);
  assert.equal(attempted, 1);
});
test('dismiss after dispatch cannot reopen a second mutation while first is pending', async () => {
  const f = fixture(),
    wait = deferred(),
    ticket = f.lane.capture();
  f.port.submit = () => wait.promise;
  const pending = f.lane.read(ticket, file());
  await Promise.resolve();
  f.lane.cancel(ticket);
  assert.equal(f.lane.capture(), null);
  wait.resolve({ status: 'committed-with-snapshot' });
  assert.equal((await pending).status, 'committed-with-snapshot');
  assert.ok(f.lane.capture());
});
