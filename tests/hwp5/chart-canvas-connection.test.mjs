import test from 'node:test';
import assert from 'node:assert/strict';
import { display, candidates } from './chart-display-wire-fixture.mjs';
import { projectHwp5ChartContent } from '../../web/preview/hwp5-chart-content.mjs';
import {
  inlineHwp5ChartIndex,
  previewHwp5ChartLayers,
} from '../../web/preview/hwp5-chart-layers.mjs';
import {
  createHwp5ChartResources,
  compatibleHwp5ChartPreviewKeys,
  readHwp5ChartPaintResource,
} from '../../web/preview/hwp5-chart-resources.mjs';
import { paintChartPreview } from '../../web/preview/chart-preview-paint.mjs';
import { projectHwp5RootContent } from '../../web/preview/hwp5-root-content-projection.mjs';
import { projectDraftAnchoredObjects } from '../../web/preview/anchored-object-draft.mjs';
import { context } from '../hwpx/chart-family-model.mjs';
function fixture() {
  const packet = candidates(),
    owner = packet.candidates[0].owner;
  const paragraph = {
    section: 2,
    paragraph: 0,
    text: '\ufffc\ufffc\ufffc',
    selectionOwner: 'section:2:body',
    sourceOffsets: [
      { at: 0, source: 0 },
      { at: 1, source: 8 },
      { at: 2, source: 16 },
      { at: 3, source: 24 },
    ],
  };
  const content = {
    format: 'hwp5',
    paragraphs: [paragraph],
    pictures: [],
    currentParagraphFlows: [{ section: 2, paragraph: 0, host: 'body' }],
    hwp5DrawingLocalTransforms: [
      { section: 2, owner_node: 4, component_node: 5, matrix: [1, 0, 0, 0, 1, 0] },
    ],
    hwp5Drawings: [
      {
        section: 2,
        controlNode: 4,
        componentNode: 5,
        hostParagraph: 0,
        anchorUnit: 2,
        source: owner.geometry,
      },
    ],
  };
  return { packet, content, paragraph, owner };
}
function layout() {
  return {
    height: 200,
    rows: [
      {
        kind: 'text',
        section: 2,
        paragraph: 0,
        startUnit: 0,
        endUnit: 3,
        x: 20,
        y: 10,
        width: 260,
        height: 160,
        boundaries: [
          { unit: 0, x: 0 },
          { unit: 1, x: 8 },
          { unit: 2, x: 16 },
          { unit: 3, x: 256 },
        ],
      },
    ],
  };
}
test('H5 authored Native observation reserves source size and uses shared chart projector and Canvas painter', () => {
  const f = fixture(),
    content = projectHwp5ChartContent(f.content, f.packet),
    before = structuredClone(content);
  const target = content.hwp5ChartTargets[0];
  assert.equal(target.anchorUnit, 2);
  assert.equal(target.physicalParagraphNode, 0);
  const item = inlineHwp5ChartIndex(content).get('2:0:2');
  assert.equal(item.width, 240);
  assert.equal(item.height, 160);
  const layers = previewHwp5ChartLayers(content, layout(), 600, () => ({ value: display() }));
  assert.equal(layers.items.length, 1);
  assert.equal(layers.pending, 0);
  assert.equal(layers.unavailable.length, 0);
  assert.equal(layers.items[0].x, 36);
  assert.equal(layers.items[0].y, 18);
  const recording = context();
  assert.equal(paintChartPreview(recording.ctx, layers.items[0], 0), true);
  assert.equal(recording.depth(), 0);
  assert.ok(recording.calls.length > 0);
  assert.deepEqual(content, before);
});
test('H5 view roots preserve physical observations without promoting unrelated OLE', () => {
  const f = fixture(),
    content = projectHwp5ChartContent(f.content, f.packet);
  const roots = projectHwp5RootContent(content);
  assert.equal(roots.state, 'projected');
  assert.deepEqual(roots.content.hwp5Drawings, content.hwp5Drawings);
  const wrong = structuredClone(content);
  wrong.hwp5Drawings[0].componentNode = 99;
  assert.notEqual(projectHwp5RootContent(wrong).state, 'projected');
});
test('H5 observation keeps physical paragraph node separate and fails only an incomplete selected frame', () => {
  const f = fixture();
  f.owner.paragraph = 3;
  f.owner.paragraph_node = 100;
  f.owner.control_node = 104;
  f.owner.component_node = 105;
  f.owner.ole_node = 106;
  Object.assign(f.owner.geometry, { paragraph_node: 100, control_node: 104, component_node: 105 });
  f.paragraph.paragraph = 3;
  f.content.hwp5DrawingLocalTransforms[0].owner_node = 104;
  f.content.hwp5DrawingLocalTransforms[0].component_node = 105;
  const value = projectHwp5ChartContent(f.content, f.packet);
  assert.equal(value.hwp5ChartTargets[0].paragraph, 3);
  assert.equal(value.hwp5ChartTargets[0].physicalParagraphNode, 100);
  assert.equal(value.hwp5ChartTargets[0].error_name, undefined);
  f.content.hwp5DrawingLocalTransforms.push({
    section: 99,
    component_node: 9,
    owner_node: 8,
    matrix: [0],
  });
  assert.equal(
    projectHwp5ChartContent(f.content, f.packet).hwp5ChartTargets[0].error_name,
    undefined,
  );
  f.content.hwp5DrawingLocalTransforms[0].matrix = [1, 0, 0, 0, 1, 1];
  assert.equal(
    projectHwp5ChartContent(f.content, f.packet).hwp5ChartTargets[0].error_name,
    'UnsupportedHwp5ChartTransform',
  );
});
test('H5 Canvas projection refuses missing/unknown rotation, relative size, ambiguous ownership and marker changes', () => {
  for (const mutate of [
    (f) => {
      delete f.owner.geometry.rotation_angle;
    },
    (f) => {
      f.owner.attributes = 0;
    },
    (f) => {
      // Zero is an invalid declared frame; different positive intrinsic/common sizes are now supported.
      f.owner.geometry.width = 0;
    },
    (f) => {
      f.owner.geometry.flags = 0;
    },
    (f) => {
      f.content.paragraphs.push({ ...f.paragraph });
    },
    (f) => {
      f.paragraph.text = 'abc';
    },
    (f) => {
      f.content.hwp5DrawingLocalTransforms = [];
    },
  ]) {
    const f = fixture();
    mutate(f);
    const value = projectHwp5ChartContent(f.content, f.packet);
    assert.ok(value.hwp5ChartTargets[0].error_name);
    assert.equal(inlineHwp5ChartIndex(value).size, 0);
  }
});
test('H5 local draft projects display anchors only and never rebinds Native owner or source digest', () => {
  const f = fixture(),
    content = projectHwp5ChartContent(f.content, f.packet),
    owner = structuredClone(f.owner);
  const projected = projectDraftAnchoredObjects(
    content,
    content.hwp5ChartTargets,
    { section: 2, paragraph: 0, text: 'p\ufffc\ufffc\ufffc' },
    () => true,
  );
  assert.equal(projected[0].anchorUnit, 3);
  assert.deepEqual(projected[0].owner, owner);
  assert.equal(projected[0].owner.current_unit, 16);
});
function deferred() {
  let resolve;
  return {
    promise: new Promise((r) => {
      resolve = r;
    }),
    resolve(value) {
      resolve(value);
    },
  };
}
test('H5 resource cache keeps provisional paint data distinct and rejects a late foreign owner', async () => {
  const f = fixture();
  let content = projectHwp5ChartContent(f.content, f.packet);
  const jobs = [];
  const resources = createHwp5ChartResources({
    current: () => content,
    read: () => {
      const job = deferred();
      jobs.push(job);
      return job.promise;
    },
    onChange() {},
  });
  try {
    const load = resources.load(2, 4);
    jobs[0].resolve(display());
    await load;
    assert.ok(resources.get(2, 4).value);
    content = structuredClone(content);
    content.hwp5ChartTargets[0].owner.current_unit = 17;
    const keys = compatibleHwp5ChartPreviewKeys(content, resources);
    resources.refresh(content.hwp5ChartTargets, keys);
    assert.equal(resources.get(2, 4).value, null);
    assert.equal(
      readHwp5ChartPaintResource(resources, content.hwp5ChartTargets[0]).provisional,
      true,
    );
    const pending = resources.load(2, 4);
    const changed = display();
    changed.owner.current_unit = 17;
    jobs[1].resolve(changed);
    await pending;
    assert.equal(resources.get(2, 4).value.owner.current_unit, 17);
    resources.clear();
    const foreign = resources.load(2, 4);
    const wrong = display();
    wrong.physical_id = 2;
    jobs[2].resolve(wrong);
    await foreign;
    assert.equal(resources.get(2, 4).value, null);
    assert.equal(resources.get(2, 4).error, 'InvalidChartDisplayReply');
  } finally {
    resources.close();
  }
});
test('H5 retired pending resource reply cannot publish into a new document/cache generation', async () => {
  const f = fixture();
  const content = projectHwp5ChartContent(f.content, f.packet),
    job = deferred();
  let changed = 0;
  const resources = createHwp5ChartResources({
    current: () => content,
    read: () => job.promise,
    onChange() {
      changed++;
    },
  });
  const load = resources.load(2, 4);
  resources.clear();
  job.resolve(display());
  await load;
  assert.equal(resources.get(2, 4), null);
  assert.equal(changed, 0);
  resources.close();
});
