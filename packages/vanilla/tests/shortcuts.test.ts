import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboardShortcuts } from '../src/shortcuts.ts';
import { parseKeymapConfig } from '@hwpjs/core';
const base = parseKeymapConfig({
  version: 1,
  bindings: [{ id: 'undo', command: 'undo', code: 'KeyZ', modifiers: ['Mod'] }],
});
function fixture(available = true, options: Record<string, unknown> = {}) {
  const handlers = new Set<(event: any) => void>(),
    calls: string[] = [],
    errors: unknown[] = [];
  let form = false,
    documentInput = false;
  const root = {
    addEventListener(type: string, handler: any, capture: boolean) {
      assert.equal(type, 'keydown');
      assert.equal(capture, true);
      handlers.add(handler);
    },
    removeEventListener(type: string, handler: any, capture: boolean) {
      assert.equal(capture, true);
      handlers.delete(handler);
    },
    closest(selector: string) {
      return selector === '[data-hwpjs-document-input]'
        ? documentInput
          ? {}
          : null
        : form
          ? {}
          : null;
    },
  };
  const adapter = createKeyboardShortcuts({
    root: root as any,
    config: base,
    fallback: base,
    platform: 'mac',
    isAvailable: () => available,
    execute: (command) => {
      calls.push(command);
    },
    onUnavailable: (command) => calls.push('unavailable:' + command),
    onError: (e) => errors.push(e),
    ...options,
  });
  const key = (patch: any = {}) => {
    const event: any = {
      target: root,
      code: 'KeyZ',
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
      keyCode: 90,
      defaultPrevented: false,
      stopped: false,
      getModifierState: () => false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopPropagation() {
        this.stopped = true;
      },
      ...patch,
    };
    // oxlint-disable-next-line unicorn/no-useless-spread -- 순회 중 리스너가 등록·해제되어도 접수 시점의 구독 목록을 순회하도록 snapshot을 유지한다.
    for (const fn of [...handlers]) fn(event);
    return event;
  };
  return {
    adapter,
    key,
    calls,
    errors,
    form() {
      form = true;
    },
    input() {
      form = true;
      documentInput = true;
    },
    handlers,
  };
}
test('captured physical shortcut dispatches once; config changes and disposal are local', () => {
  const f = fixture(),
    other = fixture();
  assert.equal(f.key().defaultPrevented, true);
  assert.deepEqual(f.calls, ['undo']);
  assert.deepEqual(other.calls, []);
  f.adapter.setConfig(
    parseKeymapConfig({
      version: 1,
      bindings: [{ id: 'undo', command: 'find', code: 'KeyZ', modifiers: ['Mod'] }],
    }),
  );
  f.key();
  assert.deepEqual(f.calls, ['undo', 'find']);
  f.adapter.dispose();
  f.adapter.dispose();
  f.key();
  assert.equal(f.calls.length, 2);
  assert.equal(f.handlers.size, 0);
  other.adapter.dispose();
});
test('composing, AltGraph, unrelated modifiers and ordinary inputs preserve browser input', () => {
  const f = fixture();
  for (const patch of [
    { isComposing: true },
    { keyCode: 229 },
    { getModifierState: () => true },
    { altKey: true },
    { ctrlKey: true },
  ])
    assert.equal(f.key(patch).defaultPrevented, false);
  assert.deepEqual(f.calls, []);
  f.form();
  assert.equal(f.key().defaultPrevented, false);
  f.input();
  assert.equal(f.key().defaultPrevented, true);
  assert.deepEqual(f.calls, ['undo']);
  f.adapter.dispose();
});
test('history repeat executes once per event and disabled defaults cannot reach legacy handlers', () => {
  const f = fixture();
  const repeated = f.key({ repeat: true });
  assert.equal(repeated.stopped, true);
  assert.equal(repeated.defaultPrevented, true);
  assert.deepEqual(f.calls, ['undo']);
  f.adapter.setConfig(parseKeymapConfig({ version: 1, bindings: [] }));
  const removed = f.key();
  assert.equal(removed.stopped, true);
  assert.equal(removed.defaultPrevented, true);
  assert.deepEqual(f.calls, ['undo']);
  f.adapter.dispose();
});
test('disabled redo also suppresses browser history beforeinput without dispatching a command', () => {
  const redo = parseKeymapConfig({
    version: 1,
    bindings: [{ id: 'redo', command: 'redo', code: 'KeyZ', modifiers: ['Mod', 'Shift'] }],
  });
  const f = fixture(true, { config: redo, fallback: redo });
  f.adapter.setConfig(parseKeymapConfig({ version: 1, bindings: [] }));
  const event = f.key({ shiftKey: true });
  assert.equal(event.stopped, true);
  assert.equal(event.defaultPrevented, true);
  assert.deepEqual(f.calls, []);
  f.adapter.dispose();
});
test('unavailable commands report once, and invalid replacement preserves the last valid keymap', () => {
  const f = fixture(false);
  assert.equal(f.key().defaultPrevented, true);
  assert.deepEqual(f.calls, ['unavailable:undo']);
  assert.throws(() => f.adapter.setConfig({ version: 2, bindings: [] } as any));
  f.key();
  assert.deepEqual(f.calls, ['unavailable:undo', 'unavailable:undo']);
  f.adapter.dispose();
});

