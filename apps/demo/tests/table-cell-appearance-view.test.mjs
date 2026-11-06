import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellAppearanceView } from '../src/table-cell-appearance-view.ts';
import { createTableCellAppearancePort } from '../src/table-cell-appearance-port.ts';
import { createTableInsertDialog } from '../src/table-insert-dialog.ts';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
function setup(cap = true) {
  const f = fixture();
  f.state.capabilities.cellAppearanceAvailable = cap;
  const p = createTableCellAppearancePort(f.editor, f.api),
    c = p.capture(),
    dom = documentFixture(),
    calls = [];
  const view = createTableCellAppearanceView(dom.root, c, {
    apply: (d, keepOpen) => calls.push({ d, keepOpen }),
    dismiss: () => calls.push('dismiss'),
  });
  const role = (n) => dom.role('appearance-' + n),
    choose = (n, v) => {
      role(n).value = v;
      fire(role(n), 'change');
    };
  const border = () => {
    choose('border-style', 'SOLID');
    choose('border-width', '12');
    choose('border-hex', '#000000');
  };
  return { f, p, c, dom, view, calls, role, choose, border };
}
test('supported two tabs with explicit current-value unknown; initial confirm dismisses without mutation', () => {
  const s = setup();
  assert.equal(s.role('border-style').value, '');
  assert.equal(s.role('border-hex').value, '');
  const tabs = all(s.dom.root).filter((n) => n.getAttribute('role') === 'tab');
  assert.deepEqual(
    tabs.map((n) => n.textContent),
    ['테두리', '배경'],
  );
  assert.equal(s.role('apply').disabled, true);
  assert.equal(s.role('confirm').disabled, false);
  fire(s.role('confirm'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  s.view.destroy();
});
test('explicit border plus background produces one combined draft; apply keeps open and confirm closes', () => {
  const s = setup();
  s.border();
  s.choose('background-hex', '#abcdef');
  fire(s.role('apply'), 'click');
  fire(s.role('confirm'), 'click');
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0].keepOpen, true);
  assert.equal(s.calls[1].keepOpen, false);
  assert.equal(s.calls[0].d.border.edges, 15);
  assert.equal(s.calls[0].d.background.color, '#abcdef');
  s.view.destroy();
});
test('range is explicit one-based input and background cannot silently apply to one cell', () => {
  const s = setup();
  s.border();
  s.choose('background-hex', '#abcdef');
  s.choose('mode', 'range');
  assert.equal(s.role('apply').disabled, true);
  assert.match(s.role('status').textContent, /현재 셀/);
  s.role('background-enabled').checked = false;
  fire(s.role('background-enabled'), 'change');
  assert.equal(s.role('apply').disabled, false);
  fire(s.role('apply'), 'click');
  assert.equal(s.calls[0].d.border.startRow, '1');
  assert.equal(s.calls[0].d.border.endColumn, '1');
  assert.equal(s.calls[0].d.background, null);
  assert.equal(s.role('background-hex').disabled, true);
  s.view.destroy();
});
test('IME, busy, stale and detached handlers prevent duplicate submissions and dismissal', () => {
  const s = setup();
  s.border();
  const dialog = s.dom.role('table-cell-appearance-dialog');
  fire(dialog, 'compositionstart');
  fire(s.role('apply'), 'click');
  fire(s.role('cancel'), 'click');
  assert.equal(s.calls.length, 0);
  fire(dialog, 'compositionend');
  s.view.setBusy(true);
  fire(s.role('apply'), 'click');
  s.view.setBusy(false);
  s.view.setStale('stale');
  fire(s.role('confirm'), 'click');
  assert.equal(s.calls.length, 0);
  const cancel = s.role('cancel'),
    apply = s.role('apply');
  s.view.destroy();
  fire(cancel, 'click');
  fire(apply, 'click');
  assert.equal(s.calls.length, 0);
});
test('reset after recapture clears every dirty intent without fabricating observed values', () => {
  const s = setup();
  s.border();
  s.choose('background-hex', '#ffffff');
  s.view.reset(s.p.capture());
  assert.equal(s.role('border-enabled').checked, false);
  assert.equal(s.role('background-enabled').checked, false);
  assert.equal(s.role('border-style').value, '');
  assert.equal(s.role('background-hex').value, '');
  assert.equal(s.role('apply').disabled, true);
  s.choose('border-style', 'SOLID');
  s.choose('border-width', '12');
  assert.equal(s.role('apply').disabled, true);
  s.view.destroy();
});
test('capability unavailable disables all mutation fields but allows cancel', () => {
  const s = setup(false);
  for (const n of [
    'border-style',
    'border-width',
    'border-hex',
    'background-hex',
    'apply',
    'confirm',
  ])
    assert.equal(s.role(n).disabled, true);
  fire(s.role('cancel'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  s.view.destroy();
});
test('tab keyboard navigation follows focus and ignores composition', () => {
  const s = setup(),
    a = s.role('border-tab'),
    b = s.role('background-tab');
  fire(a, 'keydown', { key: 'ArrowRight', isComposing: true });
  assert.equal(a.getAttribute('aria-selected'), 'true');
  fire(a, 'keydown', { key: 'ArrowRight' });
  assert.equal(s.dom.doc.activeElement, b);
  assert.equal(b.getAttribute('aria-selected'), 'true');
  fire(b, 'keydown', { key: 'Home' });
  assert.equal(s.dom.doc.activeElement, a);
  s.view.destroy();
});
test('table creation uses five-by-five defaults with only real fixed dimensions', () => {
  const dom = documentFixture(),
    calls = [];
  const view = createTableInsertDialog(dom.root, {
    onInsert: (d) => calls.push(d),
    onDismiss: () => {},
  });
  assert.equal(dom.role('table-rows').value, '5');
  assert.equal(dom.role('table-columns').value, '5');
  fire(dom.role('table-insert'), 'click');
  assert.deepEqual(calls, [{ rows: '5', columns: '5', widthPoints: '360', rowHeightPoints: '18' }]);
  assert.equal(all(dom.root).filter((n) => n.tagName === 'FIELDSET').length, 2);
  view.destroy();
});
test('Native refusal remains visible when pending is released and clears only on next submission or recapture', () => {
  const s = setup();
  s.border();
  s.view.setBusy(true);
  s.view.setStatus('보호된 셀입니다.');
  s.view.setBusy(false);
  assert.equal(s.role('status').textContent, '보호된 셀입니다.');
  s.view.reset(s.p.capture());
  assert.doesNotMatch(s.role('status').textContent, /보호된/);
  s.view.destroy();
});
