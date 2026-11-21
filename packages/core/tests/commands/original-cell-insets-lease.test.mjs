import test from 'node:test';
import assert from 'node:assert/strict';
import { createOriginalCellInsetsApi } from '../../../../js/original-cell-insets.mjs';
const selector = { section: 0, paragraph: 3, tableNode: 2, listNode: 3 };
for (const format of ['hwp5', 'hwpx'])
  for (const outcome of [0, 1, 2, 3])
    test(`${format} cloned nested before accepts structurally and consumes on outcome ${outcome}`, () => {
      const prefix = format + '_edit',
        calls = [];
      const raw = {
        schemaVersion: 1,
        format,
        ...selector,
        paragraph: format === 'hwpx' ? 4 : 3,
        lease: '8',
        historyRevision: 0,
        editable: true,
        mode: 'inherit',
        effective: [1, 2, 3, 4],
        tableDefaults: [1, 2, 3, 4],
        frame: { width: 100, height: 100 },
      };
      const wasm = {
        [prefix + '_original_cell_insets_version']: () => 1,
        [prefix + '_original_cell_insets']: (s, p) => {
          calls.push([s, p]);
          return 1;
        },
        [prefix + '_output_ptr']: () => 1,
        [prefix + '_output_len']: () => 1,
        [prefix + '_output_free']: () => {},
        [prefix + '_set_original_cell_insets']: () => outcome,
      };
      let encoded;
      const memory = {
        copy: () => new TextEncoder().encode(JSON.stringify(raw)),
        error: () => Error('native rejection'),
        withBytes(bytes, fn) {
          encoded = JSON.parse(new TextDecoder().decode(bytes));
          return fn(1, bytes.length);
        },
      };
      const api = createOriginalCellInsetsApi({ wasm, memory, check() {}, prefix });
      const before = api.originalCellInsets(selector);
      assert.deepEqual(calls, [[0, format === 'hwpx' ? 4 : 3]]);
      assert.equal(before.paragraph, 3);
      const clone = structuredClone(before);
      clone.frame = { height: 100, width: 100 };
      const result = api.setOriginalCellInsets({
        before: clone,
        patch: { mode: 'custom', left: 0 },
      });
      assert.equal(result.nativeCode, outcome);
      assert.deepEqual(encoded, { lease: '8', patch: { mode: 'custom', left: 0 } });
      assert.throws(
        () => api.setOriginalCellInsets({ before: clone, patch: { mode: 'custom', left: 0 } }),
        /Stale/,
      );
    });
test('forged nested observation rejects without consuming retained valid before', () => {
  const prefix = 'hwp5_edit';
  const raw = {
    schemaVersion: 1,
    format: 'hwp5',
    ...selector,
    lease: '8',
    historyRevision: 0,
    editable: true,
    mode: 'inherit',
    effective: [1, 2, 3, 4],
    tableDefaults: [1, 2, 3, 4],
    frame: { width: 100, height: 100 },
  };
  let writes = 0;
  const wasm = {
    [prefix + '_original_cell_insets_version']: () => 1,
    [prefix + '_original_cell_insets']: () => 1,
    [prefix + '_output_ptr']: () => 1,
    [prefix + '_output_len']: () => 1,
    [prefix + '_output_free']: () => {},
    [prefix + '_set_original_cell_insets']: () => {
      writes++;
      return 2;
    },
  };
  const memory = {
    copy: () => new TextEncoder().encode(JSON.stringify(raw)),
    withBytes: (b, fn) => fn(1, b.length),
  };
  const api = createOriginalCellInsetsApi({ wasm, memory, check() {}, prefix }),
    before = api.originalCellInsets(selector),
    forged = structuredClone(before);
  forged.frame.width++;
  assert.throws(
    () => api.setOriginalCellInsets({ before: forged, patch: { mode: 'custom' } }),
    /Stale/,
  );
  assert.equal(writes, 0);
  api.setOriginalCellInsets({ before, patch: { mode: 'custom' } });
  assert.equal(writes, 1);
});
