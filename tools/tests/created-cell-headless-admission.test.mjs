// Controlled Native facade doubles only, not engine or serialized-byte evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  observeCreatedCellTextTarget,
  prepareCreatedCellTypingTarget,
} from '../../web/preview/created-cell-typing-admission.mjs';
const selector = { section: 2, identity: '9007199254740993', row: 0, column: 1 };
function model(format = 'hwpx') {
  const cell = {
    row: 0,
    column: 1,
    text: '앞😀뒤',
    character_runs: [
      { start_unit: 0, char_shape_id: 3 },
      { start_unit: 3, char_shape_id: 7 },
    ],
  };
  const table = { identity: selector.identity, cells: [cell] };
  const ref = {
    kind: 'cell',
    section: 2,
    id: selector.identity,
    row: 0,
    column: 1,
    epoch: 8,
    scope: 'facade-scope',
  };
  let session = 'native-s',
    revision = 4,
    issued = 0;
  const pages = [];
  const editor = {
    supportsCreatedCellTypingAbi: () => true,
    historyRevision: () => revision,
    createdCellTypingCapabilities: () => ({
      schemaVersion: 1,
      atomic: true,
      format,
      coordinateSpace: 'created-cell-utf16',
      requiresHistoryProtocol: 2,
      binding: { session, revision },
      limits: {},
    }),
    createdTables: () => (format === 'hwp5' ? [{ table }] : [table]),
    currentReferences: (section, { first, count }) => {
      assert.equal(section, 2);
      assert.equal(count, 256);
      pages.push(first);
      issued++;
      return { first, total: 1, references: [ref] };
    },
    currentText: (r) => {
      assert.deepEqual(r, ref);
      assert(issued > 0);
      return cell.text + '\r';
    },
  };
  const observe = () => observeCreatedCellTextTarget({ editor, format, selector, scope: 3 });
  const message = (o) => ({
    ...selector,
    startUnit: 3,
    endUnit: 3,
    text: 'D',
    expectedHistoryRevision: 4,
    createdCellTypingScope: 3,
    headlessBinding: o.binding,
    expectedText: o.text,
    ...(o.reference ? { reference: o.reference } : {}),
  });
  return {
    editor,
    cell,
    table,
    ref,
    observe,
    message,
    pages,
    setSession: (s) => {
      session = s;
    },
    setRevision: (n) => {
      revision = n;
    },
  };
}
for (const format of ['hwp5', 'hwpx'])
  test(`controlled ${format}: query and splice share canonical model without a paragraph`, () => {
    const m = model(format),
      o = m.observe();
    assert.equal(o.text, '앞😀뒤');
    assert.equal(o.selector.identity, selector.identity);
    const request = prepareCreatedCellTypingTarget({
      editor: m.editor,
      format,
      message: m.message(o),
      scope: 3,
    });
    assert.deepEqual(request, {
      ...selector,
      startUnit: 3,
      endUnit: 3,
      text: 'D',
      insertion: { character: {} },
    });
    assert.equal(Object.hasOwn(request, 'paragraph'), false);
    assert.equal(Object.hasOwn(request, 'reference'), false);
    assert.deepEqual(m.cell.character_runs, [
      { start_unit: 0, char_shape_id: 3 },
      { start_unit: 3, char_shape_id: 7 },
    ]);
    assert.deepEqual(m.pages, format === 'hwp5' ? [0] : []);
  });
