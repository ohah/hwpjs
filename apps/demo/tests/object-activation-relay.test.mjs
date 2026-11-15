import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectActivationRelay } from '../src/object-activation-relay.ts';
import { connectObjectActivation } from '../src/object-activation-bridge.ts';
function host() {
  const fns = new Set();
  return {
    registerObjectActivation(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    emit(e) {
      for (const f of fns) f(e);
    },
    fns,
  };
}
test('delayed React/Svelte mount and StrictMode replacement retain only current listeners', () => {
  const relay = createObjectActivationRelay(),
    a = host(),
    b = host(),
    events = [];
  const stop = relay.register((e) => events.push(e));
  relay.connect(a);
  a.emit(1);
  relay.connect(b);
  a.emit(2);
  b.emit(3);
  assert.deepEqual(events, [1, 3]);
  assert.equal(a.fns.size, 0);
  stop();
  b.emit(4);
  assert.equal(b.fns.size, 0);
  relay.dispose();
  relay.connect(a);
  assert.equal(a.fns.size, 0);
});
test('current event routes exactly its chart/image/textbox identity without mutating state', () => {
  const h = host(),
    token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 2,
      viewRevision: 3,
    };
  const state = {
    ...token,
    token,
    status: 'ready',
    content: {
      chartTargets: [
        { section: 0, wrapper: 1 },
        { section: 0, wrapper: 9 },
      ],
      pictures: [{ section: 0, pictureNode: 7 }],
      format: 'hwpx',
      drawings: [
        {
          section: 0,
          drawingNode: 8,
          hostParagraph: 0,
          anchorUnit: 0,
          source: {
            drawing_node: 8,
            paragraph: 1,
            anchor_unit: 0,
            transform_identity: true,
            rendering: { angle: 0 },
            group_context: null,
          },
        },
      ],
    },
  };
  const calls = [];
  const stop = connectObjectActivation(
    h,
    { getEditorState: () => state },
    {
      chart: { open: (t) => calls.push(t) },
      picture: { open: () => calls.push('picture') },
      drawing: { open: (t) => calls.push(t) },
    },
  );
  for (const target of [
    { kind: 'chart', section: 0, wrapper: 9 },
    { kind: 'picture', section: 0, pictureNode: 7 },
    { kind: 'drawing', section: 0, drawingNode: 8 },
  ])
    h.emit({ type: 'double-click', target, token });
  assert.deepEqual(calls, [{ section: 0, wrapper: 9 }, 'picture', { section: 0, drawingNode: 8 }]);
  stop();
  assert.equal(h.fns.size, 0);
});
test('stale tokens, unknown owners and duplicate physical identities cannot open dialogs', () => {
  const h = host(),
    token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 2,
      viewRevision: 3,
    },
    target = { kind: 'chart', section: 0, wrapper: 9 };
  const state = {
    ...token,
    token,
    status: 'ready',
    content: { chartTargets: [{ section: 0, wrapper: 9 }] },
  };
  let n = 0;
  const stop = connectObjectActivation(
    h,
    { getEditorState: () => state },
    { chart: { open: () => n++ }, picture: { open: () => n++ }, drawing: { open: () => n++ } },
  );
  for (const key of ['editorId', 'documentId', 'generation', 'operationRevision', 'viewRevision'])
    h.emit({ type: 'double-click', target, token: { ...token, [key]: 'changed' } });
  h.emit({ type: 'double-click', target: { ...target, wrapper: 99 }, token });
  state.content.chartTargets.push({ ...state.content.chartTargets[0] });
  h.emit({ type: 'double-click', target, token });
  assert.equal(n, 0);
  stop();
});

