import test from 'node:test';
import assert from 'node:assert/strict';
import { createTableDeleter } from '../../js/table-file-deletion.mjs';
import { ABI_VERSION } from '../../js/abi-schema.mjs';

const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
const input = () => new Uint8Array([1, 2, 3]);
const target = () => ({ format: 'hwp5', section: 0, tableNodes: [20, 99] });
function fixture() {
  const memory = new WebAssembly.Memory({ initial: 4 });
  const state = {
    calls: [],
    allocations: 0,
    frees: [],
    outputFrees: 0,
    ptrReads: 0,
    oomAt: 0,
    fail: false,
    freeError: null,
    inputFreeError: null,
    nativeError: null,
    outputPtr: 128,
    outputLen: 3,
  };
  new Uint8Array(memory.buffer, 128, 3).set([80, 75, 3]);
  const message = new TextEncoder().encode('TableDeletionFailed');
  new Uint8Array(memory.buffer, 256, message.length).set(message);
  let offset = 1025;
  const wasm = {
    memory,
    hwpjs_abi_version: () => ABI_VERSION,
    cfb_alloc(size) {
      state.allocations++;
      if (state.oomAt === state.allocations) return 0;
      const pointer = offset;
      offset += size + 5;
      return pointer;
    },
    cfb_free(pointer, length) {
      state.frees.push([pointer, length]);
      if (state.inputFreeError) throw state.inputFreeError;
    },
    cfb_error_ptr: () => 256,
    cfb_error_len: () => message.length,
    table_file_delete(format, ptr, length, section, targetsPtr, count) {
      assert.equal(targetsPtr % 4, 0);
      const wire = new DataView(memory.buffer, targetsPtr, count * 4);
      const nodes = [];
      for (let i = 0; i < count; i++) nodes.push(wire.getUint32(i * 4, true));
      state.calls.push({
        format,
        section,
        nodes,
        document: [...new Uint8Array(memory.buffer, ptr, length)],
      });
      if (state.nativeError) throw state.nativeError;
      return state.fail ? 0 : 1;
    },
    table_file_delete_ptr() {
      state.ptrReads++;
      return state.outputPtr;
    },
    table_file_delete_len: () => state.outputLen,
    table_file_delete_free() {
      state.outputFrees++;
      if (state.freeError) throw state.freeError;
    },
  };
  return { wasm, state, memory, instantiate: async () => ({ exports: wasm }) };
}

test('형식별 코드·실제 TABLE 원값·LE32 count를 전송하고 소유 출력만 반환한다', async () => {
  const f = fixture();
  const api = await createTableDeleter(module, f);
  try {
    for (const [format, code] of [
      ['hwp5', 1],
      ['hwpx', 2],
    ]) {
      const result = api.delete(input(), { ...target(), format });
      assert.deepEqual(f.state.calls.at(-1), {
        format: code,
        section: 0,
        nodes: [20, 99],
        document: [1, 2, 3],
      });
      assert.deepEqual([...result], [80, 75, 3]);
      new Uint8Array(f.memory.buffer, 128, 3).fill(9);
      assert.deepEqual([...result], [80, 75, 3]);
      new Uint8Array(f.memory.buffer, 128, 3).set([80, 75, 3]);
    }
    assert.equal(f.state.outputFrees, 2);
    assert.equal(f.state.frees.length, 4);
  } finally {
    api.close();
  }
});

test('구형/다른 ABI와 누락 함수는 호출 전 거부한다', async () => {
  for (const name of [
    'table_file_delete',
    'table_file_delete_ptr',
    'table_file_delete_len',
    'table_file_delete_free',
  ]) {
    const f = fixture();
    delete f.wasm[name];
    await assert.rejects(createTableDeleter(module, f), /AbiUnavailable/);
    assert.equal(f.state.calls.length, 0);
  }
  const f = fixture();
  f.wasm.hwpjs_abi_version = () => ABI_VERSION + 1;
  await assert.rejects(createTableDeleter(module, f), /AbiVersionMismatch/);
});

test('중복·빈값·희소·getter·한도 초과 노드를 할당 전에 거부한다', async () => {
  const f = fixture();
  const api = await createTableDeleter(module, f);
  const sparse = [];
  sparse.length = 1;
  let reads = 0;
  const getter = [];
  Object.defineProperty(getter, '0', {
    get() {
      reads++;
      return 20;
    },
  });
  try {
    for (const tableNodes of [
      [],
      sparse,
      getter,
      [20, 20],
      [-1],
      [-0],
      [NaN],
      [0x100000000],
      Array(4097).fill(1),
    ])
      assert.throws(() => api.delete(input(), { ...target(), tableNodes }));
    assert.throws(() => api.delete(input(), { ...target(), section: -0 }));
    assert.throws(() => api.delete(input(), { ...target(), format: 'pdf' }));
    assert.equal(reads, 0);
    assert.equal(f.state.allocations, 0);
    assert.equal(f.state.calls.length, 0);
    api.delete(input(), { ...target(), tableNodes: Array.from({ length: 4096 }, (_, i) => i) });
    assert.equal(f.state.calls[0].nodes.length, 4096);
  } finally {
    api.close();
  }
});

