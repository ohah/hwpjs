import { compileKeymap, resolveKeyboardShortcut } from '@hwpjs/core';
import type { KeymapBinding, KeymapConfig, KeymapPlatform } from '@hwpjs/core';

export const TABLE_ROW_COMMAND = 'generated-table-insert-row';
export type TableRowShortcutContext = 'body' | 'table' | 'blocked';
// Demo-only default: exported/overridden by id like other bindings, never installed globally.
export const TABLE_ROW_KEYMAP: KeymapConfig = {
  version: 1,
  bindings: [
    {
      id: TABLE_ROW_COMMAND,
      command: TABLE_ROW_COMMAND,
      code: 'Enter',
      modifiers: ['Control'],
      platform: 'all',
      labelKey: 'command.contextual-table-row',
    },
  ],
  messages: {
    ko: { 'command.contextual-table-row': '표 안 아래에 행 삽입' },
    en: { 'command.contextual-table-row': 'Insert row below in table' },
  },
};

/** Partition only at configuration changes. No keydown scans the binding list. */
export function tableRowShortcutConfig(config: KeymapConfig) {
  let contextual: KeymapBinding | undefined;
  const bindings = config.bindings.filter((binding) => {
    if (binding.id !== TABLE_ROW_COMMAND || binding.command !== TABLE_ROW_COMMAND) return true;
    contextual = binding;
    return false;
  });
  return { global: { ...config, bindings }, contextual };
}

/** Context decides routing only. The existing tool/Surface/port retains all authority. */
export function mountContextualTableRowShortcut(options: {
  root: HTMLElement;
  platform: KeymapPlatform;
  binding: KeymapBinding | undefined;
  claimed: (event: KeyboardEvent) => boolean;
  context: () => TableRowShortcutContext;
  available: () => boolean;
  execute: () => void | Promise<void>;
  onUnavailable: () => void;
  onError: (error: unknown) => void;
}) {
  const compile = (binding: KeymapBinding | undefined) =>
    compileKeymap({ version: 1, bindings: binding ? [binding] : [] }, options.platform);
  let compiled = compile(options.binding),
    closed = false,
    pending = false;
  const keydown = (event: KeyboardEvent) => {
    if (
      closed ||
      event.defaultPrevented ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.getModifierState?.('AltGraph')
    )
      return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest?.('[data-hwpjs-document-input]') || !options.root.contains(target)) return;
    const originalChord =
      event.code === 'Enter' && event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    const mapped = resolveKeyboardShortcut(compiled, {
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      repeat: false,
    });
    if (!originalChord && !mapped) return;
    if (options.claimed(event)) return;
    let context: TableRowShortcutContext;
    try {
      context = options.context();
    } catch {
      context = 'blocked';
    }
    if (context === 'body') return;
    // Disabled/remapped defaults and denied table targets must not leak into page split.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || pending) return;
    try {
      if (context !== 'table' || !mapped || !options.available()) {
        options.onUnavailable();
        return;
      }
      pending = true;
      Promise.resolve(options.execute())
        .catch((error) => {
          if (!closed) options.onError(error);
        })
        .finally(() => {
          pending = false;
        });
    } catch (error) {
      pending = false;
      if (!closed) options.onError(error);
    }
  };
  options.root.addEventListener('keydown', keydown, true);
  return {
    setBinding(binding: KeymapBinding | undefined) {
      compiled = compile(binding);
    },
    dispose() {
      closed = true;
      options.root.removeEventListener('keydown', keydown, true);
    },
  };
}
