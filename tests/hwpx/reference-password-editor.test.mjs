import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createHwpxPasswordDecoder } from '../../js/hwpx-password.mjs';
import { createHwp5PasswordDecoder } from '../../js/hwp5-password.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { createHwpxReader } from '../../js/hwpx.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { verifyRaw } from '../hwp5/style-preservation/text-record-oracle.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

const wasmBytes = () => readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
const prefix = '검증😀';
const hwpxPath = 'reference/rhwp/samples/HWP5-password-123456.hwpx';
const hwpPath = 'reference/rhwp/samples/hwp3-sample16-hwp5-2024-password-123456.hwp';

test(
  'explicitly decrypted reference HWPX supports one plain edit history and reopen',
  { skip: !existsSync(hwpxPath) && 'RHWP reference fixture is not installed' },
  async () => {
    const wasm = wasmBytes(),
      source = readFileSync(hwpxPath),
      original = Buffer.from(source);
    const decoder = await createHwpxPasswordDecoder(wasm);
    let editor, reader, reopened;
    try {
      const plain = decoder.decryptToPlaintext(source, '123456');
      const plainOriginal = Buffer.from(plain);
      editor = await createHwpxEditor(wasm);
      editor.open(plain);
      assert(Buffer.from(editor.save()).equals(plainOriginal));
      reader = await createHwpxReader(wasm);
      const event = reader
        .readTextEvents(plain)
        .events.find(
          (item) => item.kind === 'content' && editor.canEdit(item.section, item.paragraph),
        );
      assert(event);
      assert.equal(event.section, 0);
      assert.equal(event.paragraph, 2);
      editor.enableHistory({ maxEntries: 2, maxCheckpointBytes: 64 * 1024 * 1024 });
      editor.splice(event.section, event.paragraph, 0, 0, prefix);
      const saved = editor.save();
      for (const flags of [[], ['-O']])
        execFileSync('python3', [...flags, 'tools/hwpx-protected-plain-edit-oracle.py'], {
          input: JSON.stringify({
            before: Buffer.from(plain).toString('base64'),
            after: Buffer.from(saved).toString('base64'),
            selfTest: true,
          }),
          timeout: 30000,
        });
      assert(
        reader
          .readTextEvents(saved)
          .events.some(
            (item) =>
              item.section === event.section &&
              item.paragraph === event.paragraph &&
              item.value === prefix + event.value,
          ),
      );
      assert.equal(editor.undo(), true);
      assert(Buffer.from(editor.save()).equals(Buffer.from(plain)));
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save(), saved);
      reopened = await createHwpxEditor(wasm);
      reopened.open(saved);
      assert.deepEqual(reopened.save(), saved);
      assert(source.equals(original));
      assert(Buffer.from(plain).equals(plainOriginal));
    } finally {
      reopened?.close();
      reader?.close();
      editor?.close();
      decoder.close();
    }
  },
);

test(
  'explicitly decrypted reference HWP5 materializes its empty paragraph and preserves raw records',
  { skip: !existsSync(hwpPath) && 'RHWP reference fixture is not installed' },
  async () => {
    const wasm = wasmBytes(),
      source = readFileSync(hwpPath),
      original = Buffer.from(source);
    const decoder = await createHwp5PasswordDecoder(wasm);
    let editor, reopened;
    try {
      const plain = decoder.decryptToPlaintext(source, '123456');
      const plainOriginal = Buffer.from(plain);
      editor = await createExperimentalHwp5Editor(wasm, plain);
      assert(Buffer.from(editor.save().bytes).equals(plainOriginal));
      assert.equal(editor.text(0, 1), '');
      editor.enableHistory({ maxEntries: 2, maxCheckpointBytes: 64 * 1024 * 1024 });
      editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: prefix });
      assert.equal(editor.text(0, 1), prefix + '\r');
      assert.throws(() => editor.save(), { message: 'LayoutReflowRequired' });
      const saved = editor.save({ allowStaleLayout: true });
      assert.equal(saved.layoutRequiresReflow, true);
      verifyRaw(plain, saved.bytes, 0, 1, 0, 0, prefix);
      assert.equal(editor.undo(), true);
      assert(Buffer.from(editor.save().bytes).equals(Buffer.from(plain)));
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved.bytes);
      reopened = await createExperimentalHwp5Editor(wasm, saved.bytes);
      assert.equal(reopened.text(0, 1), prefix + '\r');
      assert(source.equals(original));
      assert(Buffer.from(plain).equals(plainOriginal));
    } finally {
      reopened?.close();
      editor?.close();
      decoder.close();
    }
  },
);
