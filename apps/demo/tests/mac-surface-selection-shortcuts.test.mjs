import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_KEYMAP } from '@hwpjs/core';
import { createKeyboardShortcuts } from '../../../packages/vanilla/src/shortcuts.ts';
import { resolveCommandSupport } from '../src/command-support.ts';
for (const [code, command] of [
  ['KeyC', 'copy'],
  ['KeyX', 'cut'],
])
  test('Mac Cmd+' + code + '는 최신 Surface gate로만 shell 접수', () => {
    const root = new EventTarget(),
      calls = [],
      denied = [];
    let availability = { enabled: false, surfaceSelection: true, reason: 'MissingSelection' };
    const keyboard = createKeyboardShortcuts({
      root,
      config: DEFAULT_KEYMAP,
      platform: 'mac',
      isAvailable: (cmd) =>
        resolveCommandSupport(cmd, {
          document: 'ready',
          hasSelection: false,
          connected: true,
          availability,
        }).enabled,
      execute: (cmd) => calls.push(cmd),
      onUnavailable: (cmd) => denied.push(cmd),
    });
    const key = () => {
      const e = new Event('keydown', { cancelable: true });
      Object.assign(e, {
        code,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        isComposing: false,
        repeat: false,
        keyCode: 0,
        getModifierState: () => false,
      });
      root.dispatchEvent(e);
      assert.equal(e.defaultPrevented, true);
    };
    try {
      key();
      assert.deepEqual(calls, []);
      assert.deepEqual(denied, [command]);
      availability = { enabled: true, surfaceSelection: true };
      key();
      assert.deepEqual(calls, [command]);
      availability = { enabled: false, surfaceSelection: true, reason: 'StaleSurface' };
      key();
      assert.deepEqual(calls, [command]);
    } finally {
      keyboard.dispose();
    }
  });
