import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('./', import.meta.url));
const source = resolve(root, '../src/worker.ts');
const baseline = false;
const owned = resolve(root, '../src/state/owned.ts');
const pictures = await import(
  new URL('../../../web/preview/picture-resources.mjs', import.meta.url)
);
async function create(t, options = {}) {
  const w = new Worker(new URL('./worker-resource-transfer.fixture.mjs', import.meta.url), {
    workerData: {
      ...options,
      source,
      owned,
      helper: baseline ? null : resolve(root, '../src/internal/worker-resource-reply.ts'),
    },
  });
  t.after(() => w.terminate());
  let seq = 0;
  const pending = new Map();
  let ready;
  const started = new Promise((r, j) => {
    ready = r;
    w.once('error', j);
  });
  w.on('message', (v) => {
    if (v.ready) {
      ready();
      return;
    }
    const p = pending.get(v.id);
    if (p) {
      pending.delete(v.id);
      p.resolve(v);
    }
  });
  await started;
  const request = (message) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, message });
    });
  const init = await request({
    kind: 'initialize-runtime',
    wasmModule: new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
  });
  assert.equal(init.reply.kind, 'initialize-runtime');
  return { request };
}
test('owned resource buffer transfers once; private backing survives', async (t) => {
  const { request } = await create(t);
  const reply = await request({ kind: 'picture-bytes' });
  assert.deepEqual([...reply.reply.bytes], [11, 22, 33]);
  const s = (await request({ kind: 'inspect' })).reply;
  assert.deepEqual(s.previous, [11, 22, 33]);
  const record = s.transport.find((x) => x.id === reply.id);
  assert.equal(record.transfers, 1);
  assert.deepEqual(record.before, [3]);
  assert.deepEqual(record.after, [0]);
});
test('raw reusable buffer stays attached and uses ordinary clone', async (t) => {
  const { request } = await create(t);
  const r = await request({ kind: 'picture-bytes', source: 'reused', raw: true });
  r.reply.bytes[0] = 99;
  const s = (await request({ kind: 'inspect' })).reply;
  assert.equal(s.reusedLength, 4);
  assert.deepEqual(s.reused, [1, 2, 3, 4]);
  assert.equal(s.transport.find((x) => x.id === r.id).transfers, 0);
});
test('owned WASM subview transfers only its new copied buffer', async (t) => {
  const { request } = await create(t);
  const r = await request({ kind: 'picture-bytes', source: 'wasm' });
  assert.deepEqual([...r.reply.bytes], [7, 8, 9]);
  assert.equal(r.reply.bytes.buffer.byteLength, 3);
  const s = (await request({ kind: 'inspect' })).reply;
  assert.equal(s.memoryLength, 65536);
  assert.deepEqual(s.memory, [7, 8, 9]);
  assert.equal(s.transport.find((x) => x.id === r.id).transfers, 1);
});
test('raw WASM memory and raw subview are never detached', async (t) => {
  const { request } = await create(t);
  const a = await request({ kind: 'picture-bytes', source: 'wasm', raw: true });
  const b = await request({ kind: 'picture-bytes', source: 'subview', raw: true });
  const s = (await request({ kind: 'inspect' })).reply;
  assert.equal(s.memoryLength, 65536);
  assert.equal(s.reusedLength, 4);
  for (const id of [a.id, b.id]) assert.equal(s.transport.find((x) => x.id === id).transfers, 0);
});
test('owned sliced bytes expose no adjacent source bytes', async (t) => {
  const { request } = await create(t);
  const r = await request({ kind: 'picture-bytes', source: 'subview' });
  assert.deepEqual([...r.reply.bytes], [2, 3]);
  assert.equal(r.reply.bytes.buffer.byteLength, 2);
  const s = (await request({ kind: 'inspect' })).reply;
  assert.deepEqual(s.reused, [1, 2, 3, 4]);
  assert.equal(s.transport.find((x) => x.id === r.id).transfers, 1);
});
test('mutation, error, and mismatched kind keep ordinary reply semantics', async (t) => {
  const { request } = await create(t);
  const a = await request({ kind: 'splice' });
  const b = await request({ kind: 'picture-bytes', error: true });
  const c = await request({ kind: 'query', replyKind: 'picture-bytes' });
  const s = (await request({ kind: 'inspect' })).reply;
  for (const id of [a.id, b.id, c.id])
    assert.equal(s.transport.find((x) => x.id === id).transfers, 0);
  assert.equal(b.reply.error, 'ResourceRejected');
  assert.equal(c.reply.kind, 'picture-bytes');
});
test('FIFO request IDs and single transport error remain intact', async (t) => {
  const { request } = await create(t);
  const replies = await Promise.all([
    request({ kind: 'picture-bytes', delay: 10 }),
    request({ kind: 'table-background-bytes' }),
    request({ kind: 'failure' }),
  ]);
  assert.deepEqual(
    replies.map((r) => r.id),
    [2, 3, 4],
  );
  assert.equal(replies[2].transportError, 'ControlledResourceFailure');
  const s = (await request({ kind: 'inspect' })).reply;
  assert.equal(s.transport.filter((x) => x.id === 4).length, 1);
  assert.equal(s.transport.filter((x) => x.transfers === 1).length, 2);
});
function resources(request) {
  let decodes = 0,
    closed = 0;
  const r = pictures.createPictureResources({
    read: async () => {
      const v = await request({ kind: 'picture-bytes' });
      return v.reply.bytes;
    },
    decode: async () => {
      decodes++;
      return {
        width: 1,
        height: 1,
        close() {
          closed++;
        },
      };
    },
  });
  return {
    r,
    get decodes() {
      return decodes;
    },
    get closed() {
      return closed;
    },
  };
}
test('unchanged refresh still requests bytes but reuses decoded bitmap', async (t) => {
  const { request } = await create(t);
  const x = resources(request);
  t.after(() => x.r.close());
  await x.r.load(0, 3);
  x.r.refresh();
  await x.r.load(0, 3);
  assert.equal(x.decodes, 1);
  const s = (await request({ kind: 'inspect' })).reply;
  assert.equal(s.transport.filter((x) => x.kind === 'picture-bytes').length, 2);
  assert.deepEqual(s.previous, [11, 22, 33]);
});
test('controlled replacement and undo re-read and replace bitmap', async (t) => {
  const { request } = await create(t);
  const x = resources(request);
  t.after(() => x.r.close());
  await x.r.load(0, 3);
  await request({ kind: 'set-resource', value: [44, 55] });
  x.r.refresh();
  await x.r.load(0, 3);
  await request({ kind: 'set-resource', value: [11, 22, 33] });
  x.r.refresh();
  await x.r.load(0, 3);
  assert.equal(x.decodes, 3);
  assert.equal(x.closed, 2);
  assert.equal(x.r.encodedStats().bytes, 3);
});
test('document clear prevents same node and same bytes bitmap reuse', async (t) => {
  const { request } = await create(t);
  const x = resources(request);
  t.after(() => x.r.close());
  await x.r.load(0, 3);
  x.r.clear();
  await x.r.load(0, 3);
  assert.equal(x.decodes, 2);
  assert.equal(x.closed, 1);
});
test('old in-flight document reply cannot become the current bitmap', async (t) => {
  const { request } = await create(t);
  let count = 0;
  const r = pictures.createPictureResources({
    read: async () => {
      const v = await request({ kind: 'picture-bytes', delay: 20 });
      return v.reply.bytes;
    },
    decode: async () => {
      count++;
      return { width: 1, height: 1, close() {} };
    },
  });
  t.after(() => r.close());
  const old = r.load(0, 3);
  r.clear();
  const current = r.load(0, 3);
  await Promise.all([old, current]);
  assert.equal(count, 1);
  assert.ok(r.get(0, 3).bitmap);
});