function propertiesHost() {
  const base = host(),
    properties = new Set();
  return {
    ...base,
    properties,
    registerObjectPropertiesRequest(fn) {
      if (properties.size) throw Error('ObjectPropertiesOwnerAlreadyAttached');
      properties.add(fn);
      return () => properties.delete(fn);
    },
    emitProperties(event) {
      for (const fn of properties) fn(event);
    },
  };
}
test('P properties channel routes exact current targets independently of dblclick and retains Native token/membership fences', () => {
  const h = propertiesHost(),
    token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 2,
      viewRevision: 3,
    };
  let state = {
    ...token,
    token,
    status: 'ready',
    content: {
      chartTargets: [{ section: 0, wrapper: 9 }],
      pictures: [{ section: 0, pictureNode: 7 }],
      format: 'hwpx',
      drawings: [
        {
          section: 0,
          drawingNode: 8,
          hostParagraph: 0,
          anchorUnit: 0,
          source: {
            drawing_node: 8,
            paragraph: 1,
            anchor_unit: 0,
            transform_identity: true,
            rendering: { angle: 0 },
            group_context: null,
          },
        },
      ],
    },
  };
  const calls = [],
    stop = connectObjectActivation(
      h,
      { getEditorState: () => state },
      {
        chart: { open: (t) => calls.push(t) },
        picture: { open: () => calls.push('picture') },
        drawing: { open: (t) => calls.push(t) },
      },
    );
  const targets = [
    { kind: 'chart', section: 0, wrapper: 9 },
    { kind: 'picture', section: 0, pictureNode: 7 },
    { kind: 'drawing', section: 0, drawingNode: 8 },
  ];
  for (const target of targets) h.emitProperties({ type: 'properties-shortcut', target, token });
  assert.deepEqual(calls, [{ section: 0, wrapper: 9 }, 'picture', { section: 0, drawingNode: 8 }]);
  calls.length = 0;
  h.emit({ type: 'properties-shortcut', target: targets[0], token });
  h.emitProperties({ type: 'double-click', target: targets[0], token });
  for (const key of Object.keys(token))
    h.emitProperties({
      type: 'properties-shortcut',
      target: targets[0],
      token: { ...token, [key]: 'changed' },
    });
  h.emitProperties({ type: 'properties-shortcut', target: { ...targets[0], wrapper: 11 }, token });
  state = { ...state, historyRecoveryRequired: true };
  h.emitProperties({ type: 'properties-shortcut', target: targets[0], token });
  state = { ...state, historyRecoveryRequired: false };
  state.content.chartTargets.push({ ...state.content.chartTargets[0] });
  h.emitProperties({ type: 'properties-shortcut', target: targets[0], token });
  assert.deepEqual(calls, []);
  stop();
  assert.equal(h.fns.size, 0);
  assert.equal(h.properties.size, 0);
});
test('properties relay handles delayed mount, surface replacement, duplicate owner, old disposer and detach', () => {
  const relay = createObjectActivationRelay(),
    a = propertiesHost(),
    b = propertiesHost(),
    events = [],
    fn = (e) => events.push(e);
  const stop = relay.registerProperties(fn);
  assert.throws(() => relay.registerProperties(fn), /AlreadyAttached/);
  relay.connect(a);
  a.emitProperties(1);
  relay.connect(b);
  a.emitProperties(2);
  b.emitProperties(3);
  assert.deepEqual(events, [1, 3]);
  assert.equal(a.properties.size, 0);
  stop();
  const stop2 = relay.registerProperties(fn);
  stop();
  b.emitProperties(4);
  assert.deepEqual(events, [1, 3, 4]);
  relay.connect(undefined);
  assert.equal(b.properties.size, 0);
  relay.connect(a);
  a.emitProperties(5);
  relay.dispose();
  stop2();
  a.emitProperties(6);
  assert.deepEqual(events, [1, 3, 4, 5]);
});
test('duplicate properties owner failure unwinds the already-connected activation listener', () => {
  const h = propertiesHost();
  h.registerObjectPropertiesRequest(() => {});
  assert.throws(
    () =>
      connectObjectActivation(
        h,
        { getEditorState: () => ({}) },
        { chart: { open() {} }, picture: { open() {} }, drawing: { open() {} } },
      ),
    /AlreadyAttached/,
  );
  assert.equal(h.fns.size, 0);
  assert.equal(h.properties.size, 1);
});
test('failed replacement properties attachment leaves no partial subscription and can reconnect after owner release', () => {
  const relay = createObjectActivationRelay(),
    a = propertiesHost(),
    b = propertiesHost();
  relay.register(() => {});
  relay.registerProperties(() => {});
  relay.connect(a);
  const release = b.registerObjectPropertiesRequest(() => {});
  assert.throws(() => relay.connect(b), /AlreadyAttached/);
  assert.equal(a.fns.size, 0);
  assert.equal(a.properties.size, 0);
  assert.equal(b.fns.size, 0);
  release();
  relay.connect(b);
  assert.equal(b.fns.size, 1);
  assert.equal(b.properties.size, 1);
  relay.dispose();
});

test('Main P dispatcher consumes H5 common query with exact component target and refuses unknown rotation without aliasing control', async () => {
  const { readFileSync } = await import('node:fs');
  const content = JSON.parse(
    readFileSync(
      new URL('../../../tests/canvas/fixtures/textbox-h5-public-observation.json', import.meta.url),
      'utf8',
    ),
  );
  const row = content.drawings[0],
    target = { kind: 'drawing', section: row.section, drawingNode: row.drawingNode };
  assert.notEqual(row.drawingNode, row.controlNode);
  assert.equal(row.source.transform_identity, undefined);
  const h = propertiesHost(),
    token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 2,
      viewRevision: 3,
    };
  let state = { ...token, token, status: 'ready', content };
  const calls = [];
  const stop = connectObjectActivation(
    h,
    { getEditorState: () => state },
    {
      chart: { open: () => assert.fail() },
      picture: { open: () => assert.fail() },
      drawing: { open: (t) => calls.push(t) },
    },
  );
  h.emitProperties({ type: 'properties-shortcut', token, target });
  assert.deepEqual(calls, [{ section: row.section, drawingNode: row.drawingNode }]);
  h.emitProperties({
    type: 'properties-shortcut',
    token,
    target: { ...target, drawingNode: row.controlNode },
  });
  assert.equal(calls.length, 1);
  content.hwp5DrawingComponents[0].rotation_angle = undefined;
  h.emitProperties({ type: 'properties-shortcut', token, target });
  assert.equal(calls.length, 1);
  state = { ...state, generation: 2, token: { ...token, generation: 2 } };
  h.emitProperties({ type: 'properties-shortcut', token, target });
  assert.equal(calls.length, 1);
  stop();
});
