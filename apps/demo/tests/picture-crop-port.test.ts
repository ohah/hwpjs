import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureCropPort } from '../src/picture-crop-port.ts';
function fixture() {
  let state: any = { status: 'ready', token: {} },
    selected = true;
  const target: any = {},
    writes: any[] = [],
    releases: any[] = [];
  const observation: any = {
    profileVersion: 1,
    format: 'hwpx',
    section: 0,
    pictureNode: 7,
    crop: { left: 0, top: 0, right: 4800, bottom: 2400 },
    bounds: { width: 4800, height: 2400, basis: 'explicit_pair' },
    historyRevision: 0,
  };
  const editor: any = {
    getEditorState: () => state,
    getPictureCrop: async () => ({ state: 'available', target, observation }),
    releasePictureCrop: async (t: any) => {
      releases.push(t);
    },
    dispatchCommand: async (c: any, p: any) => {
      writes.push({ c, p });
      return { status: 'committed-with-snapshot' };
    },
  };
  const host: any = {
    capturePictureReplacementSelection: () => ({
      section: 0,
      pictureNode: 7,
      current: () => selected,
    }),
  };
  const port = createPictureCropPort(editor, () => host);
  return {
    port,
    editor,
    host,
    writes,
    releases,
    target,
    stale() {
      state = { ...state };
    },
    deselect() {
      selected = false;
    },
  };
}
const crop = { left: 101, top: 207, right: 3101, bottom: 1807 };
test('crop-only selected picture issues typed single-use command without requiring resize geometry', async () => {
  const f = fixture(),
    c = await f.port.capture();
  assert(f.port.current(c));
  await f.port.submit(c, crop);
  assert.equal(f.writes[0].c.name, 'set-picture-crop');
  assert.equal(f.writes[0].p.target, f.target);
  assert.deepEqual(f.writes[0].p.crop, crop);
  await assert.rejects(f.port.submit(c, crop));
  assert.equal(f.writes.length, 1);
});
test('cloned stale and deselected crop captures refuse before dispatch', async () => {
  for (const kind of ['clone', 'state', 'selection']) {
    const f = fixture(),
      c = await f.port.capture();
    if (kind === 'state') f.stale();
    if (kind === 'selection') f.deselect();
    await assert.rejects(f.port.submit(kind === 'clone' ? { ...c } : c, crop));
    assert.equal(f.writes.length, 0);
  }
});
test('late query after selection changed is released, never assigned currentness', async () => {
  const f = fixture();
  let resolve!: (v: any) => void;
  f.editor.getPictureCrop = () => new Promise((r) => (resolve = r));
  const pending = f.port.capture();
  f.deselect();
  resolve({ state: 'available', target: f.target, observation: {} });
  await assert.rejects(pending, /Stale/);
  assert.deepEqual(f.releases, [f.target]);
});
test('capture disposed during pending query cannot publish a late target', async () => {
  const f = fixture();
  let resolve!: (v: any) => void;
  f.editor.getPictureCrop = () => new Promise((r) => (resolve = r));
  const pending = f.port.capture();
  await f.port.release();
  resolve({ state: 'available', target: f.target, observation: {} });
  await assert.rejects(pending, /Stale/);
  assert.equal(f.writes.length, 0);
  assert.deepEqual(f.releases, [f.target]);
});
import { capturePictureSelection } from '../../../web/preview/picture-selection-capture.mjs';
test('H5 Canvas component identity resolves to exact SHAPE_PICTURE physical node, never resize id', async () => {
  const f = fixture();
  let selector: any;
  const source = {
    format: 'hwp5',
    pictures: [
      {
        section: 0,
        pictureNode: 7,
        recordNode: 9,
        resizeRecordNode: 8,
        source: { component_node: 7, picture_node: 9 },
      },
    ],
  };
  const receipt = {},
    picture = { section: 0, pictureNode: 7 };
  const selected = capturePictureSelection(() => ({ source, receipt, picture, epoch: 1 }));
  assert(selected);
  f.host.capturePictureReplacementSelection = () => selected;
  f.editor.getPictureCrop = async (s: any) => {
    selector = s;
    return { state: 'available', target: f.target, observation: {} };
  };
  await f.port.capture();
  assert.deepEqual(selector, { section: 0, pictureNode: 9 });
});
