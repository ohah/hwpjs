import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { insertDocumentImage } from '../src/insert-image.ts';
const sha = (b) => createHash('sha256').update(b).digest('hex');
// Container signatures only: these DI bytes are not Native document fixtures.
const documentBytes = (format = 'hwp5') =>
  new Uint8Array(
    format === 'hwp5' ? [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] : [80, 75, 3, 4],
  );
function fixture(format = 'hwp5', options = {}) {
  const state = { creates: [], inserts: [], closes: 0 };
  const input = {
    bytes: documentBytes(format),
    wasm: new Uint8Array([0, 97]),
    expectedSha256: sha(documentBytes(format)),
    target: { section: 2, paragraph: format === 'hwp5' ? 0 : 7 },
    unit: 3,
    expectedText: format === 'hwp5' ? 'A😀\r' : 'A😀',
    imageBytes: new Uint8Array([9, 8]),
    width: 7200,
    height: 3600,
  };
  const output = options.output ?? documentBytes(format);
  const deps = {
    async createInserter(wasm) {
      state.creates.push(wasm);
      if (options.createGate) await options.createGate;
      if (options.createError) throw options.createError;
      return {
        async insert(bytes, request) {
          state.inserts.push({
            bytes: bytes.slice(),
            request: { ...request, imageBytes: request.imageBytes.slice() },
          });
          if (options.insertHook) options.insertHook(bytes, request);
          if (options.insertError) throw options.insertError;
          return output;
        },
        async close() {
          state.closes++;
          if (options.closeHook) await options.closeHook(output);
          if (options.closeError) throw options.closeError;
        },
      };
    },
  };
  return { state, input, deps, output };
}

test('both formats forward Native paragraph addresses, raw CR/UTF16 and HWPUNIT without conversion', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const f = fixture(format),
      result = await insertDocumentImage(f.input, f.deps);
    assert.deepEqual(result, {
      format,
      sourceSha256: sha(documentBytes(format)),
      bytes: documentBytes(format),
      imageSha256: sha(new Uint8Array([9, 8])),
      layoutRequiresReflow: true,
      previewStale: true,
    });
    assert.deepEqual(f.state.inserts[0].request, {
      format,
      section: 2,
      paragraph: format === 'hwp5' ? 0 : 7,
      unit: 3,
      expectedText: f.input.expectedText,
      expectedSha256: f.input.expectedSha256,
      imageBytes: f.input.imageBytes,
      width: 7200,
      height: 3600,
    });
    assert.equal(f.state.creates.length, 1);
    assert.equal(f.state.inserts.length, 1);
    assert.equal(f.state.closes, 1);
  }
});

test('stale SHA, invalid format or target fail before creating an instance', async () => {
  const cases = [
    { expectedSha256: '0'.repeat(64) },
    { bytes: new Uint8Array([1, 2, 3]) },
    { unit: 2 },
    { unit: 99 },
    { width: 0 },
    { height: 0x80000000 },
    { expectedText: '\ud800' },
    { target: { section: -1, paragraph: 0 } },
    { target: { section: 0, paragraph: 0, unit: 0 } },
    { expectedSha256: 'A'.repeat(64) },
  ];
  for (const bad of cases) {
    const f = fixture();
    Object.assign(f.input, bad);
    await assert.rejects(insertDocumentImage(f.input, f.deps));
    assert.equal(f.state.creates.length, 0);
  }
  const f = fixture('hwpx');
  f.input.target.paragraph = 0;
  await assert.rejects(insertDocumentImage(f.input, f.deps));
  assert.equal(f.state.creates.length, 0);
});

test('every input buffer and nested scalar is captured before the first await', async () => {
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const f = fixture('hwp5', { createGate: gate });
  const pending = insertDocumentImage(f.input, f.deps);
  f.input.bytes.fill(99);
  f.input.wasm.fill(99);
  f.input.imageBytes.fill(99);
  f.input.target.section = 99;
  f.input.target.paragraph = 99;
  f.input.unit = 0;
  f.input.expectedText = 'changed';
  f.input.expectedSha256 = '0'.repeat(64);
  f.input.width = 1;
  release();
  const result = await pending;
  assert.equal(result.sourceSha256, sha(documentBytes()));
  assert.equal(result.imageSha256, sha(new Uint8Array([9, 8])));
  assert.deepEqual(f.state.creates[0], new Uint8Array([0, 97]));
  assert.deepEqual(f.state.inserts[0].bytes, documentBytes());
  assert.equal(f.state.inserts[0].request.section, 2);
  assert.equal(f.state.inserts[0].request.paragraph, 0);
  assert.equal(f.state.inserts[0].request.expectedText, 'A😀\r');
  assert.equal(f.state.inserts[0].request.unit, 3);
  assert.equal(f.state.inserts[0].request.width, 7200);
});

test('source buffers stay immutable even when injected Native mutates its inputs', async () => {
  const f = fixture('hwpx', {
    insertHook(bytes, request) {
      bytes.fill(0);
      request.imageBytes.fill(0);
    },
  });
  await insertDocumentImage(f.input, f.deps);
  assert.deepEqual(f.input.bytes, documentBytes('hwpx'));
  assert.deepEqual(f.input.wasm, new Uint8Array([0, 97]));
  assert.deepEqual(f.input.imageBytes, new Uint8Array([9, 8]));
});

