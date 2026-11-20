import test from 'node:test';
import assert from 'node:assert/strict';
import { chartDisplayOwnerLimits } from '../../js/chart-display-owner-limits.mjs';
function oracle(plots, axes) {
  return new Map(
    plots.map((owner) => [
      owner.node,
      Math.min(
        Infinity,
        ...plots
          .filter((v) => v.area_node === owner.area_node && v.node > owner.node)
          .map((v) => v.node),
        ...axes
          .filter((v) => v.area_node === owner.area_node && v.node > owner.node)
          .map((v) => v.node),
      ),
    ]),
  );
}
test('chart data owner index equals old nested predicate for shuffled axes, aliases, areas and uint limits', () => {
  for (const [plots, axes] of [
    [[], []],
    [[{ node: 2, area_node: 0 }], []],
    [
      [
        { node: 10, area_node: 1 },
        { node: 100, area_node: 1 },
      ],
      [
        { node: 50, area_node: 1 },
        { node: 11, area_node: 2 },
      ],
    ],
    [
      [
        { node: 10, area_node: 1 },
        { node: 100, area_node: 1 },
      ],
      [
        { node: 100, area_node: 1 },
        { node: 10, area_node: 1 },
      ],
    ],
    [[{ node: 0xfffffffe, area_node: 0 }], [{ node: 0xffffffff, area_node: 0 }]],
    [
      [
        { node: 0x80000000, area_node: 0 },
        { node: 0xffffffff, area_node: 0 },
      ],
      [{ node: 0x80000001, area_node: 0 }],
    ],
  ]) {
    const before = structuredClone({ plots, axes });
    assert.deepEqual(chartDisplayOwnerLimits(plots, axes), oracle(plots, axes));
    assert.deepEqual({ plots, axes }, before);
  }
});
test('chart data owner index retains exact interval acceptance across independent deterministic cases', () => {
  let state = 741;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let trial = 0; trial < 100; trial++) {
    const plots = Array.from({ length: 20 }, (_, i) => ({
      node: i * 100 + 20,
      area_node: random() % 7,
    }));
    const axes = Array.from({ length: 50 }, () => ({
      node: random() % 2100,
      area_node: random() % 7,
    }));
    const actual = chartDisplayOwnerLimits(plots, axes),
      expected = oracle(plots, axes);
    assert.deepEqual(actual, expected);
    for (const owner of plots)
      for (const claim of [owner.node + 1, owner.node + 99, 0xffffffff])
        assert.equal(claim < actual.get(owner.node), claim < expected.get(owner.node));
  }
});
test('large chart owner indexing reads each input once and calls neither sort nor indexOf', () => {
  let reads = 0;
  const make = (node, area) => ({
    get node() {
      reads++;
      return node;
    },
    get area_node() {
      reads++;
      return area;
    },
  });
  const plots = Array.from({ length: 20000 }, (_, i) => make(i * 10 + 2, i % 23));
  const axes = Array.from({ length: 20000 }, (_, i) =>
    make((19999 - i) * 10 + 5, (19999 - i) % 23),
  );
  const sort = Array.prototype.sort,
    indexOf = Array.prototype.indexOf;
  let result;
  try {
    Array.prototype.sort = () => {
      throw Error('sort forbidden');
    };
    Array.prototype.indexOf = () => {
      throw Error('indexOf forbidden');
    };
    result = chartDisplayOwnerLimits(plots, axes);
  } finally {
    Array.prototype.sort = sort;
    Array.prototype.indexOf = indexOf;
  }
  assert.equal(reads, (plots.length + axes.length) * 2);
  assert.equal(result.size, plots.length);
  assert.equal(result.get(2), 5);
});
