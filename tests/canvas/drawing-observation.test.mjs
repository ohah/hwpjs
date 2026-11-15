import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDrawingObservationQuery } from '../../web/preview/drawing-observation.mjs';
import { objectActivationTarget } from '../../web/preview/object-activation-target.mjs';
import { createDrawingPropertiesPort } from '../../apps/demo/src/drawing-properties-port.ts';
import { connectObjectActivation } from '../../apps/demo/src/object-activation-bridge.ts';
const original = JSON.parse(
  readFileSync(new URL('./fixtures/textbox-h5-public-observation.json', import.meta.url)),
);
const fixture = () => structuredClone(original);
const address = {
  section: original.drawings[0].section,
  drawingNode: original.drawings[0].drawingNode,
};
const get = (content) =>
  createDrawingObservationQuery(content).get(address.section, address.drawingNode);
function port(content) {
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state = { ...token, token, content, status: 'ready', stateVersion: 1 };
  const editor = { getEditorState: () => state, registerStateListener: () => () => {} };
  return {
    port: createDrawingPropertiesPort(editor),
    editor,
    state,
    replace: (next) => {
      state = next;
    },
  };
}
test('actual public H5 observation joins raw owner/local transform without manufacturing HWPX source fields', () => {
  const content = fixture(),
    before = structuredClone(content),
    query = createDrawingObservationQuery(content);
  const owner = query.get(address.section, address.drawingNode);
  assert(owner.activationSafe);
  assert(Object.isFrozen(owner));
  assert(Object.isFrozen(owner.geometry));
  assert(Object.isFrozen(owner.readText().paragraphs));
  assert.equal(owner.row.hostParagraph, content.hwp5Drawings[0].hostParagraph);
  assert.equal(owner.row.anchorUnit, content.hwp5Drawings[0].anchorUnit);
  assert.equal(owner.geometry.width, content.hwp5Drawings[0].source.width);
  assert.equal(owner.row.source.drawing_node, undefined);
  assert.equal(owner.row.source.transform_identity, undefined);
  assert.equal(owner.row.source.text.node, undefined);
  assert.deepEqual(
    owner.readText().paragraphs.map((row) => row.text),
    ['글상자'],
  );
  assert.strictEqual(query.get(address.section, address.drawingNode), owner);
  assert.deepEqual(content, before);
});
test('recorded actual Canvas rectangle joins the H5 owner at its border and preserves interior text entry', () => {
  const content = fixture(),
    row = content.drawings[0];
  const rectangle = { x: 149.81333333333333, y: 168.84, width: 156.84, height: 73.01333333333334 };
  const scene = { content, layout: { placedDrawings: [{ ...row, rectangle }] } };
  assert.deepEqual(
    objectActivationTarget(scene, rectangle.x + 1, rectangle.y + rectangle.height / 2),
    { kind: 'drawing', ...address },
  );
  assert.equal(
    objectActivationTarget(
      scene,
      rectangle.x + rectangle.width / 2,
      rectangle.y + rectangle.height / 2,
    ),
    null,
  );
  scene.layout.placedDrawings[0].anchorUnit++;
  assert.equal(objectActivationTarget(scene, rectangle.x + 1, rectangle.y + 2), null);
});
test('H5 properties consume native size and body membership, preserve text, and never expose owner addresses', () => {
  const f = port(fixture()),
    capture = f.port.capture(address).capture;
  assert(capture);
  assert.equal(capture.text, '글상자');
  assert(f.port.current(capture));
  assert.deepEqual(capture.fields, [
    { label: '너비', value: '41.5 mm' },
    { label: '높이', value: '19.32 mm' },
    { label: '글자처럼 취급', value: '아니오' },
  ]);
  f.replace({ ...f.state });
  assert.equal(f.port.current(capture), false);
});
test('H5 activation relay uses the same read query and keeps the state-token fence', () => {
  const f = port(fixture()),
    calls = [];
  let listener;
  const stop = connectObjectActivation(
    {
      registerObjectActivation: (fn) => {
        listener = fn;
        return () => {
          listener = null;
        };
      },
    },
    f.editor,
    {
      picture: { open: () => calls.push('picture') },
      chart: { open: () => calls.push('chart') },
      drawing: { open: (target) => calls.push(target) },
    },
  );
  listener({ type: 'double-click', target: { kind: 'drawing', ...address }, token: f.state.token });
  listener({
    type: 'double-click',
    target: { kind: 'drawing', ...address },
    token: { ...f.state.token, operationRevision: 9 },
  });
  assert.deepEqual(calls, [address]);
  stop();
  assert.equal(listener, null);
});
test('duplicate or crossed raw, projected, anchor and component owners refuse rather than selecting a first row', () => {
  for (const change of [
    (c) => c.drawings.push(structuredClone(c.drawings[0])),
    (c) => c.hwp5Drawings.push(structuredClone(c.hwp5Drawings[0])),
    (c) => c.hwp5DrawingLocalTransforms.push(structuredClone(c.hwp5DrawingLocalTransforms[0])),
    (c) => c.hwp5DrawingComponents.push(structuredClone(c.hwp5DrawingComponents[0])),
    (c) => c.hwp5Drawings[0].controlNode++,
    (c) => c.hwp5Drawings[0].source.component_node++,
    (c) => c.hwp5Drawings[0].anchor.paragraph++,
    (c) => delete c.hwp5Drawings[0].anchor.source_unit,
    (c) => c.currentParagraphFlows[0].source_node++,
    (c) => c.hwp5DrawingLocalTransforms[0].owner_node++,
    (c) => c.drawings[0].anchorUnit++,
  ]) {
    const content = fixture();
    change(content);
    assert.equal(get(content), null);
  }
});
test('unknown rotations, nonidentity transforms, groups and incomplete Native transform observations never activate', () => {
  for (const change of [
    (c) => delete c.hwp5Drawings[0].source.rotation_angle,
    (c) => (c.hwp5Drawings[0].source.rotation_angle = null),
    (c) => (c.hwp5Drawings[0].source.rotation_angle = 20),
    (c) => delete c.hwp5DrawingComponents[0].rotation_angle,
    (c) => delete c.hwp5DrawingComponents[0].group_count,
    (c) => (c.hwp5DrawingComponents[0].group_count = 1),
    (c) => c.hwp5DrawingComponents[0].kind_id++,
    (c) => c.hwp5DrawingComponents[0].attributes++,
    (c) => {
      c.hwp5Drawings[0].source.component_attributes |= 1;
      c.hwp5DrawingComponents[0].attributes |= 1;
    },
    (c) => delete c.drawings[0].source.rendering.unknown_component_attributes,
    (c) => (c.hwp5DrawingLocalTransforms[0].matrix[0] = 2),
    (c) => (c.drawings[0].source.rendering.angle = undefined),
    (c) => (c.drawings[0].source.rendering.flip[0] = true),
    (c) => (c.drawings[0].source.rendering.matrix[2] = 10),
    (c) => (c.drawings[0].source.group_context = { root_anchor: 0 }),
    (c) => delete c.drawings[0].source.group_context,
    (c) => (c.hwp5Drawings[0].source.kind_id = 0),
    (c) => delete c.hwp5DrawingLocalErrors,
    (c) => c.hwp5DrawingMatrixErrors.push({ section: 0, error: 'unknown' }),
  ]) {
    const content = fixture();
    change(content);
    assert.notEqual(get(content)?.activationSafe, true);
  }
});
test('H5 text requires its body list and exact flow membership, never an HWPX node alias', () => {
  for (const change of [
    (c) => c.hwp5DrawingBodies.push(structuredClone(c.hwp5DrawingBodies[1])),
    (c) => (c.hwp5DrawingBodies[1].paragraphs = []),
    (c) => c.hwp5DrawingBodies[1].source.list_node++,
    (c) => c.hwp5DrawingBodies[1].source.owner_node++,
    (c) => c.currentParagraphFlows[2].parent_node++,
    (c) => c.currentParagraphFlows[2].list_node++,
    (c) => (c.currentParagraphFlows[2].top_level = true),
    (c) => c.paragraphs[2].drawingText.listNode++,
    (c) => (c.paragraphs[2].clipped = true),
    (c) => (c.paragraphs[2].tableCell = {}),
    (c) => (c.paragraphs[2].drawingCaption = {}),
    (c) => c.paragraphs.push(structuredClone(c.paragraphs[2])),
    (c) => c.hwp5DrawingBodyErrors.push({ error: 'unknown' }),
  ]) {
    const content = fixture();
    change(content);
    assert.equal(port(content).port.capture(address).capture, null);
  }
});
test('partial, window, unsupported format, accessors and prototype-bearing data cannot supply a drawing query', () => {
  for (const change of [
    (c) => (c.limited = true),
    (c) => (c.window = {}),
    (c) => (c.format = 'unknown'),
    (c) =>
      Object.defineProperty(c.drawings[0], 'source', {
        get() {
          throw Error('MustNotExecute');
        },
      }),
    (c) => Object.setPrototypeOf(c.hwp5Drawings[0], { external: true }),
  ]) {
    const content = fixture();
    change(content);
    assert.equal(get(content), null);
  }
});

