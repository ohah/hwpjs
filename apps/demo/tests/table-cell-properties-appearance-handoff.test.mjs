import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellPropertiesController } from '../src/table-cell-properties-tool.ts';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { createTableCellAppearancePort } from '../src/table-cell-appearance-port.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function setup({ sizeAvailable = false, appearanceAvailable = true } = {}) {
  const f = fixture();
  f.state.capabilities.cellSizeAvailable = sizeAvailable;
  f.state.capabilities.cellAppearanceAvailable = true;
  const dom = documentFixture(),
    port = createTableCellPropertiesPort(f.editor, f.api),
    events = [],
    captures = [];
  let focus = 0;
  const controller = createTableCellPropertiesController({
    root: dom.root,
    port,
    onStatus: (s) => events.push(['status', s]),
    onClose: () => {
      focus++;
    },
    onPresentationChange: () => events.push(['presentation']),
    appearanceAvailable: () => appearanceAvailable,
    onAppearance: () => {
      events.push(['appearance']);
      assert.equal(
        dom.root.querySelector('dialog:modal'),
        null,
        'old numeric modal must close before recapture',
      );
      const next = createTableCellAppearancePort(f.editor, f.api);
      const capture = next.capture();
      captures.push(capture);
      events.push(['recapture', capture.cell]);
      next.dispose();
    },
  });
  controller.open();
  const dialog = dom.role('table-cell-properties-dialog'),
    button = dom.role('cell-properties-appearance');
  return { f, dom, port, controller, events, captures, dialog, button, focus: () => focus };
}
const noNative = (s) => assert.equal(s.f.mutationCalls().length, 0, 'NoNativeMutation');
test('readonly numeric modal hands off after close to same actual appearance port owner with zero mutation/focus restore', () => {
  const s = setup(),
    before = s.f.state,
    selected = before.selection;
  assert.equal(s.dom.role('cell-width').disabled, true);
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  assert.equal(s.button.disabled, false);
  fire(s.button, 'click');
  assert.equal(s.captures.length, 1);
  assert.equal(s.captures[0].state, before);
  assert.equal(s.f.state.selection, selected);
  assert.deepEqual(s.captures[0].cell, {
    section: 0,
    tableNode: 81,
    listNode: 82,
    width: 3779,
    height: 7086,
    row: 0,
    column: 0,
  });
  assert.equal(s.dialog.open, false);
  assert.equal(s.dialog.parentElement, undefined);
  assert.equal(s.focus(), 0);
  noNative(s);
  assert.equal(s.f.calls.filter((x) => x.type === 'selection' || x.type === 'issue').length, 0);
  s.controller.dispose();
  assert.equal(s.f.listeners.size, 0);
});
test('appearance capability false disables route even though size readonly values remain visible', () => {
  const s = setup({ appearanceAvailable: false });
  assert.equal(s.button.disabled, true);
  fire(s.button, 'click');
  assert.equal(s.captures.length, 0);
  assert.equal(s.dialog.open, true);
  noNative(s);
  s.controller.dispose();
});
for (const patch of [
  { selection: { section: 0, paragraph: 15, startUnit: 1, endUnit: 1, owner: 'moved' } },
  { viewRevision: 1 },
  { operationRevision: 1 },
])
  test('stale capture cannot hand off: ' + JSON.stringify(patch), () => {
    const s = setup();
    s.f.replace(patch);
    assert.equal(s.button.disabled, true);
    fire(s.button, 'click');
    assert.equal(s.captures.length, 0);
    noNative(s);
    s.controller.dispose();
  });
test('silent in-place selection mutation fails controller fence even if view has no state notification', () => {
  const s = setup();
  s.f.mutate((state) => (state.selection.startUnit = 1));
  assert.equal(s.button.disabled, false);
  fire(s.button, 'click');
  assert.equal(s.captures.length, 0);
  noNative(s);
  s.controller.dispose();
});
test('document replacement closes old modal and late retained button cannot open appearance', () => {
  const s = setup();
  s.f.replace({ documentId: 'different', selection: null });
  assert.equal(s.dialog.open, false);
  fire(s.button, 'click');
  assert.equal(s.captures.length, 0);
  assert.equal(s.focus(), 0);
  noNative(s);
  s.controller.dispose();
});
test('composition lifecycle and composing click block handoff, normal click works only after end', () => {
  const s = setup();
  fire(s.dialog, 'compositionstart');
  assert.equal(s.button.disabled, true);
  fire(s.button, 'click');
  assert.equal(s.captures.length, 0);
  fire(s.dialog, 'compositionend');
  assert.equal(s.button.disabled, false);
  fire(s.button, 'click', { isComposing: true });
  assert.equal(s.captures.length, 0);
  fire(s.button, 'click', { isComposing: false });
  assert.equal(s.captures.length, 1);
  noNative(s);
  s.controller.dispose();
});
for (const [role, value] of [
  ['cell-width', '14.33'],
  ['cell-height', '26.00'],
])
  test('unapplied ' + role + ' draft blocks appearance instead of dropping dimensions', () => {
    const s = setup({ sizeAvailable: true });
    const field = s.dom.role(role);
    field.value = value;
    fire(field, 'input');
    assert.equal(s.button.disabled, true);
    fire(s.button, 'click');
    assert.equal(s.captures.length, 0);
    assert.equal(s.dialog.open, true);
    noNative(s);
    s.controller.dispose();
  });
test('restoring original numeric lexical value clears dirty route without mutation', () => {
  const s = setup({ sizeAvailable: true });
  const h = s.dom.role('cell-height');
  h.value = '26.00';
  fire(h, 'input');
  assert.equal(s.button.disabled, true);
  h.value = '025.00';
  fire(h, 'input');
  assert.equal(s.button.disabled, false);
  fire(s.button, 'click');
  assert.equal(s.captures.length, 1);
  noNative(s);
  s.controller.dispose();
});
test('busy in-flight size request prevents appearance and duplicate mutation; later close does not transfer', async () => {
  const s = setup({ sizeAvailable: true });
  let resolve;
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    return new Promise((r) => {
      resolve = r;
    });
  };
  const h = s.dom.role('cell-height');
  h.value = '26.00';
  fire(h, 'input');
  fire(s.dom.role('cell-properties-apply'), 'click');
  await tick();
  assert.equal(s.f.mutationCalls().length, 1);
  assert.equal(s.button.disabled, true);
  fire(s.button, 'click');
  assert.equal(s.captures.length, 0);
  assert.equal(s.f.mutationCalls().length, 1);
  s.controller.close();
  resolve({ status: 'committed-with-snapshot', state: s.f.state });
  await tick();
  assert.equal(s.captures.length, 0);
  s.controller.dispose();
});
test('disposed view and retained click never hand off or mutate', () => {
  const s = setup();
  s.controller.dispose();
  fire(s.button, 'click');
  assert.equal(s.captures.length, 0);
  noNative(s);
  assert.equal(s.f.listeners.size, 0);
});
