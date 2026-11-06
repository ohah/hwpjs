import test from 'node:test';
import assert from 'node:assert/strict';
import { copyNewDocumentOutput } from '../../js/new-document.mjs';
function fake(overrides = {}) {
  const memory = new WebAssembly.Memory({ initial: 1 });
  new Uint8Array(memory.buffer).set([7, 8], 16);
  const events = [];
  return {
    events,
    wasm: {
      memory,
      new_document_create(format) {
        events.push(format);
        return 1;
      },
      new_document_output_ptr: () => 16,
      new_document_output_len: () => 2,
      new_document_output_free() {
        events.push('free');
        new Uint8Array(memory.buffer).fill(0);
      },
      cfb_error_ptr: () => 32,
      cfb_error_len: () => 3,
      ...overrides,
    },
  };
}
for (const [format, tag] of [
  ['hwp5', 1],
  ['hwpx', 2],
])
  test(`${format} copies output before freeing`, () => {
    const { wasm, events } = fake();
    assert.deepEqual(copyNewDocumentOutput(wasm, format), new Uint8Array([7, 8]));
    assert.deepEqual(events, [tag, 'free']);
  });
test('default is HWPX; invalid format and missing capability never enter constructor', () => {
  const { wasm, events } = fake();
  copyNewDocumentOutput(wasm);
  assert.equal(events[0], 2);
  assert.throws(() => copyNewDocumentOutput(wasm, 'bad'), /InvalidDocumentFormat/);
  assert.throws(
    () => copyNewDocumentOutput({ ...wasm, new_document_create: null }),
    /NewDocumentUnsupported/,
  );
  assert.deepEqual(events, [2, 'free']);
});
test('zero failure reads shared error and releases the output', () => {
  const { wasm, events } = fake({ new_document_create: () => 0 });
  new Uint8Array(wasm.memory.buffer).set(new TextEncoder().encode('OOM'), 32);
  assert.throws(() => copyNewDocumentOutput(wasm), /OOM/);
  assert.deepEqual(events, ['free']);
});
for (const [ptr, len] of [
  [0, 0],
  [-1, 2],
  [65535, 2],
  [1, NaN],
  [1, 0x100000000],
])
  test(`invalid output ${ptr}/${len} frees without copying`, () => {
    const { wasm, events } = fake({
      new_document_output_ptr: () => ptr,
      new_document_output_len: () => len,
    });
    assert.throws(() => copyNewDocumentOutput(wasm), /InvalidNewDocumentOutput/);
    assert.deepEqual(events, [2, 'free']);
  });
test('constructor throw still releases output', () => {
  const { wasm, events } = fake({
    new_document_create() {
      throw Error('Trap');
    },
  });
  assert.throws(() => copyNewDocumentOutput(wasm), /Trap/);
  assert.deepEqual(events, ['free']);
});
