import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkedCellInsetsObservation,
  checkedCellInsetsPatch,
  checkedCellInsetsRequest,
  createOriginalCellInsetsApi,
} from '../../../../js/original-cell-insets.mjs';
const before = {
  schemaVersion: 1,
  format: 'hwp5',
  section: 0,
  paragraph: 0,
  tableNode: 2,
  listNode: 3,
  lease: '8',
  historyRevision: 0,
  editable: true,
  mode: 'inherit',
  effective: [1, 2, 3, 4],
  tableDefaults: [1, 2, 3, 4],
  frame: { width: 100, height: 100 },
  scope: '12345678-1234-4123-8123-123456789abc',
};
for (const patch of [{ mode: 'custom', left: 0 }, { mode: 'custom' }, { mode: 'inherit' }])
  test('strict accepted patch ' + JSON.stringify(patch), () =>
    assert.deepEqual(checkedCellInsetsPatch(patch), patch),
  );
for (const patch of [
  { mode: 'inherit', left: 0 },
  { mode: 'custom', left: null },
  { mode: 'custom', left: undefined },
  { mode: 'custom', left: -0 },
  { mode: 'custom', left: 32768 },
  { mode: 'custom', left: '0' },
  { mode: 'custom', nope: 1 },
])
  test('strict rejected patch ' + JSON.stringify(patch), () =>
    assert.throws(() => checkedCellInsetsPatch(patch)),
  );
test('strict arrays reject accessors/extras and own normalized clone does not alias input', () => {
  const got = checkedCellInsetsObservation(before);
  assert.notEqual(got.effective, before.effective);
  assert.ok(Object.isFrozen(got.effective));
  const extra = [1, 2, 3, 4];
  extra.extra = 0;
  assert.throws(() => checkedCellInsetsObservation({ ...before, effective: extra }));
  const accessor = [1, 2, 3, 4];
  Object.defineProperty(accessor, 0, {
    get() {
      throw Error('getter executed');
    },
  });
  assert.throws(
    () => checkedCellInsetsObservation({ ...before, effective: accessor }),
    /InvalidCellInsetsObservation/,
  );
});
test('readonly lease is null and never writable; strict inner box remains enforced', () => {
  const ro = checkedCellInsetsObservation({ ...before, editable: false, lease: null });
  assert.equal(ro.lease, null);
  assert.throws(() => checkedCellInsetsRequest({ before: ro, patch: { mode: 'inherit' } }));
  assert.throws(() => checkedCellInsetsObservation({ ...before, editable: false }));
  assert.throws(() => checkedCellInsetsRequest({ before, patch: { mode: 'custom', left: 99 } }));
});
test('partial Native export groups refuse without invoking query or fallback', () => {
  const api = createOriginalCellInsetsApi({
    wasm: { hwp5_edit_original_cell_insets_version: () => 1 },
    memory: {},
    check() {},
    prefix: 'hwp5_edit',
  });
  assert.equal(api.supportsOriginalCellInsets(), false);
  assert.throws(
    () => api.originalCellInsets({ section: 0, paragraph: 0, tableNode: 2, listNode: 3 }),
    /Unavailable/,
  );
});
