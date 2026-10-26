import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { withoutNormalizationExport } from './normalization-export-fixture.mjs';

const bytes = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp');
function missingExport(name) {
  return withoutNormalizationExport(bytes, name);
}

test('missing normalized ABI refuses explicit policy without silently opening a strict session', async () => {
  for (const [name, distribution, error] of [
    ['hwp5_edit_open_normalized', false, /Hwp5NormalizationAbiUnavailable/],
    ['hwp5_edit_open_normalized_distribution', true, /Hwp5NormalizedDistributionAbiUnavailable/],
  ]) {
    const legacy = missingExport(name);
    await assert.rejects(
      createExperimentalHwp5Editor(legacy, input, { distribution, normalizeObservedCfb: true }),
      error,
    );
    const ordinary = await createExperimentalHwp5Editor(legacy, input);
    try {
      assert(ordinary.sectionCount() > 0);
    } finally {
      ordinary.close();
    }
  }
});

test('missing normalization query stays optional and closed-session precedence is preserved', async () => {
  const editor = await createExperimentalHwp5Editor(
    missingExport('hwp5_edit_normalization_info'),
    input,
  );
  try {
    assert.throws(() => editor.normalizationInfo(), /Hwp5NormalizationAbiUnavailable/);
    assert(editor.sectionCount() > 0);
    assert.deepEqual(Buffer.from(editor.save().bytes), input);
  } finally {
    editor.close();
  }
  assert.throws(() => editor.normalizationInfo(), /EditorClosed/);
});

test('normalization is explicit Boolean consent and strict fast path remains byte-exact', async () => {
  for (const normalizeObservedCfb of ['true', 1, null, [], {}]) {
    await assert.rejects(
      createExperimentalHwp5Editor(bytes, input, { normalizeObservedCfb }),
      /Invalid normalization option/,
    );
  }
  for (const normalizeObservedCfb of [false, true]) {
    const editor = await createExperimentalHwp5Editor(bytes, input, { normalizeObservedCfb });
    try {
      assert.deepEqual(editor.normalizationInfo(), {
        normalized: false,
        historyBaseline: 'original',
        deviations: null,
      });
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      editor.close();
    }
  }
});
