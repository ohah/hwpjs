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
