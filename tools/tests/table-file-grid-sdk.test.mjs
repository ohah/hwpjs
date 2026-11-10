import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceTableGridFileApi } from '../../js/table-file-grid.mjs';

const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
const request = (patch = {}) => ({
  format: 'hwp5',
  section: 2,
  tableNode: 17,
  expectedRows: 3,
  expectedColumns: 4,
  action: 'insert-row',
  index: 3,
  ...patch,
});
const input = () => new Uint8Array([11, 22, 33]);

function fixture() {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const state = { allocations: [], frees: [], outputFrees: 0, calls: [], pointerReads: 0 };
  const message = new TextEncoder().encode('GridRejected');
  new Uint8Array(memory.buffer, 256, message.length).set(message);
  const wasm = {
    memory,
    hwpjs_abi_version: () => 6,
    cfb_alloc(size) {
      state.allocations.push(size);
      state.onAlloc?.();
      return state.oom ? 0 : 1024;
    },
    cfb_free(ptr, size) {
      state.frees.push([ptr, size]);
      state.onInputFree?.();
    },
    cfb_error_ptr: () => 256,
    cfb_error_len: () => message.length,
    table_file_grid_edit(...args) {
      state.calls.push({ args, document: [...new Uint8Array(memory.buffer, args[1], args[2])] });
      state.onEdit?.();
      if (state.fail) return 0;
      new Uint8Array(memory.buffer, 128, 4).set([80, 75, 3, 4]);
      return 1;
    },
    table_file_grid_ptr() {
      state.pointerReads++;
      state.onPointer?.();
      return state.pointer ?? 128;
    },
    table_file_grid_len() {
      state.onLength?.();
      return state.length ?? 4;
    },
    table_file_grid_free() {
      state.outputFrees++;
      state.onOutputFree?.();
      new Uint8Array(memory.buffer, 128, 4).fill(0);
    },
  };
  return { state, wasm, memory, instantiate: async () => ({ exports: wasm }) };
}

test('ABI6 wire codes, append boundaries and layouts; synchronous owned output', async () => {
  const f = fixture();
  const api = await createSourceTableGridFileApi(module, f);
  const cases = [
    [request(), [1, 1024, 3, 2, 17, 3, 4, 0, 3, 0]],
    [
      request({ action: 'delete-row', index: 2, layout: 'observed8' }),
      [1, 1024, 3, 2, 17, 3, 4, 1, 2, 1],
    ],
    [
      request({ format: 'hwpx', action: 'insert-column', index: 4 }),
      [2, 1024, 3, 2, 17, 3, 4, 2, 4, 0],
    ],
    [
      request({ format: 'hwpx', action: 'delete-column', index: 3, layout: 'spec6' }),
      [2, 1024, 3, 2, 17, 3, 4, 3, 3, 0],
    ],
  ];
  for (const [target, wire] of cases) {
    const source = input();
    const result = api.edit(source, target);
    assert.ok(result instanceof Uint8Array);
    assert.deepEqual([...result], [80, 75, 3, 4]);
    assert.deepEqual(f.state.calls.at(-1), { args: wire, document: [11, 22, 33] });
    assert.deepEqual([...source], [11, 22, 33]);
    assert.deepEqual(f.state.frees.at(-1), [1024, 3]);
    assert.notEqual(result.buffer, f.memory.buffer);
  }
  assert.equal(f.state.outputFrees, 4);
  api.close();
  api.close();
  assert.equal(f.state.outputFrees, 5);
  assert.throws(() => api.edit(input(), request()), /Closed/);
});

test('snapshot precedes allocation callbacks; memory growth cannot detach input or returned output', async () => {
  const f = fixture();
  const api = await createSourceTableGridFileApi(module, f);
  const source = input(),
    target = request();
  f.state.onAlloc = () => {
    source.fill(99);
    target.tableNode = 999;
    f.memory.grow(1);
  };
  f.state.onEdit = () => f.memory.grow(1);
  f.state.onLength = () => f.memory.grow(1);
  f.state.onInputFree = () => {
    f.memory.grow(1);
    new Uint8Array(f.memory.buffer, 128, 4).fill(9);
  };
  const result = api.edit(source, target);
  assert.deepEqual(f.state.calls[0].document, [11, 22, 33]);
  assert.equal(f.state.calls[0].args[4], 17);
  assert.deepEqual([...result], [80, 75, 3, 4]);
  api.close();
});

test('old or incomplete ABI and missing memory reject before any allocation', async () => {
  for (const field of [
    'table_file_grid_edit',
    'table_file_grid_ptr',
    'table_file_grid_len',
    'table_file_grid_free',
    'cfb_free',
    'cfb_error_ptr',
  ]) {
    const f = fixture();
    delete f.wasm[field];
    await assert.rejects(createSourceTableGridFileApi(module, f), /AbiUnavailable/);
    assert.deepEqual(f.state.allocations, []);
    assert.equal(f.state.outputFrees, 0);
  }
  for (const version of [5, 7]) {
    const f = fixture();
    f.wasm.hwpjs_abi_version = () => version;
    await assert.rejects(createSourceTableGridFileApi(module, f), /VersionMismatch/);
    assert.deepEqual(f.state.allocations, []);
  }
  const f = fixture();
  f.wasm.memory = {};
  await assert.rejects(createSourceTableGridFileApi(module, f), /Missing.*Memory/);
});

