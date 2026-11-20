import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentTextReadBindingApi } from '../../js/document-text-read-binding-api.mjs';
for (const format of ['hwp5', 'hwpx']) {
  function harness(patch = {}, missing = false) {
    let freed = 0,
      calls = 0;
    const prefix = `${format}_edit`,
      value = {
        schemaVersion: 1,
        scope: 'native-document-text-read-binding',
        executionAuthority: false,
        format,
        session: 's7',
        epoch: '7',
        serial: format === 'hwpx' ? '0' : '11',
        ...patch,
      };
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const wasm = {
      [`${prefix}_document_text_read_binding`]: () => {
        calls++;
        return 1;
      },
      [`${prefix}_output_ptr`]: () => 8,
      [`${prefix}_output_len`]: () => bytes.length,
      [`${prefix}_output_free`]: () => {
        freed++;
        bytes.fill(0);
      },
    };
    if (missing) delete wasm[`${prefix}_document_text_read_binding`];
    return {
      api: createDocumentTextReadBindingApi({
        wasm,
        memory: { copy: () => bytes.slice() },
        prefix,
        check: () => {},
      }),
      counts: () => ({ freed, calls }),
    };
  }
  test(`${format}: Native read serial keeps separate scope and does not synthesize a History revision`, () => {
    const h = harness(),
      v = h.api.documentTextReadBinding();
    assert.equal(v.scope, 'native-document-text-read-binding');
    assert.equal(v.executionAuthority, false);
    assert.equal(v.serial, format === 'hwpx' ? '0' : '11');
    assert(!Object.hasOwn(v, 'historyRevision'));
    assert(!Object.hasOwn(v, 'revision'));
    assert.deepEqual(h.counts(), { freed: 1, calls: 1 });
  });
  test(`${format}: malformed lifetime or counter and unavailable optional ABI refuse`, () => {
    for (const p of [
      { epoch: '0' },
      { epoch: '07' },
      { serial: '-1' },
      { serial: '18446744073709551616' },
      { executionAuthority: true },
      { historyRevision: 0 },
    ]) {
      const h = harness(p);
      assert.throws(() => h.api.documentTextReadBinding());
      assert.equal(h.counts().freed, 1);
    }
    const h = harness({}, true);
    assert.equal(h.api.supportsDocumentTextReadBinding(), false);
    assert.throws(() => h.api.documentTextReadBinding(), /Unavailable/);
    assert.deepEqual(h.counts(), { freed: 0, calls: 0 });
  });
}
