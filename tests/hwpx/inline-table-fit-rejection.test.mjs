import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateBodyRows } from '../../web/preview/page-row-flow.mjs';
import { pageReferenceBoxes } from '../../web/preview/page-reference-boxes.mjs';
import { columnReferenceBoxes } from '../../web/preview/column-reference-boxes.mjs';
import {
  inlineTableRowFitsPaper,
  createInlineTableFitRejection,
} from '../../web/preview/inline-table-row-fit.mjs';

const setting = {
  width: 59528,
  height: 84188,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 5669, right: 5669, top: 5669, bottom: 5669, gutter: 0, header: 0, footer: 0 },
};
const flow = (paragraph, extra = {}) => ({
  section: 0,
  paragraph,
  top_level: true,
  page_break: false,
  column_break: false,
  ...extra,
});
const row = (width, extra = {}) => ({
  kind: 'text',
  section: 0,
  paragraph: 0,
  height: 20,
  text: '한😀',
  tableIndex: 0,
  inlineTableFit: { width, paragraphShape: { left: 0, right: 0, indent: 0, alignment: 1 } },
  ...extra,
});
function run(input, options = {}, flows = [flow(0)], page = setting) {
  let fits = 0;
  const result = paginateBodyRows(input, page, flows, {
    createRowFitRejection: createInlineTableFitRejection,
    rowFitsColumn: (r, c) => {
      fits++;
      return inlineTableRowFitsPaper(r, c);
    },
    ...options,
  });
  return { result, fits };
}
const small = {
  ...setting,
  width: 7500,
  height: 7500,
  margin: { left: 750, right: 750, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const columns = {
  count: 2,
  gap: 0,
  same_size: true,
  direction: 'left',
  kind: 'newspaper',
  ambiguous: false,
};

test('physical paper overflow terminates after one actual fit; original width and owners survive', () => {
  const source = row(54000 / 75);
  const before = structuredClone(source);
  const { result, fits } = run([source]);
  assert.equal(result.error, 'InlineTablePaperOverflow');
  assert.equal(fits, 1);
  assert.equal(result.width, 720);
  assert.equal(result.tableIndex, 0);
  assert.equal(result.section, 0);
  assert.equal(result.paragraph, 0);
  assert.equal(result.rejectedColumns, 1);
  assert(Math.abs(result.overflowRight - 141 / 75) < 1e-8);
  assert.equal(result.overflowLeft, 0);
  assert.deepEqual(source, before);
  const legacy = run([source], { createRowFitRejection: undefined });
  assert.equal(legacy.result.error, 'PageFlowLimit');
  assert.equal(legacy.fits, 2000);
});

test('body-margin overflow and exact paper edge remain supported across alignment and indent', () => {
  const paper = pageReferenceBoxes(setting, { x: 20, y: 20 }).boxes;
  for (const alignment of [0, 1, 2, 3, 4, 5]) {
    for (const indent of [-720, 0, 720]) {
      for (const width of [(48190 - 720) / 75, 48190 / 75, 53859 / 75, 53860 / 75]) {
        const source = row(width, {
          inlineTableFit: { width, paragraphShape: { left: 0, right: 0, indent, alignment } },
        });
        const fits = inlineTableRowFitsPaper(source, { column: paper.page, paper: paper.paper });
        const observed = run([source]);
        assert.equal(observed.result.state, fits ? 'paginated' : 'unavailable');
        if (!fits) assert.equal(observed.result.error, 'InlineTablePaperOverflow');
      }
    }
  }
  assert.equal(run([row(53859 / 75)]).result.state, 'paginated');
  assert.equal(run([row(53860 / 75)]).result.error, 'InlineTablePaperOverflow');
  const mirrored = { ...setting, gutter_type: 'left_right' };
  assert.equal(run([row(53859 / 75)], {}, undefined, mirrored).result.state, 'paginated');
});

test('a failing later column can succeed in the first column of the next page', () => {
  const first = { kind: 'text', section: 0, paragraph: 0, height: 20, text: 'before' };
  const source = row(70, { paragraph: 1 });
  const { result, fits } = run(
    [first, source],
    { columnDeclaration: columns },
    [flow(0), flow(1, { column_break: true })],
    small,
  );
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.rows[1].pageOrdinal, 1);
  assert.equal(result.rows[1].columnOrdinal, 0);
  assert.equal(fits, 3);
  const reverse = run(
    [row(70)],
    { columnDeclaration: { ...columns, direction: 'right' } },
    [flow(0)],
    small,
  );
  assert.equal(reverse.result.state, 'paginated', reverse.result.error);
  assert.equal(reverse.result.rows[0].columnOrdinal, 1);
});

test('proof requires every column and never reuses a prior source or counts a skipped column', () => {
  const reference = pageReferenceBoxes(small, { x: 20, y: 20 }).boxes;
  const boxes = columnReferenceBoxes(reference.page, columns).boxes;
  const source = row(200);
  const make = () =>
    createInlineTableFitRejection(source, { columns: boxes, paper: reference.paper });
  const context = (ordinal) => ({
    column: boxes[ordinal],
    columnOrdinal: ordinal,
    columnCount: 2,
    paper: reference.paper,
  });
  const observe = make();
  assert.equal(observe(source, context(0), false), null);
  assert.equal(observe(source, context(0), false), null);
  assert.equal(observe(source, context(1), false).rejectedColumns, 2);
  assert.equal(make()(source, context(1), false), null);
  const admitted = make();
  assert.equal(admitted(source, context(0), false), null);
  assert.equal(admitted(source, context(1), true), null);
  assert.equal(admitted(source, context(1), false), null);
});

test('generic page-dependent callbacks retain retries and later success without owner proof', () => {
  const { result } = run([row(720)], {
    createRowFitRejection: undefined,
    rowFitsColumn: (_r, c) => c.pageOrdinal >= 7,
  });
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.rows[0].pageOrdinal, 7);
  assert.equal(
    run([row(720)], { createRowFitRejection: undefined, rowFitsColumn: () => false, maxPages: 3 })
      .result.error,
    'PageFlowLimit',
  );
});

