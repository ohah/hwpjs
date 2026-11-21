import { createObjectGeometryForm } from '../src/object-geometry-form.ts';
import { createObjectOuterMarginsForm } from '../src/object-outer-margins-form.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, all } from './fake-dom.mjs';
import { createObjectBodyFlowForm } from '../src/object-body-flow-form.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { SET_OBJECT_BODY_FLOW_COMMAND } from '@hwpjs/core';
const tick = () => new Promise((r) => setImmediate(r));
function fixture(options = {}) {
  const doc = new Document(),
    root = doc.createElement('main'),
    footer = doc.createElement('footer'),
    gate = createObjectPropertiesEditGate(),
    target = Object.freeze({}),
    calls = [];
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state = {
      token,
      stateVersion: 1,
      status: 'ready',
      content: { format: 'hwpx', readOnly: false },
    },
    live = true,
    closed = 0,
    resolveRead,
    resolveWrite;
  const read = {
    state: 'available',
    target,
    observation: {
      format: 'hwpx',
      section: 0,
      drawingNode: 12,
      flow: options.flow ?? { textWrap: 'SQUARE', textFlow: 'RIGHT_ONLY' },
    },
  };
  const editor = {
    getEditorState: () => state,
    async getObjectBodyFlow(selector, settings) {
      calls.push({ kind: 'read', selector, settings });
      if (options.deferredRead) return await new Promise((r) => (resolveRead = () => r(read)));
      return options.nullRead
        ? null
        : options.unavailable
          ? { state: 'unavailable', reason: 'Unsupported' }
          : read;
    },
    async dispatchCommand(command, payload) {
      calls.push({ kind: 'write', command, payload });
      if (options.deferredWrite)
        return await new Promise(
          (r) => (resolveWrite = () => r({ status: 'committed-with-snapshot' })),
        );
      if (options.throws) throw Error('uncertain');
      return { status: options.status ?? 'committed-with-snapshot' };
    },
  };
  const form = createObjectBodyFlowForm(
    root,
    footer,
    editor,
    { kind: 'drawing', section: 0, node: 12 },
    () => live,
    gate,
    () => closed++,
  );
  const find = (role) =>
    all(root, (n) => n.dataset.role === role)[0] ?? all(footer, (n) => n.dataset.role === role)[0];
  return {
    root,
    footer,
    form,
    gate,
    target,
    calls,
    editor,
    read,
    get state() {
      return state;
    },
    get closed() {
      return closed;
    },
    get wrap() {
      return find('object-body-flow-wrap');
    },
    get side() {
      return find('object-body-flow-side');
    },
    get apply() {
      return find('object-body-flow-apply');
    },
    get status() {
      return find('object-body-flow-status');
    },
    change(field, value) {
      this[field].value = value;
      this[field].dispatchEvent(new Event('change'));
    },
    replace() {
      state = { ...state };
    },
    detach() {
      live = false;
    },
    resolveRead() {
      resolveRead();
    },
    resolveWrite() {
      resolveWrite();
    },
  };
}
const writes = (h) => h.calls.filter((c) => c.kind === 'write');
test('reads current flow without defaults and dispatches one typed target once', async () => {
  const h = fixture();
  await tick();
  assert.equal(h.wrap.value, 'SQUARE');
  assert.equal(h.side.value, 'RIGHT_ONLY');
  assert.equal(h.apply.disabled, true);
  h.change('side', 'LEFT_ONLY');
  assert.equal(h.apply.disabled, false);
  h.apply.dispatchEvent(new Event('click'));
  h.apply.dispatchEvent(new Event('click'));
  await tick();
  assert.equal(writes(h).length, 1);
  assert.equal(writes(h)[0].command, SET_OBJECT_BODY_FLOW_COMMAND);
  assert.equal(writes(h)[0].payload.target, h.target);
  assert.deepEqual(writes(h)[0].payload.flow, {
    textWrap: 'SQUARE',
    textFlow: 'LEFT_ONLY',
  });
  assert.equal(h.closed, 1);
  h.form.dispose();
});
test('every non-square disables side and preserves original observed side', async () => {
  for (const wrap of ['TOP_AND_BOTTOM', 'BEHIND_TEXT', 'IN_FRONT_OF_TEXT']) {
    const h = fixture();
    await tick();
    h.change('side', 'LEFT_ONLY');
    h.change('wrap', wrap);
    assert.equal(h.side.disabled, true);
    assert.equal(h.side.value, 'RIGHT_ONLY');
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.deepEqual(writes(h)[0].payload.flow, {
      textWrap: wrap,
      textFlow: 'RIGHT_ONLY',
    });
    h.form.dispose();
  }
});
test('non-square original does not invent or reset its side on open', async () => {
  const h = fixture({
    flow: { textWrap: 'BEHIND_TEXT', textFlow: 'LARGEST_ONLY' },
  });
  await tick();
  assert.equal(h.side.value, 'LARGEST_ONLY');
  assert.equal(h.side.disabled, true);
  assert.equal(h.apply.disabled, true);
  h.form.dispose();
});
test('unavailable or null read leaves blank disabled controls and sends nothing', async () => {
  for (const options of [
    { unavailable: true },
    { nullRead: true },
    { flow: { textWrap: null, textFlow: null } },
  ]) {
    const h = fixture(options);
    await tick();
    assert.equal(h.wrap.value, '');
    assert.equal(h.side.value, '');
    assert.equal(h.wrap.disabled, true);
    assert.equal(h.apply.disabled, true);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(writes(h).length, 0);
    h.form.dispose();
  }
});
test('stale selection doc token readonly or poisoned snapshot refuses before dispatch', async () => {
  for (const change of [
    (h) => h.replace(),
    (h) => h.detach(),
    (h) => h.state.token.viewRevision++,
    (h) => (h.state.content.readOnly = true),
    (h) => (h.state.historyRecoveryRequired = true),
    (h) => (h.state.nativeHistoryStats = { poisoned: true }),
  ]) {
    const h = fixture();
    await tick();
    h.change('wrap', 'TOP_AND_BOTTOM');
    change(h);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(writes(h).length, 0);
    h.form.dispose();
  }
});
test('composition anywhere in dialog blocks apply even synthetic click', async () => {
  const h = fixture();
  await tick();
  h.change('side', 'LEFT_ONLY');
  h.root.dispatchEvent(new Event('compositionstart'));
  assert.equal(h.apply.disabled, true);
  h.apply.dispatchEvent(new Event('click'));
  await tick();
  assert.equal(writes(h).length, 0);
  h.root.dispatchEvent(new Event('compositionend'));
  assert.equal(h.apply.disabled, false);
  h.apply.dispatchEvent(new Event('click'));
  await tick();
  assert.equal(writes(h).length, 1);
  h.form.dispose();
});
test('dirty geometry or margins conflicts with body flow and cannot start queued second commit', async () => {
  for (const lane of ['geometry', 'margins']) {
    const h = fixture();
    await tick();
    h.gate.setDirty(lane, true);
    h.change('side', 'LEFT_ONLY');
    assert.equal(h.gate.conflict, true);
    assert.equal(h.apply.disabled, true);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(writes(h).length, 0);
    h.gate.setDirty(lane, false);
    assert.equal(h.apply.disabled, false);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(writes(h).length, 1);
    h.form.dispose();
  }
});
test('in-flight write disables all other lanes and repeated apply', async () => {
  const h = fixture({ deferredWrite: true });
  await tick();
  h.change('side', 'LEFT_ONLY');
  h.apply.dispatchEvent(new Event('click'));
  assert.equal(h.gate.busy, true);
  assert.equal(h.gate.begin('geometry'), false);
  assert.equal(h.gate.begin('margins'), false);
  h.apply.dispatchEvent(new Event('click'));
  assert.equal(writes(h).length, 1);
  h.resolveWrite();
  await tick();
  assert.equal(h.gate.busy, false);
  h.form.dispose();
});
test('uncertain or failed apply consumes capture and never replays', async () => {
  for (const options of [{ status: 'unknown' }, { throws: true }]) {
    const h = fixture(options);
    await tick();
    h.change('side', 'LEFT_ONLY');
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.closed, 0);
    assert.equal(h.apply.disabled, true);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(writes(h).length, 1);
    h.form.dispose();
  }
});
test('disposal during pending read never publishes values or writes', async () => {
  const h = fixture({ deferredRead: true });
  h.form.dispose();
  h.resolveRead();
  await tick();
  assert.equal(h.root.children.length, 0);
  assert.equal(h.footer.children.length, 0);
  assert.equal(writes(h).length, 0);
});
test('document switch during read is refused', async () => {
  const h = fixture({ deferredRead: true });
  h.replace();
  h.resolveRead();
  await tick();
  assert.equal(h.wrap.value, '');
  assert.equal(h.apply.disabled, true);
  assert.equal(writes(h).length, 0);
  h.form.dispose();
});

