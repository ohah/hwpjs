import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureSourceTableGridRequest,
  createSourceTableGridApi,
} from '../../js/source-table-grid.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import {
  ABI_VERSION,
  REQUIRED_FUNCTIONS,
  CREATED_TABLE_GRID_ACTION,
} from '../../js/abi-schema.mjs';
const request = (patch = {}) => ({
  section: 0,
  tableNode: 9,
  expectedRows: 2,
  expectedColumns: 3,
  action: 'insert-row',
  index: 1,
  ...patch,
});
async function session(format, modern = true) {
  const calls = [];
  let failure = false;
  const error = 'SyntheticGridFailure';
  const bytes = new TextEncoder().encode(error);
  const memory = new WebAssembly.Memory({ initial: 1 });
  new Uint8Array(memory.buffer, 16, bytes.length).set(bytes);
  const wasm = Object.fromEntries(REQUIRED_FUNCTIONS.map((name) => [name, () => 0]));
  Object.assign(wasm, {
    memory,
    hwpjs_abi_version: () => ABI_VERSION,
    cfb_error_ptr: () => 16,
    cfb_error_len: () => bytes.length,
    cfb_alloc: () => {
      throw new Error('NoAllocationExpected');
    },
  });
  for (const suffix of [
    'open',
    'close',
    'section_count',
    'can_edit',
    'splice',
    'save',
    'output_ptr',
    'output_len',
    'output_free',
  ])
    wasm[`hwpx_edit_${suffix}`] = () => 0;
  if (modern)
    wasm[`${format}_edit_source_table_grid`] = (...args) => {
      calls.push(args);
      return failure ? 0 : 1;
    };
  let api;
  if (format === 'hwp5') {
    api = createSourceTableGridApi({
      wasm,
      memory: { error: () => new Error(error) },
      check() {},
      prefix: 'hwp5_edit',
      unavailable: 'Hwp5SourceTableGridAbiUnavailable',
    });
  } else {
    const instantiate = mock.method(WebAssembly, 'instantiate', async () => ({ exports: wasm }));
    try {
      api = await createHwpxEditor(
        new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
      );
    } finally {
      instantiate.mock.restore();
    }
  }
  return {
    api,
    calls,
    fail: () => {
      failure = true;
    },
  };
}