test('result is owned before close and asynchronous close is awaited', async () => {
  let entered, release;
  const closing = new Promise((r) => {
      entered = r;
    }),
    gate = new Promise((r) => {
      release = r;
    });
  const f = fixture('hwp5', {
    async closeHook(output) {
      output.fill(0);
      entered();
      await gate;
    },
  });
  let finished = false;
  const pending = insertDocumentImage(f.input, f.deps).then((r) => {
    finished = true;
    return r;
  });
  await closing;
  assert.equal(finished, false);
  release();
  const result = await pending;
  assert.deepEqual(result.bytes, documentBytes());
  assert.equal(f.state.closes, 1);
});

test('format-changing, invalid and oversized outputs are refused and still closed', async () => {
  for (const output of [
    documentBytes('hwpx'),
    new Uint8Array(),
    new Uint8Array([1]),
    new Proxy(documentBytes(), {}),
    new Uint8Array(new SharedArrayBuffer(8)),
    new Uint8Array(64 * 1024 * 1024 + 1),
  ]) {
    const f = fixture('hwp5', { output });
    await assert.rejects(insertDocumentImage(f.input, f.deps));
    assert.equal(f.state.closes, 1);
  }
});

test('creation/operation/cleanup errors retain identity including simultaneous errors', async () => {
  const primary = new Error('Native refused top-level/context/text'),
    cleanup = new Error('close failed');
  const a = fixture('hwp5', { createError: primary });
  await assert.rejects(insertDocumentImage(a.input, a.deps), (e) => e === primary);
  assert.equal(a.state.closes, 0);
  const b = fixture('hwp5', { insertError: primary });
  await assert.rejects(insertDocumentImage(b.input, b.deps), (e) => e === primary);
  assert.equal(b.state.closes, 1);
  const c = fixture('hwp5', { insertError: primary, closeError: cleanup });
  await assert.rejects(insertDocumentImage(c.input, c.deps), (e) => {
    assert(e instanceof AggregateError);
    assert.deepEqual(e.errors, [primary, cleanup]);
    return true;
  });
  assert.equal(c.state.closes, 1);
  const d = fixture('hwp5', { closeError: cleanup });
  await assert.rejects(insertDocumentImage(d.input, d.deps), (e) => {
    assert.deepEqual(e.errors, [cleanup]);
    return true;
  });
});

test('own data fields only: accessors and inherited fields are never evaluated', async () => {
  for (const field of Object.keys(fixture().input)) {
    const f = fixture();
    let reads = 0;
    Object.defineProperty(f.input, field, {
      get() {
        reads++;
        throw Error('getter');
      },
    });
    await assert.rejects(insertDocumentImage(f.input, f.deps));
    assert.equal(reads, 0);
    assert.equal(f.state.creates.length, 0);
  }
  for (const field of ['section', 'paragraph']) {
    const f = fixture();
    let reads = 0;
    Object.defineProperty(f.input.target, field, {
      get() {
        reads++;
        throw Error('getter');
      },
    });
    await assert.rejects(insertDocumentImage(f.input, f.deps));
    assert.equal(reads, 0);
  }
  const f = fixture();
  await assert.rejects(insertDocumentImage(Object.create(f.input), f.deps));
  await assert.rejects(
    insertDocumentImage({ ...f.input, target: Object.create(f.input.target) }, f.deps),
  );
  assert.equal(f.state.creates.length, 0);
});

test('shared/proxied inputs and input byte caps reject before creating an instance', async () => {
  for (const field of ['bytes', 'wasm', 'imageBytes'])
    for (const invalid of [
      new Proxy(new Uint8Array([1]), {}),
      new Uint8Array(new SharedArrayBuffer(1)),
    ]) {
      const f = fixture();
      f.input[field] = invalid;
      await assert.rejects(insertDocumentImage(f.input, f.deps));
      assert.equal(f.state.creates.length, 0);
    }
  for (const [field, size] of [
    ['bytes', 64 * 1024 * 1024 + 1],
    ['imageBytes', 8 * 1024 * 1024 + 1],
    ['wasm', 32 * 1024 * 1024 + 1],
  ]) {
    const f = fixture();
    f.input[field] = new Uint8Array(size);
    await assert.rejects(insertDocumentImage(f.input, f.deps));
    assert.equal(f.state.creates.length, 0);
  }
});

test('partial-view subclass/ArrayBuffer inputs reuse safe built-in copying', async () => {
  class Hostile extends Uint8Array {
    [Symbol.iterator]() {
      throw Error('iterator');
    }
    slice() {
      throw Error('slice');
    }
  }
  const f = fixture();
  const doc = new Hostile([99, ...documentBytes(), 99]);
  f.input.bytes = doc.subarray(1, 9);
  f.input.imageBytes = new Uint8Array([9, 8]).buffer;
  f.input.wasm = new Uint8Array([0, 97]).buffer;
  await insertDocumentImage(f.input, f.deps);
  assert.deepEqual(f.state.inserts[0].bytes, documentBytes());
});

test('old valid empty WASM has no insertion ABI and cannot silently fall back to editing', async () => {
  const f = fixture();
  f.input.wasm = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  await assert.rejects(insertDocumentImage(f.input), /ImageInsertionAbiUnavailable/);
});
