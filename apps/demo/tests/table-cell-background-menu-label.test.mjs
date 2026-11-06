import test from 'node:test';
import assert from 'node:assert/strict';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
const styles = installFormattingTestStyles();
const { createDemoShell } = await import('../src/shell.ts');
test.after(() => styles.deregister());
import { DEMO_COMMAND_REGISTRY } from '../src/command-support.ts';
import { Document, all } from './fake-dom.mjs';

test('actual table menu uses localized cell background registry label', () => {
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
    (node) => node.tagName === 'BUTTON' && node.dataset.command === 'table-cell-background',
  );
  assert.ok(buttons.length > 0);
  for (const button of buttons) {
    assert.equal(
      button.getAttribute('aria-label'),
      DEMO_COMMAND_REGISTRY['table-cell-background'].label,
    );
    assert.equal(button.getAttribute('aria-label'), '셀 배경');
    assert.equal(button.textContent, '셀 배경');
  }
  shell.destroy();
});
