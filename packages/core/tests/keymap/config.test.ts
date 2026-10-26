import { test, expect } from 'bun:test';
import { parseKeymapConfig, mergeKeymap, resolveShortcutLabel } from '../../src/keymap/config.ts';
const binding = (patch: Record<string, unknown> = {}) => ({
  id: 'save',
  command: 'host.save',
  code: 'KeyS',
  modifiers: ['Mod'],
  ...patch,
});
const config = (bindings: unknown[] = [binding()], patch: Record<string, unknown> = {}) => ({
  version: 1,
  bindings,
  ...patch,
});
test('parser owns frozen config and accepts generic host commands', () => {
  const input = config();
  const parsed = parseKeymapConfig(input);
  (input.bindings[0] as any).command = 'changed';
  expect(parsed.bindings[0].command).toBe('host.save');
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(Object.isFrozen(parsed.bindings[0].modifiers)).toBe(true);
});
test('strict JSON schema rejects null, unknown fields, malformed codes, modifiers and duplicate IDs', () => {
  const bad = [
    null,
    '{}',
    {},
    config([], { version: 2 }),
    config([], { extra: true }),
    config([null]),
    config([binding({ extra: true })]),
    config([binding({ id: '' })]),
    config([binding({ command: '' })]),
    config([binding({ code: 'Ctrl+S' })]),
    config([binding({ code: 'KeyAA' })]),
    config([binding({ code: 'F25' })]),
    config([binding({ modifiers: ['Super'] })]),
    config([binding({ modifiers: ['Mod', 'Mod'] })]),
    config([binding({ modifiers: ['Mod', 'Control'] })]),
    config([binding({ modifiers: ['Mod', 'Meta'] })]),
    config([binding({ enabled: null })]),
    config([binding({ platform: 'ios' })]),
    config([binding({ labelKey: null })]),
    config([binding(), binding({ enabled: false })]),
    config([], { messages: null }),
    config([], { messages: { en: { save: 3 } } }),
  ];
  for (const input of bad) expect(() => parseKeymapConfig(input)).toThrow('InvalidKeymap');
});
test('platform intersection and Mod expansion detect simultaneous conflicts, including mac-only collisions', () => {
  for (const platform of ['mac', 'windows', 'linux', 'all'])
    expect(() =>
      parseKeymapConfig(config([binding(), binding({ id: 'other', platform })])),
    ).toThrow('conflict');
  expect(() =>
    parseKeymapConfig(
      config([binding(), binding({ id: 'other', modifiers: ['Meta'], platform: 'mac' })]),
    ),
  ).toThrow('conflict');
  expect(
    parseKeymapConfig(
      config([binding({ platform: 'mac' }), binding({ id: 'other', platform: 'windows' })]),
    ).bindings.length,
  ).toBe(2);
  expect(
    parseKeymapConfig(config([binding(), binding({ id: 'disabled', enabled: false })])).bindings
      .length,
  ).toBe(2);
});
test('merge replaces by ID, keeps explicit disabled rows and merges locale keys without mutating defaults', () => {
  const defaults = config([binding(), binding({ id: 'find', code: 'KeyF' })], {
    messages: { en: { save: 'Save', find: 'Find' }, ko: { save: '저장' } },
  });
  const merged = mergeKeymap(
    defaults,
    config([binding({ enabled: false, code: 'KeyD' })], { messages: { en: { save: 'Custom' } } }),
  );
  expect(merged.bindings.map((b) => [b.id, b.enabled])).toEqual([
    ['save', false],
    ['find', undefined],
  ]);
  expect(merged.messages?.en).toEqual({ save: 'Custom', find: 'Find' });
  expect(merged.messages?.ko.save).toBe('저장');
  expect((defaults.bindings[0] as any).code).toBe('KeyS');
  expect(() => mergeKeymap(defaults, config([binding({ id: 'find', code: 'KeyS' })]))).toThrow(
    'conflict',
  );
  expect(() => mergeKeymap(defaults, config([null]))).toThrow();
});
test('labels fall back exact locale -> base -> en -> binding id, preserve plain text', () => {
  const c = parseKeymapConfig(
    config([binding({ labelKey: 'action.save' })], {
      messages: {
        'ko-KR': { 'action.save': '저장(KR)' },
        ko: { 'action.save': '저장' },
        en: { 'action.save': 'Save' },
      },
    }),
  );
  const b = c.bindings[0];
  expect(resolveShortcutLabel(c, b, 'ko-KR')).toBe('저장(KR)');
  expect(resolveShortcutLabel(c, b, 'ko-JP')).toBe('저장');
  expect(resolveShortcutLabel(c, b, 'fr')).toBe('Save');
  expect(resolveShortcutLabel(parseKeymapConfig(config()), b, 'fr')).toBe('save');
  const html = parseKeymapConfig(
    config([binding()], { messages: { en: { save: '<b>Save</b>' } } }),
  );
  expect(resolveShortcutLabel(html, html.bindings[0], 'en')).toBe('<b>Save</b>');
});
test('accessor and non-JSON prototypes are rejected without invoking getters', () => {
  let reads = 0;
  const input = Object.defineProperty({ version: 1, bindings: [] }, 'messages', {
    get() {
      reads++;
      return {};
    },
    enumerable: true,
  });
  expect(() => parseKeymapConfig(input)).toThrow();
  expect(reads).toBe(0);
  expect(() => parseKeymapConfig(new Date())).toThrow();
  const c = parseKeymapConfig(
    JSON.parse(
      '{"version":1,"bindings":[],"messages":{"en":{"__proto__":"safe","constructor":"safe too"}}}',
    ),
  );
  expect(c.messages?.en.__proto__).toBe('safe');
  expect(Object.getPrototypeOf(c.messages?.en)).toBe(null);
});

test('nonenumerable unknown fields and symbol fields cannot bypass schema checks', () => {
  expect(() =>
    parseKeymapConfig(Object.defineProperty(config(), 'secret', { value: true })),
  ).toThrow('InvalidKeymap');
  expect(() => parseKeymapConfig({ ...config(), [Symbol('secret')]: true })).toThrow(
    'InvalidKeymap',
  );
});
