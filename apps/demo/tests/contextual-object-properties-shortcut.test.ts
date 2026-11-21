import { test, expect, mock } from 'bun:test';
import { createKeyboardShortcuts } from '../../../packages/vanilla/src/shortcuts.ts';
mock.module('@hwpjs/vanilla', () => ({ createKeyboardShortcuts }));
const { mountShortcutSettings } = await import('../src/shortcut-settings.ts');
import {
  OBJECT_PROPERTIES_KEYMAP,
  objectPropertiesShortcutConfig,
  mountContextualObjectPropertiesShortcut,
} from '../src/contextual-object-properties-shortcut.ts';
import { parseKeymapConfig } from '@hwpjs/core';
// Event fixture proves dispatch boundaries; not a trusted browser propagation oracle.
// @ts-ignore Existing own DOM fixture.
import { Document, all } from './fake-dom.mjs';
const command = 'object-properties';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function setup(platform = 'Win32', config?: unknown) {
  const doc = new Document(),
    values = new Map<string, string>();
  doc.defaultView = {
    navigator: { platform },
    localStorage: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
    },
  };
  const create = doc.createElement.bind(doc);
  doc.createElement = (tag: string) => {
    const node = create(tag),
      append = node.append.bind(node);
    node.append = (...children: any[]) =>
      append(...children.map((n) => (typeof n === 'string' ? doc.createTextNode(n) : n)));
    return node;
  };
  const root = doc.createElement('div'),
    surface = doc.createElement('div'),
    canvas = doc.createElement('canvas'),
    input = doc.createElement('textarea');
  canvas.closest = () => null;
  input.closest = (selector: string) =>
    selector === 'input,textarea,select,[contenteditable]' ? input : null;
  surface.append(canvas, input);
  canvas.focus();
  const handlers: any[] = [],
    actions: string[] = [],
    statuses: string[] = [];
  const add = surface.addEventListener.bind(surface),
    remove = surface.removeEventListener.bind(surface);
  surface.addEventListener = (type: string, fn: any, opts: any) =>
    type === 'keydown' ? handlers.push(fn) : add(type, fn, opts);
  surface.removeEventListener = (type: string, fn: any, opts: any) =>
    type === 'keydown' ? handlers.splice(handlers.indexOf(fn), 1) : remove(type, fn, opts);
  let selected = true,
    ready = true,
    legacy = 0,
    execute: (() => void | Promise<void>) | undefined;
  const settings = mountShortcutSettings({
    root,
    surface,
    config,
    hasSelectedObject: () => selected,
    available: () => ready,
    execute: (a) => {
      actions.push(a.command);
      return execute?.();
    },
    onStatus: (s) => statuses.push(s),
  });
  const key = (patch: any = {}) => {
    const e = {
      target: canvas,
      code: 'KeyP',
      key: 'p',
      isTrusted: true,
      isComposing: false,
      keyCode: 80,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      repeat: false,
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
        this.immediate = true;
        this.stopped = true;
      },
      ...patch,
    };
    // Run the actual generic adapter first, as an ancestor capture listener would.
    // This order intentionally exercises disabled-default fallback precedence.
    const order = handlers.length ? [handlers.at(-1), ...handlers.slice(0, -1)] : [];
    for (const fn of order) {
      fn(e);
      if (e.immediate) break;
    }
    if (
      !e.defaultPrevented &&
      e.target === canvas &&
      doc.activeElement === canvas &&
      selected &&
      e.isTrusted &&
      !e.isComposing &&
      e.keyCode !== 229 &&
      !e.repeat &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey &&
      !e.getModifierState('AltGraph') &&
      e.key.toLowerCase() === 'p'
    )
      legacy++;
    return e;
  };
  return {
    root,
    surface,
    canvas,
    input,
    doc,
    actions,
    statuses,
    values,
    settings,
    key,
    get legacy() {
      return legacy;
    },
    selected(v: boolean) {
      selected = v;
    },
    ready(v: boolean) {
      ready = v;
    },
    execute(fn: typeof execute) {
      execute = fn;
    },
    binding() {
      return settings.getConfig().bindings.find((b) => b.id === command)!;
    },
    reset() {
      all(root, (n: any) => n.dataset.role === 'shortcut-reset')[0].onclick();
    },
    dispose() {
      settings.dispose();
    },
  };
}
for (const platform of ['Win32', 'MacIntel', 'Linux'])
  test(`${platform}: selected Canvas physical P delegates existing properties once`, async () => {
    const h = setup(platform);
    try {
      expect(h.key().defaultPrevented).toBe(true);
      await tick();
      expect(h.actions).toEqual([command]);
      expect(h.legacy).toBe(0);
    } finally {
      h.dispose();
    }
  });
