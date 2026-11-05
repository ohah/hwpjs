import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from '@hwpjs/core';
import { createFormattingBridge } from '../src/formatting-bridge.ts';
import {
  DEMO_COMMAND_REGISTRY,
  contextCommandIds,
  resolveCommandSupport,
} from '../src/command-support.ts';
import { demoCommandAction } from '../src/demo-command-action.ts';
import {
  paragraphAlignments,
  paragraphAlignmentValue,
} from '../../../web/preview/paragraph-alignments.mjs';
import { createDemoShell } from '../src/shell.ts';
import { Document, all, fire } from './fake-dom.mjs';

const additions = [
  ['align-distribute', 'DISTRIBUTE', 4],
  ['align-distribute-space', 'DISTRIBUTE_SPACE', 5],
];
// Controlled public Core runtime: no WASM/Native/Worker is started by this fixture.
async function setup(alignment = 1, available = true) {
  const calls = [];
  const content = {
    format: 'hwpx',
    paragraphAlignmentAvailable: available,
    paragraphs: [
      {
        section: 0,
        paragraph: 0,
        text: 'AB',
        editable: true,
        selectionOwner: 'section:0:body',
        currentReference: { kind: 'original', section: 0, id: '99' },
        paragraphShape: { alignment },
      },
    ],
  };
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(message) {
        calls.push(message);
        return { kind: message.kind, content, meta: { application: 'applied', changed: true } };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwpx' });
  await editor.setSelection({
    ...editor.getEditorState().token,
    coordinateSpace: 'display',
    format: 'hwpx',
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 2,
    affinity: 'forward',
  });
  const bridge = createFormattingBridge({ editor, onStatus() {} });
  return { editor, bridge, calls };
}

test('canonical six keys and labels are reused; no independent Native ordinal is sent', () => {
  assert.equal(paragraphAlignments.length, 6);
  for (const [command, key, value] of additions) {
    assert.equal(paragraphAlignmentValue(key), value);
    assert.equal(
      DEMO_COMMAND_REGISTRY[command].label,
      paragraphAlignments.find((entry) => entry.key === key).label,
    );
    assert.deepEqual(demoCommandAction(command), { command });
  }
});
for (const [command, key, value] of additions) {
  test(`${command} dispatches exactly one existing public paragraph command`, async () => {
    const h = await setup();
    try {
      assert.equal(h.bridge.getPresentation().actions[command].enabled, true);
      const before = h.calls.length;
      assert.equal(await h.bridge.action({ command }), true);
      assert.equal(h.calls.length, before + 1);
      assert.equal(h.calls.at(-1).kind, 'paragraph-alignment');
      assert.equal(h.calls.at(-1).alignment, key);
    } finally {
      h.bridge.dispose();
      await h.editor.dispose();
    }
  });
  test(`${command} preserves the current no-op and unavailable selection contracts`, async () => {
    const same = await setup(value);
    await same.editor.setSelection(null);
    same.bridge.dispose();
    const state = same.editor.getEditorState();
    let valid = true;
    const effects = { prepare: 0, request: 0, focus: 0 };
    const capture = {
      state,
      observation: { align: key },
      reasons: { paragraphAvailableReason: null },
      current: () => valid && same.editor.getEditorState() === state,
      prepare: async () => {
        effects.prepare++;
        return true;
      },
      request: () => {
        effects.request++;
        return true;
      },
    };
    const host = { captureSelectionFormatting: () => capture };
    same.bridge = createFormattingBridge({
      editor: same.editor,
      onStatus() {},
      getSurfaceFormattingHost: () => host,
      onFocus: () => {
        effects.focus++;
      },
    });
    try {
      const before = same.calls.length;
      assert.equal(await same.bridge.action({ command }), true);
      assert.equal(same.calls.length, before);
      assert.deepEqual(effects, { prepare: 0, request: 0, focus: 1 });
      valid = false;
      await same.bridge.action({ command });
      assert.equal(same.calls.length, before);
      assert.deepEqual(effects, { prepare: 0, request: 0, focus: 1 });
    } finally {
      same.bridge.dispose();
      await same.editor.dispose();
    }
    for (const missing of ['capability', 'selection']) {
      const h = await setup(1, missing !== 'capability');
      try {
        if (missing === 'selection') await h.editor.setSelection(null);
        assert.equal(h.bridge.getPresentation().actions[command].enabled, false);
        const before = h.calls.length;
        await h.bridge.action({ command });
        assert.equal(h.calls.length, before);
      } finally {
        h.bridge.dispose();
        await h.editor.dispose();
      }
    }
  });
}
test('context lists and Surface selection flags do not grant missing permission', () => {
  for (const [command] of additions) {
    assert.ok(contextCommandIds('body').includes(command));
    assert.ok(contextCommandIds('table-cell').includes(command));
    assert.ok(!contextCommandIds('picture').includes(command));
    assert.ok(!contextCommandIds('none').includes(command));
    const input = { connected: true, hasSelection: false, availability: { enabled: true } };
    assert.equal(resolveCommandSupport(command, input).enabled, false);
    assert.equal(
      resolveCommandSupport(command, {
        ...input,
        availability: { enabled: true, surfaceSelection: true },
      }).enabled,
      true,
    );
  }
});
test('dropdown and formatbar expose six existing actions and recheck disabled state', () => {
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [];
  let enabled = true;
  const actions = () => Object.fromEntries(additions.map(([id]) => [id, { enabled }]));
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { vanilla: '/v/', react: '/r/', svelte: '/s/', headless: '/h/' },
    fixtures: [],
    getState: () => ({ title: '', status: '', actions: actions() }),
    onAction: (action) => calls.push(action),
  });
  try {
    const format = all(root, (n) => n.className === 'hwp-demo-formatbar')[0];
    const menu = all(root, (n) => n.className === 'hwp-demo-menu').find(
      (n) => n.children[0]?.textContent === '서식',
    );
    const ids = [
      'align-left',
      'align-center',
      'align-right',
      'align-justify',
      ...additions.map(([id]) => id),
    ];
    const alignmentButtons = (node) =>
      all(node, (n) => n.tagName === 'BUTTON' && n.dataset.command?.startsWith('align-'));
    assert.deepEqual(
      alignmentButtons(format).map((n) => n.dataset.command),
      ids,
    );
    assert.deepEqual(
      alignmentButtons(menu).map((n) => n.dataset.command),
      ids,
    );
    for (const [command] of additions)
      fire(
        alignmentButtons(menu).find((n) => n.dataset.command === command),
        'click',
      );
    assert.deepEqual(
      calls,
      additions.map(([command]) => ({ command })),
    );
    enabled = false;
    shell.update();
    for (const [command] of additions)
      fire(
        alignmentButtons(format).find((n) => n.dataset.command === command),
        'click',
      );
    assert.equal(calls.length, 2);
  } finally {
    shell.destroy();
  }
});
