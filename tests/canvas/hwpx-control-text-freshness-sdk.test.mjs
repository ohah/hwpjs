import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { readonlyWasmFixture } from '../helpers/hwp5-readonly-wasm-fixture.mjs';
function harness(t, options = {}) {
  const h = readonlyWasmFixture(t);
  let output = new Uint8Array(),
    frees = 0,
    identityCalls = 0,
    batches = 0,
    legacy = 0,
    writes = 0;
  const identity = () => ({
    schemaVersion: 1,
    scope: 'native-control-text-identity',
    executionAuthority: false,
    section: 0,
    firstParagraph: 37,
    paragraphCount: 1,
    readBinding: {
      session: 's7',
      epoch: '7',
      serial: identityCalls > 1 && options.aba ? '14' : '13',
    },
  });
  const wire = () => ({
    schemaVersion: 2,
    axis: 'native-control-utf16',
    section: 0,
    readStamp: { session: 's7', serial: '13' },
    coverage: 'complete',
    rows: [
      {
        paragraph: 37,
        sourceNode: 91,
        plain: 'A',
        text: 'A',
        units: 1,
        controls: [],
        coverage: 'complete',
        issue: null,
      },
    ],
  });
  const emit = (value) => {
    output = new TextEncoder().encode(JSON.stringify(value));
    new Uint8Array(h.wasm.memory.buffer, 32768, output.length).set(output);
    return 1;
  };
  Object.assign(h.wasm, {
    hwpx_edit_open: () => 1,
    hwpx_edit_close: () => {},
    hwpx_edit_section_count: () => 1,
    hwpx_edit_can_edit: () => 0,
    hwpx_edit_splice: () => {
      writes++;
      return 0;
    },
    hwpx_edit_save: () => {
      writes++;
      return 0;
    },
    hwpx_edit_output_ptr: () => 32768,
    hwpx_edit_output_len: () => output.length,
    hwpx_edit_output_free: () => {
      frees++;
    },
    hwpx_edit_paragraph_control_text_snapshot: () => {
      legacy++;
      return emit({ ...wire(), schemaVersion: 1 });
    },
    hwpx_edit_control_text_read_identity() {
      identityCalls++;
      const value = identity();
      options.identity?.(value, identityCalls);
      return emit(value);
    },
    hwpx_edit_paragraph_control_text_snapshot_current() {
      batches++;
      const value = wire();
      options.batch?.(value);
      return emit(value);
    },
  });
  if (options.old) delete h.wasm.hwpx_edit_paragraph_control_text_snapshot_current;
  return { ...h, counts: () => ({ frees, identityCalls, batches, legacy, writes }) };
}
test('actual HWPX SDK preserves nonzero section first ordinal and binds v2 to two actual Native identities', async (t) => {
  const h = harness(t),
    editor = await createHwpxEditor(h.module);
  try {
    editor.open(new Uint8Array([1]));
    const value = editor.paragraphControlTextSnapshot(0);
    assert.equal(value.rows[0].paragraph, 37);
    assert.equal(value.schemaVersion, 2);
    assert.deepEqual(h.counts(), { frees: 3, identityCalls: 2, batches: 1, legacy: 0, writes: 0 });
  } finally {
    editor.close();
  }
});
test('Native first zero, shifted first/count, stale session/generation and legacy v1 cannot pass the current SDK', async (t) => {
  for (const options of [
    { identity: (v) => (v.firstParagraph = 0) },
    { identity: (v) => (v.firstParagraph = 38) },
    { identity: (v) => (v.paragraphCount = 2) },
    { batch: (v) => (v.rows[0].paragraph = 38) },
    { batch: (v) => (v.readStamp.session = 's8') },
    { batch: (v) => (v.readStamp.serial = '0') },
    { batch: (v) => (v.schemaVersion = 1) },
  ]) {
    await t.test(
      JSON.stringify(options, (_, v) => (typeof v === 'function' ? String(v) : v)),
      async (sub) => {
        const h = harness(sub, options),
          editor = await createHwpxEditor(h.module);
        try {
          editor.open(new Uint8Array([1]));
          assert.throws(() => editor.paragraphControlTextSnapshot(0));
          assert.equal(h.counts().writes, 0);
        } finally {
          editor.close();
        }
      },
    );
  }
});
test('NoHistory ABA with unchanged logical owner and text still invalidates the captured external generation', async (t) => {
  const h = harness(t, { aba: true }),
    editor = await createHwpxEditor(h.module);
  try {
    editor.open(new Uint8Array([1]));
    assert.throws(() => editor.paragraphControlTextSnapshot(0), /StaleHwpxControlTextSnapshot/);
    assert.equal(h.counts().frees, 3);
    assert.equal(h.counts().writes, 0);
  } finally {
    editor.close();
  }
});
test('old optional batch ABI is refused without a legacy query or repeated anchor fallback', async (t) => {
  const h = harness(t, { old: true }),
    editor = await createHwpxEditor(h.module);
  try {
    editor.open(new Uint8Array([1]));
    assert.equal(editor.supportsParagraphControlTextSnapshotAbi(), false);
    assert.throws(() => editor.paragraphControlTextSnapshot(0), /FreshnessAbiUnavailable/);
    assert.deepEqual(h.counts(), { frees: 0, identityCalls: 0, batches: 0, legacy: 0, writes: 0 });
  } finally {
    editor.close();
  }
});
