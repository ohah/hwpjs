import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellPropertiesView } from '../src/table-cell-properties-view.ts';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
function setup(readOnly = false, options = {}) {
  const f = fixture(options.format);
  f.state.content.readOnly = readOnly;
  const dom = documentFixture(),
    calls = [];
  if (options.columnAvailable === false) f.state.capabilities.cellSizeBatchAvailable = false;
  const p = createTableCellPropertiesPort(f.editor, f.api),
    c = p.capture();
  const view = createTableCellPropertiesView(dom.root, c, {
    apply: (d) => calls.push(d),
    dismiss: () => calls.push('dismiss'),
  });
  return { dom, calls, view, f, p, c };
}
test('현재 셀의 정확 원값과 실제 변경만 적용/높이0 명시 가능', () => {
  const { dom, calls, view } = setup();
  assert.equal(dom.role('cell-width').value, '13.33');
  assert.equal(dom.role('cell-height').value, '25.00');
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
test('정확 소수 밖 pt 입력을 반올림하여 적용하지 않음', () => {
  const { dom, calls, view } = setup();
  dom.role('cell-size-unit').value = 'pt';
  fire(dom.role('cell-size-unit'), 'change');
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

function choose(s, role, value) {
  s.dom.role(role).value = value;
  fire(s.dom.role(role), 'change');
}
test('mm default and pt selector update accessible labels without losing width focus or generating intent', () => {
  const s = setup();
  assert.equal(s.dom.role('cell-size-unit').value, 'mm');
  assert.equal(s.dom.role('cell-width').getAttribute('aria-label'), '셀 너비 (mm)');
  assert.equal(s.dom.doc.activeElement, s.dom.role('cell-width'));
  s.dom.role('cell-size-unit').focus();
  choose(s, 'cell-size-unit', 'pt');
  assert.equal(s.dom.role('cell-width').value, '37.79');
  assert.equal(s.dom.role('cell-height').value, '70.86');
  assert.equal(s.dom.role('cell-width').getAttribute('aria-label'), '셀 너비 (pt)');
  assert.equal(s.dom.role('cell-size-unit-note').hidden, true);
  assert.equal(s.dom.doc.activeElement, s.dom.role('cell-size-unit'));
  choose(s, 'cell-size-unit', 'mm');
  assert.equal(s.dom.role('cell-size-unit-note').hidden, false);
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  fire(s.dom.role('cell-properties-apply'), 'click');
  assert.deepEqual(s.calls, []);
  assert.equal(s.f.mutationCalls().length, 0);
  s.view.destroy();
});
for (const format of ['hwp5', 'hwpx'])
  test(
    format + ' actual port receives exact untouched width and one explicitly edited mm height',
    async () => {
      const s = setup(false, { format });
      choose(s, 'cell-height', '1.00');
      fire(s.dom.role('cell-properties-apply'), 'click');
      assert.deepEqual(s.calls, [
        {
          widthPoints: '37.79',
          heightPoints: '2.83',
          mode: 'cell',
          dirty: { width: false, height: true },
        },
      ]);
      const reply = await s.p.apply(s.c, s.calls[0]);
      assert.equal(reply.status, 'committed-with-snapshot');
      assert.equal(s.f.mutationCalls().length, 1);
      assert.deepEqual(s.f.mutationCalls()[0].message, {
        kind: 'cell-size',
        section: 0,
        listNode: 82,
        width: 3779,
        height: 283,
      });
      assert.deepEqual(s.f.mutationCalls()[0].options, { mutation: true, token: s.c.state.token });
      s.view.destroy();
    },
  );
test('restoring original rounded mm label is a view and actual port no-op', async () => {
  const s = setup();
  choose(s, 'cell-height', '26.00');
  assert.equal(s.dom.role('cell-properties-apply').disabled, false);
  choose(s, 'cell-height', '25.00');
  choose(s, 'cell-size-unit', 'pt');
  assert.equal(s.dom.role('cell-height').value, '70.86');
  choose(s, 'cell-size-unit', 'mm');
  fire(s.dom.role('cell-properties-apply'), 'click');
  assert.equal(s.calls.length, 0);
  const reply = await s.p.apply(s.c, {
    widthPoints: '37.79',
    heightPoints: '70.86',
    mode: 'cell',
    dirty: { width: false, height: false },
  });
  assert.equal(reply.status, 'known-no-op');
  assert.equal(s.f.mutationCalls().length, 0);
  s.view.destroy();
});
test('pending pt integer survives unit toggles and real port leaves rounded untouched height exact', async () => {
  const s = setup();
  choose(s, 'cell-size-unit', 'pt');
  choose(s, 'cell-width', '37.80');
  for (let i = 0; i < 5; i++) {
    choose(s, 'cell-size-unit', 'mm');
    choose(s, 'cell-size-unit', 'pt');
  }
  assert.equal(s.dom.role('cell-width').value, '37.8');
  assert.equal(s.dom.role('cell-height').value, '70.86');
  fire(s.dom.role('cell-properties-apply'), 'click');
  assert.deepEqual(s.calls[0].dirty, { width: true, height: false });
  assert.equal((await s.p.apply(s.c, s.calls[0])).status, 'committed-with-snapshot');
  assert.deepEqual(s.f.mutationCalls()[0].message, {
    kind: 'cell-size',
    section: 0,
    listNode: 82,
    width: 3780,
    height: 7086,
  });
  s.view.destroy();
});
test('column mode uses shared planner with exact original height and does not send optional height when untouched', async () => {
  const s = setup();
  choose(s, 'cell-width', '14.00');
  choose(s, 'cell-size-mode', 'column');
  fire(s.dom.role('cell-properties-apply'), 'click');
  assert.equal((await s.p.apply(s.c, s.calls[0])).status, 'committed-with-snapshot');
  assert.deepEqual(s.f.mutationCalls()[0].message, {
    kind: 'table-column-width',
    section: 0,
    tableNode: 81,
    listNode: 82,
    width: 3969,
    expectedWidth: 3779,
  });
  s.view.destroy();
});
test('invalid lexical input blocks a unit switch atomically and retains old unit and error', () => {
  const s = setup();
  choose(s, 'cell-width', '13.333');
  choose(s, 'cell-size-unit', 'pt');
  assert.equal(s.dom.role('cell-size-unit').value, 'mm');
  assert.equal(s.dom.role('cell-width').value, '13.333');
  assert.equal(s.dom.role('cell-height').value, '25.00');
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  assert.match(s.dom.role('cell-properties-status').textContent, /단위를 바꾸기 전에/);
  choose(s, 'cell-width', '13.33');
  choose(s, 'cell-size-unit', 'pt');
  assert.equal(s.dom.role('cell-size-unit').value, 'pt');
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  assert.equal(s.f.mutationCalls().length, 0);
  s.view.destroy();
});
test('height zero remains valid but column width zero is refused after mm conversion', () => {
  const s = setup();
  choose(s, 'cell-width', '0');
  choose(s, 'cell-size-mode', 'column');
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  choose(s, 'cell-width', '13.33');
  choose(s, 'cell-height', '0');
  assert.equal(s.dom.role('cell-properties-apply').disabled, false);
  s.view.destroy();
});
for (const state of ['readonly', 'busy', 'stale', 'composing', 'disposed'])
  test('unit events cannot change values during ' + state, () => {
    const s = setup(state === 'readonly');
    if (state === 'busy') s.view.setBusy(true);
    if (state === 'stale') s.view.setStale('StaleTableCellSelection');
    if (state === 'composing') fire(s.dom.role('table-cell-properties-dialog'), 'compositionstart');
    const unit = s.dom.role('cell-size-unit');
    if (state === 'disposed') s.view.destroy();
    unit.value = 'pt';
    fire(unit, 'change');
    assert.equal(unit.value, 'mm');
    if (state !== 'disposed') {
      assert.equal(s.dom.role('cell-width').value, '13.33');
      assert.equal(s.calls.length, 0);
      s.view.destroy();
    }
  });
test('missing column capability remains disabled through unit switches and cancel never mutates', () => {
  const s = setup(false, { columnAvailable: false });
  choose(s, 'cell-size-unit', 'pt');
  assert.equal(
    s.dom.role('cell-size-mode').children.find((n) => n.value === 'column').disabled,
    true,
  );
  choose(s, 'cell-size-mode', 'column');
  choose(s, 'cell-width', '38.79');
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  fire(s.dom.role('cell-properties-cancel'), 'click');
  assert.deepEqual(s.calls, ['dismiss']);
  assert.equal(s.f.mutationCalls().length, 0);
  s.view.destroy();
});

test('formatting-only mm edits and original-label restoration do not create mutation intent', () => {
  const s = setup();
  choose(s, 'cell-height', '25');
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  choose(s, 'cell-height', '26.00');
  choose(s, 'cell-height', '025.00');
  assert.equal(s.dom.role('cell-properties-apply').disabled, true);
  choose(s, 'cell-size-unit', 'pt');
  assert.equal(s.dom.role('cell-height').value, '70.86');
  assert.equal(s.f.mutationCalls().length, 0);
  s.view.destroy();
});
test('column width zero blocks unit switching and composition end synchronizes committed lexical value', () => {
  const s = setup();
  choose(s, 'cell-width', '0');
  choose(s, 'cell-size-mode', 'column');
  choose(s, 'cell-size-unit', 'pt');
  assert.equal(s.dom.role('cell-size-unit').value, 'mm');
  assert.match(s.dom.role('cell-properties-status').textContent, /단위를 바꾸기 전에/);
  choose(s, 'cell-width', '13.33');
  fire(s.dom.role('table-cell-properties-dialog'), 'compositionstart');
  s.dom.role('cell-height').value = '1.00';
  fire(s.dom.role('table-cell-properties-dialog'), 'compositionend');
  fire(s.dom.role('cell-properties-apply'), 'click');
  assert.equal(s.calls[0].heightPoints, '2.83');
  assert.deepEqual(s.calls[0].dirty, { width: false, height: true });
  s.view.destroy();
});
test('unit edits never refresh a stale source lease in the actual port', async () => {
  const s = setup();
  choose(s, 'cell-height', '1.00');
  choose(s, 'cell-size-unit', 'pt');
  fire(s.dom.role('cell-properties-apply'), 'click');
  s.f.replace({ viewRevision: 1 });
  const result = await s.p.apply(s.c, s.calls[0]);
  assert.equal(result.status, 'rejected-unapplied');
  assert.equal(s.f.mutationCalls().length, 0);
  s.view.destroy();
});
