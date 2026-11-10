import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
const styles = installFormattingTestStyles();
after(() => styles.deregister());
const { createDemoShell } = await import('../src/shell.ts');
import { contextCommandIds, resolveCommandSupport } from '../src/command-support.ts';
import { generatedTableGridCommands } from '../src/generated-table-grid-port.ts';
import { Document, all, fire } from './fake-dom.mjs';

test('table toolbox renders four real intents using existing buttons and availability', () => {
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [];
  let actions = Object.fromEntries(
    generatedTableGridCommands.map((command) => [
      command,
      { enabled: false, reason: '생성 셀을 선택하세요.' },
    ]),
  );
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { vanilla: '/v/', react: '/r/', svelte: '/s/', headless: '/h/' },
    fixtures: [],
    getState: () => ({ title: '', status: '', actions }),
    onAction: (action) => calls.push(action),
  });
  for (const command of generatedTableGridCommands) {
    const buttons = all(
      root,
      (node) => node.tagName === 'BUTTON' && node.dataset.command === command,
    );
    assert.ok(buttons.length > 0, command);
    for (const button of buttons) {
      assert.equal(button.disabled, true);
      fire(button, 'click');
    }
  }
  assert.equal(calls.length, 0);
  actions = Object.fromEntries(
    generatedTableGridCommands.map((command) => [
      command,
      { enabled: !command.includes('delete'), reason: '마지막 행·열' },
    ]),
  );
  shell.update();
  for (const command of generatedTableGridCommands) {
    const button = all(
      root,
      (node) => node.tagName === 'BUTTON' && node.dataset.command === command,
    )[0];
    assert.equal(button.disabled, command.includes('delete'));
    if (!button.disabled) fire(button, 'click');
  }
  assert.deepEqual(calls, [
    { command: 'generated-table-insert-row' },
    { command: 'generated-table-insert-column' },
  ]);
  shell.destroy();
});
test('only generated cell context includes grid actions; original tables remain unavailable', () => {
  for (const command of generatedTableGridCommands) {
    assert.ok(contextCommandIds('generated-table-cell').includes(command));
    for (const kind of ['none', 'body', 'table-cell', 'picture'])
      assert.ok(!contextCommandIds(kind).includes(command));
    assert.equal(
      resolveCommandSupport(command, {
        connected: true,
        document: 'ready',
        hasSelection: false,
        availability: { enabled: true, surfaceSelection: true },
      }).enabled,
      true,
    );
    assert.equal(
      resolveCommandSupport(command, {
        connected: true,
        document: 'ready',
        hasSelection: false,
        availability: { enabled: false, surfaceSelection: true },
      }).enabled,
      false,
    );
  }
});
