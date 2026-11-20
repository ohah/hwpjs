import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentTextApi } from '../../js/document-text-api.mjs';

for (const format of ['hwp5', 'hwpx']) {
  const prefix = `${format}_edit`;
  const value = () => ({
    schemaVersion: 1,
    scope: 'native-document-text',
    complete: true,
    format,
    binding: { session: 'read-session', revision: 7 },
    coverage: { totalParagraphs: 1, sections: [{ section: 0, paragraphCount: 1 }] },
    rows: [{ ordinal: 0, section: 0, paragraph: 0, ref: 'read-source', text: '읽기 😀' }],
  });
  function harness(options = {}) {
    let freed = 0,
      queries = 0,
      copies = 0,
      checks = 0;
    const bytes =
      options.bytes ?? new TextEncoder().encode(JSON.stringify(options.value ?? value()));
    const wasm = {
      [`${prefix}_document_text_snapshot`]: () => (++queries, options.code ?? 1),
      [`${prefix}_output_ptr`]: () => 8,
      [`${prefix}_output_len`]: () => options.length ?? bytes.length,
      [`${prefix}_output_free`]: () => {
        freed++;
        bytes.fill(0);
      },
    };
    if (options.missing) delete wasm[`${prefix}_document_text_snapshot`];
    const api = createDocumentTextApi({
      wasm,
      prefix,
      check: () => {
        checks++;
        if (options.closed) throw Error('EditorClosed');
      },
      memory: { copy: () => (++copies, bytes.slice()), error: () => Error('NativeReadRejected') },
    });
    return { api, counts: () => ({ freed, queries, copies, checks }) };
  }
  test(`${format}: optional complete read copies output and frees exactly once without mutation`, () => {
    const h = harness();
    assert.equal(h.api.supportsDocumentTextSnapshot(), true);
    const result = h.api.documentTextSnapshot();
    assert.equal(result.rows[0].text, '읽기 😀');
    assert.deepEqual(h.counts(), { freed: 1, queries: 1, copies: 1, checks: 2 });
    assert.equal(result.complete, true);
  });
  test(`${format}: absent ABI never falls back to partial content or repeated setters`, () => {
    const h = harness({ missing: true });
    assert.equal(h.api.supportsDocumentTextSnapshot(), false);
    assert.throws(() => h.api.documentTextSnapshot(), /DocumentTextSnapshotUnavailable/);
    assert.deepEqual(h.counts(), { freed: 0, queries: 0, copies: 0, checks: 2 });
  });
  test(`${format}: Native rejection, invalid UTF-8/JSON/schema and output limit all free owned output`, () => {
    for (const options of [
      { code: 0 },
      { bytes: new Uint8Array([0xff]) },
      { bytes: new TextEncoder().encode('{') },
      { value: { ...value(), complete: false } },
      { value: { ...value(), format: 'other' } },
      { length: 16 * 1024 * 1024 + 1 },
    ]) {
      const h = harness(options);
      assert.throws(() => h.api.documentTextSnapshot());
      assert.equal(h.counts().freed, 1);
      assert.equal(h.counts().queries, 1);
    }
  });
  test(`${format}: retired editor refuses before any Native call/output cleanup`, () => {
    const h = harness({ closed: true });
    assert.throws(() => h.api.documentTextSnapshot(), /EditorClosed/);
    assert.deepEqual(h.counts(), { freed: 0, queries: 0, copies: 0, checks: 1 });
  });
}
