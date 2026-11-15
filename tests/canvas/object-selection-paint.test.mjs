import test from 'node:test';
import assert from 'node:assert/strict';
import {
  objectSelectionRectangle,
  paintObjectSelection,
} from '../../web/preview/object-selection-paint.mjs';
const chart = { kind: 'chart', section: 0, wrapper: 3 },
  drawing = { kind: 'drawing', section: 0, drawingNode: 4 };
const rect = { x: 10, y: 20, width: 100, height: 50 },
  source = {
    drawing_node: 4,
    paragraph: 1,
    anchor_unit: 0,
    transform_identity: true,
    rendering: { angle: 0 },
    group_context: null,
  };
test('selection border uses a unique successful current chart paint, excluding provisional preview and ambiguous owners', () => {
  const content = { chartTargets: [{ section: 0, wrapper: 3 }] },
    item = { ...rect, target: chart };
  assert.equal(objectSelectionRectangle(chart, content, [item], []), item);
  assert.equal(
    objectSelectionRectangle(chart, content, [{ ...item, provisional: true }], []),
    null,
  );
  assert.equal(objectSelectionRectangle(chart, content, [], []), null);
  assert.equal(objectSelectionRectangle(chart, content, [item, { ...item, x: 11 }], []), null);
  assert.equal(
    objectSelectionRectangle(
      chart,
      { chartTargets: [...content.chartTargets, ...content.chartTargets] },
      [item],
      [],
    ),
    null,
  );
});
test('drawing paint witness must match current Native source identity; rotation/group/malformed frames refuse decoration', () => {
  const content = {
      format: 'hwpx',
      drawings: [{ section: 0, drawingNode: 4, hostParagraph: 0, anchorUnit: 0, source }],
    },
    frames = [{ source, rectangle: rect }];
  assert.equal(objectSelectionRectangle(drawing, content, [], frames), rect);
  assert.equal(
    objectSelectionRectangle(drawing, content, [], [{ source: { ...source }, rectangle: rect }]),
    null,
  );
  for (const s of [
    { ...source, transform_identity: false },
    { ...source, rendering: { angle: 1 } },
    { ...source, group_context: {} },
  ])
    assert.equal(
      objectSelectionRectangle(
        drawing,
        {
          format: 'hwpx',
          drawings: [{ section: 0, drawingNode: 4, hostParagraph: 0, anchorUnit: 0, source: s }],
        },
        [],
        [{ source: s, rectangle: rect }],
      ),
      null,
    );
  assert.equal(
    objectSelectionRectangle(
      drawing,
      content,
      [],
      [{ source, rectangle: { ...rect, width: NaN } }],
    ),
    null,
  );
});
test('visible selected-object border draws in document scroll coordinates and restores Canvas state', () => {
  const calls = [],
    ctx = {
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      setLineDash: (a) => calls.push(a),
      strokeRect: (...a) => calls.push(a),
    };
  assert.equal(paintObjectSelection(ctx, rect, 7), true);
  assert.deepEqual(calls, ['save', [4, 2], [10, 13, 100, 50], 'restore']);
});

function chartFixture() {
  const geometry = {
    width: 1500,
    height: 1500,
    width_relative: 4,
    height_relative: 2,
    treat_as_character: false,
    horizontal_offset: 7500,
    vertical_offset: 0,
  };
  const position = { flags: [false, true, false, false], relations: [2, 2, 0, 0] };
  const scalar = (value) => ({ value: { kind: 'finite', value } });
  const display = {
    pair: { section_ordinal: 0, wrapper_node: 9 },
    host: { wrapper_node: 9, geometry: { ...geometry }, position: structuredClone(position) },
    plots: [{ node: 1, kind: 'barChart', series_nodes: [2] }],
    plot_settings: [{ direction: { value: 'col' }, grouping: { value: 'clustered' } }],
    axes: [
      { node: 20, kind: 'valAx', scaling: { minimum: scalar(-10), maximum: scalar(10) } },
      { node: 30, kind: 'catAx', scaling: null },
    ],
    axis_links: [
      { plot_node: 1, target: { status: 'resolved', node: 20 } },
      { plot_node: 1, target: { status: 'resolved', node: 30 } },
    ],
    points: [
      { index: 0, value: '-10', kind: 'numeric_literal', cache_node: 3 },
      { index: 1, value: '10', kind: 'numeric_literal', cache_node: 3 },
    ],
    bindings: [
      { series_node: 2, plot_node: 1, role: 'value' },
      { series_node: 2, plot_node: 1, role: 'value' },
    ],
    series_text: [],
    rich_text: [],
  };
  const content = {
    format: 'hwpx',
    limited: false,
    chartDisplayAvailable: true,
    paragraphs: [{ section: 0, paragraph: 0, text: '\ufffc본문😀' }],
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
    chartTargets: [{ section: 0, wrapper: 9, paragraph: 0, anchorUnit: 0, error_name: null }],
    oles: [
      {
        section: 0,
        oleNode: 8,
        chartWrapper: 9,
        paragraph: 0,
        anchorUnit: 0,
        state: 'located',
        error: null,
        sourceError: null,
        representation: 'chart-alternative',
        source: {
          geometry,
          position,
          transform_identity: true,
          flow: { text_wrap: 0, text_flow: 2, z_order: 0, outside_margins: [0, 0, 0, 0] },
        },
      },
    ],
  };
  return {
    content,
    display,
    read: () => ({ value: display }),
    measure: (text) => ({ width: text.length * 8, height: 20 }),
  };
}

