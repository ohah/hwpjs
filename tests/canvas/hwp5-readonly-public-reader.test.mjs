import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { readonlyWasmFixture } from '../helpers/hwp5-readonly-wasm-fixture.mjs';
// Actual public SDK and strict transport; Native exports are controlled JS only.
test('readonly SDK and editable SDK keep independent opens and close/outputs in the same controlled instance', async (t) => {
  const h = readonlyWasmFixture(t),
    editor = await createExperimentalHwp5Editor(h.module, new Uint8Array([1])),
    reader = await createHwp5Reader(h.module);
  try {
    assert.equal(h.counts().writer, 1);
    reader.readText(new Uint8Array([1]));
    const s = reader.documentTextSnapshot();
    assert.equal(s.rows[0].text, '가나다');
    assert.equal(s.binding.revision, null);
    assert.match(s.binding.session, /^v-s/);
    assert.match(s.rows[0].ref, /^v-d2-/);
    for (const name of ['save', 'splice', 'undo', 'redo', 'replaceDocumentText'])
      assert.equal(reader[name], undefined);
    reader.close();
    assert.equal(h.counts().writer, 1);
    assert.equal(h.counts().writeCalls, 0);
  } finally {
    reader.close();
    editor.close();
  }
  assert.equal(h.counts().writer, 0);
});
test('readonly SDK rejects editor-domain requests, old epochs, failed-load reuse and calls after close', async (t) => {
  const h = readonlyWasmFixture(t),
    r = await createHwp5Reader(h.module);
  try {
    r.readText(new Uint8Array([1]));
    const s = r.documentTextSnapshot();
    const request = {
      schemaVersion: 1,
      scope: 'native-document-text-selection',
      binding: s.binding,
      readBinding: s.readBinding,
      ref: s.rows[0].ref,
      startUnit: 0,
      endUnit: 1,
      expectedOriginal: '가',
    };
    assert.equal(r.documentTextSelection(request).target.paragraph, 0);
    assert.throws(
      () =>
        r.documentTextSelection({
          ...request,
          binding: { session: 's1', revision: null },
          ref: request.ref.slice(2),
        }),
      /ControlledNativeRejected/,
    );
    assert.equal(
      h.counts().genericErrorReads,
      0,
      'read query must not consume the editable/generic error state',
    );
    r.readText(new Uint8Array([2]));
    assert.equal(r.documentTextSnapshot().rows[0].text, '라마바');
    assert.throws(() => r.documentTextSelection(request), /ControlledNativeRejected/);
    assert.throws(() => r.readText(new Uint8Array([0])), /ControlledNativeRejected/);
    assert.equal(r.supportsDocumentTextSnapshot(), false);
    assert.throws(() => r.documentTextSnapshot(), /NotOpen/);
    r.readText(new Uint8Array([3]));
    assert.equal(r.supportsDocumentTextSnapshot(), false);
    assert.throws(() => r.documentTextSnapshot(), /ControlledNativeRejected/);
  } finally {
    r.close();
  }
  assert.throws(() => r.documentTextReadBinding(), /ReaderClosed/);
  assert.equal(h.counts().writeCalls, 0);
});
test('old WASM keeps preview but explicitly refuses optional whole-document read; ABI6 still required', async (t) => {
  const h = readonlyWasmFixture(t, { optional: false }),
    r = await createHwp5Reader(h.module);
  try {
    r.readText(new Uint8Array([1]));
    assert.equal(r.supportsDocumentTextSnapshot(), false);
    assert.equal(r.documentTextReadStatus().reason, 'Hwp5DocumentTextReadAbiUnavailable');
    assert.throws(() => r.documentTextSnapshot(), /AbiUnavailable/);
  } finally {
    r.close();
  }
  delete h.wasm.cfb_alloc;
  await assert.rejects(createHwp5Reader(h.module), /Missing HWPJS ABI export/);
});

test('readonly close permanently revokes public reads and releases preview output even when Native cleanup throws', async (t) => {
  const h = readonlyWasmFixture(t),
    r = await createHwp5Reader(h.module);
  r.readText(new Uint8Array([1]));
  let freed = 0;
  h.wasm.hwp5_text_free = () => {
    freed++;
  };
  const close = h.wasm.hwp5_read_close;
  h.wasm.hwp5_read_close = () => {
    close();
    throw Error('ControlledCloseFailure');
  };
  assert.throws(() => r.close(), /ControlledCloseFailure/);
  assert.equal(freed, 1);
  assert.throws(() => r.documentTextReadBinding(), /ReaderClosed/);
  assert.throws(() => r.readText(new Uint8Array([2])), /ReaderClosed/);
  r.close();
  assert.equal(freed, 1);
});

test('preview and readonly Native owner use the same owned input even if the caller view changes between reads', async (t) => {
  const h = readonlyWasmFixture(t),
    r = await createHwp5Reader(h.module),
    input = new Uint8Array([1]);
  const read = h.wasm.hwp5_text_read;
  h.wasm.hwp5_text_read = (ptr, size) => {
    const value = read(ptr, size);
    input[0] = 2;
    return value;
  };
  try {
    const preview = r.readText(input);
    assert.equal(preview.sections[0].paragraphs[0].text, '가나다');
    assert.equal(input[0], 2);
    assert.equal(r.documentTextSnapshot().rows[0].text, '가나다');
  } finally {
    r.close();
  }
});
