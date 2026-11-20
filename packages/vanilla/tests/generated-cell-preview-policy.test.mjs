import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewEditPolicy } from '../../../web/preview/preview-edit-policy.mjs';
function fixture(hostParagraph = 0) {
  const content = {
    paragraphs: [0, 1, 2].map((paragraph) => ({
      section: 0,
      paragraph,
      text: 'host',
      editable: true,
      ...(paragraph === 2 ? { tableCell: { tableNode: 10, listNode: 20 } } : {}),
    })),
    tables: [
      { section: 0, tableNode: 10, hostParagraph: 1, cells: [{ listNode: 20, paragraphs: [2] }] },
    ],
    createdTables: [
      {
        section: 0,
        identity: '9007199254740993',
        hostParagraph,
        cells: [
          { row: 0, column: 0 },
          { row: 0, column: 1 },
        ],
      },
    ],
  };
  return {
    content,
    layout: {
      previewReadOnlyTables: [
        {
          section: 0,
          tableNode: 10,
          hostParagraph: 1,
          paragraphs: [2],
          reason: 'InlineTablePaperOverflow',
        },
      ],
    },
  };
}
const point = (column = 0) => ({
  section: 0,
  unit: 0,
  createdCell: { identity: '9007199254740993', row: 0, column },
});
test('unrelated overflow mask admits an exact generated owner without inventing a source ordinal', () => {
  const f = fixture(),
    before = structuredClone(f.content),
    p = createPreviewEditPolicy(f.content, f.layout);
  assert(p.active);
  assert(p.allowsPoint(point()));
  assert(p.allowsRange(point(), { ...point(), unit: 10 }));
  assert(!p.allowsRange(point(), point(1)));
  assert(!p.allowsRange(point(), { section: 0, paragraph: 0, unit: 0 }));
  const message = {
    kind: 'created-cell-splice',
    section: 0,
    ...point().createdCell,
    startUnit: 0,
    endUnit: 0,
    text: 'X',
  };
  assert(p.allowsRequest(message));
  assert(!p.allowsRequest({ ...message, paragraph: 0 }));
  assert(!p.allowsRequest({ ...message, identity: 'missing' }));
  assert(!p.allowsPoint(point(2)));
  assert.deepEqual(f.content, before);
});
test('blocked, missing, duplicate or non-body generated hosts retain the mask denial', () => {
  for (const change of [
    (f) => (f.content.createdTables[0].hostParagraph = 1),
    (f) => (f.content.createdTables[0].hostParagraph = 2),
    (f) => (f.content.createdTables[0].hostParagraph = 9),
    (f) => (f.content.paragraphs[0].drawingText = true),
    (f) => f.content.createdTables.push(structuredClone(f.content.createdTables[0])),
  ]) {
    const f = fixture();
    change(f);
    const p = createPreviewEditPolicy(f.content, f.layout);
    assert(!p.allowsPoint(point()));
    assert(!p.allowsRequest({ kind: 'created-cell-splice', section: 0, ...point().createdCell }));
    assert(p.allowsRequest({ kind: 'undo' }));
  }
});
