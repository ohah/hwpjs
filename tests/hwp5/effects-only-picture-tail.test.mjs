import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { inspect, records } from './style-preservation/text-record-oracle.mjs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';
import { projectHwp5PictureGeometry } from '../../web/preview/hwp5-picture-geometry.mjs';
import { attachHwp5PictureTails } from '../../web/preview/hwp5-picture-tail-content.mjs';

test('5.0.3.0 actual effects-only tails match all fourteen independent 82-byte records', async () => {
  assert(process.env.HWPJS_TEST_WASM, 'Explicit effects-only candidate required');
  const input = readFileSync('reference/rhwp/samples/basic/sungeo.hwp');
  const raw = records(inspect(input).sections[0].bytes).filter((r) => r.tag === 85);
  assert.equal(raw.length, 14);
  const editor = await createExperimentalHwp5Editor(
    readFileSync(process.env.HWPJS_TEST_WASM),
    input,
  );
  try {
    assert.equal(editor.fileVersion(), 0x05000300);
    const rows = editor.pictureTailSources(0, 'effects_only');
    assert.equal(rows.length, 14);
    for (const [i, row] of rows.entries()) {
      const p = raw[i].payload;
      assert.equal(p.length, 82);
      assert.equal(row.border_opacity, p[73]);
      assert.equal(row.instance_id, p.readUInt32LE(74));
      assert.equal(row.effects_flags, p.readUInt32LE(78));
      assert.equal(row.effects_flags, 0);
      assert.equal(row.image_width, null);
      assert.equal(row.image_height, null);
      assert.equal(row.image_alpha, null);
      assert.equal(row.extra_bytes, 0);
    }
    assert.throws(() => editor.pictureTailSources(0, 'dimensions8'), /UnexpectedEnd/);
    assert.throws(() => editor.pictureTailSources(0, 'with_alpha9'), /UnexpectedEnd/);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
  }
});
test('effects-only Worker preserves absence and eliminates unselected-tail paint refusal', async (t) => {
  const h = await workerCanvasHarness(t);
  const reply = await h.send({
    kind: 'load',
    format: 'hwp5',
    bytes: readFileSync('reference/rhwp/samples/basic/sungeo.hwp'),
  });
  assert.equal(reply.error, undefined);
  assert.deepEqual(reply.content.hwp5PictureTailErrors, []);
  assert.equal(reply.content.hwp5PictureTails.length, 14);
  const projected = projectHwp5PictureGeometry(reply.content);
  assert.equal(projected.state, 'projected', projected.error);
  assert.equal(projected.pictures.length, 14);
  for (const picture of projected.pictures) {
    assert.equal(picture.paintError, null);
    assert.deepEqual(picture.crop.imageDimensions, [null, null]);
    assert.equal(picture.tailSource.image_alpha, null);
    assert.equal(picture.tailSource.layout, 'effects_only');
  }
});
test('effects-only selection refuses dimensions alpha trailing bytes and neighboring versions', () => {
  const tail = {
    component_node: 2,
    owner_node: 1,
    picture_node: 3,
    border_opacity: 0,
    instance_id: 1,
    effects_flags: 0,
    image_width: null,
    image_height: null,
    image_alpha: null,
    extra_bytes: 0,
  };
  const content = () => ({
    hwp5Pictures: [{ section: 0, pictureNode: 2, recordNode: 3, source: { owner_node: 1 } }],
  });
  for (const mutate of [
    (r) => (r.extra_bytes = 1),
    (r) => {
      r.image_width = 1;
      r.image_height = 1;
    },
    (r) => {
      r.image_width = 1;
      r.image_height = 1;
      r.image_alpha = 0;
    },
  ]) {
    const bad = structuredClone(tail);
    mutate(bad);
    const result = attachHwp5PictureTails(
      { fileVersion: () => 0x05000300, pictureTailSources: () => [bad] },
      content(),
    );
    assert.deepEqual(result.hwp5PictureTails, []);
    assert.equal(result.hwp5PictureTailErrors[0].error, 'Hwp5PictureTailLayoutMismatch');
  }
  for (const version of [0x050002ff, 0x05000301]) {
    let reads = 0;
    const result = attachHwp5PictureTails(
      {
        fileVersion: () => version,
        pictureTailSources() {
          reads++;
          return [tail];
        },
      },
      content(),
    );
    assert.equal(reads, 0);
    assert.equal(result.hwp5PictureTailErrors[0].error, 'UnselectedHwp5PictureTailVersion');
  }
});
