import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { fixture } from './undo-onset-surface-fixture.ts';
const tick = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const find = (n, key) =>
  n.dataset?.[key] !== undefined ? n : n.children?.map((c) => find(c, key)).find(Boolean);
function type(input, text) {
  const e = new Event('beforeinput', { cancelable: true });
  Object.assign(e, { inputType: 'insertText', data: text });
  input.dispatchEvent(e);
  if (!e.defaultPrevented) {
    const a = input.selectionStart,
      b = input.selectionEnd;
    input.value = input.value.slice(0, a) + text + input.value.slice(b);
    input.setSelectionRange(a + text.length, a + text.length);
    const v = new Event('input');
    Object.assign(v, { inputType: 'insertText', data: text });
    input.dispatchEvent(v);
  }
}
for (const perFrame of [false, true])
  test(
    '실제 Surface/renderer·Core 상태(통제 lease) ' +
      (perFrame ? 'ACK마다frame' : '여러ACK뒤frame') +
      ': held frame은 중간flush를 유예하고 finalACK는 보존',
    async (t) => {
      const f = fixture(),
        surface = createCanvasSurface({ root: f.root, editor: f.editor });
      t.after(() => surface.dispose());
      f.select();
      surface.focus();
      f.frame();
      await tick();
      const input = find(f.root, 'hwpjsDocumentInput');
      assert.ok(input);
      for (let i = 0; i < 4; i++) type(input, 'a');
      assert.equal(surface.requestHistory('undo'), true);
      await tick();
      assert.equal(f.requests[0].kind, 'splice');
      const before = f.measurements();
      f.ack();
      await tick();
      assert.equal(f.requests.length, 2);
      const afterStage = f.measurements();
      assert.equal(afterStage, before);
      // ACK 사이 RAF도 유효한 held 상태에서는 투영을 유예한다. 마지막 ACK는 fresh 경로다.
      if (perFrame) {
        f.frame();
        await tick();
        assert.equal(f.measurements(), afterStage);
      }
      assert.equal(input.readOnly, false);
      f.ack();
      await tick();
      if (perFrame) {
        f.frame();
        await tick();
      }
      f.ack();
      await tick();
      if (perFrame) {
        f.frame();
        await tick();
      }
      f.ack();
      await tick();
      assert.deepEqual(
        f.requests.map((x) => x.kind),
        ['splice', 'splice', 'splice', 'splice', 'undo'],
      );
      assert.equal(f.state().content.paragraphs[0].text, 'AaaaaB');
      console.log(
        'SURFACE_FRAME_INTERLEAVING ' +
          JSON.stringify({
            requests: f.requests.length,
            text: f.state().content.paragraphs[0].text,
            framePerAck: perFrame,
            measurements: f.measurements(),
            afterStage,
            before,
            Native: false,
          }),
      );
    },
  );
test('실 Surface ownerstate교체/lease해지/IME진입/오류ACK는 held를 해제', async (t) => {
  for (const mode of ['state', 'lease', 'IME', 'error']) {
    const f = fixture(),
      surface = createCanvasSurface({ root: f.root, editor: f.editor });
    t.after(() => surface.dispose());
    f.select();
    surface.focus();
    f.frame();
    await tick();
    const input = find(f.root, 'hwpjsDocumentInput');
    for (let i = 0; i < 4; i++) type(input, 'a');
    assert(surface.requestHistory('undo'));
    await tick();
    const before = f.measurements();
    f.ack();
    await tick();
    assert.equal(f.measurements(), before);
    if (mode === 'state') f.replaceState();
    if (mode === 'lease') f.revoke();
    if (mode === 'IME') input.dispatchEvent(new Event('compositionstart'));
    if (mode === 'error') {
      f.ack(true);
      await tick();
    }
    f.frame();
    await tick();
    assert.ok(f.measurements() > before, mode + ' fresh fallback');
    if (mode === 'lease' || mode === 'error')
      assert.equal(
        f.requests.some((x) => x.kind === 'undo'),
        false,
      );
  }
});
