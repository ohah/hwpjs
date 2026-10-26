import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { decodeObservedDocInfoDiagnostics } from '../../js/hwp5-observed-docinfo.mjs';

test('observed DocInfo options reject invalid and unsupported combinations before WASM loading', async () => {
  for (const retainObservedDocInfo of [null, 1, 'true', {}]) {
    await assert.rejects(
      createExperimentalHwp5Editor(null, null, { retainObservedDocInfo }),
      /Invalid observed DocInfo option/,
    );
  }
  for (const option of ['distribution', 'availableSectionCopy']) {
    await assert.rejects(
      createExperimentalHwp5Editor(null, null, { retainObservedDocInfo: true, [option]: true }),
      /Unsupported observed DocInfo option combination/,
    );
  }
});

test('observed DocInfo diagnostics validate counters without manufacturing missing values', () => {
  const decode = (value) =>
    decodeObservedDocInfoDiagnostics(new TextEncoder().encode(JSON.stringify(value)));
  const value = {
    absent_carets: 1,
    unresolved_font_types: 31,
    unresolved_style_characters: 50,
    unresolved_character_tails: 55,
    absent_fill_additionals: 13,
    resource_count_mismatch: true,
  };
  assert.deepEqual(decode(value), value);
  assert.equal(decode(null), null);
  for (const key of Object.keys(value).filter((key) => key !== 'resource_count_mismatch')) {
    for (const invalid of [undefined, -1, 0x100000000, 0.5, '1'])
      assert.throws(
        () => decode({ ...value, [key]: invalid }),
        /InvalidObservedDocInfoDiagnostics/,
      );
  }
  assert.throws(
    () => decode({ ...value, resource_count_mismatch: 1 }),
    /InvalidObservedDocInfoDiagnostics/,
  );
});

test(
  'old WASM refuses the explicitly requested observed DocInfo mode',
  { skip: !process.env.HWPJS_BASELINE_WASM },
  async () => {
    await assert.rejects(
      createExperimentalHwp5Editor(
        readFileSync(process.env.HWPJS_BASELINE_WASM),
        readFileSync('reference/rhwp/samples/20250130-hongbo_saved.hwp'),
        { normalizeObservedCfb: true, retainObservedDocInfo: true },
      ),
      /Hwp5ObservedDocInfoAbiUnavailable/,
    );
  },
);
