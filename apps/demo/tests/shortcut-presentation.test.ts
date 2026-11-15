import { test, expect } from 'bun:test';
import {
  shortcutFromEvent,
  shortcutText,
  indexShortcutBindings,
} from '../src/shortcut-presentation.ts';
import {
  DEFAULT_KEYMAP,
  compileKeymap,
  resolveKeyboardShortcut,
  mergeKeymap,
} from '../../../packages/core/src/index.ts';
const binding = DEFAULT_KEYMAP.bindings.find((b) => b.id === 'find')!;
const event = (extra = {}) =>
  ({
    code: 'KeyJ',
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: true,
    isComposing: false,
    keyCode: 74,
    repeat: false,
    getModifierState: () => false,
    ...extra,
  }) as KeyboardEvent;
test('recording preserves a physical chord; refuses typing, modifier-only, repeat, IME and AltGraph', () => {
  expect(shortcutFromEvent(event(), binding)).toMatchObject({
    code: 'KeyJ',
    modifiers: ['Control', 'Shift'],
    enabled: true,
  });
  for (const extra of [
    { ctrlKey: false, shiftKey: false },
    { code: 'ControlLeft' },
    { isComposing: true },
    { keyCode: 229 },
    { repeat: true },
    { getModifierState: () => true },
  ])
    expect(shortcutFromEvent(event(extra), binding)).toBeNull();
  expect(
    shortcutFromEvent(event({ code: 'F9', ctrlKey: false, shiftKey: false }), binding)?.code,
  ).toBe('F9');
});
test('defaults contain supported open/table/paragraph commands and platform labels', () => {
  for (const platform of ['windows', 'linux', 'mac'] as const) {
    const compiled = compileKeymap(DEFAULT_KEYMAP, platform),
      primary = {
        ctrlKey: platform !== 'mac',
        metaKey: platform === 'mac',
        shiftKey: false,
        altKey: false,
      };
    expect(resolveKeyboardShortcut(compiled, { ...primary, code: 'KeyO' })?.command).toBe(
      'open-document',
    );
    expect(
      resolveKeyboardShortcut(compiled, { ...primary, code: 'KeyT', altKey: true })?.command,
    ).toBe('insert-table');
    expect(
      resolveKeyboardShortcut(compiled, {
        ...primary,
        code: 'KeyT',
        altKey: true,
        isComposing: true,
      }),
    ).toBeNull();
    expect(shortcutText(binding, platform)).toBe(platform === 'mac' ? '⌘+F' : 'Ctrl+F');
  }
});
test('explicit recorded Meta uses the same display as platform Mod', () => {
  expect(shortcutText({ ...binding, modifiers: ['Meta', 'Shift'], code: 'KeyJ' }, 'mac')).toBe(
    '⌘+Shift+J',
  );
});
test('custom chord conflicts fail atomically and disabled bindings remain explicitly editable', () => {
  const changed = mergeKeymap(DEFAULT_KEYMAP, {
    version: 1,
    bindings: [shortcutFromEvent(event(), binding)],
  });
  const disabled = mergeKeymap(changed, {
    version: 1,
    bindings: [{ ...changed.bindings.find((b) => b.id === 'find'), enabled: false }],
  });
  expect(disabled.bindings.find((b) => b.id === 'find')?.enabled).toBe(false);
  expect(resolveKeyboardShortcut(compileKeymap(disabled, 'windows'), event())).toBeNull();
  expect(() =>
    mergeKeymap(DEFAULT_KEYMAP, { version: 1, bindings: [{ ...binding, code: 'KeyS' }] }),
  ).toThrow('conflict');
  expect(DEFAULT_KEYMAP.bindings.find((b) => b.id === 'find')?.code).toBe('KeyF');
});

test('indexes preserve command order, platform filtering and disabled rows across config refreshes', () => {
  const config = mergeKeymap(DEFAULT_KEYMAP, {
    version: 1,
    bindings: [
      { id: 'find-second', command: 'find', code: 'F9', modifiers: [] },
      { id: 'find-off', command: 'find', code: 'F10', modifiers: [], enabled: false },
      { id: 'find-mac', command: 'find', code: 'F11', modifiers: [], platform: 'mac' },
    ],
  });
  const windows = indexShortcutBindings(config, 'windows');
  expect(windows.byCommand.get('find')?.map((b) => b.id)).toEqual(['find', 'find-second']);
  expect(windows.byId.get('find-off')?.enabled).toBe(false);
  expect(windows.byId.get('find-mac')?.id).toBe('find-mac');
  expect(windows.byCommand.get('unknown')).toBeUndefined();
  expect(
    indexShortcutBindings(config, 'mac')
      .byCommand.get('find')
      ?.map((b) => b.id),
  ).toEqual(['find', 'find-second', 'find-mac']);
  const next = mergeKeymap(config, {
    version: 1,
    bindings: [{ ...config.bindings.find((b) => b.id === 'find')!, enabled: false }],
  });
  expect(
    indexShortcutBindings(next, 'windows')
      .byCommand.get('find')
      ?.map((b) => b.id),
  ).toEqual(['find-second']);
  expect(windows.byCommand.get('find')?.map((b) => b.id)).toEqual(['find', 'find-second']);
});
