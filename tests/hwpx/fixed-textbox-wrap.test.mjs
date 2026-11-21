import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutHwp5PageContent } from '../../web/preview/hwp5-page-layout.mjs';
import { previewDrawingOutlineLayers } from '../../web/preview/drawing-outline-layers.mjs';
import { paintDrawingOutline } from '../../web/preview/drawing-outline-paint.mjs';
import { objectActivationTarget } from '../../web/preview/object-activation-target.mjs';
import { drawingWrapPagePolicyError } from '../../web/preview/drawing-wrap-page-policy.mjs';
import { isFixedNoOverlapTextboxWrap } from '../../web/preview/fixed-textbox-wrap-policy.mjs';
import { restrictDrawingLayout } from '../../web/preview/drawing-restricted-layout.mjs';
import { resolveDrawingWrapReservations } from '../../web/preview/drawing-wrap-reservations.mjs';
import { paginateBodyRows } from '../../web/preview/page-row-flow.mjs';
const content = () =>
  JSON.parse(
    readFileSync(new URL('../fixtures/own-fixed-textbox/actual854-content.json', import.meta.url)),
  );
const measure = (text) => ({ width: text.length * 7, height: 16 });
const layout = (c) => layoutHwp5PageContent(c, measure);

test('actual854 fixed textbox retains native no-overlap flags through wrap, outline paint and activation target', () => {
  const c = content(),
    before = structuredClone(c),
    page = layout(c);
  assert.equal(page.state, 'paginated', JSON.stringify(page));
  assert.equal(page.pageLayoutMode, 'measured-drawing-body');
  assert.equal(page.placedDrawings.length, 1);
  const placed = page.placedDrawings[0];
  assert.equal(placed.drawingNode, 12);
  assert.deepEqual(placed.rectangle, page.drawingWrapReservations[0].rectangle);
  const outlines = previewDrawingOutlineLayers(c, page);
  assert.deepEqual(outlines.unavailable, []);
  assert.equal(outlines.front.length, 1);
  assert.deepEqual(outlines.front[0].origin, placed.rectangle);
  let strokes = 0,
    saves = 0,
    restores = 0;
  const ctx = {
    save() {
      saves++;
    },
    restore() {
      restores++;
    },
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {
      strokes++;
    },
  };
  assert.equal(
    paintDrawingOutline(ctx, outlines.front[0].drawing.source, outlines.front[0].origin),
    true,
  );
  assert.equal(strokes, 1);
  assert.equal(saves, restores);
  assert.deepEqual(
    objectActivationTarget(
      { content: c, layout: page, charts: [], outlines },
      placed.rectangle.x + 1,
      placed.rectangle.y + 1,
    ),
    { kind: 'drawing', section: 0, drawingNode: 12 },
  );
  assert.deepEqual(c, before);
  assert.deepEqual(c.drawings[0].source.position.flags, [false, false, false, null]);
});

test('fixed square outline never falls back to nominal placement without resolved wrap proof', () => {
  const c = content(),
    page = layout(c);
  for (const changed of [
    { ...page, placedDrawings: [] },
    { ...page, drawingWrapReservations: [] },
    { ...page, state: 'unavailable' },
    { ...page, pageLayoutMode: 'fallback' },
    {
      ...page,
      drawingWrapReservations: page.drawingWrapReservations.map((x) => ({
        ...x,
        rectangle: { ...x.rectangle, x: x.rectangle.x + 1 },
      })),
    },
  ]) {
    const layers = previewDrawingOutlineLayers(c, changed);
    assert.equal(layers.front.length, 0);
    assert(layers.unavailable.length);
  }
});

