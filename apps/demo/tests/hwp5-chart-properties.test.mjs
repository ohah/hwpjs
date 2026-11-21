import test from 'node:test';
import { Document, all } from './fake-dom.mjs';
import { createHwp5ChartPropertiesTool } from '../src/hwp5-chart-properties-tool.ts';
import { SET_OBJECT_GEOMETRY_COMMAND } from '@hwpjs/core';
import assert from 'node:assert/strict';
import { currentHwp5ChartTarget } from '../../../web/preview/hwp5-chart-resources.mjs';
import { objectActivationTarget } from '../../../web/preview/object-activation-target.mjs';
import {
  objectSelectionRectangle,
  sameObjectSelection,
} from '../../../web/preview/object-selection-paint.mjs';
import { objectSelectionOwner } from '../../../packages/vanilla/src/object-selection.ts';
import { createHwp5ChartPropertiesPort } from '../src/hwp5-chart-properties-port.ts';
import { connectObjectActivation } from '../src/object-activation-bridge.ts';
const address = { section: 0, controlNode: 17 };
const hit = { kind: 'hwp5-chart', ...address };
function fixture() {
  const listeners = new Set();
  const owner = {
    control_node: 17,
    component_node: 18,
    ole_node: 19,
    paragraph_node: 14,
    paragraph: 2,
    current_unit: 0,
    geometry: { width: 36000, height: 22000 },
  };
  const row = {
    kind: 'hwp5-chart',
    ...address,
    componentNode: 18,
    oleNode: 19,
    physicalParagraphNode: 14,
    paragraph: 2,
    anchorUnit: 0,
    owner,
    sourceEpoch: '2',
    historyRevision: 0,
    resource: { physical_id: 1, resource_sha256: Array(32).fill(9) },
  };
  const content = {
    format: 'hwp5',
    hwp5ChartDisplayAvailable: true,
    hwp5ChartSourceEpoch: '2',
    hwp5ChartHistoryRevision: 0,
    hwp5ChartTargets: [row],
    paragraphs: [
      {
        section: 0,
        paragraph: 2,
        text: '\ufffc',
        sourceOffsets: [
          { at: 0, source: 0 },
          { at: 1, source: 8 },
        ],
      },
    ],
  };
  const token = {
    editorId: 'editor',
    documentId: 'doc',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
  };
  let state = { ...token, token, status: 'ready', content, documentId: 'doc' };
  const value = {
    kind: 'hwp5_chart_display',
    format: 'hwp5',
    version: 1,
    section: 0,
    owner: structuredClone(owner),
    physical_id: 1,
    resource_sha256: Array(32).fill(9),
    data: { rich_text: [] },
  };
  const reply = { kind: 'hwp5-chart-display', ...address, historyRevision: 0, chart: value };
  const reads = [];
  let read = async () => reply;
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    readResource(request, token) {
      reads.push({ request, token });
      return read();
    },
    dispatchCommand() {
      assert.fail('Display must not issue edit command');
    },
  };
  return {
    owner,
    row,
    content,
    token,
    value,
    reply,
    reads,
    editor,
    listeners,
    replaceState: (s) => {
      state = s;
    },
    getState: () => state,
    readWith: (fn) => {
      read = fn;
    },
  };
}
test('current HWP5 painted chart retains control address through hit, owner and selection paint', () => {
  const f = fixture(),
    painted = { target: f.row, x: 10, y: 20, width: 100, height: 80 };
  const scene = { content: f.content, layout: {}, charts: [painted] };
  assert.deepEqual(objectActivationTarget(scene, 30, 40), hit);
  assert.equal(objectSelectionOwner(f.content, hit), true);
  assert.equal(objectSelectionRectangle(hit, f.content, [painted], []), painted);
  assert.equal(sameObjectSelection(hit, { kind: 'chart', section: 0, wrapper: 17 }), false);
  assert.equal(
    objectActivationTarget({ ...scene, charts: [{ ...painted, provisional: true }] }, 30, 40),
    null,
  );
  assert.equal(
    objectSelectionRectangle(hit, f.content, [{ ...painted, provisional: true }], []),
    null,
  );
});
for (const [name, mutate] of [
  [
    'epoch',
    (f) => {
      f.content.hwp5ChartSourceEpoch = '3';
    },
  ],
  [
    'history',
    (f) => {
      f.content.hwp5ChartHistoryRevision = 1;
    },
  ],
  [
    'duplicate owner',
    (f) => {
      f.content.hwp5ChartTargets.push({ ...f.row });
    },
  ],
  [
    'component identity',
    (f) => {
      f.row.componentNode = 77;
    },
  ],
  [
    'OLE identity',
    (f) => {
      f.row.oleNode = 77;
    },
  ],
  [
    'body ownership',
    (f) => {
      f.content.paragraphs[0].text = 'x';
    },
  ],
  [
    'capability',
    (f) => {
      f.content.hwp5ChartDisplayAvailable = false;
    },
  ],
  [
    'format',
    (f) => {
      f.content.format = 'hwpx';
    },
  ],
])
  test('HWP5 activation denies stale/invalid ' + name, () => {
    const f = fixture();
    mutate(f);
    assert.equal(currentHwp5ChartTarget(f.content, address), null);
    assert.equal(objectSelectionOwner(f.content, hit), false);
    const port = createHwp5ChartPropertiesPort(f.editor);
    assert.throws(() => port.observe(address));
    assert.equal(f.reads.length, 0);
  });
