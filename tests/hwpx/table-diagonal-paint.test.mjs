import { readFileSync } from 'node:fs';
import {
  tableBorderPaintIndex,
  tableBorderPlanForBox,
} from '../../web/preview/table-border-plan.mjs';
import { paintRowTransform } from '../../web/preview/row-transform-paint.mjs';
import { tableBoxPaintBounds } from '../../web/preview/table-background-targets.mjs';
import { paintTableBackground } from '../../web/preview/table-background-paint.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { tableBorderPaintPlan } from '../../web/preview/table-border-plan.mjs';
import { paintTableBorder } from '../../web/preview/table-border-paint.mjs';
import { paintTableDiagonals } from '../../web/preview/table-diagonal-paint.mjs';
const source = (slash = 'NONE', back_slash = 'NONE') => ({
  fill_node: null,
  unknown_children: 0,
  unknown_attributes: 0,
  three_d: '0',
  shadow: '0',
  center_line: 'NONE',
  slash,
  back_slash,
  slash_crooked: '0',
  slash_is_counter: '0',
  back_slash_crooked: '0',
  back_slash_is_counter: '0',
  edges: Array.from({ length: 4 }, () => ({ style: 'SOLID', width: '0.1 mm', color: '#123456' })),
  diagonal: { style: 'SOLID', width: '0.5 mm', color: '#2973a1' },
});
function withSolidFill(style) {
  const raw = Array(19).fill(null);
  raw[0] = '#a17329';
  raw[3] = '0';
  return {
    ...style,
    node: 1,
    fill_node: 2,
    fill_report: {
      brushes: [
        {
          part_kind: 'header',
          section_ordinal: null,
          element_index: 2,
          parent_element_index: 1,
          direct_children: 1,
          other_attributes: 0,
        },
      ],
      nodes: [
        {
          kind: 'win_brush',
          brush_index: 0,
          element_index: 3,
          direct_children: 0,
          other_attributes: 0,
          unknown_enums: 0,
          raw,
        },
      ],
    },
  };
}
const box = { x: 10, y: 100, width: 80, height: 40 };
// Command recorder verifies caller transform/clip ownership; this is not a raster oracle.
function canvas(fail, matrix = [1, 0, 0, 1, 0, 0]) {
  const calls = [],
    stack = [];
  let clips = ['parent'],
    point = null;
  const ctx = {
    calls,
    stack,
    save() {
      stack.push([...clips]);
      calls.push(['save']);
    },
    restore() {
      clips = stack.pop();
      calls.push(['restore']);
    },
    beginPath() {
      calls.push(['begin']);
    },
    rect(...args) {
      calls.push(['rect', ...args]);
    },
    clip() {
      clips.push('cell');
      calls.push(['clip']);
      if (fail === 'clip') throw Error('clip');
    },
    setLineDash(args) {
      calls.push(['dash', args]);
    },
    moveTo(x, y) {
      point = [x, y];
    },
    lineTo(x, y) {
      point.push(x, y);
    },
    stroke() {
      calls.push([
        'stroke',
        ...point,
        ctx.strokeStyle,
        ctx.lineWidth,
        [...clips],
        [0, 2].flatMap((i) => [
          matrix[0] * point[i] + matrix[2] * point[i + 1] + matrix[4],
          matrix[1] * point[i] + matrix[3] * point[i + 1] + matrix[5],
        ]),
      ]);
      if (fail === 'stroke') throw Error('stroke');
    },
    fillRect(...args) {
      calls.push(['fill', ...args, ctx.fillStyle]);
    },
  };
  return ctx;
}
test('official literal HWPX slash/backSlash pairs preserve canonical RGB and separate four edges', () => {
  for (const [slash, back, expected] of [
    ['NONE', 'NONE', []],
    ['CENTER', 'NONE', ['rising']],
    ['NONE', 'CENTER', ['falling']],
    ['CENTER', 'CENTER', ['rising', 'falling']],
  ]) {
    const raw = source(slash, back),
      before = structuredClone(raw),
      plan = tableBorderPaintPlan(raw);
    assert.equal(plan.state, 'strokes');
    assert.deepEqual(
      (plan.diagonals ?? []).map((s) => s.direction),
      expected,
    );
    assert.equal(plan.strokes.length, 4);
    assert.ok(plan.strokes.every((s) => s.color === '#123456'));
    assert.ok((plan.diagonals ?? []).every((s) => s.color === '#2973a1' && s.edge === undefined));
    assert.deepEqual(raw, before);
  }
});
test('HWPX unsupported shape and missing scalars keep regular edges and validated fill', () => {
  for (const patch of [
    { slash_crooked: '1' },
    { slash_crooked: undefined },
    { slash_is_counter: '1' },
    { back_slash_crooked: '1' },
    { back_slash_is_counter: undefined },
    { center_line: 'BOTH' },
    { slash: 'ALL' },
    { back_slash: 'ROTATED' },
    { diagonal: { style: 'DOUBLE_SLIM', width: '0.5 mm', color: '#123456' } },
    { diagonal: { style: 'SOLID', width: '0 mm', color: '#123456' } },
    { diagonal: { style: 'SOLID', width: 'NaN mm', color: '#123456' } },
    { diagonal: { style: 'SOLID', width: '0.5 mm', color: '#gg3456' } },
    { diagonal: undefined },
  ]) {
    const p = tableBorderPaintPlan(withSolidFill({ ...source('CENTER'), ...patch }));
    assert.equal(p.state, 'strokes');
    assert.equal(p.strokes.length, 4);
    assert.equal(p.diagonalDiagnostic.state, 'unsupported');
    assert.equal(p.diagonals, undefined);
    assert.deepEqual(p.fill, { state: 'solid', color: '#a17329' });
    // The validated source fill survives and paints with known siblings.
    const ctx = canvas();
    assert.equal(paintTableBorder(ctx, box, p, 20), true);
    assert.equal(ctx.calls.filter((c) => c[0] === 'fill').length, 1);
    assert.equal(ctx.calls.filter((c) => c[0] === 'stroke').length, 4);
  }
});
test('legacy missing shape scalars preserve regular paint but report unknown geometry; effects stay diagnostic', () => {
  const old = source();
  for (const k of [
    'slash_crooked',
    'slash_is_counter',
    'back_slash_crooked',
    'back_slash_is_counter',
    'diagonal',
  ])
    delete old[k];
  const legacyPlan = tableBorderPaintPlan(old);
  assert.equal(legacyPlan.state, 'strokes');
  assert.deepEqual(legacyPlan.diagonalDiagnostic, {
    state: 'unsupported',
    reason: 'UnsupportedTableDiagonalShape',
  });
  assert.equal(legacyPlan.diagonals, undefined);
  const ctx = canvas();
  assert.equal(paintTableBorder(ctx, box, legacyPlan, 20), true);
  assert.equal(ctx.calls.filter((c) => c[0] === 'stroke').length, 4);
  // Even a NONE stroke does not prove the missing shape scalars are zero.
  assert.deepEqual(
    tableBorderPaintPlan({ ...old, diagonal: { style: 'NONE' } }).diagonalDiagnostic,
    { state: 'unsupported', reason: 'UnsupportedTableDiagonalShape' },
  );
  assert.equal(
    tableBorderPaintPlan({ ...old, slash: 'CENTER' }).diagonalDiagnostic.state,
    'unsupported',
  );
  for (const patch of [{ three_d: '1' }, { shadow: '1' }])
    assert.equal(
      tableBorderPaintPlan(withSolidFill({ ...source('CENTER'), ...patch })).state,
      'unavailable',
    );
});
test('diagonal only cross uses scrolled endpoints inside inherited transform and intersected clip', () => {
  const s = source('CENTER', 'CENTER');
  s.edges.forEach((e) => {
    e.style = 'NONE';
  });
  const plan = tableBorderPaintPlan(s);
  assert.equal(plan.state, 'none');
  const ctx = canvas();
  assert.equal(paintTableBorder(ctx, box, plan, 20), true);
  const lines = ctx.calls.filter((c) => c[0] === 'stroke');
  assert.deepEqual(
    lines.map((c) => c.slice(1, 5)),
    [
      [10, 120, 90, 80],
      [10, 80, 90, 120],
    ],
  );
  assert.deepEqual(
    lines.map((c) => c[7]),
    [
      ['parent', 'cell'],
      ['parent', 'cell'],
    ],
  );
  const transformed = canvas(undefined, [2, 0, 0, 2, 3, 7]);
  assert.equal(paintTableBorder(transformed, box, plan, 20), true);
  assert.deepEqual(
    transformed.calls.filter((c) => c[0] === 'stroke').map((c) => c[8]),
    [
      [23, 247, 183, 167],
      [23, 167, 183, 247],
    ],
  );
  assert.ok(ctx.calls.some((c) => JSON.stringify(c) === JSON.stringify(['rect', 10, 80, 80, 40])));
  assert.equal(ctx.stack.length, 0);
});
test('complete diagonal and orthogonal validation precedes any fill or stroke', () => {
  const good = { direction: 'rising', width: 1, color: '#123456' };
  for (const diagonals of [
    null,
    {},
    [null],
    Array(1),
    [{ ...good, width: 0 }],
    [{ ...good, width: NaN }],
    [{ ...good, direction: 'cross' }],
    [{ ...good, compound: 'DOUBLE_SLIM' }],
    [{ ...good, edge: 4 }],
    [good, good],
    [good, { ...good, direction: 'falling', color: 'bad' }],
  ]) {
    const ctx = canvas();
    assert.equal(
      paintTableBorder(
        ctx,
        box,
        { state: 'none', diagonals, fill: { state: 'solid', color: '#123456' } },
        20,
      ),
      false,
    );
    assert.deepEqual(ctx.calls, []);
  }
  for (const badBox of [
    { ...box, width: 0 },
    { ...box, y: NaN },
    { ...box, y: Number.MAX_VALUE, height: Number.MAX_VALUE },
  ]) {
    const ctx = canvas();
    assert.equal(paintTableBorder(ctx, badBox, { state: 'none', diagonals: [good] }, 20), false);
    assert.deepEqual(ctx.calls, []);
  }
  for (const stroke of [null, { edge: 4, width: 1, color: '#123456' }]) {
    const ctx = canvas();
    assert.equal(
      paintTableBorder(
        ctx,
        box,
        {
          state: 'strokes',
          strokes: [stroke],
          diagonals: [good],
          fill: { state: 'solid', color: '#123456' },
        },
        20,
      ),
      false,
    );
    assert.deepEqual(ctx.calls, []);
  }
  const ctx = canvas();
  assert.equal(paintTableDiagonals(ctx, box, [good], Infinity), false);
  assert.deepEqual(ctx.calls, []);
});
test('clip and stroke exceptions unwind every painter save and preserve caller ownership', () => {
  const plan = tableBorderPaintPlan(source('CENTER', 'CENTER'));
  for (const failure of ['clip', 'stroke']) {
    const ctx = canvas(failure);
    assert.throws(() => paintTableBorder(ctx, box, plan, 20), new RegExp(failure));
    assert.equal(ctx.stack.length, 0);
    assert.equal(
      ctx.calls.filter((c) => c[0] === 'save').length,
      ctx.calls.filter((c) => c[0] === 'restore').length,
    );
  }
});