test('actual renderer completes chart selection border before confirmation and retires it on source/clear; no provisional data authority', async (t) => {
  const { createRenderer } = await import('../../web/preview/renderer.mjs');
  const frames = [],
    strokes = [],
    ctx = new Proxy(
      {
        measureText: (text) => ({
          width: text.length * 8,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        }),
        strokeRect(...r) {
          strokes.push({ r, color: this.strokeStyle });
        },
      },
      { get: (o, k) => o[k] ?? (() => {}) },
    );
  const canvas = { width: 800, height: 600, style: {}, dataset: {}, getContext: () => ctx },
    viewport = Object.assign(new EventTarget(), {
      clientWidth: 800,
      clientHeight: 600,
      scrollTop: 0,
      scrollLeft: 0,
    });
  const renderer = createRenderer(canvas, viewport, { style: {} }, () => {}, {
    requestFrame: (f) => (frames.push(f), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval: () => 1,
    clearInterval() {},
  });
  t.after(() => renderer.close());
  const paint = () => {
    let n = 0;
    while (frames.length) {
      assert(++n < 30);
      frames.shift()();
    }
  };
  const f = chartFixture(),
    target = { kind: 'chart', section: 0, wrapper: 9 };
  f.display.kind = 'chart_display';
  for (const geometry of [f.display.host.geometry, f.content.oles[0].source.geometry])
    Object.assign(geometry, { width: 30000, height: 15000 });
  Object.assign(f.content.pageSettings[0], { width: 60000, height: 60000 });
  renderer.chartReader(() => f.display);
  renderer.show(f.content, { resourceDocument: 'd:1', resourceEpoch: 'd:1:0' });
  paint();
  await new Promise((r) => setImmediate(r));
  paint();
  assert.equal(renderer.chartPreviews().length, 1);
  const item = renderer.chartPreviews()[0];
  assert.deepEqual(
    renderer.paintedFrame().objectIntentAtLogicalPoint(item.x + 1, item.y + 1),
    target,
  );
  renderer.selectObject(target);
  assert.equal(renderer.isObjectSelectionPainted(target), false);
  paint();
  assert.equal(renderer.isObjectSelectionPainted(target), true);
  assert(strokes.some((s) => s.color === '#145b96' && s.r[0] === item.x && s.r[2] === item.width));
  renderer.selectObject(null);
  assert.equal(renderer.isObjectSelectionPainted(target), false);
  paint();
  assert.equal(renderer.paintedFrame().objectSelection, null);
  renderer.selectObject(target);
  paint();
  assert.equal(renderer.isObjectSelectionPainted(target), true);
  renderer.show(structuredClone(f.content), { resourceDocument: 'd:1', resourceEpoch: 'd:1:0' });
  paint();
  assert.equal(renderer.isObjectSelectionPainted(target), false);
  renderer.clear();
  paint();
  assert.equal(renderer.paintedFrame().objectSelection, null);
});

test('H5 border decoration consumes common query and exact painted-source identity; no inferred transform flag or stale owner', async () => {
  const { readFileSync } = await import('node:fs');
  const content = JSON.parse(
    readFileSync(new URL('./fixtures/textbox-h5-public-observation.json', import.meta.url), 'utf8'),
  );
  const row = content.drawings[0],
    target = { kind: 'drawing', section: row.section, drawingNode: row.drawingNode };
  assert.equal(row.source.transform_identity, undefined);
  assert.equal(
    objectSelectionRectangle(target, content, [], [{ source: row.source, rectangle: rect }]),
    rect,
  );
  assert.equal(
    objectSelectionRectangle(
      target,
      content,
      [],
      [{ source: structuredClone(row.source), rectangle: rect }],
    ),
    null,
  );
  content.hwp5DrawingComponents[0].rotation_angle = undefined;
  assert.equal(
    objectSelectionRectangle(target, content, [], [{ source: row.source, rectangle: rect }]),
    null,
  );
});
