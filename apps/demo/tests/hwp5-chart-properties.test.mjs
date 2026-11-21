import test from 'node:test';
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
    registerStateListener: () => () => {},
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