test('many H5 owners sharing a host batch their Native offsets linearly without sorting or dense gap scans', () => {
  const content = fixture(),
    count = 400,
    host = content.paragraphs[0];
  const raw = structuredClone(content.hwp5Drawings[0]),
    drawing = structuredClone(content.drawings[0]);
  const local = structuredClone(content.hwp5DrawingLocalTransforms[0]),
    component = structuredClone(content.hwp5DrawingComponents[0]);
  host.text = '\ufffc'.repeat(count);
  let reads = 0;
  host.sourceOffsets = new Proxy(
    Array.from({ length: count + 1 }, (_, i) => ({ at: i, source: i * 8 })),
    {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
        return Reflect.get(target, key, receiver);
      },
    },
  );
  content.hwp5Drawings = [];
  content.drawings = [];
  content.hwp5DrawingLocalTransforms = [];
  content.hwp5DrawingComponents = [];
  for (let i = 0; i < count; i++) {
    const controlNode = 10 + 3 * i,
      componentNode = controlNode + 1;
    content.hwp5Drawings.push({
      ...raw,
      controlNode,
      componentNode,
      anchorUnit: i,
      source: { ...raw.source, control_node: controlNode, component_node: componentNode },
      anchor: {
        ...raw.anchor,
        control_node: controlNode,
        component_node: componentNode,
        source_unit: i * 8,
        current_unit: i * 8,
      },
    });
    content.drawings.push({ ...drawing, drawingNode: componentNode, controlNode, anchorUnit: i });
    content.hwp5DrawingLocalTransforms.push({
      ...local,
      component_node: componentNode,
      owner_node: controlNode,
    });
    content.hwp5DrawingComponents.push({
      ...component,
      component_node: componentNode,
      owner_node: controlNode,
    });
  }
  const query = createDrawingObservationQuery(content);
  for (const row of content.drawings)
    assert(query.get(row.section, row.drawingNode)?.activationSafe);
  assert(reads < 16 * count, `offset work is bounded by entries, reads=${reads}`);
  const reversed = fixture();
  reversed.hwp5Drawings.push({ ...reversed.hwp5Drawings[0] });
  assert.equal(get(reversed), null);
});
