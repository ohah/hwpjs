import assert from 'node:assert/strict';
import test from 'node:test';
import { getScenePageText } from '../../web/preview/page-text-scene.mjs';

const paragraph = (id, text, fields) => ({
  section: 0,
  paragraph: id,
  text,
  selectionOwner: 'section:0:body',
  ...fields,
});
const paper = (y) => ({ x: 0, y, width: 220, height: 100 });
const page = (ordinal, number = 1) => ({
  ordinal,
  section: 0,
  number,
  paper: paper(ordinal * 120),
});
const row = (owner, start, end, fields) => {
  const text = owner.text.slice(start, end);
  let unit = start;
  const boundaries = [{ unit, x: 0 }];
  for (const [i, character] of [...text].entries()) {
    unit += character.length;
    boundaries.push({ unit, x: (i + 1) * 10 });
  }
  return {
    kind: 'text',
    section: 0,
    paragraph: owner.paragraph,
    text,
    startUnit: start,
    endUnit: end,
    pageOrdinal: 0,
    zoneOrdinal: 0,
    columnOrdinal: 0,
    x: 10,
    y: 10,
    textTop: 0,
    textHeight: 10,
    boundaries,
    ...fields,
  };
};
const content = (paragraphs) => ({ format: 'hwpx', paragraphs });
const scene = (rows, fields) => ({ state: 'paginated', pages: [page(0)], rows, ...fields });
const include = (...kinds) => ({ include: kinds });

test('uses zero-based physical pages even when the printed page number restarts', () => {
  const p = paragraph(0, 'FIRSTSECOND');
  const document = content([p]);
  const layout = scene([row(p, 0, 5), row(p, 5, 11, { pageOrdinal: 1, y: 130 })], {
    pages: [page(0), page(1), page(2, 2)],
  });
  const results = [0, 1, 2].map((n) => getScenePageText(document, layout, n));
  assert.deepEqual(
    results.map(({ pageIndex, pageCount, coverage, text }) => [
      pageIndex,
      pageCount,
      coverage,
      text,
    ]),
    [
      [0, 3, 'complete', 'FIRST'],
      [1, 3, 'complete', 'SECOND'],
      [2, 3, 'complete', ''],
    ],
  );
  assert(Object.isFrozen(results[0]));
  assert(Object.isFrozen(results[0].issues));
  assert.equal(getScenePageText(document, layout, 3).reason, 'page-out-of-range');
  assert.equal(getScenePageText(document, layout, -1).reason, 'invalid-page-index');
  assert.equal(getScenePageText(document, layout, 0.5).reason, 'invalid-page-index');
});

test('joins soft wraps in column order and keeps body ahead of a right-column textbox', () => {
  const p = paragraph(0, 'LEFTLOWER');
  const right = paragraph(1, 'RIGHTONE');
  const box = paragraph(2, 'BOXFIRSTBOXSECOND', { drawingText: { drawingNode: 17 } });
  const leftRef = { x: 5, y: 5, width: 85, height: 90 };
  const rightRef = { ...leftRef, x: 105 };
  const document = content([p, right, box]);
  const layout = scene(
    [
      row(p, 0, 4, { referenceBoxes: { column: leftRef } }),
      row(right, 0, 8, { columnOrdinal: 1, x: 106, referenceBoxes: { column: rightRef } }),
      row(box, 8, 17, {
        drawingNode: 17,
        zoneOrdinal: undefined,
        columnOrdinal: 1,
        x: 125,
        y: 25,
        referenceBoxes: { column: rightRef },
      }),
      row(box, 0, 8, {
        drawingNode: 17,
        zoneOrdinal: undefined,
        columnOrdinal: 0,
        x: 106,
        y: 40,
        referenceBoxes: { column: rightRef },
      }),
      row(p, 4, 9, { y: 80, referenceBoxes: { column: leftRef } }),
    ],
    {
      placedDrawings: [
        {
          pageOrdinal: 0,
          section: 0,
          drawingNode: 17,
          rectangle: { x: 106, y: 24, width: 85, height: 65 },
        },
      ],
    },
  );
  const all = getScenePageText(document, layout, 0);
  assert.equal(all.text, 'LEFTLOWER\nRIGHTONE\nBOXFIRSTBOXSECOND');
  assert.equal(all.coverage, 'complete');
  assert.equal(getScenePageText(document, layout, 0, include('textbox')).text, 'BOXFIRSTBOXSECOND');
});

