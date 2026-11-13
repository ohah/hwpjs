import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoShell } from '../src/shell.ts';
import { DEMO_COMMAND_REGISTRY, resolveCommandSupport } from '../src/command-support.ts';
import { Document, all, fire } from './fake-dom.mjs';

test('existing object editing does not grant creation or require a text selection', () => {
  for (const command of ['edit-chart-data', 'edit-equation']) {
    assert.equal(DEMO_COMMAND_REGISTRY[command].selection, false);
    assert.equal(
      resolveCommandSupport(command, {
        connected: false,
        document: 'ready',
        availability: { enabled: true },
      }).enabled,
      false,
    );
    assert.equal(
      resolveCommandSupport(command, {
        connected: true,
        document: 'ready',
        hasSelection: false,
        availability: { enabled: true },
      }).enabled,
      true,
    );
    for (const overrides of [{ document: 'none' }, { busy: true }, { disposed: true }])
      assert.equal(
        resolveCommandSupport(command, {
          connected: true,
          document: 'ready',
          availability: { enabled: true },
          ...overrides,
        }).enabled,
        false,
      );
  }
  assert.equal(
    resolveCommandSupport('insert-chart', {
      connected: false,
      document: 'ready',
      hasSelection: true,
      availability: { enabled: true },
    }).enabled,
    false,
  );
});

test('menu and toolbox use the same editing intents and recheck availability', () => {
  const doc = new Document(),
    root = doc.createElement('main'),
    calls = [];
  let busy = false;
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: Object.fromEntries(
      ['headless', 'vanilla', 'react', 'svelte'].map((name) => [name, `/demo/${name}/`]),
    ),
    fixtures: [],
    getState: () => ({
      title: '',
      status: '',
      busy,
      actions: {
        'edit-chart-data': { enabled: true },
        'edit-equation': { enabled: true },
      },
    }),
    onAction: (action) => calls.push(action.command),
  });
  try {
    for (const command of ['edit-chart-data', 'edit-equation']) {
      const buttons = all(
        root,
        (node) => node.tagName === 'BUTTON' && node.dataset.command === command,
      );
      assert.equal(buttons.length, 2);
      assert(buttons.every((button) => !button.disabled));
      for (const button of buttons) fire(button, 'click');
      busy = true;
      for (const button of buttons) fire(button, 'click');
      busy = false;
      assert.equal(calls.filter((value) => value === command).length, 2);
    }
    assert(
      all(root, (node) => node.dataset.command === 'insert-chart').every(
        (button) => button.disabled,
      ),
    );
  } finally {
    shell.destroy();
  }
});
