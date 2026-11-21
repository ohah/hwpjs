import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesView } from '../src/object-properties-view.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
function setup() {
  const dom = documentFixture();
  let replacements = 0,
    applies = 0,
    dismissals = 0;
  const file = dom.doc.createElement('input');
  file.type = 'file';
  file.hidden = true;
  const view = createObjectPropertiesView(
    dom.root,
    { state: {}, target: { section: 0, pictureNode: 7, width: 7200, height: 3600 }, reason: null },
    { width: '25.4', height: '12.7' },
    {
      replacementInput: file,
      onReplace: () => {
        replacements++;
      },
      onApply: () => {
        applies++;
      },
      onDismiss: () => {
        dismissals++;
      },
    },
  );
  return {
    ...dom,
    view,
    file,
    counts: () => ({ replacements, applies }),
    dismissals: () => dismissals,
  };
}
test('native file input belongs to the active modal and replacement is separately admitted', () => {
  const f = setup();
  assert.equal(f.file.parentElement.parentElement, f.role('object-properties'));
  fire(f.role('object-replace-picture'), 'click');
  assert.equal(f.counts().replacements, 0);
  f.view.setReplacementAvailability(true, 'ready');
  fire(f.role('object-replace-picture'), 'click');
  assert.deepEqual(f.counts(), { replacements: 1, applies: 0 });
  f.view.destroy();
});
test('reading is cancellable while submitted replacement has an explicit continuing label', () => {
  const f = setup();
  f.view.setReplacementAvailability(true, 'ready');
  f.view.setReplacementPending('reading');
  assert.equal(f.role('object-replace-picture').disabled, true);
  assert.equal(f.role('object-apply').disabled, true);
  assert.equal(f.role('object-cancel').textContent, '취소');
  f.view.setReplacementPending('sending');
  assert.match(f.role('object-cancel').textContent, /계속/);
  f.view.destroy();
});
test('replacement cannot combine a local size draft or IME into a hidden resize command', () => {
  const f = setup();
  f.view.setReplacementAvailability(true, 'ready');
  f.role('object-width').value = '50.8';
  fire(f.role('object-width'), 'input');
  fire(f.role('object-properties'), 'compositionstart');
  fire(f.role('object-replace-picture'), 'click');
  assert.deepEqual(f.counts(), { replacements: 0, applies: 0 });
  fire(f.role('object-properties'), 'compositionend');
  fire(f.role('object-replace-picture'), 'click');
  assert.deepEqual(f.counts(), { replacements: 1, applies: 0 });
  f.view.destroy();
});

test('cancel from the nested file chooser does not dismiss object properties', () => {
  const f = setup();
  const dialog = f.role('object-properties');
  // The DOM fixture does not bubble EventTarget events. Deliver the same
  // original target to the dialog listener that Chrome does on file cancel.
  const cancel = new Event('cancel');
  Object.defineProperty(cancel, 'target', { value: f.file });
  dialog.dispatchEvent(cancel);
  assert.equal(f.dismissals(), 0);
  fire(dialog, 'cancel');
  assert.equal(f.dismissals(), 1);
  f.view.destroy();
});
