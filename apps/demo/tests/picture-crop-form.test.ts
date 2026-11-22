import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureCropForm, pictureCropDraft } from '../src/picture-crop-form.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const crop = { left: 101, top: 207, right: 3101, bottom: 1807 };
function fixture({ available = true } = {}) {
  const dom = documentFixture();
  let state: any = { status: 'ready', token: {} },
    listen = () => {},
    closed = 0;
  const writes: any[] = [],
    gate = createObjectPropertiesEditGate();
  const editor: any = {
    getEditorState: () => state,
    getPictureCrop: async () =>
      available
        ? {
            state: 'available',
            target: {},
            observation: { crop, bounds: { width: 4800, height: 2400 } },
          }
        : { state: 'unavailable', reason: 'PictureCropUnavailable' },
    releasePictureCrop: async () => {},
    registerStateListener: (fn: any) => {
      listen = fn;
      return () => {};
    },
    dispatchCommand: async (c: any, p: any) => {
      writes.push({ c, p });
      return { status: 'committed-with-snapshot' };
    },
  };
  const host: any = {
    capturePictureReplacementSelection: () => ({ section: 0, pictureNode: 7, current: () => true }),
  };
  const form = createPictureCropForm({
    root: dom.root as any,
    editor,
    host: () => host,
    gate,
    onClose() {
      closed++;
    },
    onStatus() {},
  });
  return {
    ...dom,
    form,
    gate,
    writes,
    closed: () => closed,
    stale() {
      state = { ...state };
      listen();
    },
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test('accessible named source boundaries preserve asymmetric order and one command', async () => {
  const f = fixture();
  await tick();
  assert.equal(f.role('picture-crop-top').value, '207');
  assert.equal(f.role('picture-crop-right').value, '3101');
  assert.equal(f.role('picture-crop-left').getAttribute('aria-label'), '자르기 왼쪽 (원본 좌표)');
  fire(f.role('picture-crop-apply'), 'click');
  await tick();
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.writes[0].p.crop, crop);
  assert.equal(f.closed(), 1);
  f.form.dispose();
});
test('old engine crop lane remains disabled with explicit unavailable reason', async () => {
  const f = fixture({ available: false });
  await tick();
  assert.equal(f.role('picture-crop-apply').disabled, true);
  assert.match(f.role('picture-crop-status').textContent, /Unavailable/);
  fire(f.role('picture-crop-apply'), 'click');
  await tick();
  assert.equal(f.writes.length, 0);
  f.form.dispose();
});
test('geometry dirty and stale state block crop without splitting multiple mutations', async () => {
  const f = fixture();
  await tick();
  f.gate.setDirty('geometry', true);
  assert.equal(f.role('picture-crop-apply').disabled, true);
  f.gate.setDirty('geometry', false);
  f.stale();
  assert.equal(f.role('picture-crop-apply').disabled, true);
  fire(f.role('picture-crop-apply'), 'click');
  await tick();
  assert.equal(f.writes.length, 0);
  f.form.dispose();
});
test('invalid empty reversed outside decimal and negative requests refuse without normalization', () => {
  for (const patch of [
    { left: '-1' },
    { left: '3101' },
    { right: '4801' },
    { top: '1.5' },
    { left: '' },
  ])
    assert.throws(() =>
      pictureCropDraft(
        { left: '101', top: '207', right: '3101', bottom: '1807', ...patch },
        { width: 4800, height: 2400 },
      ),
    );
});
test('IME composition and key229 cannot submit a partial crop draft', async () => {
  const f = fixture();
  await tick();
  fire(f.role('picture-crop-left').parentElement!.parentElement!, 'keydown', {
    keyCode: 229,
    isComposing: true,
  });
  assert.equal(f.role('picture-crop-apply').disabled, true);
  fire(f.role('picture-crop-apply'), 'click');
  await tick();
  assert.equal(f.writes.length, 0);
  f.form.dispose();
});
