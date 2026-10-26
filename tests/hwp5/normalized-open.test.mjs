import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { decodeHwp5NormalizationInfo } from '../../js/hwp5-normalization-info.mjs';
import { createMemory } from '../../js/wasm-memory.mjs';

test('normalization metadata preserves wide integer and rejects malformed wire', () => {
  assert.equal(decodeHwp5NormalizationInfo(Buffer.from('null')).historyBaseline, 'original');
  for (const value of [[], {}, { original_root_created: 1e20 }, false])
    assert.throws(() => decodeHwp5NormalizationInfo(Buffer.from(JSON.stringify(value))));
  const good = {
    original_root_created: '18446744073709551615',
    zero_fat_tail_slots: 0,
    off_by_one_fat_markers: 0,
    zero_unclaimed_fat_slots: 0,
    orphan_end_fat_slots: 0,
    zero_mini_tail_slots: 0,
    zero_unclaimed_mini_slots: 0,
    zero_unused_entries: 0,
    stale_unused_entries: 0,
  };
  assert.equal(
    decodeHwp5NormalizationInfo(Buffer.from(JSON.stringify(good))).deviations.original_root_created,
    good.original_root_created,
  );
  for (const root of ['18446744073709551616', '-1', '01', '1e3', 9007199254740992, null])
    assert.throws(() =>
      decodeHwp5NormalizationInfo(
        Buffer.from(JSON.stringify({ ...good, original_root_created: root })),
      ),
    );
  for (const count of [-1, 0.5, '0', null, 9007199254740992])
    assert.throws(() =>
      decodeHwp5NormalizationInfo(
        Buffer.from(JSON.stringify({ ...good, zero_fat_tail_slots: count })),
      ),
    );
});

test('failed normalized WASM reopen retains current session metadata and history', async (t) => {
  if (!existsSync('reference/rhwp/samples/issue5447/3차원묶은세로막대형-행추가.hwp')) {
    t.skip('RHWP reference fixture is unavailable');
    return;
  }
  const source = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  const { instance } = await WebAssembly.instantiate(source, {}),
    wasm = instance.exports;
  const memory = createMemory(wasm);
  const info = () => {
    assert.equal(wasm.hwp5_edit_normalization_info(), 1);
    try {
      return decodeHwp5NormalizationInfo(
        memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len()),
      );
    } finally {
      wasm.hwp5_edit_output_free();
    }
  };
  const savedBytes = () => {
    assert.equal(wasm.hwp5_edit_save(1), 1);
    try {
      return memory.copy(wasm.hwp5_edit_output_ptr(), wasm.hwp5_edit_output_len());
    } finally {
      wasm.hwp5_edit_output_free();
    }
  };
  try {
    for (const path of [
      'legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp',
      'reference/rhwp/samples/issue5447/3차원묶은세로막대형-행추가.hwp',
    ]) {
      memory.withBytes(readFileSync(path), (ptr, len) =>
        assert.equal(wasm.hwp5_edit_open_normalized(ptr, len), 1),
      );
      assert.equal(wasm.hwp5_edit_history_enable(8, 8000000), 1);
      memory.withBytes(Buffer.from('원자성😀'), (ptr, len) =>
        assert.equal(wasm.hwp5_edit_splice(0, 0, 0, 0, ptr, len, 0), 1),
      );
      const metadata = info(),
        paragraphs = wasm.hwp5_edit_paragraph_count(0),
        revision = wasm.hwp5_edit_history_revision();
      assert(revision > 0 && revision !== 0xffffffff);
      const saved = savedBytes();
      for (const open of [
        wasm.hwp5_edit_open_normalized,
        wasm.hwp5_edit_open_normalized_distribution,
      ]) {
        for (const invalid of [Buffer.alloc(0), Buffer.alloc(511), Buffer.alloc(512)]) {
          memory.withBytes(invalid, (ptr, len) => assert.equal(open(ptr, len), 0));
          assert.deepEqual(info(), metadata);
          assert.equal(wasm.hwp5_edit_paragraph_count(0), paragraphs);
          assert.equal(wasm.hwp5_edit_history_revision(), revision);
          assert.deepEqual(savedBytes(), saved);
        }
        assert.equal(open(0, 64 * 1024 * 1024 + 1), 0);
        assert.deepEqual(info(), metadata);
        assert.equal(wasm.hwp5_edit_history_revision(), revision);
        assert.deepEqual(savedBytes(), saved);
      }
      assert.equal(wasm.hwp5_edit_undo(), 1);
      assert.equal(wasm.hwp5_edit_redo(), 1);
      assert.deepEqual(savedBytes(), saved);
    }
  } finally {
    wasm.hwp5_edit_close();
  }
  assert.equal(wasm.hwp5_edit_normalization_info(), 0);
});

test('explicit normalized editor keeps default refusal and restores normalized history', async (t) => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  const root = 'reference/rhwp/samples/issue5447';
  if (!existsSync(root)) {
    t.skip('RHWP reference fixtures are unavailable');
    return;
  }
  const paths = readdirSync(root).filter((name) => name.endsWith('.hwp'));
  assert.equal(paths.length, 15);
  for (const name of paths) {
    const input = readFileSync(`${root}/${name}`),
      before = Buffer.from(input);
    await assert.rejects(createExperimentalHwp5Editor(wasm, input), /RepairedSourceUnsupported/);
    const editor = await createExperimentalHwp5Editor(wasm, input, { normalizeObservedCfb: true });
    try {
      const info = editor.normalizationInfo();
      assert.equal(info.normalized, true);
      assert.equal(info.historyBaseline, 'normalized');
      assert.equal(info.deviations.original_root_created, '133523092201799680');
      const baseline = editor.save().bytes;
      assert.notDeepEqual(Buffer.from(baseline), input);
      editor.enableHistory();
      const original = Buffer.from(editor.copyText(0, 0));
      editor.splice({ section: 0, paragraph: 0, startUnit: 0, endUnit: 0, text: '검증😀' });
      const saved = editor.save({ allowStaleLayout: true }).bytes;
      const reopened = await createExperimentalHwp5Editor(wasm, saved);
      try {
        assert.equal(reopened.normalizationInfo().normalized, false);
        assert.deepEqual(
          Buffer.from(reopened.copyText(0, 0)),
          Buffer.concat([Buffer.from('검증😀', 'utf16le'), original]),
        );
      } finally {
        reopened.close();
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.save().bytes, baseline);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.save({ allowStaleLayout: true }).bytes, saved);
      assert.deepEqual(input, before);
    } finally {
      editor.close();
    }
    assert.throws(() => editor.normalizationInfo(), /EditorClosed/);
  }
  const plain = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp');
  const editor = await createExperimentalHwp5Editor(wasm, plain, { normalizeObservedCfb: true });
  try {
    assert.equal(editor.normalizationInfo().normalized, false);
    assert.deepEqual(Buffer.from(editor.save().bytes), plain);
  } finally {
    editor.close();
  }
  await assert.rejects(
    createExperimentalHwp5Editor(wasm, plain, { normalizeObservedCfb: 'yes' }),
    /Invalid normalization option/,
  );
  await assert.rejects(
    createExperimentalHwp5Editor(wasm, plain, { normalizeObservedCfb: true, distribution: true }),
    /NotDistributionDocument/,
  );
});