const paste = parseKeymapConfig({
  version: 1,
  bindings: [{ id: 'paste', command: 'paste', code: 'KeyV', modifiers: ['Mod'] }],
});
test('standard paste delegates to browser input exactly once after public focus without clipboard readText', () => {
  let focused = 0;
  const f = fixture(true, {
    config: paste,
    fallback: paste,
    nativePaste: () => {
      focused++;
      return true;
    },
  });
  const event = f.key({ code: 'KeyV' });
  assert.equal(event.stopped, true);
  assert.equal(event.defaultPrevented, false);
  assert.equal(focused, 1);
  assert.deepEqual(f.calls, []);
  const repeat = f.key({ code: 'KeyV', repeat: true });
  assert.equal(repeat.defaultPrevented, true);
  assert.equal(focused, 1);
  f.adapter.dispose();
});
test('disabled paste cannot reach legacy browser paste, while unavailable or failed focus cannot edit', () => {
  let available = true;
  const f = fixture(true, {
    config: paste,
    fallback: paste,
    isAvailable: () => available,
    nativePaste: () => {
      available = false;
      return true;
    },
  });
  assert.equal(f.key({ code: 'KeyV' }).defaultPrevented, true);
  assert.deepEqual(f.calls, ['unavailable:paste']);
  f.adapter.setConfig(parseKeymapConfig({ version: 1, bindings: [] }));
  f.calls.length = 0;
  const disabled = f.key({ code: 'KeyV' });
  assert.equal(disabled.defaultPrevented, true);
  assert.equal(disabled.stopped, true);
  assert.deepEqual(f.calls, []);
  f.adapter.dispose();
  const bad = fixture(true, {
    config: paste,
    nativePaste: () => {
      throw Error('FocusFailed');
    },
  });
  assert.equal(bad.key({ code: 'KeyV' }).defaultPrevented, true);
  assert.equal(bad.errors.length, 1);
  assert.deepEqual(bad.calls, []);
  bad.adapter.dispose();
});
test('custom paste keys and hosts without a focused native input retain explicit command dispatch', () => {
  const custom = parseKeymapConfig({
    version: 1,
    bindings: [{ id: 'paste', command: 'paste', code: 'F9', modifiers: [] }],
  });
  let focusCalls = 0;
  const f = fixture(true, {
    config: custom,
    nativePaste: () => {
      focusCalls++;
      return true;
    },
  });
  assert.equal(f.key({ code: 'F9', metaKey: false }).defaultPrevented, true);
  assert.deepEqual(f.calls, ['paste']);
  assert.equal(focusCalls, 0);
  f.adapter.dispose();
  const fallback = fixture(true, { config: paste, nativePaste: () => false });
  assert.equal(fallback.key({ code: 'KeyV' }).defaultPrevented, true);
  assert.deepEqual(fallback.calls, ['paste']);
  fallback.adapter.dispose();
});