test('supported diagonal, source fill and four edges paint together without leaking cell clip', () => {
  const plan = tableBorderPaintPlan(withSolidFill(source('CENTER', 'CENTER')));
  const ctx = canvas();
  assert.equal(paintTableBorder(ctx, box, plan, 20), true);
  const paints = ctx.calls.filter((c) => ['fill', 'stroke'].includes(c[0]));
  assert.equal(paints[0][0], 'fill');
  const lines = paints.slice(1);
  assert.equal(lines.length, 6);
  assert.deepEqual(
    lines.map((c) => c[5]),
    ['#2973a1', '#2973a1', '#123456', '#123456', '#123456', '#123456'],
  );
  assert.deepEqual(
    lines.map((c) => c[7]),
    [['parent', 'cell'], ['parent', 'cell'], ['parent'], ['parent'], ['parent'], ['parent']],
  );
  assert.equal(ctx.stack.length, 0);
});

// Execute the production table-box paint closure with synthetic Source and a recording
// Canvas context. This is focused renderer source evidence, not browser/raster E2E.
const rendererSource = readFileSync(
  new URL('../../web/preview/renderer.mjs', import.meta.url),
  'utf8',
);
const coverageStart = rendererSource.indexOf('    layout.tableBorderCoverage = {');
const coverageEnd = rendererSource.indexOf("    ctx.fillStyle = '#bad9f4';", coverageStart);
assert(coverageStart >= 0 && coverageEnd > coverageStart);
const bindTableBoxPainter = Function(
  'layout',
  'ctx',
  'height',
  'viewport',
  'displayOptions',
  'tableBoxPaintBounds',
  'tableBorderPlanForBox',
  'tableBorders',
  'pictureStatus',
  'paintPendingPicture',
  'paintRowTransform',
  'paintTableBackground',
  'paintTableBorder',
  rendererSource.slice(coverageStart, coverageEnd) + '\nreturn paintTableBox;',
);
function rendererTableFixture(
  styles,
  { painter = paintTableBorder, transform = paintRowTransform } = {},
) {
  const ctx = canvas(),
    layout = {};
  const boxes = styles.map((_, i) => ({ ...box, section: 0, tableNode: 2, listNode: i + 3 }));
  const index = tableBorderPaintIndex({
    tableBorderSources: [
      {
        sourceOnly: true,
        section: 0,
        styles,
        cells: boxes.map((b, i) => ({
          table_node: b.tableNode,
          list_node: b.listNode,
          style_index: i,
        })),
      },
    ],
  });
  const paint = bindTableBoxPainter(
    layout,
    ctx,
    200,
    { scrollTop: 20 },
    { showTableGrid: false },
    tableBoxPaintBounds,
    tableBorderPlanForBox,
    index,
    () => null,
    () => {
      throw Error('UnexpectedPicture');
    },
    transform,
    paintTableBackground,
    painter,
  );
  return { ctx, boxes, paint, coverage: layout.tableBorderCoverage };
}
test('renderer counts supported diagonal-only cells as source and explicit empty cells as none', () => {
  const cross = source('CENTER', 'CENTER');
  cross.edges.forEach((e) => {
    e.style = 'NONE';
  });
  const empty = source();
  empty.edges.forEach((e) => {
    e.style = 'NONE';
  });
  const f = rendererTableFixture([cross, empty]);
  f.boxes.forEach((box) => f.paint(box));
  assert.deepEqual(f.coverage, {
    none: 1,
    source: 1,
    proxy: 0,
    partial: 0,
    diagonalUnavailableCount: 0,
    paintFailureCount: 0,
    unavailableCount: 0,
    unavailable: [],
  });
  assert.equal(f.ctx.calls.filter((c) => c[0] === 'stroke').length, 2);
});
test('renderer reports unsupported diagonal and paints all four edges plus fill only as partial coverage', () => {
  const f = rendererTableFixture([withSolidFill({ ...source('CENTER'), slash_crooked: '1' })]);
  f.paint(f.boxes[0]);
  assert.deepEqual(f.coverage, {
    none: 0,
    source: 0,
    proxy: 0,
    partial: 1,
    diagonalUnavailableCount: 1,
    paintFailureCount: 0,
    unavailableCount: 1,
    unavailable: [
      {
        section: 0,
        tableNode: 2,
        listNode: 3,
        error: 'UnsupportedTableDiagonalShape',
        component: 'diagonal',
      },
    ],
  });
  const painted = f.ctx.calls.filter((c) => ['fill', 'stroke'].includes(c[0]));
  assert.equal(painted[0][0], 'fill');
  assert.equal(painted[0].at(-1), '#a17329');
  assert.equal(painted.filter((c) => c[0] === 'stroke').length, 4);
  assert.equal(f.ctx.stack.length, 0);
});
test('renderer legacy missing scalars keep sibling paint but never count unknown geometry as complete', () => {
  const legacy = withSolidFill(source());
  for (const key of [
    'slash_crooked',
    'slash_is_counter',
    'back_slash_crooked',
    'back_slash_is_counter',
  ])
    delete legacy[key];
  const f = rendererTableFixture([legacy]);
  f.paint(f.boxes[0]);
  assert.equal(f.coverage.partial, 1);
  assert.equal(f.coverage.source, 0);
  assert.equal(f.coverage.none, 0);
  assert.equal(f.coverage.diagonalUnavailableCount, 1);
  assert.equal(f.coverage.unavailable[0].error, 'UnsupportedTableDiagonalShape');
  assert.equal(f.ctx.calls.filter((c) => c[0] === 'stroke').length, 4);
  assert.equal(f.ctx.calls.filter((c) => c[0] === 'fill').length, 1);
});
test('renderer bounds diagnostic detail to 100 while retaining every incomplete cell count', () => {
  const raw = {
    ...source('CENTER'),
    diagonal: { style: 'DOUBLE_SLIM', width: '0.5 mm', color: '#2973a1' },
  };
  const f = rendererTableFixture(Array.from({ length: 105 }, () => raw));
  f.boxes.forEach((box) => f.paint(box));
  assert.equal(f.coverage.partial, 105);
  assert.equal(f.coverage.diagonalUnavailableCount, 105);
  assert.equal(f.coverage.unavailableCount, 105);
  assert.equal(f.coverage.unavailable.length, 100);
  assert.equal(f.coverage.source, 0);
  assert.equal(f.coverage.none, 0);
  assert.ok(
    f.coverage.unavailable.every(
      (d) => d.error === 'UnsupportedTableDiagonalStroke' && d.component === 'diagonal',
    ),
  );
  assert.equal(f.coverage.unavailable.at(-1).listNode, 102);
});
test('renderer verifies painter result separately from transform acceptance without double counting diagnostics', () => {
  for (const raw of [source(), { ...source('CENTER'), slash_crooked: '1' }]) {
    for (const options of [{ painter: () => false }, { transform: () => false }]) {
      const f = rendererTableFixture([raw], options);
      f.paint(f.boxes[0]);
      assert.equal(f.coverage.source, 0);
      assert.equal(f.coverage.none, 0);
      assert.equal(f.coverage.partial, 0);
      assert.equal(f.coverage.paintFailureCount, 1);
      assert.equal(f.coverage.unavailableCount, 1);
      assert.equal(f.coverage.unavailable.length, 1);
      assert.equal(f.ctx.stack.length, 0);
      assert.equal(
        f.coverage.unavailable[0].error,
        raw.slash_crooked === '1' ? 'UnsupportedTableDiagonalShape' : 'TableBorderPaintFailed',
      );
    }
  }
});
test('renderer keeps orthogonal rejection and proxy coverage distinct from partial diagonal coverage', () => {
  const bad = withSolidFill(source());
  bad.edges[0].style = 'DOUBLE';
  const f = rendererTableFixture([bad, source()]);
  f.paint(f.boxes[0]);
  f.paint({ ...f.boxes[1], createdCell: true });
  assert.equal(f.coverage.unavailableCount, 1);
  assert.equal(f.coverage.unavailable[0].error, 'UnsupportedTableBorderPaint');
  assert.equal(f.coverage.diagonalUnavailableCount, 0);
  assert.equal(f.coverage.partial, 0);
  assert.equal(f.coverage.source, 0);
  assert.equal(f.coverage.none, 0);
  assert.equal(f.coverage.proxy, 1);
  assert.equal(f.ctx.calls.filter((c) => c[0] === 'fill').length, 5);
});

