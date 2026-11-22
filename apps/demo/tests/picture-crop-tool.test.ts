import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesTool } from '../src/object-properties-tool.ts';
import { documentFixture } from './formatting-dialog-test-dom.ts';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture({ capability = true, available = true } = {}) {
  const dom = documentFixture(),
    state: any = {
      status: 'ready',
      capabilities: { pictureCropEditAvailable: capability, pictureResizeAvailable: false },
      content: { format: 'hwpx' },
      token: {},
    },
    target: any = {};
  const editor: any = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    getPictureCrop: async () =>
      available
        ? {
            state: 'available',
            target,
            observation: {
              crop: { left: 101, top: 207, right: 3101, bottom: 1807 },
              bounds: { width: 4800, height: 2400 },
            },
          }
        : { state: 'unavailable', reason: 'PictureCropUnavailable' },
    releasePictureCrop: async () => {},
  };
  const host: any = {
    getContextPicture: () => null,
    capturePictureReplacementSelection: () => ({ section: 0, pictureNode: 7, current: () => true }),
  };
  const tool = createObjectPropertiesTool({
    root: dom.root as any,
    editor,
    host: () => host,
    onClose() {},
    onStatus() {},
  });
  return { ...dom, tool, editor, target };
}
test('crop-only eligible picture opens actual object-properties modal with no resize target', async () => {
  const f = fixture();
  assert.equal(f.tool.presentation().enabled, true);
  await f.tool.open();
  await tick();
  assert(f.role('picture-crop-apply'));
  assert.equal(f.role('picture-crop-top').value, '207');
  assert.equal(f.role('picture-crop-apply').disabled, false);
  f.tool.dispose();
});
test('old engine keeps object-properties crop-only route disabled', () => {
  const f = fixture({ capability: false });
  assert.equal(f.tool.presentation().enabled, false);
  f.tool.dispose();
});
test('close while capture pending prevents late modal or fallback opening', async () => {
  const f = fixture();
  let resolve!: (value: any) => void;
  f.editor.getPictureCrop = () => new Promise((r) => (resolve = r));
  const pending = f.tool.open();
  f.tool.close();
  resolve({ state: 'available', target: f.target, observation: {} });
  await pending;
  assert.equal(f.root.children.length, 0);
  f.tool.dispose();
});
