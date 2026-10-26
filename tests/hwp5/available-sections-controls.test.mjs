import test from 'node:test';
import assert from 'node:assert/strict';
import { createAvailableSectionsControls } from '../../web/preview/available-sections-controls.mjs';
import {
  availableSectionsRequest,
  availableSectionsSummary,
} from '../../web/preview/hwp5-available-preview.mjs';
import { sectionInventory, checkedSectionInventory } from '../../js/hwp5-section-inventory.mjs';

const content = {
  format: 'hwp5',
  readOnly: true,
  availableSectionsOnly: true,
  sectionInventory: sectionInventory(2, 1),
};
function harness(reopen) {
  const handlers = new Map(),
    button = {
      hidden: false,
      disabled: false,
      addEventListener(kind, fn) {
        handlers.set(kind, fn);
      },
      removeEventListener(kind, fn) {
        assert.equal(handlers.get(kind), fn);
        handlers.delete(kind);
      },
      click() {
        handlers.get('click')?.();
      },
    },
    note = { textContent: '' };
  const controls = createAvailableSectionsControls({ button, note, reopen });
  return { controls, button, note, handlers };
}

test('available-section offer requires the precise load failure and complete native capability and never retries automatically', () => {
  const calls = [],
    source = Object.freeze({ name: 'source.hwp' }),
    h = harness((file) => calls.push(file));
  assert(h.button.hidden && h.button.disabled);
  for (const reply of [
    { kind: 'save', error: 'SectionCountMismatch', availableSectionsPreviewAvailable: true },
    { kind: 'load', error: 'InvalidFat', availableSectionsPreviewAvailable: true },
    { kind: 'load', error: 'SectionCountMismatch' },
    { kind: 'load', error: 'SectionCountMismatch', availableSectionsPreviewAvailable: 'true' },
  ])
    assert.equal(h.controls.offer(source, reply), false);
  assert.deepEqual(calls, []);
  assert.equal(
    h.controls.offer(source, {
      kind: 'load',
      error: 'SectionCountMismatch',
      availableSectionsPreviewAvailable: true,
    }),
    true,
  );
  assert(!h.button.hidden && !h.button.disabled);
  assert(h.note.textContent.includes('원본을 수정하지 않고'));
  assert.deepEqual(calls, []);
  h.button.click();
  h.button.click();
  assert.deepEqual(calls, [source]);
  assert(h.button.hidden && h.button.disabled);
  h.controls.loaded(content);
  assert(h.note.textContent.includes('선언 2구역'));
  assert(h.note.textContent.includes('저장된 1구역'));
  assert(h.note.textContent.includes('편집·다운로드를 허용하지 않습니다'));
  h.controls.reset();
  h.button.click();
  assert.equal(h.note.textContent, '');
  assert.equal(calls.length, 1);
  h.controls.close();
  assert.equal(h.handlers.size, 0);
});

test('late preview errors cannot overwrite a different selected document or survive close', async () => {
  let reject;
  const h = harness(
    () =>
      new Promise((_, fail) => {
        reject = fail;
      }),
  );
  const offer = () =>
    h.controls.offer(
      {},
      { kind: 'load', error: 'SectionCountMismatch', availableSectionsPreviewAvailable: true },
    );
  offer();
  h.button.click();
  h.controls.loaded({ format: 'hwpx' });
  reject(new Error('old'));
  await Promise.resolve();
  assert.equal(h.note.textContent, '');
  offer();
  h.button.click();
  reject(new Error('current'));
  await Promise.resolve();
  assert(h.note.textContent.includes('current'));
  offer();
  h.button.click();
  h.controls.close();
  reject(new Error('closed'));
  await Promise.resolve();
  assert.equal(h.note.textContent, '');
  assert.equal(offer(), false);
});

test('available preview policy and shared metadata validation reject coercion and inconsistent inventory', () => {
  assert.equal(availableSectionsRequest({}), false);
  assert.equal(availableSectionsRequest({ availableSectionsOnly: true }), true);
  assert.equal(availableSectionsRequest({ format: 'hwpx', availableSectionsOnly: false }), false);
  for (const value of [null, 0, 1, 'true', {}, []])
    assert.throws(
      () => availableSectionsRequest({ availableSectionsOnly: value }),
      /InvalidAvailableSectionsPolicy/,
    );
  assert.throws(
    () => availableSectionsRequest({ format: 'hwpx', availableSectionsOnly: true }),
    /UnsupportedAvailableSectionsFormat/,
  );
  for (const value of [0, -1, 1025, 0.5, Infinity, NaN, true, '2']) {
    assert.throws(() => sectionInventory(value, 1), /InvalidSectionInventory/);
    assert.throws(() => sectionInventory(1, value), /InvalidSectionInventory/);
  }
  assert.deepEqual(
    checkedSectionInventory(Object.freeze({ declared: 1, available: 1, mismatch: false })),
    { declared: 1, available: 1, mismatch: false },
  );
  assert.throws(
    () => checkedSectionInventory({ declared: 2, available: 1, mismatch: false }),
    /InvalidSectionInventory/,
  );
  assert.throws(
    () => availableSectionsSummary({ ...content, readOnly: false }),
    /InvalidAvailableSectionsPreview/,
  );
  assert.throws(
    () => availableSectionsSummary({ ...content, format: 'hwpx' }),
    /InvalidAvailableSectionsPreview/,
  );
});
