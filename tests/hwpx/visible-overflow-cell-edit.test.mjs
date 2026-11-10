import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { layoutTableBodyContent } from '../../web/preview/table-body-content-layout.mjs';
import { projectVisibleOverflowCells } from '../../web/preview/visible-overflow-cell-edit.mjs';
import { hitText, caretGeometry, selectionRects } from '../../web/preview/text-geometry.mjs';
import { rowLeft, rowTextTop } from '../../web/preview/row-geometry.mjs';
import {
  tableBoundaryFrames,
  tableBoundaryCaret,
} from '../../web/preview/table-boundary-geometry.mjs';

// Independent synthetic DTO, derived from inline-table-paper-preview.test.mjs.
// No parser, WASM, on-disk document, implementation oracle, or browser.
const measure = (text) => ({ width: [...text].length * 8, height: 16 });
const optin = { oversizeInlineTablePreview: true };
function fixture(format = 'hwp5', width = 9000) {
  const paragraphShape = { alignment: 1, left: 0, right: 0, indent: 0, before: 0, after: 0 };
  const table = {
    section: 0,
    tableNode: 7,
    hostParagraph: 1,
    anchorUnit: 0,
    parentTableNode: null,
    partial: false,
    rows: 1,
    columns: 2,
    sourceCaption: null,
    sourceGeometry: {
      geometry: {
        width,
        height: 3000,
        width_relative: 4,
        height_relative: 2,
        treat_as_character: true,
        horizontal_offset: 0,
        vertical_offset: 0,
      },
      has_caption: false,
      text_wrap: 3,
      text_flow: 0,
      flow_with_text: true,
      vertical_relative: 2,
      horizontal_relative: 2,
      vertical_alignment: 0,
      horizontal_alignment: 0,
      out_margin: [0, 0, 0, 0],
      in_margin: [0, 0, 0, 0],
    },
    pagination: { page_break: 'table', repeat_header: false, cell_spacing: 0 },
    cells: [0, 1].map((column) => ({
      listNode: 8 + column,
      row: 0,
      column,
      rowSpan: 1,
      columnSpan: 1,
      width: column === 0 ? Math.floor(width / 2) : width - Math.floor(width / 2),
      height: 3000,
      paragraphs: [2 + column],
      sourceMargin: { has_margin: false, header: false, margin: [0, 0, 0, 0] },
      sourceVerticalAlignment: 0,
      sourceLineWrap: 0,
      sourceTextDirection: 0,
    })),
  };
  const paragraphs = ['앞 본문', '\ufffc', '셀 한😀', '두 번째', '뒤 본문'].map(
    (text, paragraph) => ({
      section: 0,
      paragraph,
      text,
      editable: true,
      paragraphShape: { ...paragraphShape },
      ...(paragraph === 2 || paragraph === 3
        ? {
            tableCell: {
              tableNode: 7,
              listNode: 8 + paragraph - 2,
              row: 0,
              column: paragraph - 2,
              rowSpan: 1,
              columnSpan: 1,
            },
          }
        : {}),
    }),
  );
  return {
    format,
    limited: false,
    tables: [table],
    paragraphs,
    pictures: [],
    drawings: [],
    lines: [],
    pageSettings: [
      {
        section_ordinal: 0,
        width: 7500,
        height: 15000,
        orientation: 'widely',
        gutter_type: 'left_only',
        duplicate_margins: 0,
        margin: { left: 750, right: 750, top: 750, bottom: 750, gutter: 0, header: 0, footer: 0 },
      },
    ],
    paragraphFlows: paragraphs.map((p) => ({
      section: 0,
      paragraph: p.paragraph,
      top_level: !p.tableCell,
      host: p.tableCell ? 'table' : 'body',
      single_column: true,
      page_break: false,
      column_break: false,
      column_changes: [],
      column_declaration: null,
    })),
  };
}
const run = (content, options = optin) => layoutPageContent(content, measure, 1000, options);

function setup(format = 'hwp5', texts = null) {
  const content = fixture(format);
  if (texts) {
    content.paragraphs[2].text = texts[0];
    content.paragraphs[3].text = texts[1];
  }
  const layout = run(content);
  assert.equal(layout.state, 'paginated', layout.error);
  return { content, layout };
}
const cellRows = (layout, listNode = 8) =>
  layout.rows.filter((r) => r.kind === 'text' && r.tableNode === 7 && r.listNode === listNode);
