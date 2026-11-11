import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDocumentOperations, validateDocumentOperations } from '../src/document-operations.ts';
const values = {
  orientation: 'narrowly',
  width: 64800,
  height: 86400,
  gutter_type: 'top_bottom',
  margin: {
    header: 1800,
    footer: 1800,
    gutter: 720,
    left: 7200,
    right: 3600,
    top: 3600,
    bottom: 5400,
  },
};
const op = (extra = {}) => ({
  kind: 'page-settings',
  coordinates: 'current-transaction',
  scope: 'section',
  section: 0,
  values,
  ...extra,
});
const splice = {
  kind: 'splice',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 1,
  startUnit: 0,
  endUnit: 0,
  expectedRangeText: '',
  text: 'X',
};
const sha = 'a'.repeat(64);
function fixture({
  format = 'hwpx',
  supports = true,
  rows,
  completion,
  sectionCount = 1,
  capabilityFormat = format,
} = {}) {
  const calls = [];
  let serial = 0;
  const sdk = {
    supportsPageSettingsWrite() {
      calls.push('supports');
      return supports;
    },
    enableHistoryV2() {
      calls.push('history');
    },
    validateTextSourcePolicy() {
      calls.push('policy');
    },
    text() {
      return '';
    },
    anchorText() {
      return '';
    },
    splice() {
      calls.push('splice');
      serial++;
    },
    pageSettingsCapabilities() {
      calls.push('query');
      return {
        schemaVersion: 1,
        format: capabilityFormat,
        binding: { session: 'opaque', revision: serial, serial: String(serial) },
        sections: rows ?? [
          {
            section: 0,
            reason: null,
            target:
              format === 'hwp5'
                ? {
                    section: 0,
                    expected: {
                      source_node: serial,
                      width: 59528,
                      height: 84188,
                      left: 8504,
                      right: 8504,
                      top: 5668,
                      bottom: 4252,
                      header: 4252,
                      footer: 4252,
                      gutter: 0,
                      flags: 0,
                      orientation: 'narrowly',
                      binding: 'one_side',
                      extra_bytes: 0,
                    },
                  }
                : {
                    section: 0,
                    owner_node: 0,
                    page_node: serial,
                    margin_node: null,
                    expected: {
                      section_ordinal: 0,
                      element_index: serial,
                      orientation: 'widely',
                      width: 59528,
                      height: 84188,
                      gutter_type: 'left_only',
                      margin: null,
                      duplicate_margins: 0,
                      hide_first_empty_line: null,
                      visibility_count: 0,
                    },
                  },
          },
        ],
      };
    },
    writePageSettings(request) {
      calls.push(['write', request]);
      assert.equal(request.binding.serial, String(serial));
      serial++;
      return completion ?? { nativeCode: 1, application: 'applied', changed: true };
    },
  };
  const document = {
    format,
    sourceSha256: sha,
    sectionCount,
    sdk,
    save() {
      calls.push('save');
      return format === 'hwp5'
        ? { bytes: new Uint8Array([2]), layoutRequiresReflow: true }
        : new Uint8Array([2]);
    },
    close() {
      calls.push('close');
    },
  };
  return {
    calls,
    sdk,
    document,
    apply: (operations) =>
      applyDocumentOperations(
        { bytes: new Uint8Array([1]), wasm: new Uint8Array([1]), expectedSha256: sha, operations },
        { openDocument: async () => document },
      ),
  };
}
test('strict complete values, explicit scope/section, owned input and SDK geometry checks precede opening', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(validateDocumentOperations([op()]))), [op()]);
  const cases = [
    op({ section: undefined }),
    op({ scope: 'document' }),
    op({ scope: 'all' }),
    op({ binding: {} }),
    op({ values: { ...values, width: -0 } }),
    op({ values: { ...values, width: 1 } }),
    op({ values: { ...values, margin: { ...values.margin, extra: 0 } } }),
    op({ values: { ...values, orientation: 'portrait' } }),
  ];
  for (const invalid of cases) assert.throws(() => validateDocumentOperations([splice, invalid]));
  const document = { ...op(), scope: 'document' };
  delete document.section;
  assert.equal(validateDocumentOperations([document])[0].scope, 'document');
  const accessor = { ...values };
  Object.defineProperty(accessor, 'width', {
    get() {
      throw Error('getter invoked');
    },
  });
  assert.throws(
    () => validateDocumentOperations([op({ values: accessor })]),
    /InvalidOperationData/,
  );
});
test('old ABI in each format rejects entire batch before history or preceding mutation', async () => {
  for (const options of [{ supports: false }, { format: 'hwp5', supports: false }]) {
    const f = fixture(options);
    await assert.rejects(f.apply([splice, op()]), /PageSettingsWriteUnavailable/);
    assert(!f.calls.includes('history'));
    assert(!f.calls.includes('splice'));
    assert(!f.calls.includes('save'));
    assert.equal(f.calls.at(-1), 'close');
  }
});
test('all page owners admitted before preceding writes; no skipped unsupported document section', async () => {
  const f = fixture({ rows: [{ section: 0, target: null, reason: 'MissingPageSettings' }] });
  await assert.rejects(f.apply([splice, op()]), /MissingPageSettings/);
  assert.deepEqual(f.calls, ['supports', 'history', 'query', 'close']);
});
test('each write obtains current binding after preceding Native mutation without serialized authority', async () => {
  for (const format of ['hwpx', 'hwp5']) {
    const f = fixture({ format });
    const result = await f.apply([splice, op(), op()]);
    assert.equal(result.layoutRequiresReflow, true);
    const writes = f.calls.filter(Array.isArray);
    assert.deepEqual(
      writes.map((x) => x[1].binding.serial),
      ['1', '2'],
    );
    assert.deepEqual(JSON.parse(JSON.stringify(writes[0][1].values)), values);
    assert.equal(f.calls.filter((x) => x === 'history').length, 1);
  }
});
test('completion codes, unknown, cleanup and late errors never save partial output', async () => {
  for (const completion of [
    { nativeCode: 0, application: 'unapplied', changed: false, error: 'Rejected' },
    { nativeCode: 3, application: 'unknown', changed: null },
    { nativeCode: 1, application: 'applied', changed: true, refreshRequired: true },
    { nativeCode: 1, application: 'applied', changed: true, cleanupError: 'free' },
    { nativeCode: 2, application: 'applied', changed: false },
    { nativeCode: 1, application: 'applied', changed: true, error: 'LateDiagnostic' },
    { nativeCode: 1, application: 'applied', changed: true, cleanupError: '' },
    { nativeCode: 1, application: 'applied', changed: true, refreshRequired: false },
    {},
  ]) {
    const f = fixture({ completion });
    await assert.rejects(f.apply([splice, op()]));
    assert(!f.calls.includes('save'));
    assert.equal(f.calls.at(-1), 'close');
  }
  const f = fixture({ completion: { nativeCode: 2, application: 'unapplied', changed: false } });
  await f.apply([op()]);
  assert(f.calls.includes('save'));
});

