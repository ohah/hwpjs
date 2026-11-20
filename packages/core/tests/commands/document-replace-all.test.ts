import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import { createDocumentTextIndex } from '../../src/state/document-text-search.ts';
import { planDocumentReplaceAll } from '../../src/commands/document-replace-all.ts';

function fixture(texts = ['가나 가나', '가나', '가나', '가나', '가나', '가나', '가나', '가나']) {
  const state = new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 2,
    viewRevision: 3,
    stateVersion: 4,
    nativeHistoryRevision: 5,
    status: 'ready',
    content: {
      format: 'hwpx',
      limited: true,
      window: { offset: 100, count: 1 },
      totalParagraphs: texts.length,
      paragraphs: [{ section: 0, paragraph: 100, text: 'painted only' }],
    },
  });
  const snapshot = {
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format: 'hwpx',
    binding: { session: 'native', revision: 5 },
    coverage: {
      totalParagraphs: texts.length,
      sections: [{ section: 0, paragraphCount: texts.length }],
    },
    rows: texts.map((text, ordinal) => ({
      ordinal,
      section: 0,
      paragraph: ordinal === texts.length - 1 ? 0xfffffffe : ordinal,
      ref: `read-${ordinal}`,
      text,
      // Deliberately non-writable diagnostic fields: planning must not filter.
      editable: false,
      ownerKind: [
        'body',
        'generated',
        'table',
        'created-cell',
        'textbox',
        'header',
        'footer',
        'note',
      ][ordinal],
    })),
  };
  return { state, index: createDocumentTextIndex(state, snapshot) };
}
test('complete plan includes offscreen non-writable owners and sparse Native coordinates', () => {
  const { state, index } = fixture();
  const plan = planDocumentReplaceAll(state, index, { query: '가나', replacement: '다' });
  assert.equal(plan.matchCount, 9);
  assert.equal(plan.groups.length, 8);
  assert.deepEqual(
    plan.groups.map((group) => group.ref),
    index.native.rows.map((row) => row.ref),
  );
  assert.deepEqual(plan.groups[0].edits, [
    { startUnit: 0, endUnit: 2, expectedOriginal: '가나', text: '다' },
    { startUnit: 3, endUnit: 5, expectedOriginal: '가나', text: '다' },
  ]);
  assert.equal(plan.executionAuthority, false);
  assert.equal(plan.requiresNativePreflight, true);
  assert.equal(plan.totals.outputUnits, plan.totals.snapshotUnits - 9);
  assert(Object.isFrozen(plan.groups[0].edits[0]));
  assert.equal(state.content.paragraphs[0].text, 'painted only');
});
test('document plan accepts Native-sized inventory beyond display clipping bound', () => {
  const { state, index } = fixture(['x'.repeat(200001) + '😀']);
  const plan = planDocumentReplaceAll(state, index, { query: '😀', replacement: '끝' });
  assert.equal(plan.groups[0].edits[0].startUnit, 200001);
  assert.equal(plan.groups[0].edits[0].endUnit, 200003);
  assert.equal(plan.totals.outputUnits, 200002);
});
test('literal matching is nonoverlapping and replacement is never rescanned', () => {
  const { state, index } = fixture(['aaaaa']);
  const plan = planDocumentReplaceAll(state, index, { query: 'aa', replacement: 'aaaa' });
  assert.deepEqual(
    plan.groups[0].edits.map((edit) => edit.startUnit),
    [0, 2],
  );
  assert.equal(plan.totals.outputUnits, 9);
});
test('identity and absent matches still require Native complete-coverage preflight', () => {
  const { state, index } = fixture(['가나']);
  const same = planDocumentReplaceAll(state, index, { query: '가나', replacement: '가나' });
  assert.equal(same.groups.length, 1);
  assert.equal(same.requiresNativePreflight, true);
  const absent = planDocumentReplaceAll(state, index, { query: '없음', replacement: '' });
  assert.equal(absent.groups.length, 0);
  assert.equal(absent.coverage.totalParagraphs, 1);
  assert.equal(absent.requiresNativePreflight, true);
});
test('budget refusal at a late owner returns no partial plan and leaves state unchanged', () => {
  const { state, index } = fixture(['가나', '가나']);
  const before = JSON.stringify(state);
  assert.throws(
    () =>
      planDocumentReplaceAll(state, index, {
        query: '가나',
        replacement: '😀',
        limits: { insertedBytes: 7 },
      }),
    /LimitExceeded/,
  );
  assert.equal(JSON.stringify(state), before);
  assert.throws(
    () =>
      planDocumentReplaceAll(state, index, {
        query: '가나',
        replacement: '다',
        limits: { matches: 1 },
      }),
    /LimitExceeded/,
  );
  assert.equal(
    planDocumentReplaceAll(state, index, {
      query: '가나',
      replacement: '😀',
      limits: { insertedBytes: 8 },
    }).totals.insertedBytes,
    8,
  );
});
test('stale view, forged index and accessor request reject before any planning', () => {
  const { state, index } = fixture();
  const newer = new EditorState({ ...state, viewRevision: state.viewRevision + 1 });
  assert.throws(() => planDocumentReplaceAll(newer, index, { query: '가나', replacement: '' }));
  assert.throws(
    () => planDocumentReplaceAll(state, { ...index }, { query: '가나', replacement: '' }),
    /InvalidDocumentTextIndex/,
  );
  let read = 0;
  assert.throws(() =>
    planDocumentReplaceAll(state, index, {
      get query() {
        read++;
        return '가나';
      },
      replacement: '',
    }),
  );
  assert.equal(read, 0);
});
test('invalid scalar, unknown options and expanded budgets are refused', () => {
  const { state, index } = fixture();
  for (const input of [
    { query: '', replacement: '' },
    { query: '\ud800', replacement: '' },
    { query: '가나', replacement: '\udfff' },
    { query: '가나', replacement: '', mode: 'regex' },
    { query: '가나', replacement: '', limits: { matches: 4097 } },
    { query: '가나', replacement: '', limits: { matches: -1 } },
  ])
    assert.throws(() => planDocumentReplaceAll(state, index, input));
});