test('controlled exact revision with a different Native session is rejected before splice', () => {
  const m = model(),
    o = m.observe();
  m.setSession('foreign-session');
  assert.throws(
    () =>
      prepareCreatedCellTypingTarget({
        editor: m.editor,
        format: 'hwpx',
        message: m.message(o),
        scope: 3,
      }),
    /StaleCreatedCellTypingBinding/,
  );
});
test('controlled same session/revision but altered canonical text is rejected', () => {
  const m = model(),
    o = m.observe();
  m.cell.text = '다😀뒤';
  assert.throws(
    () =>
      prepareCreatedCellTypingTarget({
        editor: m.editor,
        format: 'hwpx',
        message: m.message(o),
        scope: 3,
      }),
    /StaleCreatedCellTypingBinding/,
  );
});
test('controlled binding revision, scope, surrogate boundary and missing run data fail closed', () => {
  for (const mode of ['revision', 'scope', 'unicode', 'runs']) {
    const m = model(),
      o = m.observe(),
      message = m.message(o);
    if (mode === 'revision') m.setRevision(5);
    if (mode === 'scope') message.createdCellTypingScope = 2;
    if (mode === 'unicode') message.startUnit = 2;
    if (mode === 'runs') delete m.cell.character_runs;
    assert.throws(() =>
      prepareCreatedCellTypingTarget({ editor: m.editor, format: 'hwpx', message, scope: 3 }),
    );
  }
});
test('controlled H5 Native reference is paged, never synthesized from logical coordinates', () => {
  const m = model('hwp5');
  m.editor.currentReferences = (section, { first }) => {
    m.pages.push(first);
    return first === 0
      ? {
          first,
          total: 257,
          references: Array.from({ length: 256 }, (_, i) => ({ ...m.ref, id: String(i + 1) })),
        }
      : { first, total: 257, references: [m.ref] };
  };
  m.editor.currentText = (ref) => {
    assert.equal(ref, m.ref);
    return m.cell.text + '\r';
  };
  const observation = m.observe();
  assert.equal(observation.reference, m.ref);
  assert.deepEqual(m.pages, [0, 256]);
});
test('controlled H5 missing/duplicate reference, text disagreement and invalid page cannot issue targets', () => {
  for (const mode of ['missing', 'duplicate', 'text', 'page']) {
    const m = model('hwp5');
    if (mode === 'missing')
      m.editor.currentReferences = () => ({ first: 0, total: 0, references: [] });
    if (mode === 'duplicate')
      m.editor.currentReferences = () => ({
        first: 0,
        total: 2,
        references: [m.ref, { ...m.ref }],
      });
    if (mode === 'text') m.editor.currentText = () => m.cell.text;
    if (mode === 'page')
      m.editor.currentReferences = () => ({ first: 0, total: 1, references: [] });
    assert.throws(m.observe);
  }
});
test('controlled query cannot mix table snapshots, malformed runs or capabilities', () => {
  for (const mode of ['duplicate', 'runs', 'capability', 'changedBinding']) {
    const m = model();
    if (mode === 'duplicate') m.editor.createdTables = () => [m.table, m.table];
    if (mode === 'runs') m.cell.character_runs = [{ start_unit: 1, char_shape_id: 3 }];
    if (mode === 'capability') {
      const old = m.editor.createdCellTypingCapabilities;
      m.editor.createdCellTypingCapabilities = () => ({ ...old(), atomic: false });
    }
    if (mode === 'changedBinding') {
      const old = m.editor.createdCellTypingCapabilities;
      let n = 0;
      m.editor.createdCellTypingCapabilities = () => {
        const v = old();
        return { ...v, binding: { ...v.binding, session: String(n++) } };
      };
    }
    assert.throws(m.observe);
  }
});
test('controlled legacy Surface message still uses actual H5 reference and unchanged source admission', () => {
  const m = model('hwp5'),
    o = m.observe(),
    message = m.message(o);
  delete message.headlessBinding;
  delete message.expectedText;
  assert.equal(
    prepareCreatedCellTypingTarget({ editor: m.editor, format: 'hwp5', message, scope: 3 }).text,
    'D',
  );
  assert.throws(
    () =>
      prepareCreatedCellTypingTarget({
        editor: m.editor,
        format: 'hwp5',
        message: { ...message, reference: { ...m.ref, id: '1' } },
        scope: 3,
      }),
    /InvalidCurrentReferenceScope/,
  );
});
test('controlled empty cell keeps its explicit canonical default run and H5 physical CR observation', () => {
  for (const format of ['hwpx', 'hwp5']) {
    const m = model(format);
    m.cell.text = '';
    m.cell.character_runs = [{ start_unit: 0, char_shape_id: 0 }];
    const o = m.observe();
    assert.equal(o.text, '');
    const request = prepareCreatedCellTypingTarget({
      editor: m.editor,
      format,
      message: { ...m.message(o), startUnit: 0, endUnit: 0 },
      scope: 3,
    });
    assert.equal(request.text, 'D');
    assert.deepEqual(m.cell.character_runs, [{ start_unit: 0, char_shape_id: 0 }]);
  }
});
