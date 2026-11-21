import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, all } from './fake-dom.mjs';
import { createObjectOuterMarginsForm } from '../src/object-outer-margins-form.ts';
import { createObjectGeometryForm } from '../src/object-geometry-form.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { SET_OBJECT_OUTER_MARGINS_COMMAND, SET_OBJECT_GEOMETRY_COMMAND } from '@hwpjs/core';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(options = {}) {
  const doc = new Document(),
    root = doc.createElement('main'),
    footer = doc.createElement('footer');
  const target = Object.freeze({}),
    geometryTarget = Object.freeze({}),
    calls = [],
    gate = createObjectPropertiesEditGate();
  let closed = 0,
    live = true,
    resolve;
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
    content: { format: options.format ?? 'hwpx', readOnly: options.readOnly ?? false },
  };
  const margins = { left: 1, right: 32767, top: 0, bottom: 12345 };
  const read = {
    state: 'available',
    target,
    observation: { format: 'hwpx', section: 0, drawingNode: 12, margins },
  };
  const editor = {
    getEditorState: () => state,
    async getObjectOuterMargins(selector, settings) {
      calls.push({ kind: 'read', selector, settings });
      if (options.deferredRead)
        return await new Promise((r) => {
          resolve = () => r(read);
        });
      return options.unavailable ? { state: 'unavailable', reason: 'UnsupportedOwner' } : read;
    },
    async getObjectGeometry() {
      return {
        state: 'available',
        target: geometryTarget,
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
      };
    },
    async dispatchCommand(command, payload) {
      calls.push({ kind: 'write', command, payload });
      if (options.deferredWrite)
        return await new Promise((r) => {
          resolve = () => r({ status: options.status ?? 'committed-with-snapshot' });
        });
      return { status: options.status ?? 'committed-with-snapshot' };
    },
  };
  const form = createObjectOuterMarginsForm(
    root,
    footer,
    editor,
    { kind: 'drawing', section: 0, node: 12 },
    () => live,
    gate,
    () => closed++,
  );
  return {
    root,
    footer,
    form,
    editor,
    gate,
    calls,
    target,
    margins,
    get state() {
      return state;
    },
    replace() {
      state = { ...state };
    },
    retoken() {
      state.token.viewRevision++;
    },
    detach() {
      live = false;
    },
    resolve() {
      resolve();
    },
    get closed() {
      return closed;
    },
    input(field) {
      return all(root, (n) => n.dataset.role === 'object-outer-margins-' + field)[0];
    },
    get apply() {
      return all(footer, (n) => n.dataset.role === 'object-outer-margins-apply')[0];
    },
    set(field, text) {
      const n = this.input(field);
      n.value = text;
      n.dispatchEvent(new Event('input'));
    },
  };
}
test('form uses fresh separate margin query and exact target, converting only edited direction', async () => {
  const h = fixture();
  try {
    await tick();
    assert.deepEqual(h.calls[0].selector, { kind: 'drawing', section: 0, node: 12 });
    assert.equal(h.input('right').value, '115.595');
    h.set('top', '2.54');
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    const w = h.calls.find((x) => x.kind === 'write');
    assert.equal(w.command, SET_OBJECT_OUTER_MARGINS_COMMAND);
    assert.equal(w.payload.target, h.target);
    assert.deepEqual(w.payload.margins, { ...h.margins, top: 720 });
    assert.equal(h.closed, 1);
  } finally {
    h.form.dispose();
  }
});
test('typo never dispatches or changes original values; unchanged request uses Native known-no-op once', async () => {
  const h = fixture({ status: 'known-no-op' });
  try {
    await tick();
    h.set('top', '2mm');
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
    assert(h.root.textContent.includes('올바른 mm'));
    h.set('top', '0');
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.deepEqual(h.calls.find((x) => x.kind === 'write').payload.margins, h.margins);
    assert.equal(h.closed, 1);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((x) => x.kind === 'write').length, 1);
  } finally {
    h.form.dispose();
  }
});
test('readonly or mismatched H5 drawing selector never turns display geometry into margin authority', async () => {
  for (const options of [{ readOnly: true }, { format: 'hwp5' }, { unavailable: true }]) {
    const h = fixture(options);
    try {
      await tick();
      assert.equal(h.input('left').disabled, true);
      assert.equal(h.apply.disabled, true);
      h.apply.dispatchEvent(new Event('click'));
      await tick();
      assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
      if (!options.unavailable) assert.equal(h.calls.length, 0);
    } finally {
      h.form.dispose();
    }
  }
});
test('stale source, in-place token change and detached drawing refuse the old capture', async () => {
  for (const change of ['replace', 'retoken', 'detach']) {
    const h = fixture();
    try {
      await tick();
      h[change]();
      h.set('left', '1');
      h.apply.dispatchEvent(new Event('click'));
      await tick();
      assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
      assert.equal(h.apply.disabled, true);
    } finally {
      h.form.dispose();
    }
  }
});
test('pending read cannot publish on stale source or after disposal', async () => {
  for (const dispose of [true, false]) {
    const h = fixture({ deferredRead: true });
    if (dispose) h.form.dispose();
    else h.replace();
    h.resolve();
    await tick();
    assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
    if (!dispose) {
      assert.equal(h.apply.disabled, true);
      h.form.dispose();
    }
  }
});
test('duplicate apply and pending dispose issue exactly one write and never late-close', async () => {
  const h = fixture({ deferredWrite: true });
  await tick();
  h.set('left', '1');
  h.apply.dispatchEvent(new Event('click'));
  h.apply.dispatchEvent(new Event('click'));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 1);
  h.form.dispose();
  h.resolve();
  await tick();
  assert.equal(h.closed, 0);
});
test('uncertain completion has no retry, automatic fresh target or second history operation', async () => {
  const h = fixture({ status: 'committed-refresh-required' });
  try {
    await tick();
    h.set('left', '1');
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.closed, 0);
    assert.equal(h.apply.disabled, true);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.deepEqual(
      h.calls.map((x) => x.kind),
      ['read', 'write'],
    );
  } finally {
    h.form.dispose();
  }
});
test('geometry and margins dirty together reject both real form handlers and recover after draft revert', async () => {
  const h = fixture();
  const geometry = createObjectGeometryForm(
    h.root,
    h.footer,
    h.editor,
    { kind: 'drawing', section: 0, node: 12 },
    () => {},
    h.gate,
  );
  try {
    await tick();
    const width = all(h.root, (n) => n.dataset.role === 'object-geometry-width')[0];
    const apply = all(h.footer, (n) => n.dataset.role === 'object-geometry-apply')[0];
    width.value = '50';
    width.dispatchEvent(new Event('input'));
    h.set('left', '1');
    assert.equal(h.gate.conflict, true);
    assert.equal(h.apply.disabled, true);
    assert.equal(apply.disabled, true);
    h.apply.dispatchEvent(new Event('click'));
    apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
    h.set('left', '0.004');
    assert.equal(h.gate.conflict, false);
    apply.dispatchEvent(new Event('click'));
    await tick();
    const writes = h.calls.filter((x) => x.kind === 'write');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].command, SET_OBJECT_GEOMETRY_COMMAND);
    assert.deepEqual(writes[0].payload.patch, { width: 14173 });
  } finally {
    geometry.dispose();
    h.form.dispose();
  }
});
test('a pending geometry mutation locks margin apply even with pristine drafts', async () => {
  const h = fixture({ deferredWrite: true });
  const geometry = createObjectGeometryForm(
    h.root,
    h.footer,
    h.editor,
    { kind: 'drawing', section: 0, node: 12 },
    () => {},
    h.gate,
  );
  await tick();
  const apply = all(h.footer, (n) => n.dataset.role === 'object-geometry-apply')[0];
  apply.dispatchEvent(new Event('click'));
  assert.equal(h.gate.busy, true);
  assert.equal(h.apply.disabled, true);
  h.apply.dispatchEvent(new Event('click'));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 1);
  h.resolve();
  await tick();
  geometry.dispose();
  h.form.dispose();
});

