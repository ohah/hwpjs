// Synthetic source-observation tests only. No Native, Worker, browser or pixel claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { owner, display } from './chart-display-wire-fixture.mjs';
import { hwp5ChartFrame } from '../../web/preview/hwp5-chart-content.mjs';
import { inlineHwp5ChartIndex } from '../../web/preview/hwp5-chart-layers.mjs';
import {
  createHwp5ChartResources,
  compatibleHwp5ChartPreviewKeys,
  readHwp5ChartPaintResource,
} from '../../web/preview/hwp5-chart-resources.mjs';
function make(width = 20000, height = 12000) {
  const o = owner();
  o.ole_layout = 'spec24';
  o.attributes = 1;
  o.extent_x = 20000;
  o.extent_y = 12000;
  Object.assign(o.geometry, {
    width,
    height,
    original_width: 20000,
    original_height: 12000,
    current_width: width,
    current_height: height,
  });
  const local = {
    section: 2,
    owner_node: o.control_node,
    component_node: o.component_node,
    matrix: [width / 20000, 0, 0, 0, height / 12000, 0],
  };
  const frame = hwp5ChartFrame(o, local, { state: 'modern_chart' });
  const target = {
    kind: 'hwp5-chart',
    section: 2,
    controlNode: o.control_node,
    componentNode: o.component_node,
    owner: o,
    paragraph: 0,
    anchorUnit: 0,
    resource: { physical_id: 1, resource_sha256: Array(32).fill(17) },
    frame,
  };
  const content = {
    format: 'hwp5',
    hwp5ChartDisplayAvailable: true,
    hwp5ChartTargets: [target],
    paragraphs: [{ section: 2, paragraph: 0, text: '\ufffc' }],
    pictures: [],
  };
  const value = display();
  value.owner = o;
  value.section = 2;
  return { o, local, frame, target, content, value };
}
for (const [name, width, height, px, py] of [
  ['width-only', 25000, 12000, 1000 / 3, 160],
  ['height-only', 20000, 15000, 800 / 3, 200],
  ['nonuniform', 25000, 18000, 1000 / 3, 240],
])
  test(`synthetic ${name} uses common frame once while retaining intrinsic source basis`, () => {
    const f = make(width, height);
    assert.equal(f.frame.geometry.width, width);
    assert.equal(f.frame.geometry.height, height);
    assert.equal(f.o.extent_x, 20000);
    assert.equal(f.o.extent_y, 12000);
    assert.equal(f.o.geometry.original_width, 20000);
    assert.equal(f.o.geometry.original_height, 12000);
    const item = inlineHwp5ChartIndex(f.content).get('2:0:0');
    assert(item);
    assert(Math.abs(item.width - px) < 1e-9);
    assert(Math.abs(item.height - py) < 1e-9);
    const bad = structuredClone(f.local);
    bad.matrix[0] = 1;
    bad.matrix[4] = 1;
    assert.throws(
      () => hwp5ChartFrame(f.o, bad, { state: 'modern_chart' }),
      /UnsupportedHwp5ChartTransform/,
    );
  });
test('synthetic unsupported relative transform and missing owner frame remain refused', () => {
  const f = make();
  const unknown = structuredClone(f.o);
  unknown.geometry.component_extra_bytes = 1;
  assert.throws(
    () => hwp5ChartFrame(unknown, f.local, { state: 'modern_chart' }),
    /UnsupportedHwp5ChartTransform/,
  );
  const relative = structuredClone(f.o);
  relative.geometry.flags &= ~(7 << 15);
  assert.throws(
    () => hwp5ChartFrame(relative, f.local, { state: 'modern_chart' }),
    /UnsupportedHwp5ChartSize/,
  );
  assert.throws(
    () => hwp5ChartFrame(f.o, null, { state: 'modern_chart' }),
    /MissingHwp5ChartTransform/,
  );
});
test('synthetic resize retains compatible data only as provisional paint and never current value', async () => {
  let f = make();
  const resources = createHwp5ChartResources({
    current: () => f.content,
    read: async () => f.value,
    onChange() {},
  });
  try {
    await resources.load(2, 4);
    assert(resources.get(2, 4).value);
    f = make(25000, 18000);
    const keys = compatibleHwp5ChartPreviewKeys(f.content, resources);
    assert(keys.has('2:4'));
    resources.refresh(f.content.hwp5ChartTargets, keys);
    assert.equal(resources.get(2, 4).value, null);
    const preview = readHwp5ChartPaintResource(resources, f.target);
    assert.equal(preview.provisional, true);
    assert.equal(inlineHwp5ChartIndex(f.content).get('2:0:0').height, 240);
    await resources.load(2, 4);
    assert.equal(resources.get(2, 4).value.owner.geometry.height, 18000);
    assert.equal(resources.get(2, 4).previewValue, null);
  } finally {
    resources.close();
  }
});
test('synthetic retired pending resource cannot publish a stale frame after resize', async () => {
  let f = make();
  const jobs = [];
  let changed = 0;
  const resources = createHwp5ChartResources({
    current: () => f.content,
    read: () => new Promise((resolve) => jobs.push(resolve)),
    onChange() {
      changed++;
    },
  });
  try {
    const oldValue = f.value;
    const retired = resources.load(2, 4);
    f = make(25000, 18000);
    resources.refresh(f.content.hwp5ChartTargets, new Set());
    jobs[0](oldValue);
    await retired;
    assert.equal(changed, 0);
    assert.equal(resources.get(2, 4), null);
    const fresh = resources.load(2, 4);
    jobs[1](f.value);
    await fresh;
    assert.equal(resources.get(2, 4).value.owner.geometry.height, 18000);
    assert.equal(changed, 1);
  } finally {
    resources.close();
  }
});