test('ordinary body P and ordinary input keep text path; no implicit global properties claim', () => {
  const h = setup();
  try {
    h.selected(false);
    expect(h.key().defaultPrevented).toBe(false);
    h.input.focus();
    expect(h.key({ target: h.input }).defaultPrevented).toBe(false);
    expect(h.actions).toEqual([]);
  } finally {
    h.dispose();
  }
});
test('JSON disable and F9 remap suppress standalone P fallback and reset restores default', async () => {
  const h = setup();
  try {
    const binding = h.binding();
    h.settings.setConfig({ version: 1, bindings: [{ ...binding, enabled: false }] });
    const disabledP = h.key();
    expect(disabledP.defaultPrevented).toBe(true);
    expect(disabledP.stopped).toBe(true);
    expect(disabledP.immediate).toBe(true);
    await tick();
    expect(h.actions).toEqual([]);
    expect(h.legacy).toBe(0);
    h.settings.setConfig({ version: 1, bindings: [{ ...binding, code: 'F9' }] });
    expect(h.key().defaultPrevented).toBe(true);
    h.key({ code: 'F9', key: 'F9' });
    await tick();
    expect(h.actions).toEqual([command]);
    expect(
      parseKeymapConfig(JSON.parse(JSON.stringify(h.settings.getConfig()))).bindings.find(
        (b) => b.id === command,
      )?.code,
    ).toBe('F9');
    expect([...h.values.values()].at(-1)).toContain('F9');
    h.reset();
    h.key();
    await tick();
    expect(h.actions).toEqual([command, command]);
    expect(h.legacy).toBe(0);
  } finally {
    h.dispose();
  }
});
test('physical code owns execution; layout key P only quarantines the old fallback', async () => {
  const h = setup();
  try {
    h.key({ key: 'ㅔ' });
    await tick();
    expect(h.actions).toEqual([command]);
    h.key({ code: 'KeyX' });
    await tick();
    expect(h.actions).toEqual([command]);
    expect(h.legacy).toBe(0);
  } finally {
    h.dispose();
  }
});
test('older valid user P reassignment survives implicit default addition', async () => {
  const h = setup('Win32', {
    version: 1,
    bindings: [{ id: 'find', command: 'find', code: 'KeyP', modifiers: [] }],
  });
  try {
    expect(h.binding().enabled).toBe(false);
    h.key();
    await tick();
    expect(h.actions).toEqual(['find']);
    expect(h.legacy).toBe(0);
  } finally {
    h.dispose();
  }
});
test('active global P claim wins after explicit properties disable', async () => {
  const h = setup();
  try {
    h.settings.setConfig({
      version: 1,
      bindings: [
        { ...h.binding(), enabled: false },
        { id: 'find', command: 'find', code: 'KeyP', modifiers: [] },
      ],
    });
    h.key();
    await tick();
    expect(h.actions).toEqual(['find']);
    expect(h.legacy).toBe(0);
  } finally {
    h.dispose();
  }
});
test('properties reassignment wins over disabled bold default fallback', async () => {
  for (const platform of ['Win32', 'MacIntel', 'Linux']) {
    const h = setup(platform);
    try {
      const bold = h.settings.getConfig().bindings.find((b) => b.id === 'bold')!;
      h.settings.setConfig({
        version: 1,
        bindings: [
          { ...bold, enabled: false },
          { ...h.binding(), code: 'KeyB', modifiers: ['Mod'] },
        ],
      });
      h.key({
        code: 'KeyB',
        key: 'b',
        ctrlKey: platform !== 'MacIntel',
        metaKey: platform === 'MacIntel',
      });
      await tick();
      expect(h.actions).toEqual([command]);
    } finally {
      h.dispose();
    }
  }
});
test('aliases stay contextual and conflicting import leaves current configuration intact', async () => {
  const h = setup();
  try {
    h.settings.setConfig({
      version: 1,
      bindings: [{ ...h.binding(), id: 'properties-alias', code: 'F9' }],
    });
    const before = h.settings.getConfig();
    expect(() =>
      h.settings.setConfig({
        version: 1,
        bindings: [
          { ...h.binding(), code: 'F9' },
          { id: 'find', command: 'find', code: 'F9', modifiers: [] },
        ],
      }),
    ).toThrow();
    expect(h.settings.getConfig()).toBe(before);
    h.selected(false);
    expect(h.key({ code: 'F9', key: 'F9' }).defaultPrevented).toBe(false);
    h.selected(true);
    h.key({ code: 'F9', key: 'F9' });
    await tick();
    expect(h.actions).toEqual([command]);
  } finally {
    h.dispose();
  }
});
test('untrusted, composition, wrong focus, external target and modified P never dispatch', async () => {
  const h = setup();
  try {
    for (const patch of [
      { isTrusted: false },
      { isComposing: true },
      { keyCode: 229 },
      { getModifierState: () => true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
      { shiftKey: true },
      { target: h.input },
      { target: h.doc.createElement('canvas') },
    ])
      h.key(patch);
    for (const config of [
      undefined,
      { version: 1, bindings: [{ ...h.binding(), enabled: false }] },
      { version: 1, bindings: [{ ...h.binding(), code: 'F9' }] },
    ]) {
      if (config) h.settings.setConfig(config);
      for (const patch of [
        { getModifierState: (name: string) => name === 'AltGraph' },
        { ctrlKey: true, altKey: true, getModifierState: (name: string) => name === 'AltGraph' },
        { isComposing: true },
        { keyCode: 229 },
      ]) {
        const event = h.key(patch);
        expect(event.defaultPrevented).toBe(false);
        expect(event.stopped).toBe(false);
        expect(event.immediate).toBe(false);
      }
    }
    h.input.focus();
    h.key();
    await tick();
    expect(h.actions).toEqual([]);
    expect(h.legacy).toBe(0);
  } finally {
    h.dispose();
  }
});
test('unavailable, repeats and pending asynchronous properties do not duplicate dispatch', async () => {
  const h = setup();
  let release!: () => void;
  try {
    h.ready(false);
    expect(h.key().defaultPrevented).toBe(true);
    expect(h.actions).toEqual([]);
    expect(h.statuses.length).toBe(1);
    h.ready(true);
    h.execute(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    h.key();
    h.key();
    h.key({ repeat: true });
    expect(h.actions).toEqual([command]);
    release();
    await tick();
    h.execute(undefined);
    h.key();
    await tick();
    expect(h.actions).toEqual([command, command]);
    h.dispose();
    h.key();
    expect(h.actions).toEqual([command, command]);
  } finally {
    h.dispose();
  }
});
test('blocked contextual host quarantines legacy P without executing; dispose removes handler', () => {
  const h = setup();
  h.dispose();
  const errors: unknown[] = [];
  const host = mountContextualObjectPropertiesShortcut({
    root: h.surface,
    platform: 'windows',
    bindings: OBJECT_PROPERTIES_KEYMAP.bindings,
    hasSelectedObject: () => true,
    blocked: () => true,
    claimed: () => false,
    available: () => true,
    execute: () => {
      throw Error('UnexpectedDispatch');
    },
    onUnavailable() {},
    onError: (e) => errors.push(e),
  });
  expect(h.key().defaultPrevented).toBe(true);
  expect(errors).toEqual([]);
  host.dispose();
  expect(h.key().defaultPrevented).toBe(false);
});
test('partition isolates all properties aliases, while an overridden id can own another command', () => {
  const result = objectPropertiesShortcutConfig({
    version: 1,
    bindings: [
      { ...OBJECT_PROPERTIES_KEYMAP.bindings[0], command: 'find' },
      { ...OBJECT_PROPERTIES_KEYMAP.bindings[0], id: 'alias', code: 'F9' },
    ],
  });
  expect(result.global.bindings.map((b) => b.command)).toEqual(['find']);
  expect(result.contextual.map((b) => b.id)).toEqual(['alias']);
});