test('브랜드·부분뷰·공유 버퍼·파일 예산을 검증하고 사용자 iterator를 쓰지 않는다', async () => {
  const f = fixture();
  const api = await createTableDeleter(module, f);
  class Bytes extends Uint8Array {
    [Symbol.iterator]() {
      throw new Error('사용자 iterator');
    }
    slice() {
      throw new Error('사용자 slice');
    }
  }
  try {
    api.delete(new Bytes([9, 1, 2, 9]).subarray(1, 3), target());
    assert.deepEqual(f.state.calls[0].document, [1, 2]);
    for (const value of [
      new Uint8Array(),
      new Uint8Array(new SharedArrayBuffer(1)),
      new Proxy(input(), {}),
      new Uint8Array(64 * 1024 * 1024 + 1),
    ])
      assert.throws(() => api.delete(value, target()));
    assert.equal(f.state.calls.length, 1);
  } finally {
    api.close();
  }
});

test('OOM과 실패 뒤 낡은 출력은 읽지 않고 소유한 입력·출력만 반환한다', async () => {
  for (const oomAt of [1, 2]) {
    const f = fixture();
    f.state.oomAt = oomAt;
    const api = await createTableDeleter(module, f);
    assert.throws(() => api.delete(input(), target()), /OutOfMemory/);
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.ptrReads, 0);
    assert.equal(f.state.frees.length, oomAt - 1);
    assert.equal(f.state.outputFrees, 1);
    api.close();
  }
  const f = fixture();
  const api = await createTableDeleter(module, f);
  try {
    f.state.fail = true;
    assert.throws(() => api.delete(input(), target()), /TableDeletionFailed/);
    assert.equal(f.state.ptrReads, 0);
    assert.equal(f.state.frees.length, 2);
    f.state.fail = false;
    assert.deepEqual([...api.delete(input(), target())], [80, 75, 3]);
  } finally {
    api.close();
  }
});

test('출력 범위·64MiB 한도와 중복 close·종료 뒤 호출을 검사한다', async () => {
  const f = fixture();
  f.memory.grow(1021);
  const api = await createTableDeleter(module, f);
  for (const [pointer, length] of [
    [0, 3],
    [128, 0],
    [128, 64 * 1024 * 1024 + 1],
    [f.memory.buffer.byteLength, 1],
  ]) {
    f.state.outputPtr = pointer;
    f.state.outputLen = length;
    assert.throws(() => api.delete(input(), target()), /InvalidTableDeletionOutput/);
  }
  api.close();
  const count = f.state.outputFrees;
  api.close();
  assert.equal(f.state.outputFrees, count);
  assert.throws(() => api.delete(input(), target()), /Closed/);
});

test('주 실패와 입력/출력 정리 실패를 모두 보존한다', async () => {
  const f = fixture();
  const api = await createTableDeleter(module, f);
  const primary = new Error('Native 실패'),
    inputFree = new Error('입력 free 실패'),
    outputFree = new Error('출력 free 실패');
  f.state.nativeError = primary;
  f.state.inputFreeError = inputFree;
  f.state.freeError = outputFree;
  assert.throws(
    () => api.delete(input(), target()),
    (error) => {
      assert(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primary, inputFree, inputFree, outputFree]);
      return true;
    },
  );
  f.state.freeError = null;
  api.close();
});

test('생성 호출마다 독립 인스턴스를 만들며 요청 accessor를 실행하지 않는다', async () => {
  const left = fixture(),
    right = fixture();
  let instances = 0;
  const instantiate = async () => ({ exports: ++instances === 1 ? left.wasm : right.wasm });
  const a = await createTableDeleter(module, { instantiate }),
    b = await createTableDeleter(module, { instantiate });
  try {
    let reads = 0;
    const value = {
      ...target(),
      get tableNodes() {
        reads++;
        return [20];
      },
    };
    assert.throws(() => a.delete(input(), value));
    assert.equal(reads, 0);
    a.delete(input(), target());
    a.close();
    b.delete(input(), target());
    assert.equal(right.state.calls.length, 1);
    assert.equal(instances, 2);
  } finally {
    a.close();
    b.close();
  }
});
