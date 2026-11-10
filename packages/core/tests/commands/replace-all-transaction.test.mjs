import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReplaceAllTransaction } from '../../../../web/preview/replace-all-transaction.mjs';
const reference = (paragraph) => ({
  epoch: '1',
  scope: 's',
  kind: 'original',
  section: 0,
  id: String(paragraph),
  row: 0,
  column: 0,
});
function plan(format = 'hwp5') {
  return {
    schemaVersion: 1,
    executionAuthority: false,
    scope: 'complete-current-paragraph-snapshot',
    status: 'requires-native-preflight',
    format,
    nativeHistoryRevision: 7,
    coverage: {
      observedParagraphs: 2,
      declaredParagraphs: 2,
      sections: [{ section: 0, observedParagraphs: 2 }],
      owners: [
        { section: 0, paragraph: 0 },
        { section: 0, paragraph: 1 },
      ],
    },
    edits: [0, 1].flatMap((paragraph) =>
      [0, 4].map((startUnit) => ({
        source: {
          section: 0,
          paragraph,
          startUnit,
          endUnit: startUnit + 2,
          reference: reference(paragraph),
        },
        expectedOriginal: 'ab',
        replacement: 'Z',
      })),
    ),
  };
}
function native(format = 'hwp5', change = {}) {
  const calls = { query: [], windows: [], apply: 0 };
  const editor = {
    supportsIndependentTextAbi: () => true,
    independentTextCapabilities: () => ({
      format,
      binding: { session: 's', revision: 7 },
      limits: { edits: 4096, groups: 4096, snapshotParagraphs: 20000 },
    }),
    currentSourceReferences(section, window) {
      calls.windows.push(window);
      return { version: 1, first: 0, total: 2, references: [reference(0), reference(1)] };
    },
    queryIndependentText(wire) {
      calls.query.push(wire);
      return {
        binding: wire.binding,
        coverage: {
          sections: [{ section: 0, paragraphCount: 2 }],
          totalParagraphs: 2,
          createdCellParagraphs: 0,
        },
        targets: wire.selectors.map((selector, i) => ({
          ...selector,
          ref: `ref-${i}`,
          beforeUnits: 6,
        })),
        ...change,
      };
    },
    applyIndependentText() {
      calls.apply++;
      throw Error('must not mutate during preparation');
    },
  };
  return { editor, calls };
}
for (const format of ['hwp5', 'hwpx'])
  test(`${format} groups four cuts into two owners with one Native query and no mutation`, () => {
    const h = native(format),
      input = plan(format),
      before = structuredClone(input);
    const wire = prepareReplaceAllTransaction(h.editor, format, input);
    assert.deepEqual(input, before);
    assert.equal(wire.groups.length, 2);
    assert.equal(wire.groups[0].edits.length, 2);
    assert.equal(wire.groups[1].edits.length, 2);
    assert.equal(h.calls.query.length, 1);
    assert.equal(h.calls.apply, 0);
    assert.deepEqual(h.calls.query[0].selectors, [
      { section: 0, paragraph: format === 'hwpx' ? 1 : 0 },
      { section: 0, paragraph: format === 'hwpx' ? 2 : 1 },
    ]);
    assert.equal(h.calls.windows.length, format === 'hwp5' ? 1 : 0);
    assert.equal(wire.scope, 'complete-current-paragraph-snapshot');
  });
