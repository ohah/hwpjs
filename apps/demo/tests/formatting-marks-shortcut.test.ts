import { test, expect } from 'bun:test';
import { mountFormattingMarksShortcut } from '../src/formatting-marks-shortcut.ts';
function fixture() {
  const handlers = new Map<string, Function>();
  const calls: string[] = [],
    unavailable: string[] = [],
    errors: unknown[] = [];
  let allowed = new Set(['toggle-marks']),
    now = 0;
  const input = { closest: () => ({ matches: () => true }) };
  const root = {
    addEventListener: (type: string, fn: Function) => handlers.set(type, fn),
    removeEventListener: (type: string) => handlers.delete(type),
  };
  const mounted = mountFormattingMarksShortcut({
    root: root as any,
    available: (c) => allowed.has(c),
    execute: (c) => {
      calls.push(c);
    },
    claimed: () => false,
    onUnavailable: (c) => {
      unavailable.push(c);
    },
    onError: (e) => {
      errors.push(e);
    },
    now: () => now,
  });
  const key = (code: string, patch: any = {}) => {
    const e: any = {
      target: input,
      code,
      ctrlKey: code === 'KeyG',
      altKey: false,
      metaKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
      keyCode: 0,
      defaultPrevented: false,
      immediate: false,
      getModifierState: () => false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.immediate = true;
      },
      ...patch,
    };
    handlers.get('keydown')?.(e);
    return e;
  };
  return {
    key,
    calls,
    unavailable,
    errors,
    mounted,
    handlers,
    allow: (...commands: string[]) => {
      allowed = new Set(commands);
    },
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test('an armed unavailable terminal is consumed without issuing an edit command', () => {
  const f = fixture();
  expect(f.key('KeyG').defaultPrevented).toBe(true);
  const terminal = f.key('KeyT');
  expect(terminal.defaultPrevented).toBe(true);
  expect(terminal.immediate).toBe(true);
  expect(f.calls).toEqual([]);
  expect(f.unavailable).toEqual(['toggle-paragraph-marks']);
  expect(f.key('KeyT').defaultPrevented).toBe(false);
  f.mounted.dispose();
});
test('availability lost between prefix and terminal cannot leak the terminal into text', () => {
  const f = fixture();
  f.key('KeyG');
  f.allow();
  expect(f.key('KeyC').defaultPrevented).toBe(true);
  expect(f.calls).toEqual([]);
  expect(f.unavailable).toEqual(['toggle-marks']);
  f.mounted.dispose();
});
test('available sequences dispatch only once and ordinary letters remain ordinary', () => {
  const f = fixture();
  expect(f.key('KeyC').defaultPrevented).toBe(false);
  f.key('KeyG');
  expect(f.key('KeyC').defaultPrevented).toBe(true);
  expect(f.calls).toEqual(['toggle-marks']);
  expect(f.unavailable).toEqual([]);
  expect(f.key('KeyC').defaultPrevented).toBe(false);
  f.mounted.dispose();
});
test('expired and cancelled prefixes do not claim later typing', () => {
  const f = fixture();
  f.key('KeyG');
  f.advance(1501);
  expect(f.key('KeyT').defaultPrevented).toBe(false);
  f.key('KeyG');
  f.handlers.get('focusout')?.();
  expect(f.key('KeyT').defaultPrevented).toBe(false);
  f.key('KeyG');
  f.handlers.get('compositionstart')?.();
  expect(f.key('KeyT').defaultPrevented).toBe(false);
  f.mounted.dispose();
});
test('IME, 229, AltGraph, repeat and foreign form inputs never dispatch or claim', () => {
  for (const patch of [
    { isComposing: true },
    { keyCode: 229 },
    { getModifierState: () => true },
    { repeat: true },
    { target: { closest: () => ({ matches: () => false }) } },
  ]) {
    const f = fixture();
    expect(f.key('KeyG', patch).defaultPrevented).toBe(false);
    expect(f.key('KeyT', patch).defaultPrevented).toBe(false);
    expect(f.calls).toEqual([]);
    expect(f.unavailable).toEqual([]);
    f.mounted.dispose();
  }
});
test('disposal removes only this boundary listeners', () => {
  const f = fixture();
  f.key('KeyG');
  f.mounted.dispose();
  expect(f.handlers.size).toBe(0);
  expect(f.key('KeyT').defaultPrevented).toBe(false);
});
