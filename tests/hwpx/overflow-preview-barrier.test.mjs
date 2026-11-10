import test from 'node:test';
import assert from 'node:assert/strict';
import { retainOverflowPreviewBarrier } from '../../web/preview/overflow-preview-barrier.mjs';
import { createPreviewEditPolicy } from '../../web/preview/preview-edit-policy.mjs';

function fixture() {
  const content = {
    format: 'hwpx',
    limited: false,
    tables: [
      { section: 0, tableNode: 10, hostParagraph: 1, cells: [{ listNode: 20, paragraphs: [2] }] },
    ],
    paragraphs: ['BEFORE', '\ufffc', 'CELL', 'AFTER'].map((text, paragraph) => ({
      section: 0,
      paragraph,
      text,
      editable: true,
      ...(paragraph === 2 ? { tableCell: { tableNode: 10, listNode: 20 } } : {}),
    })),
  };
  const rows = content.paragraphs.map((p) => ({
    section: p.section,
    paragraph: p.paragraph,
    text: p.text,
    editable: true,
    selectable: true,
    x: 1,
    y: p.paragraph * 20,
    ...(p.tableCell ? { tableNode: 10, listNode: 20 } : {}),
  }));
  const box = { section: 0, tableNode: 10, listNode: 20, x: 3, y: 4, width: 600, height: 100 };
  const layout = {
    rows,
    boxes: [box],
    pageLayoutError: 'UnsupportedPageRow',
    tableAnchors: [
      { section: 0, tableNode: 10 },
      { section: 1, tableNode: 10 },
    ],
    flowAnchors: [{ section: 0, tableNode: 10 }],
  };
  // Old paragraph and table IDs are deliberately different from the current Native inventory.
  const previous = {
    previewReadOnlyTables: [
      {
        section: 0,
        tableNode: 7,
        hostParagraph: 0,
        paragraphs: [1],
        reason: 'InlineTablePaperOverflow',
        editableCells: [{ listNode: 8, paragraphs: [1] }],
      },
    ],
  };
  return { content, layout, previous };
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
test('a failed replacement scene retains a readonly barrier using fresh Native owners', () => {
  const f = fixture(),
    before = structuredClone(f);
  freeze(f);
  const result = retainOverflowPreviewBarrier(f.content, f.layout, f.previous);
  assert.deepEqual(result.previewReadOnlyTables, [
    {
      section: 0,
      tableNode: 10,
      hostParagraph: 1,
      paragraphs: [2],
      reason: 'IncompleteOverflowTableProjection',
      editableCells: [],
      sourceError: 'UnsupportedPageRow',
    },
  ]);
  for (const i of [1, 2]) {
    assert.equal(result.rows[i].editable, false);
    assert.equal(result.rows[i].selectable, false);
  }
  for (const i of [0, 3]) assert.equal(result.rows[i], f.layout.rows[i]);
  assert.equal(result.boxes[0].previewOnly, true);
  assert.equal(result.boxes[0].width, 600);
  assert.deepEqual(result.tableAnchors, [{ section: 1, tableNode: 10 }]);
  assert.deepEqual(result.flowAnchors, []);
  assert.equal(result.pageLayoutError, 'UnsupportedPageRow');
  assert.equal(result.sourceCoverage, 'incomplete');
  assert.equal(result.documentPageNumbersExact, false);
  assert.deepEqual(f, before);
});
test('fallback barrier admits history and fresh body input without reviving cell or host', () => {
  const f = fixture(),
    scene = retainOverflowPreviewBarrier(f.content, f.layout, f.previous);
  const policy = createPreviewEditPolicy(f.content, scene);
  assert.equal(policy.active, true);
  for (const paragraph of [1, 2]) {
    assert.equal(policy.allowsPoint({ section: 0, paragraph, unit: 0 }), false);
    assert.equal(policy.allowsRequest({ kind: 'splice', section: 0, paragraph }), false);
  }
  for (const paragraph of [0, 3])
    assert.equal(policy.allowsRequest({ kind: 'splice', section: 0, paragraph }), true);
  for (const kind of ['undo', 'redo', 'save']) assert.equal(policy.allowsRequest({ kind }), true);
});
test('a successful replacement scene owns fresh eligibility; old fallback masks are not merged', () => {
  const f = fixture(),
    next = { ...f.layout, state: 'paginated', pageLayoutError: undefined };
  assert.equal(retainOverflowPreviewBarrier(f.content, next, f.previous), next);
});
for (const [label, mutate] of [
  ['no previous preview', (f) => (f.previous = {})],
  ['no failure', (f) => delete f.layout.pageLayoutError],
  ['no current table', (f) => (f.content.tables = [])],
  ['another format', (f) => (f.content.format = 'other')],
])
  test(`unrelated scenes retain identity: ${label}`, () => {
    const f = fixture();
    mutate(f);
    assert.equal(retainOverflowPreviewBarrier(f.content, f.layout, f.previous), f.layout);
  });