test('fixed no-overlap admission requires explicit square direct textbox geometry and restriction-enabled caller', () => {
  const source = content().drawings[0].source;
  assert.equal(isFixedNoOverlapTextboxWrap(source), true);
  assert.equal(
    drawingWrapPagePolicyError(source, source, false),
    'UnsupportedDrawingOverlapPolicy',
  );
  assert.equal(drawingWrapPagePolicyError(source, source, false, true), null);
  const mutations = [
    (s) => (s.caption = {}),
    (s) => (s.group_context = {}),
    (s) => delete s.group_context,
    (s) => (s.text = null),
    (s) => (s.geometry.treat_as_character = true),
    (s) => (s.geometry.width_relative = 0),
    (s) => (s.position.flags[2] = undefined),
    (s) => (s.position.flags[1] = undefined),
    (s) => (s.position.relations[0] = 0),
    (s) => (s.position.relations[3] = 1),
    (s) => delete s.position.relations[0],
    (s) => Object.assign(s.flow, { text_wrap: 1, text_flow: 1 }),
    (s) => (s.flow.text_wrap = 2),
    (s) => (s.flow.text_flow = 4),
    (s) => (s.rendering.matrix[1] = 1),
    (s) => (s.rendering_corners[0][0] = 1),
  ];
  for (const mutate of mutations) {
    const x = structuredClone(source);
    mutate(x);
    assert.equal(isFixedNoOverlapTextboxWrap(x), false);
  }
  assert.equal(
    drawingWrapPagePolicyError(source, source, true, true),
    'UnsupportedDrawingPageWrap',
  );
});

function restrictionFixture() {
  const c = content(),
    page = layout(c),
    d = c.drawings[0],
    r = page.placedDrawings[0];
  return {
    d,
    prepared: { state: 'placed', rectangle: r.rectangle, pageOrdinal: 0, rows: [] },
    body: page.pages[0].page,
    inventory: {
      state: 'collected',
      footprints: [
        { kind: 'drawing', section: 0, node: 12, pageOrdinal: 0, rectangle: { ...r.rectangle } },
      ],
    },
  };
}
test('qualified fixed placement rejects collisions instead of silently moving and preserves input', () => {
  const f = restrictionFixture(),
    before = structuredClone(f);
  assert.equal(restrictDrawingLayout(f.d, f.prepared, f.inventory, f.body).state, 'placed');
  f.inventory.footprints.push({
    kind: 'table',
    section: 0,
    node: 99,
    pageOrdinal: 0,
    rectangle: { ...f.prepared.rectangle },
  });
  assert.equal(
    restrictDrawingLayout(f.d, f.prepared, f.inventory, f.body).error,
    'UnsupportedFixedDrawingCollision',
  );
  f.inventory.footprints.pop();
  assert.deepEqual(f, before);
});
test('qualified fixed placement rejects clipping including margin footprint and text overflow', () => {
  const f = restrictionFixture();
  for (const box of [
    { ...f.body, x: f.prepared.rectangle.x + 1 },
    { ...f.body, y: f.prepared.rectangle.y + 1 },
    { ...f.body, width: 1 },
    { ...f.body, height: 1 },
  ])
    assert.equal(
      restrictDrawingLayout(f.d, f.prepared, f.inventory, box).error,
      'UnsupportedFixedDrawingClipping',
    );
  assert.equal(
    restrictDrawingLayout(f.d, { ...f.prepared, overflowed: true }, f.inventory, f.body).error,
    'UnsupportedFixedDrawingTextOverflow',
  );
  assert.equal(
    restrictDrawingLayout(f.d, f.prepared, { state: 'unavailable' }, f.body).error,
    'IncompleteRestrictedDrawingLayout',
  );
  assert.equal(
    restrictDrawingLayout(f.d, f.prepared, { state: 'collected', footprints: [] }, f.body).error,
    'IncompleteRestrictedDrawingLayout',
  );
});
function reservationFixture() {
  const paragraphs = [{ section: 0, paragraph: 0, text: '\ufffc' }];
  const setting = {
    section_ordinal: 0,
    width: 15000,
    height: 22500,
    orientation: 'widely',
    gutter_type: 'left_only',
    duplicate_margins: 0,
    margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
  };
  const flows = [
    {
      section: 0,
      paragraph: 0,
      top_level: true,
      single_column: true,
      page_break: false,
      column_break: false,
    },
  ];
  const body = paginateBodyRows(
    [
      {
        ...paragraphs[0],
        kind: 'text',
        startUnit: 0,
        endUnit: 1,
        width: 200,
        height: 20,
        textHeight: 20,
        textTop: 0,
      },
    ],
    setting,
    flows,
  );
  body.pages = body.pages.map((p) => ({ ...p, section: 0 }));
  const source = structuredClone(content().drawings[0].source);
  source.geometry = { ...source.geometry, width: 1500, height: 1500, horizontal_offset: 7500 };
  source.rendering_corners = [
    [0, 0],
    [1500, 0],
    [1500, 1500],
    [0, 1500],
  ];
  const d = { section: 0, drawingNode: 8, hostParagraph: 0, anchorUnit: 0, source };
  return { d, paragraphs, body, content: { paragraphs, drawings: [d], tables: [] } };
}
test('fixed square reservation requires complete inventory and rejects object collision before wrapping', () => {
  const f = reservationFixture();
  const ready = resolveDrawingWrapReservations([f.d], f.paragraphs, f.body, f.content);
  assert.equal(ready.state, 'reserved', ready.error);
  const rectangle = ready.reservations[0].rectangle;
  f.content.tables = [{ section: 0, tableNode: 99, parentTableNode: null }];
  assert.equal(
    resolveDrawingWrapReservations([f.d], f.paragraphs, f.body, f.content).error,
    'IncompleteTableCollisionInventory',
  );
  f.body.tableCollisionFootprints = [{ section: 0, tableNode: 99, pageOrdinal: 0, rectangle }];
  assert.equal(
    resolveDrawingWrapReservations([f.d], f.paragraphs, f.body, f.content).error,
    'UnsupportedFixedDrawingCollision',
  );
});

