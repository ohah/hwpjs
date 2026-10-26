import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { createCfbReader } from '../../js/cfb.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import {
  inspect,
  records,
  encodeRecord,
  verifyRaw,
} from './style-preservation/text-record-oracle.mjs';

test('observed absent table zone counts survive empty-cell input and saved history', async () => {
  const path = 'reference/rhwp/samples/253E164F57A1BC6934-empty.hwp';
  const input = readFileSync(path);
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  const original = inspect(input);
  const tables = records(original.sections[0].bytes).filter((record) => record.tag === 77);
  assert.equal(tables.length, 2);
  for (const table of tables) {
    assert.equal(table.payload.length, 22);
    assert.equal(table.payload.readUInt16LE(4), 1);
  }
  const editor = await createExperimentalHwp5Editor(wasm, input, { normalizeObservedCfb: true });
  try {
    const baseline = editor.save().bytes;
    assert.deepEqual(inspect(baseline).streams, original.streams);
    editor.enableHistory();
    for (const paragraph of [1, 2, 3, 5]) {
      editor.splice({ section: 0, paragraph, startUnit: 0, endUnit: 0, text: '검증😀' });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      verifyRaw(baseline, saved, 0, paragraph, 0, 0, '검증😀');
      assert.throws(
        () => verifyRaw(baseline, saved, 0, paragraph, 0, 0, '틀림'),
        /complete Section must match/,
      );
      assert.deepEqual(
        records(inspect(saved).sections[0].bytes)
          .filter((record) => record.tag === 77)
          .map((record) => record.raw),
        tables.map((record) => record.raw),
      );
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try {
        assert.equal(reopened.text(0, paragraph), '검증😀\r');
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save().bytes, baseline);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      assert.equal(editor.undo(), true);
    }
  } finally {
    editor.close();
  }
  assert.deepEqual(readFileSync(path), input);
});

test('public empty-cell editing rejects partial zone counts and truncated declared zones atomically', async () => {
  const input = readFileSync('reference/rhwp/samples/253E164F57A1BC6934-empty.hwp');
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  const normalizer = await createExperimentalHwp5Editor(wasm, input, {
    normalizeObservedCfb: true,
  });
  let baseline;
  try {
    baseline = normalizer.save().bytes;
  } finally {
    normalizer.close();
  }
  const source = inspect(baseline);
  const cfb = await createCfbReader(wasm);
  try {
    for (const tail of [
      Buffer.of(0),
      Buffer.of(1, 0),
      Buffer.concat([Buffer.of(1, 0), Buffer.alloc(9)]),
    ]) {
      cfb.parse(baseline, { strict: true });
      const document = cfb.document();
      const section = source.sections[0];
      const changed = Buffer.concat(
        records(section.bytes).map((record) =>
          record.tag === 77
            ? encodeRecord(record.tag, record.level, Buffer.concat([record.payload, tail]))
            : record.raw,
        ),
      );
      const node = document.nodes.find((node) => node.kind === 2 && node.name === 'Section0');
      assert(node);
      node.content = source.compressed ? deflateRawSync(changed) : changed;
      const damaged = cfb.write(document);
      const editor = await createExperimentalHwp5Editor(wasm, damaged);
      try {
        editor.enableHistory();
        assert.throws(
          () =>
            editor.splice({ section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: '검증😀' }),
          /UnexpectedEnd/,
        );
        assert.deepEqual(editor.save().bytes, damaged);
        assert.equal(editor.undo(), false);
        assert.equal(editor.redo(), false);
      } finally {
        editor.close();
      }
    }
  } finally {
    cfb.close();
  }
});
