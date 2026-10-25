export type KeymapPlatform = 'mac' | 'windows' | 'linux';
export type KeymapModifier = 'Mod' | 'Control' | 'Meta' | 'Alt' | 'Shift';
export interface KeymapBinding {
  readonly id: string;
  /** Generic host command identity; the host owns its command allowlist. */
  readonly command: string;
  readonly code: string;
  readonly modifiers: readonly KeymapModifier[];
  readonly platform?: 'all' | KeymapPlatform;
  readonly enabled?: boolean;
  readonly labelKey?: string;
}
export type ShortcutBinding = KeymapBinding;
export interface KeymapConfig {
  readonly version: 1;
  readonly bindings: readonly KeymapBinding[];
  readonly messages?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}
const platforms = ['mac', 'windows', 'linux'] as const;
const modifiers = new Set(['Mod', 'Control', 'Meta', 'Alt', 'Shift']);
const namedCodes = new Set(('Backquote Backslash Backspace BracketLeft BracketRight Comma Equal Minus Period Quote Semicolon Slash '+
 'AltLeft AltRight CapsLock ContextMenu ControlLeft ControlRight Enter MetaLeft MetaRight ShiftLeft ShiftRight Space Tab '+
 'Delete End Help Home Insert PageDown PageUp ArrowDown ArrowLeft ArrowRight ArrowUp Escape NumLock ScrollLock Pause PrintScreen '+
 'IntlBackslash IntlRo IntlYen Convert NonConvert KanaMode Lang1 Lang2 Lang3 Lang4 Lang5 '+
 'NumpadAdd NumpadBackspace NumpadClear NumpadClearEntry NumpadComma NumpadDecimal NumpadDivide NumpadEnter NumpadEqual NumpadHash NumpadMemoryAdd NumpadMemoryClear NumpadMemoryRecall NumpadMemoryStore NumpadMemorySubtract NumpadMultiply NumpadParenLeft NumpadParenRight NumpadStar NumpadSubtract '+
 'AudioVolumeDown AudioVolumeMute AudioVolumeUp MediaPlayPause MediaStop MediaTrackNext MediaTrackPrevious').split(' '));
function invalid(detail: string): never { throw new TypeError(`InvalidKeymap: ${detail}`); }
function record(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) invalid(where);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !('value' in Object.getOwnPropertyDescriptor(value, key)!)) invalid(`${where} property`);
  }
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, allowed: readonly string[], where: string) {
  for (const key of Object.getOwnPropertyNames(value)) if (!allowed.includes(key)) invalid(`${where}.${key}`);
}
function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) invalid(where);
  return value;
}
export function keymapModifierMask(binding: KeymapBinding, platform: KeymapPlatform): number {
  let mask = 0;
  for (const modifier of binding.modifiers) {
    const expanded = modifier === 'Mod' ? platform === 'mac' ? 'Meta' : 'Control' : modifier;
    mask |= expanded === 'Control' ? 1 : expanded === 'Meta' ? 2 : expanded === 'Alt' ? 4 : 8;
  }
  return mask;
}
/** Validate and own a frozen JSON value. No command registry, DOM or platform detection. */
export function validateKeymapConfig(input: unknown): KeymapConfig {
  const config = record(input, 'config');
  fields(config, ['version', 'bindings', 'messages'], 'config');
  if (config.version !== 1 || !Array.isArray(config.bindings)) invalid('version/bindings');
  const ids = new Set<string>();
  const bindings = config.bindings.map((input, index): KeymapBinding => {
    const row = record(input, `bindings[${index}]`);
    fields(row, ['id', 'command', 'code', 'modifiers', 'platform', 'enabled', 'labelKey'], 'binding');
    const id = text(row.id, 'id'), command = text(row.command, 'command'), code = text(row.code, 'code');
    if (ids.has(id)) invalid(`duplicate id ${id}`);
    ids.add(id);
    if (!/^(?:Key[A-Z]|Digit[0-9]|Numpad[0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(code) && !namedCodes.has(code)) invalid(`code ${code}`);
    if (!Array.isArray(row.modifiers)) invalid('modifiers');
    const seen = new Set<KeymapModifier>();
    for (const modifier of row.modifiers) {
      if (typeof modifier !== 'string' || !modifiers.has(modifier) || seen.has(modifier as KeymapModifier)) invalid('modifier');
      seen.add(modifier as KeymapModifier);
    }
    if (seen.has('Mod') && (seen.has('Control') || seen.has('Meta'))) invalid('Mod with explicit primary modifier');
    if ('platform' in row && !['all', ...platforms].includes(row.platform as KeymapPlatform)) invalid('platform');
    if ('enabled' in row && typeof row.enabled !== 'boolean') invalid('enabled');
    if ('labelKey' in row) text(row.labelKey, 'labelKey');
    return Object.freeze({ id, command, code, modifiers: Object.freeze([...seen]),
      ...('platform' in row ? { platform: row.platform as KeymapBinding['platform'] } : {}),
      ...('enabled' in row ? { enabled: row.enabled as boolean } : {}),
      ...('labelKey' in row ? { labelKey: row.labelKey as string } : {}) });
  });
  for (const platform of platforms) {
    const keys = new Set<string>();
    for (const binding of bindings) {
      if (binding.enabled === false || binding.platform && binding.platform !== 'all' && binding.platform !== platform) continue;
      const key = `${binding.code}:${keymapModifierMask(binding, platform)}`;
      if (keys.has(key)) invalid(`shortcut conflict on ${platform}: ${key}`);
      keys.add(key);
    }
  }
  let messages: Record<string, Readonly<Record<string, string>>> | undefined;
  if ('messages' in config) {
    const source = record(config.messages, 'messages');
    messages = Object.create(null) as typeof messages & object;
    for (const [locale, input] of Object.entries(source)) {
      if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(locale)) invalid('locale');
      const translations = record(input, 'translations');
      const owned: Record<string, string> = Object.create(null);
      for (const [key, value] of Object.entries(translations)) {
        text(key, 'labelKey');
        if (typeof value !== 'string') invalid('message');
        owned[key] = value;
      }
      messages![locale] = Object.freeze(owned);
    }
    Object.freeze(messages);
  }
  return Object.freeze({ version: 1, bindings: Object.freeze(bindings), ...(messages ? { messages } : {}) });
}
/** Overrides are complete binding replacements by id; disabled rows remain explicit. */
export function mergeKeymap(defaults: unknown, overrides: unknown): KeymapConfig {
  const base = validateKeymapConfig(defaults), custom = validateKeymapConfig(overrides);
  const rows = new Map(base.bindings.map(binding => [binding.id, binding]));
  for (const binding of custom.bindings) rows.set(binding.id, binding);
  const messages: Record<string, Record<string, string>> = Object.create(null);
  for (const config of [base, custom]) for (const [locale, values] of Object.entries(config.messages ?? {})) {
    messages[locale] = Object.assign(Object.create(null), messages[locale], values);
  }
  return validateKeymapConfig({ version: 1, bindings: [...rows.values()], messages });
}
/** Labels are plain strings: rendering/HTML escaping belongs to the host. */
export function resolveShortcutLabel(config: KeymapConfig, binding: KeymapBinding, locale: string): string {
  const key = binding.labelKey ?? binding.id;
  for (const language of [locale, locale.split('-')[0], 'en']) {
    const labels = config.messages?.[language];
    if (labels && Object.hasOwn(labels, key)) return labels[key];
  }
  return binding.id;
}

/** Public parser name; input is the decoded JSON value, never evaluated text. */
export const parseKeymapConfig = validateKeymapConfig;