test('fixed top-and-bottom textbox reserves its persisted margins and retains its activation bounds', () => {
  const c = content();
  const { source } = c.hwp5Drawings[0];
  source.flags = (source.flags | (1 << 21)) >>> 0;
  source.offset_y = 1500;

  source.outer_margins = [0, 0, 750, 1500];
  const before = structuredClone(c);
  const page = layout(c);
  assert.equal(page.state, 'paginated', page.policyReason ?? page.error);
  const [placed] = page.placedDrawings;
  const [reservation] = page.drawingWrapReservations;
  assert.deepEqual(reservation.rectangle, placed.rectangle);
  assert.deepEqual(reservation.flow, {
    textWrap: 1,
    textFlow: 0,
    outsideMargins: [0, 0, 750, 1500],
  });
  const outlines = previewDrawingOutlineLayers(c, page);
  assert.deepEqual(outlines.unavailable, []);
  assert.deepEqual(outlines.front[0].origin, placed.rectangle);
  assert.deepEqual(
    objectActivationTarget(
      { content: c, layout: page, charts: [], outlines },
      placed.rectangle.x + 1,
      placed.rectangle.y + 1,
    ),
    { kind: 'drawing', section: 0, drawingNode: 12 },
  );
  assert.deepEqual(c, before);
});

test('fixed top-and-bottom reservation rejects a physical collision before wrapping', () => {
  const f = reservationFixture();
  f.d.source.flow.text_wrap = 1;
  f.d.source.flow.text_flow = 0;
  const ready = resolveDrawingWrapReservations([f.d], f.paragraphs, f.body, f.content);
  assert.equal(ready.state, 'reserved', ready.error);
  f.content.tables = [{ section: 0, tableNode: 99, parentTableNode: null }];
  f.body.tableCollisionFootprints = [
    {
      kind: 'table',
      section: 0,
      tableNode: 99,
      pageOrdinal: 0,
      rectangle: ready.reservations[0].rectangle,
    },
  ];
  assert.equal(
    resolveDrawingWrapReservations([f.d], f.paragraphs, f.body, f.content).error,
    'UnsupportedFixedDrawingCollision',
  );
});
