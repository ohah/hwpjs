import test from 'node:test';
import assert from 'node:assert/strict';
import { createIndependentTextApi } from '../../js/independent-text-api.mjs';
import { createAtomicFormattingApi } from '../../js/atomic-formatting-api.mjs';
const limits = {
  requestBytes: 16 * 1024 * 1024,
  requestDepth: 16,
  requestStructure: 262144,
  replyBytes: 2 * 1024 * 1024,
  groups: 4096,
  edits: 4096,
  textUnits: 4 * 1024 * 1024,
  insertedBytes: 4 * 1024 * 1024,
  sections: 4096,
  snapshotParagraphs: 20000,
  targets: 1024,
  ranges: 4096,
  commands: 4096,
  fontNameBytes: 4096,
};
const binding = { session: 's1', revision: 7 };
const query = () => ({
  schemaVersion: 1,
  binding: { ...binding },
  selectors: [{ section: 0, paragraph: 2 }],
});
const apply = () => ({
  schemaVersion: 1,
  binding: { ...binding },
  scope: 'selection',
  groups: [
    {
      ref: 't1-p1:0:2:r7:k0:b0',
      beforeUnits: 4,
      edits: [{ startUnit: 0, endUnit: 2, text: '', expectedOriginal: '😀' }],
    },
  ],
});
const reply = () => ({
  schemaVersion: 1,
  binding: { ...binding },
  coverage: {
    sections: [{ section: 0, paragraphCount: 3 }],
    totalParagraphs: 3,
    createdCellParagraphs: 0,
  },
  targets: [{ ref: 't1-p1:0:2:r7:k0:b0', section: 0, paragraph: 2, beforeUnits: 4 }],
});
function harness(options = {}) {
  const prefix = options.prefix ?? 'hwp5_edit';
  const calls = { capabilities: 0, query: 0, apply: 0, outputFree: 0, copy: 0, input: [] };
  let output,
    closed = false;
  const caps = {
    schemaVersion: 1,
    atomic: true,
    format: prefix.replace(/_edit$/, ''),
    coordinateSpace: 'native-source-utf16',
    requiresHistoryProtocol: 2,
    fields: { bold: { readable: true } },
    binding: { ...binding },
    limits: { ...limits },
  };
  const set = (value) =>
    (output =
      value instanceof Uint8Array ? value : new TextEncoder().encode(JSON.stringify(value)));
  const wasm = {
    [`${prefix}_text_transaction_capabilities`]() {
      calls.capabilities++;
      set(options.caps ?? caps);
      return 1;
    },
    [`${prefix}_query_text_transaction`]() {
      calls.query++;
      options.onQuery?.();
      set(options.reply ?? reply());
      return 1;
    },
    [`${prefix}_apply_text_transaction`]() {
      calls.apply++;
      if (options.nativeThrows) throw Error('NativeTrap');
      return options.code ?? 1;
    },
    [`${prefix}_output_ptr`]: () => 1,
    [`${prefix}_output_len`]: () =>
      calls.query && options.outputLength !== undefined ? options.outputLength : output.length,
    [`${prefix}_output_free`]() {
      calls.outputFree++;
    },
  };
  wasm[`${prefix}_formatting_capabilities`] = wasm[`${prefix}_text_transaction_capabilities`];
  wasm[`${prefix}_query_formatting`] = wasm[`${prefix}_query_text_transaction`];
  wasm[`${prefix}_apply_formatting_patch`] = wasm[`${prefix}_apply_text_transaction`];
  wasm[`${prefix}_history_revision`] = () => 7;
  wasm[`${prefix}_history_stats`] = () => 1;
  const memory = {
    copy(ptr, length) {
      calls.copy++;
      return output.slice(0, length);
    },
    error() {
      if (options.errorThrows) throw Error('DiagnosticReadFailed');
      return Error('NativeDenied');
    },
    withBytes(bytes, run) {
      if (options.beforeThrows) throw Error('InputAllocationFailed');
      calls.input.push(JSON.parse(new TextDecoder().decode(bytes)));
      const value = run(11, bytes.length);
      if (options.afterThrows) throw Error('InputCleanupFailed');
      return value;
    },
  };
  const api = (options.factory ?? createIndependentTextApi)({
    wasm,
    memory,
    prefix,
    check() {
      if (closed) throw Error('EditorClosed');
    },
  });
  return {
    api,
    wasm,
    calls,
    caps,
    close() {
      closed = true;
    },
  };
}