test('shared raw buffer is not transferred; owned shared source is rejected', async (t) => {
  const { request } = await create(t);
  const raw = await request({ kind: 'picture-bytes', source: 'shared', raw: true });
  assert.equal(raw.reply.bytes.byteLength, 4);
  const rejected = await request({ kind: 'picture-bytes', source: 'shared' });
  assert.equal(rejected.transportError, 'SharedBufferUnsupported');
  const state = (await request({ kind: 'inspect' })).reply;
  assert.equal(state.transport.find((x) => x.id === raw.id).transfers, 0);
});
test('transfer failure emits one error without resource retry or backing detach', async (t) => {
  const { request } = await create(t, { failTransfer: true });
  const failed = await request({ kind: 'picture-bytes' });
  assert.equal(failed.transportError, 'ControlledPostTransferFailure');
  const state = (await request({ kind: 'inspect' })).reply;
  assert.deepEqual(state.previous, [11, 22, 33]);
  const attempts = state.transport.filter((x) => x.id === failed.id);
  assert.equal(attempts.filter((x) => x.failed === true).length, 1);
  assert.equal(attempts.filter((x) => x.failed !== true).length, 1);
  assert.deepEqual(attempts.find((x) => x.failed).after, [3]);
  const next = await request({ kind: 'picture-bytes' });
  assert.deepEqual([...next.reply.bytes], [11, 22, 33]);
});
