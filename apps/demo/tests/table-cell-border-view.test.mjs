import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellBorderView } from '../src/table-cell-border-view.ts';
import { createTableCellBorderPort } from '../src/table-cell-border-port.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
function setup(cap = true) {
  const f = fixture();
  f.state.capabilities.cellBorderAvailable = cap;
  const dom = documentFixture(),
    calls = [];
  const port = createTableCellBorderPort(f.editor, f.api);
  const view = createTableCellBorderView(dom.root, port.capture(), {
    apply: (d) => calls.push(d),
    dismiss: () => calls.push('dismiss'),
  });
  const choose = (name, value) => {
    const input = dom.role('cell-border-' + name);
    input.value = value;
    fire(input, 'change');
  };
  return { dom, calls, view, choose };
}
test('all initial border values unobserved; mask15 does not imply an observed border', () => {
  const s = setup(),
    role = (n) => s.dom.role('cell-border-' + n);
  assert.equal(role('current').textContent, '현재 선 모양·폭·색: 미관측');
  assert.equal(role('style').value, '');
  assert.equal(role('width').value, '');
  assert.equal(role('hex').value, '');
  for (const side of ['left', 'right', 'top', 'bottom']) assert.equal(role(side).checked, true);
  s.choose('style', 'NONE');
  s.choose('width', '10');
  assert.equal(role('apply').disabled, true);
  s.choose('hex', '#000000');
  assert.equal(role('apply').disabled, false);
  fire(role('apply'), 'click');
  assert.deepEqual(s.calls, [
    {
      edges: 15,
      style: 'NONE',
      width: '10',
      color: '#000000',
      dirty: { style: true, width: true, color: true },
    },
  ]);
  s.view.destroy();
});
test('per-side checks produce exact sparse masks; zero mask cannot apply', () => {
  const s = setup(),
    role = (n) => s.dom.role('cell-border-' + n);
  s.choose('style', 'DOUBLE_SLIM');
  s.choose('width', '500');
  s.choose('hex', '#abcdef');
  for (const side of ['right', 'top', 'bottom']) {
    role(side).checked = false;
    fire(role(side), 'change');
  }
  fire(role('apply'), 'click');
  assert.equal(s.calls[0].edges, 1);
  role('top').checked = true;
  fire(role('top'), 'change');
  fire(role('apply'), 'click');
  assert.equal(s.calls[1].edges, 5);
  role('left').checked = role('top').checked = false;
  fire(role('top'), 'change');
  assert.equal(role('apply').disabled, true);
  fire(role('apply'), 'click');
  assert.equal(s.calls.length, 2);
  s.view.destroy();
});
test('IME/busy/stale/invalid width block apply and detached handlers cannot dismiss', () => {
  const s = setup(),
    role = (n) => s.dom.role('cell-border-' + n);
  s.choose('style', 'SOLID');
  s.choose('width', '11');
  s.choose('hex', '#123456');
  assert.equal(role('apply').disabled, true);
  s.choose('width', '10');
  const dialog = s.dom.role('table-cell-border-dialog');
  fire(dialog, 'compositionstart');
  fire(role('apply'), 'click');
  fire(role('cancel'), 'click');
  fire(dialog, 'keydown', { key: 'Escape', isComposing: true });
  assert.equal(s.calls.length, 0);
  fire(dialog, 'compositionend');
  s.view.setBusy(true);
  fire(role('apply'), 'click');
  s.view.setBusy(false);
  s.view.setStale('stale');
  fire(role('apply'), 'click');
  assert.equal(s.calls.length, 0);
  const cancel = role('cancel'),
    apply = role('apply');
  s.view.destroy();
  fire(cancel, 'click');
  fire(apply, 'click');
  assert.equal(s.calls.length, 0);
});
test('missing capability disables each border input and preserves cancel', () => {
  const s = setup(false);
  for (const name of ['style', 'width', 'hex', 'color', 'left', 'right', 'top', 'bottom', 'apply'])
    assert.equal(s.dom.role('cell-border-' + name).disabled, true);
  fire(s.dom.role('cell-border-cancel'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  s.view.destroy();
});
