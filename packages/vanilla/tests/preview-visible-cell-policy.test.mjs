// Pure view-policy contracts. Geometry proof and Native mutation remain with their owners.
import test from 'node:test';
import assert from 'node:assert/strict';
const { createPreviewEditPolicy } = await import(
  process.env.HWPJS_VISIBLE_CELL_POLICY ?? '../../../web/preview/preview-edit-policy.mjs'
);

const point = (paragraph, unit = 0, section = 0) => ({ section, paragraph, unit });
function content() {
  const rows = [
    [90, 'body before', null],
    [50, '\ufffc', null],
    [7, 'same 한😀', 30],
    [8, 'same 한😀', 30],
    [11, 'other', 31],
    [12, 'clipped', 32],
    [4, 'body after', null],
    [5, 'tail', null],
  ];
  return {
    format: 'hwpx',
    limited: false,
    paragraphs: rows.map(([paragraph, text, listNode]) => ({
      section: 0,
      paragraph,
      text,
      editable: true,
      selectable: true,
      currentReference: { kind: 'original', section: 0, paragraph },
      selectionOwner: listNode === null ? 'section:0:body' : null,
      ...(listNode === null ? {} : { tableCell: { tableNode: 20, listNode } }),
    })),
    tables: [
      {
        section: 0,
        tableNode: 20,
        hostParagraph: 50,
        rows: 1,
        columns: 3,
        cells: [
          { listNode: 30, paragraphs: [7, 8] },
          { listNode: 31, paragraphs: [11] },
          { listNode: 32, paragraphs: [12] },
        ],
      },
    ],
  };
}
function declaration(editableCells = [{ listNode: 30, paragraphs: [7, 8] }]) {
  return {
    section: 0,
    tableNode: 20,
    hostParagraph: 50,
    paragraphs: [7, 8, 11, 12],
    reason: 'InlineTablePaperOverflow',
    ...(editableCells === undefined ? {} : { editableCells }),
  };
}
const policy = (c = content(), d = declaration()) =>
  createPreviewEditPolicy(c, { previewReadOnlyTables: [d] });
const request = (kind, paragraph = 7) => ({ kind, section: 0, paragraph });

test('incomplete overflow projection keeps the whole table readonly and body editable', () => {
  for (const editableCells of [undefined, []]) {
    const c = content(),
      before = structuredClone(c);
    const p = policy(c, {
      ...declaration(editableCells),
      editableCells,
      reason: 'IncompleteOverflowTableProjection',
    });
    assert.equal(p.active, true);
    for (const id of [50, 7, 8, 11, 12]) {
      assert.equal(p.allowsPoint(point(id)), false);
      assert.equal(p.allowsRequest(request('splice', id)), false);
      const row = p.content.paragraphs.find((row) => row.paragraph === id);
      assert.equal(row.editable, false);
      assert.equal(row.selectable, false);
    }
    assert.equal(p.allowsPoint(point(90)), true);
    assert.equal(p.allowsRange(point(4), point(5)), true);
    assert.equal(p.allowsRange(point(90), point(4)), false);
    assert.equal(p.allowsRequest(request('splice', 4)), true);
    for (const kind of ['undo', 'redo', 'save']) assert.equal(p.allowsRequest({ kind }), true);
    assert.deepEqual(c, before);
    assert.equal(p.content.paragraphs.at(-1), c.paragraphs.at(-1));
  }
});

test('incomplete projection rejects even exact visible-cell admission proofs fail closed', () => {
  for (const editableCells of [
    [{ listNode: 30, paragraphs: [7, 8] }],
    [{ listNode: 30, paragraphs: [7] }],
    null,
    {},
  ]) {
    const p = policy(content(), {
      ...declaration(editableCells),
      reason: 'IncompleteOverflowTableProjection',
    });
    for (const id of [7, 8, 90, 4]) assert.equal(p.allowsPoint(point(id)), false);
    assert.equal(p.allowsRequest(request('splice', 4)), false);
    for (const kind of ['undo', 'redo', 'save']) assert.equal(p.allowsRequest({ kind }), true);
  }
});

test('complete geometry can re-admit a cell after the incomplete projection barrier', () => {
  const c = content();
  const fallback = policy(c, { ...declaration([]), reason: 'IncompleteOverflowTableProjection' });
  assert.equal(fallback.allowsPoint(point(7)), false);
  const restored = policy(c);
  assert.equal(restored.allowsRequest(request('splice')), true);
  assert.equal(restored.allowsPoint(point(12)), false);
  assert.equal(restored.allowsPoint(point(50)), false);
});

