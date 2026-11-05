import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { SET_CHARACTER_FONT_NAME_COMMAND, getSelectionFormatting } from '@hwpjs/core';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
import { fixture } from './caret-formatting-fixture.mjs';
const styles = installFormattingTestStyles();
after(() => styles.deregister());
const { createFontNameTool } = await import('../src/font-name-tool.ts');
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function modal(options = {}) {
  const f = await fixture(options);
  let cb,
    view,
    focus = 0,
    dispose = 0;
  const results = [],
    statuses = [];
  const tool = createFontNameTool({
    root: {},
    editor: f.editor,
    api: { command: SET_CHARACTER_FONT_NAME_COMMAND, observe: getSelectionFormatting },
    getSurfaceFormattingHost: f.getHost,
    onClose() {
      focus++;
    },
    onPresentationChange() {},
    onStatus(s) {
      statuses.push(s);
      options.status?.(f, tool, s);
    },
    onResult: (r) => results.push(r),
    createView(_root, callbacks) {
      cb = callbacks;
      return {
        getDialogElement: () => ({}),
        update: (v) => (view = v),
        show() {},
        dispose() {
          dispose++;
        },
        isComposing: () => false,
      };
    },
  });
  return {
    f,
    tool,
    results,
    statuses,
    get view() {
      return view;
    },
    get focus() {
      return focus;
    },
    get disposed() {
      return dispose;
    },
    async open(language = 'hangul') {
      assert.equal(tool.open(language), true);
      await tick();
    },
    input(name) {
      cb.onInput(name);
    },
    async apply() {
      await cb.onApply();
      await tick();
      await tick();
    },
    async dispose() {
      tool.dispose();
      await f.dispose();
    },
  };
}
test('single-language font intent closes current modal with no Native result or fake Core target', async () => {
  const m = await modal();
  try {
    await m.open('latin');
    m.input('입력영문');
    assert.equal(m.view.canApply, true);
    const state = m.f.core.getEditorState(),
      n = m.f.messages.length;
    await m.apply();
    assert.deepEqual(m.f.requests, [{ kind: 'font-name', language: 'latin', name: '입력영문' }]);
    assert.equal(m.f.messages.length, n);
    assert.equal(m.f.core.getEditorState(), state);
    assert.equal(m.results.length, 0);
    assert.equal(m.focus, 1);
    assert.equal(m.disposed, 1);
  } finally {
    await m.dispose();
  }
});
for (const kind of ['caret', 'host', 'dispose'])
  test(
    'font request→onStatus ' + kind + ' reentry rejects focus restoration after callback',
    async () => {
      const m = await modal({
        status(f, tool, s) {
          if (!s.startsWith('다음 입력')) return;
          if (kind === 'caret') f.change();
          else if (kind === 'host') f.replaceHost();
          else tool.dispose();
        },
      });
      try {
        await m.open();
        m.input('입력한글');
        await m.apply();
        assert.equal(m.f.requests.length, 1);
        assert.equal(m.results.length, 0);
        assert.equal(m.focus, 0);
      } finally {
        await m.dispose();
      }
    },
  );
for (const kind of ['readonly', 'stale', 'same-name', 'representative', 'bind-failure', 'IME'])
  test('font ' + kind + ' keeps unsupported/stale typing request blocked', async () => {
    const m = await modal({ readonly: kind === 'readonly', bindFailure: kind === 'bind-failure' });
    try {
      await m.open(kind === 'representative' ? 'representative' : 'hangul');
      m.input(kind === 'same-name' ? '문서원본' : '새입력');
      if (kind === 'stale') m.f.change();
      if (kind === 'IME') m.f.compose(true);
      await m.apply();
      assert.equal(m.f.requests.length, 0);
      assert.equal(m.results.length, 0);
      assert.equal(m.focus, 0);
    } finally {
      await m.dispose();
    }
  });
test('shared caret surface disables color write while direct dialog remains readonly and cannot issue Native zero-range edit', async () => {
  const { captureFormattingPresentation } = await import('../src/surface-formatting-capture.ts');
  const { createTextColorTool } = await import('../src/text-color-tool.ts');
  const f = await fixture();
  let callbacks, view;
  const tool = createTextColorTool({
    root: {},
    editor: f.editor,
    getSurfaceFormattingHost: f.getHost,
    onStatus() {},
    onClose() {},
    onPresentationChange() {},
    createView(_root, cb) {
      callbacks = cb;
      return {
        update: (v) => (view = v),
        show() {},
        dispose() {},
        isComposing: () => false,
        getDialogElement: () => ({}),
      };
    },
  });
  try {
    const shared = captureFormattingPresentation(f.editor, f.getHost);
    assert.equal(tool.presentation(shared)['text-color'].enabled, false);
    assert.equal(tool.presentation(shared)['text-color'].reason, 'CaretColorUnsupported');
    assert.equal(f.captures, 1);
    const count = f.messages.length;
    tool.action('text-color');
    await tick();
    callbacks.onInput('#ff0000');
    assert.equal(view.canApply, false);
    await callbacks.onApply();
    await tick();
    assert.equal(f.requests.length, 0);
    assert.equal(f.messages.length, count);
  } finally {
    tool.dispose();
    await f.dispose();
  }
});
