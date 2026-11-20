import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocumentTextApi } from '../../js/document-text-api.mjs';

const request = () => ({
  schemaVersion: 1,
  scope: 'native-document-text',
  binding: { session: 'session', revision: 4 },
  query: '가😀',
  replacement: '둘',
});
for (const format of ['hwp5', 'hwpx']) {
  function harness(options = {}) {
    const prefix = `${format}_edit`;
    let calls = 0,
      allocations = 0,
      wire;
    const wasm = Object.fromEntries(
      ['document_text_snapshot', 'output_ptr', 'output_len', 'output_free'].map((name) => [
        `${prefix}_${name}`,
        () => 1,
      ]),
    );
    if (!options.missing)
      wasm[`${prefix}_replace_document_text`] = () => {
        calls++;
        if (options.invokeThrow) throw Error('Trap');
        return options.code ?? 1;
      };
    const api = createDocumentTextApi({
      wasm,
      prefix,
      check() {
        if (options.closed) throw Error('EditorClosed');
      },
      memory: {
        withBytes(bytes, fn) {
          allocations++;
          wire = JSON.parse(new TextDecoder().decode(bytes));
          const outcome = fn(8, bytes.length);
          if (options.cleanupThrow) throw Error('Cleanup');
          return outcome;
        },
        error() {
          return Error('NativeRejected');
        },
      },
    });
    return { api, counts: () => ({ calls, allocations, wire }) };
  }
  test(`${format}: one optional ABI invocation carries only literal intent, never a target subset`, () => {
    const h = harness();
    assert.equal(h.api.supportsDocumentReplaceAll(), true);
    assert.equal(h.api.replaceDocumentText(request()).application, 'applied');
    assert.deepEqual(h.counts(), { calls: 1, allocations: 1, wire: request() });
  });
  test(`${format}: missing ABI or retired session performs no allocation or setter fallback`, () => {
    for (const options of [{ missing: true }, { closed: true }]) {
      const h = harness(options);
      assert.throws(() => h.api.replaceDocumentText(request()), /Unavailable|EditorClosed/);
      assert.equal(h.counts().calls, 0);
      assert.equal(h.counts().allocations, 0);
    }
  });
  test(`${format}: malformed, accessor, scope and injected target groups reject before Native`, () => {
    let reads = 0;
    for (const value of [
      { ...request(), groups: [] },
      { ...request(), query: '' },
      { ...request(), scope: 'selection' },
      { ...request(), replacement: '\ud800' },
      { ...request(), binding: { session: 'session', revision: null } },
      {
        ...request(),
        get query() {
          reads++;
          return 'bad';
        },
      },
    ]) {
      const h = harness();
      assert.throws(() => h.api.replaceDocumentText(value));
      assert.equal(h.counts().calls, 0);
      assert.equal(h.counts().allocations, 0);
    }
    assert.equal(reads, 0);
  });
  test(`${format}: primitive rejection, no-op and uncertain outcomes are distinguished without retry`, () => {
    for (const [code, application] of [
      [0, 'unapplied'],
      [2, 'unapplied'],
      [3, 'unknown'],
      [99, 'unknown'],
    ]) {
      const h = harness({ code });
      assert.equal(h.api.replaceDocumentText(request()).application, application);
      assert.equal(h.counts().calls, 1);
    }
  });
  test(`${format}: post-commit cleanup failure retains applied receipt; trap stays uncertain`, () => {
    const h = harness({ cleanupThrow: true });
    const outcome = h.api.replaceDocumentText(request());
    assert.equal(outcome.application, 'applied');
    assert.equal(outcome.cleanupError, 'Cleanup');
    assert.equal(h.counts().calls, 1);
    const trap = harness({ invokeThrow: true });
    assert.equal(trap.api.replaceDocumentText(request()).application, 'unknown');
    assert.equal(trap.counts().calls, 1);
  });
}