test('independent text ABI is optional and never invokes a fallback setter', () => {
  const h = harness();
  assert.equal(h.api.supportsIndependentTextAbi(), true);
  delete h.wasm.hwp5_edit_apply_text_transaction;
  assert.equal(h.api.supportsIndependentTextAbi(), false);
  assert.throws(() => h.api.applyIndependentText(apply()), /IndependentTextTransactionUnavailable/);
  assert.equal(h.calls.capabilities, 0);
  assert.equal(h.calls.apply, 0);
});

test('independent text query binds its owned input despite caller mutation and frees Native output', () => {
  for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
    const request = query();
    const h = harness({
      prefix,
      onQuery() {
        request.binding.revision = 99;
        request.selectors[0].paragraph = 999;
      },
    });
    const value = h.api.queryIndependentText(request);
    assert.equal(value.targets[0].paragraph, 2);
    assert.equal(h.calls.input[0].binding.revision, 7);
    assert.equal(h.calls.outputFree, 2);
    assert.equal(h.calls.query, 1);
  }
});

test('independent text query rejects mismatched binding, coverage, targets and malformed output', () => {
  const bad = [
    (value) => value.binding.revision++,
    (value) => (value.coverage.createdCellParagraphs = 4),
    (value) => (value.coverage.totalParagraphs = 2),
    (value) => (value.coverage.sections[0].section = 1),
    (value) => value.targets[0].paragraph++,
    (value) => (value.targets[0].beforeUnits = -1),
    (value) => (value.targets[0].ref = '\ud800'),
  ];
  for (const change of bad) {
    const value = reply();
    change(value);
    const h = harness({ reply: value });
    assert.throws(() => h.api.queryIndependentText(query()), /MalformedTextTransactionQuery/);
    assert.equal(h.calls.outputFree, 2);
  }
  const invalidUtf8 = harness({ reply: Uint8Array.of(255) });
  assert.throws(
    () => invalidUtf8.api.queryIndependentText(query()),
    /encoded data|encoding|UTF-8/i,
  );
  assert.equal(invalidUtf8.calls.outputFree, 2);
  const large = harness({ outputLength: limits.replyBytes + 1 });
  assert.throws(() => large.api.queryIndependentText(query()), /LimitExceeded/);
  assert.equal(large.calls.copy, 1, 'oversize output never copied');
  assert.equal(large.calls.outputFree, 2);
});

test('independent text apply classifies one Native primitive result without replaying a batch', () => {
  for (const [code, application, changed] of [
    [0, 'unapplied', false],
    [1, 'applied', true],
    [2, 'unapplied', false],
    [3, 'unknown', null],
  ]) {
    const h = harness({ code });
    const result = h.api.applyIndependentText(apply());
    assert.equal(result.nativeCode, code);
    assert.equal(result.application, application);
    assert.equal(result.changed, changed);
    assert.equal(h.calls.apply, 1);
    assert.equal(h.calls.input[0].groups[0].edits[0].text, '');
    if (code === 0 || code === 3) assert.equal(result.error, 'NativeDenied');
  }
  const trapped = harness({ nativeThrows: true });
  assert.deepEqual(trapped.api.applyIndependentText(apply()), {
    application: 'unknown',
    changed: null,
    error: 'NativeTrap',
  });
  assert.equal(trapped.calls.apply, 1);
  const invalid = harness({ code: 44 });
  assert.equal(invalid.api.applyIndependentText(apply()).application, 'unknown');
  assert.equal(invalid.calls.apply, 1);
});