import { hwp5TableBorderPaintPlan } from '../../web/preview/hwp5-table-border-plan.mjs';

for (const [slash, back, directions] of [
  ['CENTER', 'NONE', ['rising']],
  ['NONE', 'CENTER', ['falling']],
  ['CENTER', 'CENTER', ['rising', 'falling']],
])
  test('unsupported HWPX outer stroke preserves independently known diagonal ' + directions, () => {
    for (const patch of [{ style: 'DASH' }, { width: 'unknown' }, { color: 'unknown' }]) {
      const raw = withSolidFill(source(slash, back));
      Object.assign(raw.edges[0], patch);
      const before = structuredClone(raw),
        plan = tableBorderPaintPlan(raw);
      assert.equal(plan.state, 'unavailable');
      assert.equal(plan.error, 'UnsupportedTableBorderPaint');
      assert.equal(plan.diagonalDiagnostic, undefined);
      assert.equal(plan.strokes, undefined);
      assert.deepEqual(
        plan.diagonals.map((s) => s.direction),
        directions,
      );
      for (const stroke of plan.diagonals) {
        assert.equal(stroke.color, '#2973a1');
        assert.equal(stroke.width, (0.5 * 96) / 25.4);
      }
      assert.equal(plan.fill.state, 'solid');
      assert.deepEqual(raw, before);
    }
  });