const boxAt = (f) => f.layout.boxes.find((b) => b.listNode === 8);
const rowAt = (f) => cellRows(f.layout)[0];
const descriptorCells = (layout) =>
  layout.previewReadOnlyTables?.find((t) => t.section === 0 && t.tableNode === 7)?.editableCells ??
  [];
function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freezeDeep(child);
  return value;
}
function assertDenied(content, layout, listNode = 8, displayContent = content) {
  const before = structuredClone({ content, layout, displayContent });
  const result = projectVisibleOverflowCells(
    freezeDeep(content),
    freezeDeep(layout),
    freezeDeep(displayContent),
  );
  assert(result && Array.isArray(result.rows), 'projection returns a layout');
  assert(cellRows(result, listNode).every((r) => r.editable !== true && r.selectable !== true));
  assert(!descriptorCells(result).some((c) => c.listNode === listNode));
  for (const row of layout.rows.filter((r) => r.tableNode === undefined))
    assert(result.rows.includes(row), 'denial preserves body row identity');
  assert.deepEqual(result.boxes, layout.boxes, 'denial preserves every box');
  assert.deepEqual(
    { content, layout, displayContent },
    before,
    'denial cannot mutate source, display or layout',
  );
  return result;
}
function assertAdmitted(f, expectedParagraphs = [2]) {
  const before = structuredClone(f);
  const body = f.layout.rows.filter((r) => r.tableNode === undefined);
  const result = projectVisibleOverflowCells(
    freezeDeep(f.content),
    freezeDeep(f.layout),
    freezeDeep(f.displayContent ?? f.content),
  );
  assert(cellRows(result).length > 0);
  assert(cellRows(result).every((r) => r.editable === true && r.selectable === true));
  assert.deepEqual(descriptorCells(result), [{ listNode: 8, paragraphs: expectedParagraphs }]);
  assert(cellRows(result, 9).every((r) => r.editable === false && r.selectable === false));
  for (const row of body) assert(result.rows.includes(row), 'body rows retain object identity');
  assert.deepEqual(result.boxes, f.layout.boxes, 'no box resizing or edit promotion');
  assert(
    result.boxes.every((b) => b.previewOnly && b.editable === false && b.selectable === false),
  );
  for (const row of cellRows(result)) {
    const original = f.layout.rows.find(
      (r) =>
        r.paragraph === row.paragraph &&
        r.startUnit === row.startUnit &&
        r.listNode === row.listNode,
    );
    // Flags may change; every original geometry/ownership/Native unit field is retained.
    const { editable: _e, selectable: _s, previewOnly: _p, ...geometry } = row;
    const { editable: _oe, selectable: _os, previewOnly: _op, ...originalGeometry } = original;
    assert.deepEqual(geometry, originalGeometry);
  }
  assert.deepEqual(result.tableAnchors, f.layout.tableAnchors);
  assert.deepEqual(result.flowAnchors, f.layout.flowAnchors);
  assert.deepEqual(tableBoundaryFrames(result), []);
  assert.equal(tableBoundaryCaret(result, { section: 0, paragraph: 1, unit: 0 }), null);
  assert.deepEqual(f, before, 'projection cannot mutate Native content or low-level layout');
  return result;
}

