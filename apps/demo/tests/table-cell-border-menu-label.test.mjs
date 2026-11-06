import test from 'node:test';
import assert from 'node:assert/strict';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
const styles = installFormattingTestStyles();
const { createDemoShell } = await import('../src/shell.ts');
test.after(() => styles.deregister());
import { DEMO_COMMAND_REGISTRY } from '../src/command-support.ts';
import { Document, all } from './fake-dom.mjs';

test('actual table menu uses localized cell border registry label', () => {
  const doc = new Document();
  const root = doc.createElement('div');
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: Object.fromEntries(
      ['headless', 'vanilla', 'react', 'svelte'].map((f) => [f, '/demo/' + f + '/']),
    ),
    fixtures: [],
    getState: () => ({
      title: '',
      status: '',
      openFile: { enabled: false },
      openFixture: { enabled: false },
      actions: {},
    }),
    onAction() {},
    onOpenFile() {},
    onOpenFixture() {},
    onError() {},
  });
  const buttons = all(
    root,
    (node) => node.tagName === 'BUTTON' && node.dataset.command === 'table-cell-border',
  );
  assert.ok(buttons.length > 0);
  for (const button of buttons) {
    assert.equal(
      button.getAttribute('aria-label'),
      DEMO_COMMAND_REGISTRY['table-cell-border'].label,
    );
    assert.equal(button.getAttribute('aria-label'), '셀 테두리');
    assert.equal(button.textContent, '셀 테두리');
  }
  shell.destroy();
});

const { createTableCellBorderController } = await import('../src/table-cell-border-tool.ts');
const { createTableCellBorderPort } = await import('../src/table-cell-border-port.ts');
const { fixture } = await import('./table-cell-properties-fixture.mjs');
const draft = {
  edges: 5,
  style: 'SOLID',
  width: '20',
  color: '#000000',
  dirty: { style: true, width: true, color: true },
};
const settle = async () => {
  for (let i = 0; i < 24; i++) await Promise.resolve();
};
test('real table menu button routes to original-cell controller and exact scalar mutation', async () => {
  const f = fixture();
  f.state.capabilities.cellBorderAvailable = true;
  const doc = new Document(),
    root = doc.createElement('div');
  let callbacks;
  const tool = createTableCellBorderController({
    root: { querySelector: () => null },
    port: createTableCellBorderPort(f.editor, f.api),
    onStatus() {},
    onClose() {},
    createView(_root, _capture, handlers) {
      callbacks = handlers;
      return { focus() {}, setBusy() {}, setStale() {}, setStatus() {}, destroy() {} };
    },
  });
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: Object.fromEntries(
      ['headless', 'vanilla', 'react', 'svelte'].map((k) => [k, '/demo/' + k + '/']),
    ),
    fixtures: [],
    getState: () => ({
      title: '',
      status: '',
      document: 'ready',
      hasSelection: true,
      actions: { 'table-cell-border': tool.presentation() },
    }),
    onAction(action) {
      assert.equal(action.command, 'table-cell-border');
      tool.open();
    },
    onOpenFile() {},
    onOpenFixture() {},
    onError(error) {
      throw error;
    },
  });
  try {
    const button = all(root, (n) => n.dataset.command === 'table-cell-border')[0];
    assert.equal(button.disabled, false);
    button.dispatchEvent(new Event('click'));
    await settle();
    assert.ok(callbacks);
    callbacks.apply(draft);
    await settle();
    assert.deepEqual(
      f.mutationCalls().map((c) => c.message),
      [
        {
          kind: 'cell-border',
          section: 0,
          tableNode: 81,
          listNode: 82,
          edges: 5,
          style: 'SOLID',
          width: 20,
          color: 0,
        },
      ],
    );
  } finally {
    shell.destroy();
    tool.dispose();
  }
});

const { mountDemoContextMenu } = await import('../src/context-menu.ts');
test('real cell context menu uses registry label, dispatches once and rejects a stale menu', async () => {
  const doc = new Document();
  doc.defaultView = Object.assign(new EventTarget(), { innerWidth: 600, innerHeight: 400 });
  doc.head = doc.createElement('head');
  doc.body = doc.createElement('body');
  const root = doc.createElement('main');
  doc.body.append(root);
  root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag) => {
    const node = create(tag);
    node.nodeType = 1;
    node.style = {};
    node.closest = () => node;
    node.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 });
    return node;
  };
  let key = 'cell:original';
  const calls = [];
  const menu = mountDemoContextMenu({
    root,
    getTarget: () => ({ kind: 'table-cell', key }),
    getState: () => ({
      title: '',
      status: '',
      document: 'ready',
      hasSelection: true,
      actions: { 'table-cell-border': { enabled: true } },
    }),
    execute: (action) => calls.push(action.command),
    subscribe: () => () => {},
    onError(error) {
      throw error;
    },
  });
  const send = (node, type, values) => {
    const event = new Event(type, { cancelable: true });
    for (const [name, value] of Object.entries(values))
      Object.defineProperty(event, name, { value });
    node.dispatchEvent(event);
  };
  try {
    const popup = doc.body.children.find((n) => n.getAttribute('role') === 'menu');
    const open = () => send(root, 'contextmenu', { button: 2, clientX: 10, clientY: 10 });
    open();
    let button = popup.children.find((n) => n.dataset.commandId === 'table-cell-border');
    assert.equal(button.textContent, DEMO_COMMAND_REGISTRY['table-cell-border'].label);
    assert.equal(button.disabled, false);
    send(popup, 'click', { target: button });
    await settle();
    assert.deepEqual(calls, ['table-cell-border']);
    open();
    button = popup.children.find((n) => n.dataset.commandId === 'table-cell-border');
    key = 'cell:changed';
    send(popup, 'click', { target: button });
    await settle();
    assert.deepEqual(calls, ['table-cell-border']);
  } finally {
    menu.close();
  }
});