test('HWP5 properties request uses its native kind/control address and returns read-only dimensions', async () => {
  const f = fixture(),
    port = createHwp5ChartPropertiesPort(f.editor);
  const value = await port.capture(port.observe(address));
  assert.deepEqual(f.reads, [
    { request: { kind: 'hwp5-chart-display', section: 0, controlNode: 17 }, token: f.token },
  ]);
  assert.equal(value.width, 36000);
  assert.equal(value.height, 22000);
  assert.equal(value.title, null);
  assert.equal(Object.isFrozen(value), true);
  assert.equal(f.getState().content.hwp5ChartHistoryRevision, 0);
});
for (const [name, mutate] of [
  [
    'resource hash',
    (f) => {
      f.value.resource_sha256[0] = 1;
    },
  ],
  [
    'owner',
    (f) => {
      f.value.owner.ole_node = 77;
    },
  ],
  [
    'reply control',
    (f) => {
      f.reply.controlNode = 77;
    },
  ],
  [
    'reply revision',
    (f) => {
      f.reply.historyRevision = 1;
    },
  ],
  [
    'cross-format reply',
    (f) => {
      f.reply.kind = 'chart-display';
    },
  ],
])
  test('HWP5 properties refuse mismatched ' + name, async () => {
    const f = fixture(),
      port = createHwp5ChartPropertiesPort(f.editor),
      obs = port.observe(address);
    mutate(f);
    await assert.rejects(port.capture(obs));
  });
