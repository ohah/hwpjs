import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemoShell } from '../src/shell.ts';
import { Document, all, fire } from './fake-dom.mjs';
import {
  bindCellBlockMenuFocus,
  allowsCellBlockMenuFocus,
} from '../../../web/preview/cell-block-menu-focus.mjs';

function setup(onAction) {
  const doc = new Document(),
    root = doc.createElement('main'),
    calls = [];
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: {
      headless: '/demo/headless/',
      vanilla: '/demo/vanilla/',
      react: '/demo/react/',
      svelte: '/demo/svelte/',
    },
    fixtures: [],
    getState: () => ({ title: 'test', status: '', actions: { 'format-copy': { enabled: true } } }),
    onAction: (action) => {
      calls.push(action);
      return onAction?.(action);
    },
  });
  const edit = all(root, (n) => n.tagName === 'SUMMARY' && n.textContent === '편집')[0];
  const copies = all(root, (n) => n.tagName === 'BUTTON' && n.dataset.command === 'format-copy');
  return { doc, root, shell, edit, copies, calls, input: doc.createElement('textarea') };
}

// Execute the exact controller registration block with controlled host lifetime.
// This is callback evidence; it does not mount a Surface or emulate OS focus.
function register(h) {
  const source = readFileSync(new URL('../src/demo-controller.ts', import.meta.url), 'utf8');
  const successor = source.indexOf('    const shapeCopyHost = host;');
  const start = successor === -1 ? source.indexOf('    if (shell.tableMenu)') : successor;
  assert.notEqual(start, -1, 'actual controller registration block must exist');
  const end = source.indexOf('    contextMenu?.registerCellBlockMenu', start);
  let active = true;
  const host = {
    registerCellBlockMenu(node, ownsInput) {
      bindCellBlockMenuFocus(node, (input) => input === h.input && active && ownsInput(input));
    },
  };
  const run = new Function(
    'shell',
    'host',
    `let closed = false; ${source.slice(start, end)}
    return { close() { closed = true; }, replace() { host = {}; } };`,
  );
  return {
    ...run(h.shell, host),
    revoke() {
      active = false;
    },
  };
}

// Execute unchanged Canvas blur/exit handlers with a controlled selected block.
function canvas(h) {
  const source = readFileSync(
    new URL('../../../web/preview/canvas-editor.mjs', import.meta.url),
    'utf8',
  );
  const clearStart = source.indexOf('  const clearCellBlockOnFocusExit =');
  const clearEnd = source.indexOf('  const focusedSelection =', clearStart);
  const blurStart = source.indexOf("  listen(input, 'blur', (event) => {");
  const blurEnd = source.indexOf('  if (ownerDocument?.addEventListener)', blurStart);
  const listeners = new Map();
  return new Function(
    'input',
    'allowsCellBlockMenuFocus',
    'listen',
    `
    let cellBlock = { cells: [1] }, mergeCapture = cellBlock, cellBlockMenuFocus = null, blockSelection = null;
    const updateReadOnly = () => {}, paint = () => {};
    ${source.slice(clearStart, clearEnd)}
    ${source.slice(blurStart, blurEnd)}
    return { blur(target) { listen.handlers.get('blur')({ relatedTarget: target }); },
      enter(target) { exitCellBlockMenu({ target }); }, count() { return cellBlock?.cells.length ?? 0; } };
  `,
  )(
    h.input,
    allowsCellBlockMenuFocus,
    Object.assign((_node, type, cb) => listeners.set(type, cb), { handlers: listeners }),
  );
}

test('F5 block survives exact Edit summary -> ShapeCopy item; same command reaches dispatcher', async () => {
  const h = setup();
  register(h);
  const c = canvas(h);
  c.blur(h.edit);
  assert.equal(c.count(), 1);
  const copy = h.copies.find((n) => h.edit.parentElement.contains(n));
  c.enter(copy);
  assert.equal(c.count(), 1);
  fire(copy, 'click');
  await Promise.resolve();
  assert.deepEqual(h.calls, [{ command: 'format-copy' }]);
  h.shell.destroy();
});

test('exact targets contain one Edit trigger and two ShapeCopy buttons, never whole menu', () => {
  const h = setup();
  assert.equal(h.copies.length, 2);
  assert.equal(h.shell.shapeCopyFocusTargets?.length, 3);
  for (const target of [h.edit, ...h.copies])
    assert.equal(h.shell.shapeCopyFocusTargets.includes(target), true);
  assert.equal(Object.isFrozen(h.shell.shapeCopyFocusTargets), true);
  register(h);
  assert.equal(allowsCellBlockMenuFocus(h.edit.parentElement, h.input), false);
  for (const copy of h.copies) {
    assert.equal(allowsCellBlockMenuFocus(copy, h.input), true);
    assert.equal(allowsCellBlockMenuFocus(copy.children[0], h.input), true);
  }
  h.shell.destroy();
});

