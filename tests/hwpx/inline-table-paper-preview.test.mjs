import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
import { layoutTableBodyContent } from '../../web/preview/table-body-content-layout.mjs';
import { placeInlineTablePages } from '../../web/preview/inline-table-page-placement.mjs';
import {
  createInlineTablePaperPreview,
  clipInlineTablePaperPreview,
} from '../../web/preview/inline-table-paper-preview.mjs';
import {
  tableBoundaryFrames,
  hitTableBoundary,
  tableBoundaryCaret,
} from '../../web/preview/table-boundary-geometry.mjs';
import { cellTextAtBoundaryPoint } from '../../web/preview/table-boundary-text-hit.mjs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';

// Independently constructed DTO. No file parser, WASM, legacy or reference fixture.
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

for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: strict rejects; explicit opt-in clips only original table and preserves body/data`, () => {
    const content = fixture(format),
      before = structuredClone(content);
    for (const layout of [layoutPageContent, layoutTableBodyContent]) {
      for (const options of [undefined, { oversizeInlineTablePreview: false }]) {
        const strict = layout(content, measure, 1000, options);
        assert.equal(strict.state, 'unavailable');
        assert.equal(strict.error, 'InlineTablePaperOverflow');
      }
      const result = layout(content, measure, 1000, optin);
      assert.equal(result.state, 'paginated', result.error);
      assert.equal(result.sourceCoverage, 'incomplete');
      assert.equal(result.documentPageNumbersExact, false);
      assert.equal(result.boxes.length, 2);
      assert.equal(
        result.boxes.reduce((sum, b) => sum + b.width, 0),
        120,
      );
      assert.equal(result.previewReadOnlyTables.length, 1);
      assert.deepEqual(result.previewReadOnlyTables[0], {
        section: 0,
        tableNode: 7,
        hostParagraph: 1,
        paragraphs: [2, 3],
        reason: 'InlineTablePaperOverflow',
      });
      for (const p of content.paragraphs.filter((p) => p.tableCell)) {
        const rows = result.rows.filter((r) => r.kind === 'text' && r.paragraph === p.paragraph);
        assert.equal(rows.map((r) => r.text).join(''), p.text);
        assert(
          rows.every(
            (r) =>
              r.section === p.section && r.tableNode === 7 && r.listNode === p.tableCell.listNode,
          ),
        );
      }
      for (const item of [...result.boxes, ...result.rows.filter((r) => r.tableNode === 7)]) {
        assert.equal(item.previewOnly, true);
        assert.equal(item.editable, false);
        assert.equal(item.selectable, false);
        assert.deepEqual(item.pageClip, item.referenceBoxes.paper);
      }
      const narrow = layout(fixture(format, 4500), measure, 1000);
      assert.equal(narrow.state, 'paginated', narrow.error);
      for (const id of [0, 4]) {
        const body = result.rows.filter((r) => r.paragraph === id);
        assert(body.length > 0);
        assert.deepEqual(
          body,
          narrow.rows.filter((r) => r.paragraph === id),
        );
        assert(body.every((r) => r.editable && !r.previewOnly && r.pageClip === undefined));
      }
    }
    assert.deepEqual(content, before);
  });
}

test('fitting tables and ordinary body are identical with and without preview opt-in', () => {
  for (const content of [
    fixture('hwpx', 4500),
    {
      ...fixture(),
      tables: [],
      paragraphs: [{ section: 0, paragraph: 0, text: '일반 본문😀', editable: true }],
      paragraphFlows: [fixture().paragraphFlows[0]],
    },
  ]) {
    const strict = run(content, {});
    assert.equal(strict.state, 'paginated', strict.error);
    assert.deepEqual(run(content), strict);
    assert.equal(strict.previewReadOnlyTables, undefined);
  }
});

test('preview cells cannot revive text hits, table boundary hits or protected carets', () => {
  const content = fixture(),
    result = run(content);
  assert.equal(result.state, 'paginated', result.error);
  const paragraphAt = (p) =>
    content.paragraphs.find((s) => s.section === p.section && s.paragraph === p.paragraph);
  // Even stale callers supplying the source anchor must not revive preview geometry.
  const stale = {
    ...result,
    tableAnchors: [{ section: 0, tableNode: 7, hostParagraph: 1, anchorUnit: 0 }],
  };
  assert.deepEqual(result.tableAnchors, []);
  assert((result.flowAnchors ?? []).every((a) => a.tableNode !== 7));
  const normal = run(fixture('hwp5', 4500), {});
  const frames = tableBoundaryFrames(normal);
  assert.equal(frames.length, 1, 'normal table still has a protected boundary');
  const edge = frames[0].rectangle;
  assert.equal(hitTableBoundary(normal, edge.x - 1, edge.y, paragraphAt)?.tableNode, 7);
  assert(tableBoundaryCaret(normal, { section: 0, paragraph: 1, unit: 0 }));
  assert.deepEqual(tableBoundaryFrames(stale), []);
  assert.equal(tableBoundaryCaret(stale, { section: 0, paragraph: 1, unit: 0 }), null);
  for (const box of result.boxes) {
    for (const x of [box.x, box.x + 1, box.x + box.width - 1, box.x + box.width]) {
      assert.equal(hitTableBoundary(stale, x, box.y, paragraphAt), null);
      assert.equal(cellTextAtBoundaryPoint(stale, x, box.y + 10), false);
      const index = rowAtPoint(result, x, box.y + 10);
      assert(index < 0 || result.rows[index].tableNode !== 7 || !result.rows[index].editable);
    }
  }
});

// Exercise admission independently of pagination: it must never relax an unproved row.
function admission() {
  const content = fixture(),
    table = content.tables[0],
    host = content.paragraphs[1];
  const entry = {
    table,
    host,
    inline: true,
    outerInsets: { left: 0, right: 0 },
    measured: {
      state: 'measured',
      grid: { width: 120 },
      flows: new Map(
        table.cells.map((cell) => [cell.listNode, { rows: [{ kind: 'text', text: '셀' }] }]),
      ),
    },
  };
  const row = {
    kind: 'gap',
    tableIndex: 0,
    inlineTableFit: { width: 120, paragraphShape: host.paragraphShape },
  };
  const page = { x: 30, y: 30, width: 80, height: 180 };
  const context = {
    columnCount: 1,
    columnOrdinal: 0,
    page,
    column: page,
    paper: { x: 20, y: 20, width: 100, height: 200 },
  };
  return { content, entry, row, context };
}

test('admission requires original row width, host identity, single column and genuine overflow', () => {
  const f = admission(),
    policy = createInlineTablePaperPreview(f.content, [f.entry]);
  assert(policy);
  assert.equal(policy.mayClip(0), false);
  assert.equal(policy.fitsRow(f.row, f.context), true);
  assert.equal(policy.mayClip(0), true);
  assert.equal(policy.mayClip(1), false);
  for (const change of [
    (f) => (f.row.tableIndex = 1),
    (f) => (f.row.paragraphSource = {}),
    (f) => f.row.inlineTableFit.width++,
    (f) => (f.row.inlineTableFit.paragraphShape = { ...f.entry.host.paragraphShape }),
    (f) => (f.context.columnCount = 2),
    (f) => (f.context.columnOrdinal = 1),
    (f) => (f.context.column = { ...f.context.column, x: 31 }),
    (f) => (f.context.column = { ...f.context.column, width: 79 }),
  ]) {
    const f = admission();
    change(f);
    const p = createInlineTablePaperPreview(f.content, [f.entry]);
    assert(p);
    assert.equal(p.fitsRow(f.row, f.context), false);
    assert.equal(p.mayClip(0), false);
  }
  const invalid = admission();
  invalid.row.inlineTableFit.width = NaN;
  const p = createInlineTablePaperPreview(invalid.content, [invalid.entry]);
  assert.equal(p.fitsRow(invalid.row, invalid.context), null);
  assert.equal(p.mayClip(0), false);
  const fitting = admission();
  fitting.context.paper.width = 200;
  const fittingPolicy = createInlineTablePaperPreview(fitting.content, [fitting.entry]);
  assert.equal(fittingPolicy.fitsRow(fitting.row, fitting.context), true);
  assert.equal(fittingPolicy.mayClip(0), false);
});

const invalidAdmissions = [
  ['nested table', (f) => (f.entry.table.parentTableNode = 99)],
  ['mixed host', (f) => (f.entry.host.text += '문자')],
  ['partial table', (f) => (f.entry.table.partial = true)],
  ['created table', (f) => (f.entry.table.createdTable = true)],
  ['second table', (f) => f.content.tables.push(structuredClone(f.entry.table))],
  ['foreign table identity', (f) => (f.entry.table = structuredClone(f.entry.table))],
  ['foreign host identity', (f) => (f.entry.host = structuredClone(f.entry.host))],
  [
    'duplicate paragraph',
    (f) => f.content.paragraphs.push(structuredClone(f.content.paragraphs[2])),
  ],
  ['wrong list owner', (f) => (f.content.paragraphs[2].tableCell.listNode = 99)],
  ['duplicate list', (f) => (f.entry.table.cells[1].listNode = 8)],
  ['duplicate address', (f) => (f.entry.table.cells[1].column = 0)],
  ['merged cell', (f) => (f.entry.table.cells[0].rowSpan = 2)],
  ['unowned paragraph', (f) => (f.entry.table.cells[0].paragraphs = [99])],
  ['noneditable cell', (f) => (f.content.paragraphs[2].editable = false)],
  ['clipped cell', (f) => (f.content.paragraphs[2].clipped = true)],
  ['source offsets', (f) => (f.content.paragraphs[2].sourceOffsets = [])],
  ['cell object', (f) => (f.content.paragraphs[2].text = '\ufffc')],
  ['limited', (f) => (f.content.limited = true)],
  ['window', (f) => (f.content.window = {})],
  ['view kind', (f) => (f.content.viewKind = 'window')],
  ['caption', (f) => (f.entry.table.sourceGeometry.has_caption = true)],
  ['relative size', (f) => (f.entry.table.sourceGeometry.geometry.width_relative = 0)],
  ['offset', (f) => (f.entry.table.sourceGeometry.geometry.horizontal_offset = 1)],
  ['NaN source width', (f) => (f.entry.table.sourceGeometry.geometry.width = NaN)],
  ['mismatched measured width', (f) => f.entry.measured.grid.width++],
  ['unmeasured', (f) => (f.entry.measured.state = 'unavailable')],
  ['non-map flow', (f) => (f.entry.measured.flows = {})],
  ['cell page break', (f) => (f.entry.measured.flows.get(8).cellPageBreaks = [2])],
  ['flow picture', (f) => (f.entry.measured.flows.get(8).flowPictures = [{}])],
  ['mixed measured row', (f) => (f.entry.measured.flows.get(8).rows[0].kind = 'picture')],
  [
    'identity transform',
    (f) => (f.entry.measured.flows.get(8).rows[0].transform = [1, 0, 0, 1, 0, 0]),
  ],
  [
    'nonidentity transform',
    (f) => (f.entry.measured.flows.get(8).rows[0].transform = [1, 0, 0, 1, 1, 0]),
  ],
  ...[
    'pictures',
    'hwp5Pictures',
    'drawings',
    'hwp5Drawings',
    'charts',
    'formulas',
    'createdTables',
    'hwp5Notes',
    'pageAreaSources',
    'masterPageSources',
  ].map((name) => [name, (f) => (f.content[name] = [{}])]),
];
for (const [name, change] of invalidAdmissions) {
  test(`admission fails closed: ${name}`, () => {
    const f = admission();
    change(f);
    assert.equal(createInlineTablePaperPreview(f.content, [f.entry]), null);
  });
}

for (const [name, mutate] of [
  ['nested', (c) => (c.tables[0].parentTableNode = 99)],
  ['mixed', (c) => (c.paragraphs[1].text += '문자')],
  ['picture', (c) => (c.pictures = [{ section: 0, paragraph: 2, pictureNode: 50 }])],
  ['malformed ownership', (c) => (c.paragraphs[2].tableCell.listNode = 99)],
  [
    'multiple columns',
    (c) => {
      const declaration = {
        count: 2,
        gap: 0,
        same_size: true,
        direction: 'left',
        kind: 'newspaper',
        ambiguous: false,
      };
      for (const f of c.paragraphFlows.filter((f) => f.top_level))
        Object.assign(f, {
          single_column: false,
          column_declaration: declaration,
          column_start_declaration: declaration,
        });
    },
  ],
]) {
  test(`integration never broadens preview eligibility: ${name}`, () => {
    const c = fixture();
    mutate(c);
    const before = structuredClone(c);
    for (const layout of [layoutPageContent, layoutTableBodyContent]) {
      const result = layout(c, measure, 1000, optin);
      assert.equal(result.state, 'unavailable', JSON.stringify(result));
      assert.equal(result.previewReadOnlyTables, undefined);
    }
    assert.deepEqual(c, before);
  });
}

test('option is a strict boolean at both public layout boundaries', () => {
  for (const value of [null, 0, 1, 'true', {}, []]) {
    for (const layout of [layoutPageContent, layoutTableBodyContent])
      assert.equal(
        layout(fixture(), measure, 1000, { oversizeInlineTablePreview: value }).error,
        'InvalidInlineTablePaperPreview',
      );
  }
});

test('final placement is strict by default; clips preserve coordinates and narrower prior clips', () => {
  const c = fixture(),
    table = c.tables[0],
    host = c.paragraphs[1];
  const paper = { x: 20, y: 20, width: 100, height: 200 };
  const referenceBoxes = { paper, column: { x: 30, y: 30, width: 80, height: 180 } };
  const box = {
    section: 0,
    tableNode: 7,
    listNode: 8,
    pageOrdinal: 0,
    columnOrdinal: 0,
    x: 30,
    y: 50,
    width: 120,
    height: 40,
    referenceBoxes,
  };
  const row = {
    ...box,
    kind: 'text',
    paragraph: 2,
    text: '한😀',
    startUnit: 0,
    endUnit: 3,
    pageClip: { x: 40, y: 55, width: 50, height: 20 },
  };
  const ordinary = { ...row, tableNode: undefined, paragraph: 0, pageClip: undefined };
  const layout = { state: 'placed', boxes: [box], rows: [row, ordinary] },
    before = structuredClone(layout);
  assert.equal(placeInlineTablePages(table, host, layout, 0).error, 'InlineTablePageWidthOverflow');
  const placed = placeInlineTablePages(table, host, layout, 0, { allowPaperClip: true });
  assert.equal(placed.state, 'placed', placed.error);
  assert.equal(placed.boxes[0].width, 120);
  assert.equal(placed.boxes[0].x, box.x);
  assert.deepEqual(placed.rows[0].pageClip, row.pageClip);
  assert.equal(placed.rows[1], ordinary);
  assert.deepEqual(layout, before);
  for (const transform of [null, false, 0, [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0]]) {
    assert.equal(
      clipInlineTablePaperPreview(table, { ...layout, rows: [{ ...row, transform }] }).state,
      'unavailable',
    );
  }
  for (const mutate of [
    (l) => l.boxes.push({ ...box, pageOrdinal: 1 }),
    (l) => (l.boxes[0].depth = 1),
    (l) => (l.rows[0].referenceBoxes = {}),
    (l) => (l.rows[0].pageClip.width = -1),
    (l) => (l.flowPictures = [{ section: 0, cell: { tableNode: 7 } }]),
  ]) {
    const bad = structuredClone(layout);
    mutate(bad);
    assert.equal(clipInlineTablePaperPreview(table, bad).state, 'unavailable');
  }
});

test('regression: early admission rejects present malformed transforms just like final clipping', () => {
  for (const transform of [null, false, 0]) {
    const f = admission();
    f.entry.measured.flows.get(8).rows[0].transform = transform;
    assert.equal(
      createInlineTablePaperPreview(f.content, [f.entry]),
      null,
      `transform ${JSON.stringify(transform)} must fail before row fit is relaxed`,
    );
  }
});

test('regression: early admission requires measured flows for every owned cell', () => {
  for (const missing of [[8], [9], [8, 9]]) {
    const f = admission();
    missing.forEach((id) => f.entry.measured.flows.delete(id));
    assert.equal(
      createInlineTablePaperPreview(f.content, [f.entry]),
      null,
      `missing cell flows: ${missing}`,
    );
  }
});

test('regression: clipping rejects a row outside the owning boxes page/column instance', () => {
  const table = fixture().tables[0];
  const paper = { x: 20, y: 20, width: 100, height: 200 };
  const box = {
    section: 0,
    tableNode: 7,
    listNode: 8,
    pageOrdinal: 0,
    columnOrdinal: 0,
    x: 30,
    y: 40,
    width: 120,
    height: 40,
    referenceBoxes: { paper },
  };
  for (const owner of [{ pageOrdinal: 1 }, { columnOrdinal: 1 }]) {
    const layout = {
      state: 'placed',
      boxes: [box],
      rows: [{ ...box, ...owner, kind: 'text', paragraph: 2 }],
    };
    assert.equal(
      clipInlineTablePaperPreview(table, layout).state,
      'unavailable',
      JSON.stringify(owner),
    );
  }
});

test('body-margin overflow up to the exact paper edge retains normal editable table semantics', () => {
  for (const width of [6000, 6750]) {
    const c = fixture('hwp5', width),
      strict = run(c, {});
    assert.equal(strict.state, 'paginated', strict.error);
    assert.deepEqual(run(c), strict);
    assert.equal(strict.previewReadOnlyTables, undefined);
    assert(strict.rows.filter((r) => r.tableNode === 7).every((r) => r.editable && !r.previewOnly));
    assert.equal(tableBoundaryFrames(strict).length, 1);
  }
  const outside = fixture('hwp5', 6751);
  assert.equal(run(outside, {}).error, 'InlineTablePaperOverflow');
  assert.equal(run(outside).previewReadOnlyTables.length, 1);
});

// Real HWPX DTOs prove caption absence with sourceCaption:null, not an HWP5 flag.
test('caption absence uses each format reader proof and never defaults missing values', () => {
  const f = admission();
  f.content.format = 'hwpx';
  delete f.entry.table.sourceGeometry.has_caption;
  f.entry.table.sourceCaption = null;
  assert(createInlineTablePaperPreview(f.content, [f.entry]));
  for (const mutate of [
    (f) => delete f.entry.table.sourceCaption,
    (f) => {
      f.content.format = 'hwp5';
    },
    (f) => {
      f.entry.table.sourceGeometry.has_caption = true;
    },
    (f) => {
      f.entry.table.sourceCaption = {};
    },
  ]) {
    const next = structuredClone(f);
    mutate(next);
    // structuredClone keeps shared table/host references and the Map.
    assert.equal(createInlineTablePaperPreview(next.content, [next.entry]), null);
  }
  for (const format of ['hwp5', 'hwpx']) {
    const next = admission();
    next.content.format = format;
    next.entry.table.sourceCaption = {};
    assert.equal(createInlineTablePaperPreview(next.content, [next.entry]), null);
  }
});
