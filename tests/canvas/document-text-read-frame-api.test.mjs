import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentTextAnchorApi } from '../../js/document-text-anchor-api.mjs';
import { createDocumentTextSelectionApi } from '../../js/document-text-selection-api.mjs';
for (const format of ['hwp5', 'hwpx'])
  for (const kind of ['anchor', 'selection']) {
    test(`${format} ${kind}: Native response must echo the queried frame and remain owned after output free`, () => {
      const prefix = `${format}_edit`,
        scope = `native-document-text-${kind}`,
        stamp = { epoch: '7', serial: '9007199254740993' },
        binding = { session: 's7', revision: null };
      const req = {
        schemaVersion: 1,
        scope,
        binding,
        readBinding: stamp,
        ...(kind === 'anchor'
          ? { target: { kind: 'paragraph', section: 0, paragraph: 41, unit: 0, beforeText: 'x' } }
          : { ref: 'd2-native-g1', startUnit: 0, endUnit: 1, expectedOriginal: 'x' }),
      };
      const base = {
        schemaVersion: 1,
        scope,
        binding,
        readBinding: stamp,
        executionAuthority: false,
        format,
        ref: 'd2-native-g1',
        ...(kind === 'anchor'
          ? { coordinateSpace: 'native-read-inventory', startUnit: 0, endUnit: 0 }
          : {
              coordinateSpace: 'native-current-text-observation',
              expectedOriginal: 'x',
              beforeText: 'x',
              target: { kind: 'paragraph', section: 0, paragraph: 41, startUnit: 0, endUnit: 1 },
            }),
      };
      function run(value) {
        let freed = 0;
        const bytes = new TextEncoder().encode(JSON.stringify(value));
        const wasm = {
          [`${prefix}_document_text_${kind}`]: () => 1,
          [`${prefix}_output_ptr`]: () => 0,
          [`${prefix}_output_len`]: () => bytes.length,
          [`${prefix}_output_free`]: () => {
            freed++;
            bytes.fill(0);
          },
        };
        const api = (
          kind === 'anchor' ? createDocumentTextAnchorApi : createDocumentTextSelectionApi
        )({
          wasm,
          prefix,
          check() {},
          memory: { withBytes: (bytes, fn) => fn(0, bytes.length), copy: () => bytes.slice() },
        });
        try {
          return {
            value: api[kind === 'anchor' ? 'documentTextAnchor' : 'documentTextSelection'](req),
            freed: () => freed,
          };
        } catch (error) {
          assert.equal(freed, 1);
          throw error;
        }
      }
      const ok = run(base);
      assert.deepEqual(ok.value.readBinding, stamp);
      assert.equal(ok.freed(), 1);
      for (const patch of [
        { readBinding: undefined },
        { readBinding: { epoch: '7', serial: '2' } },
        { readBinding: { epoch: '8', serial: stamp.serial } },
        { readBinding: { ...stamp, executionAuthority: true } },
      ])
        assert.throws(() => run({ ...base, ...patch }), /MalformedDocumentText/);
    });
  }
