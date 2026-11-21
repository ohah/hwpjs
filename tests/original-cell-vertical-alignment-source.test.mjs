import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOriginalCellVerticalAlignmentApi,
  checkedOriginalCellSelector,
  checkedOriginalCellObservation,
} from '../js/original-cell-vertical-alignment.mjs';
const selector = { section: 0, paragraph: 7, tableNode: 2, listNode: 3 };
function setup(format = 'hwp5', options = {}) {
  const prefix = `${format}_edit`,
    calls = [];
  let bytes = new Uint8Array(),
    input,
    frees = 0;
  const native = {
    schemaVersion: 1,
    format,
    ...selector,
    paragraph: selector.paragraph + (format === 'hwpx' ? 1 : 0),
    lease: '18446744073709551615',
    historyRevision: 4,
    value: 'TOP',
    editable: true,
    ...options.observation,
  };
  const wasm = {
    [`${prefix}_original_cell_vertical_alignment_version`]: () => options.version ?? 1,
    [`${prefix}_original_cell_vertical_alignment`]: (s, p) => {
      calls.push(['query', s, p]);
      bytes = new TextEncoder().encode(JSON.stringify(native));
      return 1;
    },
    [`${prefix}_set_original_cell_vertical_alignment`]: () => {
      calls.push(['set', input]);
      if (options.trap) throw Error('trap');
      return options.code ?? 1;
    },
    [`${prefix}_output_ptr`]: () => 0,
    [`${prefix}_output_len`]: () => bytes.length,
    [`${prefix}_output_free`]: () => {
      frees++;
    },
  };
  const memory = {
    copy: () => bytes.slice(),
    error: () => Error('native refusal'),
    withBytes(b, fn) {
      input = JSON.parse(new TextDecoder().decode(b));
      const result = fn(0, b.length);
      if (options.cleanup) throw Error('cleanup');
      return result;
    },
  };
  const api = createOriginalCellVerticalAlignmentApi({ wasm, memory, check() {}, prefix });
  return { api, calls, native, wasm, frees: () => frees };
}
for (const format of ['hwp5', 'hwpx']) {
  test(`${format} lease query and single commit send only retained token and value`, () => {
    const s = setup(format),
      before = s.api.originalCellVerticalAlignment(selector);
    assert.equal(s.api.supportsOriginalCellVerticalAlignment(), true);
    assert.equal(Object.isFrozen(before), true);
    assert.equal(s.frees(), 1);
    assert.equal(before.paragraph, selector.paragraph);
    assert.deepEqual(s.calls[0], ['query', 0, format === 'hwpx' ? 8 : 7]);
    const result = s.api.setOriginalCellVerticalAlignment({
      before: structuredClone(before),
      value: 'CENTER',
    });
    assert.equal(result.application, 'applied');
    assert.deepEqual(s.calls[1], ['set', { lease: '18446744073709551615', value: 'CENTER' }]);
    assert.throws(
      () => s.api.setOriginalCellVerticalAlignment({ before, value: 'BOTTOM' }),
      /StaleOriginalCellLease/,
    );
    assert.equal(s.calls.length, 2);
  });
  test(`${format} owner mismatch and superseded query reject without mutation`, () => {
    const s = setup(format),
      old = s.api.originalCellVerticalAlignment(selector);
    s.api.originalCellVerticalAlignment(selector);
    assert.throws(
      () => s.api.setOriginalCellVerticalAlignment({ before: old, value: 'BOTTOM' }),
      /StaleOriginalCellLease/,
    );
    assert.throws(
      () => s.api.originalCellVerticalAlignment({ ...selector, listNode: 4 }),
      /OwnerMismatch/,
    );
    assert.equal(s.calls.filter((c) => c[0] === 'set').length, 0);
  });
  test(`${format} forged and foreign scoped leases are rejected`, () => {
    const a = setup(format),
      b = setup(format),
      before = a.api.originalCellVerticalAlignment(selector);
    b.api.originalCellVerticalAlignment(selector);
    assert.throws(
      () => b.api.setOriginalCellVerticalAlignment({ before, value: 'BOTTOM' }),
      /StaleOriginalCellLease/,
    );
    assert.throws(
      () =>
        a.api.setOriginalCellVerticalAlignment({
          before: { ...before, paragraph: 8 },
          value: 'BOTTOM',
        }),
      /StaleOriginalCellLease/,
    );
  });
  test(`${format} old optional backend and readonly owner remain unavailable`, () => {
    const old = setup(format, { version: 0 });
    assert.equal(old.api.supportsOriginalCellVerticalAlignment(), false);
    assert.throws(() => old.api.originalCellVerticalAlignment(selector), /Unavailable/);
    const s = setup(format, { observation: { editable: false, value: null } }),
      before = s.api.originalCellVerticalAlignment(selector);
    assert.throws(
      () => s.api.setOriginalCellVerticalAlignment({ before, value: 'TOP' }),
      /ReadOnly/,
    );
  });
}
test('strict records reject getters, caller witness, size and unsupported values before Native', () => {
  let gets = 0;
  const s = setup(),
    before = s.api.originalCellVerticalAlignment(selector);
  assert.throws(() =>
    checkedOriginalCellSelector({
      ...selector,
      get epoch() {
        gets++;
        return 1;
      },
    }),
  );
  assert.equal(gets, 0);
  for (const request of [
    { before, value: 'middle' },
    { before, value: 'TOP', size: { width: 2 } },
    { before, value: 'TOP', witness: {} },
  ])
    assert.throws(() => s.api.setOriginalCellVerticalAlignment(request));
  assert.equal(s.calls.length, 1);
  for (const value of [-0, -1, 1.5, 2 ** 32])
    assert.throws(() => checkedOriginalCellSelector({ ...selector, paragraph: value }));
});
test('missing HX alignment is writable without inventing a TOP default', () => {
  const s = setup('hwpx', { observation: { value: null, editable: true } }),
    before = s.api.originalCellVerticalAlignment(selector);
  assert.equal(before.value, null);
  assert.equal(
    s.api.setOriginalCellVerticalAlignment({ before, value: 'TOP' }).application,
    'applied',
  );
});
test('no-op, rejection, unknown completion and cleanup preserve primitive result without retry', () => {
  for (const [code, application] of [
    [2, 'unapplied'],
    [0, 'unapplied'],
    [3, 'unknown'],
    [99, 'unknown'],
  ]) {
    const s = setup('hwp5', { code }),
      before = s.api.originalCellVerticalAlignment(selector);
    assert.equal(
      s.api.setOriginalCellVerticalAlignment({ before, value: 'BOTTOM' }).application,
      application,
    );
    assert.throws(
      () => s.api.setOriginalCellVerticalAlignment({ before, value: 'BOTTOM' }),
      /StaleOriginalCellLease/,
    );
    assert.equal(s.calls.filter((c) => c[0] === 'set').length, 1);
  }
  const s = setup('hwp5', { cleanup: true }),
    before = s.api.originalCellVerticalAlignment(selector);
  const r = s.api.setOriginalCellVerticalAlignment({ before, value: 'BOTTOM' });
  assert.equal(r.application, 'applied');
  assert.equal(r.cleanupError, 'cleanup');
  const q = setup('hwp5', { trap: true }),
    b = q.api.originalCellVerticalAlignment(selector);
  assert.equal(
    q.api.setOriginalCellVerticalAlignment({ before: b, value: 'TOP' }).application,
    'unknown',
  );
});
test('lease decimal overflow, zero and unexpected optional observation shape reject', () => {
  const s = setup();
  for (const lease of ['0', '01', '18446744073709551616', '-1'])
    assert.throws(() => checkedOriginalCellObservation({ ...s.native, lease }));
  assert.throws(() => checkedOriginalCellObservation({ ...s.native, witness: {} }));
});

test('HWPX rejects overflow and a native reply for an adjacent paragraph', () => {
  const s = setup('hwpx', { observation: { paragraph: selector.paragraph } });
  assert.throws(
    () => s.api.originalCellVerticalAlignment({ ...selector, paragraph: 0xffffffff }),
    /InvalidOriginalCellOwner/,
  );
  assert.deepEqual(s.calls, []);
  assert.throws(() => s.api.originalCellVerticalAlignment(selector), /OriginalCellOwnerMismatch/);
  assert.deepEqual(s.calls, [['query', 0, 8]]);
  assert.equal(s.frees(), 1);
});
