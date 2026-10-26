import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyboardShortcuts } from '../src/shortcuts.ts';
import { compileKeymap, resolveKeyboardShortcut } from '../../core/src/keymap/resolve.ts';
import { createHistoryInputIntentQueue } from '../../../web/preview/history-input-intent-queue.mjs';
const config = {
  version: 1,
  bindings: [
    { id: 'undo', command: 'undo', code: 'KeyZ', modifiers: ['Mod'] },
    { id: 'redo', command: 'redo', code: 'KeyZ', modifiers: ['Mod', 'Shift'] },
    { id: 'bold', command: 'bold', code: 'KeyB', modifiers: ['Mod'] },
  ],
};
const tick = () => new Promise((r) => setImmediate(r));
function fixture(platform = 'mac', extra = {}) {
  const handlers = new Map(),
    calls = [],
    errors = [];
  const root = {
    addEventListener: (t, f) => handlers.set(t, f),
    removeEventListener: (t) => handlers.delete(t),
  };
  const host = createKeyboardShortcuts({
    root,
    config,
    fallback: config,
    platform,
    isAvailable: () => true,
    execute: (c) => calls.push(c),
    onError: (e) => errors.push(e),
    ...extra,
  });
  const fire = (type = 'keydown', patch = {}) => {
    const e = {
      code: 'KeyZ',
      ctrlKey: platform !== 'mac',
      metaKey: platform === 'mac',
      altKey: false,
      shiftKey: false,
      repeat: false,
      isComposing: false,
      keyCode: 90,
      target: null,
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
    handlers.get(type)?.(e);
    return e;
  };
  return { host, fire, calls, errors };
}
for (const platform of ['mac', 'windows']) {
  test(`${platform} 최초+반복5는undo6, keyup이후추가0`, async () => {
    const f = fixture(platform);
    f.fire();
    for (let i = 0; i < 5; i++)
      assert.equal(f.fire('keydown', { repeat: true }).defaultPrevented, true);
    f.fire('keyup');
    await tick();
    assert.deepEqual(f.calls, Array(6).fill('undo'));
    f.host.dispose();
  });
  test(`${platform} Shift redo반복과비이력반복차단`, () => {
    const f = fixture(platform);
    f.fire('keydown', { shiftKey: true });
    f.fire('keydown', { shiftKey: true, repeat: true });
    f.fire('keydown', { code: 'KeyB', repeat: true });
    assert.deepEqual(f.calls, ['redo', 'redo']);
    f.host.dispose();
  });
}
test('코어matcher의반복정책은명령기준이며커스텀코드에도유지', () => {
  const c = compileKeymap(
    {
      ...config,
      bindings: config.bindings.map((b) => ({
        ...b,
        code: b.command === 'undo' ? 'KeyU' : b.code,
      })),
    },
    'mac',
  );
  const e = {
    code: 'KeyU',
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: true,
  };
  assert.equal(resolveKeyboardShortcut(c, e)?.command, 'undo');
  assert.equal(resolveKeyboardShortcut(c, { ...e, code: 'KeyB' }), null);
});
test('IME/229/AltGraph/일반입력은접수하지않음', () => {
  const f = fixture();
  for (const patch of [
    { isComposing: true },
    { keyCode: 229 },
    { getModifierState: () => true },
    { target: { closest: (selector) => (selector === '[data-hwpjs-document-input]' ? null : {}) } },
  ])
    f.fire('keydown', { repeat: true, ...patch });
  assert.deepEqual(f.calls, []);
  f.host.dispose();
});
test('readonly/비활성호스트및키설정해제는우회하지않음', () => {
  const f = fixture('mac', { isAvailable: () => false });
  assert.equal(f.fire('keydown', { repeat: true }).defaultPrevented, true);
  assert.deepEqual(f.calls, []);
  f.host.setConfig({ version: 1, bindings: [] });
  assert.equal(f.fire('keydown', { repeat: true }).defaultPrevented, true);
  assert.deepEqual(f.calls, []);
  f.host.dispose();
});
test('비동기ACK중repeat순서와바닥noop뒤redo·입력순서보존', async () => {
  let busy = false,
    revision = 3,
    queue;
  const applied = [];
  const q = [];
  queue = createHistoryInputIntentQueue({
    ready: () => !busy,
    history: (kind) => {
      busy = true;
      q.push(() => {
        revision = kind === 'undo' ? Math.max(0, revision - 1) : revision + 1;
        applied.push(kind + ':' + revision);
        busy = false;
        queue.wake();
      });
      return true;
    },
    input: (entry) => {
      applied.push(entry.data);
      return true;
    },
    error: (e) => {
      throw e;
    },
  });
  const f = fixture('mac', { execute: (kind) => queue.history(kind) });
  f.fire();
  for (let i = 0; i < 4; i++) f.fire('keydown', { repeat: true });
  f.fire('keyup');
  f.fire('keydown', { shiftKey: true });
  queue.input('insertText', 'y');
  for (let i = 0; i < 12; i++) {
    q.shift()?.();
    await tick();
  }
  assert.deepEqual(applied, ['undo:2', 'undo:1', 'undo:0', 'undo:0', 'undo:0', 'redo:1', 'y']);
  assert.equal(queue.size, 0);
  f.host.dispose();
});
test('문서교체는이전대기반복폐기, dispose이후keydown접수0', async () => {
  let ready = false;
  const calls = [];
  const queue = createHistoryInputIntentQueue({
    ready: () => ready,
    history: (k) => {
      calls.push(k);
      return true;
    },
    input: () => true,
    error: (e) => {
      throw e;
    },
  });
  const f = fixture('mac', { execute: (k) => queue.history(k) });
  f.fire();
  f.fire('keydown', { repeat: true });
  queue.clear();
  ready = true;
  queue.wake();
  await tick();
  assert.deepEqual(calls, []);
  f.host.dispose();
  f.fire('keydown', { repeat: true });
  assert.deepEqual(calls, []);
});

test('기본차단된keydown은중복접수하지않음', () => {
  const f = fixture();
  f.fire('keydown', { repeat: true, defaultPrevented: true });
  assert.deepEqual(f.calls, []);
  f.host.dispose();
});
