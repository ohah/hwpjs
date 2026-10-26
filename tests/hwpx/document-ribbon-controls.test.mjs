import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentRibbon } from '../../web/preview/document-ribbon-controls.mjs';
import { createParagraphBreakControls } from '../../web/preview/paragraph-break-controls.mjs';
import { RibbonNode, ribbonFixture, emit } from './document-ribbon-dom.mjs';

const tab = (f, page) => f.document.getElementById(`document-ribbon-tab-${page}`);
const panel = (f, page) => f.document.getElementById(`document-ribbon-panel-${page}`);
const selected = (f) =>
  ['home', 'insert', 'view'].filter(
    (page) => tab(f, page).getAttribute('aria-selected') === 'true',
  );

test('flow ribbon mirrors menu authority, rechecks stale permissions and releases its subscription', () => {
  const page = new EventTarget(),
    column = new EventTarget(),
    listeners = new Set(),
    calls = [];
  let enabled = false;
  const registry = {
    commands: () =>
      ['page', 'column'].map((kind) => ({ id: `menu-insert-${kind}-break`, enabled })),
    execute(id) {
      calls.push(id);
      enabled = false;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  const controls = createParagraphBreakControls({ registry, page, column });
  assert.equal(page.disabled, true);
  page.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, []);
  enabled = true;
  for (const fn of listeners) fn();
  assert.equal(page.disabled, false);
  assert.equal(column.disabled, false);
  column.dispatchEvent(new Event('click'));
  assert.deepEqual(calls, ['menu-insert-column-break']);
  assert.equal(page.disabled, true);
  enabled = true;
  for (const fn of listeners) fn();
  enabled = false;
  page.dispatchEvent(new Event('click'));
  assert.equal(calls.length, 1);
  controls.close();
  controls.close();
  assert.equal(listeners.size, 0);
  enabled = true;
  page.dispatchEvent(new Event('click'));
  assert.equal(calls.length, 1);
  assert.equal(page.disabled, true);
});

test('ribbon moves the original controls and never grants visibility or mutation permissions', () => {
  const f = ribbonFixture(),
    originalRoot = [...f.root.childNodes],
    originalQuick = [...f.quick.childNodes];
  f.groups[3].hidden = true;
  f.groups[0].disabled = true;
  const controls = createDocumentRibbon(f.root);
  assert.deepEqual(selected(f), ['home']);
  assert.equal(tab(f, 'home').tabIndex, 0);
  assert.equal(panel(f, 'insert').hidden, true);
  assert.equal(panel(f, 'insert').tabIndex, 0);
  assert.equal(panel(f, 'home').childNodes[0], f.groups[0]);
  assert.equal(tab(f, 'insert').getAttribute('aria-controls'), panel(f, 'insert').id);
  assert.equal(panel(f, 'insert').getAttribute('aria-labelledby'), tab(f, 'insert').id);
  emit(f.root, 'click', tab(f, 'insert'));
  assert.deepEqual(selected(f), ['insert']);
  assert.equal(panel(f, 'insert').hidden, false);
  assert.deepEqual(panel(f, 'insert').lastScroll, { block: 'nearest', inline: 'nearest' });
  assert.equal(f.groups[3].hidden, true, 'unsupported table form stays hidden');
  assert.equal(f.groups[0].disabled, true, 'ribbon never enables a command');
  controls.close();
  controls.close();
  assert.deepEqual(f.root.childNodes, originalRoot);
  assert.deepEqual(f.quick.childNodes, originalQuick);
  assert.equal(f.groups[3].hidden, true);
  assert.equal(f.groups[0].disabled, true);
});

test('ribbon menu delegation reveals an existing target without executing an edit', () => {
  const f = ribbonFixture(),
    button = new RibbonNode(f.document);
  f.groups[0].append(button);
  let commands = 0;
  button.addEventListener('click', () => commands++);
  const controls = createDocumentRibbon(f.root);
  emit(f.root, 'click', tab(f, 'view'));
  emit(f.root, 'click', button);
  assert.deepEqual(selected(f), ['home']);
  assert.equal(commands, 0);
  emit(f.root, 'click', { window: true });
  const old = tab(f, 'view');
  controls.close();
  emit(f.root, 'click', old);
  assert.equal(f.document.getElementById('document-ribbon-tabs'), null);
});

test('ribbon keyboard navigation wraps and ignores composition handled and external input', () => {
  const f = ribbonFixture(),
    controls = createDocumentRibbon(f.root);
  const list = f.document.getElementById('document-ribbon-tabs');
  for (const [key, from, to] of [
    ['ArrowLeft', 'home', 'view'],
    ['ArrowRight', 'view', 'home'],
    ['End', 'home', 'view'],
    ['Home', 'view', 'home'],
  ]) {
    assert.equal(emit(list, 'keydown', tab(f, from), { key }).defaultPrevented, true);
    assert.deepEqual(selected(f), [to]);
    assert.equal(f.document.activeElement, tab(f, to));
  }
  for (const properties of [
    { isComposing: true },
    { keyCode: 229 },
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
  ]) {
    assert.equal(
      emit(list, 'keydown', tab(f, 'home'), { key: 'ArrowRight', ...properties }).defaultPrevented,
      false,
    );
    assert.deepEqual(selected(f), ['home']);
  }
  assert.equal(emit(list, 'keydown', f.groups[0], { key: 'ArrowRight' }).defaultPrevented, false);
  assert.equal(emit(list, 'keydown', tab(f, 'home'), { key: 'Enter' }).defaultPrevented, false);
  const handled = new Event('keydown', { cancelable: true });
  handled.preventDefault();
  Object.defineProperties(handled, {
    target: { value: tab(f, 'home') },
    key: { value: 'ArrowRight' },
  });
  list.dispatchEvent(handled);
  assert.deepEqual(selected(f), ['home']);
  controls.close();
  emit(list, 'keydown', tab(f, 'home'), { key: 'End' });
  assert.equal(f.document.getElementById('document-ribbon-tabs'), null);
});

test('ribbon rejects missing duplicate nested and colliding groups before moving any controls', () => {
  assert.throws(() => createDocumentRibbon(null), /MissingDocumentRibbonRoot/);
  for (const mutate of [
    (f) => f.groups[0].remove(),
    (f) =>
      f.root.append(Object.assign(new RibbonNode(f.document), { selector: f.groups[0].selector })),
    (f) => f.groups[0].append(f.groups[1]),
    (f) => f.root.append(Object.assign(new RibbonNode(f.document), { id: 'document-ribbon-tabs' })),
  ]) {
    const f = ribbonFixture();
    mutate(f);
    const before = [...f.root.childNodes],
      quick = [...f.quick.childNodes];
    assert.throws(
      () => createDocumentRibbon(f.root),
      /InvalidDocumentRibbonGroup|NestedDocumentRibbonGroup|DuplicateDocumentRibbonId/,
    );
    assert.deepEqual(f.root.childNodes, before);
    assert.deepEqual(f.quick.childNodes, quick);
  }
});
