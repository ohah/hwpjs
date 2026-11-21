import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutDrawingWrapBody } from '../../web/preview/drawing-wrap-body-flow.mjs';
import { paginateBodyRows } from '../../web/preview/page-row-flow.mjs';
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

function run(values, input) {
  const f = input ?? fixture();
  f.drawings[0].source.geometry.vertical_offset = 1500;
  f.drawings[0].source.flow.outside_margins = [...values];
  const before = structuredClone(f);
  let calls = 0;
  const body = layoutDrawingWrapBody(f.drawings, f.paragraphs, (options) => {
    calls++;
    return paginateBodyRows(f.rows, f.setting, f.flows, options);
  });
  assert.equal(body.state, 'paginated', body.error);
  assert.deepEqual(f, before);
  return {
    rows: body.rows.map((r) => r.y),
    rectangle: body.drawingWrapReservations[0].rectangle,
    calls,
    iterations: body.drawingWrapIterations,
    sourceUnchanged: true,
  };
}
test('observed raw1 top bottom synthetic full reflow preserves anchor and source', () => {
  const baseline = run([0, 0, 0, 0]);
  const top = run([0, 0, 750, 0]);
  const bottom = run([0, 0, 0, 750]);
  const both = run([0, 0, 750, 750]);
  const horizontalControl = run([750, 1500, 0, 0]);
  const nativePreparedVector = run([0, 0, 750, 1500]);
  const retained = fixture();
  const old = run([0, 0, 0, 0], retained);
  const after = run([0, 0, 750, 750], retained);
  const fresh = run([0, 0, 750, 750]);
  const undo = run([0, 0, 0, 0], retained);
  const redo = run([0, 0, 750, 750], retained);
  assert.deepEqual(baseline.rows, [20, 60]);
  assert.deepEqual(top.rows, [60, 80]);
  assert.deepEqual(bottom.rows, [20, 70]);
  assert.deepEqual(both.rows, [70, 90]);
  assert.deepEqual(horizontalControl.rows, baseline.rows);
  assert.deepEqual(nativePreparedVector.rows, [80, 100]);
  assert.deepEqual(after, fresh);
  assert.deepEqual(undo, old);
  assert.deepEqual(redo, after);
});
