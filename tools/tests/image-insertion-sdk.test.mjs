import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createImageInserter,
  captureImageInsertionRequest,
  IMAGE_INSERTION_REQUEST_BYTES,
} from '../../js/image-file-insertion.mjs';

const binary = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const module = new WebAssembly.Module(binary);
const sha = '0123456789abcdef'.repeat(4);
const request = (format = 'hwp5') => ({
  format,
  section: 2,
  paragraph: format === 'hwp5' ? 0 : 1,
  unit: 3,
  expectedText: 'A😀Z\r',
  expectedSha256: sha,
  imageBytes: new Uint8Array([9, 8]),
  width: 7200,
  height: 3600,
});
function fixture() {
  const memory = new WebAssembly.Memory({ initial: 4 });
  const state = {
    calls: [],
    frees: [],
    outputFrees: 0,
    pointers: 0,
    allocations: 0,
    pointer: 128,
    length: 4,
    fail: false,
    allocationFailure: -1,
  };
  const message = new TextEncoder().encode('InsertionFailed');
  new Uint8Array(memory.buffer, 256, message.length).set(message);
  let next = 1024;
  const wasm = {
    memory,
    hwpjs_abi_version: () => 6,
    cfb_alloc(length) {
      if (state.allocations++ === state.allocationFailure) return 0;
      const ptr = next;
      next += length + 8;
      return ptr;
    },
    cfb_free(ptr, length) {
      state.frees.push([ptr, length]);
      if (state.freeError) throw state.freeError;
    },
    cfb_error_ptr: () => 256,
    cfb_error_len: () => message.length,
    image_file_insert(...args) {
      const [format, ptr, length, requestPtr, requestLength, imagePtr, imageLength] = args;
      state.calls.push({
        format,
        document: new Uint8Array(memory.buffer, ptr, length).slice(),
        wire: new Uint8Array(memory.buffer, requestPtr, requestLength).slice(),
        image: new Uint8Array(memory.buffer, imagePtr, imageLength).slice(),
        args,
      });
      if (state.hook) state.hook();
      if (state.throwError) throw state.throwError;
      new Uint8Array(memory.buffer, 128, 4).set([80, 75, 3, 4]);
      return state.fail ? 0 : 1;
    },
    image_file_insert_ptr() {
      state.pointers++;
      return state.pointer;
    },
    image_file_insert_len() {
      state.pointers++;
      return state.length;
    },
    image_file_insert_free() {
      state.outputFrees++;
      new Uint8Array(memory.buffer, 128, 4).fill(0);
      if (state.outputFreeError) throw state.outputFreeError;
    },
  };
  const instances = [];
  return {
    state,
    wasm,
    memory,
    instances,
    instantiate: async (m, imports) => {
      instances.push({ module: m, imports });
      return { exports: wasm };
    },
  };
}

test('insertion SDK writes the exact seven-argument ABI and 64B LE raw-text request', async () => {
  for (const [format, code] of [
    ['hwp5', 1],
    ['hwpx', 2],
  ]) {
    const f = fixture(),
      api = await createImageInserter(module, f);
    const r = request(format),
      input = new Uint8Array([1, 2, 3]);
    const output = api.insert(input, r),
      call = f.state.calls[0],
      view = new DataView(call.wire.buffer);
    assert.equal(call.args.length, 7);
    assert.equal(call.format, code);
    assert.deepEqual(
      [...Array(8)].map((_, i) => view.getUint32(i * 4, true)),
      [1, 2, r.paragraph, 3, 7200, 3600, new TextEncoder().encode(r.expectedText).length, 0],
    );
    assert.equal(Buffer.from(call.wire.subarray(32, 64)).toString('hex'), sha);
    assert.equal(new TextDecoder().decode(call.wire.subarray(64)), 'A😀Z\r');
    assert.deepEqual(call.document, input);
    assert.deepEqual(call.image, r.imageBytes);
    assert.deepEqual(output, new Uint8Array([80, 75, 3, 4]));
    assert.equal(f.state.frees.length, 3);
    assert.equal(f.state.outputFrees, 1);
    api.close();
    api.close();
    assert.equal(f.state.outputFrees, 2);
    assert.deepEqual(output, new Uint8Array([80, 75, 3, 4]));
    assert.throws(() => api.insert(input, r), /Closed/);
  }
});