test('all three real forms share conflict ownership and teardown releases only disposed lane', async () => {
  const h = fixture();
  h.editor.getObjectGeometry = async () => ({
    state: 'available',
    target: Object.freeze({}),
    observation: {
      frame: {
        width: 7200,
        height: 3600,
        horizontalOffset: 0,
        verticalOffset: 0,
        treatAsCharacter: false,
      },
      editable: { size: true, position: true },
    },
  });
  h.editor.getObjectOuterMargins = async () => ({
    state: 'available',
    target: Object.freeze({}),
    observation: {
      format: 'hwpx',
      section: 0,
      drawingNode: 12,
      margins: { left: 0, right: 0, top: 0, bottom: 0 },
    },
  });
  const geometry = createObjectGeometryForm(
      h.root,
      h.footer,
      h.editor,
      { kind: 'drawing', section: 0, node: 12 },
      () => {},
      h.gate,
    ),
    margins = createObjectOuterMarginsForm(
      h.root,
      h.footer,
      h.editor,
      { kind: 'drawing', section: 0, node: 12 },
      () => true,
      h.gate,
      () => {},
    );
  await tick();
  const find = (role) =>
    all(h.root, (n) => n.dataset.role === role)[0] ??
    all(h.footer, (n) => n.dataset.role === role)[0];
  const width = find('object-geometry-width');
  width.value = '30';
  width.dispatchEvent(new Event('input'));
  const left = find('object-outer-margins-left');
  left.value = '2.54';
  left.dispatchEvent(new Event('input'));
  h.change('side', 'LEFT_ONLY');
  assert.equal(h.gate.conflict, true);
  for (const role of [
    'object-geometry-apply',
    'object-outer-margins-apply',
    'object-body-flow-apply',
  ])
    assert.equal(find(role).disabled, true);
  h.form.dispose();
  assert.equal(h.gate.conflict, true, 'two other dirty forms survive');
  assert.equal(h.gate.allowed('geometry'), false);
  assert.equal(h.gate.allowed('margins'), false);
  geometry.dispose();
  margins.dispose();
  assert.equal(h.footer.children.length, 0);
  assert.equal(writes(h).length, 0);
});
test('disposing in-flight body flow retains lock until completion and never closes late', async () => {
  const h = fixture({ deferredWrite: true });
  await tick();
  h.change('side', 'LEFT_ONLY');
  h.apply.dispatchEvent(new Event('click'));
  h.form.dispose();
  assert.equal(h.gate.busy, true);
  assert.equal(h.gate.begin('margins'), false);
  h.resolveWrite();
  await tick();
  assert.equal(h.gate.busy, false);
  assert.equal(h.closed, 0);
  assert.equal(h.gate.allowed('geometry'), true);
  assert.equal(h.gate.allowed('margins'), true);
});