test('HWPX partial diagonal preservation keeps fill, effect, structure and unknown shape guards', () => {
  for (const patch of [
    { unknown_attributes: 1 },
    { unknown_children: 1 },
    { three_d: '1' },
    { shadow: '1' },
    { three_d: undefined },
    { shadow: undefined },
    { edges: null },
    { fill_node: 2, fill_report: { brushes: [], nodes: [] } },
    { slash_crooked: undefined },
    { slash_crooked: '1' },
    { slash_is_counter: '1' },
    { center_line: 'VERTICAL' },
    { slash: 'ALL' },
    { diagonal: { style: 'DOUBLE_SLIM', width: '0.5 mm', color: '#2973a1' } },
    { diagonal: { style: 'NONE' } },
    { diagonal: null },
  ]) {
    const raw = source('CENTER', 'CENTER');
    raw.edges[0].style = 'DASH';
    Object.assign(raw, patch);
    const plan = tableBorderPaintPlan(raw);
    assert.equal(plan.state, 'unavailable');
    assert.equal(plan.diagonals, undefined);
    assert.equal(plan.diagonalDiagnostic, undefined);
  }
  const none = source();
  none.edges[0].style = 'DASH';
  assert.equal(tableBorderPaintPlan(none).diagonals, undefined);
});

