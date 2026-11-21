import { compileKeymap, resolveKeyboardShortcut } from '@hwpjs/core';
import type { KeymapBinding, KeymapConfig, KeymapPlatform } from '@hwpjs/core';

export const OBJECT_PROPERTIES_COMMAND = 'object-properties';
export const OBJECT_PROPERTIES_KEYMAP: KeymapConfig = {
  version: 1,
  bindings: [
    {
      id: OBJECT_PROPERTIES_COMMAND,
      command: OBJECT_PROPERTIES_COMMAND,
      code: 'KeyP',
      modifiers: [],
      labelKey: 'command.selected-object-properties',
    },
  ],
  messages: {
    ko: { 'command.selected-object-properties': '선택 개체 속성' },
    en: { 'command.selected-object-properties': 'Selected object properties' },
  },
};

export function objectPropertiesShortcutConfig(config: KeymapConfig) {
  const contextual: KeymapBinding[] = [];
  const bindings = config.bindings.filter((binding) => {
    if (binding.command !== OBJECT_PROPERTIES_COMMAND) return true;
    contextual.push(binding);
    return false;
  });
  return { global: { ...config, bindings }, contextual };
}

export function mountContextualObjectPropertiesShortcut(options: {
  root: HTMLElement;
  platform: KeymapPlatform;
  bindings: readonly KeymapBinding[];
  hasSelectedObject: () => boolean;
  blocked: () => boolean;
  claimed: (event: KeyboardEvent) => boolean;
  available: () => boolean;
  execute: () => void | Promise<void>;
  onUnavailable: () => void;
  onError: (error: unknown) => void;
}) {
  const compile = (bindings: readonly KeymapBinding[]) =>
    compileKeymap({ version: 1, bindings }, options.platform);
  let compiled = compile(options.bindings),
    closed = false,
    pending = false;
  const match = (event: KeyboardEvent) =>
    resolveKeyboardShortcut(compiled, {
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      repeat: false,
    });
  const claims = (event: KeyboardEvent): boolean => {
    if (
      closed ||
      event.defaultPrevented ||
      !event.isTrusted ||
      event.isComposing ||
      event.keyCode === 229 ||
      event.getModifierState?.('AltGraph') === true
    )
      return false;
    const target = event.target as HTMLElement | null;
    if (
      target?.tagName !== 'CANVAS' ||
      !options.root.contains(target) ||
      target.ownerDocument.activeElement !== target ||
      target.closest?.('dialog,[role=dialog],iframe')
    )
      return false;
    try {
      if (!options.hasSelectedObject()) return false;
      // Quarantine the standalone Canvas fallback after disabling/remapping P.
      // Only the JSON physical code matcher can execute the command.
      const legacy =
        event.key.toLowerCase() === 'p' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey;
      if (options.claimed(event)) return false;
      return legacy || match(event) !== null;
    } catch {
      return false;
    }
  };
  const keydown = (event: KeyboardEvent) => {
    if (!claims(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.repeat || pending || event.getModifierState?.('AltGraph')) return;
    try {
      if (options.blocked()) return;
      if (!match(event)) return;
      if (!options.available()) {
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
    claims,
    setBindings(bindings: readonly KeymapBinding[]) {
      compiled = compile(bindings);
    },
    dispose() {
      closed = true;
      options.root.removeEventListener('keydown', keydown, true);
    },
  };
}
