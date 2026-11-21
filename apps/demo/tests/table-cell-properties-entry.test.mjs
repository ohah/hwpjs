import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellPropertiesView } from '../src/table-cell-properties-view.ts';
import { createTableCellPropertiesPort } from '../src/table-cell-properties-port.ts';
import { createTableCellPropertiesController } from '../src/table-cell-properties-tool.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
import { fixture } from './table-cell-properties-fixture.mjs';

test('cell properties offers the existing appearance route without a size write', () => {
  const f = fixture(),
    dom = documentFixture(),
    calls = [];
  const c = createTableCellPropertiesPort(f.editor, f.api).capture();
  const view = createTableCellPropertiesView(dom.root, c, {
    apply: () => calls.push('size'),
    dismiss() {},
    appearance: () => calls.push('appearance'),
    appearanceEnabled: true,
  });
  fire(dom.role('cell-properties-appearance'), 'click');
  assert.deepEqual(calls, ['appearance']);
  assert.equal(f.mutationCalls().length, 0);
  view.setStale('changed');
  fire(dom.role('cell-properties-appearance'), 'click');
  assert.deepEqual(calls, ['appearance']);
  view.destroy();
});
test('appearance navigation is blocked during composition or a pending size write', () => {
  const f = fixture(),
    dom = documentFixture(),
    calls = [];
  const c = createTableCellPropertiesPort(f.editor, f.api).capture();
  const view = createTableCellPropertiesView(dom.root, c, {
    apply() {},
    dismiss() {},
    appearance: () => calls.push('appearance'),
    appearanceEnabled: true,
  });
  fire(dom.role('table-cell-properties-dialog'), 'compositionstart');
  fire(dom.role('cell-properties-appearance'), 'click');
  assert.deepEqual(calls, []);
  fire(dom.role('table-cell-properties-dialog'), 'compositionend');
  view.setBusy(true);
  fire(dom.role('cell-properties-appearance'), 'click');
  assert.deepEqual(calls, []);
  view.destroy();
});
test('controller destroys size modal before appearance recaptures and rejects stale owners', () => {
  const f = fixture(),
    dom = documentFixture(),
    events = [];
  const port = createTableCellPropertiesPort(f.editor, f.api);
  let callbacks;
  const tool = createTableCellPropertiesController({
    root: dom.root,
    port,
    onStatus() {},
    onClose() {},
    onAppearance() {
      events.push('appearance');
    },
    appearanceAvailable: () => true,
    createView(root, capture, next) {
      callbacks = next;
      return {
        focus() {},
        setBusy() {},
        setStatus() {},
        setStale() {},
        destroy() {
          events.push('destroy');
        },
      };
    },
  });
  tool.open();
  callbacks.appearance();
  assert.deepEqual(events, ['destroy', 'appearance']);
  tool.open();
  f.state.selection.startUnit = 1;
  callbacks.appearance();
  assert.deepEqual(events, ['destroy', 'appearance']);
  tool.dispose();
});
test('appearance navigation does not discard uncommitted size input', () => {
  const f = fixture(),
    dom = documentFixture(),
    calls = [];
  const c = createTableCellPropertiesPort(f.editor, f.api).capture();
  const view = createTableCellPropertiesView(dom.root, c, {
    apply() {},
    dismiss() {},
    appearance: () => calls.push('appearance'),
    appearanceEnabled: true,
  });
  dom.role('cell-height').value = '30';
  fire(dom.role('cell-height'), 'input');
  fire(dom.role('cell-properties-appearance'), 'click');
  assert.deepEqual(calls, []);
  view.destroy();
});
