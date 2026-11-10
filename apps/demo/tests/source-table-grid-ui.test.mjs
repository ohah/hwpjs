// Actual shared tool/router/Canvas Surface, synthetic renderer/Core. No Native/browser claim.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
const styles = installFormattingTestStyles();
after(() => styles.deregister());
const { createDemoShell } = await import('../src/shell.ts');
import { createCanvasSurface } from '../../../packages/vanilla/src/surface.ts';
import {
  formattingFixture,
  tick,
} from '../../../packages/vanilla/tests/multirange-formatting-fixture.mjs';
import { createTableGridPort } from '../src/table-grid-port.ts';
import { createGeneratedTableGridTool } from '../src/generated-table-grid-tool.ts';
import { contextCommandIds, resolveCommandSupport } from '../src/command-support.ts';
import { generatedTableGridCommands as commands } from '../src/generated-table-grid-port.ts';
import { Document, all, fire } from './fake-dom.mjs';
import { sourceGridFixture } from './source-table-grid-fixture.mjs';

for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: actual Surface selection drives router; composition/modal/model/token/readonly/refresh fences`, async () => {
    const f = formattingFixture();
    const paragraphs = f.state().content.paragraphs.map((p, i) => ({
      ...p,
      selectionOwner: null,
      tableCell: { tableNode: 10, listNode: 20 + i },
      ...(format === 'hwp5'
        ? { currentReference: { kind: 'original', section: 0, paragraph: i } }
        : {}),
    }));
    const content = {
      ...f.state().content,
      format,
      limited: false,
      sourceTableGridAvailable: true,
      paragraphs,
      tables: [
        {
          section: 0,
          tableNode: 10,
          rows: 2,
          columns: 2,
          cells: paragraphs.map((p, i) => ({
            listNode: 20 + i,
            row: Math.floor(i / 2),
            column: i % 2,
            rowSpan: 1,
            columnSpan: 1,
            width: 100,
            height: 100,
            paragraphs: [p.paragraph],
          })),
        },
      ],
    };
    f.install({
      content,
      capabilities: { ...f.state().capabilities, sourceTableGridAvailable: true },
    });
    const s = createCanvasSurface({ root: f.root, editor: f.editor });
    const calls = [],
      statuses = [];
    // Surface selection stays real; the fixture supplies the Core flush and structural reply.
    f.editor.update = async (callback) => {
      callback();
    };
    f.editor.dispatchCommand = async (command, payload) => {
      calls.push({ command, payload });
      return { status: 'rejected-unapplied', error: 'UnsupportedSourceTableStructure' };
    };
    const core = { EDIT_SOURCE_TABLE_GRID_COMMAND: { name: 'source-table-grid', id: Symbol() } };
    const port = createTableGridPort(f.editor, core, () => s);
    const tool = createGeneratedTableGridTool({
      port,
      onStatus: (v) => statuses.push(v),
      onPresentationChange() {},
    });
    const select = async (p = 0) => {
      f.pointer('pointerdown', p, 1);
      f.pointer('pointerup', p, 1);
      await tick();
    };
    try {
      await select();
      assert(Object.values(tool.presentation()).every((v) => v.enabled));
      assert.equal(tool.contextTarget().kind, 'source-table-cell');
      for (const command of commands) {
        await tool.execute(command);
        assert.match(statuses.at(-1), /UnsupportedSourceTableStructure/);
      }
      assert.equal(calls.length, 4);
      assert.deepEqual(
        calls.map((c) => c.payload.action),
        ['insert-row', 'delete-row', 'insert-column', 'delete-column'],
      );
      assert(
        calls.every((c) => c.payload.tableNode === 10 && !Object.hasOwn(c.payload, 'identity')),
      );
      const expectStale = async (change, restore = async () => {}) => {
        const lease = port.capture(),
          context = tool.contextTarget();
        assert(context);
        await change();
        assert.equal(context.current(), false);
        assert.equal((await port.apply(lease, commands[0])).status, 'rejected-unapplied');
        assert.equal(calls.length, 4);
        await restore();
        await select();
      };
      await expectStale(async () => {
        await select(1);
        await select(0);
      });
      await expectStale(async () => {
        f.input().dispatchEvent(new Event('compositionstart'));
        assert(Object.values(tool.presentation()).every((v) => !v.enabled));
        f.input().dispatchEvent(new Event('compositionend'));
        await tick();
      });
      await expectStale(
        async () => {
          f.setDialogs([f.dialog()]);
        },
        async () => {
          f.setDialogs([]);
        },
      );
      await expectStale(
        async () => {
          f.renderer.historyModelMatches = () => false;
        },
        async () => {
          f.renderer.historyModelMatches = () => true;
        },
      );
      const token = f.state().token;
      await expectStale(
        async () => {
          f.state().token = { ...token, viewRevision: 99 };
        },
        async () => {
          f.state().token = token;
        },
      );
      await expectStale(
        async () => {
          content.readOnly = true;
        },
        async () => {
          content.readOnly = false;
        },
      );
      const lease = port.capture();
      f.install({ content: { ...content, tables: [] } });
      assert.equal((await port.apply(lease, commands[0])).status, 'rejected-unapplied');
      assert(Object.values(tool.presentation()).every((v) => !v.enabled));
    } finally {
      tool.dispose();
      await s.dispose();
    }
  });
}
test('source context and existing toolbox share exactly the four commands and final-axis availability', () => {
  const h = sourceGridFixture('hwp5', 1, 1),
    port = createTableGridPort(h.editor, h.core, () => h.host);
  const doc = new Document(),
    root = doc.createElement('div'),
    calls = [];
  const shell = createDemoShell(root, {
    framework: 'vanilla',
    routes: { vanilla: '/v/', react: '/r/', svelte: '/s/', headless: '/h/' },
    fixtures: [],
    getState: () => ({ title: '', status: '', actions: port.presentation() }),
    onAction: (a) => calls.push(a),
  });
  try {
    const sourceIds = contextCommandIds(port.contextTarget().kind);
    assert(sourceIds.includes('table-cell-properties'));
    for (const command of commands) {
      assert.equal(sourceIds.filter((id) => id === command).length, 1);
      for (const kind of ['body', 'table-cell', 'none', 'picture'])
        assert(!contextCommandIds(kind).includes(command));
      const availability = port.presentation()[command];
      assert.equal(
        resolveCommandSupport(command, {
          connected: true,
          document: 'ready',
          hasSelection: false,
          availability,
        }).enabled,
        command.includes('insert'),
      );
      const buttons = all(root, (n) => n.tagName === 'BUTTON' && n.dataset.command === command);
      assert(buttons.length > 0);
      for (const button of buttons) assert.equal(button.disabled, command.includes('delete'));
      fire(buttons[0], 'click');
    }
    assert.deepEqual(
      calls.map((a) => a.command),
      [commands[0], commands[2]],
    );
  } finally {
    shell.destroy();
    port.dispose();
  }
});

test('actual source context menu executes existing intents and rejects a saved A-B-A target', async () => {
  const { mountDemoContextMenu } = await import('../src/context-menu.ts');
  for (const stale of [false, true]) {
    const h = sourceGridFixture(),
      port = createTableGridPort(h.editor, h.core, () => h.host);
    const doc = new Document();
    doc.defaultView = Object.assign(new EventTarget(), { innerWidth: 800, innerHeight: 600 });
    const createElement = doc.createElement.bind(doc);
    doc.createElement = (tag) => {
      const element = createElement(tag);
      element.style = {};
      element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 150, height: 100 });
      element.closest = () => (element.tagName === 'BUTTON' ? element : null);
      return element;
    };
    doc.head = doc.createElement('head');
    doc.body = doc.createElement('body');
    const root = doc.createElement('main');
    doc.body.append(root);
    const menu = mountDemoContextMenu({
      root,
      getTarget: () => port.contextTarget() ?? { kind: 'none', key: 'none' },
      getState: () => ({ title: '', status: '', actions: port.presentation() }),
      execute: (a) => port.apply(port.capture(), a.command),
      subscribe: () => () => {},
      onError: (error) => {
        throw error;
      },
    });
    try {
      fire(root, 'contextmenu', { button: 2, clientX: 20, clientY: 20 });
      const popup = all(doc.body, (n) => n.getAttribute('role') === 'menu')[0];
      assert(popup && !popup.hidden);
      for (const command of commands)
        assert.equal(popup.children.filter((n) => n.dataset.commandId === command).length, 1);
      if (stale) {
        h.move();
        h.move();
      }
      const button = popup.children.find((n) => n.dataset.commandId === commands[0]);
      const click = new Event('click', { cancelable: true });
      Object.defineProperty(click, 'target', { value: button });
      popup.dispatchEvent(click);
      await tick();
      assert.equal(h.calls.length, stale ? 0 : 1);
      if (!stale) assert.equal(h.calls[0].command, h.core.EDIT_SOURCE_TABLE_GRID_COMMAND);
    } finally {
      menu.close();
      port.dispose();
    }
  }
});
