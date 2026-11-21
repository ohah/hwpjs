import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as core from '../../packages/hwpjs/dist/index.js';
import * as runtime from '../../packages/hwpjs/dist/runtime.js';

const anchors = new Map([
  ['top_left', [0, 0]],
  ['top_center', [0.5, 0]],
  ['top_right', [1, 0]],
  ['center_left', [0, 0.5]],
  ['center_right', [1, 0.5]],
  ['bottom_left', [0, 1]],
  ['bottom_center', [0.5, 1]],
  ['bottom_right', [1, 1]],
]);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const wasm = await readFile(new URL('../../packages/hwpjs/dist/hwpjs.wasm', import.meta.url));
const fixtures = new URL('../../tools/pages-demo/fixtures/', import.meta.url);
assert.match(process.env.HWPJS_TEST_WASM_EXPECTED_SHA256 ?? '', /^[0-9a-f]{64}$/);
assert.equal(sha256(wasm), process.env.HWPJS_TEST_WASM_EXPECTED_SHA256);
const module = await runtime.createWasmModuleLoader({ fetch: async () => new Response(wasm) })();
assert.deepEqual(core.PICTURE_RESIZE_ANCHORS, [...anchors.keys()]);

// Output digests come from the independently checked CFB and ZIP/XML saves.
const examples = [
  [
    'hwp5',
    'hwp',
    '06f558d278cb6886866ab743ee2230f45d54f4042a70579f8795bd3ed6057036',
    '6c9cf5d003c06002e664f56deceddb1b43e85b6b488bc22a67bb971f10751e2f',
  ],
  [
    'hwpx',
    'hwpx',
    '91a6ddb492823d450b1b10432224074d804ff6feca8a37b78fce86bf5282cbfd',
    '86ca744bd279f16e5eb07c1d4629e81d0018367f889224b5adca2470ab4b02ea',
  ],
];
for (const [format, extension, inputSha, editedSha] of examples) {
  const bytes = await readFile(new URL('anchored-picture.' + extension, fixtures));
  assert.equal(sha256(bytes), inputSha);
  for (const [anchor, [factorX, factorY]] of anchors) {
    test(`public ${format} anchored resize preserves ${anchor}, history and saved position`, async () => {
      const editor = core.createEditor({
        runtimeFactory: runtime.createReaderRuntimeFactory({ wasmModule: module }),
      });
      try {
        const load = (file) => editor.load(file, { format, editable: true });
        const save = async () => Buffer.from((await editor.save({ allowStaleLayout: true })).bytes);
        await load(bytes);
        const read = () => {
          const [row, additional] = editor.getEditorState().content.pictures;
          assert.equal(additional, undefined);
          return editor.getAnchoredPictureResize({
            section: row.section,
            pictureNode: format === 'hwp5' ? row.resizeRecordNode : row.pictureNode,
          });
        };
        const before = await save();
        const initial = await read();
        assert.equal(initial.state, 'available', JSON.stringify(initial));
        const { width, height, horizontalOffset, verticalOffset, historyRevision } =
          initial.observation;
        const payload = {
          target: initial.target,
          width: width - 1200,
          height: height - 600,
          anchor,
        };
        const update = await editor.dispatchCommand(core.RESIZE_PICTURE_ANCHORED_COMMAND, payload);
        assert.equal(update.status, 'committed-with-snapshot', JSON.stringify(update));
        const expected = {
          ...initial.observation,
          width: payload.width,
          height: payload.height,
          horizontalOffset: horizontalOffset + 1200 * factorX,
          verticalOffset: verticalOffset + 600 * factorY,
          historyRevision: historyRevision + 1,
        };
        const after = await read();
        assert.deepEqual(after.observation, expected);
        const saved = await save();
        if (anchor === 'bottom_right') assert.equal(sha256(saved), editedSha);
        await editor.undo();
        assert.deepEqual(await save(), before);
        await editor.redo();
        assert.deepEqual(await save(), saved);
        await load(saved);
        const reopened = await read();
        assert.deepEqual(reopened.observation, { ...expected, historyRevision: 0 });
      } finally {
        await editor.dispose();
      }
    });
  }
}