test('insertion ABI is optional ABI6 and each missing export/version/memory is rejected', async () => {
  for (const missing of [
    'image_file_insert',
    'image_file_insert_ptr',
    'image_file_insert_len',
    'image_file_insert_free',
  ]) {
    const f = fixture();
    delete f.wasm[missing];
    await assert.rejects(createImageInserter(module, f), /AbiUnavailable/);
    assert.equal(f.state.calls.length, 0);
  }
  const f = fixture();
  f.wasm.hwpjs_abi_version = () => 7;
  await assert.rejects(createImageInserter(module, f), /AbiVersionMismatch/);
  const g = fixture();
  g.wasm.memory = {};
  await assert.rejects(createImageInserter(module, g), /MissingImageInsertionMemory/);
});

test('request scalars, UTF16 boundary, UTF8 wire budget and native numbering are strict', () => {
  for (const field of ['section', 'paragraph', 'unit'])
    for (const value of [-1, -0, NaN, Infinity, 1.5, '1', 0x100000000])
      assert.throws(() => captureImageInsertionRequest({ ...request(), [field]: value }));
  for (const field of ['width', 'height'])
    for (const value of [0, -0, -1, 1.1, '7200', 0x80000000, Infinity])
      assert.throws(() => captureImageInsertionRequest({ ...request(), [field]: value }));
  assert.throws(() => captureImageInsertionRequest({ ...request('hwpx'), paragraph: 0 }));
  for (const unit of [2, 6])
    assert.throws(() => captureImageInsertionRequest({ ...request(), unit }), /Position/);
  for (const expectedText of ['\ud800', '\udc00'])
    assert.throws(
      () => captureImageInsertionRequest({ ...request(), expectedText, unit: 0 }),
      /Text/,
    );
  for (const expectedSha256 of [null, '', 'A'.repeat(64), 'g'.repeat(64)])
    assert.throws(() => captureImageInsertionRequest({ ...request(), expectedSha256 }), /Sha256/);
  assert.throws(() => captureImageInsertionRequest({ ...request(), format: 'pdf' }));
  assert.throws(() => captureImageInsertionRequest({ ...request(), extra: true }));
  assert.equal(
    captureImageInsertionRequest({ ...request(), unit: 0, expectedText: '\u0002\u0000\r' })
      .expectedText,
    '\u0002\u0000\r',
  );
  const max = IMAGE_INSERTION_REQUEST_BYTES - 64;
  assert.equal(
    captureImageInsertionRequest({ ...request(), expectedText: 'a'.repeat(max), unit: 0 })
      .expectedText.length,
    max,
  );
  assert.throws(
    () =>
      captureImageInsertionRequest({ ...request(), expectedText: 'a'.repeat(max + 1), unit: 0 }),
    /ByteLimit/,
  );
  assert.throws(
    () =>
      captureImageInsertionRequest({
        ...request(),
        expectedText: '누'.repeat(Math.ceil(max / 3) + 1),
        unit: 0,
      }),
    /ByteLimit/,
  );
});

test('Native refusal never reads stale output and frees every acquired input', async () => {
  const f = fixture(),
    api = await createImageInserter(module, f);
  f.state.fail = true;
  assert.throws(() => api.insert(new Uint8Array([1]), request()), /InsertionFailed/);
  assert.equal(f.state.pointers, 0);
  assert.equal(f.state.frees.length, 3);
  assert.equal(f.state.outputFrees, 1);
  f.state.fail = false;
  assert.deepEqual(api.insert(new Uint8Array([1]), request()), new Uint8Array([80, 75, 3, 4]));
  api.close();
});

test('allocation failure at each input frees prior allocations and output state', async () => {
  for (const index of [0, 1, 2]) {
    const f = fixture(),
      api = await createImageInserter(module, f);
    f.state.allocationFailure = index;
    assert.throws(() => api.insert(new Uint8Array([1]), request()), /OutOfMemory/);
    assert.equal(f.state.frees.length, index);
    assert.equal(f.state.outputFrees, 1);
    assert.equal(f.state.calls.length, 0);
    api.close();
  }
});

