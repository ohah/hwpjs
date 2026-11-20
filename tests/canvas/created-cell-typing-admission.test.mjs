import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareCreatedCellTypingTarget } from '../../web/preview/created-cell-typing-admission.mjs';
function fixture(format) {
  const table = {
    identity: '9',
    cells: [
      { row: 0, column: 0, text: 'A😀B', character_runs: [{ start_unit: 0, char_shape_id: 7 }] },
    ],
  };
  const reference = {
    kind: 'cell',
    section: 0,
    id: '9',
    row: 0,
    column: 0,
    scope: 'native',
    epoch: '2',
  };
  const message = {
    section: 0,
    identity: '9',
    row: 0,
    column: 0,
    startUnit: 3,
    endUnit: 3,
    text: '한',
    createdCellTypingScope: 4,
    expectedHistoryRevision: 5,
    reference,
  };
  const calls = [];
  const editor = {
    supportsCreatedCellTypingAbi: () => true,
    historyRevision: () => 5,
    createdTables: (section) => (
      calls.push(['snapshot', section]),
      format === 'hwp5' ? [{ table, options: {} }] : [table]
    ),
    currentText: (ref) => (
      calls.push(['reference', ref]),
      assert.equal(ref, reference),
      table.cells[0].text + '\r'
    ),
  };
  return { format, editor, message, scope: 4, table, calls };
}
for (const format of ['hwp5', 'hwpx'])
  test(`${format} generated-cell admission uses actual Native snapshot vocabulary without source ordinals`, () => {
    const f = fixture(format);
    const request = prepareCreatedCellTypingTarget(f);
    assert.deepEqual(request, {
      section: 0,
      identity: '9',
      row: 0,
      column: 0,
      startUnit: 3,
      endUnit: 3,
      text: '한',
      insertion: { character: {} },
    });
    assert(!('paragraph' in request));
    assert.equal(f.calls[0][0], 'snapshot');
    assert.equal(f.calls.length, format === 'hwp5' ? 2 : 1);
  });
test('generated-cell admission rejects stale receipts, mixed identities, old snapshots and split scalars before mutation', () => {
  for (const change of [
    (f) => (f.message.expectedHistoryRevision = 4),
    (f) => (f.message.createdCellTypingScope = 3),
    (f) => (f.message.identity = '10'),
    (f) => delete f.table.cells[0].character_runs,
    (f) => (f.message.startUnit = f.message.endUnit = 2),
    (f) => (f.message.reference = { ...f.message.reference, id: '10' }),
    (f) => (f.editor.currentText = () => 'other\r'),
  ]) {
    const f = fixture('hwp5');
    change(f);
    assert.throws(() => prepareCreatedCellTypingTarget(f));
  }
});
test('old Native absence is explicit and never lowered to whole-cell replacement', () => {
  const f = fixture('hwpx');
  f.editor.supportsCreatedCellTypingAbi = () => false;
  assert.throws(() => prepareCreatedCellTypingTarget(f), /CreatedCellTypingUnavailable/);
  assert.deepEqual(f.calls, []);
});
