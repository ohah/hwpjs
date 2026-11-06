import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellBackgroundView } from '../src/table-cell-background-view.ts';
import { createTableCellBackgroundPort } from '../src/table-cell-background-port.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
function setup(cap = true) {
  const f = fixture();
  f.state.capabilities.cellBackgroundAvailable = cap;
  const dom = documentFixture(),
    calls = [];
  const port = createTableCellBackgroundPort(f.editor, f.api);
  const view = createTableCellBackgroundView(dom.root, port.capture(), {
    apply: (d) => calls.push(d),
    dismiss: () => calls.push('dismiss'),
  });
  return { dom, calls, view };
}
test('unknown original is not a white/default fill; choice required even for neutral black', () => {
  const { dom, calls, view } = setup();
  assert.equal(dom.role('cell-background-current').textContent, '현재 배경: 미관측');
  assert.equal(dom.role('table-cell-background-dialog').getAttribute('aria-label'), '셀 배경');
  assert.equal(dom.role('cell-background-hex').value, '');
  const apply = dom.role('cell-background-apply');
  assert.equal(apply.disabled, true);
  fire(apply, 'click');
  assert.equal(calls.length, 0);
  fire(dom.role('cell-background-color'), 'change');
  assert.equal(apply.disabled, false);
  fire(apply, 'click');
  assert.deepEqual(calls, [{ color: '#000000', dirty: true }]);
  view.destroy();
});
test('IME/busy/stale/invalid input block apply, cleanup rejects detached handlers', () => {
  const { dom, calls, view } = setup(),
    hex = dom.role('cell-background-hex'),
    apply = dom.role('cell-background-apply'),
    dialog = dom.role('table-cell-background-dialog'),
    cancel = dom.role('cell-background-cancel');
  hex.value = '#12345678';
  fire(hex, 'input');
  assert.equal(apply.disabled, true);
  hex.value = '#123456';
  fire(hex, 'input');
  fire(dialog, 'compositionstart');
  fire(apply, 'click');
  fire(cancel, 'click');
  assert.equal(calls.length, 0);
  fire(dialog, 'keydown', { key: 'Escape', isComposing: true });
  assert.equal(calls.length, 0);
  fire(dialog, 'compositionend');
  view.setBusy(true);
  fire(apply, 'click');
  assert.equal(calls.length, 0);
  view.setBusy(false);
  view.setStale('stale');
  fire(apply, 'click');
  assert.equal(calls.length, 0);
  view.destroy();
  fire(cancel, 'click');
  fire(apply, 'click');
  assert.equal(calls.length, 0);
});
test('current engine missing capability disables edits/apply, cancel remains real', () => {
  const { dom, calls, view } = setup(false);
  assert.equal(dom.role('cell-background-hex').disabled, true);
  assert.equal(dom.role('cell-background-apply').disabled, true);
  fire(dom.role('cell-background-cancel'), 'click');
  assert.deepEqual(calls, ['dismiss']);
  view.destroy();
});
test('typing exact black is explicit choice; picker no event stays no-op', () => {
  const { dom, calls, view } = setup();
  const hex = dom.role('cell-background-hex'),
    apply = dom.role('cell-background-apply');
  fire(apply, 'click');
  assert.equal(calls.length, 0);
  assert.equal(apply.disabled, true);
  hex.value = '#000000';
  fire(hex, 'input');
  assert.equal(apply.disabled, false);
  fire(apply, 'click');
  assert.deepEqual(calls, [{ color: '#000000', dirty: true }]);
  view.destroy();
});
