import { test, expect, mock } from 'bun:test';
import { createKeyboardShortcuts } from '../../../packages/vanilla/src/shortcuts.ts';
// Exercise the actual source host without rebuilding the installed SDK.
mock.module('@hwpjs/vanilla', () => ({ createKeyboardShortcuts }));
const { mountShortcutSettings } = await import('../src/shortcut-settings.ts');
import { createTableGridPort } from '../src/table-grid-port.ts';
import { createGeneratedTableGridTool } from '../src/generated-table-grid-tool.ts';
// @ts-ignore Existing pure fixtures; no Native, browser or document file IO.
import { sourceGridFixture } from './source-table-grid-fixture.mjs';
// @ts-ignore Event ownership fixture, not a browser propagation oracle.
import { Document, all } from './fake-dom.mjs';
import { paragraphBreakShortcut } from '../../../web/preview/paragraph-break-shortcut.mjs';
// Use the existing renderer-only boundary; actual Canvas/Surface remain real.
import { createSurfaceRenderer } from '../../../packages/vanilla/tests/non-text-history-fixture.mjs';
mock.module('../../../web/preview/renderer.mjs', () => ({
  createSurfaceRenderer,
  createDocumentOutputRenderer() {
    throw Error('UnexpectedPrintRenderer');
  },
}));
const { createCanvasSurface } = await import('../../../packages/vanilla/src/surface.ts');
// @ts-ignore Actual Surface/Canvas with controlled Core and renderer; no Native IO.
import {
  formattingFixture,
  tick as surfaceTick,
} from '../../../packages/vanilla/tests/multirange-formatting-fixture.mjs';

const command = 'generated-table-insert-row';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function setup(format = 'hwpx', kind = 'source', platform = 'Win32', supplied?: any) {
  const f = supplied ?? sourceGridFixture(format);
  f.select?.(kind);
  const port = createTableGridPort(f.editor, f.core, () => f.host);
  const statuses: string[] = [],
    actions: string[] = [],
    fallback: unknown[] = [];
  const tool = createGeneratedTableGridTool({
    port,
    onStatus: (m) => statuses.push(m),
    onPresentationChange() {},
  });
  const doc = new Document();
  doc.defaultView = { navigator: { platform } };
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const node = create(tag),
      append = node.append.bind(node);
    node.append = (...nodes: any[]) =>
      append(...nodes.map((n) => (typeof n === 'string' ? doc.createTextNode(n) : n)));
    return node;
  };
  const root = doc.createElement('div'),
    surface = doc.createElement('div'),
    input = doc.createElement('textarea');
  input.dataset.hwpjsDocumentInput = '';
  input.closest = (selector: string) =>
    selector === '[data-hwpjs-document-input]' ||
    selector === 'input,textarea,select,[contenteditable]'
      ? input
      : null;
  surface.append(input);
  const handlers: ((e: any) => void)[] = [];
  const add = surface.addEventListener.bind(surface),
    remove = surface.removeEventListener.bind(surface);
  surface.addEventListener = (type: string, fn: any, options: any) =>
    type === 'keydown' ? handlers.push(fn) : add(type, fn, options);
  surface.removeEventListener = (type: string, fn: any, options: any) => {
    if (type === 'keydown') {
      const i = handlers.indexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
    } else remove(type, fn, options);
  };
  let context: 'body' | 'table' | 'blocked' = 'table',
    ready = true,
    nativePastes = 0;
  const settings = mountShortcutSettings({
    root,
    surface,
    tableRowContext: () =>
      supplied ? (tool.contextTarget()?.current?.() === true ? 'table' : 'blocked') : context,
    available: (id: string) =>
      id === command ? ready && tool.presentation()[command].enabled === true : ready,
    execute: async (action: any) => {
      actions.push(action.command);
      if (tool.handles(action.command)) await tool.execute(action.command);
    },
    onStatus: (message: string) => statuses.push(message),
    nativePaste: () => {
      nativePastes++;
      return true;
    },
  });
  function key(patch: any = {}) {
    const event = {
      target: input,
      code: 'Enter',
      key: 'Enter',
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      repeat: false,
      keyCode: 13,
      defaultPrevented: false,
      stopped: false,
      immediate: false,
      getModifierState: () => false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
        this.immediate = true;
      },
      ...patch,
    };
    // oxlint-disable-next-line unicorn/no-useless-spread -- Keep listener dispatch stable when a handler disposes the host.
    for (const fn of [...handlers]) {
      fn(event);
      if (event.immediate) break;
    }
    // Only classify an event reaching the document handler; no Canvas/Native claim.
    if (!event.stopped && !event.defaultPrevented) fallback.push(paragraphBreakShortcut(event));
    return event;
  }
  return {
    f,
    key,
    settings,
    actions,
    fallback,
    statuses,
    input,
    surface,
    get nativePastes() {
      return nativePastes;
    },
    context: (value: typeof context) => {
      context = value;
    },
    ready: (value: boolean) => {
      ready = value;
    },
    dispose() {
      settings.dispose();
      tool.dispose();
      f.port.dispose();
    },
    reset() {
      all(root, (n: any) => n.dataset.role === 'shortcut-reset')[0].onclick();
    },
  };
}
for (const platform of ['Win32', 'MacIntel', 'Linux'])
  test(`${platform}: native paste collision is rejected before partition and retains previous config`, async () => {
    const h = setup('hwpx', 'source', platform);
    try {
      const before = h.settings.getConfig();
      const row = before.bindings.find((b) => b.id === command)!;
      expect(() =>
        h.settings.setConfig({
          version: 1,
          bindings: [{ ...row, code: 'KeyV', modifiers: ['Mod'] }],
        }),
      ).toThrow('shortcut conflict');
      expect(h.settings.getConfig()).toBe(before);
      const event = h.key({
        code: 'KeyV',
        key: 'v',
        ctrlKey: platform !== 'MacIntel',
        metaKey: platform === 'MacIntel',
      });
      await tick();
      expect(event.defaultPrevented).toBe(false);
      expect(h.nativePastes).toBe(1);
      expect(h.actions).toEqual([]);
      expect(h.f.calls).toEqual([]);
      expect(h.fallback).toEqual([]);
      h.key();
      await tick();
      expect(h.actions).toEqual([command]);
      expect(h.f.calls.length).toBe(1);
    } finally {
      h.dispose();
    }
  });
