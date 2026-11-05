import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, languages } from './caret-formatting-fixture.mjs';
test('A1 size15 Apply on same raw1500 returns focus through current host without a request/history/result', async () => {
  const f = await fixture();
  try {
    const n = f.messages.length,
      state = f.core.getEditorState();
    const original = f.getHost().captureCaretFormatting;
    f.getHost().captureCaretFormatting = () => {
      const c = original();
      c.request = () => assert.fail('no-op request forbidden');
      c.appliedCurrent = () => assert.fail('no-op is not an applied receipt');
      return c;
    };
    await f.bridge.action({ command: 'set-font-size', points: 15 });
    assert.equal(f.focused, 1);
    assert.equal(f.requests.length, 0);
    assert.equal(f.results.length, 0);
    assert.equal(f.messages.length, n);
    assert.equal(f.core.getEditorState(), state);
    assert.equal(f.typing.size, 1500);
  } finally {
    await f.dispose();
  }
});
for (const mode of ['caret', 'host', 'dispose'])
  test(
    'no-op final current callback ' + mode + ' invalidates focus without changing history',
    async () => {
      const f = await fixture({
        onCapture(f, c) {
          const current = c.current;
          let calls = 0;
          c.current = () => {
            if (++calls === 2) {
              if (mode === 'caret') f.change();
              else if (mode === 'host') f.replaceHost();
              else f.bridge.dispose();
            }
            return current();
          };
        },
      });
      try {
        const n = f.messages.length;
        await f.bridge.action({ command: 'set-font-size', points: 15 });
        assert.equal(f.focused, 0);
        assert.equal(f.requests.length, 0);
        assert.equal(f.results.length, 0);
        assert.equal(f.messages.length, n);
      } finally {
        await f.dispose();
      }
    },
  );
for (const mode of ['readonly', 'IME', 'invalid-size'])
  test('no-op ' + mode + ' does not restore focus or grant typing', async () => {
    const f = await fixture({ readonly: mode === 'readonly' });
    try {
      if (mode === 'IME') f.compose(true);
      await f.bridge.action({
        command: 'set-font-size',
        points: mode === 'invalid-size' ? NaN : 15,
      });
      assert.equal(f.focused, 0);
      assert.equal(f.requests.length, 0);
      assert.equal(f.results.length, 0);
    } finally {
      await f.dispose();
    }
  });
test('same alignment on a current Surface range restores focus with no request or Native result', async () => {
  const f = await fixture();
  try {
    await f.core.setSelection(null);
    const state = f.core.getEditorState();
    const host = f.getHost();
    host.captureSelectionFormatting = () => ({
      state,
      observation: {
        size: 1500,
        bold: false,
        italic: false,
        underline: false,
        strike: false,
        textColor: null,
        fontNames: Object.fromEntries(languages.map((l) => [l, { kind: 'unknown' }])),
        align: 'LEFT',
      },
      reasons: {
        characterAvailableReason: null,
        underlineAvailableReason: null,
        strikeAvailableReason: null,
        textColorAvailableReason: null,
        fontNameAvailableReasons: Object.fromEntries(languages.map((l) => [l, null])),
        paragraphAvailableReason: null,
      },
      current: () => f.core.getEditorState() === state,
      bindDialog: () => false,
      request: () => assert.fail('no-op alignment must not request'),
      settledCurrent: () => assert.fail('not an applied receipt'),
    });
    const n = f.messages.length;
    await f.bridge.action({ command: 'align-left' });
    assert.equal(f.focused, 1);
    assert.equal(f.requests.length, 0);
    assert.equal(f.results.length, 0);
    assert.equal(f.messages.length, n);
  } finally {
    await f.dispose();
  }
});
