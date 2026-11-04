import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellPropertiesView } from '../src/table-cell-properties-view.ts';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
function setup(readOnly = false) {
  const f = fixture();
  f.state.content.readOnly = readOnly;
  const dom = documentFixture(),
    calls = [];
  const p = createTableCellPropertiesPort(f.editor, f.api);
  const view = createTableCellPropertiesView(dom.root, p.capture(), {
    apply: (d) => calls.push(d),
    dismiss: () => calls.push('dismiss'),
  });
  return { dom, calls, view };
}
test('현재 셀의 정확 원값과 실제 변경만 적용/높이0 명시 가능', () => {
  const { dom, calls, view } = setup();
  assert.equal(dom.role('cell-width').value, '37.79');
  assert.equal(dom.role('cell-height').value, '70.86');
  assert.equal(dom.role('cell-properties-apply').disabled, true);
  dom.role('cell-height').value = '0';
  fire(dom.role('cell-height'), 'input');
  fire(dom.role('cell-properties-apply'), 'click');
  assert.deepEqual(calls, [
    {
      widthPoints: '37.79',
      heightPoints: '0',
      mode: 'cell',
      dirty: { width: false, height: true },
    },
  ]);
  view.destroy();
});
test('composition·busy·stale는 실제 apply 콜백을 막음', () => {
  const { dom, calls, view } = setup();
  const apply = dom.role('cell-properties-apply');
  dom.role('cell-width').value = '38.79';
  fire(dom.role('cell-width'), 'input');
  fire(dom.role('table-cell-properties-dialog'), 'compositionstart');
  fire(apply, 'click');
  assert.equal(calls.length, 0);
  fire(dom.role('table-cell-properties-dialog'), 'compositionend');
  assert.equal(apply.disabled, false);
  view.setBusy(true);
  fire(apply, 'click');
  assert.equal(calls.length, 0);
  view.setBusy(false);
  view.setStale('stale');
  fire(apply, 'click');
  assert.equal(calls.length, 0);
  view.destroy();
});
test('readonly는 원값을 보이되 입력/apply 비활성, 취소는 허용', () => {
  const { dom, calls, view } = setup(true);
  assert.equal(dom.role('cell-width').disabled, true);
  assert.equal(dom.role('cell-properties-apply').disabled, true);
  fire(dom.role('cell-properties-cancel'), 'click');
  assert.deepEqual(calls, ['dismiss']);
  view.destroy();
});
test('정확 소수 밖 입력을 반올림하여 적용하지 않음', () => {
  const { dom, calls, view } = setup();
  dom.role('cell-width').value = '38.791';
  fire(dom.role('cell-width'), 'input');
  fire(dom.role('cell-properties-apply'), 'click');
  assert.equal(calls.length, 0);
  view.destroy();
});
test('Esc는 공용 modal lifecycle로 닫고 IME keydown은 가로채지 않음', () => {
  const { dom, calls, view } = setup();
  fire(dom.role('table-cell-properties-dialog'), 'keydown', { key: 'Escape', isComposing: true });
  assert.equal(calls.length, 0);
  fire(dom.role('table-cell-properties-dialog'), 'keydown', { key: 'Escape', isComposing: false });
  assert.deepEqual(calls, ['dismiss']);
  view.destroy();
});