for (const format of ['hwp5', 'hwpx'])
  for (const kind of ['source', 'generated'])
    test(`${format}/${kind}: default Ctrl+Enter dispatches existing row insertion exactly once`, async () => {
      const h = setup(format, kind);
      try {
        const event = h.key();
        await tick();
        expect(event.defaultPrevented).toBe(true);
        expect(h.actions).toEqual([command]);
        expect(h.f.calls.length).toBe(1);
        expect(h.f.calls[0].payload.action).toBe('insert-row');
        expect(h.f.calls[0].payload.index).toBe(2);
        expect(h.f.calls[0].command).toBe(
          kind === 'source'
            ? h.f.core.EDIT_SOURCE_TABLE_GRID_COMMAND
            : h.f.core.EDIT_CREATED_TABLE_GRID_COMMAND,
        );
        expect(h.fallback).toEqual([]);
      } finally {
        h.dispose();
      }
    });
test('disabled paste permits reassignment of its former chord to contextual row insertion', async () => {
  for (const platform of ['Win32', 'MacIntel', 'Linux']) {
    const h = setup('hwpx', 'source', platform);
    try {
      const config = h.settings.getConfig();
      const row = config.bindings.find((b) => b.id === command)!;
      const paste = config.bindings.find((b) => b.id === 'paste')!;
      h.settings.setConfig({
        version: 1,
        bindings: [
          { ...row, code: 'KeyV', modifiers: ['Mod'] },
          { ...paste, enabled: false },
        ],
      });
      h.key({
        code: 'KeyV',
        key: 'v',
        ctrlKey: platform !== 'MacIntel',
        metaKey: platform === 'MacIntel',
      });
      await tick();
      expect(h.actions).toEqual([command]);
      expect(h.f.calls.length).toBe(1);
      expect(h.nativePastes).toBe(0);
      expect(h.fallback).toEqual([]);
    } finally {
      h.dispose();
    }
  }
});
test('body Ctrl+Enter retains its Canvas page-break path on every platform', () => {
  for (const platform of ['Win32', 'MacIntel', 'Linux']) {
    const h = setup('hwpx', 'source', platform);
    try {
      h.context('body');
      const event = h.key();
      expect(event.defaultPrevented).toBe(false);
      expect(h.fallback).toEqual(['page']);
      expect(h.actions).toEqual([]);
    } finally {
      h.dispose();
    }
  }
});
test('implicit default is exported, can be disabled or reassigned, and reset restores it', async () => {
  const h = setup();
  try {
    const row = h.settings.getConfig().bindings.find((b) => b.id === command);
    expect(row?.code).toBe('Enter');
    expect(row?.modifiers).toEqual(['Control']);
    h.settings.setConfig({ version: 1, bindings: [{ ...row, enabled: false }] });
    const disabled = h.key();
    await tick();
    expect(disabled.defaultPrevented).toBe(true);
    expect(h.actions).toEqual([]);
    expect(h.fallback).toEqual([]);
    h.settings.setConfig({ version: 1, bindings: [{ ...row, code: 'F9', modifiers: [] }] });
    h.key();
    await tick();
    expect(h.actions).toEqual([]);
    expect(h.fallback).toEqual([]);
    h.key({ code: 'F9', key: 'F9', ctrlKey: false });
    await tick();
    expect(h.actions).toEqual([command]);
    h.f.replace();
    h.f.move();
    h.reset();
    h.key();
    await tick();
    expect(h.actions).toEqual([command, command]);
  } finally {
    h.dispose();
  }
});
test('user binding to a different command owns Ctrl+Enter before the contextual fallback', async () => {
  const h = setup();
  try {
    const row = h.settings.getConfig().bindings.find((b) => b.id === command);
    h.settings.setConfig({ version: 1, bindings: [{ ...row, command: 'find' }] });
    h.key();
    await tick();
    expect(h.actions).toEqual(['find']);
    expect(h.f.calls).toEqual([]);
    expect(h.fallback).toEqual([]);
  } finally {
    h.dispose();
  }
});
test('blocked context and unavailable row insertion consume Ctrl+Enter without page split', async () => {
  for (const blocked of ['context', 'busy', 'readonly', 'selection', 'missing Surface lease']) {
    const h = setup();
    try {
      if (blocked === 'context') h.context('blocked');
      else if (blocked === 'busy') h.ready(false);
      else if (blocked === 'readonly')
        h.f.replace({ content: { ...h.f.state.content, readOnly: true } });
      else h.f.hide(); // A Surface gate returns no lease; no claim of actual modal/IME execution.
      const e = h.key();
      await tick();
      expect(e.defaultPrevented).toBe(true);
      expect(h.actions).toEqual([]);
      expect(h.f.calls).toEqual([]);
      expect(h.fallback).toEqual([]);
    } finally {
      h.dispose();
    }
  }
});
test('IME, AltGraph, modifiers, repeats, unrelated inputs and disposal never insert a row', async () => {
  const h = setup();
  try {
    for (const patch of [
      { isComposing: true },
      { keyCode: 229 },
      { getModifierState: () => true },
      { repeat: true },
      { metaKey: true, ctrlKey: false },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { target: { closest: () => null } },
    ])
      h.key(patch);
    await tick();
    expect(h.actions).toEqual([]);
    expect(h.f.calls).toEqual([]);
    h.settings.dispose();
    h.key();
    await tick();
    expect(h.actions).toEqual([]);
  } finally {
    h.dispose();
  }
});
test('pending input and stale lease during existing port admission never dispatch twice', async () => {
  const h = setup();
  let release!: () => void;
  h.f.editor.update = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  try {
    h.key();
    h.key();
    await tick();
    expect(h.actions).toEqual([command]);
    h.f.move();
    release();
    await tick();
    expect(h.f.calls).toEqual([]);
    expect(h.fallback).toEqual([]);
  } finally {
    h.dispose();
  }
});

