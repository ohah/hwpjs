import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatedCellPropertiesApi } from '../js/created-cell-properties-api.mjs';
import { applyCreatedCellPropertiesCommand } from '../web/preview/created-cell-properties-command.mjs';
const request = () => ({
  section: 0,
  identity: '18446744073709551615',
  row: 0,
  column: 1,
  expected: { width: 100, height: 20 },
  size: { width: 110 },
  appearance: {
    borders: { left: { color: 0x234567, width: 10 } },
    fill: { kind: 'solid', color: 0x123456 },
  },
});
function mock(prefix, result = 1) {
  let writes = 0,
    frees = 0,
    captured,
    binding = { document: '123', generation: '1', owner: '456', epoch: '9007199254740993' };
  const wasm = {
    [`${prefix}_created_cell_properties_version`]: () => 1,
    [`${prefix}_created_cell_properties_ticket`]: () => 1,
    [`${prefix}_set_created_cell_properties`]: () => {
      writes++;
      return result;
    },
    [`${prefix}_output_ptr`]: () => 1,
    [`${prefix}_output_len`]: () => 1,
    [`${prefix}_output_free`]: () => {
      frees++;
    },
  };
  const memory = {
    error: () => Error('NativeRefusal'),
    copy: () => new TextEncoder().encode(JSON.stringify(binding)),
    withBytes(bytes, action) {
      captured = JSON.parse(new TextDecoder().decode(bytes));
      return action(1, bytes.length);
    },
  };
  const api = createCreatedCellPropertiesApi({ wasm, memory, prefix, check() {} });
  return {
    api,
    wasm,
    memory,
    get writes() {
      return writes;
    },
    get frees() {
      return frees;
    },
    get captured() {
      return captured;
    },
    set binding(v) {
      binding = v;
    },
  };
}
for (const prefix of ['hwp5_edit', 'hwpx_edit']) {
  test(prefix + ' exact owner full witness sparse write and one Native call', () => {
    const m = mock(prefix);
    assert.equal(m.api.supportsCreatedCellProperties(), true);
    assert.deepEqual(m.api.editCreatedCellProperties(request()), {
      application: 'applied',
      changed: true,
    });
    assert.equal(m.writes, 1);
    assert.equal(m.frees, 1);
    assert.equal(m.captured.witness.epoch, '9007199254740993');
    assert.deepEqual(m.captured.appearance, {
      border: { edges: [{ color: 0x234567, width_hundredth_mm: 10 }, null, null, null] },
      background: { solid: { color: 0x123456 } },
    });
    assert.equal(m.captured.identity, '18446744073709551615');
  });
  test(prefix + ' old optional ABI refuses before write', () => {
    const m = mock(prefix);
    delete m.wasm[`${prefix}_created_cell_properties_ticket`];
    assert.equal(m.api.supportsCreatedCellProperties(), false);
    assert.throws(() => m.api.editCreatedCellProperties(request()), /Unavailable/);
    assert.equal(m.writes, 0);
  });
  test(prefix + ' full witness malformed and foreign address reject before write', () => {
    const m = mock(prefix);
    m.binding = { document: '01', generation: '1', owner: '1', epoch: '1' };
    assert.throws(() => m.api.editCreatedCellProperties(request()), /Witness/);
    assert.equal(m.writes, 0);
    assert.equal(m.frees, 1);
    assert.throws(
      () => m.api.editCreatedCellProperties({ ...request(), tableNode: 1 }),
      /Properties/,
    );
  });
  test(prefix + ' getter never executes', () => {
    const m = mock(prefix);
    let reads = 0;
    const r = request();
    Object.defineProperty(r, 'identity', {
      get() {
        reads++;
        return '1';
      },
      enumerable: true,
    });
    assert.throws(() => m.api.editCreatedCellProperties(r));
    assert.equal(reads, 0);
    assert.equal(m.writes, 0);
  });
  test(prefix + ' no-op and uncertain result remain distinct', () => {
    assert.deepEqual(mock(prefix, 2).api.editCreatedCellProperties(request()), {
      application: 'not-applied',
      changed: false,
    });
    assert.deepEqual(mock(prefix, 3).api.editCreatedCellProperties(request()), {
      application: 'unknown',
      changed: null,
    });
    assert.throws(() => mock(prefix, 0).api.editCreatedCellProperties(request()), /NativeRefusal/);
  });
  test(prefix + ' post invocation trap is unknown with no retry', () => {
    const m = mock(prefix);
    m.wasm[`${prefix}_set_created_cell_properties`] = () => {
      throw Error('trap');
    };
    assert.deepEqual(m.api.editCreatedCellProperties(request()), {
      application: 'unknown',
      changed: null,
    });
  });
}
test('Worker V2, format, history, window and capability refuse before mutation', () => {
  let calls = 0;
  const editor = {
    historyStats: () => ({ protocolVersion: 2 }),
    supportsCreatedCellProperties: () => true,
    editCreatedCellProperties() {
      calls++;
      return { application: 'applied', changed: true };
    },
  };
  for (const [format, enabled, poisoned, window] of [
    ['hwp5', false, false, null],
    ['hwp5', true, true, null],
    ['hwp5', true, false, {}],
    ['other', true, false, null],
  ])
    assert.throws(() =>
      applyCreatedCellPropertiesCommand(editor, format, enabled, poisoned, window, request()),
    );
  assert.equal(calls, 0);
  assert.deepEqual(
    applyCreatedCellPropertiesCommand(editor, 'hwpx', true, false, null, request()),
    { application: 'applied', changed: true },
  );
  assert.equal(calls, 1);
});
