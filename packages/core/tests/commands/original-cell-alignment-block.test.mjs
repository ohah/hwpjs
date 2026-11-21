import assert from 'node:assert/strict';
import test from 'node:test';
import {
  originalCellAlignmentBlockWitness,
  observeOriginalCellAlignmentBlock,
} from '../../src/commands/original-cell-vertical-alignment-batch.ts';

function fixture(format) {
  const cells = [
    { listNode: 5, row: 0, column: 0, rowSpan: 1, columnSpan: 2, paragraphs: [1, 2] },
    { listNode: 8, row: 1, column: 0, rowSpan: 1, columnSpan: 1, paragraphs: [3] },
    { listNode: 10, row: 1, column: 1, rowSpan: 1, columnSpan: 1, paragraphs: [4] },
  ];
  const witness = { section: 0, tableNode: 4, rows: 2, columns: 2, cells };
  const state = {
    status: 'ready',
    nativeHistoryStats: { protocolVersion: 2 },
    capabilities: { originalCellVerticalAlignmentBatchAvailable: true },
    content: {
      format,
      limited: false,
      originalCellVerticalAlignmentBatchAvailable: true,
      tables: [witness],
      paragraphs: cells.flatMap((cell) =>
        cell.paragraphs.map((paragraph) => ({
          section: 0,
          paragraph,
          editable: true,
          tableCell: { tableNode: 4, listNode: cell.listNode },
        })),
      ),
    },
  };
  return { state, witness };
}

for (const format of ['hwp5', 'hwpx']) {
  test(format + ' complete block retains merged and multi-paragraph ownership', () => {
    const { state, witness } = fixture(format);
    const owned = originalCellAlignmentBlockWitness(state, witness);
    assert.deepEqual(owned.rectangle, { top: 0, left: 0, bottom: 2, right: 2 });
    assert.deepEqual(
      owned.cells.map((c) => c.paragraphs),
      [[1, 2], [3], [4]],
    );
    assert(Object.isFrozen(owned.cells[0].paragraphs));
    assert.equal(owned.cells[0].rowSpan, undefined);
    witness.cells[0].paragraphs[0] = 99;
    assert.deepEqual(owned.cells[0].paragraphs, [1, 2]);
  });
}

test('refuses a hole, a forged paragraph and one-owner block before request', () => {
  const { state, witness } = fixture('hwp5');
  assert.throws(
    () =>
      originalCellAlignmentBlockWitness(state, { ...witness, cells: witness.cells.slice(0, 2) }),
    /InvalidSourceTableCellBlock/,
  );
  const [first, ...rest] = witness.cells;
  assert.throws(
    () =>
      originalCellAlignmentBlockWitness(state, {
        ...witness,
        cells: [{ ...first, paragraphs: [1, 4] }, ...rest],
      }),
    /InvalidSourceTableCellBlock/,
  );
  assert.throws(
    () => originalCellAlignmentBlockWitness(state, { ...witness, cells: [first] }),
    /OriginalCellAlignmentBlockRequiresMultipleCells/,
  );
});

test('refuses unavailable, stale or partial document state', () => {
  const { state, witness } = fixture('hwpx');
  for (const update of [
    { capabilities: {} },
    { historyRecoveryRequired: true },
    { content: { ...state.content, limited: true } },
    { status: 'loading' },
  ]) {
    assert.throws(
      () => originalCellAlignmentBlockWitness({ ...state, ...update }, witness),
      /OriginalCellVerticalAlignmentBatchUnavailable/,
    );
  }
});

test('Native observation must match every canonical owner and the current revision', () => {
  const { state, witness } = fixture('hwpx');
  const canonical = originalCellAlignmentBlockWitness(state, witness);
  const receipt = {
    ...canonical,
    schemaVersion: 1,
    format: 'hwpx',
    lease: '1',
    historyRevision: 3,
    editable: true,
    scope: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    cells: canonical.cells.map((cell, i) => ({ ...cell, value: i ? 'TOP' : null, editable: true })),
  };
  assert.equal(observeOriginalCellAlignmentBlock(receipt, canonical, 'hwpx', 3).value, 'mixed');
  assert.throws(
    () => observeOriginalCellAlignmentBlock(receipt, canonical, 'hwpx', 2),
    /OriginalCellAlignmentBlockOwnerMismatch/,
  );
  const [first, second] = receipt.cells;
  for (const cells of [
    [first, first, receipt.cells[2]],
    [first, { ...second, paragraphs: [4] }, receipt.cells[2]],
    [first, { ...second, value: 'LEFT' }, receipt.cells[2]],
  ]) {
    assert.throws(
      () => observeOriginalCellAlignmentBlock({ ...receipt, cells }, canonical, 'hwpx', 3),
      /OriginalCellAlignmentBlockOwnerMismatch|InvalidOriginalCellBlock|UnsupportedCellVerticalAlignment/,
    );
  }
  assert.equal(
    observeOriginalCellAlignmentBlock(
      {
        ...receipt,
        editable: false,
        cells: [first, { ...second, editable: false }, receipt.cells[2]],
      },
      canonical,
      'hwpx',
      3,
    ).editable,
    false,
  );
});
