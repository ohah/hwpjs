import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, all, fire } from './fake-dom.mjs';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
import { requestBehindTextObjectSelection } from '../src/behind-text-object-selection.ts';
import { DEMO_COMMAND_REGISTRY } from '../src/command-support.ts';
import { demoCommandAction } from '../src/demo-command-action.ts';
const hook = installFormattingTestStyles();
const { createDemoShell } = await import('../src/shell.ts');
hook.deregister();
test('visible Korean toolbar and menu command route exactly one request without existing selection', () => {
  const doc = new Document(),
    root = doc.createElement('main'),
    notes = [];
  let calls = 0;
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { vanilla: '/v/', react: '/r/', svelte: '/s/', headless: '/h/' },
    fixtures: [],
    getState: () => ({
      title: '문서.hwpx',
      status: '',
      actions: { 'select-behind-text-object': { enabled: true } },
    }),
    onAction: (a) => {
      assert.equal(a.command, 'select-behind-text-object');
      requestBehindTextObjectSelection(
        () => ({ status: 'ready', content: { format: 'hwpx' } }),
        {
          requestBehindTextObjectSelection() {
            calls++;
            return true;
          },
        },
        (v) => notes.push(v),
      );
    },
  });
  const buttons = all(
    root,
    (n) => n.tagName === 'BUTTON' && n.dataset.command === 'select-behind-text-object',
  );
  assert.equal(buttons.length, 2);
  assert(buttons.every((n) => n.getAttribute('aria-label') === '글 뒤 개체 선택'));
  assert.equal(DEMO_COMMAND_REGISTRY['select-behind-text-object'].selection, false);
  const menu = all(root, (n) => n.tagName === 'DETAILS' && buttons.some((b) => n.contains(b)))[0];
  const menuButton = buttons.find((b) => menu.contains(b)),
    toolbarButton = buttons.find((b) => !menu.contains(b));
  fire(toolbarButton, 'click');
  assert.equal(calls, 1);
  menu.open = true;
  fire(menuButton, 'click');
  assert.equal(menu.open, false);
  assert.equal(calls, 2);
  assert.match(notes[0], /테두리.*P/);
  shell.destroy();
});
test('new UI command parses through existing action routing', () => {
  assert.deepEqual(demoCommandAction('select-behind-text-object'), {
    command: 'select-behind-text-object',
  });
});
