import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { captureCreatedTableGridRequest } from '../../js/created-table-grid.mjs';
import { createHwp5TableCreationApi } from '../../js/hwp5-table-creation.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import {
  ABI_VERSION,
  REQUIRED_FUNCTIONS,
  CREATED_TABLE_GRID_ACTION,
} from '../../js/abi-schema.mjs';

const request = (extra = {}) => ({
  section: 0,
  identity: '18446744073709551615',
  action: 'insert-row',
  index: 0,
  ...extra,
});
const actions = [
  ['insert-row', CREATED_TABLE_GRID_ACTION.insert_row],
  ['delete-row', CREATED_TABLE_GRID_ACTION.delete_row],
  ['insert-column', CREATED_TABLE_GRID_ACTION.insert_column],
  ['delete-column', CREATED_TABLE_GRID_ACTION.delete_column],
];

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
    wasm[`${format}_edit_created_table_grid`] = (...args) => {
      calls.push(args);
      return failure ? 0 : 1;
    };
  let api;
  if (format === 'hwp5') {
    api = createHwp5TableCreationApi({
      wasm,
      memory: { error: () => new Error(error) },
      check() {},
      output() {
        throw new Error('NoOutputExpected');
      },
      u32: (value) => value,
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

const badRequests = () => [
  ...[
    '0',
    '01',
    '-1',
    '+1',
    ' 1',
    '1 ',
    '1\n',
    '1e1',
    '0x1',
    '',
    '18446744073709551616',
    1,
    1n,
    null,
    {
      toString() {
        throw new Error('hook');
      },
    },
  ].map((identity) => request({ identity })),
  ...['section', 'index'].flatMap((key) =>
    [-0, -1, 1.1, NaN, Infinity, 0x100000000, '0', null].map((value) => request({ [key]: value })),
  ),
  ...['insert_row', 'constructor', 'toString', '', 0, null].map((action) => request({ action })),
  request({ unknown: 1 }),
  request({
    toJSON() {
      throw new Error('hook');
    },
  }),
  request({ [Symbol('hidden')]: 1 }),
  [],
  null,
  new Date(),
];

test('capture owns and freezes exactly four data fields, including null-prototype records', () => {
  const source = request();
  const captured = captureCreatedTableGridRequest(source);
  source.identity = '1';
  assert.equal(captured.identity, '18446744073709551615');
  assert.ok(Object.isFrozen(captured));
  assert.deepEqual(
    captureCreatedTableGridRequest(Object.assign(Object.create(null), request())),
    captured,
  );
  for (const key of Object.keys(request())) {
    const missing = request();
    delete missing[key];
    assert.throws(() => captureCreatedTableGridRequest(missing));
  }
});

test('capture reads each descriptor once without reading source properties', () => {
  const counts = new Map();
  const source = new Proxy(request(), {
    get() {
      throw new Error('PropertyReadForbidden');
    },
    getOwnPropertyDescriptor(target, key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  assert.equal(captureCreatedTableGridRequest(source).identity, request().identity);
  assert.deepEqual([...counts.values()], [1, 1, 1, 1]);
});

for (const format of ['hwp5', 'hwpx']) {
  test(`${format}: optional old ABI refuses before mutation`, async () => {
    const h = await session(format, false);
    assert.equal(h.api.supportsCreatedTableGrid(), false);
    assert.throws(
      () => h.api.editCreatedTableGrid(request()),
      new RegExp(`${format === 'hwp5' ? 'Hwp5' : 'Hwpx'}CreatedTableGridAbiUnavailable`),
    );
    assert.deepEqual(h.calls, []);
    assert.ok(!REQUIRED_FUNCTIONS.includes(`${format}_edit_created_table_grid`));
  });
  test(`${format}: marshals four actions and unsigned u64 halves without allocation`, async () => {
    const h = await session(format);
    assert.equal(h.api.supportsCreatedTableGrid(), true);
    for (const [action, code] of actions) {
      assert.equal(
        h.api.editCreatedTableGrid(request({ action, section: 0xffffffff, index: 0xffffffff })),
        undefined,
      );
      assert.deepEqual(h.calls.at(-1), [0xffffffff, 0xffffffff, 0xffffffff, code, 0xffffffff]);
    }
    h.api.editCreatedTableGrid(request({ identity: '4294967297' }));
    assert.deepEqual(h.calls.at(-1), [0, 1, 1, CREATED_TABLE_GRID_ACTION.insert_row, 0]);
    h.api.editCreatedTableGrid(request({ identity: '1' }));
    assert.deepEqual(h.calls.at(-1).slice(1, 3), [1, 0]);
  });
  test(`${format}: invalid fields, accessors and inherited values never reach ABI`, async () => {
    const h = await session(format);
    for (const input of badRequests()) assert.throws(() => h.api.editCreatedTableGrid(input));
    let reads = 0;
    for (const key of Object.keys(request())) {
      const accessor = request();
      Object.defineProperty(accessor, key, {
        enumerable: true,
        get() {
          reads++;
          return request()[key];
        },
      });
      assert.throws(() => h.api.editCreatedTableGrid(accessor));
      const hidden = request();
      Object.defineProperty(hidden, key, { enumerable: false });
      assert.throws(() => h.api.editCreatedTableGrid(hidden));
    }
    assert.throws(() => h.api.editCreatedTableGrid(Object.create(request())));
    assert.equal(reads, 0);
    assert.deepEqual(h.calls, []);
  });
  test(`${format}: Native zero propagates existing memory.error`, async () => {
    const h = await session(format);
    h.fail();
    assert.throws(() => h.api.editCreatedTableGrid(request()), /SyntheticGridFailure/);
    assert.equal(h.calls.length, 1);
  });
}