test('all accessors, unexpected own keys and inherited required fields reject without getters', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  let reads = 0;
  for (const key of [...Object.keys(request()), 'layout', 'extra', Symbol('extra')]) {
    const target = request();
    Object.defineProperty(target, key, {
      get() {
        reads++;
        throw new Error('getter');
      },
    });
    assert.throws(() => api.edit(input(), target), /InvalidTableFileGridRequest/);
  }
  for (const target of [
    null,
    [],
    request({ extra: 1 }),
    request({ [Symbol('extra')]: 1 }),
    Object.create(request()),
  ])
    assert.throws(() => api.edit(input(), target), /InvalidTableFileGridRequest/);
  const target = Object.assign(Object.create(null), request());
  assert.ok(api.edit(input(), target) instanceof Uint8Array);
  assert.equal(reads, 0);
  assert.equal(f.state.calls.length, 1);
  api.close();
});

test('uint32, dimensions, action, layout and axis bounds reject before allocating', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  const invalid = [];
  for (const key of ['section', 'tableNode', 'expectedRows', 'expectedColumns', 'index'])
    for (const value of [-0, -1, 0x100000000, 1.5, NaN, Infinity, '1', 1n, undefined])
      invalid.push(request({ [key]: value }));
  invalid.push(
    request({ expectedRows: 0 }),
    request({ expectedColumns: 0 }),
    request({ format: 'hwp3' }),
    request({ action: 'toString' }),
    request({ action: 1 }),
    request({ layout: undefined }),
    request({ layout: 'auto' }),
    request({ format: 'hwpx', layout: 'observed8' }),
    request({ index: 4 }),
    request({ action: 'delete-row', index: 3 }),
    request({ action: 'delete-row', expectedRows: 1, index: 0 }),
    request({ action: 'delete-column', expectedColumns: 1, index: 0 }),
    request({ action: 'insert-column', index: 5 }),
    request({ action: 'delete-column', index: 4 }),
    request({ expectedRows: 0xffffffff, index: 0 }),
    request({ action: 'insert-column', expectedColumns: 0xffffffff, index: 0 }),
  );
  for (const target of invalid) assert.throws(() => api.edit(input(), target));
  assert.deepEqual(f.state.allocations, []);
  assert.equal(f.state.outputFrees, 0);
  // The unaffected axis may still have size one; identifiers retain all uint32 bits.
  api.edit(input(), request({ section: 0xffffffff, tableNode: 0xffffffff, expectedColumns: 1 }));
  assert.deepEqual(f.state.calls[0].args.slice(3, 5), [0xffffffff, 0xffffffff]);
  api.close();
});

test('byte snapshots ignore subclass hooks and reject unsupported, shared, detached and oversized input', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  class HostileBytes extends Uint8Array {
    get byteLength() {
      throw new Error('byteLength');
    }
    get buffer() {
      throw new Error('buffer');
    }
    [Symbol.iterator]() {
      throw new Error('iterator');
    }
    slice() {
      throw new Error('slice');
    }
  }
  const bytes = new HostileBytes([99, 11, 22, 33, 99]);
  api.edit(bytes.subarray(1, 4), request());
  assert.deepEqual(f.state.calls[0].document, [11, 22, 33]);
  api.edit(input().buffer, request());
  const detached = new ArrayBuffer(2);
  structuredClone(detached, { transfer: [detached] });
  for (const source of [
    new Uint8Array(),
    new Uint16Array(2),
    new DataView(new ArrayBuffer(2)),
    new Proxy(input(), {}),
    new SharedArrayBuffer(2),
    new Uint8Array(new SharedArrayBuffer(2)),
    detached,
    new Uint8Array(64 * 1024 * 1024 + 1),
  ])
    assert.throws(() => api.edit(source, request()));
  assert.equal(f.state.allocations.length, 2);
  api.close();
});

test('WASM byte source is compiled from its snapshot and invalid sources never instantiate', async () => {
  const f = fixture();
  let instances = 0;
  const instantiate = async (compiled, imports) => {
    instances++;
    assert.ok(compiled instanceof WebAssembly.Module);
    assert.deepEqual(imports, {});
    return { exports: f.wasm };
  };
  const bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
  const pending = createSourceTableGridFileApi(bytes, { instantiate });
  bytes.fill(255);
  (await pending).close();
  for (const source of [new Uint8Array(), new Uint8Array(32 * 1024 * 1024 + 1), new Uint16Array(4)])
    await assert.rejects(createSourceTableGridFileApi(source, { instantiate }));
  assert.equal(instances, 1);
});