test('visible proof admits every paragraph of exactly one source cell and preserves Native objects', () => {
  const c = content(),
    before = structuredClone(c),
    p = policy(c);
  assert.equal(p.active, true);
  assert.deepEqual(c, before);
  assert.equal(p.content.paragraphs.length, c.paragraphs.length);
  for (const paragraph of [7, 8]) {
    const source = c.paragraphs.find((row) => row.paragraph === paragraph);
    const projected = p.content.paragraphs.find((row) => row.paragraph === paragraph);
    assert.equal(p.allowsPoint(point(paragraph)), true);
    assert.equal(projected, source);
    assert.equal(projected.tableCell, source.tableCell);
    assert.equal(projected.currentReference, source.currentReference);
    assert.equal(projected.editable, true);
  }
  for (const paragraph of [50, 11, 12]) {
    const projected = p.content.paragraphs.find((row) => row.paragraph === paragraph);
    assert.equal(p.allowsPoint(point(paragraph)), false);
    assert.equal(projected.editable, false);
    assert.equal(projected.selectable, false);
  }
  assert.equal(p.allowsRange(point(7), point(8, 3)), true);
  assert.equal(p.allowsRange(point(8, 3), point(7)), true);
  assert.equal(p.allowsRange(point(4), point(5)), true);
});

test('absent or empty editableCells retains original overflow readonly contract', () => {
  for (const d of [{ ...declaration(), editableCells: undefined }, declaration([])]) {
    const p = policy(content(), d);
    for (const id of [50, 7, 8, 11, 12]) assert.equal(p.allowsPoint(point(id)), false);
    assert.equal(p.allowsPoint(point(90)), true);
    assert.equal(p.allowsRequest(request('splice', 4)), true);
  }
});

test('two independently allowed cells still cannot make a cell-cell or body-cell range', () => {
  const p = policy(
    content(),
    declaration([
      { listNode: 30, paragraphs: [7, 8] },
      { listNode: 31, paragraphs: [11] },
    ]),
  );
  assert.equal(p.allowsPoint(point(7)), true);
  assert.equal(p.allowsPoint(point(11)), true);
  for (const [a, b] of [
    [7, 11],
    [11, 7],
    [90, 7],
    [7, 90],
    [11, 4],
    [4, 11],
    [90, 4],
  ])
    assert.equal(p.allowsRange(point(a), point(b)), false);
  for (const kind of ['character-properties-ranges', 'query-formatting']) {
    const field = kind === 'query-formatting' ? 'selectors' : 'ranges';
    assert.equal(p.allowsRequest({ kind, [field]: [point(7), point(8)] }), true);
    assert.equal(p.allowsRequest({ kind, [field]: [point(7), point(11)] }), false);
    assert.equal(p.allowsRequest({ kind, [field]: [point(11), point(4)] }), false);
  }
});

test('visible cell admits text and character commands and current-cell edit query', () => {
  const p = policy();
  for (const kind of [
    'splice',
    'splice-font-name',
    'splice-character-properties',
    'query-edit-range',
    'format',
    'character-properties',
    'character-outline',
    'character-effect',
    'character-strike',
    'character-strike-color',
    'character-underline',
    'character-underline-color',
    'character-text-color',
    'character-shade',
    'character-font',
    'character-font-name',
  ]) {
    assert.equal(p.allowsRequest(request(kind)), true, kind);
    assert.equal(p.allowsRequest(request(kind, 12)), false, kind);
    assert.equal(p.allowsRequest(request(kind, 50)), false, kind);
  }
  for (const kind of [
    'character-properties-ranges',
    'character-outline-ranges',
    'character-effect-ranges',
    'character-strike-ranges',
    'character-underline-ranges',
    'character-text-color-ranges',
    'character-shade-ranges',
    'character-font-ranges',
    'character-font-name-ranges',
  ])
    assert.equal(p.allowsRequest({ kind, ranges: [point(7), point(8)] }), true, kind);
});

test('visible cell denies structure paragraph formatting geometry grid and opaque commands', () => {
  const p = policy();
  for (const kind of [
    'split',
    'merge',
    'insert-table',
    'query-split-range',
    'paragraph-format',
    'paragraph-alignment',
    'paragraph-flags',
    'paragraph-border-fill',
    'paragraph-margins',
    'paragraph-spacing',
    'created-table-grid',
    'formatting-patch',
    'unknown-mutation',
  ])
    assert.equal(p.allowsRequest(request(kind)), false, kind);
  for (const message of [
    { kind: 'source-table-grid', section: 0, tableNode: 20 },
    { kind: 'table-column-width', section: 0, tableNode: 20 },
    { kind: 'cell-size', section: 0, listNode: 30 },
    { kind: 'cell-border', section: 0, listNode: 30 },
    { kind: 'replace-paragraph-ranges', ranges: [point(7), point(8)], text: 'replace' },
    { kind: 'formatting-patch', request: { targets: [{ ref: 'opaque' }] } },
  ])
    assert.equal(p.allowsRequest(message), false, message.kind);
  assert.equal(p.allowsRequest(request('split', 4)), true);
  assert.equal(p.allowsRequest(request('paragraph-alignment', 4)), true);
  assert.equal(
    p.allowsRequest({ kind: 'replace-paragraph-ranges', ranges: [point(4), point(5)] }),
    true,
  );
  assert.equal(
    p.allowsRequest({ kind: 'merge', section: 0, paragraph: 4, rightParagraph: 5 }),
    true,
  );
  for (const kind of ['undo', 'redo', 'save', 'query-formatting-capabilities'])
    assert.equal(p.allowsRequest({ kind }), true);
});

