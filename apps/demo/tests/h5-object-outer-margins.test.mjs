import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectOuterMarginsPort } from '../src/object-outer-margins-port.ts';
import { outerMarginDraft, outerMarginValues } from '../src/object-outer-margins-input.ts';
import { createObjectOuterMarginsForm } from '../src/object-outer-margins-form.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { Document, all } from './fake-dom.mjs';
import { SET_OBJECT_OUTER_MARGINS_COMMAND } from '@hwpjs/core';
const tick = () => new Promise((r) => setImmediate(r));
const clean = { left: false, right: false, top: false, bottom: false };
function fixture(kind = 'textbox', margins = { left: -32768, right: 12345, top: 0, bottom: -1 }) {
  const target = Object.freeze({}),
    calls = [],
    token = {
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
      historyRecoveryRequired: false,
      content: { format: 'hwp5', readOnly: false },
    },
    live = true;
  const selector = { kind, section: 0, node: 19 };
  const read = {
    state: 'available',
    target,
    observation: { format: 'hwp5', kind, section: 0, drawingNode: 19, margins },
  };
  const editor = {
    getEditorState: () => state,
    async getObjectOuterMargins(selector, options) {
      calls.push({ kind: 'read', selector, options });
      return read;
    },
    async dispatchCommand(command, payload) {
      calls.push({ kind: 'write', command, payload });
      return { status: 'committed-with-snapshot' };
    },
  };
  const port = createObjectOuterMarginsPort(editor, () => live);
  return {
    editor,
    port,
    read,
    calls,
    target,
    selector,
    get state() {
      return state;
    },
    replace() {
      state = { ...state };
    },
    detach() {
      live = false;
    },
  };
}
function formFixture(margins, format = 'hwp5') {
  const f = fixture(format === 'hwp5' ? 'textbox' : 'drawing', margins);
  f.state.content.format = format;
  f.read.observation.format = format;
  const doc = new Document(),
    root = doc.createElement('main'),
    footer = doc.createElement('footer'),
    gate = createObjectPropertiesEditGate();
  let applied = 0;
  const form = createObjectOuterMarginsForm(
    root,
    footer,
    f.editor,
    f.selector,
    () => true,
    gate,
    () => applied++,
  );
  return {
    ...f,
    root,
    footer,
    form,
    gate,
    get applied() {
      return applied;
    },
    get apply() {
      return all(footer, (n) => n.dataset.role === 'object-outer-margins-apply')[0];
    },
    input(field) {
      return all(root, (n) => n.dataset.role === 'object-outer-margins-' + field)[0];
    },
    set(field, value) {
      this.input(field).value = value;
      this.input(field).dispatchEvent(new Event('input'));
    },
  };
}
test('H5 picture and textbox selectors issue distinct exact kind/component observations', async () => {
  for (const kind of ['picture', 'textbox']) {
    const f = fixture(kind),
      r = await f.port.read(f.selector);
    assert(r.available);
    assert.equal(f.calls[0].selector.node, 19);
    assert.equal(r.capture.read.observation.kind, kind);
    assert.equal(r.capture.read.observation.margins.left, -32768);
  }
});
test('cross-format selectors reject before SDK read', async () => {
  for (const [format, kind] of [
    ['hwp5', 'drawing'],
    ['hwpx', 'textbox'],
    ['hwpx', 'picture'],
  ]) {
    const f = fixture(kind);
    f.state.content.format = format;
    assert.equal((await f.port.read(f.selector)).available, false);
    assert.equal(f.calls.length, 0);
  }
});
test('H5 kind is mandatory and exact; format section component mismatches reject', async () => {
  for (const patch of [
    { kind: undefined },
    { kind: 'picture' },
    { format: 'hwpx' },
    { section: 1 },
    { drawingNode: 12 },
  ]) {
    const f = fixture();
    Object.assign(f.read.observation, patch);
    await assert.rejects(f.port.read(f.selector));
    assert.equal(f.calls.filter((v) => v.kind === 'write').length, 0);
  }
});
test('HX optional kind remains compatible but wrong kind is refused', async () => {
  for (const kind of [undefined, 'drawing', 'textbox']) {
    const f = fixture('drawing', { left: 0, right: 1, top: 2, bottom: 3 });
    f.state.content.format = 'hwpx';
    f.read.observation.format = 'hwpx';
    f.read.observation.kind = kind;
    if (kind === 'textbox') await assert.rejects(f.port.read(f.selector));
    else assert((await f.port.read(f.selector)).available);
  }
});
test('H5 signed observations retain signs including small negative source units', () => {
  const before = { left: -32768, right: 32767, top: -1, bottom: 0 },
    d = outerMarginDraft(before, 'hwp5');
  assert(d.left.startsWith('-'));
  assert(d.top.startsWith('-'));
  assert.equal(d.right, '115.595');
  assert.equal(before.left, -32768);
  assert.throws(() => outerMarginDraft(before));
  for (const v of [-32769, 32768, NaN, -0])
    assert.throws(() => outerMarginDraft({ ...before, left: v }, 'hwp5'));
});
test('every negative direction requires explicit valid correction before any write', () => {
  const f = fixture(),
    d = outerMarginDraft(f.read.observation.margins, 'hwp5');
  assert.throws(() => outerMarginValues(d, clean, f.read.observation.margins, 'hwp5'));
  assert.throws(() =>
    outerMarginValues(
      { ...d, left: '0' },
      { ...clean, left: true },
      f.read.observation.margins,
      'hwp5',
    ),
  );
  assert.deepEqual(
    outerMarginValues(
      { ...d, left: '0', bottom: '2.54' },
      { ...clean, left: true, bottom: true },
      f.read.observation.margins,
      'hwp5',
    ),
    { left: 0, right: 12345, top: 0, bottom: 720 },
  );
});
test('port rejects invalid writes without consuming valid capture then commits corrected copy once', async () => {
  const f = fixture(),
    r = await f.port.read(f.selector);
  await assert.rejects(f.port.apply(r.capture, f.read.observation.margins));
  assert(f.port.current(r.capture));
  const value = { left: 0, right: 12345, top: 0, bottom: 720 };
  await f.port.apply(r.capture, value);
  const w = f.calls.find((v) => v.kind === 'write');
  assert.equal(w.command, SET_OBJECT_OUTER_MARGINS_COMMAND);
  assert.equal(w.payload.target, f.target);
  assert.deepEqual(w.payload.margins, value);
  assert.notEqual(w.payload.margins, value);
  await assert.rejects(f.port.apply(r.capture, value));
  assert.equal(f.calls.filter((v) => v.kind === 'write').length, 1);
});
test('mutable observation cannot silently change signed original or selector after capture', async () => {
  const f = fixture(),
    r = await f.port.read(f.selector);
  f.read.observation.margins.left = 0;
  f.selector.node = 12;
  assert.equal(r.capture.read.observation.margins.left, -32768);
  assert.equal(r.capture.selector.node, 19);
});
test('H5 ready read still refuses changed doc readonly poisoned and stale snapshots', async () => {
  for (const change of [
    (f) => f.replace(),
    (f) => f.detach(),
    (f) => (f.state.content.format = 'hwpx'),
    (f) => f.state.token.viewRevision++,
    (f) => (f.state.content.readOnly = true),
    (f) => (f.state.nativeHistoryStats = { poisoned: true }),
  ]) {
    const f = fixture(),
      r = await f.port.read(f.selector);
    change(f);
    assert.equal(f.port.current(r.capture), false);
    await assert.rejects(f.port.apply(r.capture, { left: 0, right: 0, top: 0, bottom: 0 }));
    assert.equal(f.calls.filter((v) => v.kind === 'write').length, 0);
  }
});
test('form displays signed H5 source and disables apply until all negatives corrected', async () => {
  const h = formFixture();
  await tick();
  assert(h.input('left').value.startsWith('-'));
  assert(h.input('bottom').value.startsWith('-'));
  assert.equal(h.apply.disabled, true);
  assert.equal(h.input('left').disabled, false);
  h.apply.dispatchEvent(new Event('click'));
  await tick();
  assert.equal(h.calls.filter((v) => v.kind === 'write').length, 0);
  h.set('left', '0');
  assert.equal(h.apply.disabled, true);
  h.set('bottom', '2.54');
  assert.equal(h.apply.disabled, false);
  h.apply.dispatchEvent(new Event('click'));
  await tick();
  assert.deepEqual(h.calls.find((v) => v.kind === 'write').payload.margins, {
    left: 0,
    right: 12345,
    top: 0,
    bottom: 720,
  });
  assert.equal(h.applied, 1);
  h.form.dispose();
});
test('form composition and legacy229 protect shared H5/HX margin apply', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const h = formFixture({ left: 0, right: 1, top: 0, bottom: 0 }, format);
    await tick();
    h.set('top', '2.54');
    h.root.dispatchEvent(new Event('compositionstart'));
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((v) => v.kind === 'write').length, 0);
    h.root.dispatchEvent(new Event('compositionend'));
    const down = new Event('keydown');
    Object.defineProperty(down, 'keyCode', { value: 229 });
    h.root.dispatchEvent(down);
    assert.equal(h.apply.disabled, true);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((v) => v.kind === 'write').length, 0);
    const up = new Event('keyup');
    Object.defineProperty(up, 'keyCode', { value: 229 });
    h.root.dispatchEvent(up);
    assert.equal(h.apply.disabled, false);
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((v) => v.kind === 'write').length, 1);
    h.form.dispose();
  }
});