for (const command of ['undo', 'cut', 'copy', 'paste', 'find', 'replace'])
  test(`unrelated Edit ${command} exits the held block`, () => {
    const h = setup();
    register(h);
    const c = canvas(h);
    c.blur(h.edit);
    assert.equal(c.count(), 1);
    const target = all(h.edit.parentElement, (n) => n.dataset.command === command)[0];
    assert.ok(target);
    c.enter(target);
    assert.equal(c.count(), 0);
    h.shell.destroy();
  });

for (const reason of ['close', 'replace', 'revoke'])
  test(`controller/host ${reason} refuses focus retention`, () => {
    const h = setup(),
      owner = register(h);
    owner[reason]();
    assert.equal(allowsCellBlockMenuFocus(h.edit, h.input), false);
    const c = canvas(h);
    c.blur(h.edit);
    assert.equal(c.count(), 0);
    h.shell.destroy();
  });

test('foreign input and unregistered outside/menu popup clear instead of broadening focus', () => {
  const h = setup();
  register(h);
  assert.equal(allowsCellBlockMenuFocus(h.edit, h.doc.createElement('textarea')), false);
  for (const target of [
    h.root,
    h.doc.createElement('button'),
    h.edit.parentElement.children[1],
    null,
  ]) {
    const c = canvas(h);
    c.blur(h.edit);
    assert.equal(c.count(), 1);
    c.enter(target);
    assert.equal(c.count(), 0);
  }
  h.shell.destroy();
});

for (const format of ['hwp5', 'hwpx'])
  test(`controlled focus/shell -> actual modal/SDK879 ${format}: one history, undo/redo/save/reopen`, async () => {
    const { fixture, seedDraft, saved } = await import('./shape-copy-cell-fixture.mjs');
    const { dom } = await import('./shape-copy-followup-dom.mjs');
    const { createShapeCopyTool } = await import('../src/shape-copy-tool.ts');
    const { UNDO_COMMAND, REDO_COMMAND } = await import('./shape-copy-native-fixture.mjs');
    const { observeTableCellAppearance } =
      await import('../../../js/table-cell-appearance-observation.mjs');
    const f = await fixture(format, { opaqueTargets: format === 'hwpx' }),
      d = dom();
    let selected, pending, tool;
    const statuses = [],
      h = setup((action) => (pending = tool.action(action.command)));
    register(h);
    tool = createShapeCopyTool({
      root: d.root,
      editor: f.e,
      hasCellBlock: () => selected?.count() === 1,
      getCellSelection: () =>
        selected?.count() === 1
          ? { state: f.e.getEditorState(), witness: f.witness([f.targets[0]]), current: () => true }
          : null,
      onStatus: (value) => statuses.push(value),
      onPresentationChange() {},
      onClose() {},
    });
    const copy = h.copies.find((n) => h.edit.parentElement.contains(n));
    try {
      await f.select(f.source);
      assert.equal(
        (await f.appearance.apply(f.appearance.capture(), seedDraft)).status,
        'committed-with-snapshot',
      );
      await f.select(f.source);
      const before = await saved(f.e),
        rev = f.e.getEditorState().nativeHistoryRevision;
      const source = observeTableCellAppearance(f.e.getEditorState().content, f.source);
      fire(copy, 'click');
      await pending;
      for (const id of ['cell.border', 'cell.background', 'cell.diagonal']) {
        const input = d.field(id);
        assert(input && !input.disabled);
        input.checked = true;
        d.send(input, 'change');
      }
      d.send(d.role('shape-copy-confirm'), 'click');
      assert.equal(d.role('shape-copy'), undefined);
      await f.select(f.targets[0]);
      selected = canvas(h);
      selected.blur(h.edit);
      assert.equal(selected.count(), 1);
      selected.enter(copy);
      assert.equal(selected.count(), 1);
      fire(copy, 'click');
      await pending;
      assert.equal(f.e.getEditorState().nativeHistoryRevision, rev + 1);
      assert.equal(
        d.role('shape-copy'),
        undefined,
        'target applies rather than reopening source modal',
      );
      assert.equal(statuses.at(-1), '선택한 지원 항목의 모양을 적용했습니다.');
      const afterObservation = observeTableCellAppearance(
        f.e.getEditorState().content,
        f.targets[0],
      );
      for (const key of ['edges', 'fill', 'diagonal'])
        assert.deepEqual(afterObservation[key], source[key]);
      const after = await saved(f.e);
      assert.notDeepEqual(after, before);
      assert.equal(
        (await f.e.dispatchCommand(UNDO_COMMAND, { token: f.e.getEditorState().token })).status,
        'committed-with-snapshot',
      );
      assert.deepEqual(await saved(f.e), before);
      assert.equal(
        (await f.e.dispatchCommand(REDO_COMMAND, { token: f.e.getEditorState().token })).status,
        'committed-with-snapshot',
      );
      assert.deepEqual(await saved(f.e), after);
      await f.e.load(after, { format, editable: true });
      assert.deepEqual(await saved(f.e), after);
      assert.deepEqual(h.calls, [{ command: 'format-copy' }, { command: 'format-copy' }]);
    } finally {
      tool.dispose();
      h.shell.destroy();
      await f.close();
    }
  });