test('operation, all input frees, output free and close failures preserve their identities', async () => {
  const f = fixture(),
    api = await createImageInserter(module, f);
  const primary = new Error('operation'),
    freeing = new Error('input free'),
    output = new Error('output free');
  Object.assign(f.state, { throwError: primary, freeError: freeing, outputFreeError: output });
  assert.throws(
    () => api.insert(new Uint8Array([1]), request()),
    (error) => {
      assert(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primary, freeing, freeing, freeing, output]);
      return true;
    },
  );
  assert.equal(f.state.frees.length, 3);
  assert.throws(
    () => api.close(),
    (error) => error === output,
  );
  const count = f.state.outputFrees;
  api.close();
  assert.equal(f.state.outputFrees, count);
  assert.throws(() => api.insert(new Uint8Array([1]), request()), /Closed/);
});

test('output pointers, lengths and 64MiB budget are checked before copying', async () => {
  const f = fixture();
  f.memory.grow(1025 - 4);
  const api = await createImageInserter(module, f);
  for (const [pointer, length] of [
    [0, 4],
    [-1, 4],
    [128, 0],
    [128, 64 * 1024 * 1024 + 1],
    [f.memory.buffer.byteLength, 1],
    [128, NaN],
  ]) {
    Object.assign(f.state, { pointer, length });
    assert.throws(() => api.insert(new Uint8Array([1]), request()), /InvalidImageInsertionOutput/);
  }
  assert.equal(f.state.frees.length, 18);
  api.close();
});

test('caller accessors, byte proxies/shared buffers are refused; partial views do not call hooks', async () => {
  const f = fixture(),
    api = await createImageInserter(module, f);
  class Hostile extends Uint8Array {
    [Symbol.iterator]() {
      throw new Error('iterator');
    }
    slice() {
      throw new Error('slice');
    }
  }
  const raw = new Hostile([99, 1, 2, 99]);
  api.insert(raw.subarray(1, 3), { ...request(), imageBytes: new Hostile([9, 8]) });
  assert.deepEqual([...f.state.calls[0].document], [1, 2]);
  for (const invalid of [
    new Proxy(new Uint8Array([1]), {}),
    new Uint8Array(new SharedArrayBuffer(1)),
    new DataView(new ArrayBuffer(1)),
  ]) {
    assert.throws(() => api.insert(invalid, request()));
    assert.throws(() => api.insert(new Uint8Array([1]), { ...request(), imageBytes: invalid }));
  }
  let reads = 0;
  const r = request();
  Object.defineProperty(r, 'expectedText', {
    get() {
      reads++;
      throw new Error('getter');
    },
  });
  assert.throws(() => api.insert(new Uint8Array([1]), r));
  assert.equal(reads, 0);
  assert.throws(() => api.insert(new Uint8Array([1]), Object.create(request())));
  api.close();
});

test('document/image/WASM caps reject before Native and source bytes snapshot before await', async () => {
  const f = fixture(),
    api = await createImageInserter(module, f);
  assert.throws(
    () => api.insert(new Uint8Array(64 * 1024 * 1024 + 1), request()),
    /DocumentByteLimit/,
  );
  assert.throws(
    () =>
      api.insert(new Uint8Array([1]), {
        ...request(),
        imageBytes: new Uint8Array(8 * 1024 * 1024 + 1),
      }),
    /ImageByteLimit/,
  );
  await assert.rejects(createImageInserter(new Uint8Array(32 * 1024 * 1024 + 1)), /WasmByteLimit/);
  assert.equal(f.state.calls.length, 0);
  api.close();
  const source = binary.slice(),
    g = fixture();
  const pending = createImageInserter(source, g);
  source.fill(255);
  const created = await pending;
  assert.equal(g.instances.length, 1);
  created.close();
});

test('reentrant use cannot close or reuse an active transform instance', async () => {
  const f = fixture(),
    api = await createImageInserter(module, f);
  f.state.hook = () => {
    assert.throws(() => api.close(), /Busy/);
    assert.throws(() => api.insert(new Uint8Array([1]), request()), /Busy/);
  };
  api.insert(new Uint8Array([1]), request());
  api.close();
});