test('Native rejection avoids stale output and frees both owners; next edit can succeed', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  f.state.fail = true;
  f.state.onPointer = () => {
    throw new Error('stale pointer read');
  };
  assert.throws(() => api.edit(input(), request()), /GridRejected/);
  assert.equal(f.state.pointerReads, 0);
  assert.deepEqual(f.state.frees, [[1024, 3]]);
  assert.equal(f.state.outputFrees, 1);
  delete f.state.onPointer;
  f.state.fail = false;
  assert.deepEqual([...api.edit(input(), request())], [80, 75, 3, 4]);
  api.close();
});

test('allocation, trap and output accessor failures still release every acquired owner', async () => {
  for (const stage of ['oom', 'onAlloc', 'onEdit', 'onPointer', 'onLength']) {
    const f = fixture(),
      api = await createSourceTableGridFileApi(module, f);
    if (stage === 'oom') f.state.oom = true;
    else
      f.state[stage] = () => {
        throw new Error(stage);
      };
    assert.throws(
      () => api.edit(input(), request()),
      stage === 'oom' ? /OutOfMemory/ : new RegExp(stage),
    );
    assert.equal(f.state.frees.length, ['oom', 'onAlloc'].includes(stage) ? 0 : 1);
    assert.equal(f.state.outputFrees, 1);
    api.close();
  }
});

test('primary error and independent cleanup errors survive in order', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  f.state.fail = true;
  f.state.onInputFree = () => {
    throw new Error('input cleanup');
  };
  f.state.onOutputFree = () => {
    throw new Error('output cleanup');
  };
  assert.throws(
    () => api.edit(input(), request()),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((item) => item.message),
        ['GridRejected', 'input cleanup', 'output cleanup'],
      );
      return true;
    },
  );
  assert.equal(f.state.frees.length, 1);
  assert.equal(f.state.outputFrees, 1);
  delete f.state.onInputFree;
  delete f.state.onOutputFree;
  api.close();
});

test('successful Native call cannot conceal cleanup failure; failed close stays closed', async () => {
  for (const stage of ['onInputFree', 'onOutputFree']) {
    const f = fixture(),
      api = await createSourceTableGridFileApi(module, f);
    f.state[stage] = () => {
      throw new Error(stage);
    };
    assert.throws(() => api.edit(input(), request()), new RegExp(stage));
    assert.equal(f.state.outputFrees, 1);
    delete f.state[stage];
    f.state.onOutputFree = () => {
      throw new Error('close cleanup');
    };
    assert.throws(() => api.close(), /close cleanup/);
    api.close();
    assert.equal(f.state.outputFrees, 2);
    assert.throws(() => api.edit(input(), request()), /Closed/);
  }
});

test('output uint32, nonempty, memory range and independent 128MiB cap checks', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  const bad = [
    [0, 4],
    [-0, 4],
    [-1, 4],
    [1.5, 4],
    [0x100000000, 4],
    [128, 0],
    [128, -0],
    [128, -1],
    [128, NaN],
    [128, 1.5],
    [128, 0x100000000],
    [f.memory.buffer.byteLength - 1, 4],
  ];
  for (const [pointer, length] of bad) {
    Object.assign(f.state, { pointer, length });
    assert.throws(() => api.edit(input(), request()), /InvalidTableFileGridOutput/);
  }
  // Grow beyond the cap so rejection proves budget enforcement, not range failure.
  f.memory.grow(2049);
  Object.assign(f.state, { pointer: 128, length: 128 * 1024 * 1024 + 1 });
  assert.throws(() => api.edit(input(), request()), /InvalidTableFileGridOutput/);
  assert.equal(f.state.frees.length, bad.length + 1);
  assert.equal(f.state.outputFrees, bad.length + 1);
  api.close();
});

test('output may exceed the 64MiB input budget while remaining an owned copy', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  f.memory.grow(1025);
  f.state.length = 64 * 1024 * 1024 + 1;
  const result = api.edit(input(), request({ layout: 'spec6' }));
  assert.equal(result.length, 64 * 1024 * 1024 + 1);
  assert.deepEqual([...result.subarray(0, 4)], [80, 75, 3, 4]);
  assert.equal(f.state.calls[0].args[9], 0);
  assert.notEqual(result.buffer, f.memory.buffer);
  api.close();
});

test('reentry during request traps, allocation, Native and cleanup never disturbs outer ownership', async () => {
  const f = fixture(),
    api = await createSourceTableGridFileApi(module, f);
  let checks = 0;
  const reenter = () => {
    assert.throws(() => api.edit(input(), request()), /Busy/);
    assert.throws(() => api.close(), /Busy/);
    checks++;
  };
  for (const stage of ['onAlloc', 'onEdit', 'onPointer', 'onLength', 'onInputFree', 'onOutputFree'])
    f.state[stage] = reenter;
  const target = new Proxy(request(), {
    ownKeys(object) {
      reenter();
      return Reflect.ownKeys(object);
    },
  });
  assert.deepEqual([...api.edit(input(), target)], [80, 75, 3, 4]);
  assert.equal(checks, 7);
  assert.equal(f.state.calls.length, 1);
  assert.equal(f.state.frees.length, 1);
  delete f.state.onOutputFree;
  api.close();
});
