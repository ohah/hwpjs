import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chartMajorTickPolicy,
  chartMajorTickSegments,
} from '../../web/preview/chart-major-ticks.mjs';
const field = (value, node = 1000) => ({ node, value });
const layout = {
  plot: { x: 10, y: 10, width: 100, height: 80 },
  ticks: [{ fraction: 0 }, { fraction: 0.5 }, { fraction: 1 }],
  categories: [{ fraction: 0.25 }, { fraction: 0.75 }],
  axes_hidden: { value: false, category: false },
};
const primitive = (kind = 'out', direction = 'col') => ({
  direction,
  major_tick_marks: { value: field(kind), category: field(kind, 1001) },
  major_tick_positions:
    direction === 'bar' ? { value: 'b', category: 'l' } : { value: 'l', category: 'b' },
});
const snapshot = () => structuredClone(layout);
test('four source policies keep legacy absent unknown none distinct', () => {
  assert.deepEqual(
    [undefined, null, field(null), field('none')].map((v) => chartMajorTickPolicy(v).state),
    ['legacy', 'absent', 'unknown', 'explicit'],
  );
  for (const bad of [false, {}, field('future'), field('out', -1), field('out', 2 ** 32)])
    assert.equal(chartMajorTickPolicy(bad).state, 'invalid');
  for (const v of [undefined, null, field(null), field('none')])
    assert.equal(
      chartMajorTickSegments(layout, {
        direction: 'col',
        major_tick_marks: { value: v, category: v },
      }).segments.length,
      0,
    );
});
test('out in cross geometry is explicit and input order and originals remain untouched', () => {
  const before = structuredClone(layout);
  for (const kind of ['out', 'in', 'cross']) {
    const p = primitive(kind),
      saved = structuredClone(p),
      r = chartMajorTickSegments(layout, p);
    assert.equal(r.state, 'ready');
    assert.equal(r.segments.length, 5);
    assert.equal(r.exact, false);
    const value = r.segments[1],
      cat = r.segments[3];
    assert.equal(value.y1, 40);
    assert.equal(value.y2, 40);
    assert.equal(value.x1, kind === 'in' ? 0 : -4);
    assert.equal(value.x2, kind === 'out' ? 0 : 4);
    assert.equal(cat.y1, kind === 'out' ? 80 : 76);
    assert.equal(cat.y2, kind === 'in' ? 80 : 84);
    assert.deepEqual(p, saved);
  }
  assert.deepEqual(layout, before);
});
test('horizontal and reversed tick fractions and negative domain never clamp or infer crossing', () => {
  const l = snapshot();
  l.ticks.reverse();
  l.categories.reverse();
  const r = chartMajorTickSegments(l, primitive('out', 'bar'));
  assert.deepEqual(
    r.segments.slice(0, 3).map((x) => x.x1),
    [100, 50, 0],
  );
  assert.deepEqual(
    r.segments.slice(3).map((x) => x.y1),
    [20, 60],
  );
  assert.equal(r.placement, 'preview-axis-edges');
});
test('hidden axes one point and invalid zero dimensions fail closed without partial segments', () => {
  const unsupported = primitive();
  unsupported.major_tick_positions.value = 'r';
  const blocked = chartMajorTickSegments(layout, unsupported);
  assert.equal(blocked.policies.value.state, 'unsupported_position');
  assert.equal(blocked.segments.filter((x) => x.axis === 'value').length, 0);
  const l = snapshot();
  l.ticks = [{ fraction: 0.5 }];
  l.categories = [];
  assert.equal(chartMajorTickSegments(l, primitive()).segments.length, 1);
  l.axes_hidden.value = true;
  assert.equal(chartMajorTickSegments(l, primitive()).segments.length, 0);
  for (const width of [0, -1, NaN, Infinity]) {
    const x = snapshot();
    x.plot.width = width;
    assert.equal(chartMajorTickSegments(x, primitive()).state, 'unavailable');
  }
  for (const fraction of [-1, NaN, Infinity, 1.1]) {
    const x = snapshot();
    x.ticks.push({ fraction });
    const r = chartMajorTickSegments(x, primitive());
    assert.equal(r.state, 'unavailable');
    assert.equal(r.segments, undefined);
  }
});
test('n 2n 4n positions emit exactly one segment per requested tick', () => {
  for (const n of [64, 128, 256]) {
    const l = snapshot();
    l.ticks = Array.from({ length: n }, (_, i) => ({ fraction: i / (n - 1) }));
    l.categories = [];
    assert.equal(chartMajorTickSegments(l, primitive('cross')).segments.length, n);
  }
});
