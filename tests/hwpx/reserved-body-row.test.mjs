import test from 'node:test';
import assert from 'node:assert/strict';
import { bodyRowSources } from '../../web/preview/body-row-sources.mjs';
import { measureReservedBodyRow } from '../../web/preview/reserved-body-row.mjs';
import { paginateBodyRows } from '../../web/preview/page-row-flow.mjs';
import { pageParagraphCoverage } from '../../web/preview/page-paragraph-coverage.mjs';

const setting = {
  width: 15000,
  height: 15000,
  orientation: 'widely',
  gutter_type: 'left_only',
  duplicate_margins: 0,
  margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
};
const p = (paragraph, text) => ({ section: 0, paragraph, text, editable: true });
const text = (paragraph, startUnit, endUnit, value) => ({
  kind: 'text',
  section: 0,
  paragraph,
  startUnit,
  endUnit,
  text: value,
  height: 28,
});
const flow = (paragraph) => ({
  section: 0,
  paragraph,
  top_level: true,
  single_column: true,
  page_break: false,
  column_break: false,
});

test('reserved body measurement refuses artificial insertion rows and broken source boundaries', () => {
  const owner = p(0, 'a😀b'),
    context = { y: 20, pageOrdinal: 0, column: { x: 20, width: 160 } };
  for (const [startUnit, endUnit] of [
    [1, 1],
    [4, 4],
    [0, 2],
    [2, 4],
    [-1, 4],
    [0, 5],
  ]) {
    const source = { ...text(0, startUnit, endUnit, ''), paragraphSource: owner };
    let calls = 0;
    const result = measureReservedBodyRow(source, context, [], () => {
      calls++;
      return 8;
    });
    assert.equal(result.state, 'unavailable');
    assert.equal(calls, 0);
  }
});

test('body sources merge measured text but preserve table bands gaps and column declarations', () => {
  const owner = p(0, 'a😀b'),
    declaration = { count: 1 };
  const table = {
    kind: 'gap',
    section: 0,
    paragraph: 0,
    tableIndex: 0,
    bandOrdinal: 0,
    height: 40,
  };
  const gap = { kind: 'gap', section: 0, paragraph: 0, height: 10 };
  const rows = [
    text(0, 0, 1, 'a'),
    text(0, 1, 3, '😀'),
    table,
    gap,
    { ...text(0, 3, 4, 'b'), columnDeclaration: declaration },
  ];
  const before = structuredClone({ owner, rows });
  const result = bodyRowSources(rows, [owner]);
  assert.equal(result.state, 'prepared', result.error);
  assert.equal(result.rows.length, 4);
  assert.deepEqual(
    [result.rows[0].startUnit, result.rows[0].endUnit, result.rows[0].text],
    [0, 3, 'a😀'],
  );
  assert.equal(result.rows[1], table);
  assert.equal(result.rows[2], gap);
  assert.equal(result.rows[3].columnDeclaration, declaration);
  assert.equal(result.rows[0].paragraphSource, owner);
  assert.deepEqual({ owner, rows }, before);
});

test('body source ranges reject overlap wrong text broken graphemes and placed rows', () => {
  const owner = p(0, 'a😀b');
  for (const rows of [
    [text(0, 0, 2, 'a\ud83d')],
    [text(0, 0, 1, 'wrong')],
    [text(0, 0, 3, 'a😀'), text(0, 1, 4, '😀b')],
    [{ ...text(0, 0, 4, owner.text), pageOrdinal: 0 }],
  ])
    assert.equal(bodyRowSources(rows, [owner]).state, 'unavailable');
  assert.equal(bodyRowSources([], [owner, owner]).error, 'AmbiguousBodyRowOwner');
  assert.equal(
    bodyRowSources([text(0, 0, 4, owner.text)], [{ ...owner, tableCell: {} }]).error,
    'UnsupportedBodyRowOwner',
  );
});

test('terminal measured row folds into its source while pagination recreates exactly one insertion row', () => {
  const owner = p(0, 'a\n'),
    rows = [text(0, 0, 2, owner.text), text(0, 2, 2, '')];
  const source = bodyRowSources(rows, [owner]);
  assert.equal(source.state, 'prepared');
  assert.equal(source.rows.length, 1);
  const result = paginateBodyRows(source.rows, setting, [flow(0)], {
    measurePositionedRow(item, _row, context) {
      const measured = measureReservedBodyRow(item, context, [], () => 8);
      assert.equal(measured.state, 'measured', measured.error);
      return measured.row;
    },
  });
  assert.equal(result.state, 'paginated', result.error);
  assert.deepEqual(
    result.rows.map((row) => row.text),
    ['a\n', ''],
  );
  assert.equal(pageParagraphCoverage([owner], result.rows).state, 'complete');
  assert.equal(bodyRowSources([...rows, rows[1]], [owner]).state, 'unavailable');
});

test('reserved body measurement uses both sides of a frame without fragmenting a preceding table band', () => {
  const owners = [p(0, '\ufffc'), p(1, 'a'.repeat(60))];
  const band = { kind: 'gap', section: 0, paragraph: 0, tableIndex: 0, bandOrdinal: 0, height: 40 };
  const input = [band, text(1, 0, 30, 'a'.repeat(30)), text(1, 30, 60, 'a'.repeat(30))];
  const source = bodyRowSources(input, owners),
    before = structuredClone({ input, owners });
  assert.equal(source.state, 'prepared');
  const reservations = [
    {
      pageOrdinal: 0,
      rectangle: { x: 70, y: 60, width: 30, height: 68 },
      flow: { textWrap: 0, textFlow: 0, outsideMargins: [0, 0, 0, 0] },
    },
  ];
  const measured = (item, context) => measureReservedBodyRow(item, context, reservations, () => 8);
  const result = paginateBodyRows(
    source.rows,
    setting,
    owners.map((owner) => flow(owner.paragraph)),
    {
      rowY(row, context) {
        if (!row.paragraphSource) return context.y;
        const value = measured(row, context);
        assert.equal(value.state, 'measured', value.error);
        return value.y;
      },
      measurePositionedRow(item, row, context) {
        if (!item.paragraphSource) return row;
        const value = measured(item, context);
        assert.equal(value.state, 'measured', value.error);
        return value.row;
      },
    },
  );
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.rows[0].tableIndex, 0);
  assert.equal(result.rows[0].y, 20);
  const body = result.rows.filter((row) => row.paragraph === 1);
  assert.deepEqual(
    body.filter((row) => row.y === 60).map((row) => row.paragraphX),
    [0, 80],
  );
  assert.equal(body.map((row) => row.text).join(''), owners[1].text);
  assert.equal(pageParagraphCoverage([owners[1]], body).state, 'complete');
  assert.deepEqual({ input, owners }, before);
});