test('unavailable optional margins keep existing geometry editing independent', async () => {
  const h = fixture({ unavailable: true });
  const geometry = createObjectGeometryForm(
    h.root,
    h.footer,
    h.editor,
    { kind: 'drawing', section: 0, node: 12 },
    () => {},
    h.gate,
  );
  try {
    await tick();
    assert.equal(h.apply.disabled, true);
    const width = all(h.root, (n) => n.dataset.role === 'object-geometry-width')[0];
    width.value = '50';
    width.dispatchEvent(new Event('input'));
    all(h.footer, (n) => n.dataset.role === 'object-geometry-apply')[0].dispatchEvent(
      new Event('click'),
    );
    await tick();
    const writes = h.calls.filter((x) => x.kind === 'write');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].command, SET_OBJECT_GEOMETRY_COMMAND);
  } finally {
    geometry.dispose();
    h.form.dispose();
  }
});

test('reverting geometry draft releases conflict for a single explicit margin commit', async () => {
  const h = fixture();
  const geometry = createObjectGeometryForm(
    h.root,
    h.footer,
    h.editor,
    { kind: 'drawing', section: 0, node: 12 },
    () => {},
    h.gate,
  );
  try {
    await tick();
    const width = all(h.root, (n) => n.dataset.role === 'object-geometry-width')[0];
    width.value = '50';
    width.dispatchEvent(new Event('input'));
    h.set('left', '1');
    assert.equal(h.gate.conflict, true);
    width.value = '25.4';
    width.dispatchEvent(new Event('input'));
    assert.equal(h.gate.conflict, false);
    assert.equal(h.apply.disabled, false);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    const writes = h.calls.filter((x) => x.kind === 'write');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].command, SET_OBJECT_OUTER_MARGINS_COMMAND);
    assert.deepEqual(writes[0].payload.margins, { ...h.margins, left: 283 });
  } finally {
    geometry.dispose();
    h.form.dispose();
  }
});
