import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tableBorderPaintPlan,
  tableBorderPaintIndex,
  tableBorderPlanForBox,
} from '../../web/preview/table-border-plan.mjs';
import { paintTableBorder } from '../../web/preview/table-border-paint.mjs';
const source = () => ({
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
  edges: Array.from({ length: 4 }, () => ({ style: 'NONE', width: '0.12 mm', color: '#000000' })),
});
test('table solid fill retains exact header owner and paints before strokes', () => {
  const style = {
    ...source(),
    node: 4,
    fill_node: 8,
    fill_report: {
      brushes: [
        {
          part_kind: 'header',
          section_ordinal: null,
          element_index: 8,
          parent_element_index: 4,
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
          non_six_hex_colors: 0,
          raw: ['#123456', null, null, '0'],
        },
      ],
    },
  };
  const before = structuredClone(style),
    plan = tableBorderPaintPlan(style);
  assert.deepEqual(plan, { state: 'none', fill: { state: 'solid', color: '#123456' } });
  const compound = structuredClone(style);
  compound.edges[0] = { style: 'DOUBLE', width: '0.12 mm', color: '#000000' };
  assert.deepEqual(tableBorderPaintPlan(compound), {
    state: 'unavailable',
    error: 'UnsupportedTableBorderPaint',
    fill: { state: 'solid', color: '#123456' },
  });
  for (const patch of [{ shadow: '1' }, { three_d: '1' }]) {
    const decorated = { ...structuredClone(style), ...patch };
    assert.deepEqual(tableBorderPaintPlan(decorated), {
      state: 'unavailable',
      error: 'UnsupportedTableBorderPaint',
      fill: { state: 'solid', color: '#123456' },
    });
  }
  // Unsupported diagonal geometry is a separate diagnostic: verified fill and
  // ordinary edges survive. 3D/shadow effects above still reject the border plan.
  for (const patch of [
    { center_line: 'HORIZONTAL' },
    { slash: 'SLASH' },
    { back_slash: 'BACK_SLASH' },
  ]) {
    const decorated = { ...structuredClone(style), ...patch };
    decorated.edges[0] = { style: 'SOLID', width: '0.12 mm', color: '#2973a1' };
    assert.deepEqual(tableBorderPaintPlan(decorated), {
      state: 'strokes',
      strokes: [{ edge: 0, width: (0.12 * 96) / 25.4, color: '#2973a1' }],
      fill: { state: 'solid', color: '#123456' },
      diagonalDiagnostic: { state: 'unsupported', reason: 'UnsupportedTableDiagonalShape' },
    });
  }
  const calls = [],
    ctx = {
      save() {
        calls.push('save');
      },
      restore() {
        calls.push('restore');
      },
      fillRect(...args) {
        calls.push(args);
      },
    };
  assert.equal(paintTableBorder(ctx, { x: 3, y: 40, width: 90, height: 20 }, plan, 7), true);
  assert.equal(ctx.fillStyle, '#123456');
  assert.deepEqual(calls, ['save', [3, 33, 90, 20], 'restore']);
  for (const mutate of [
    (s) => s.fill_report.brushes[0].parent_element_index++,
    (s) => (s.fill_report.brushes[0].part_kind = 'section'),
    (s) => (s.fill_report.nodes[0].raw[3] = '50'),
    (s) => (s.fill_report.nodes[0].raw[2] = 'HORIZONTAL'),
    (s) => (s.fill_report.nodes[0].brush_index = 1),
  ]) {
    const invalid = structuredClone(style);
    mutate(invalid);
    assert.equal(tableBorderPaintPlan(invalid).state, 'unavailable');
    assert.notEqual(tableBorderPaintPlan({ ...invalid, shadow: '1' }).fill?.state, 'solid');
  }
  for (const patch of [{ unknown_attributes: 1 }, { unknown_children: 1 }])
    assert.equal(tableBorderPaintPlan({ ...style, ...patch }).fill, undefined);
  assert.deepEqual(style, before);
  const throwing = {
    save() {},
    restore() {
      calls.push('restored');
    },
    fillRect() {
      throw Error('fill');
    },
  };
  assert.throws(
    () => paintTableBorder(throwing, { x: 0, y: 0, width: 10, height: 10 }, plan, 0),
    /fill/,
  );
  assert.equal(calls.at(-1), 'restored');
});
test('source table borders keep inactive diagonal defaults and refuse unproven paint', () => {
  assert.deepEqual(tableBorderPaintPlan(source()), { state: 'none' });
  for (const patch of [
    { unknown_attributes: undefined },
    { unknown_attributes: 1 },
    { unknown_children: 1 },
    { fill_node: 9 },
    { shadow: '1' },
    { three_d: null },
  ])
    assert.equal(tableBorderPaintPlan({ ...source(), ...patch }).state, 'unavailable');
  // Unknown/missing diagonal shape must remain visible as a diagnostic even
  // when the independent orthogonal plan correctly contains no strokes.
  for (const patch of [{ slash: 'SLASH' }, { center_line: null }])
    assert.deepEqual(tableBorderPaintPlan({ ...source(), ...patch }), {
      state: 'none',
      diagonalDiagnostic: { state: 'unsupported', reason: 'UnsupportedTableDiagonalShape' },
    });
  for (const edge of [
    { style: 'DOUBLE' },
    { style: 'SOLID', width: '0.1 cm', color: '#000000' },
    { style: 'SOLID', width: '0 mm', color: '#000000' },
    { style: 'SOLID', width: '0.1 mm', color: 'unknown' },
  ]) {
    const value = source();
    value.edges[0] = edge;
    assert.equal(tableBorderPaintPlan(value).state, 'unavailable');
  }
  const content = {
    tableBorderSources: [
      {
        sourceOnly: true,
        section: 0,
        cells: [{ table_node: 1, list_node: 4, style_index: 0 }],
        styles: [source()],
      },
    ],
  };
  assert.equal(
    tableBorderPlanForBox(tableBorderPaintIndex(content), { section: 0, tableNode: 1, listNode: 4 })
      .state,
    'none',
  );
  assert.equal(
    tableBorderPlanForBox(tableBorderPaintIndex(content), { section: 1, tableNode: 1, listNode: 4 })
      .state,
    'unavailable',
  );
  assert.equal(tableBorderPlanForBox(tableBorderPaintIndex({}), {}).state, 'proxy');
});
test('solid table border paint uses millimeters source colors one scroll and balanced state', () => {
  const value = source();
  value.edges[0] = { style: 'SOLID', width: '0.12 mm', color: '#123456' };
  const plan = tableBorderPaintPlan(value),
    calls = [],
    box = { x: 10, y: 30, width: 100, height: 40 };
  assert.equal(plan.state, 'strokes');
  assert.equal(plan.strokes[0].width, (0.12 * 96) / 25.4);
  const ctx = new Proxy(
    {},
    {
      set(target, key, value) {
        target[key] = value;
        calls.push([key, value]);
        return true;
      },
      get(target, key) {
        return target[key] ?? ((...args) => calls.push([key, ...args]));
      },
    },
  );
  assert.equal(paintTableBorder(ctx, box, plan, 5), true);
  assert(calls.some((c) => c[0] === 'moveTo' && c[1] === 10 && c[2] === 25));
  assert(calls.some((c) => c[0] === 'lineTo' && c[1] === 10 && c[2] === 65));
  assert.equal(calls.filter((c) => c[0] === 'stroke').length, 1);
  assert.equal(calls[0][0], 'save');
  assert.equal(calls.at(-1)[0], 'restore');
  calls.length = 0;
  assert.equal(paintTableBorder(ctx, box, { state: 'none' }, 5), true);
  assert.equal(calls.length, 0);
  const throwing = {
    save() {},
    restore() {
      calls.push(['restored']);
    },
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      throw new Error('paint');
    },
  };
  assert.throws(() => paintTableBorder(throwing, box, plan, 5), /paint/);
  assert.deepEqual(calls, [['restored']]);
});
