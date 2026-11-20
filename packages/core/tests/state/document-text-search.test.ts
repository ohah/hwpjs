import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../src/state/editor-state.ts';
import {
  createDocumentTextIndex,
  assertDocumentTextIndexCurrent,
  documentTextMatches,
  findDocumentTextMatch,
} from '../../src/state/document-text-search.ts';
import { createLiteralMatcher } from '../../src/state/literal-matches.ts';

const state = (patch: any = {}) =>
  new EditorState({
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
    stateVersion: 4,
    nativeHistoryRevision: 7,
    status: 'ready',
    content: {
      format: 'hwpx',
      window: { offset: 1, count: 1 },
      limited: true,
      totalParagraphs: 8,
      paragraphs: [{ section: 0, paragraph: 1, text: 'visible only' }],
    },
    ...patch,
  });
function snapshot(
  texts = ['needle', 'needle', 'needle', 'needle', 'needle', 'needle', 'needle', 'needle'],
) {
  return {
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format: 'hwpx',
    binding: { session: 'native-1', revision: 7 },
    coverage: {
      totalParagraphs: texts.length,
      sections: [{ section: 0, paragraphCount: texts.length }],
    },
    rows: texts.map((text, ordinal) => ({
      ordinal,
      section: 0,
      paragraph: ordinal,
      ref: `read-owner-${ordinal}`,
      text,
      // Read inventory never filters by whether the eventual write is permitted.
      editable: false,
      ownerKind: [
        'body',
        'generated',
        'cell',
        'created-cell',
        'textbox',
        'header',
        'footer',
        'note',
      ][ordinal],
    })),
  };
}
test('complete Native read searches every owner while the painted state is windowed and limited', () => {
  const s = state(),
    input = snapshot(),
    index = createDocumentTextIndex(s, input);
  const results = [...documentTextMatches(index, 'needle')];
  assert.equal(results.length, 8);
  assert.deepEqual(
    results.map((row) => row.ref),
    input.rows.map((row) => row.ref),
  );
  assert(results.every((row) => row.executionAuthority === false));
  assert(results.every((row) => row.expectedOriginal === 'needle'));
  input.rows[0].text = 'retired';
  input.binding.session = 'other';
  assert.equal(index.native.rows[0].text, 'needle');
  assert.equal(index.native.binding.session, 'native-1');
  assert.equal((s.content as any).paragraphs[0].text, 'visible only');
  assert(Object.isFrozen(results[0]));
});
test('document read-only search does not require or create a Native History mutation grant', () => {
  const s = state({ nativeHistoryRevision: undefined, capabilities: { readOnly: true } });
  const value: any = snapshot();
  value.binding.revision = null;
  const index = createDocumentTextIndex(s, value);
  assert.equal([...documentTextMatches(index, 'needle')].length, 8);
  assertDocumentTextIndexCurrent(index, s);
  assert.equal(index.native.binding.revision, null);
  assert.throws(() => assertDocumentTextIndexCurrent(index, state()), /StaleDocumentTextSnapshot/);
});
test('read inventory rejects incomplete coverage, duplicates, reordered ordinals, invalid scalars and stale Native revision', () => {
  const mutations: ((v: any) => void)[] = [
    (v) => {
      v.complete = false;
    },
    (v) => {
      v.coverage.totalParagraphs++;
    },
    (v) => {
      v.coverage.sections[0].paragraphCount--;
    },
    (v) => {
      v.coverage.sections.push(v.coverage.sections[0]);
    },
    (v) => {
      v.rows[1].ref = v.rows[0].ref;
    },
    (v) => {
      v.rows[1].paragraph = v.rows[0].paragraph;
    },
    (v) => {
      v.rows[0].ordinal = 1;
    },
    (v) => {
      v.rows[1].section = 99;
    },
    (v) => {
      v.rows[0].text = '\ud800';
    },
    (v) => {
      v.binding.revision = 6;
    },
    (v) => {
      v.binding.revision = 0xffffffff;
    },
  ];
  for (const mutate of mutations) {
    const value = snapshot();
    mutate(value);
    assert.throws(() => createDocumentTextIndex(state(), value));
  }
});
test('sparse source coordinates and large gaps do not cause dense integer traversal', () => {
  const value = snapshot(['first', 'last']);
  value.rows[1].paragraph = 0xfffffffe;
  const index = createDocumentTextIndex(state(), value);
  assert.equal(findDocumentTextMatch(index, 'last')?.paragraph, 0xfffffffe);
  assert.equal(findDocumentTextMatch(index, 'first', { direction: 'backward' })?.paragraph, 0);
});
test('direction, wrap and scalar-safe anchor use the Native owner ref rather than the current display selection', () => {
  const index = createDocumentTextIndex(state(), snapshot(['a😀aa', 'aa']));
  const first = findDocumentTextMatch(index, 'aa')!;
  assert.equal(first.startUnit, 3);
  const anchor = { ref: first.ref, startUnit: first.startUnit, endUnit: first.endUnit };
  const next = findDocumentTextMatch(index, 'aa', { anchor, wrap: false })!;
  assert.equal(next.ordinal, 1);
  assert.equal(
    findDocumentTextMatch(index, 'aa', { direction: 'backward', anchor, wrap: false }),
    null,
  );
  assert.equal(findDocumentTextMatch(index, 'aa', { direction: 'backward', anchor })?.ordinal, 1);
  assert.throws(
    () => findDocumentTextMatch(index, 'a', { anchor: { ...anchor, startUnit: 2 } }),
    /InvalidScalarBoundary/,
  );
  assert.throws(
    () => findDocumentTextMatch(index, 'a', { anchor: { ...anchor, ref: 'retired' } }),
    /StaleSearchSelection/,
  );
});
test('find includes overlapping literal hits; replacement enumeration remains nonoverlapping', () => {
  const index = createDocumentTextIndex(state(), snapshot(['ababa']));
  assert.deepEqual(
    [...documentTextMatches(index, 'aba')].map((row) => row.startUnit),
    [0],
  );
  assert.deepEqual(
    [...documentTextMatches(index, 'aba', true)].map((row) => row.startUnit),
    [0, 2],
  );
  assert.equal(findDocumentTextMatch(index, 'aba', { direction: 'backward' })?.startUnit, 2);
  let work = 0;
  const matches = createLiteralMatcher('a'.repeat(100) + 'b', () => work++, true);
  assert.equal([...matches('a'.repeat(10000))].length, 0);
  assert(work < 4 * (101 + 10000));
});
test('document/view/state/Native revision fences retire the read, including ABA and forged indices', () => {
  const s = state(),
    index = createDocumentTextIndex(s, snapshot());
  assertDocumentTextIndexCurrent(index, s);
  for (const patch of [
    { documentId: 'other' },
    { generation: 2 },
    { operationRevision: 2 },
    { viewRevision: 2 },
    { stateVersion: 5 },
    { nativeHistoryRevision: 8 },
  ])
    assert.throws(() => assertDocumentTextIndexCurrent(index, state(patch)));
  const aba = state({ stateVersion: 6, operationRevision: 3 });
  assert.throws(() => assertDocumentTextIndexCurrent(index, aba));
  assert.throws(() => findDocumentTextMatch({ ...index }, 'needle'), /InvalidDocumentTextIndex/);
});
test('accessors are not invoked and malformed anchors/options never fall through to a whole-document search', () => {
  const index = createDocumentTextIndex(state(), snapshot());
  let reads = 0;
  const options = {
    get anchor() {
      reads++;
      return undefined;
    },
  };
  assert.throws(() => findDocumentTextMatch(index, 'needle', options));
  assert.equal(reads, 0);
  for (const anchor of [null, {}, { ref: 'read-owner-0', startUnit: -1, endUnit: 1 }])
    assert.throws(() => findDocumentTextMatch(index, 'needle', { anchor } as any));
  assert.throws(() => findDocumentTextMatch(index, '', {}));
});