test('missing source paragraphs and pending created-cell coverage reject the whole request', () => {
  for (const coverage of [
    { sections: [{ section: 0, paragraphCount: 3 }], totalParagraphs: 3, createdCellParagraphs: 0 },
    { sections: [{ section: 0, paragraphCount: 3 }], totalParagraphs: 3, createdCellParagraphs: 1 },
    {
      sections: [
        { section: 0, paragraphCount: 1 },
        { section: 1, paragraphCount: 1 },
      ],
      totalParagraphs: 2,
      createdCellParagraphs: 0,
    },
  ]) {
    const h = native('hwp5', { coverage });
    assert.throws(
      () => prepareReplaceAllTransaction(h.editor, 'hwp5', plan()),
      /IncompleteReplaceAllSnapshot/,
    );
    assert.equal(h.calls.apply, 0);
  }
});
test('stale history, stale source identity, overlap and structural newlines never reach apply', () => {
  for (const mutate of [
    (p) => p.nativeHistoryRevision++,
    (p) => (p.edits[0].source.reference.epoch = '2'),
    (p) => (p.edits[1].source.startUnit = 1),
    (p) => (p.edits[3].replacement = 'x\ny'),
  ]) {
    const h = native(),
      p = plan();
    mutate(p);
    assert.throws(
      () => prepareReplaceAllTransaction(h.editor, 'hwp5', p),
      /Stale|Reference|Invalid|Unsupported/,
    );
    assert.equal(h.calls.apply, 0);
  }
});
test('zero matches still verifies complete Native coverage without consuming history', () => {
  const h = native(),
    p = plan();
  p.status = 'known-no-op';
  p.edits = [];
  const wire = prepareReplaceAllTransaction(h.editor, 'hwp5', p);
  assert.equal(wire.groups.length, 0);
  assert.equal(h.calls.query.length, 1);
  assert.equal(h.calls.apply, 0);
  assert.deepEqual(h.calls.query[0].selectors, []);
});
test('late Native rejection and reordered targets are not partially applied', () => {
  const h = native();
  h.editor.queryIndependentText = () => {
    throw Error('ProtectedOwner');
  };
  assert.throws(() => prepareReplaceAllTransaction(h.editor, 'hwp5', plan()), /ProtectedOwner/);
  assert.equal(h.calls.apply, 0);
  const h2 = native('hwp5', {
    targets: [
      { section: 0, paragraph: 1 },
      { section: 0, paragraph: 0 },
    ],
  });
  assert.throws(() => prepareReplaceAllTransaction(h2.editor, 'hwp5', plan()), /Malformed/);
  assert.equal(h2.calls.apply, 0);
});

test('equal counts do not mask missing unmatched owners or duplicate/out-of-range ordinals', () => {
  for (const owners of [
    [
      { section: 0, paragraph: 0 },
      { section: 0, paragraph: 2 },
    ],
    [
      { section: 0, paragraph: 0 },
      { section: 0, paragraph: 0 },
    ],
    [{ section: 0, paragraph: 0 }],
  ]) {
    const h = native(),
      p = plan();
    p.coverage.owners = owners;
    assert.throws(
      () => prepareReplaceAllTransaction(h.editor, 'hwp5', p),
      /IncompleteReplaceAllSnapshot/,
    );
    assert.equal(h.calls.apply, 0);
  }
});

test('HWPX coverage uses global paragraph ordinals while HWP5 resets each section', () => {
  for (const format of ['hwp5', 'hwpx']) {
    const p = plan(format);
    p.coverage.sections = [
      { section: 0, observedParagraphs: 1 },
      { section: 1, observedParagraphs: 1 },
    ];
    const second = format === 'hwpx' ? 1 : 0;
    p.coverage.owners = [
      { section: 0, paragraph: 0 },
      { section: 1, paragraph: second },
    ];
    p.edits = p.edits.filter((_, index) => index % 2 === 0);
    p.edits[1].source = {
      ...p.edits[1].source,
      section: 1,
      paragraph: second,
      reference: { ...reference(second), section: 1 },
    };
    const h = native(format, {
      coverage: {
        sections: [
          { section: 0, paragraphCount: 1 },
          { section: 1, paragraphCount: 1 },
        ],
        totalParagraphs: 2,
        createdCellParagraphs: 0,
      },
    });
    h.editor.currentSourceReferences = (section) => ({
      version: 1,
      first: 0,
      total: 1,
      references: [{ ...reference(0), section }],
    });
    const wire = prepareReplaceAllTransaction(h.editor, format, p);
    assert.equal(wire.groups.length, 2);
    assert.deepEqual(h.calls.query[0].selectors, [
      { section: 0, paragraph: format === 'hwpx' ? 1 : 0 },
      { section: 1, paragraph: format === 'hwpx' ? 2 : 0 },
    ]);
    if (format === 'hwpx') {
      p.coverage.owners[1].paragraph = 0;
      assert.throws(
        () => prepareReplaceAllTransaction(h.editor, format, p),
        /IncompleteReplaceAllSnapshot/,
      );
    }
  }
});