// New partial-source branch has an explicit diagonal painter dependency. Existing
// production-closure tests above remain unchanged and still cover the old paths.
const bindPartialTableBoxPainter = Function(
  'layout',
  'ctx',
  'height',
  'viewport',
  'displayOptions',
  'tableBoxPaintBounds',
  'tableBorderPlanForBox',
  'tableBorders',
  'pictureStatus',
  'paintPendingPicture',
  'paintRowTransform',
  'paintTableBackground',
  'paintTableBorder',
  'paintTableDiagonals',
  rendererSource.slice(coverageStart, coverageEnd) + '\nreturn paintTableBox;',
);
function partialSourceFixture(
  plan,
  { transform = paintRowTransform, diagonalPainter = paintTableDiagonals, fail } = {},
) {
  const ctx = canvas(fail),
    layout = {},
    box = { section: 0, tableNode: 2, listNode: 3, x: 10, y: 100, width: 80, height: 40 },
    index = { available: true, cells: new Map([['0:2:3', plan]]) };
  const paint = bindPartialTableBoxPainter(
    layout,
    ctx,
    200,
    { scrollTop: 20 },
    { showTableGrid: false },
    tableBoxPaintBounds,
    tableBorderPlanForBox,
    index,
    () => null,
    () => {
      throw Error('UnexpectedPicture');
    },
    transform,
    paintTableBackground,
    paintTableBorder,
    diagonalPainter,
  );
  return { ctx, box, paint, coverage: layout.tableBorderCoverage };
}
function hwp5PartialSource(attributes = 0x48) {
  return {
    id: 1,
    attributes,
    fill_known: true,
    fill_flags: 1,
    unknown_fill_bytes: null,
    extra_bytes: 0,
    additional_bytes: 0,
    pattern: { background: 0x563412, foreground: 0, kind: -1 },
    image: null,
    gradient: null,
    alpha: null,
    borders: Array.from({ length: 5 }, (_, i) => ({
      kind: i === 0 ? 2 : 1,
      width: i === 4 ? 7 : 0,
      color: i === 4 ? 0xa17329 : 0x563412,
    })),
  };
}
for (const format of ['hwp5', 'hwpx'])
  test(
    format +
      ' actual renderer preserves known diagonal clip/endpoints and partial outer diagnostic',
    () => {
      const raw = withSolidFill(source('CENTER', 'CENTER'));
      raw.edges[0].style = 'DASH';
      const plan =
        format === 'hwp5'
          ? hwp5TableBorderPaintPlan(hwp5PartialSource())
          : tableBorderPaintPlan(raw);
      let transforms = 0;
      const f = partialSourceFixture(plan, {
        transform(...args) {
          transforms++;
          return paintRowTransform(...args);
        },
      });
      f.paint(f.box);
      const paints = f.ctx.calls.filter((c) => ['fill', 'stroke'].includes(c[0]));
      assert.equal(paints[0][0], 'fill');
      assert.deepEqual(
        paints.filter((c) => c[0] === 'stroke').map((c) => c.slice(1, 5)),
        [
          [10, 120, 90, 80],
          [10, 80, 90, 120],
        ],
      );
      assert.ok(
        paints
          .filter((c) => c[0] === 'stroke')
          .every((c) => c[5] === '#2973a1' && c[6] === (0.5 * 96) / 25.4),
      );
      assert.deepEqual(
        paints.filter((c) => c[0] === 'stroke').map((c) => c[7]),
        [
          ['parent', 'cell'],
          ['parent', 'cell'],
        ],
      );
      assert.equal(transforms, 2); // Independent background, then diagonal, through the production row transform.
      assert.equal(f.coverage.partial, 1);
      assert.equal(f.coverage.source, 0);
      assert.equal(f.coverage.none, 0);
      assert.equal(f.coverage.paintFailureCount, 0);
      assert.equal(f.coverage.unavailableCount, 1);
      assert.equal(
        f.coverage.unavailable[0].error,
        format === 'hwp5' ? 'UnsupportedHwp5TableBorder' : 'UnsupportedTableBorderPaint',
      );
      assert.equal(f.ctx.stack.length, 0);
    },
  );

test('partial diagonal renderer reports callback false, rejected transform and Canvas exceptions without false completion', () => {
  const raw = withSolidFill(source('CENTER', 'CENTER'));
  raw.edges[0].style = 'DASH';
  const plan = tableBorderPaintPlan(raw);
  for (const options of [
    { diagonalPainter: () => false },
    { transform: () => false },
    { fail: 'clip' },
    { fail: 'stroke' },
  ]) {
    const f = partialSourceFixture(plan, options);
    f.paint(f.box);
    assert.equal(f.coverage.partial, 0);
    assert.equal(f.coverage.source, 0);
    assert.equal(f.coverage.none, 0);
    assert.equal(f.coverage.paintFailureCount, 1);
    assert.equal(f.coverage.unavailableCount, 1);
    assert.deepEqual(
      f.coverage.unavailable.map((d) => d.error),
      ['UnsupportedTableBorderPaint'],
    );
    assert.equal(f.ctx.stack.length, 0);
  }
});
