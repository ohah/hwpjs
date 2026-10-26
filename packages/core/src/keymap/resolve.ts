import {
  validateKeymapConfig,
  keymapModifierMask,
  type KeymapBinding,
  type KeymapPlatform,
} from './config.ts';
export interface CompiledKeymap {
  readonly platform: KeymapPlatform;
  readonly bindings: readonly KeymapBinding[];
}
export interface NormalizedShortcutEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly isComposing?: boolean;
  readonly keyCode?: number;
  readonly repeat?: boolean;
  readonly altGraph?: boolean;
}
// Private lookup: mutating a public Map cannot manufacture or replace a binding.
const compiledIndexes = new WeakMap<CompiledKeymap, ReadonlyMap<string, KeymapBinding>>();
export function compileKeymap(config: unknown, platform: KeymapPlatform): CompiledKeymap {
  if (!['mac', 'windows', 'linux'].includes(platform)) throw new TypeError('InvalidKeymapPlatform');
  const owned = validateKeymapConfig(config);
  const bindings = Object.freeze(
    owned.bindings.filter(
      (binding) =>
        binding.enabled !== false &&
        (!binding.platform || binding.platform === 'all' || binding.platform === platform),
    ),
  );
  const index = new Map(
    bindings.map((binding) => [
      `${binding.code}:${keymapModifierMask(binding, platform)}`,
      binding,
    ]),
  );
  const compiled = Object.freeze({ platform, bindings });
  compiledIndexes.set(compiled, index);
  return compiled;
}
/** Exact physical code/modifier matching. Never preventDefault or dispatch here. */
export function resolveKeyboardShortcut(
  compiled: CompiledKeymap,
  event: NormalizedShortcutEvent,
): KeymapBinding | null {
  const index = compiledIndexes.get(compiled);
  if (!index) throw new TypeError('InvalidCompiledKeymap');
  if (!event || event.isComposing || event.keyCode === 229 || event.altGraph || event.repeat)
    return null;
  if (
    typeof event.code !== 'string' ||
    [event.ctrlKey, event.metaKey, event.altKey, event.shiftKey].some(
      (value) => typeof value !== 'boolean',
    )
  )
    return null;
  const mask =
    (event.ctrlKey ? 1 : 0) |
    (event.metaKey ? 2 : 0) |
    (event.altKey ? 4 : 0) |
    (event.shiftKey ? 8 : 0);
  return index.get(`${event.code}:${mask}`) ?? null;
}