test('visible draft coordinates may extend beyond canonical end without weakening owner denial', () => {
  const p = policy();
  assert.equal(p.allowsPoint(point(7, 999)), true);
  assert.equal(p.allowsRange(point(7, 8), point(7, 999)), true);
  assert.equal(p.allowsPoint(point(12, 999)), false);
  assert.equal(p.allowsPoint({ ...point(7), tableNode: 20 }), false);
  for (const unit of [-1, -0, NaN, Infinity, 0.5, '7', 0x100000000])
    assert.equal(p.allowsPoint(point(7, unit)), false);
});

const invalidProofs = [
  null,
  {},
  'invalid',
  [{ listNode: 30, paragraphs: [] }],
  [{ listNode: 30, paragraphs: [7] }],
  [{ listNode: 30, paragraphs: [7, 7] }],
  [{ listNode: 30, paragraphs: [8, 7] }],
  [{ listNode: 30, paragraphs: [7, 11] }],
  [{ listNode: 30, paragraphs: [50, 8] }],
  [{ listNode: 30, paragraphs: ['7', 8] }],
  [{ listNode: 99, paragraphs: [7, 8] }],
  [{ listNode: -1, paragraphs: [7, 8] }],
  [
    { listNode: 30, paragraphs: [7, 8] },
    { listNode: 30, paragraphs: [7, 8] },
  ],
];
for (const [i, bad] of invalidProofs.entries())
  test(`malformed editable cell proof ${i} fails closed`, () => {
    const p = policy(content(), declaration(bad));
    assert.equal(p.allowsPoint(point(7)), false);
    assert.equal(p.allowsPoint(point(90)), false);
    assert.equal(p.allowsRequest(request('splice')), false);
    assert.equal(p.allowsRequest({ kind: 'undo' }), true);
  });

const invalidSource = [
  (c) => {
    c.paragraphs[2].editable = false;
  },
  (c) => {
    c.paragraphs[3].clipped = true;
  },
  (c) => {
    c.paragraphs[2].createdCell = {};
  },
  (c) => {
    c.paragraphs[2].drawingText = { drawingNode: 1, listNode: 30 };
  },
  (c) => {
    c.paragraphs.push({ ...c.paragraphs[2] });
  },
  (c) => {
    c.paragraphs[3].tableCell.listNode = 31;
  },
  (c) => {
    c.tables[0].cells[0].paragraphs = [7];
  },
  (c) => {
    c.tables[0].cells[0].paragraphs = [8, 7];
  },
  (c) => {
    c.tables[0].cells.push({ ...c.tables[0].cells[0] });
  },
  (c) => {
    c.tables.push({
      section: 0,
      tableNode: 21,
      hostParagraph: 90,
      cells: [{ listNode: 30, paragraphs: [7, 8] }],
    });
  },
];
for (const [i, corrupt] of invalidSource.entries())
  test(`source cell ownership corruption ${i} refuses admission`, () => {
    const c = content();
    corrupt(c);
    const p = policy(c);
    assert.equal(p.allowsPoint(point(7)), false);
    assert.equal(p.allowsRequest(request('splice')), false);
  });

test('source identity is section scoped and proof cannot reuse another table list', () => {
  const c = content(),
    second = content();
  for (const p of second.paragraphs) p.section = 1;
  second.tables[0].section = 1;
  c.paragraphs.push(...second.paragraphs);
  c.tables.push(...second.tables);
  const p = policy(c);
  assert.equal(p.allowsPoint(point(7)), true);
  assert.equal(p.allowsPoint(point(12)), false);
  assert.equal(p.allowsPoint(point(12, 0, 1)), true);
  assert.equal(p.allowsRange(point(7), point(7, 0, 1)), false);
  const bad = content();
  bad.tables[0].cells[0].listNode = 99;
  assert.equal(policy(bad).allowsPoint(point(7)), false);
});

test('proof changes revoke precisely the prior admitted cell with no source mutation', () => {
  const c = content();
  const first = policy(c),
    next = policy(c, declaration([{ listNode: 31, paragraphs: [11] }]));
  assert.equal(first.allowsPoint(point(7)), true);
  assert.equal(next.allowsPoint(point(7)), false);
  assert.equal(next.allowsPoint(point(11)), true);
  assert.equal(first.allowsPoint(point(11)), false);
  assert(c.paragraphs.every((p) => p.editable && p.selectable));
});

test('point and range lookups never rescan Native paragraph properties after construction', () => {
  const c = content();
  let reads = 0;
  for (const p of c.paragraphs) {
    const id = p.paragraph;
    Object.defineProperty(p, 'paragraph', {
      enumerable: true,
      get() {
        reads++;
        return id;
      },
    });
  }
  const p = policy(c),
    built = reads;
  for (let i = 0; i < 256; i++) {
    assert.equal(p.allowsPoint(point(7, i)), true);
    assert.equal(p.allowsRange(point(7), point(8, i)), true);
    assert.equal(p.allowsRange(point(7), point(11)), false);
  }
  assert.equal(reads, built);
});
