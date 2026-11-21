import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectBodyFlowPort } from '../src/object-body-flow-port.ts';
import { SET_OBJECT_BODY_FLOW_COMMAND } from '@hwpjs/core';
function fixture() {
  const target = Object.freeze({}),
    calls = [],
    flow = { textWrap: 'SQUARE', textFlow: 'RIGHT_ONLY' };
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state = {
      ...token,
      token,
      stateVersion: 1,
      status: 'ready',
      historyRecoveryRequired: false,
      content: { format: 'hwpx', readOnly: false },
    },
    live = true,
    resolve;
  const read = {
    state: 'available',
    target,
    observation: { format: 'hwpx', section: 0, drawingNode: 12, flow },
  };
  const editor = {
    getEditorState: () => state,
    async getObjectBodyFlow(selector, settings) {
      calls.push({ kind: 'read', selector, settings });
      return read;
    },
    async dispatchCommand(command, payload) {
      calls.push({ kind: 'write', command, payload });
      return { status: 'known-no-op' };
    },
  };
  const port = createObjectBodyFlowPort(editor, () => live);
  return {
    editor,
    port,
    target,
    flow,
    calls,
    read,
    get state() {
      return state;
    },
    replace() {
      state = { ...state };
    },
    detach() {
      live = false;
    },
    defer() {
      editor.getObjectBodyFlow = async () =>
        await new Promise((r) => {
          resolve = () => r(read);
        });
    },
    resolve() {
      resolve();
    },
  };
}
const selector = { kind: 'drawing', section: 0, node: 12 };
test('port retains only independently issued body flow target and copies requested values', async () => {
  const h = fixture(),
    r = await h.port.read(selector);
  assert.equal(r.available, true);
  const flow = { ...h.flow };
  await h.port.apply(r.capture, flow);
  const w = h.calls.find((x) => x.kind === 'write');
  assert.equal(w.command, SET_OBJECT_BODY_FLOW_COMMAND);
  assert.equal(w.payload.target, h.target);
  assert.notEqual(w.payload.flow, flow);
  assert.deepEqual(w.payload.flow, flow);
  await assert.rejects(h.port.apply(r.capture, flow));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 1);
});
test('clone and another port cannot use UI capture even if current Native observation matches', async () => {
  const h = fixture(),
    r = await h.port.read(selector),
    other = createObjectBodyFlowPort(h.editor, () => true);
  assert.equal(h.port.current({ ...r.capture }), false);
  assert.equal(other.current(r.capture), false);
  await assert.rejects(other.apply(r.capture, h.flow));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
});
test('replaced state, retokened state, readonly and poisoned state refuse before dispatch', async () => {
  for (const change of [
    (h) => h.replace(),
    (h) => h.state.token.operationRevision++,
    (h) => {
      h.state.content.readOnly = true;
    },
    (h) => {
      h.state.historyRecoveryRequired = true;
    },
    (h) => h.detach(),
  ]) {
    const h = fixture(),
      r = await h.port.read(selector);
    change(h);
    assert.equal(h.port.current(r.capture), false);
    await assert.rejects(h.port.apply(r.capture, h.flow));
    assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
  }
});
test('pending query cannot silently rebind to a fresh state or detached owner', async () => {
  for (const change of [(h) => h.replace(), (h) => h.detach()]) {
    const h = fixture();
    h.defer();
    const pending = h.port.read(selector);
    change(h);
    h.resolve();
    await assert.rejects(pending);
    assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
  }
});
test('current selector mismatch never creates an available UI capture', async () => {
  for (const key of ['format', 'section', 'drawingNode']) {
    const h = fixture();
    h.read.observation[key] = key === 'format' ? 'hwp5' : 99;
    await assert.rejects(h.port.read(selector));
  }
});
test('dispatch getter state change is fenced before the only command call', async () => {
  const h = fixture(),
    r = await h.port.read(selector);
  Object.defineProperty(h.editor, 'dispatchCommand', {
    get() {
      h.replace();
      return async () => {
        throw Error('MustNotDispatch');
      };
    },
  });
  await assert.rejects(h.port.apply(r.capture, h.flow));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
});

test('non-square dispatch preserves original side and freezes its readback copy', async () => {
  const h = fixture(),
    r = await h.port.read(selector);
  h.read.observation.flow.textFlow = 'LEFT_ONLY';
  await h.port.apply(r.capture, {
    textWrap: 'TOP_AND_BOTTOM',
    textFlow: 'BOTH_SIDES',
  });
  assert.deepEqual(h.calls.find((v) => v.kind === 'write').payload.flow, {
    textWrap: 'TOP_AND_BOTTOM',
    textFlow: 'RIGHT_ONLY',
  });
});
test('unavailable and null flow never create default selection', async () => {
  for (const v of [null, { state: 'unavailable', reason: 'missing' }]) {
    const h = fixture();
    h.editor.getObjectBodyFlow = async () => v;
    assert.equal((await h.port.read(selector)).available, false);
    assert.equal(h.calls.length, 0);
  }
});
test('available null or unknown enum refuses without dispatch', async () => {
  for (const flow of [
    null,
    { textWrap: 'UNKNOWN', textFlow: 'BOTH_SIDES' },
    { textWrap: 'SQUARE', textFlow: null },
  ]) {
    const h = fixture();
    h.read.observation.flow = flow;
    await assert.rejects(h.port.read(selector));
    assert.equal(h.calls.filter((v) => v.kind === 'write').length, 0);
  }
});
test('uncertain dispatch consumes target and cannot replay', async () => {
  const h = fixture(),
    r = await h.port.read(selector);
  h.editor.dispatchCommand = async () => {
    throw Error('uncertain');
  };
  await assert.rejects(h.port.apply(r.capture, h.flow));
  await assert.rejects(h.port.apply(r.capture, h.flow));
});
