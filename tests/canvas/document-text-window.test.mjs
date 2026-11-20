import test from 'node:test';
import assert from 'node:assert/strict';
import { documentTextWindow } from '../../web/preview/document-text-window.mjs';
const value = (format, target) => ({
  schemaVersion: 1,
  scope: 'native-document-text-selection',
  executionAuthority: false,
  format,
  target,
});
const projection = {
  paragraphCount: 2,
  events: [
    { kind: 'paragraph_start', section: 0, paragraph: 1 },
    { kind: 'content', section: 0, paragraph: 1, value: 'body' },
    { kind: 'paragraph_end', section: 0, paragraph: 1 },
    { kind: 'paragraph_start', section: 3, paragraph: 9001 },
    { kind: 'content', section: 3, paragraph: 9001, value: 'cell' },
    { kind: 'paragraph_end', section: 3, paragraph: 9001 },
  ],
};
test('HWPX reveal uses Native event-order Map despite large sparse actual paragraph address', () => {
  assert.deepEqual(
    documentTextWindow(
      {},
      projection,
      'hwpx',
      value('hwpx', { kind: 'paragraph', section: 3, paragraph: 9001 }),
    ),
    { offset: 1, count: 1 },
  );
  assert.throws(
    () =>
      documentTextWindow(
        {},
        projection,
        'hwpx',
        value('hwpx', { kind: 'paragraph', section: 3, paragraph: 0xffffffff }),
      ),
    /WindowDependencyBindingMismatch/,
  );
});
test('HWPX pending-cell host comes from actual typed Native snapshot, not paragraph zero', () => {
  const cell = {
    kind: 'created-cell',
    section: 3,
    identity: '18446744073709551615',
    row: 17,
    column: 31,
  };
  const table = {
    identity: cell.identity,
    host_paragraph: 9001,
    cells: [{ row: 17, column: 31, text: 'cell' }],
  };
  assert.deepEqual(
    documentTextWindow({ createdTables: () => [table] }, projection, 'hwpx', value('hwpx', cell)),
    { offset: 1, count: 1 },
  );
  assert.throws(
    () =>
      documentTextWindow(
        { createdTables: () => [{ ...table, host_paragraph: undefined }] },
        projection,
        'hwpx',
        value('hwpx', cell),
      ),
    /MissingCreatedTableHost/,
  );
  assert.throws(
    () =>
      documentTextWindow(
        { createdTables: () => [table, table] },
        projection,
        'hwpx',
        value('hwpx', cell),
      ),
    /AmbiguousCreatedTableIdentity/,
  );
  assert.throws(
    () =>
      documentTextWindow(
        { createdTables: () => [{ ...table, cells: [table.cells[0], table.cells[0]] }] },
        projection,
        'hwpx',
        value('hwpx', cell),
      ),
    /AmbiguousCreatedTableCell/,
  );
});
test('HWP5 zero-based host zero is permitted only when explicitly observed in Native snapshot', () => {
  const p = { sections: [{ index: 0, paragraphs: [{}, {}] }] };
  const target = { kind: 'created-cell', section: 0, identity: '1', row: 0, column: 0 };
  const table = { identity: '1', host_paragraph: 0, cells: [{ row: 0, column: 0, text: '' }] };
  assert.deepEqual(
    documentTextWindow({ createdTables: () => [{ table }] }, p, 'hwp5', value('hwp5', target)),
    { offset: 0, count: 1 },
  );
  assert.throws(
    () =>
      documentTextWindow(
        { createdTables: () => [{ table: { ...table, host_paragraph: undefined } }] },
        p,
        'hwp5',
        value('hwp5', target),
      ),
    /MissingCreatedTableHost/,
  );
  assert.throws(
    () => documentTextWindow({ createdTables: () => [] }, p, 'hwp5', value('hwp5', target)),
    /MissingCreatedTableHost/,
  );
});
test('HWP5 paragraph and format/authority mismatches retain the view-only boundary', () => {
  const p = { sections: [{ index: 0, paragraphs: [{}, {}] }] };
  const target = { kind: 'paragraph', section: 0, paragraph: 1 };
  assert.deepEqual(documentTextWindow({}, p, 'hwp5', value('hwp5', target)), {
    offset: 1,
    count: 1,
  });
  assert.throws(
    () => documentTextWindow({}, p, 'hwp5', value('hwpx', target)),
    /InvalidDocumentTextReveal/,
  );
  assert.throws(
    () => documentTextWindow({}, p, 'hwp5', { ...value('hwp5', target), executionAuthority: true }),
    /InvalidDocumentTextReveal/,
  );
});