test('pending HWP5 resource cannot publish after document/state replacement', async () => {
  const f = fixture(),
    port = createHwp5ChartPropertiesPort(f.editor),
    obs = port.observe(address);
  let resolve;
  f.readWith(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = port.capture(obs);
  f.replaceState({
    ...f.getState(),
    documentId: 'next',
    token: { ...f.token, documentId: 'next' },
  });
  resolve(f.reply);
  await assert.rejects(pending);
  assert.equal(port.current(obs), false);
});
test('HWP5 properties rejects accessor/extra wrapper targets before reads', () => {
  const f = fixture(),
    port = createHwp5ChartPropertiesPort(f.editor);
  assert.throws(() => port.observe({ ...address, wrapper: 17 }));
  let getterCalls = 0;
  assert.throws(() =>
    port.observe({
      section: 0,
      get controlNode() {
        getterCalls++;
        return address.controlNode;
      },
    }),
  );
  assert.equal(getterCalls, 0);
  assert.equal(f.reads.length, 0);
});
test('bridge routes HWP5 only to its own properties port and rejects stale tokens', () => {
  const f = fixture(),
    calls = [];
  let dispatch;
  const stop = connectObjectActivation(
    {
      registerObjectActivation(fn) {
        dispatch = fn;
        return () => {};
      },
    },
    f.editor,
    {
      picture: {
        open() {
          assert.fail('picture alias');
        },
      },
      chart: {
        open() {
          assert.fail('HWPX alias');
        },
      },
      drawing: {
        open() {
          assert.fail('drawing alias');
        },
      },
      hwp5Chart: {
        open(t) {
          calls.push(t);
        },
      },
    },
  );
  dispatch({ type: 'double-click', target: hit, token: f.token });
  assert.deepEqual(calls, [address]);
  dispatch({ type: 'double-click', target: hit, token: { ...f.token, generation: 2 } });
  assert.equal(calls.length, 1);
  stop();
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function geometryDialog(options = {}) {
  const f = fixture(),
    doc = new Document(),
    calls = [],
    target = Object.freeze({});
  const root = doc.createElement('main');
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag);
    node.style = {};
    node.showModal = () => {
      node.open = true;
    };
    node.close = () => {
      node.open = false;
    };
    return node;
  };
  let finish;
  f.editor.getObjectGeometry = async (selector, settings) => {
    calls.push({ kind: 'query', selector, settings });
    const reply = options.unavailable
      ? { state: 'unavailable', reason: 'Hwp5ChartGeometryLineCacheUnproved' }
      : {
          state: 'available',
          target,
          observation: {
            frame: {
              width: 20000,
              height: 12000,
              horizontalOffset: 0,
              verticalOffset: 0,
              treatAsCharacter: true,
            },
            editable: { size: !options.protected, position: false },
          },
        };
    if (options.delayed)
      return await new Promise((resolve) => {
        finish = () => resolve(reply);
      });
    return reply;
  };
  f.editor.dispatchCommand = async (command, payload) => {
    calls.push({ kind: 'write', command, payload });
    return { status: 'committed-with-snapshot' };
  };
  const data = [];
  const tool = createHwp5ChartPropertiesTool({
    root,
    editor: f.editor,
    onStatus() {},
    onClose() {},
    canEditData: async () => true,
    onEditData: (value) => data.push(value),
  });
  tool.open(address);
  return {
    ...f,
    root,
    tool,
    calls,
    target,
    data,
    finish: () => finish(),
    input: (field) => all(root, (n) => n.dataset.role === 'object-geometry-' + field)[0],
    button: () => all(root, (n) => n.dataset.role === 'object-geometry-apply')[0],
  };
}
test('H5 geometry bridge uses verified component, never painted control, without granting write authority', async () => {
  const f = fixture(),
    port = createHwp5ChartPropertiesPort(f.editor);
  const capture = await port.capture(port.observe(address));
  assert.deepEqual(capture.geometrySelector, { kind: 'chart', section: 0, node: 18 });
  assert(Object.isFrozen(capture.geometrySelector));
  assert.notEqual(capture.geometrySelector.node, address.controlNode);
  const forged = { ...port.observe(address) };
  assert.equal(port.current(forged), false);
  await assert.rejects(port.capture(forged));
});
for (const [axis, patch] of [
  ['width', { width: 25002 }],
  ['height', { height: 15001 }],
])
  test(
    'H5 properties independently submits ' +
      axis +
      ' with one typed target and no other axis or position',
    async () => {
      const h = geometryDialog();
      try {
        await tick();
        assert.deepEqual(h.calls[0].selector, { kind: 'chart', section: 0, node: 18 });
        assert.equal(h.input('width').disabled, false);
        assert.equal(h.input('height').disabled, false);
        assert.equal(h.input('horizontalOffset').disabled, true);
        assert.equal(h.input('verticalOffset').disabled, true);
        assert.equal(all(h.root, (n) => n.type === 'checkbox')[0].disabled, true);
        h.input(axis).value = axis === 'width' ? '88.2' : '52.92';
        h.input(axis).dispatchEvent(new Event('input'));
        h.button().dispatchEvent(new Event('click'));
        await tick();
        const writes = h.calls.filter((c) => c.kind === 'write');
        assert.equal(writes.length, 1);
        assert.equal(writes[0].command, SET_OBJECT_GEOMETRY_COMMAND);
        assert.equal(writes[0].payload.target, h.target);
        assert.deepEqual(writes[0].payload.patch, patch);
      } finally {
        h.tool.dispose();
      }
    },
  );
for (const options of [{ unavailable: true }, { protected: true }])
  test(
    'H5 properties preserves Native size refusal ' +
      JSON.stringify(options) +
      ' and independent data action',
    async () => {
      const h = geometryDialog(options);
      try {
        await tick();
        assert.equal(h.input('width').disabled, true);
        assert.equal(h.input('height').disabled, true);
        assert.equal(h.button().disabled, true);
        // A disabled browser button does not dispatch a trusted click.
        // Assert the UI boundary; Native/Core refusal is tested separately.
        assert.equal(h.calls.filter((c) => c.kind === 'write').length, 0);
        const dataButton = all(h.root, (n) => n.textContent === '차트 데이터 편집')[0];
        dataButton.dispatchEvent(new Event('click'));
        assert.deepEqual(h.data, [address]);
        assert.equal(h.root.children.length, 0);
      } finally {
        h.tool.dispose();
      }
    },
  );
for (const action of ['replace', 'close'])
  test('H5 delayed geometry query cannot revive controls after ' + action, async () => {
    const h = geometryDialog({ delayed: true });
    try {
      await tick();
      if (action === 'close') h.tool.dispose();
      else {
        h.replaceState({ ...h.getState() });
        for (const notify of h.listeners) notify();
      }
      h.finish();
      await tick();
      assert.equal(h.root.children.length, 0);
      assert.equal(h.calls.filter((c) => c.kind === 'write').length, 0);
    } finally {
      h.tool.dispose();
    }
  });
test('H5 geometry capture refuses a state change before apply and retains untouched Native precision', async () => {
  const h = geometryDialog();
  try {
    await tick();
    h.replaceState({ ...h.getState() });
    h.input('width').value = '88.2';
    h.input('width').dispatchEvent(new Event('input'));
    h.button().dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((c) => c.kind === 'write').length, 0);
  } finally {
    h.tool.dispose();
  }
});
