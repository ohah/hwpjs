import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwp5LiteralGridProjection } from '../../web/preview/hwp5-literal-grid-projection.mjs';
import { createChartPointGrid } from '../../web/preview/chart-point-grid.mjs';
class Element extends EventTarget {
  constructor(tag = 'div') {
    super();
    this.tag = tag;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.value = '';
    this.attributes = new Map();
    this.ownerDocument = { createElement: (tag) => new Element(tag) };
  }
  append(...children) {
    for (const child of children) {
      child.parent = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of this.children) child.parent = null;
    this.children = [];
    this.append(...children);
    this.value = children[0]?.value ?? '';
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name);
  }
  contains(child) {
    for (let node = child; node; node = node.parent) if (node === this) return true;
    return false;
  }
  closest(selector) {
    return this.tag === 'button' && this.dataset.chartGridPoint !== undefined
      ? this
      : this.parent?.closest(selector);
  }
  focus() {
    this.focused = true;
  }
}
const click = (body, target) => {
  const event = new Event('click');
  Object.defineProperty(event, 'target', { value: target });
  body.dispatchEvent(event);
};
function gridElements() {
  return Object.fromEntries(
    ['head', 'body', 'previousRows', 'nextRows', 'previousColumns', 'nextColumns', 'note'].map(
      (key) => [key, new Element()],
    ),
  );
}
const source = () => ({
  categories: ['same', 'same'],
  series: [
    { name: 'duplicate', values: ['001.00', '-2'] },
    { name: 'duplicate', values: ['3', '4'] },
  ],
});
test('H5 matrix preserves original strings and duplicate labels with separate logical addresses', () => {
  const input = source(),
    before = structuredClone(input),
    projection = createHwp5LiteralGridProjection(input);
  const model = projection.projectModel(projection.chart);
  assert.deepEqual(
    model.columns.map((c) => c.label),
    ['범주', 'duplicate', 'duplicate'],
  );
  assert.deepEqual(
    model.rows.map((r) => [...r.cells.values()].flat()),
    [
      [0, 1, 2],
      [3, 4, 5],
    ],
  );
  assert.deepEqual(projection.cellAddress(1), {
    kind: 'value',
    series: 0,
    category: 0,
    expected: '001.00',
  });
  assert.deepEqual(projection.cellAddress(3), { kind: 'category', category: 1, expected: 'same' });
  assert.equal('cache_node' in projection.chart.values.points[1], false);
  assert.deepEqual(input, before);
  input.series[0].values[0] = 'changed';
  assert.equal(projection.chart.values.points[1].value, '001.00');
  assert(Object.isFrozen(projection.cellAddress(1)));
  for (const id of [-1, 0.5, '1', Infinity, 6]) assert.equal(projection.cellAddress(id), null);
  assert.throws(() => projection.projectModel(structuredClone(projection.chart)), /Foreign/);
});
test('H5 projection rejects sparse, ragged, invalid Unicode and over-budget matrices', () => {
  const invalid = [
    { ...source(), categories: [] },
    { ...source(), categories: Array(2) },
    { ...source(), series: Array(1) },
    { ...source(), series: [{ name: 'x', values: ['1'] }] },
    { ...source(), series: [{ name: 'x', values: Array(2) }] },
    { ...source(), categories: ['a', '\ud800'] },
    { ...source(), categories: Array(4097).fill('x') },
    { ...source(), series: Array(65).fill({ name: 'x', values: ['1', '2'] }) },
    {
      categories: Array(4096).fill('x'),
      series: Array(5).fill({ name: 'x', values: Array(4096).fill('1') }),
    },
  ];
  for (const value of invalid)
    assert.throws(() => createHwp5LiteralGridProjection(value), /InvalidHwp5LiteralGrid/);
  const unicode = createHwp5LiteralGridProjection({
    categories: ['\r\n\t\ufffc\u{1f600}'],
    series: [{ name: 's', values: ['1'] }],
  });
  assert.equal(unicode.chart.values.points[0].value, '\r\n\t\ufffc\u{1f600}');
});
test('shared grid pages H5 category/series matrix and retains exact selected logical address', () => {
  const categories = Array.from({ length: 34 }, (_, i) => 'c' + i);
  const projection = createHwp5LiteralGridProjection({
    categories,
    series: Array.from({ length: 9 }, (_, i) => ({
      name: 's' + i,
      values: categories.map((_, j) => `${i}:${j}`),
    })),
  });
  const nodes = gridElements(),
    picks = [];
  let ready = true,
    chart = projection.chart;
  const grid = createChartPointGrid({
    ...nodes,
    getChart: () => chart,
    projectModel: projection.projectModel,
    rowLabel: '범주',
    getSelected: () => 339,
    getDraft: (id) => (id === 339 ? 'draft' : undefined),
    accepts: (kind) => kind === 'hwp5_literal_value',
    ready: () => ready,
    select: (id) => picks.push(projection.cellAddress(id)),
  });
  grid.reveal();
  assert.equal(nodes.head.children[0].children[0].textContent, '범주 번호');
  assert.equal(nodes.body.children.length, 2);
  assert.equal(nodes.head.children[0].children.length, 3);
  const button = nodes.body.children[1].children[2].children[0];
  assert.equal(button.textContent, 'draft');
  assert.equal(button.getAttribute('aria-current'), 'true');
  click(nodes.body, button);
  assert.deepEqual(picks, [{ kind: 'value', series: 8, category: 33, expected: '8:33' }]);
  ready = false;
  grid.refresh();
  click(nodes.body, button);
  assert.equal(picks.length, 1);
  ready = true;
  grid.refresh();
  click(nodes.body, button);
  assert.equal(picks.length, 1);
  chart = null;
  grid.refresh();
  assert.equal(nodes.body.children.length, 0);
  grid.close();
  assert.equal(nodes.body.children.length, 0);
});
test('H5 matrix exact display budget and category cell retain independent non-write address', () => {
  const p = createHwp5LiteralGridProjection({
    categories: Array(4096).fill('x'),
    series: Array(4).fill({ name: 's', values: Array(4096).fill('1') }),
  });
  assert.equal(p.chart.values.points.length, 20480);
  assert.deepEqual(p.cellAddress(20475), { kind: 'category', category: 4095, expected: 'x' });
  assert.deepEqual(p.cellAddress(20479), {
    kind: 'value',
    series: 3,
    category: 4095,
    expected: '1',
  });
});