test('HWP5 all-section admission validates the entire exact capability before any preceding writes', async () => {
  const valid = {
    section: 0,
    reason: null,
    target: {
      section: 0,
      expected: {
        source_node: 1,
        width: 59528,
        height: 84188,
        left: 8504,
        right: 8504,
        top: 5668,
        bottom: 4252,
        header: 4252,
        footer: 4252,
        gutter: 0,
        flags: 0,
        orientation: 'narrowly',
        binding: 'one_side',
        extra_bytes: 0,
      },
    },
  };
  const f = fixture({
    format: 'hwp5',
    sectionCount: 2,
    rows: [valid, { section: 1, target: null, reason: 'UnsupportedPageBinding' }],
  });
  const page = { ...op(), scope: 'document' };
  delete page.section;
  await assert.rejects(f.apply([splice, page]), /UnsupportedPageBinding/);
  assert(!f.calls.includes('splice'));
  assert(!f.calls.includes('save'));
  assert(!f.calls.some(Array.isArray));
  assert.equal(f.calls.at(-1), 'close');
  for (const options of [
    { format: 'hwp5', capabilityFormat: 'hwpx' },
    {
      format: 'hwp5',
      rows: [
        { ...valid, target: { ...valid.target, expected: { ...valid.target.expected, flags: 1 } } },
      ],
    },
  ]) {
    const x = fixture(options);
    await assert.rejects(x.apply([splice, op()]));
    assert(!x.calls.includes('splice'));
    assert(!x.calls.includes('save'));
  }
});
test('HWP5 missing method and post-commit-looking diagnostics or close failure do not release result bytes', async () => {
  const f = fixture({ format: 'hwp5' });
  delete f.sdk.writePageSettings;
  await assert.rejects(f.apply([splice, op()]), /PageSettingsWriteUnavailable/);
  assert(!f.calls.includes('history'));
  assert(!f.calls.includes('splice'));
  const late = fixture({ format: 'hwp5' });
  let count = 0;
  const write = late.sdk.writePageSettings;
  late.sdk.writePageSettings = (r) => {
    if (++count === 2) throw Error('LatePageFailure');
    return write(r);
  };
  await assert.rejects(late.apply([op(), op()]), /LatePageFailure/);
  assert(!late.calls.includes('save'));
  assert.equal(late.calls.at(-1), 'close');
  const close = fixture({ format: 'hwp5' });
  close.document.close = () => {
    throw Error('CloseFailure');
  };
  await assert.rejects(close.apply([op()]), /DocumentOperationsCloseFailed/);
});
