import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paintTableBorder,
  paintTransparentTableLines,
} from '../../web/preview/table-border-paint.mjs';
import { paintRowTransform } from '../../web/preview/row-transform-paint.mjs';
import { measureTableCells } from '../../web/preview/table-cell-measurement.mjs';
import { projectTablePageFragments } from '../../web/preview/table-page-fragments.mjs';
import {
  canvasDisplayOptions,
  DEFAULT_CANVAS_DISPLAY_OPTIONS,
} from '../../web/preview/canvas-display-options.mjs';
import { createViewOptionsBridge } from '../../apps/demo/src/view-options-bridge.ts';
import { createRenderer } from '../../web/preview/renderer.mjs';
const content = (text = 'X', picture = false) => ({
  paragraphs: [
    {
      section: 0,
      paragraph: 0,
      editable: true,
      selectable: true,
      text: picture ? '\ufffc' + text : text,
    },
  ],
  limited: false,
  pictures: picture
    ? [
        {
          section: 0,
          paragraph: 0,
          pictureNode: 1,
          anchorUnit: 0,
          state: 'located',
          transform: { identity: true },
          geometry: {
            treatAsCharacter: true,
            widthRelative: 4,
            heightRelative: 2,
            width: 3000,
            height: 1500,
          },
          crop: { clip: [0, 3000, 0, 1500], imageDimensions: [null, null] },
        },
      ]
    : [],
});
function harness(t) {
  const frames = [],
    timers = new Map(),
    intervals = new Map();
  let id = 0,
    resize,
    ratio = 1,
    boundsWidth;
  const ctx = new Proxy(
    {
      measureText: (text) => ({
        width: text.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }),
    },
    { get: (o, key) => o[key] ?? (() => {}) },
  );
  const canvas = {
    width: 300,
    height: 150,
    style: {},
    dataset: {},
    getContext: () => ctx,
    getBoundingClientRect: () => ({
      width: boundsWidth ?? parseFloat(canvas.style.width),
      height: parseFloat(canvas.style.height),
    }),
  };
  const viewport = Object.assign(new EventTarget(), {
    clientWidth: 800,
    clientHeight: 600,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const renderer = createRenderer(canvas, viewport, { style: {} }, () => {}, {
    devicePixelRatio: () => ratio,
    requestFrame: (f) => (frames.push(f), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      constructor(f) {
        resize = f;
      }
      observe() {}
      disconnect() {}
    },
    setTimeout: (f) => {
      timers.set(++id, f);
      return id;
    },
    clearTimeout: (n) => timers.delete(n),
    setInterval: (f) => {
      intervals.set(++id, f);
      return id;
    },
    clearInterval: (n) => intervals.delete(n),
    createImageBitmap: async () => ({ width: 40, height: 20, close() {} }),
  });
  t.after(() => renderer.close());
  const paint = () => {
    let n = 0;
    while (frames.length) {
      assert(++n < 40);
      frames.shift()();
    }
  };
  return {
    renderer,
    canvas,
    viewport,
    ctx,
    paint,
    resize: () => resize(),
    setRatio: (n) => {
      ratio = n;
    },
    setBoundsWidth: (n) => {
      boundsWidth = n;
    },
    async settle() {
      await new Promise((r) => setImmediate(r));
      paint();
    },
    expire() {
      const pending = [...timers.values()];
      timers.clear();
      for (const f of pending) f();
      paint();
    },
    blink() {
      for (const f of intervals.values()) f();
    },
  };
}
test('grid defaults off and rejects getters without reading', () => {
  assert.equal(DEFAULT_CANVAS_DISPLAY_OPTIONS.showTableGrid, false);
  let reads = 0;
  assert.throws(() =>
    canvasDisplayOptions({
      paragraphMarks: false,
      get showTableGrid() {
        reads++;
        return true;
      },
    }),
  );
  assert.equal(reads, 0);
  for (const showTableGrid of [null, 1, 'true', undefined])
    assert.throws(() => canvasDisplayOptions({ paragraphMarks: false, showTableGrid }));
});
function recorder() {
  const calls = [];
  const ctx = new Proxy(
    {
      save() {},
      restore() {},
      fillRect(...a) {
        calls.push(['fill', this.fillStyle, ...a]);
      },
      strokeRect(...a) {
        calls.push(['guide', this.strokeStyle, this.lineWidth, ...a]);
      },
      stroke() {
        calls.push(['ink', this.strokeStyle, this.lineWidth]);
      },
      rect(...a) {
        calls.push(['clipRect', ...a]);
      },
      clip() {
        calls.push(['clip']);
      },
      transform(...a) {
        calls.push(['transform', ...a]);
      },
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  return { ctx, calls };
}
test('source empty 2x2 uses measured/projected rectangles, off zero / on four, model unchanged', (t) => {
  const paragraphs = [0, 1, 2, 3].map((paragraph) => ({
    section: 0,
    paragraph,
    text: '',
    editable: true,
    tableCell: { tableNode: 81, listNode: 82 + paragraph },
  }));
  const table = {
    section: 0,
    tableNode: 81,
    partial: false,
    rows: 2,
    columns: 2,
    cells: paragraphs.map((p, i) => ({
      listNode: 82 + i,
      row: Math.floor(i / 2),
      column: i % 2,
      rowSpan: 1,
      columnSpan: 1,
      width: 7200,
      height: 2000,
      paragraphs: [p.paragraph],
    })),
  };
  const before = structuredClone({ table, paragraphs });
  const measured = measureTableCells(
    table,
    paragraphs,
    (t) => ({ width: t.length * 8, height: 20 }),
    { origin: { x: 0, y: 0 }, padding: 4 },
  );
  assert.equal(measured.state, 'measured');
  const placed = projectTablePageFragments(
    table,
    measured.grid,
    measured.flows,
    {
      state: 'planned',
      fragments: [
        { cells: [0, 1, 2, 3], x: 100, y: 80, offset: 0, startRow: 0, endRow: 2, pageOrdinal: 0 },
      ],
    },
    { origin: { x: 0, y: 0 }, padding: 4 },
  );
  assert.equal(placed.state, 'placed');
  assert.equal(placed.boxes.length, 4);
  const { ctx, calls } = recorder();
  for (const box of placed.boxes)
    paintRowTransform(ctx, box, 12, () => paintTableBorder(ctx, box, { state: 'none' }, 12));
  assert.equal(calls.filter((c) => c[0] === 'guide').length, 0);
  for (const box of placed.boxes)
    paintRowTransform(ctx, box, 12, () =>
      paintTableBorder(ctx, box, { state: 'none' }, 12, { showTableGrid: true }),
    );
  assert.deepEqual(
    calls.filter((c) => c[0] === 'guide').map((c) => c.slice(3)),
    placed.boxes.map((b) => [b.x, b.y - 12, b.width, b.height]),
  );
  assert.deepEqual({ table, paragraphs }, before);
  // Feed the actual measured SOURCE boxes through the real renderer's border lookup.
  const h = harness(t),
    model = content('host');
  model.tableBorderSources = [
    {
      section: 0,
      sourceOnly: true,
      cells: table.cells.map((c) => ({ table_node: 81, list_node: c.listNode, style_index: 0 })),
      styles: [
        {
          unknown_children: 0,
          unknown_attributes: 0,
          fill_node: null,
          three_d: '0',
          shadow: 'false',
          center_line: 'NONE',
          slash: 'NONE',
          back_slash: 'NONE',
          slash_crooked: '0',
          slash_is_counter: '0',
          back_slash_crooked: '0',
          back_slash_is_counter: '0',
          diagonal: { style: 'SOLID' },
          edges: Array.from({ length: 4 }, (_, i) => ({
            style: i === 1 ? 'SOLID' : 'NONE',
            width: '0.12 mm',
            color: '#ee1100',
          })),
        },
      ],
    },
  ];
  const events = [];
  h.ctx.strokeRect = function (...a) {
    if (this.strokeStyle === '#aaaaaa') events.push(['guide', ...a]);
  };
  h.ctx.stroke = function () {
    if (this.strokeStyle === '#ee1100') events.push(['ink']);
  };
  h.renderer.show(model);
  h.paint();
  h.renderer.layout().boxes = placed.boxes;
  h.renderer.setDisplayOptions({ paragraphMarks: false, showTableGrid: true });
  h.paint();
  assert.deepEqual(
    events.filter((c) => c[0] === 'guide').map((c) => c.slice(1)),
    placed.boxes.map((b) => [b.x, b.y, b.width, b.height]),
  );
  assert.equal(events.filter((c) => c[0] === 'ink').length, 4);
  assert(
    events.findIndex((c) => c[0] === 'ink') > events.findLastIndex((c) => c[0] === 'guide'),
    'all gray guides precede all adjacent source border ink',
  );
});
test('clip and transform are shared; fill then gray guide then original compound ink', () => {
  const { ctx, calls } = recorder(),
    box = Object.freeze({
      x: 30,
      y: 40,
      width: 90,
      height: 50,
      pageClip: { x: 20, y: 35, width: 100, height: 30 },
      transform: [1.25, 0, 0, 1.25, 5, 8],
    });
  const plan = Object.freeze({
      state: 'strokes',
      fill: { state: 'solid', color: '#123456' },
      strokes: [{ edge: 0, width: (0.5 * 96) / 25.4, color: '#ee1100', compound: 'DOUBLE_SLIM' }],
    }),
    before = JSON.stringify({ box, plan });
  assert(
    paintRowTransform(ctx, box, 10, () =>
      assert(paintTableBorder(ctx, box, plan, 10, { showTableGrid: true })),
    ),
  );
  assert.deepEqual(
    calls.find((c) => c[0] === 'clipRect'),
    ['clipRect', 20, 25, 100, 30],
  );
  assert.deepEqual(
    calls.find((c) => c[0] === 'transform'),
    ['transform', 1.25, 0, 0, 1.25, 5, 8],
  );
  const g = calls.findIndex((c) => c[0] === 'guide');
  assert.deepEqual(calls[g], ['guide', '#aaaaaa', 1, 30, 30, 90, 50]);
  assert(calls.findIndex((c) => c[0] === 'fill') < g);
  assert(calls.findIndex((c) => c[0] === 'ink') > g);
  assert.equal(calls.filter((c) => c[0] === 'ink' && c[1] === '#ee1100').length, 2);
  assert.equal(JSON.stringify({ box, plan }), before);
  assert.equal(
    paintRowTransform(ctx, { ...box, transform: [0, 0, 0, 0, 0, 0] }, 10, () => {
      throw Error('invalid paint');
    }),
    false,
  );
});
test('actual renderer generated geometry at zoom; view change invalidates pending frame', (t) => {
  const h = harness(t),
    source = content('host');
  source.createdTables = [
    {
      section: 0,
      identity: '1',
      hostParagraph: 0,
      anchorUnit: 0,
      rows: 2,
      columns: 2,
      resources: { character: 1 },
      cells: [0, 1, 2, 3].map((i) => ({
        row: Math.floor(i / 2),
        column: i % 2,
        width: 7200,
        height: 1000,
        text: '',
      })),
    },
  ];
  const before = structuredClone(source),
    guides = [];
  h.ctx.strokeRect = function (...a) {
    if (this.strokeStyle === '#aaaaaa') guides.push(a);
  };
  h.renderer.show(source);
  h.paint();
  assert.equal(guides.length, 0);
  h.renderer.setViewScale(1.25);
  h.paint();
  const boxes = h.renderer.layout().boxes;
  assert.equal(boxes.length, 4);
  h.renderer.setDisplayOptions({ paragraphMarks: false, showTableGrid: true });
  assert.equal(h.renderer.isPaintedFrameCurrent(), false);
  h.paint();
  assert.equal(h.renderer.isPaintedFrameCurrent(), true);
  assert.deepEqual(
    guides,
    boxes.map((b) => [b.x, b.y, b.width, b.height]),
  );
  const view = h.renderer.getDisplayOptions();
  h.renderer.setDisplayOptions({ paragraphMarks: false, showTableGrid: true });
  assert.equal(h.renderer.getDisplayOptions(), view);
  guides.length = 0;
  h.renderer.setDisplayOptions({ paragraphMarks: false, showTableGrid: false });
  h.paint();
  assert.equal(guides.length, 0);
  h.renderer.setDisplayOptions({ paragraphMarks: true });
  assert.equal(h.renderer.getDisplayOptions().showTableGrid, false);
  assert.deepEqual(source, before);
});
test('toolbar/menu grid checked state and toggle only call display port', () => {
  let options = { paragraphMarks: false, formattingMarks: false, showTableGrid: false },
    writes = 0;
  const b = createViewOptionsBridge({
    getHost: () => ({
      getDisplayOptions: () => options,
      setDisplayOptions: (next) => {
        options = next;
        writes++;
        return true;
      },
    }),
    onStatus: (s) => {
      throw Error(s);
    },
  });
  assert.equal(b.presentation(true)['toggle-grid'].pressed, false);
  b.action({ command: 'toggle-grid' });
  assert.equal(b.presentation(true)['toggle-grid'].pressed, true);
  b.action({ command: 'toggle-grid' });
  assert.equal(options.showTableGrid, false);
  assert.equal(writes, 2);
  b.dispose();
  b.action({ command: 'toggle-grid' });
  assert.equal(writes, 2);
});

test('transparent lines paint confirmed NONE edges and omit page-fragment seams', () => {
  const { ctx, calls } = recorder();
  ctx.setLineDash = (dash) => calls.push(['dash', dash]);
  ctx.moveTo = (...point) => calls.push(['move', ...point]);
  ctx.lineTo = (...point) => calls.push(['line', ...point]);
  const box = { x: 10, y: 20, width: 40, height: 30, continuesBefore: true };
  for (const state of ['proxy', 'unavailable']) paintTransparentTableLines(ctx, box, { state }, 5);
  assert.deepEqual(calls, []);
  paintTransparentTableLines(ctx, box, { state: 'strokes', strokes: [{ edge: 1 }] }, 5);
  assert.deepEqual(calls, [
    ['dash', [1, 2]],
    ['move', 10, 15],
    ['line', 10, 45],
    ['move', 10, 45],
    ['line', 50, 45],
    ['ink', '#ff0000', 1],
  ]);
});

test('transparent lines toggle independently of grid and paragraph marks', () => {
  let options = DEFAULT_CANVAS_DISPLAY_OPTIONS;
  const b = createViewOptionsBridge({
    getHost: () => ({
      getDisplayOptions: () => options,
      setDisplayOptions(next) {
        options = canvasDisplayOptions(next);
        return true;
      },
    }),
    onStatus(message) {
      throw Error(message);
    },
  });
  assert.equal(b.presentation(true)['toggle-transparent-lines'].pressed, false);
  assert(b.action({ command: 'toggle-transparent-lines' }));
  assert.equal(b.presentation(true)['toggle-transparent-lines'].pressed, true);
  assert.equal(options.showTableGrid, false);
  assert(b.action({ command: 'toggle-grid' }));
  assert.equal(options.showTransparentTableLines, true);
  assert.equal(options.showTableGrid, true);
  assert.equal(options.paragraphMarks, false);
  let reads = 0;
  assert.throws(
    () =>
      canvasDisplayOptions({
        paragraphMarks: false,
        get showTransparentTableLines() {
          reads++;
          return true;
        },
      }),
    /InvalidCanvasDisplayOptions/,
  );
  assert.equal(reads, 0);
});
