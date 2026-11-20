import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentTextApi } from '../../js/document-text-api.mjs';

for (const format of ['hwp5', 'hwpx']) {
  const request = () => ({
    schemaVersion: 1,
    scope: 'native-document-text-selection',
    binding: { session: 'current', revision: 4 },
    ref: 'd1:opaque-read-reference',
    startUnit: 1,
    endUnit: 3,
    expectedOriginal: '😀',
  });
  const response = () => ({
    schemaVersion: 1,
    scope: 'native-document-text-selection',
    coordinateSpace: 'native-current-text-observation',
    executionAuthority: false,
    format,
    binding: { session: 'current', revision: 4 },
    ref: 'd1:opaque-read-reference',
    expectedOriginal: '😀',
    beforeText: '앞😀뒤',
    target: { kind: 'paragraph', section: 0, paragraph: 91, startUnit: 1, endUnit: 3 },
  });
  function harness(options = {}) {
    const prefix = `${format}_edit`;
    const counts = {
      checks: 0,
      allocations: 0,
      inputsFreed: 0,
      queries: 0,
      outputsFreed: 0,
      copies: 0,
    };
    let encodedRequest;
    const bytes =
      options.bytes ?? new TextEncoder().encode(JSON.stringify(options.response ?? response()));
    const wasm = {
      [`${prefix}_document_text_selection`]: () => {
        counts.queries++;
        return options.code ?? 1;
      },
      [`${prefix}_output_ptr`]: () => 16,
      [`${prefix}_output_len`]: () => options.length ?? bytes.length,
      [`${prefix}_output_free`]: () => {
        counts.outputsFreed++;
        bytes.fill(0);
      },
    };
    if (options.missing) delete wasm[`${prefix}_document_text_selection`];
    const api = createDocumentTextApi({
      wasm,
      prefix,
      check() {
        counts.checks++;
        if (options.closed) throw Error('EditorClosed');
      },
      memory: {
        withBytes(input, invoke) {
          counts.allocations++;
          encodedRequest = JSON.parse(new TextDecoder().decode(input));
          try {
            return invoke(32, input.length);
          } finally {
            counts.inputsFreed++;
          }
        },
        copy() {
          counts.copies++;
          return bytes.slice();
        },
        error: () => Error('StaleDocumentTextReference'),
      },
    });
    return { api, counts, input: () => encodedRequest };
  }
  test(`${format}: selection read owns output and preserves Native paragraph address rather than logical ordinal`, () => {
    const h = harness();
    assert.equal(h.api.supportsDocumentTextSelection(), true);
    const result = h.api.documentTextSelection(request());
    assert.equal(result.target.paragraph, 91);
    assert.equal(result.beforeText, '앞😀뒤');
    assert.equal(result.executionAuthority, false);
    assert.deepEqual(h.input(), request());
    assert.deepEqual(h.counts, {
      checks: 2,
      allocations: 1,
      inputsFreed: 1,
      queries: 1,
      outputsFreed: 1,
      copies: 1,
    });
  });
  test(`${format}: null revision permits read observation without conferring edit authority`, () => {
    const input = request(),
      output = response();
    input.binding.revision = output.binding.revision = null;
    const h = harness({ response: output });
    assert.equal(h.api.documentTextSelection(input).binding.revision, null);
  });
  test(`${format}: mapped paragraph offset can differ from whole-document observed offset`, () => {
    const input = request();
    input.startUnit = 2;
    input.endUnit = 4;
    const h = harness();
    assert.equal(h.api.documentTextSelection(input).target.startUnit, 1);
  });
  test(`${format}: created cell identity remains a lossless u64 string`, () => {
    const output = response();
    output.target = {
      kind: 'created-cell',
      section: 2,
      identity: '18446744073709551615',
      row: 0,
      column: 1,
      startUnit: 1,
      endUnit: 3,
    };
    const h = harness({ response: output });
    assert.equal(h.api.documentTextSelection(request()).target.identity, '18446744073709551615');
  });
  test(`${format}: unavailable ABI and retired editor never allocate or invoke a fallback`, () => {
    for (const options of [{ missing: true }, { closed: true }]) {
      const h = harness(options);
      assert.throws(() => h.api.documentTextSelection(request()), /Unavailable|EditorClosed/);
      assert.equal(h.counts.allocations, 0);
      assert.equal(h.counts.queries, 0);
      assert.equal(h.counts.outputsFreed, 0);
    }
  });
  test(`${format}: malformed request, accessor and injected authority refuse before Native allocation`, () => {
    const accessor = request();
    let getterCalls = 0;
    Object.defineProperty(accessor, 'ref', {
      enumerable: true,
      get() {
        getterCalls++;
        return 'bad';
      },
    });
    for (const input of [
      accessor,
      { ...request(), target: {} },
      { ...request(), executionAuthority: true },
      { ...request(), startUnit: -1 },
      { ...request(), endUnit: 2 },
      { ...request(), ref: '가'.repeat(86) },
      { ...request(), expectedOriginal: '\ud800x' },
      { ...request(), binding: { session: 'current', revision: 0xffffffff } },
    ]) {
      const h = harness();
      assert.throws(() => h.api.documentTextSelection(input));
      assert.equal(h.counts.allocations, 0);
      assert.equal(h.counts.queries, 0);
    }
    assert.equal(getterCalls, 0);
  });
  test(`${format}: stale binding, wrong kind, injected authority and invalid scalar target are rejected`, () => {
    const mutations = [
      (r) => {
        r.binding.session = 'old';
      },
      (r) => {
        r.binding.revision++;
      },
      (r) => {
        r.ref = 'other';
      },
      (r) => {
        r.executionAuthority = true;
      },
      (r) => {
        r.coordinateSpace = 'display';
      },
      (r) => {
        r.format = 'other';
      },
      (r) => {
        r.beforeText = '\ud800😀뒤';
      },
      (r) => {
        r.beforeText = '앞가나뒤';
      },
      (r) => {
        r.target.startUnit = 2;
      },
      (r) => {
        r.target.endUnit = 0xffffffff;
      },
      (r) => {
        r.target.paragraph = -1;
      },
      (r) => {
        r.target.owner = 'invented';
      },
      (r) => {
        r.target.kind = 'cell';
      },
      (r) => {
        r.target = null;
      },
      ...['18446744073709551616', '0001', 9007199254740992, '1e5'].map((identity) => (r) => {
        r.target = {
          kind: 'created-cell',
          section: 0,
          identity,
          row: 0,
          column: 0,
          startUnit: 1,
          endUnit: 3,
        };
      }),
    ];
    for (const mutate of mutations) {
      const output = response();
      mutate(output);
      const h = harness({ response: output });
      assert.throws(() => h.api.documentTextSelection(request()), /MalformedDocumentTextSelection/);
      assert.equal(h.counts.outputsFreed, 1);
      assert.equal(h.counts.inputsFreed, 1);
    }
  });
  test(`${format}: Native refusal, UTF-8/JSON and output budget failures release both allocations once`, () => {
    for (const options of [
      { code: 0 },
      { bytes: new Uint8Array([255]) },
      { bytes: new TextEncoder().encode('{') },
      { length: 16 * 1024 * 1024 + 1 },
    ]) {
      const h = harness(options);
      assert.throws(() => h.api.documentTextSelection(request()));
      assert.equal(h.counts.outputsFreed, 1);
      assert.equal(h.counts.inputsFreed, 1);
      assert.equal(h.counts.queries, 1);
    }
  });
}