test('position-dependent paths disable proof; changing column geometry or source fit retires observations', () => {
  let factories = 0;
  const source = row(720);
  const positioned = run([source], {
    createRowFitRejection: () => {
      factories++;
      throw Error('UnsafePositionedProof');
    },
    measurePositionedRow: (_source, measured) => measured,
    rowFitsColumn: (_r, c) => c.pageOrdinal >= 2,
  });
  assert.equal(positioned.result.state, 'paginated', positioned.result.error);
  assert.equal(factories, 0);
  const reference = pageReferenceBoxes(small, { x: 20, y: 20 }).boxes;
  const boxes = columnReferenceBoxes(reference.page, columns).boxes;
  const context = { column: boxes[0], columnOrdinal: 0, columnCount: 2, paper: reference.paper };
  for (const altered of [
    { ...context, columnCount: 1 },
    { ...context, column: { ...context.column, width: 1 } },
    { ...context, paper: { ...context.paper, width: 1 } },
  ]) {
    const observe = createInlineTableFitRejection(source, {
      columns: boxes,
      paper: reference.paper,
    });
    assert.equal(observe(source, altered, false), null);
    assert.equal(observe(source, context, false), null);
    assert.equal(observe(source, { ...context, column: boxes[1], columnOrdinal: 1 }, false), null);
  }
  assert.equal(
    createInlineTableFitRejection(
      { ...source, paragraphSource: {} },
      { columns: boxes, paper: reference.paper },
    ),
    null,
  );
});

test('malformed factories and observations fail without accepting invalid row fit', () => {
  assert.equal(run([row(720)], { createRowFitRejection: 1 }).result.error, 'InvalidPageFlowBounds');
  for (const value of [undefined, false, {}, [], 0]) {
    assert.equal(
      run([row(720)], { createRowFitRejection: () => value }).result.error,
      'InvalidPageRowFitRejection',
    );
  }
  for (const value of [undefined, false, {}, [], '', { error: '' }]) {
    assert.equal(
      run([row(720)], { createRowFitRejection: () => () => value }).result.error,
      'InvalidPageRowFitRejection',
    );
  }
  assert.equal(run([row(720)], { rowFitsColumn: () => null }).result.error, 'InvalidPageRowFit');
});

test('source-fit changes retire proof, and rejected-column work is bounded by actual visits', () => {
  const reference = pageReferenceBoxes(small, { x: 20, y: 20 }).boxes;
  const boxes = columnReferenceBoxes(reference.page, columns).boxes;
  const source = row(200);
  const context = (ordinal) => ({
    column: boxes[ordinal],
    columnOrdinal: ordinal,
    columnCount: 2,
    paper: reference.paper,
  });
  for (const changed of [
    { width: 201, paragraphShape: source.inlineTableFit.paragraphShape },
    { width: 200, paragraphShape: { ...source.inlineTableFit.paragraphShape, indent: 1 } },
  ]) {
    const observe = createInlineTableFitRejection(source, {
      columns: boxes,
      paper: reference.paper,
    });
    assert.equal(observe(source, context(0), false), null);
    assert.equal(observe({ ...source, inlineTableFit: changed }, context(1), false), null);
    assert.equal(observe(source, context(1), false), null);
  }
  const observed = run([row(2000)], { columnDeclaration: { ...columns, count: 64 } });
  assert.equal(observed.result.error, 'InlineTablePaperOverflow');
  assert.equal(observed.fits, 64);
  assert.equal(observed.result.rejectedColumns, 64);
  const invalidGeometry = run(
    [source],
    {
      createRowFitRejection: () => {
        throw Error('UnvalidatedGeometryProof');
      },
    },
    undefined,
    { ...small, gutter_type: 'top_bottom' },
  );
  assert.equal(invalidGeometry.result.error, 'unsupported_page_geometry');
});
