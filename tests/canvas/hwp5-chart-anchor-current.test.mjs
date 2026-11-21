import test from 'node:test';
import assert from 'node:assert/strict';
import {
  currentHwp5ChartTarget,
  sameHwp5ChartOwner,
} from '../../web/preview/hwp5-chart-resources.mjs';
import { objectActivationTarget } from '../../web/preview/object-activation-target.mjs';
const nativeOwner = {
  control_node: 9,
  component_node: 10,
  ole_node: 11,
  paragraph_node: 0,
  paragraph: 0,
  current_unit: 29,
  geometry: { instance_id: 1, width: 20000, height: 12000 },
};
const row = {
  kind: 'hwp5-chart',
  section: 0,
  controlNode: 9,
  componentNode: 10,
  oleNode: 11,
  physicalParagraphNode: 0,
  paragraph: 0,
  anchorUnit: 15,
  owner: nativeOwner,
  sourceEpoch: '16',
  historyRevision: 14,
  resource: { physical_id: 1, resource_sha256: Array(32).fill(9) },
};
const base = {
  format: 'hwp5',
  hwp5ChartDisplayAvailable: true,
  hwp5ChartSourceEpoch: '16',
  hwp5ChartHistoryRevision: 14,
  hwp5ChartTargets: [row],
  paragraphs: [
    {
      section: 0,
      paragraph: 0,
      text: '\ufffc\ufffcH5_CHART_9235\ufffc',
      sourceOffsets: [
        { at: 0, source: 0 },
        { at: 1, source: 8 },
        { at: 2, source: 16 },
        { at: 16, source: 37 },
      ],
    },
  ],
};
const captures = [{ trusted: true, content: base }];
const fixture = () => structuredClone(captures[0].content);
const target = { kind: 'hwp5-chart', section: 0, controlNode: 9 };
const query = (content, extra = {}) =>
  objectActivationTarget(
    {
      content,
      layout: {},
      charts: [
        {
          x: 100,
          y: 100,
          width: 20000 / 75,
          height: 12000 / 75,
          target: content.hwp5ChartTargets[0],
          provisional: false,
          ...extra,
        },
      ],
    },
    150,
    150,
  );
test('Native source current29 maps through two prefix controls to displayed15 without owner mutation', () => {
  for (const observation of captures) {
    const c = observation.content,
      t = c.hwp5ChartTargets[0];
    assert.equal(observation.trusted, true);
    assert.equal(t.owner.current_unit, 29);
    assert.equal(t.anchorUnit, 15);
    assert.equal(c.paragraphs[0].text, '\ufffc\ufffcH5_CHART_9235\ufffc');
    const old = structuredClone(t.owner);
    assert.equal(currentHwp5ChartTarget(c, target), t);
    assert.deepEqual(t.owner, old);
  }
});
test('synthetic explicit frame selects the captured current HWP5 owner', () => {
  assert.deepEqual(query(fixture()), target);
});
test('provisional value, different Native owner and a missed frame never activate', () => {
  const c = fixture();
  assert.equal(query(c, { provisional: true }), null);
  const old = structuredClone(c.hwp5ChartTargets[0]);
  old.owner.geometry.instance_id++;
  assert.equal(query(c, { target: old }), null);
  assert.equal(
    objectActivationTarget(
      {
        content: c,
        layout: {},
        charts: [{ x: 100, y: 100, width: 200, height: 160, target: c.hwp5ChartTargets[0] }],
      },
      1,
      1,
    ),
    null,
  );
});
test('invalid offsets, wrong raw current unit and missing marker reject rather than grant identity', () => {
  for (const mutate of [
    (c) => delete c.paragraphs[0].sourceOffsets,
    (c) => c.paragraphs[0].sourceOffsets[1].source++,
    (c) => c.hwp5ChartTargets[0].owner.current_unit--,
    (c) => (c.paragraphs[0].text = c.paragraphs[0].text.slice(0, -1) + 'x'),
  ]) {
    const c = fixture();
    mutate(c);
    assert.equal(currentHwp5ChartTarget(c, target), null);
  }
});
test('epoch/history mismatches, duplicates and other Native owner fields remain fenced', () => {
  for (const mutate of [
    (c) => (c.hwp5ChartTargets[0].sourceEpoch = 'stale'),
    (c) => c.hwp5ChartTargets[0].historyRevision++,
    (c) => c.hwp5ChartTargets.push(structuredClone(c.hwp5ChartTargets[0])),
    (c) => c.hwp5ChartTargets[0].owner.component_node++,
  ]) {
    const c = fixture();
    mutate(c);
    assert.equal(currentHwp5ChartTarget(c, target), null);
  }
  const c = fixture(),
    owner = c.hwp5ChartTargets[0].owner,
    other = structuredClone(owner);
  other.geometry.height++;
  assert.equal(sameHwp5ChartOwner(owner, other), false);
});

test('zero-prefix old anchor maps source0 to display0', () => {
  const c = fixture(),
    r = c.hwp5ChartTargets[0];
  r.anchorUnit = r.owner.current_unit = 0;
  c.paragraphs[0].text = '\ufffc';
  c.paragraphs[0].sourceOffsets = [
    { at: 0, source: 0 },
    { at: 1, source: 8 },
  ];
  assert.equal(currentHwp5ChartTarget(c, target), r);
});
test('noninteger source offsets and an interior raw control unit cannot grant an anchor', () => {
  for (const mutate of [
    (c) => (c.paragraphs[0].sourceOffsets[1].source = '8'),
    (c) => (c.hwp5ChartTargets[0].owner.current_unit = 30),
  ]) {
    const c = fixture();
    mutate(c);
    assert.equal(currentHwp5ChartTarget(c, target), null);
  }
});
