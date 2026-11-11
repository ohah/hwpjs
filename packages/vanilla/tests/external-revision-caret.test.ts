// Actual Surface/controller/renderer, controlled Native ACKs. GUI/Native evidence is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { fixture } from './undo-onset-surface-fixture.ts';
const tick = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
const find = (n: any, key: string): any =>
  n.dataset?.[key] !== undefined ? n : n.children?.map((c: any) => find(c, key)).find(Boolean);
function type(input: any, text: string) {
  const e = new Event('beforeinput', { cancelable: true });
  Object.assign(e, { inputType: 'insertText', data: text });
  input.dispatchEvent(e);
  if (!e.defaultPrevented) {
    const a = input.selectionStart,
      b = input.selectionEnd;
    input.value = input.value.slice(0, a) + text + input.value.slice(b);
    input.setSelectionRange(a + text.length, a + text.length);
    input.dispatchEvent(new Event('input'));
  }
}
for (const cleared of [undefined, null])
  test(`external Native revision + cleared selection ${String(cleared)} is observed before next input/undo`, async (t) => {
    const f = fixture(),
      s = createCanvasSurface({ root: f.root, editor: f.editor });
    t.after(() => s.dispose());
    f.select();
    s.focus();
    f.frame();
    await tick();
    const old = f.state();
    f.externalState({
      content: { ...old.content },
      selection: cleared,
      operationRevision: old.operationRevision + 1,
      viewRevision: old.viewRevision + 1,
      stateVersion: old.stateVersion + 1,
      nativeHistoryRevision: 1,
      nativeHistoryRevisions: [1, 0],
    });
    f.frame();
    await tick();
    const c = find(f.root, 'selectionAuthority');
    const input = find(f.root, 'hwpjsDocumentInput');
    for (const kind of ['pointerdown', 'pointerup']) {
      const e = new Event(kind, { cancelable: true });
      Object.assign(e, { button: 0, pointerId: 1, clientX: 28, clientY: 34 });
      c.dispatchEvent(e);
    }
    for (const key of ['Home', 'ArrowRight']) {
      const e = new Event('keydown', { cancelable: true });
      Object.assign(e, { key });
      input.dispatchEvent(e);
    }
    f.frame();
    await tick();
    const selected = f.state();
    assert.equal(c.dataset.caret, '0:0:1');
    type(input, 'Z');
    await tick();
    f.ack();
    await tick();
    f.frame();
    await tick();
    assert(s.requestHistory('undo'));
    await tick();
    const latest = f.state();
    f.ackHistory({
      content: selected.content,
      selection: undefined,
      operationRevision: latest.operationRevision + 1,
      viewRevision: latest.viewRevision + 1,
      stateVersion: latest.stateVersion + 1,
      nativeHistoryRevision: 1,
      nativeHistoryRevisions: [1, 0, 2],
    });
    await tick();
    f.frame();
    await tick();
    f.frame();
    await tick();
    const canvas = find(f.root, 'selectionAuthority');
    assert.equal(canvas.dataset.selectionAuthority, 'current');
    assert.equal(canvas.dataset.caret, '0:0:1');
    type(input, 'Y');
    await tick();
    assert.equal(f.requests.at(-1).kind, 'splice');
    assert.equal(f.requests.at(-1).text, 'Y');
  });
