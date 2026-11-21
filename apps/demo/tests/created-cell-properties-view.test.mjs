import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatedCellPropertiesView } from '../src/created-cell-properties-view.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';

test('generated properties displays source dimensions and never invents current fill or stroke', () => {
  const dom = documentFixture(),
    calls = [];
  const view = createCreatedCellPropertiesView(
    dom.root,
    { width: 10000, height: 2000 },
    { apply: (patch) => calls.push(patch), dismiss() {} },
    null,
  );
  assert.equal(dom.role('created-cell-fill').value, '');
  assert.equal(dom.role('created-cell-border-style').value, '');
  assert.equal(dom.role('created-cell-apply').disabled, true);
  dom.role('created-cell-fill').value = 'abcdef';
  fire(dom.role('created-cell-fill'), 'input');
  fire(dom.role('created-cell-apply'), 'click');
  assert.deepEqual(calls, [{ appearance: { fill: { kind: 'solid', color: 0xabcdef } } }]);
  view.destroy();
});
test('generated old engine remains read-only while showing geometry', () => {
  const dom = documentFixture(),
    calls = [];
  const view = createCreatedCellPropertiesView(
    dom.root,
    { width: 10000, height: 2000 },
    { apply: (patch) => calls.push(patch), dismiss() {} },
    'Unavailable',
  );
  assert.equal(dom.role('created-cell-width').disabled, true);
  assert.equal(dom.role('created-cell-apply').disabled, true);
  fire(dom.role('created-cell-apply'), 'click');
  assert.deepEqual(calls, []);
  view.destroy();
});
test('generated sparse outer border omits unchanged size, fill and stroke components', () => {
  const dom = documentFixture(),
    calls = [];
  const view = createCreatedCellPropertiesView(
    dom.root,
    { width: 10000, height: 2000 },
    { apply: (patch) => calls.push(patch), dismiss() {} },
    null,
  );
  dom.role('created-cell-border-color').value = '123456';
  fire(dom.role('created-cell-border-color'), 'input');
  fire(dom.role('created-cell-apply'), 'click');
  assert.deepEqual(calls, [
    {
      appearance: {
        borders: Object.fromEntries(
          ['left', 'right', 'top', 'bottom'].map((edge) => [edge, { color: 0x123456 }]),
        ),
      },
    },
  ]);
  view.setStale();
  fire(dom.role('created-cell-apply'), 'click');
  assert.equal(calls.length, 1);
  view.destroy();
});

// DOM and shared SDK admission only; no Native history or save claim.
import { captureCreatedCellPropertiesRequest } from '../../../js/created-cell-properties.mjs';
function noneFixture() {
  const dom = documentFixture(),
    calls = [];
  const view = createCreatedCellPropertiesView(
    dom.root,
    { width: 10000, height: 2000 },
    { apply: (patch) => calls.push(patch), dismiss() {} },
    null,
  );
  return { dom, calls, view };
}
test('explicit none emits a sparse fill even with an invalid parked RGB draft', () => {
  const { dom, calls, view } = noneFixture();
  dom.role('created-cell-fill').value = 'invalid';
  fire(dom.role('created-cell-fill'), 'input');
  assert.equal(dom.role('created-cell-apply').disabled, true);
  dom.role('created-cell-fill-mode').value = 'none';
  fire(dom.role('created-cell-fill-mode'), 'change');
  assert.equal(dom.role('created-cell-fill').disabled, true);
  fire(dom.role('created-cell-apply'), 'click');
  assert.deepEqual(calls, [{ appearance: { fill: { kind: 'none' } } }]);
  const request = captureCreatedCellPropertiesRequest({
    section: 0,
    identity: '1',
    row: 0,
    column: 0,
    expected: { width: 10000, height: 2000 },
    ...calls[0],
  });
  assert.equal(request.appearance.fill.kind, 'none');
  assert.equal(Object.keys(request.appearance.fill).length, 1);
  view.destroy();
});
test('returning to untouched omits parked RGB while preserving border intent', () => {
  const { dom, calls, view } = noneFixture();
  dom.role('created-cell-fill').value = 'abcdef';
  fire(dom.role('created-cell-fill'), 'input');
  dom.role('created-cell-fill-mode').value = 'none';
  fire(dom.role('created-cell-fill-mode'), 'change');
  dom.role('created-cell-fill-mode').value = '';
  fire(dom.role('created-cell-fill-mode'), 'change');
  assert.equal(dom.role('created-cell-apply').disabled, true);
  assert.equal(dom.role('created-cell-fill').disabled, false);
  dom.role('created-cell-border-color').value = '123456';
  fire(dom.role('created-cell-border-color'), 'input');
  fire(dom.role('created-cell-apply'), 'click');
  assert.equal(Object.hasOwn(calls[0].appearance, 'fill'), false);
  view.destroy();
});
test('explicit solid requires RGB and none does not discard a parked valid color', () => {
  const { dom, calls, view } = noneFixture();
  dom.role('created-cell-fill-mode').value = 'solid';
  fire(dom.role('created-cell-fill-mode'), 'change');
  assert.equal(dom.role('created-cell-apply').disabled, true);
  dom.role('created-cell-fill').value = 'abcdef';
  fire(dom.role('created-cell-fill'), 'input');
  dom.role('created-cell-fill-mode').value = 'none';
  fire(dom.role('created-cell-fill-mode'), 'change');
  dom.role('created-cell-fill-mode').value = 'solid';
  fire(dom.role('created-cell-fill-mode'), 'change');
  fire(dom.role('created-cell-apply'), 'click');
  assert.deepEqual(calls, [{ appearance: { fill: { kind: 'solid', color: 0xabcdef } } }]);
  view.destroy();
});
test('none retains stale, busy and composition refusal', () => {
  const { dom, calls, view } = noneFixture();
  dom.role('created-cell-fill-mode').value = 'none';
  fire(dom.role('created-cell-fill-mode'), 'change');
  fire(view.element, 'compositionstart');
  fire(dom.role('created-cell-apply'), 'click');
  assert.equal(calls.length, 0);
  fire(view.element, 'compositionend');
  view.setBusy(true);
  fire(dom.role('created-cell-apply'), 'click');
  assert.equal(calls.length, 0);
  view.setBusy(false);
  view.setStale();
  fire(dom.role('created-cell-apply'), 'click');
  assert.equal(calls.length, 0);
  view.destroy();
});
test('shared admission rejects ambiguous none with color or null fill', () => {
  const base = {
    section: 0,
    identity: '1',
    row: 0,
    column: 0,
    expected: { width: 100, height: 20 },
  };
  for (const fill of [{ kind: 'none', color: 0xffffff }, null, {}])
    assert.throws(() => captureCreatedCellPropertiesRequest({ ...base, appearance: { fill } }));
});

import { createdCellAppearancePlan } from '../../../web/preview/created-cell-appearance-plan.mjs';
test('explicit none projection suppresses fill while keeping current borders; unknown is refused', () => {
  const edge = { style: 'SOLID', width_hundredth_mm: 10, color: 0x123456 };
  const value = {
    edges: [edge, edge, edge, edge],
    background: { none: {} },
    diagonal: { directions: 'none', stroke: { style: 'NONE', width_hundredth_mm: 10, color: 0 } },
  };
  const plan = createdCellAppearancePlan({ effectsSupported: true, value });
  assert.equal(plan.state, 'strokes');
  assert.equal(plan.strokes.length, 4);
  assert.equal(Object.hasOwn(plan, 'fill'), false);
  assert.equal(
    createdCellAppearancePlan({ effectsSupported: true, value: { ...value, background: null } })
      .state,
    'unavailable',
  );
});