test('strict frozen capture permits null prototypes, captures descriptors once, never reads properties', () => {
  const seen = [];
  const captured = captureSourceTableGridRequest(
    new Proxy(request(), {
      get() {
        throw Error('NoPropertyRead');
      },
      getOwnPropertyDescriptor(target, key) {
        seen.push(key);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    }),
    'hwp5',
  );
  assert.deepEqual({ ...captured }, request());
  assert.ok(Object.isFrozen(captured));
  assert.deepEqual(seen, Object.keys(request()));
  assert.deepEqual(
    captureSourceTableGridRequest(Object.assign(Object.create(null), request()), 'hwp5'),
    captured,
  );
});
for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: actual optional function presence and additive ABI 6`, async () => {
    assert.equal(ABI_VERSION, 6);
    const h = await session(format, false);
    assert.equal(h.api.supportsSourceTableGrid(), false);
    assert.throws(() => h.api.editSourceTableGrid(request()), /SourceTableGridAbiUnavailable/);
    assert.deepEqual(h.calls, []);
    assert.ok(!REQUIRED_FUNCTIONS.includes(`${format}_edit_source_table_grid`));
    for (const value of [undefined, null, true, 1, {}]) {
      const api = createSourceTableGridApi({
        wasm: { [`${format}_edit_source_table_grid`]: value },
        check() {},
        prefix: `${format}_edit`,
      });
      assert.equal(api.supportsSourceTableGrid(), false);
    }
  });
  test(`${format}: seven numeric ABI arguments, shared four actions and layout`, async () => {
    const h = await session(format);
    assert.equal(h.api.supportsSourceTableGrid(), true);
    for (const [action, code] of [
      ['insert-row', CREATED_TABLE_GRID_ACTION.insert_row],
      ['delete-row', CREATED_TABLE_GRID_ACTION.delete_row],
      ['insert-column', CREATED_TABLE_GRID_ACTION.insert_column],
      ['delete-column', CREATED_TABLE_GRID_ACTION.delete_column],
    ]) {
      h.api.editSourceTableGrid(request({ action, section: 0xffffffff, tableNode: 0xffffffff }));
      assert.deepEqual(h.calls.at(-1), [0xffffffff, 0xffffffff, 2, 3, code, 1, 0]);
    }
    h.api.editSourceTableGrid(request({ layout: 'spec6' }));
    assert.equal(h.calls.at(-1)[6], 0);
    if (format === 'hwp5') {
      h.api.editSourceTableGrid(request({ layout: 'observed8' }));
      assert.equal(h.calls.at(-1)[6], 1);
    } else assert.throws(() => h.api.editSourceTableGrid(request({ layout: 'observed8' })));
    h.fail();
    assert.throws(() => h.api.editSourceTableGrid(request()), /SyntheticGridFailure/);
  });
  test(`${format}: strict uint32, dimensions, action/index and descriptors reject before mutation`, async () => {
    const h = await session(format);
    const bad = [
      null,
      [],
      new Date(),
      Object.create(request()),
      request({ extra: 1 }),
      request({ [Symbol()]: 1 }),
      ...[undefined, 0, 1, null, 'unknown'].map((layout) => request({ layout })),
      ...[-1, -0, 0, 1, 2, 3, 4, 'insert_row', 'constructor', 'toString', '', null].map((action) =>
        request({ action }),
      ),
      request({ expectedRows: 0 }),
      request({ expectedColumns: 0 }),
      request({ index: 3 }),
      request({ action: 'delete-row', index: 2 }),
      request({ action: 'delete-row', expectedRows: 1, index: 0 }),
      request({ action: 'delete-column', expectedColumns: 1, index: 0 }),
      request({ expectedRows: 0xffffffff }),
    ];
    for (const key of Object.keys(request())) {
      for (const value of [-0, -1, 1.5, NaN, Infinity, 0x100000000, '0', null])
        bad.push(request({ [key]: value }));
      const missing = request();
      delete missing[key];
      bad.push(missing);
      const hidden = request();
      Object.defineProperty(hidden, key, { enumerable: false });
      bad.push(hidden);
      const getter = request();
      Object.defineProperty(getter, key, {
        get() {
          throw Error('GetterInvoked');
        },
      });
      bad.push(getter);
    }
    for (const input of bad)
      assert.throws(
        () => h.api.editSourceTableGrid(input),
        (error) => error.message !== 'GetterInvoked',
      );
    const getter = request();
    Object.defineProperty(getter, 'layout', {
      enumerable: true,
      get() {
        throw Error('GetterInvoked');
      },
    });
    assert.throws(() => h.api.editSourceTableGrid(getter), /InvalidSourceTableGridRequest/);
    assert.deepEqual(h.calls, []);
    // Insert accepts the boundary; delete accepts only existing indices.
    h.api.editSourceTableGrid(request({ index: 2 }));
    h.api.editSourceTableGrid(request({ action: 'insert-column', index: 3 }));
    h.api.editSourceTableGrid(request({ action: 'delete-column', index: 2 }));
    assert.equal(h.calls.length, 3);
  });
}

test('numeric wire action codes are rejected by public capture and both SDKs', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const h = await session(format);
    for (const action of Object.values(CREATED_TABLE_GRID_ACTION)) {
      assert.throws(
        () => captureSourceTableGridRequest(request({ action }), format),
        /InvalidSourceTableGridAction/,
      );
      assert.throws(
        () => h.api.editSourceTableGrid(request({ action })),
        /InvalidSourceTableGridAction/,
      );
    }
    assert.deepEqual(h.calls, []);
  }
});
