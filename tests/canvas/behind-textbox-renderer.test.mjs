import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRenderer } from '../../web/preview/renderer.mjs';
test('real renderer projects direct behind textbox and paints its complete layer before body', (t) => {
  const calls = [],
    frames = [],
    glyphs = [];
  const ctx = new Proxy(
    {
      measureText: (t) => ({
        width: t.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }),
      fillText(t, x, y) {
        calls.push(t);
        glyphs.push({ t, x, y });
      },
      fillRect() {
        if (this.fillStyle === '#abcdef') calls.push('FILL');
      },
      stroke() {
        if (this.strokeStyle === '#234567') calls.push('OUTLINE');
      },
      drawImage() {},
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  const canvas = { width: 800, height: 600, style: {}, dataset: {}, getContext: () => ctx };
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const source = {
    drawing_node: 9,
    paragraph: 1,
    anchor_unit: 0,
    transform_identity: true,
    group_context: null,
    caption: null,
    stroke: { style: 1, width: 75, color: 0x234567 },
    geometry: {
      width: 3000,
      height: 1500,
      width_relative: 4,
      height_relative: 2,
      treat_as_character: false,
      horizontal_offset: 0,
      vertical_offset: 0,
    },
    position: { relations: [0, 0, 0, 0], flags: [false, false, true, false] },
    flow: { text_wrap: 2, text_flow: 0, z_order: 0, outside_margins: [0, 0, 0, 0] },
    rendering: { matrix: [1, 0, 0, 0, 1, 0], angle: 0, flip: [false, false], reverse: null },
    rendering_corners: [
      [0, 0],
      [3000, 0],
      [3000, 1500],
      [0, 1500],
    ],
    paint: { shadow_type: 0, fill_node: 11 },
    text: {
      list_node: 10,
      text_direction: 0,
      line_wrap: 0,
      vertical_alignment: 0,
      margin_present: true,
      margins: [0, 0, 0, 0],
    },
  };
  const content = {
    format: 'hwpx',
    limited: false,
    paragraphs: [
      { section: 0, paragraph: 0, text: '\ufffcBODY', editable: true, selectable: true },
      {
        section: 0,
        paragraph: 1,
        text: 'BOX',
        editable: true,
        selectable: true,
        drawingText: { drawingNode: 9, listNode: 10 },
      },
    ],
    drawings: [{ section: 0, drawingNode: 9, hostParagraph: 0, anchorUnit: 0, source }],
    containers: [],
    pictures: [],
    tables: [],
    fillBrushReports: [
      {
        section: 0,
        report: {
          brushes: [
            {
              element_index: 11,
              parent_element_index: 9,
              part_kind: 'section',
              section_ordinal: 0,
              direct_children: 1,
              other_attributes: 0,
            },
          ],
          nodes: [
            {
              brush_index: 0,
              kind: 'win_brush',
              direct_children: 0,
              other_attributes: 0,
              unknown_enums: 0,
              raw: ['#abcdef', null, null, '0', ...Array(15).fill(null)],
            },
          ],
        },
      },
    ],
    pageSettings: [
      {
        section_ordinal: 0,
        width: 15000,
        height: 22500,
        orientation: 'widely',
        gutter_type: 'left_only',
        duplicate_margins: 0,
        margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
      },
    ],
    paragraphFlows: [
      {
        section: 0,
        paragraph: 0,
        host: 'body',
        top_level: true,
        single_column: true,
        page_break: false,
        column_break: false,
      },
      { section: 0, paragraph: 1, host: 'drawing', top_level: false, column_declaration: null },
    ],
  };
  const r = createRenderer(canvas, viewport, { style: {} }, () => {}, {
    requestFrame: (f) => (frames.push(f), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval: () => 1,
    clearInterval() {},
  });
  t.after(() => r.close());
  r.show(content);
  let n = 0;
  while (frames.length) {
    if (++n > 30) throw Error('FrameLoop');
    frames.shift()();
  }
  const f = r.paintedFrame();
  if (process.env.HWPJS_TEST_EVIDENCE_DIR) {
    mkdirSync(process.env.HWPJS_TEST_EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(process.env.HWPJS_TEST_EVIDENCE_DIR, 'behind-renderer-frame.json'),
      JSON.stringify(
        {
          calls,
          glyphs,
          mode: f?.layout?.pageLayoutMode,
          current: r.isPaintedFrameCurrent(),
          placed: f?.layout?.placedDrawings,
          rows: f?.layout?.rows,
          pageLayoutError: canvas.dataset.pageLayoutError,
        },
        null,
        2,
      ),
      { flag: 'wx' },
    );
  }
  assert.equal(f?.layout?.pageLayoutMode, 'measured-drawing-body');
  assert.equal(canvas.dataset.pageLayoutError, '');
  assert.equal(f.layout.placedDrawings.length, 1);
  assert.deepEqual(calls, ['FILL', 'OUTLINE', 'B', 'O', 'X', 'B', 'O', 'D', 'Y']);
  assert.equal(f.layout.rows.find((x) => x.drawingNode === 9).drawingPaintLayer, 'behind');
  const bs = glyphs.filter((g) => g.t === 'B');
  assert.equal(bs.length, 2);
  assert.equal(bs[0].x, bs[1].x);
  assert(Math.abs(bs[0].y - bs[1].y) < 12, 'ActualGlyphExtentsOverlap');
  assert.equal(r.isPaintedFrameCurrent(), true);
  const rect = f.layout.placedDrawings[0].rectangle;
  const point = { x: rect.x + 0.75, y: rect.y + 0.75 };
  assert.deepEqual(r.behindTextObjectAtLogicalPoint(point.x, point.y), {
    kind: 'drawing',
    section: 0,
    drawingNode: 9,
  });
  assert.deepEqual(f.behindTextObjectIntentAtLogicalPoint(point.x, point.y), {
    kind: 'drawing',
    section: 0,
    drawingNode: 9,
  });
  r.selectObject(null);
  while (frames.length) frames.shift()();
  const repainted = r.paintedFrame();
  assert.notEqual(repainted, f);
  assert.equal(r.canAcknowledgeObjectSelectionMode(f, repainted), true);
  assert.equal(r.canAcknowledgeObjectSelectionMode({}, repainted), false);
  r.setViewScale(1.25);
  while (frames.length) frames.shift()();
  assert.equal(r.canAcknowledgeObjectSelectionMode(f, r.paintedFrame()), false);
});
