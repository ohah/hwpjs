import test from 'node:test';
import assert from 'node:assert/strict';
import { getSelectionFormatting } from '@hwpjs/core';
import {
  captureSurfaceFormatting,
  captureFormattingPresentation,
} from '../src/surface-formatting-capture.ts';
import { fixture } from './caret-formatting-fixture.mjs';
test('shared caret capture is read once and retains actual zero-length Core target', async () => {
  const f = await fixture();
  try {
    const p = captureFormattingPresentation(f.editor, f.getHost);
    const ui = f.bridge.getPresentation(p);
    assert.equal(f.captures, 1);
    assert.equal(ui.fontSizePoints, 15);
    assert.equal(ui.fontName, '문서원본');
    assert.equal(ui.actions.bold.pressed, true);
    assert.equal(f.core.getEditorState().selection.startUnit, 1);
    assert.equal(f.core.getEditorState().selection.endUnit, 1);
  } finally {
    await f.dispose();
  }
});
for (const [command, extra, expected] of [
  ['bold', {}, false],
  ['italic', {}, true],
  ['set-font-size', { points: 20 }, 2000],
])
  test(
    command + ' changes only typing intent with no Native result or model/history write',
    async () => {
      const f = await fixture();
      try {
        const before = f.core.getEditorState(),
          count = f.messages.length;
        await f.bridge.action({ command, ...extra });
        assert.equal(f.requests.length, 1);
        assert.equal(f.typing[command === 'set-font-size' ? 'size' : command], expected);
        assert.equal(f.messages.length, count);
        assert.equal(f.core.getEditorState(), before);
        assert.equal(f.results.length, 0);
        assert.equal(f.focused, 1);
      } finally {
        await f.dispose();
      }
    },
  );
test('same size is no-op without request or Native command and restores focus', async () => {
  const f = await fixture();
  try {
    await f.bridge.action({ command: 'set-font-size', points: 15 });
    assert.equal(f.requests.length, 0);
    assert.equal(f.focused, 1);
  } finally {
    await f.dispose();
  }
});
test('readonly values remain visible with all typing writers disabled', async () => {
  const f = await fixture({ readonly: true });
  try {
    const p = f.bridge.getPresentation();
    assert.equal(p.fontSizePoints, 15);
    assert.equal(p.fontName, '문서원본');
    assert.equal(p.actions.bold.enabled, false);
    await f.bridge.action({ command: 'bold' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.dispose();
  }
});
for (const mode of ['caret', 'host', 'dispose'])
  test('post-status ' + mode + ' reentry never restores focus to changed caret', async () => {
    const f = await fixture({
      onStatus(f, s) {
        if (!s.startsWith('다음 입력')) return;
        if (mode === 'caret') f.change();
        else if (mode === 'host') f.replaceHost();
        else f.bridge.dispose();
      },
    });
    try {
      await f.bridge.action({ command: 'italic' });
      assert.equal(f.requests.length, 1);
      assert.equal(f.focused, 0);
    } finally {
      await f.dispose();
    }
  });
test('queued update changes caret before admission and rejects request', async () => {
  const f = await fixture({ onUpdate: (f) => f.change() });
  try {
    await f.bridge.action({ command: 'bold' });
    assert.equal(f.requests.length, 0);
    assert.equal(f.focused, 0);
  } finally {
    await f.dispose();
  }
});
test('IME forbids capture and preserves input intent', async () => {
  const f = await fixture();
  try {
    f.compose(true);
    const p = f.bridge.getPresentation();
    assert.equal(p.actions.bold.enabled, false);
    await f.bridge.action({ command: 'bold' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.dispose();
  }
});
test('a typing capture is one-shot and later movement invalidates appliedCurrent', async () => {
  const f = await fixture();
  try {
    const s = f.core.getEditorState();
    const c = captureSurfaceFormatting(f.editor, f.getHost, s, getSelectionFormatting(s));
    assert.equal(c.request({ kind: 'character-properties', properties: { size: 2000 } }), true);
    assert.equal(c.request({ kind: 'character-properties', properties: { size: 2200 } }), false);
    assert.equal(c.settledCurrent(), true);
    f.change();
    assert.equal(c.settledCurrent(), false);
  } finally {
    await f.dispose();
  }
});
test('nonempty Core selection uses original public path without caret port', async () => {
  const f = await fixture();
  try {
    await f.select(0, 2);
    const ui = f.bridge.getPresentation();
    assert.equal(ui.fontSizePoints, 15);
    assert.equal(f.captures, 0);
    const n = f.messages.length;
    await f.bridge.action({ command: 'italic' });
    assert.equal(f.captures, 0);
    assert.equal(f.requests.length, 0);
    assert.ok(f.messages.length > n);
  } finally {
    await f.dispose();
  }
});
test('stale Surface capture cannot supply typing authority while canonical Core readonly stays visible', async () => {
  const f = await fixture({ onCapture: (f) => f.change() });
  try {
    const ui = f.bridge.getPresentation();
    assert.equal(ui.fontSizePoints, 15);
    assert.equal(ui.actions.italic.enabled, false);
    await f.bridge.action({ command: 'italic' });
    assert.equal(f.requests.length, 0);
  } finally {
    await f.dispose();
  }
});
test('Core target survives caret change and undo-style invalidation cannot reuse an old receipt', async () => {
  const f = await fixture();
  try {
    const shared = captureFormattingPresentation(f.editor, f.getHost);
    await f.select(2);
    assert.equal(shared.capture.current(), false);
    assert.equal(
      shared.capture.request({ kind: 'character-properties', properties: { bold: false } }),
      false,
    );
    assert.equal(f.requests.length, 0);
  } finally {
    await f.dispose();
  }
});
test('collapsed paragraph alignment retains original Core command instead of unsupported typing request', async () => {
  const f = await fixture();
  try {
    const ui = f.bridge.getPresentation();
    assert.equal(ui.actions['align-center'].enabled, true);
    assert.equal(ui.actions['align-center'].surfaceSelection, false);
    const n = f.messages.length;
    await f.bridge.action({ command: 'align-center' });
    assert.equal(f.requests.length, 0);
    assert.ok(f.messages.length > n);
    assert.equal(f.messages.at(-1).kind, 'paragraph-alignment');
  } finally {
    await f.dispose();
  }
});
