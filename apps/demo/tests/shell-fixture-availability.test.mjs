import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoShell } from '../src/shell.ts';
import { Document, all, fire } from './fake-dom.mjs';
const routes = { headless: '/demo/headless', vanilla: '/demo/vanilla', react: '/demo/react', svelte: '/demo/svelte' };
const entry = (id, available = true) => ({ id, name: id, available });
function setup(fixtures) {
  const root = new Document().createElement('main'), calls = [];
  const shell = createDemoShell(root, { framework: 'vanilla', routes, fixtures,
    getState: () => ({ title: '', status: '', openFixture: { enabled: true } }), onOpenFixture: id => calls.push(id) });
  const picker = all(root, node => node.dataset.role === 'fixture-picker')[0];
  const open = all(root, node => node.tagName === 'BUTTON' && node.textContent === '예제 열기')[0];
  return { root, shell, picker, open, calls };
}
test('missing options disabled and forced click blocked; legacy entries without availability stay usable', () => {
  const h = setup([entry('optional', false), { id: 'builtin', name: 'builtin' }]);
  assert.equal(h.picker.children[0].disabled, true); assert.match(h.picker.children[0].textContent, /파일 없음/);
  assert.equal(h.picker.value, 'builtin'); assert.equal(h.open.disabled, false);
  h.picker.value = 'optional'; fire(h.picker, 'change'); assert.equal(h.open.disabled, true);
  fire(h.open, 'click'); assert.deepEqual(h.calls, []);
  h.picker.value = 'builtin'; fire(h.picker, 'change'); fire(h.open, 'click'); assert.deepEqual(h.calls, ['builtin']);
  h.shell.destroy();
});
test('refresh preserves available selection, falls back when missing, then clears if none; host retained', () => {
  const h = setup([entry('a'), entry('b'), entry('c', false)]);
  const canvas = h.root.ownerDocument.createElement('canvas'); h.shell.surfaceMount.append(canvas);
  h.picker.value = 'b'; h.shell.setFixtures([entry('c'), entry('b'), entry('a')]); assert.equal(h.picker.value, 'b');
  h.shell.setFixtures([entry('c'), entry('b', false), entry('a')]); assert.equal(h.picker.value, 'c');
  h.shell.setFixtures([entry('c', false)]); assert.equal(h.picker.value, ''); assert(h.open.disabled); assert(h.picker.disabled);
  h.picker.value = 'c'; fire(h.open, 'click'); assert.deepEqual(h.calls, []);
  assert.equal(h.shell.surfaceMount.children[0], canvas);
  h.shell.setFixtures([]); assert.equal(h.picker.children.length, 0); assert(h.open.disabled);
  h.shell.destroy();
});
test('invalid refresh is atomic; destroyed shell ignores updates and stale event callbacks', () => {
  const h = setup([entry('a')]);
  assert.throws(() => h.shell.setFixtures([entry('b'), entry('b')]), /InvalidDemoFixtureCatalog/);
  assert.equal(h.picker.value, 'a'); fire(h.open, 'click'); assert.deepEqual(h.calls, ['a']);
  h.shell.destroy(); h.shell.setFixtures([entry('new')]); fire(h.open, 'click');
  assert.equal(h.root.children.length, 0); assert.deepEqual(h.calls, ['a']);
});
