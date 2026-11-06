import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoShell } from '../src/shell.ts';
import {
  DEMO_COMMAND_REGISTRY,
  contextCommandIds,
  contextCommandLabel,
} from '../src/command-support.ts';
// @ts-ignore Shared minimal DOM fixture has no declaration file.
import { Document, all, fire } from './fake-dom.mjs';
test('table menu and cell context expose the same unified appearance intent and registry label', async () => {
  const doc = new Document(),
    root = doc.createElement('main'),
    calls: unknown[] = [];
  const shell = createDemoShell(root, {
    framework: 'headless',
    routes: { headless: '/h', vanilla: '/v', react: '/r', svelte: '/s' },
    fixtures: [],
    getState: () => ({
      title: '',
      status: '',
      actions: { 'table-cell-appearance': { enabled: true } },
    }),
    onAction: (action) => {
      calls.push(action);
    },
  });
  try {
    const buttons = all(root, (node: any) => node.dataset.command === 'table-cell-appearance');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].textContent, DEMO_COMMAND_REGISTRY['table-cell-appearance'].label);
    assert.equal(buttons[0].disabled, false);
    fire(buttons[0], 'click');
    await Promise.resolve();
    assert.deepEqual(calls, [{ command: 'table-cell-appearance' }]);
    const ids = contextCommandIds('table-cell');
    assert.ok(ids.includes('table-cell-appearance'));
    assert.ok(!ids.includes('table-cell-background'));
    assert.ok(!ids.includes('table-cell-border'));
    assert.equal(
      contextCommandLabel('table-cell-appearance', 'table-cell'),
      DEMO_COMMAND_REGISTRY['table-cell-appearance'].label,
    );
    assert.equal(
      all(root, (node: any) =>
        ['table-cell-background', 'table-cell-border'].includes(node.dataset.command),
      ).length,
      0,
    );
    for (const kind of ['none', 'body', 'picture'] as const)
      assert.ok(!contextCommandIds(kind).includes('table-cell-appearance'));
  } finally {
    shell.destroy();
  }
});
test('missing appearance capability keeps the menu disabled with a reason', () => {
  const doc = new Document(),
    root = doc.createElement('main');
  const shell = createDemoShell(root, {
    framework: 'headless',
    routes: { headless: '/h', vanilla: '/v', react: '/r', svelte: '/s' },
    fixtures: [],
    getState: () => ({
      title: '',
      status: '',
      actions: {
        'table-cell-appearance': { enabled: false, reason: '현재 엔진은 지원하지 않습니다.' },
      },
    }),
    onAction: () => {
      assert.fail('Unavailable appearance must not execute');
    },
  });
  try {
    const button = all(root, (node: any) => node.dataset.command === 'table-cell-appearance')[0];
    assert.equal(button.disabled, true);
    fire(button, 'click');
  } finally {
    shell.destroy();
  }
});
