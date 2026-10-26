import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDrawingWrapBody } from '../../web/preview/drawing-wrap-body-flow.mjs';
import { paginateBodyRows } from '../../web/preview/page-row-flow.mjs';
import { drawingPageReference } from '../../web/preview/drawing-page-reference.mjs';
import { projectFloatingDrawing } from '../../web/preview/drawing-page-projection.mjs';

function fixture() {
  const setting = {
    width: 15000,
    height: 22500,
    orientation: 'widely',
    gutter_type: 'left_only',
    duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
  };
  const paragraphs = [
    { section: 0, paragraph: 0, text: '\ufffc' },
    { section: 0, paragraph: 1, text: '본문😀' },
  ];
  const flows = paragraphs.map((p) => ({
    section: 0,
    paragraph: p.paragraph,
    top_level: true,
    single_column: true,
    page_break: false,
    column_break: false,
  }));
  const rows = paragraphs.map((p) => ({
    ...p,
    kind: 'text',
    startUnit: 0,
    endUnit: p.text.length,
    width: 200,
    height: 20,
    textHeight: 20,
    textTop: 0,
  }));
  const drawings = [
    {
      section: 0,
      drawingNode: 8,
      hostParagraph: 0,
      anchorUnit: 0,
      source: {
        geometry: {
          width: 1500,
          height: 1500,
          width_relative: 4,
          height_relative: 2,
          treat_as_character: false,
          horizontal_offset: 7500,
          vertical_offset: 0,
        },
        position: { relations: [2, 3, 0, 0] },
        flow: { text_wrap: 1, text_flow: 0, outside_margins: [0, 0, 0, 0] },
        text: null,
        caption: null,
      },
    },
  ];
  return { setting, paragraphs, flows, rows, drawings };
}

test('drawing top-bottom flow excludes the full line without moving the source anchor', () => {
  const f = fixture(),
    before = structuredClone(f);
  const result = layoutDrawingWrapBody(f.drawings, f.paragraphs, (options) =>
    paginateBodyRows(f.rows, f.setting, f.flows, options),
  );
  assert.equal(result.state, 'paginated', result.error);
  assert.equal(result.drawingWrapIterations, 1);
  assert.deepEqual(
    result.rows.map((row) => row.y),
    [40, 60],
  );
  assert.equal(result.drawingWrapReservations[0].rectangle.y, 20);
  assert.equal(result.rows[0].flowAnchorY, 20);
  assert.equal(
    drawingPageReference(f.drawings[0], f.paragraphs, result.rows).boxes.paragraph.y,
    20,
  );
  const projected = projectFloatingDrawing(f.drawings[0], f.paragraphs, {}, result.rows, () => 8);
  assert.equal(projected.state, 'placed', projected.error);
  assert.deepEqual(projected.rectangle, result.drawingWrapReservations[0].rectangle);
  assert.deepEqual(
    result.rows.map((row) => row.text),
    f.paragraphs.map((p) => p.text),
  );
  assert.deepEqual(f, before);
});

test('drawing wrapping bounds a changing anchor and rejects nonfinite pre-flow coordinates', () => {
  const f = fixture();
  let call = 0;
  const changing = layoutDrawingWrapBody(
    f.drawings,
    f.paragraphs,
    (options) => {
      const page = paginateBodyRows(f.rows, f.setting, f.flows, options);
      return { ...page, rows: page.rows.map((row) => ({ ...row, pageOrdinal: call++ })) };
    },
    { maxIterations: 1 },
  );
  assert.equal(changing.error, 'DrawingWrapConvergenceLimit');
  assert.equal(changing.drawingWrapIterations, 1);
  const body = paginateBodyRows(f.rows, f.setting, f.flows);
  body.rows[0].flowAnchorY = NaN;
  assert.equal(drawingPageReference(f.drawings[0], f.paragraphs, body.rows).state, 'unavailable');
});

test('drawing wrap keeps bounded failure, margins, and layout refusal instead of overlap fallback', () => {
  const f = fixture();
  const run = (options) =>
    layoutDrawingWrapBody(
      f.drawings,
      f.paragraphs,
      (options) => paginateBodyRows(f.rows, f.setting, f.flows, options),
      options,
    );
  assert.equal(run({ maxIterations: 0 }).error, 'InvalidDrawingWrapBudget');
  f.drawings[0].source.flow.outside_margins = [0, 0, 0, 750];
  assert.equal(run().rows[0].y, 50);
  f.drawings[0].source.flow.outside_margins = null;
  assert.equal(run().error, 'missing_margins');
  assert.equal(
    layoutDrawingWrapBody(f.drawings, f.paragraphs, () => ({
      state: 'unavailable',
      error: 'ExistingBodyFailure',
    })).error,
    'ExistingBodyFailure',
  );
});

test('drawing wrap refuses ignored row reservations and later table intersections', () => {
  const f = fixture();
  const ignored = layoutDrawingWrapBody(f.drawings, f.paragraphs, () =>
    paginateBodyRows(f.rows, f.setting, f.flows),
  );
  assert.equal(ignored.error, 'IncompleteDrawingWrapFlow');
  const table = layoutDrawingWrapBody(f.drawings, f.paragraphs, (options) => ({
    ...paginateBodyRows(f.rows, f.setting, f.flows, options),
    tableCollisionFootprints: [
      { section: 0, pageOrdinal: 0, rectangle: { x: 20, y: 20, width: 200, height: 20 } },
    ],
  }));
  assert.equal(table.error, 'IncompleteDrawingWrapFlow');
});

test('drawing wrap validates widthless paragraph gaps against the full placed column', () => {
  const f = fixture();
  f.rows.push({ section: 0, paragraph: 1, kind: 'gap', text: '', height: 12 });
  const run = (mutate) =>
    layoutDrawingWrapBody(f.drawings, f.paragraphs, (options) => {
      const body = paginateBodyRows(f.rows, f.setting, f.flows, options);
      return mutate ? mutate(body) : body;
    });
  const placed = run();
  assert.equal(placed.state, 'paginated', placed.error);
  assert.equal(placed.rows.at(-1).width, undefined);
  assert.equal(placed.rows.at(-1).referenceBoxes.column.width, 200);
  const overlap = run((body) => ({
    ...body,
    rows: body.rows.map((row) => (row.kind === 'gap' ? { ...row, y: 20 } : row)),
  }));
  assert.equal(overlap.error, 'IncompleteDrawingWrapFlow');
  const missing = run((body) => ({
    ...body,
    rows: body.rows.map((row) =>
      row.kind === 'gap' ? { ...row, referenceBoxes: undefined } : row,
    ),
  }));
  assert.equal(missing.error, 'IncompleteDrawingWrapFlow');
});
