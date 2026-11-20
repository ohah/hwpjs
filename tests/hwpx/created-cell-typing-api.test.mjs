// Primitive exports/memory are controlled. No WASM/Native execution claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatedCellTypingApi } from '../../js/created-cell-typing-api.mjs';
function fixture(prefix) {
  const heap = new Uint8Array(65536);
  const calls = [];
  let code = 1,
    cleanup = false;
  const wasm = {
    [`${prefix}_created_cell_typing_version`]: () => 1,
    [`${prefix}_splice_created_cell`]: (...args) => {
      calls.push({ args, bytes: heap.slice() });
      return code;
    },
  };
  const memory = {
    withBytes(bytes, action) {
      heap.set(bytes, 32);
      const result = action(32, bytes.length);
      if (cleanup) throw Error('cleanup');
      return result;
    },
    error: () => Error('NativeCellFailure'),
  };
  const capabilities = () => ({
    format: prefix.replace('_edit', ''),
    binding: { session: 's1', revision: 7 },
    limits: {
      requestBytes: 65536,
      requestDepth: 32,
      requestStructure: 10000,
      insertedBytes: 4 * 1024 * 1024,
    },
  });
  const api = createCreatedCellTypingApi({
    wasm,
    memory,
    check() {},
    prefix,
    available: () => true,
    capabilities,
  });
  return { api, wasm, calls, setCode: (v) => (code = v), setCleanup: () => (cleanup = true) };
}
const request = () => ({
  section: 2,
  identity: '9007199254740993',
  row: 3,
  column: 4,
  startUnit: 1,
  endUnit: 3,
  text: '한😀',
  insertion: {
    character: {
      underline: { kind: 'bottom' },
      strike: { enabled: false },
      textColor: 0,
      fonts: { latin: { name: 'Typing Font' } },
    },
  },
});
for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
  test(`${prefix} logical cell identity and full typing intent share one native call`, () => {
    const f = fixture(prefix);
    const q = request();
    assert.equal(f.api.createdCellTypingCapabilities().coordinateSpace, 'created-cell-utf16');
    assert.equal(f.api.supportsCreatedCellTypingAbi(), true);
    assert.deepEqual(f.api.spliceCreatedCell(q), {
      nativeCode: 1,
      application: 'applied',
      changed: true,
    });
    assert.equal(f.calls.length, 1);
    const { args, bytes } = f.calls[0];
    const [section, low, high, row, column, start, end, tp, ts, rp, rs] = args;
    assert.deepEqual([section, low, high, row, column, start, end], [2, 1, 2097152, 3, 4, 1, 3]);
    assert.equal(new TextDecoder().decode(bytes.subarray(tp, tp + ts)), '한😀');
    const wire = JSON.parse(new TextDecoder().decode(bytes.subarray(rp, rp + rs)));
    assert.deepEqual(wire, {
      schemaVersion: 1,
      binding: { session: 's1', revision: 7 },
      insertion: q.insertion,
    });
  });
  test(`${prefix} plain deletion has no forged paragraph and preserves primitive completion`, () => {
    const f = fixture(prefix);
    f.setCode(2);
    const q = { ...request(), text: '' };
    delete q.insertion;
    assert.equal(f.api.spliceCreatedCell(q).nativeCode, 2);
    assert.equal(f.calls[0].args[8], 0);
    assert.equal(f.calls[0].args.length, 11);
  });
  test(`${prefix} missing version/export is explicit unsupported with no fallback writes`, () => {
    const f = fixture(prefix);
    delete f.wasm[`${prefix}_created_cell_typing_version`];
    // Feature exports are captured at API construction: use a separate facade.
    const api = createCreatedCellTypingApi({
      wasm: f.wasm,
      memory: {},
      check() {},
      prefix,
      available: () => true,
      capabilities() {
        throw Error('unexpected query');
      },
    });
    assert.equal(api.supportsCreatedCellTypingAbi(), false);
    assert.throws(() => api.spliceCreatedCell(request()), /CreatedCellTypingUnavailable/);
    assert.equal(f.calls.length, 0);
  });
}
test('created-cell API rejects malformed addresses/scalars/accessors before any write', () => {
  const f = fixture('hwpx_edit');
  for (const patch of [
    { identity: '0' },
    { identity: '18446744073709551616' },
    { row: -1 },
    { column: 0.5 },
    { startUnit: 4, endUnit: 3 },
    { text: '\ud800' },
    { source_node: 99 },
  ])
    assert.throws(() => f.api.spliceCreatedCell({ ...request(), ...patch }));
  const getter = {
    ...request(),
    get text() {
      throw Error('GetterRead');
    },
  };
  assert.throws(() => f.api.spliceCreatedCell(getter), /AccessorPayloadUnsupported/);
  assert.equal(f.calls.length, 0);
});
test('created-cell cleanup failure never retries a completed native mutation', () => {
  const f = fixture('hwpx_edit');
  f.setCleanup();
  const result = f.api.spliceCreatedCell(request());
  assert.equal(result.application, 'applied');
  assert.equal(result.changed, true);
  assert.equal(result.cleanupError, 'cleanup');
  assert.equal(result.refreshRequired, true);
  assert.equal(f.calls.length, 1);
});