test('groups wrapped cell lines, emits a split range once and excludes repeated header instances', () => {
  const header = paragraph(0, 'HEAD', { cell: {} });
  const first = paragraph(1, 'TOPBOTTOMTAIL', { cell: {} });
  const second = paragraph(2, 'NEXT', { cell: {} });
  const caption = paragraph(3, 'CAPTION', { tableCaption: {} });
  const firstCell = { tableNode: 10, listNode: 11 };
  const secondCell = { tableNode: 10, listNode: 12 };
  const continuation = { pageOrdinal: 1, y: 155, ...firstCell };
  const repeated = row(header, 0, 4, {
    pageOrdinal: 1,
    y: 130,
    repeatedTableHeader: true,
    ...firstCell,
  });
  const boxes = [
    { pageOrdinal: 0, section: 0, ...firstCell, x: 5, y: 5, width: 100, height: 65 },
    { pageOrdinal: 0, section: 0, ...secondCell, x: 105, y: 30, width: 85, height: 40 },
    { pageOrdinal: 1, section: 0, ...firstCell, x: 5, y: 150, width: 100, height: 40 },
  ];
  const layout = scene(
    [
      row(header, 0, 4, firstCell),
      row(first, 0, 3, { ...firstCell, y: 30 }),
      row(second, 0, 4, { ...secondCell, x: 110, y: 30 }),
      row(first, 3, 9, { ...firstCell, y: 45 }),
      row(first, 3, 9, { ...firstCell, y: 45 }),
      repeated,
      row(first, 0, 3, continuation),
      row(first, 9, 13, { ...continuation, y: 167 }),
      row(caption, 0, 7, { y: 75, tableNode: 10 }),
    ],
    { pages: [page(0), page(1)], boxes, repeatedTableHeaderRows: [repeated] },
  );
  const document = content([header, first, second, caption]);
  const read = (n, ...kinds) => getScenePageText(document, layout, n, include(...kinds));
  assert.equal(read(0, 'table').text, 'HEAD\nTOPBOTTOM\nNEXT');
  assert.equal(read(0, 'caption').text, 'CAPTION');
  assert.equal(read(1, 'table').text, 'TAIL');
  assert.equal(read(1, 'table').coverage, 'complete');
});

test('returns only whole visible clusters and reports kind-specific clipping', () => {
  const p = paragraph(0, 'A😀C');
  const caption = paragraph(1, 'CAP', { drawingCaption: {} });
  const document = content([p, caption]);
  const layout = scene([
    row(p, 0, 4, { pageClip: { x: 10, y: 10, width: 25, height: 10 } }),
    row(caption, 0, 3, { y: 40 }),
  ]);
  const result = getScenePageText(document, layout, 0, include('body'));
  assert.equal(result.text, 'A😀');
  assert.equal(result.coverage, 'partial');
  assert.deepEqual(result.issues, [{ code: 'clipped-text', kind: 'body' }]);
  const captions = getScenePageText(document, layout, 0, include('caption'));
  assert.equal(captions.text, 'CAP');
  assert.equal(captions.coverage, 'complete');
  const outsidePaper = scene([row(p, 0, 4, { x: 199 })]);
  assert.equal(getScenePageText(content([p]), outsidePaper, 0).text, 'A😀');
});

test('withholds malformed UTF-16 rows and classifies missing source coverage', () => {
  const p = paragraph(0, 'A😀C');
  const layout = scene(
    [
      row(p, 0, 4, {
        boundaries: [
          { unit: 0, x: 0 },
          { unit: 2, x: 10 },
          { unit: 4, x: 30 },
        ],
      }),
    ],
    {
      sourceCoverage: 'incomplete',
    },
  );
  const result = getScenePageText(content([p]), layout, 0);
  assert.equal(result.text, '');
  assert.equal(result.coverage, 'partial');
  assert.deepEqual(result.issues, [
    { code: 'incomplete-source-coverage' },
    { code: 'unknown-text-geometry', kind: 'body' },
  ]);
  const missing = getScenePageText(content([p]), scene([]), 0);
  assert.deepEqual(missing.issues, [{ code: 'unplaced-text', kind: 'body' }]);
});

test('distinguishes unknown and incomplete scenes from a verified empty result', () => {
  const document = content([paragraph(0, '')]);
  assert.equal(getScenePageText(undefined, scene([]), 0).reason, 'unknown-scene');
  assert.equal(
    getScenePageText(document, scene([], { state: 'fallback' }), 0).reason,
    'unknown-scene',
  );
  assert.equal(
    getScenePageText({ ...document, window: {} }, scene([]), 0).reason,
    'incomplete-scene',
  );
  assert.equal(
    getScenePageText(document, scene([], { pages: [page(1)] }), 0).reason,
    'unknown-physical-page-identity',
  );
  const sparseRows = [];
  sparseRows.length = 20001;
  assert.equal(getScenePageText(document, scene(sparseRows), 0).reason, 'scene-budget-exceeded');
  assert.equal(getScenePageText(document, scene([]), 0, include('shape')).reason, 'invalid-filter');
  const sparseFilter = [];
  sparseFilter.length = 1;
  assert.equal(
    getScenePageText(document, scene([]), 0, { include: sparseFilter }).reason,
    'invalid-filter',
  );
  assert.equal(getScenePageText(document, scene([]), 0, include()).coverage, 'complete');
});