test('independent text keeps known completion after diagnostic or cleanup failure and never retries', () => {
  for (const code of [0, 1, 2, 3]) {
    const h = harness({ code, afterThrows: true });
    const result = h.api.applyIndependentText(apply());
    assert.equal(result.nativeCode, code);
    assert.equal(result.application, code === 1 ? 'applied' : code === 3 ? 'unknown' : 'unapplied');
    assert.equal(result.cleanupError, 'InputCleanupFailed');
    assert.equal(result.refreshRequired, true);
    assert.equal(h.calls.apply, 1);
  }
  const diagnostics = harness({ code: 0, errorThrows: true });
  const result = diagnostics.api.applyIndependentText(apply());
  assert.equal(result.application, 'unapplied');
  assert.equal(result.changed, false);
  assert.equal(result.error, 'DiagnosticReadFailed');
});

test('independent text rejects malformed transport before apply and preserves supplied stale binding', () => {
  const h = harness();
  const cycle = {};
  cycle.value = cycle;
  assert.throws(() => h.api.applyIndependentText(cycle), /InvalidTextTransactionDTO/);
  assert.equal(h.calls.apply, 0);
  const allocation = harness({ beforeThrows: true });
  assert.throws(() => allocation.api.applyIndependentText(apply()), /InputAllocationFailed/);
  assert.equal(allocation.calls.apply, 0);
  const request = apply();
  request.binding.revision = 6;
  h.api.applyIndependentText(request);
  assert.equal(
    h.calls.input[0].binding.revision,
    6,
    'capability query must not refresh an old write binding',
  );
  h.close();
  assert.throws(() => h.api.supportsIndependentTextAbi(), /EditorClosed/);
});

test('atomic formatting and independent text share primitive completion across diagnostic failures', () => {
  for (const [factory, method] of [
    [createAtomicFormattingApi, 'applyFormattingPatch'],
    [createIndependentTextApi, 'applyIndependentText'],
  ]) {
    for (const code of [0, 3]) {
      const h = harness({ factory, code, errorThrows: true });
      const value = h.api[method](apply());
      assert.equal(value.nativeCode, code);
      assert.equal(value.application, code === 0 ? 'unapplied' : 'unknown');
      assert.equal(value.error, 'DiagnosticReadFailed');
      assert.equal(h.calls.apply, 1);
    }
    const h = harness({ factory, afterThrows: true });
    assert.equal(h.api[method](apply()).application, 'applied');
    assert.equal(h.calls.apply, 1);
  }
});

test('query decoder rejects selector/target agreement outside the Native coverage axis', () => {
  for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
    for (const target of [
      { section: 1, paragraph: 0 },
      { section: 0, paragraph: 3 + (prefix === 'hwpx_edit' ? 1 : 0) },
      ...(prefix === 'hwpx_edit' ? [{ section: 0, paragraph: 0 }] : []),
    ]) {
      const answer = reply();
      Object.assign(answer.targets[0], target);
      const h = harness({ prefix, reply: answer });
      const request = query();
      Object.assign(request.selectors[0], target);
      assert.throws(() => h.api.queryIndependentText(request), /MalformedTextTransactionQuery/);
    }
  }
});

test('multi-section query decoder uses HWPX global 1-based and HWP5 section-local 0-based axes', () => {
  for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
    const hx = prefix === 'hwpx_edit',
      request = query(),
      answer = reply();
    request.selectors = [{ section: 1, paragraph: hx ? 3 : 0 }];
    answer.coverage = {
      sections: [
        { section: 0, paragraphCount: 2 },
        { section: 1, paragraphCount: 1 },
      ],
      totalParagraphs: 3,
      createdCellParagraphs: 0,
    };
    answer.targets = [{ ref: 'current-ref', ...request.selectors[0], beforeUnits: 2 }];
    assert.deepEqual(harness({ prefix, reply: answer }).api.queryIndependentText(request), answer);
    request.selectors[0].paragraph = hx ? 1 : 1;
    answer.targets[0].paragraph = request.selectors[0].paragraph;
    assert.throws(
      () => harness({ prefix, reply: answer }).api.queryIndependentText(request),
      /MalformedTextTransactionQuery/,
    );
  }
});