for (const format of ['hwp5', 'hwpx'])
  test(`${format}: actual Surface gates row shortcut on modal, composition, readonly and overflow policy`, async () => {
    const f = formattingFixture();
    const paragraphs = f.state().content.paragraphs.map((p: any, i: number) => ({
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
          rows: 1,
          columns: 3,
          cells: paragraphs.map((p: any, i: number) => ({
            listNode: 20 + i,
            row: 0,
            column: i,
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
    const surface = createCanvasSurface({ root: f.root, editor: f.editor });
    const calls: any[] = [];
    f.editor.update = async () => {};
    f.editor.dispatchCommand = async (definition: any, payload: any) => {
      calls.push({ definition, payload });
      return { status: 'rejected-unapplied', error: 'ControlledNoNativeMutation' };
    };
    const core = { EDIT_SOURCE_TABLE_GRID_COMMAND: { name: 'source-table-grid', id: Symbol() } };
    const h = setup(format, 'source', 'Win32', {
      editor: f.editor,
      host: surface,
      core,
      calls,
      port: { dispose() {} },
    });
    const select = async (p = 0) => {
      f.pointer('pointerdown', p, 1);
      f.pointer('pointerup', p, 1);
      await surfaceTick();
    };
    try {
      await select();
      h.key();
      await tick();
      expect(calls.length).toBe(1);
      expect(calls[0].payload.action).toBe('insert-row');
      expect(calls[0].payload.index).toBe(1);
      calls.length = 0;
      h.actions.length = 0;
      for (const blocked of ['modal', 'composition', 'readonly', 'overflow']) {
        await select();
        if (blocked === 'modal') f.setDialogs([f.dialog()]);
        if (blocked === 'composition') f.input().dispatchEvent(new Event('compositionstart'));
        if (blocked === 'readonly') content.readOnly = true;
        if (blocked === 'overflow') {
          f.renderer.viewAllowsRequest = (m: any) => m.kind !== 'source-table-grid';
          f.renderer.viewAllowsRange = () => true; // Visible text remains eligible; structural policy alone denies.
        }
        const event = h.key();
        await tick();
        expect(event.defaultPrevented).toBe(true);
        expect(calls).toEqual([]);
        expect(h.actions).toEqual([]);
        expect(h.fallback).toEqual([]);
        f.setDialogs([]);
        if (blocked === 'composition') {
          f.input().dispatchEvent(new Event('compositionend'));
          await surfaceTick();
        }
        content.readOnly = false;
        delete f.renderer.viewAllowsRequest;
        delete f.renderer.viewAllowsRange;
      }
      await select();
      let release!: () => void;
      f.editor.update = () =>
        new Promise<void>((resolve) => {
          release = resolve;
        });
      h.key();
      h.key();
      await surfaceTick();
      expect(h.actions).toEqual([command]);
      await select(1);
      await select(0); // Real Surface A→B→A fence during asynchronous port admission.
      release();
      await tick();
      expect(calls).toEqual([]);
      expect(h.fallback).toEqual([]);
    } finally {
      h.dispose();
      await surface.dispose();
    }
  });
