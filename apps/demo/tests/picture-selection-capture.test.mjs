import test from 'node:test';
import assert from 'node:assert/strict';
import { capturePictureSelection } from '../../../web/preview/picture-selection-capture.mjs';

function fixture() {
  let value = {
    picture: { section: 0, pictureNode: 7 },
    receipt: {},
    source: { format: 'hwpx', pictures: [{ section: 0, pictureNode: 7 }] },
    epoch: 'd1:0',
  };
  return {
    get: () => value,
    set: (patch) => {
      value = { ...value, ...patch };
    },
  };
}
test('picture selection witness does not depend on resize dimensions or geometry capability', () => {
  const f = fixture(),
    capture = capturePictureSelection(f.get);
  assert.equal(capture.current(), true);
  assert.deepEqual([capture.section, capture.pictureNode], [0, 7]);
});
for (const key of ['receipt', 'source', 'epoch']) {
  test(`picture selection witness refuses changed ${key}`, () => {
    const f = fixture(),
      capture = capturePictureSelection(f.get);
    f.set({ [key]: key === 'epoch' ? 'd1:1' : {} });
    assert.equal(capture.current(), false);
  });
}
test('away and back with a new receipt cannot revive selection', () => {
  const f = fixture(),
    capture = capturePictureSelection(f.get);
  f.set({ picture: { section: 0, pictureNode: 8 }, receipt: {} });
  f.set({ picture: { section: 0, pictureNode: 7 }, receipt: {} });
  assert.equal(capture.current(), false);
});
test('no selected picture, source or receipt produces no capture', () => {
  for (const key of ['picture', 'source', 'receipt']) {
    const f = fixture();
    f.set({ [key]: null });
    assert.equal(capturePictureSelection(f.get), null);
  }
});
test('mutating a shared read container cannot replace the captured receipt', () => {
  const value = {
    picture: { section: 0, pictureNode: 7 },
    receipt: {},
    source: { format: 'hwpx', pictures: [{ section: 0, pictureNode: 7 }] },
    epoch: 'd1:0',
  };
  const capture = capturePictureSelection(() => value);
  value.receipt = {};
  assert.equal(capture.current(), false);
});
test('H5 maps the current component only through the exact Native picture record', () => {
  const f = fixture();
  f.set({
    source: {
      format: 'hwp5',
      pictures: [
        {
          section: 0,
          pictureNode: 7,
          recordNode: 11,
          resizeRecordNode: 99,
          source: { component_node: 7, picture_node: 11 },
        },
      ],
    },
  });
  assert.equal(capturePictureSelection(f.get).pictureNode, 11);
});
test('H5 rejects missing, mismatched, or duplicate source links without resize fallback', () => {
  for (const patch of [
    { recordNode: undefined },
    { source: { component_node: 8, picture_node: 11 } },
    { source: { component_node: 7, picture_node: 12 } },
  ]) {
    const f = fixture();
    const row = {
      section: 0,
      pictureNode: 7,
      recordNode: 11,
      resizeRecordNode: 11,
      source: { component_node: 7, picture_node: 11 },
      ...patch,
    };
    f.set({ source: { format: 'hwp5', pictures: [row] } });
    assert.equal(capturePictureSelection(f.get), null);
  }
  const f = fixture(),
    row = { section: 0, pictureNode: 7 };
  f.set({ source: { format: 'hwpx', pictures: [row, row] } });
  assert.equal(capturePictureSelection(f.get), null);
});
