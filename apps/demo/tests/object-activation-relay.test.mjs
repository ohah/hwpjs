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
      drawings: [{ section: 0, drawingNode: 8 }],
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
