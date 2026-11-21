import test from 'node:test';
import assert from 'node:assert/strict';
import { createCellInsetsDraft } from '../src/table-cell-insets-draft.ts';
import { createTableCellPropertiesView } from '../src/table-cell-properties-view.ts';
import { createTableCellPropertiesController } from '../src/table-cell-properties-tool.ts';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { SET_ORIGINAL_CELL_INSETS_COMMAND } from '@hwpjs/core';
import { fixture } from './table-cell-properties-fixture.mjs';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const observation = {
  mode: 'inherit',
  effective: [1, 288, 432, 576],
  tableDefaults: [1, 288, 432, 576],
  frame: { width: 10000, height: 4000 },
};
const tick = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
test('insets unit changes keep exact effective axes and sparse zero distinguishes mode only', () => {
  const d = createCellInsetsDraft(observation);
  d.setMode('custom');
  assert.deepEqual(d.patch(), { mode: 'custom' });
  assert.equal(d.changed(), true);
  for (let i = 0; i < 3; i++) {
    assert.ok(d.changeUnit('pt'));
    assert.ok(d.changeUnit('mm'));
  }
  assert.deepEqual(d.patch(), { mode: 'custom' });
  d.edit('left', '0');
  assert.deepEqual(d.patch(), { mode: 'custom', left: 0 });
  d.setMode('inherit');
  assert.deepEqual(d.patch(), { mode: 'inherit' });
  assert.equal(d.changed(), false);
});
test('insets invalid, oversized and empty inner frame refuse without clamping', () => {
  for (const text of ['-1', '1e3', '327.68', 'NaN']) {
    const d = createCellInsetsDraft(observation);
    d.setMode('custom');
    d.changeUnit('pt');
    d.edit('left', text);
    assert.throws(() => d.patch());
  }
  const d = createCellInsetsDraft({ ...observation, frame: { width: 1000, height: 4000 } });
  d.setMode('custom');
  d.changeUnit('pt');
  d.edit('left', '9');
  assert.throws(() => d.patch());
});
function viewSetup(options = {}) {
  const f = fixture(),
    dom = documentFixture(),
    writes = [];
  const port = createTableCellPropertiesPort(f.editor, f.api);
  let binds = 0;
  const view = createTableCellPropertiesView(dom.root, port.capture(), {
    apply: (d) => writes.push({ size: d }),
    dismiss() {},
    insets: options.absent
      ? undefined
      : {
          observation,
          editable: !options.readonly,
          bindDialog() {
            binds++;
            return true;
          },
          apply: (patch) => writes.push({ patch }),
        },
  });
  return { f, dom, writes, view, binds };
}
test('unavailable and known readonly insets are visible without fabricated values or target', () => {
  const missing = viewSetup({ absent: true });
  assert.equal(missing.dom.role('cell-insets-mode').value, '');
  assert.equal(missing.dom.role('cell-insets-left').value, '');
  assert.equal(missing.dom.role('cell-insets-mode').disabled, true);
  missing.view.destroy();
  const ro = viewSetup({ readonly: true });
  assert.equal(ro.dom.role('cell-insets-mode').value, 'inherit');
  assert.equal(ro.dom.role('cell-insets-left').value, '0.00');
  assert.equal(ro.dom.role('cell-insets-mode').disabled, true);
  assert.equal(ro.binds, 0);
  ro.view.destroy();
});
test('insets mode-only commit, mixed groups refusal, busy and stale fencing', () => {
  const h = viewSetup(),
    mode = h.dom.role('cell-insets-mode'),
    apply = h.dom.role('cell-properties-apply');
  mode.value = 'custom';
  fire(mode, 'change');
  assert.equal(apply.disabled, false);
  const width = h.dom.role('cell-width');
  width.value = '14.00';
  fire(width, 'input');
  assert.equal(apply.disabled, true);
  width.value = '13.33';
  fire(width, 'input');
  assert.equal(apply.disabled, false);
  h.view.setBusy(true);
  fire(apply, 'click');
  assert.deepEqual(h.writes, []);
  h.view.setBusy(false);
  fire(apply, 'click');
  assert.deepEqual(h.writes, [{ patch: { mode: 'custom' } }]);
  h.view.setStale('stale');
  assert.equal(apply.disabled, true);
  h.view.destroy();
});
for (const format of ['hwp5', 'hwpx'])
  test(
    format + ' controller shares one modal capture and typed insets command without size fallback',
    async () => {
      const f = fixture(format),
        dom = documentFixture(),
        writes = [];
      let captureCount = 0,
        binds = 0,
        bound;
      const selected = Object.freeze({}),
        target = Object.freeze({});
      f.api.captureOriginalCellPropertiesSelection = () => {
        captureCount++;
        return {
          state: f.state,
          target: selected,
          current: () =>
            f.state.status === 'ready' &&
            (!bound || dom.root.querySelector('dialog:modal') === bound),
          bindDialog(element) {
            binds++;
            bound = element;
            return true;
          },
        };
      };
      f.state.capabilities.originalCellVerticalAlignmentAvailable = true;
      const selector = { section: 0, paragraph: 15, tableNode: 81, listNode: 82 };
      f.editor.getOriginalCellInsets = async (s) => {
        assert.equal(s, selected);
        return { state: 'available', target, observation, selector };
      };
      f.editor.getOriginalCellVerticalAlignment = async (s) => {
        assert.equal(s, selected);
        return { state: 'available', target: {}, value: 'TOP', selector };
      };
      f.editor.dispatchCommand = async (command, payload) => {
        writes.push({ command, payload });
        return { status: 'known-no-op' };
      };
      const port = createTableCellPropertiesPort(f.editor, f.api),
        controller = createTableCellPropertiesController({
          root: dom.root,
          port,
          onStatus() {},
          onClose() {},
        });
      controller.open();
      await tick();
      assert.equal(captureCount, 1);
      assert.equal(binds, 1);
      dom.role('cell-insets-mode').value = 'custom';
      fire(dom.role('cell-insets-mode'), 'change');
      fire(dom.role('cell-properties-apply'), 'click');
      await tick();
      assert.equal(writes.length, 1);
      assert.equal(writes[0].command, SET_ORIGINAL_CELL_INSETS_COMMAND);
      assert.equal(writes[0].payload.target, target);
      assert.deepEqual(writes[0].payload.patch, { mode: 'custom' });
      assert.equal(f.calls.filter((c) => c.type === 'mutation').length, 0);
      controller.dispose();
    },
  );
