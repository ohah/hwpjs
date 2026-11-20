import test from 'node:test';
import assert from 'node:assert/strict';
import { validDocumentTextReadStamp } from '../../js/document-text-read-stamp.mjs';
import { createDocumentTextAnchorApi } from '../../js/document-text-anchor-api.mjs';
import { createDocumentTextSelectionApi } from '../../js/document-text-selection-api.mjs';

test('Native read counters reject malformed decimal and injected History or authority fields', () => {
  for (const value of [
    null,
    {},
    { epoch: '0', serial: '1' },
    { epoch: '01', serial: '1' },
    { epoch: '1', serial: '18446744073709551616' },
    { epoch: '1', serial: '0', revision: 0 },
    { epoch: '1', serial: '0', executionAuthority: true },
  ])
    assert.equal(validDocumentTextReadStamp(value), false);
  assert.equal(validDocumentTextReadStamp({ epoch: '18446744073709551615', serial: '0' }), true);
});
for (const format of ['hwp5', 'hwpx'])
  for (const kind of ['anchor', 'selection']) {
    test(`${format} ${kind}: carries captured read stamp without replacing it with a newer counter`, () => {
      const prefix = `${format}_edit`;
      let calls = 0,
        allocations = 0,
        frees = 0,
        received;
      const wasm = {
        [`${prefix}_document_text_${kind}`]: () => {
          calls++;
          return 0;
        },
        [`${prefix}_output_ptr`]: () => 0,
        [`${prefix}_output_len`]: () => 0,
        [`${prefix}_output_free`]: () => {
          frees++;
        },
      };
      const api = (
        kind === 'anchor' ? createDocumentTextAnchorApi : createDocumentTextSelectionApi
      )({
        wasm,
        prefix,
        check() {},
        memory: {
          withBytes(bytes, fn) {
            allocations++;
            received = JSON.parse(new TextDecoder().decode(bytes));
            return fn(0, bytes.length);
          },
          error: () => Error('StaleDocumentTextReadBinding'),
        },
      });
      const input = {
        schemaVersion: 1,
        scope: `native-document-text-${kind}`,
        binding: { session: 'native-lifetime', revision: null },
        readBinding: { epoch: '7', serial: '9007199254740993' },
        ...(kind === 'anchor'
          ? { target: { kind: 'paragraph', section: 0, paragraph: 9001, unit: 0, beforeText: 'x' } }
          : { ref: 'old-owner', startUnit: 0, endUnit: 1, expectedOriginal: 'x' }),
      };
      const method = kind === 'anchor' ? 'documentTextAnchor' : 'documentTextSelection';
      assert.throws(() => api[method](input), /StaleDocumentTextReadBinding/);
      assert.deepEqual(received.readBinding, input.readBinding);
      assert.equal(received.binding.revision, null);
      assert.deepEqual({ calls, allocations, frees }, { calls: 1, allocations: 1, frees: 1 });
      input.readBinding = { epoch: '7', serial: '-1' };
      assert.throws(() => api[method](input), /InvalidDocumentText/);
      assert.deepEqual({ calls, allocations, frees }, { calls: 1, allocations: 1, frees: 1 });
    });
  }
