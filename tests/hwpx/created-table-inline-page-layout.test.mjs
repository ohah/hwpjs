import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutCreatedTableInlinePages } from '../../web/preview/created-table-inline-page-layout.mjs';
import { pageParagraphCoverage } from '../../web/preview/page-paragraph-coverage.mjs';
import { rowAtPoint } from '../../web/preview/row-geometry.mjs';
import { layoutPageContent } from '../../web/preview/page-content-layout.mjs';
const measure = (text) => ({ width: [...text].length * 8, height: 16 });
const setting = {
  section_ordinal: 0,
  width: 21600,
  height: 7200,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const table = (identity, anchorUnit) => ({
  section: 0,
  hostParagraph: 1,
  identity,
  anchorUnit,
  rows: 1,
  columns: 1,
  resources: { character: 1 },
  cells: [{ row: 0, column: 0, width: 7200, height: 3600, text: `셀${identity}😀` }],
});
function content() {
  const paragraphs = ['앞', 'A😀B', '뒤'].map((text, paragraph) => ({
    section: 0,
    paragraph,
    text,
    editable: true,
  }));
  return {
    format: 'hwpx',
    paragraphs,
    pageSettings: [setting],
    paragraphFlows: paragraphs.map((p) => ({
      section: 0,
      paragraph: p.paragraph,
      top_level: true,
      single_column: true,
      host: 'body',
      page_break: false,
      column_break: false,
    })),
    createdTables: [table('1', 1), table('2', 3)],
  };
}

test('generated inline tables share one host line reservation and preserve source and cell ownership', () => {
  const input = content(),
    before = structuredClone(input);
  const result = layoutCreatedTableInlinePages(input, measure);
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.pages.length, 2);
  assert.equal(result.createdTablesPaginated, true);
  assert.equal(result.boxes.length, 2);
  assert.equal(result.boxes[0].y, result.boxes[1].y);
  assert.equal(result.boxes[0].pageOrdinal, 0);
  assert.equal(result.rows.find((row) => row.paragraph === 2).pageOrdinal, 1);
  const sourceRows = result.rows.filter((row) => !row.createdCell);
  assert.equal(pageParagraphCoverage(input.paragraphs, sourceRows).state, 'complete');
  for (const box of result.boxes) {
    const hit = result.rows[rowAtPoint(result, box.x + 2, box.y + 2)];
    assert.equal(hit.createdCell.identity, box.createdCell.identity);
    assert.equal(hit.paragraph, undefined);
  }
  assert.deepEqual(input, before);
});

test('number prefix is projected once with page clipping without becoming selectable text', () => {
  const input = content();
  input.paragraphs[1].automaticNumberPrefixes = [
    {
      source: {
        values: { type_known: true, num: 7 },
        format: { type_known: true, supscript: false, raw: ['DIGIT', '', '', '.'] },
      },
    },
  ];
  const before = structuredClone(input);
  const result = layoutCreatedTableInlinePages(input, measure);
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.hostNumberPrefixes.length, 1);
  const prefix = result.hostNumberPrefixes[0];
  assert.equal(prefix.numberPrefix.text, '7.');
  assert.equal(prefix.pageOrdinal, 0);
  assert.deepEqual(prefix.pageClip, prefix.referenceBoxes.column);
  assert(
    result.rows.filter((row) => row.paragraph === 1).every((row) => row.numberPrefix === undefined),
  );
  assert.equal(
    pageParagraphCoverage(
      input.paragraphs,
      result.rows.filter((row) => !row.createdCell),
    ).state,
    'complete',
  );
  assert.deepEqual(input, before);
});

test('generated inline pagination retains paragraph spacing and refuses unsupported combinations', () => {
  const input = content();
  input.paragraphs[1].paragraphShape = { before: 600, after: 600 };
  const result = layoutCreatedTableInlinePages(input, measure);
  assert.equal(result.state, 'paginated', result.error);
  assert(result.rows.every((row) => Number.isFinite(row.x) && Number.isFinite(row.y)));
  for (const changed of [
    { ...input, format: 'hwp5' },
    { ...input, window: {} },
    { ...input, limited: true },
    { ...input, pictures: [{}] },
  ]) {
    assert.equal(layoutCreatedTableInlinePages(changed, measure).state, 'unavailable');
  }
  assert.equal(layoutCreatedTableInlinePages(input, measure, 3).state, 'unavailable');
  const missing = content();
  missing.createdTables[0].hostParagraph = 99;
  assert.equal(
    layoutCreatedTableInlinePages(missing, measure).error,
    'MissingCreatedTablePageHost',
  );
  const huge = content();
  huge.createdTables[0].cells[0].height = 14400;
  assert.equal(layoutCreatedTableInlinePages(huge, measure).state, 'unavailable');
  const columns = content();
  columns.paragraphFlows[0].column_declaration = { count: 2 };
  assert.equal(
    layoutCreatedTableInlinePages(columns, measure).error,
    'UnsupportedCreatedTablePageObjects',
  );
  const numbered = content();
  numbered.paragraphs[1].automaticNumberPrefixes = [{}];
  assert.equal(
    layoutCreatedTableInlinePages(numbered, measure).error,
    'UnsupportedCreatedTableHostNumberPrefix',
  );
  assert.equal(
    layoutPageContent(content(), measure, 20000, { pageNumbers: [1] }).error,
    'UnsupportedCreatedTablePageNumbers',
  );
  for (const key of ['page_controls', 'section_starts']) {
    const controls = content();
    controls.hwp5PageNumberSource = { [key]: [{}] };
    assert.equal(
      layoutCreatedTableInlinePages(controls, measure).error,
      'UnsupportedCreatedTablePageControls',
    );
  }
});
