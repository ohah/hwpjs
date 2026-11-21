import test from 'node:test';
import assert from 'node:assert/strict';
import { pictureLineRegions } from '../../../web/preview/picture-line-regions.mjs';
import { resolveDrawingWrapReservations } from '../../../web/preview/drawing-wrap-reservations.mjs';
import { paginateBodyRows } from '../../../web/preview/page-row-flow.mjs';
test('asymmetric source margins change actual SQUARE line exclusion without moving the object', () => {
  const line = { x: 0, y: 0, width: 300, height: 10 };
  const rectangle = { x: 100, y: 0, width: 20, height: 20 };
  const flow = { textWrap: 0, textFlow: 0, outsideMargins: [0, 0, 0, 0] };
  assert.deepEqual(pictureLineRegions(line, rectangle, flow).regions, [
    { x: 0, width: 100 },
    { x: 120, width: 180 },
  ]);
  assert.deepEqual(
    pictureLineRegions(line, rectangle, { ...flow, outsideMargins: [750, 2250, 0, 0] }).regions,
    [
      { x: 0, width: 90 },
      { x: 150, width: 150 },
    ],
  );
  assert.deepEqual(rectangle, { x: 100, y: 0, width: 20, height: 20 });
  assert.equal(
    pictureLineRegions(line, rectangle, { ...flow, outsideMargins: null }).state,
    'missing_margins',
  );
});
test('drawing reservation carries the new outside_margins through the existing placement SSOT', () => {
  const paragraphs = [
    { section: 0, paragraph: 0, text: '\ufffc' },
    { section: 0, paragraph: 1, text: 'ADJACENT LONG BODY '.repeat(20) },
  ];
  const setting = {
    width: 15000,
    height: 22500,
    orientation: 'widely',
    gutter_type: 'left_only',
    duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
  };
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
  const body = paginateBodyRows(rows, setting, flows);
  const drawing = {
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
      flow: { text_wrap: 0, text_flow: 0, outside_margins: [0, 0, 0, 0] },
      text: null,
      caption: null,
    },
  };
  const before = resolveDrawingWrapReservations([drawing], paragraphs, body, {});
  drawing.source.flow.outside_margins = [750, 2250, 0, 0];
  const after = resolveDrawingWrapReservations([drawing], paragraphs, body, {});
  assert.equal(before.state, 'reserved');
  assert.equal(after.state, 'reserved');
  assert.deepEqual(after.reservations[0].rectangle, before.reservations[0].rectangle);
  assert.deepEqual(after.reservations[0].flow, {
    textWrap: 0,
    textFlow: 0,
    outsideMargins: [750, 2250, 0, 0],
  });
  const box = after.reservations[0].rectangle;
  const line = { x: 0, y: box.y, width: 300, height: 10 };
  const regions = pictureLineRegions(line, box, after.reservations[0].flow).regions;
  assert.deepEqual(regions, [
    { x: 0, width: box.x - 10 },
    { x: box.x + box.width + 30, width: 300 - box.x - box.width - 30 },
  ]);
  assert.equal(paragraphs[1].text, 'ADJACENT LONG BODY '.repeat(20));
});
