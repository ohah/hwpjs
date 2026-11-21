import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectOuterMarginsPort } from '../src/object-outer-margins-port.ts';
import { SET_OBJECT_OUTER_MARGINS_COMMAND } from '@hwpjs/core';
function fixture() {
  const target = Object.freeze({}),
    calls = [],
    margins = { left: 0, right: 1, top: 720, bottom: 32767 };
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
    observation: { format: 'hwpx', section: 0, drawingNode: 12, margins },
  };
  const editor = {
    getEditorState: () => state,
    async getObjectOuterMargins(selector, settings) {
      calls.push({ kind: 'read', selector, settings });
      return read;
    },
    async dispatchCommand(command, payload) {
      calls.push({ kind: 'write', command, payload });
      return { status: 'known-no-op' };
    },
  };
  const port = createObjectOuterMarginsPort(editor, () => live);
  return {
    editor,
    port,
    target,
    margins,
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
      editor.getObjectOuterMargins = async () =>
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
test('port retains only independently issued margin target and copies requested values', async () => {
  const h = fixture(),
    r = await h.port.read(selector);
  assert.equal(r.available, true);
  const margins = { ...h.margins };
  await h.port.apply(r.capture, margins);
  const w = h.calls.find((x) => x.kind === 'write');
  assert.equal(w.command, SET_OBJECT_OUTER_MARGINS_COMMAND);
  assert.equal(w.payload.target, h.target);
  assert.notEqual(w.payload.margins, margins);
  assert.deepEqual(w.payload.margins, margins);
  await assert.rejects(h.port.apply(r.capture, margins));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 1);
});
test('clone and another port cannot use UI capture even if current Native observation matches', async () => {
  const h = fixture(),
    r = await h.port.read(selector),
    other = createObjectOuterMarginsPort(h.editor, () => true);
  assert.equal(h.port.current({ ...r.capture }), false);
  assert.equal(other.current(r.capture), false);
  await assert.rejects(other.apply(r.capture, h.margins));
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
    await assert.rejects(h.port.apply(r.capture, h.margins));
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
  await assert.rejects(h.port.apply(r.capture, h.margins));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
});
