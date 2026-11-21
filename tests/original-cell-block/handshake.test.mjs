import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOriginalCellVerticalAlignmentBatchApi,
  checkedOriginalCellBlockWitness,
} from '../../js/original-cell-vertical-alignment-batch.mjs';
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
function fixture(format = 'hwpx') {
  const prefix = format === 'hwpx' ? 'hwpx_edit' : 'hwp5_edit';
  const witness = {
    section: 0,
    tableNode: 9,
    rows: 1,
    columns: 2,
    rectangle: { top: 0, left: 0, bottom: 1, right: 2 },
    cells: [
      { listNode: 10, row: 0, column: 0, paragraphs: [format === 'hwpx' ? 1 : 0] },
      { listNode: 20, row: 0, column: 1, paragraphs: [format === 'hwpx' ? 2 : 1] },
    ],
  };
  let input, output;
  let commitCode = 1;
  const calls = [];
  const memory = {
    withBytes(bytes, run) {
      input = bytes;
      return run(0, bytes.length);
    },
    copy() {
      return output.slice();
    },
    error() {
      return Error('NativeDiagnostic');
    },
  };
  const wasm = {
    [`${prefix}_original_cell_vertical_alignment_batch_version`]: () => 1,
    [`${prefix}_original_cell_vertical_alignment_batch`]() {
      const query = JSON.parse(new TextDecoder().decode(input));
      calls.push(['query', query]);
      let raw = {
        schemaVersion: 1,
        format,
        ...query,
        cells: query.cells.map((cell) => ({ ...cell, value: 'TOP', editable: true })),
        lease: '17',
        historyRevision: 0,
        editable: true,
      };
      if (f.mutate) raw = f.mutate(raw);
      output = encode(raw);
      return 1;
    },
    [`${prefix}_set_original_cell_vertical_alignment_batch`]() {
      calls.push(['commit', JSON.parse(new TextDecoder().decode(input))]);
      return commitCode;
    },
    [`${prefix}_output_ptr`]: () => 0,
    [`${prefix}_output_len`]: () => output.length,
    [`${prefix}_output_free`]: () => {},
  };
  const f = {
    witness,
    calls,
    wasm,
    mutate: null,
    setCode(value) {
      commitCode = value;
    },
    api: createOriginalCellVerticalAlignmentBatchApi({ wasm, memory, check() {}, prefix }),
  };
  return f;
}
test('original cell block SDK copies accept structural before and restore checked HX public paragraphs', () => {
  const f = fixture();
  const before = f.api.originalCellVerticalAlignmentBatch(f.witness);
  assert.deepEqual(
    f.calls[0][1].cells.map((cell) => cell.paragraphs),
    [[2], [3]],
  );
  assert.deepEqual(
    before.cells.map((cell) => cell.paragraphs),
    [[1], [2]],
  );
  const cloned = structuredClone(before);
  const reordered = Object.fromEntries(Object.entries(cloned).reverse());
  assert.equal(
    f.api.setOriginalCellVerticalAlignmentBatch({ before: reordered, value: 'BOTTOM' }).application,
    'applied',
  );
  assert.deepEqual(f.calls[1], ['commit', { lease: '17', value: 'BOTTOM' }]);
});
test('original cell block SDK H5 ordinals retain zero and native wrong HX ordinal is refused', () => {
  const h5 = fixture('hwp5');
  h5.api.originalCellVerticalAlignmentBatch(h5.witness);
  assert.deepEqual(h5.calls[0][1].cells[0].paragraphs, [0]);
  const hx = fixture();
  hx.mutate = (raw) => ({
    ...raw,
    cells: raw.cells.map((cell, i) => (i === 0 ? { ...cell, paragraphs: [99] } : cell)),
  });
  assert.throws(
    () => hx.api.originalCellVerticalAlignmentBatch(hx.witness),
    /OriginalCellOwnerMismatch/,
  );
  assert.equal(hx.calls.length, 1);
});
test('original cell block SDK strict witness duplicate sparse accessors and unknown keys refuse', () => {
  const f = fixture();
  assert.throws(() => checkedOriginalCellBlockWitness({ ...f.witness, extra: 1 }));
  assert.throws(() =>
    checkedOriginalCellBlockWitness({
      ...f.witness,
      cells: [f.witness.cells[0], f.witness.cells[0]],
    }),
  );
  const sparseCells = [];
  sparseCells.length = 2;
  assert.throws(() => checkedOriginalCellBlockWitness({ ...f.witness, cells: sparseCells }));
  const bad = { ...f.witness };
  Object.defineProperty(bad, 'section', {
    get() {
      throw Error('GetterExecuted');
    },
    enumerable: true,
  });
  assert.throws(() => checkedOriginalCellBlockWitness(bad), /InvalidObjectGeometryRequest/);
  assert.equal(f.calls.length, 0);
});
test('original cell block SDK modified scalar or membership before cannot replace retained lease', () => {
  for (const change of [
    (before) => before.historyRevision++,
    (before) => (before.cells[0].paragraphs[0] += 10),
    (before) => (before.cells[0].value = 'CENTER'),
  ]) {
    const f = fixture();
    const before = structuredClone(f.api.originalCellVerticalAlignmentBatch(f.witness));
    change(before);
    assert.throws(
      () => f.api.setOriginalCellVerticalAlignmentBatch({ before, value: 'BOTTOM' }),
      /StaleOriginalCellLease/,
    );
    assert.equal(f.calls.length, 1);
  }
});
test('original cell block SDK unknown Native outcome consumes lease without automatic retry', () => {
  const f = fixture();
  const before = f.api.originalCellVerticalAlignmentBatch(f.witness);
  f.setCode(3);
  const result = f.api.setOriginalCellVerticalAlignmentBatch({
    before: structuredClone(before),
    value: 'BOTTOM',
  });
  assert.equal(result.application, 'unknown');
  assert.equal(result.error, 'NativeDiagnostic');
  assert.throws(
    () =>
      f.api.setOriginalCellVerticalAlignmentBatch({
        before: structuredClone(before),
        value: 'BOTTOM',
      }),
    /StaleOriginalCellLease/,
  );
  assert.equal(f.calls.length, 2);
});
test('original cell block SDK unsupported optional exports do not query old engine', () => {
  const f = fixture();
  delete f.wasm.hwpx_edit_original_cell_vertical_alignment_batch_version;
  assert.equal(f.api.supportsOriginalCellVerticalAlignmentBatch(), false);
  assert.throws(() => f.api.originalCellVerticalAlignmentBatch(f.witness), /Unavailable/);
  assert.equal(f.calls.length, 0);
});
