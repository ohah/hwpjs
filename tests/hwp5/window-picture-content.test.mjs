import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import { projectHwp5OwnedWindow } from '../../web/preview/hwp5-window-projection.mjs';
import { attachHwp5WindowDrawings } from '../../web/preview/hwp5-window-drawing-content.mjs';
import { attachHwp5WindowPictures } from '../../web/preview/hwp5-window-picture-content.mjs';
import { readHwp5PictureBytes } from '../../web/preview/hwp5-picture-content.mjs';
import { independentPictureBytes } from './picture-byte-oracle.mjs';
import { inspect } from './style-preservation/text-record-oracle.mjs';

test('actual picture window retains only its selected root and native binary resource', async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwp');
  const editor = await createExperimentalHwp5Editor(wasm, input),
    reader = await createHwp5Reader(wasm);
  try {
    assert.equal(editor.pictureSources(0, 'base73').length, 11);
    const content = projectHwp5OwnedWindow(editor, reader.readText(input), { offset: 0, count: 1 });
    attachHwp5WindowDrawings(editor, content);
    assert.deepEqual(content.hwp5DrawingErrors, []);
    attachHwp5WindowPictures(editor, content);
    assert.deepEqual(content.hwp5PictureErrors, []);
    assert.deepEqual(content.hwp5PictureTailErrors, []);
    assert.equal(content.hwp5Pictures.length, 1);
    assert.equal(content.hwp5PictureTails.length, 1);
    const picture = content.hwp5Pictures[0];
    const bytes = readHwp5PictureBytes(editor, picture.section, picture.pictureNode);
    const expected = independentPictureBytes(inspect(input), picture.source.bin_data_id);
    assert(expected.length > 0);
    assert.deepEqual(Buffer.from(bytes), expected);
    assert.throws(
      () => editor.binaryResource(picture.source.bin_data_id, { maxBytes: expected.length - 1 }),
      /LimitExceeded/,
    );
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
    reader.close();
  }
});