for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: low-level preview stays readonly; explicit projection admits only whole visible cell`, () => {
    const f = setup(format);
    for (const lowlevel of [layoutPageContent, layoutTableBodyContent]) {
      const layout = lowlevel(f.content, measure, 1000, optin);
      assert.equal(layout.state, 'paginated', layout.error);
      assert(
        layout.rows
          .filter((r) => r.tableNode === 7)
          .every((r) => r.previewOnly && r.editable === false && r.selectable === false),
      );
      assert.equal(layout.previewReadOnlyTables[0].editableCells, undefined);
      const result = assertAdmitted({ content: structuredClone(f.content), layout });
      assert.equal(
        result.boxes.reduce((sum, b) => sum + b.width, 0),
        120,
      );
      assert.deepEqual(result.previewReadOnlyTables[0].paragraphs, [2, 3]);
    }
  });
}

test('admitted text hits, selections and every Native caret stay inside paper and existing clip', () => {
  const f = setup(),
    result = assertAdmitted(f);
  const row = cellRows(result)[0];
  assert.equal(hitText(result, rowLeft(row) + 1, row.y + rowTextTop(row) + 1)?.paragraph, 2);
  for (const boundary of row.boundaries) {
    const caret = caretGeometry(result, { section: 0, paragraph: 2, unit: boundary.unit });
    assert(caret, `Native boundary ${boundary.unit} has a caret`);
    for (const clip of [row.pageClip, row.referenceBoxes.paper]) {
      assert(caret.x >= clip.x && caret.x + 2 <= clip.x + clip.width);
      assert(caret.y >= clip.y && caret.y + caret.height <= clip.y + clip.height);
    }
  }
  const rects = selectionRects(
    result,
    { section: 0, paragraph: 2, unit: 0 },
    { section: 0, paragraph: 2, unit: row.endUnit },
  );
  assert(rects.length > 0);
  for (const rect of rects) {
    assert(rect.x >= row.pageClip.x && rect.x + rect.width <= row.pageClip.x + row.pageClip.width);
  }
  const paper = row.referenceBoxes.paper;
  for (const [x, y] of [
    [paper.x - 0.01, row.y + 1],
    [paper.x + paper.width, row.y + 1],
    [row.x + 1, paper.y - 0.01],
    [row.x + 1, paper.y + paper.height],
  ]) {
    assert.equal(hitText(result, x, y), null);
    assert.equal(hitText(result, x, y, { section: 0, paragraph: 2 }), null);
  }
  assert.equal(caretGeometry(result, { section: 0, paragraph: 3, unit: 0 }), null);
});

for (const text of ['', '한😀', '가나다라마바사아자차카타파하가나다라마바사아자차카타파하']) {
  test(`empty/Unicode/multiline cell admits all rows: ${JSON.stringify(text)}`, () => {
    const f = setup('hwp5', [text, '숨김']);
    const rows = cellRows(f.layout);
    if (text.length > 20) assert(rows.length > 1, 'fixture genuinely wraps');
    const result = assertAdmitted(f);
    assert.equal(
      cellRows(result)
        .map((r) => r.text)
        .join(''),
      text,
    );
    for (const row of cellRows(result))
      for (const boundary of row.boundaries)
        assert(caretGeometry(result, { section: 0, paragraph: 2, unit: boundary.unit }));
  });
}

function multiparagraph() {
  const content = fixture();
  content.tables[0].cells[0].paragraphs.push(5);
  content.paragraphs.push({ ...structuredClone(content.paragraphs[2]), paragraph: 5, text: '' });
  content.paragraphFlows.push({ ...content.paragraphFlows[2], paragraph: 5 });
  const layout = run(content);
  assert.equal(layout.state, 'paginated', layout.error);
  return { content, layout };
}
test('whole-cell admission includes every owned paragraph, including an empty trailing paragraph', () => {
  const f = multiparagraph();
  assert.deepEqual([...new Set(cellRows(f.layout).map((r) => r.paragraph))], [2, 5]);
  assertAdmitted(f, [2, 5]);
});

test('existing narrower clips are preserved; exact cell, row and caret bounds are inclusive', () => {
  const f = setup();
  const box = boxAt(f);
  const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
  box.pageClip = { ...clip };
  for (const row of cellRows(f.layout)) row.pageClip = { ...clip };
  const result = assertAdmitted(f);
  assert.deepEqual(cellRows(result)[0].pageClip, clip);
});

test('end caret needs its full 2px even when the row and cell end exactly on the clip', () => {
  for (const beyond of [0, 0.01, 1, 2]) {
    const f = setup();
    const row = rowAt(f),
      box = boxAt(f);
    const clip = { x: box.x, y: box.y, width: box.width, height: box.height };
    box.pageClip = { ...clip };
    row.pageClip = { ...clip };
    row.boundaries.at(-1).x = clip.x + clip.width - rowLeft(row) - 2 + beyond;
    if (beyond === 0) assertAdmitted(f);
    else assertDenied(f.content, f.layout);
  }
});

test('every intermediate caret is checked even when first and last carets are contained', () => {
  const f = setup();
  const row = rowAt(f);
  row.boundaries[1].x = row.pageClip.x + row.pageClip.width - rowLeft(row) - 1;
  assertDenied(f.content, f.layout);
});

test('equal caret x positions remain valid for zero-advance glyph boundaries', () => {
  const f = setup();
  rowAt(f).boundaries[1].x = rowAt(f).boundaries[0].x;
  assertAdmitted(f);
});

test('fresh layout geometry revokes earlier admission and descriptor without stale caching', () => {
  const f = setup(),
    admitted = assertAdmitted(f);
  for (const fresh of [structuredClone(f.layout), structuredClone(admitted)]) {
    const box = fresh.boxes.find((b) => b.listNode === 8);
    box.width = box.referenceBoxes.paper.x + box.referenceBoxes.paper.width - box.x + 0.01;
    assertDenied(structuredClone(f.content), fresh);
  }
});

test('ordinary fitting table and body layout are returned by identical reference', () => {
  for (const content of [
    fixture('hwp5', 4500),
    {
      ...fixture(),
      tables: [],
      paragraphs: [{ section: 0, paragraph: 0, text: '본문', editable: true }],
      paragraphFlows: [fixture().paragraphFlows[0]],
    },
  ]) {
    const layout = run(content, {});
    assert.equal(layout.state, 'paginated', layout.error);
    freezeDeep(content);
    freezeDeep(layout);
    assert.equal(projectVisibleOverflowCells(content, layout), layout);
  }
});

// Mutations are applied AFTER the low-level layout: the projection must verify
// the geometry/ownership it receives rather than trusting an earlier admission.
const deniedCases = [
  [
    'partially clipped cell box',
    (f) => {
      boxAt(f).pageClip.width = 69.99;
    },
  ],
  [
    'fully hidden cell box',
    (f) => {
      boxAt(f).pageClip.width = 0;
    },
  ],
  [
    'box outside paper',
    (f) => {
      boxAt(f).width = 90.01;
    },
  ],
  [
    'box above paper',
    (f) => {
      boxAt(f).y = 19.99;
    },
  ],
  [
    'box below paper',
    (f) => {
      boxAt(f).height = 162.01;
    },
  ],
  [
    'narrower row clip',
    (f) => {
      rowAt(f).pageClip.width = 69.99;
    },
  ],
  [
    'hidden row',
    (f) => {
      rowAt(f).pageClip.height = 0;
    },
  ],
  [
    'row width outside clip',
    (f) => {
      rowAt(f).width = 90.01;
    },
  ],
  [
    'row paragraph offset outside clip',
    (f) => {
      rowAt(f).paragraphX = -10.01;
    },
  ],
  [
    'row above clip',
    (f) => {
      rowAt(f).y = 19.99;
    },
  ],
  [
    'row text height outside clip',
    (f) => {
      rowAt(f).textHeight = 163;
    },
  ],
  [
    'row text top outside clip',
    (f) => {
      rowAt(f).textTop = 163;
    },
  ],
  [
    'caret before clip',
    (f) => {
      rowAt(f).boundaries[0].x = -10.01;
    },
  ],
  [
    'source paragraph editable false',
    (f) => {
      f.content.paragraphs[2].editable = false;
    },
  ],
  [
    'source paragraph missing editable proof',
    (f) => {
      delete f.content.paragraphs[2].editable;
    },
  ],
  [
    'merged row span',
    (f) => {
      f.content.tables[0].cells[0].rowSpan = 2;
    },
  ],
  [
    'merged column span',
    (f) => {
      f.content.tables[0].cells[0].columnSpan = 2;
    },
  ],
  [
    'caption flag',
    (f) => {
      f.content.tables[0].sourceGeometry.has_caption = true;
    },
  ],
  [
    'caption object',
    (f) => {
      f.content.tables[0].sourceCaption = {};
    },
  ],
  [
    'nested source table',
    (f) => {
      f.content.tables[0].parentTableNode = 99;
    },
  ],
  [
    'nested box',
    (f) => {
      boxAt(f).depth = 1;
    },
  ],
  [
    'missing box',
    (f) => {
      f.layout.boxes = f.layout.boxes.filter((b) => b.listNode !== 8);
    },
  ],
  [
    'duplicate box',
    (f) => {
      f.layout.boxes.push(structuredClone(boxAt(f)));
    },
  ],
  [
    'box wrong list owner',
    (f) => {
      boxAt(f).listNode = 99;
    },
  ],
  [
    'box wrong section',
    (f) => {
      boxAt(f).section = 1;
    },
  ],
  [
    'box wrong table',
    (f) => {
      boxAt(f).tableNode = 99;
    },
  ],
  [
    'box wrong page instance',
    (f) => {
      boxAt(f).pageOrdinal = 1;
    },
  ],
  [
    'box wrong column instance',
    (f) => {
      boxAt(f).columnOrdinal = 1;
    },
  ],
  [
    'row wrong list owner',
    (f) => {
      rowAt(f).listNode = 99;
    },
  ],
  [
    'row wrong paragraph owner',
    (f) => {
      rowAt(f).paragraph = 3;
    },
  ],
  [
    'row wrong section',
    (f) => {
      rowAt(f).section = 1;
    },
  ],
  [
    'row wrong table',
    (f) => {
      rowAt(f).tableNode = 99;
    },
  ],
  [
    'row wrong page instance',
    (f) => {
      rowAt(f).pageOrdinal = 1;
    },
  ],
  [
    'row wrong column instance',
    (f) => {
      rowAt(f).columnOrdinal = 1;
    },
  ],
  [
    'source wrong list owner',
    (f) => {
      f.content.paragraphs[2].tableCell.listNode = 99;
    },
  ],
  [
    'missing source paragraph',
    (f) => {
      f.content.paragraphs.splice(2, 1);
    },
  ],
  [
    'duplicate source paragraph',
    (f) => {
      f.content.paragraphs.push(structuredClone(f.content.paragraphs[2]));
    },
  ],
  [
    'duplicate source cell',
    (f) => {
      f.content.tables[0].cells.push(structuredClone(f.content.tables[0].cells[0]));
    },
  ],
  [
    'missing row',
    (f) => {
      f.layout.rows = f.layout.rows.filter((r) => r.listNode !== 8);
    },
  ],
  [
    'duplicate row',
    (f) => {
      f.layout.rows.push(structuredClone(rowAt(f)));
    },
  ],
  [
    'row start inconsistent with text length',
    (f) => {
      rowAt(f).startUnit = 1;
    },
  ],
  [
    'row end inconsistent with text length',
    (f) => {
      rowAt(f).endUnit--;
    },
  ],
  [
    'row text length inconsistent with units',
    (f) => {
      rowAt(f).text = '변조';
    },
  ],
  [
    'missing boundaries',
    (f) => {
      delete rowAt(f).boundaries;
    },
  ],
  [
    'empty boundaries',
    (f) => {
      rowAt(f).boundaries = [];
    },
  ],
  [
    'missing first boundary',
    (f) => {
      rowAt(f).boundaries.shift();
    },
  ],
  [
    'missing last boundary',
    (f) => {
      rowAt(f).boundaries.pop();
    },
  ],
  [
    'invalid caret x',
    (f) => {
      rowAt(f).boundaries[1].x = NaN;
    },
  ],
  [
    'decreasing caret x',
    (f) => {
      rowAt(f).boundaries[1].x = -1;
    },
  ],
  [
    'duplicate caret unit',
    (f) => {
      rowAt(f).boundaries[1].unit = 0;
    },
  ],
  [
    'missing box paper',
    (f) => {
      delete boxAt(f).referenceBoxes.paper;
    },
  ],
  [
    'missing row paper',
    (f) => {
      delete rowAt(f).referenceBoxes.paper;
    },
  ],
  [
    'malformed box clip',
    (f) => {
      boxAt(f).pageClip.width = -1;
    },
  ],
  [
    'malformed row clip',
    (f) => {
      rowAt(f).pageClip.x = NaN;
    },
  ],
  [
    'malformed box width',
    (f) => {
      boxAt(f).width = NaN;
    },
  ],
  [
    'missing box clip',
    (f) => {
      delete boxAt(f).pageClip;
    },
  ],
  [
    'missing row clip',
    (f) => {
      delete rowAt(f).pageClip;
    },
  ],
  [
    'missing row x',
    (f) => {
      delete rowAt(f).x;
    },
  ],
  [
    'missing row y',
    (f) => {
      delete rowAt(f).y;
    },
  ],
  [
    'nonfinite row x',
    (f) => {
      rowAt(f).x = Infinity;
    },
  ],
  [
    'zero row height',
    (f) => {
      rowAt(f).height = 0;
    },
  ],
  [
    'zero text height',
    (f) => {
      rowAt(f).textHeight = 0;
    },
  ],
  [
    'negative row height',
    (f) => {
      rowAt(f).height = -1;
    },
  ],
  [
    'malformed row height',
    (f) => {
      rowAt(f).height = NaN;
    },
  ],
  ...[null, false, 0, [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0]].flatMap((transform) => [
    [
      `present row transform ${JSON.stringify(transform)}`,
      (f) => {
        rowAt(f).transform = transform;
      },
    ],
    [
      `present box transform ${JSON.stringify(transform)}`,
      (f) => {
        boxAt(f).transform = transform;
      },
    ],
  ]),
];
for (const [name, mutate] of deniedCases) {
  test(`fails closed: ${name}`, () => {
    const f = setup();
    mutate(f);
    assertDenied(f.content, f.layout);
  });
}
for (const [name, mutate] of [
  [
    'second paragraph row absent',
    (f) => {
      f.layout.rows = f.layout.rows.filter((r) => r.paragraph !== 5);
    },
  ],
  [
    'second paragraph source readonly',
    (f) => {
      f.content.paragraphs.find((p) => p.paragraph === 5).editable = false;
    },
  ],
  [
    'only last multiline row clipped',
    (f) => {
      const rows = cellRows(f.layout),
        last = rows.at(-1);
      last.pageClip = { ...last.pageClip, width: 69.99 };
      assert.equal(rows[0].pageClip.width, 100, 'earlier row remains wholly visible');
    },
  ],
]) {
  test(`all rows and all paragraphs required: ${name}`, () => {
    const f = name.includes('multiline')
      ? setup('hwp5', ['가나다라마바사아자차카타파하가나다라마바사아자차카타파하', '숨김'])
      : multiparagraph();
    mutate(f);
    const result = assertDenied(f.content, f.layout);
    for (const paragraph of [2, 5])
      assert.equal(caretGeometry(result, { section: 0, paragraph, unit: 0 }), null);
  });
}

for (const delta of [-75, 75]) {
  test(`stale source width revokes admission without changing the box: ${delta}`, () => {
    const f = setup();
    const admitted = assertAdmitted(f);
    for (const layout of [structuredClone(f.layout), structuredClone(admitted)]) {
      const content = structuredClone(f.content);
      content.tables[0].cells[0].width += delta;
      assertDenied(content, layout);
    }
  });
}

test('a resized box cannot be admitted against the unchanged original source width', () => {
  const f = setup();
  boxAt(f).width -= 1;
  assertDenied(f.content, f.layout);
});

for (const [startUnit, endUnit] of [
  [1, 5],
  [0, 3],
]) {
  test(`nonidentical overlapping row range is denied: ${startUnit}..${endUnit}`, () => {
    const f = setup(),
      original = rowAt(f);
    const extra = structuredClone(original);
    extra.startUnit = startUnit;
    extra.endUnit = endUnit;
    extra.text = original.text.slice(startUnit, endUnit);
    extra.boundaries = extra.boundaries.filter((b) => b.unit >= startUnit && b.unit <= endUnit);
    extra.y += original.height;
    assert.equal(extra.text.length, endUnit - startUnit);
    assert.equal(extra.boundaries[0].unit, startUnit);
    assert.equal(extra.boundaries.at(-1).unit, endUnit);
    f.layout.rows.splice(f.layout.rows.indexOf(original) + 1, 0, extra);
    assertDenied(f.content, f.layout);
  });
}

for (const [name, mutate] of [
  [
    'tables null',
    (f) => {
      f.content.tables = null;
    },
  ],
  [
    'tables object',
    (f) => {
      f.content.tables = {};
    },
  ],
  [
    'tables missing',
    (f) => {
      delete f.content.tables;
    },
  ],
  [
    'null table entry',
    (f) => {
      f.content.tables = [null];
    },
  ],
  [
    'paragraphs null',
    (f) => {
      f.content.paragraphs = null;
    },
  ],
  [
    'paragraphs object',
    (f) => {
      f.content.paragraphs = {};
    },
  ],
  [
    'paragraphs missing',
    (f) => {
      delete f.content.paragraphs;
    },
  ],
  [
    'null paragraph entry',
    (f) => {
      f.content.paragraphs.push(null);
    },
  ],
  [
    'cells null',
    (f) => {
      f.content.tables[0].cells = null;
    },
  ],
  [
    'cells object',
    (f) => {
      f.content.tables[0].cells = {};
    },
  ],
  [
    'cells missing',
    (f) => {
      delete f.content.tables[0].cells;
    },
  ],
  [
    'null cell entry',
    (f) => {
      f.content.tables[0].cells.push(null);
    },
  ],
  [
    'cell paragraphs null',
    (f) => {
      f.content.tables[0].cells[0].paragraphs = null;
    },
  ],
  [
    'cell paragraphs object',
    (f) => {
      f.content.tables[0].cells[0].paragraphs = {};
    },
  ],
]) {
  test(`malformed source arrays fail closed without throwing: ${name}`, () => {
    const f = setup();
    mutate(f);
    assertDenied(f.content, f.layout);
  });
}

const coverageText = '가나다라마바사아자차카타파하가나다라마바사아자차카타파하';
function pendingDraft() {
  const content = fixture();
  const displayContent = structuredClone(content);
  displayContent.paragraphs[2].text = coverageText;
  const layout = run(displayContent);
  assert.equal(layout.state, 'paginated', layout.error);
  assert(displayContent.paragraphs[2].text.length > content.paragraphs[2].text.length);
  assert(cellRows(layout).length >= 3, 'draft must actually produce multiple text rows');
  return { content, displayContent, layout };
}

for (const part of ['first', 'middle', 'last']) {
  test(`complete paragraph coverage rejects missing ${part} multiline row`, () => {
    for (const f of [setup('hwp5', [coverageText, '숨김']), pendingDraft()]) {
      assertAdmitted(structuredClone(f));
      const rows = cellRows(f.layout);
      assert(rows.length >= 3, 'first/middle/last are distinct measured rows');
      const missing = rows[part === 'first' ? 0 : part === 'last' ? rows.length - 1 : 1];
      f.layout.rows = f.layout.rows.filter((r) => r !== missing);
      assert(cellRows(f.layout).length > 0, 'same paragraph still has other visible rows');
      const result = assertDenied(f.content, f.layout, 8, f.displayContent ?? f.content);
      assert.equal(caretGeometry(result, { section: 0, paragraph: 2, unit: 0 }), null);
    }
  });
}

test('pending draft extends canonical text using explicit display without changing Native source', () => {
  const f = pendingDraft();
  // The default canonical display cannot prove rows measured from longer draft text.
  assertDenied(structuredClone(f.content), structuredClone(f.layout));
  const result = assertAdmitted(f);
  const rows = cellRows(result);
  assert.equal(rows[0].startUnit, 0);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].startUnit, rows[i - 1].endUnit);
  assert.equal(rows.at(-1).endUnit, f.displayContent.paragraphs[2].text.length);
  assert.equal(rows.map((r) => r.text).join(''), f.displayContent.paragraphs[2].text);
  assert.notEqual(f.content.paragraphs[2].text, f.displayContent.paragraphs[2].text);
  assert(caretGeometry(result, { section: 0, paragraph: 2, unit: rows.at(-1).endUnit }));
});

for (const [name, mutate] of [
  [
    'nonstring text',
    (f) => {
      f.displayContent.paragraphs[2].text = null;
    },
  ],
  [
    'different text with same length',
    (f) => {
      f.displayContent.paragraphs[2].text = '나'.repeat(coverageText.length);
    },
  ],
  [
    'unrepresented trailing text',
    (f) => {
      f.displayContent.paragraphs[2].text += '끝';
    },
  ],
  [
    'wrong table owner',
    (f) => {
      f.displayContent.paragraphs[2].tableCell.tableNode = 99;
    },
  ],
  [
    'wrong list owner',
    (f) => {
      f.displayContent.paragraphs[2].tableCell.listNode = 99;
    },
  ],
  [
    'missing owner',
    (f) => {
      delete f.displayContent.paragraphs[2].tableCell;
    },
  ],
  [
    'duplicate paragraph',
    (f) => {
      f.displayContent.paragraphs.push(structuredClone(f.displayContent.paragraphs[2]));
    },
  ],
  [
    'missing paragraph',
    (f) => {
      f.displayContent.paragraphs.splice(2, 1);
    },
  ],
  [
    'invalid paragraph array',
    (f) => {
      f.displayContent.paragraphs = null;
    },
  ],
  [
    'canonical owner readonly despite editable draft',
    (f) => {
      f.content.paragraphs[2].editable = false;
    },
  ],
]) {
  test(`explicit display proof fails closed: ${name}`, () => {
    const f = pendingDraft();
    mutate(f);
    assertDenied(f.content, f.layout, 8, f.displayContent);
  });
}
