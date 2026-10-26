import {
  compileKeymap,
  resolveKeyboardShortcut,
  type KeymapConfig,
  type KeymapPlatform,
} from '@hwpjs/core';
export interface KeyboardShortcutsOptions {
  readonly root: HTMLElement;
  readonly config: KeymapConfig;
  readonly platform: KeymapPlatform;
  /** Suppress old built-in handlers when a consumer disables/reassigns a default binding. */
  readonly fallback?: KeymapConfig;
  readonly isAvailable: (command: string) => boolean;
  readonly execute: (command: string) => void | Promise<void>;
  /** Focus a ready document input for the browser's trusted primary+V action. */
  readonly nativePaste?: () => boolean;
  readonly onUnavailable?: (command: string) => void;
  readonly onError?: (error: unknown) => void;
}
/** Host keyboard boundary; pure matching/configuration stays in core. */
export function createKeyboardShortcuts(options: KeyboardShortcutsOptions) {
  let compiled = compileKeymap(options.config, options.platform),
    closed = false;
  const fallback = options.fallback ? compileKeymap(options.fallback, options.platform) : undefined;
  const keyboard = (event: KeyboardEvent) => {
    if (closed || event.defaultPrevented) return;
    const target = event.target as Element | null;
    if (
      target &&
      typeof target.closest === 'function' &&
      target.closest('input,textarea,select,[contenteditable]') &&
      !target.closest('[data-hwpjs-document-input]')
    )
      return;
    const input = {
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: event.isComposing,
      keyCode: event.keyCode,
      repeat: false,
      altGraph: event.getModifierState?.('AltGraph') === true,
    };
    const binding = resolveKeyboardShortcut(compiled, input);
    if (!binding) {
      const original = fallback && resolveKeyboardShortcut(fallback, input);
      if (original) {
        event.stopPropagation();
        if (['copy', 'cut', 'paste', 'undo', 'redo'].includes(original.command))
          event.preventDefault();
      }
      return;
    }
    // Capture before Canvas' built-in key handlers: one keypress means one public command.
    event.stopPropagation();
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    try {
      if (!options.isAvailable(binding.command)) {
        event.preventDefault();
        options.onUnavailable?.(binding.command);
        return;
      }
      const primary =
        options.platform === 'mac'
          ? input.metaKey && !input.ctrlKey
          : input.ctrlKey && !input.metaKey;
      if (
        binding.command === 'paste' &&
        input.code === 'KeyV' &&
        primary &&
        !input.altKey &&
        !input.shiftKey &&
        options.nativePaste?.() === true
      ) {
        // Browser dispatches a trusted paste event to the now-focused input.
        // Existing Canvas input/lease handling owns the edit; do not issue a second command.
        if (!options.isAvailable(binding.command)) {
          event.preventDefault();
          options.onUnavailable?.(binding.command);
        }
        return;
      }
      event.preventDefault();
      const result = options.execute(binding.command);
      if (result && typeof result.then === 'function')
        void result.catch((error) => {
          if (!closed) options.onError?.(error);
        });
    } catch (error) {
      event.preventDefault();
      if (!closed) options.onError?.(error);
    }
  };
  options.root.addEventListener('keydown', keyboard, true);
  return {
    setConfig(config: KeymapConfig) {
      if (closed) throw Error('KeyboardShortcutsDisposed');
      const next = compileKeymap(config, options.platform);
      compiled = next;
    },
    dispose() {
      if (closed) return;
      closed = true;
      options.root.removeEventListener('keydown', keyboard, true);
    },
  };
}
