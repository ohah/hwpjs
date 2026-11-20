import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentTextAnchorApi } from '../../js/document-text-anchor-api.mjs';
for (const format of ['hwp5', 'hwpx']) {
  const prefix = `${format}_edit`;
  const request = () => ({
    schemaVersion: 1,
    scope: 'native-document-text-anchor',
    binding: { session: 's1', revision: 7 },
    target: { kind: 'paragraph', section: 3, paragraph: 41, unit: 3, beforeText: 'a😀z' },
  });
  const response = () => ({
    schemaVersion: 1,
    scope: 'native-document-text-anchor',
    coordinateSpace: 'native-read-inventory',
    executionAuthority: false,
    format,
    binding: { session: 's1', revision: 7 },
    ref: 'native-read-owner-9001',
    startUnit: 3,
    endUnit: 3,
  });
  function harness(options = {}) {
    let calls = 0,
      freed = 0,
      allocated = 0,
      checks = 0,
      captured;
    const bytes =
      options.bytes ?? new TextEncoder().encode(JSON.stringify(options.value ?? response()));
    const wasm = {
      [`${prefix}_document_text_anchor`]: () => {
        calls++;
        return options.code ?? 1;
      },
      [`${prefix}_output_ptr`]: () => 8,
      [`${prefix}_output_len`]: () => options.length ?? bytes.length,
      [`${prefix}_output_free`]: () => {
        freed++;
        bytes.fill(0);
      },
    };
    if (options.missing) delete wasm[`${prefix}_document_text_anchor`];
    const memory = {
      withBytes: (input, fn) => {
        allocated++;
        captured = JSON.parse(new TextDecoder().decode(input));
        return fn(1, input.length);
      },
      copy: () => bytes.slice(),
      error: () => Error('NativeReadRejected'),
    };
    const api = createDocumentTextAnchorApi({
      wasm,
      memory,
      prefix,
      check: () => {
        checks++;
        if (options.staleAfter && calls) throw Error('EditorClosed');
      },
    });
    return { api, counts: () => ({ calls, freed, allocated, checks }), captured: () => captured };
  }
  test(`${format}: inverse read keeps actual display owner separate from issued Native ref`, () => {
    const h = harness(),
      result = h.api.documentTextAnchor(request());
    assert.equal(h.captured().target.paragraph, 41);
    assert.equal(result.ref, 'native-read-owner-9001');
    assert.equal(result.executionAuthority, false);
    assert.equal(result.startUnit, 3);
    assert.deepEqual(h.counts(), { calls: 1, freed: 1, allocated: 1, checks: 2 });
  });
  test(`${format}: typed pending owner and empty readonly caret never acquire paragraph zero`, () => {
    const r = request();
    r.binding.revision = null;
    r.target = {
      kind: 'created-cell',
      section: 3,
      identity: '18446744073709551615',
      row: 17,
      column: 31,
      unit: 0,
      beforeText: '',
    };
    const value = {
      ...response(),
      binding: { session: 's1', revision: null },
      startUnit: 0,
      endUnit: 0,
    };
    const h = harness({ value });
    assert.equal(h.api.documentTextAnchor(r).startUnit, 0);
    assert(!Object.hasOwn(h.captured().target, 'paragraph'));
    assert.equal(h.captured().target.identity, '18446744073709551615');
    assert.equal(h.counts().freed, 1);
  });
  test(`${format}: invalid mixed owners split scalars huge offsets and accessors refuse before Native`, () => {
    const invalid = [
      (r) => (r.target.unit = 2),
      (r) => (r.target.unit = 0xffffffff),
      (r) => (r.target.identity = '1'),
      (r) => (r.target.beforeText = '\ud800'),
      (r) => (r.scope = 'native-document-text-selection'),
      (r) =>
        Object.defineProperty(r.target, 'kind', {
          get() {
            throw Error('GetterMustNotRun');
          },
          enumerable: true,
        }),
    ];
    for (const mutate of invalid) {
      const r = request();
      mutate(r);
      const h = harness();
      assert.throws(() => h.api.documentTextAnchor(r));
      assert.equal(h.counts().calls, 0);
      assert.equal(h.counts().allocated, 0);
    }
  });
  test(`${format}: malformed or stale read output is freed once and never grants write authority`, () => {
    const vectors = [
      { code: 0 },
      { bytes: new Uint8Array([255]) },
      { length: 16 * 1024 * 1024 + 1 },
      { value: { ...response(), executionAuthority: true } },
      { value: { ...response(), binding: { session: 'foreign', revision: 7 } } },
      { value: { ...response(), endUnit: 4 } },
      { value: { ...response(), ref: 'x'.repeat(257) } },
      { staleAfter: true },
    ];
    for (const vector of vectors) {
      const h = harness(vector);
      assert.throws(() => h.api.documentTextAnchor(request()));
      assert.equal(h.counts().freed, 1);
      assert.equal(h.counts().calls, 1);
    }
  });
  test(`${format}: old ABI reports unavailable without query or repeated setters`, () => {
    const h = harness({ missing: true });
    assert.equal(h.api.supportsDocumentTextAnchor(), false);
    assert.throws(() => h.api.documentTextAnchor(request()), /DocumentTextAnchorUnavailable/);
    assert.equal(h.counts().calls, 0);
    assert.equal(h.counts().allocated, 0);
  });
}
