import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureReplacer } from '../../js/picture-resource-replacement.mjs';
import { ABI_VERSION, REQUIRED_FUNCTIONS } from '../../js/abi-schema.mjs';

const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
const target = () => ({
  format: 'hwpx',
  section: 0,
  pictureNode: 31,
  bytes: new Uint8Array([9, 8]),
});

function fixture({ old = false } = {}) {
  const memory = new WebAssembly.Memory({ initial: 4 });
  const state = {
    calls: [],
    frees: [],
    outputFrees: 0,
    pointers: 0,
    fail: false,
    length: 3,
    pointer: 128,
  };
  const output = [80, 75, 3];
  new Uint8Array(memory.buffer, 128, 3).set(output);
  const message = new TextEncoder().encode('ReplacementFailed');
  new Uint8Array(memory.buffer, 256, message.length).set(message);
  let allocation = 1024;
  const wasm = Object.fromEntries(REQUIRED_FUNCTIONS.map((name) => [name, () => 0]));
  Object.assign(wasm, {
    memory,
    hwpjs_abi_version: () => ABI_VERSION,
    cfb_alloc(length) {
      const pointer = allocation;
      allocation += length + 8;
      return pointer;
    },
    cfb_free(pointer, length) {
      state.frees.push([pointer, length]);
    },
    cfb_error_ptr: () => 256,
    cfb_error_len: () => message.length,
    picture_file_replace(code, docPtr, docSize, section, node, imgPtr, imgSize) {
      state.calls.push({
        code,
        section,
        node,
        document: [...new Uint8Array(memory.buffer, docPtr, docSize)],
        image: [...new Uint8Array(memory.buffer, imgPtr, imgSize)],
      });
      return state.fail ? 0 : 1;
    },
    picture_file_replace_ptr() {
      state.pointers++;
      return state.pointer;
    },
    picture_file_replace_len: () => state.length,
    picture_file_replace_free() {
      state.outputFrees++;
    },
  });
  if (old) delete wasm.picture_file_replace;
  return { state, memory, wasm, instantiate: async () => ({ exports: wasm }) };
}

test('SDK는 형식별 코드와 선택한 노드·바이트를 한 번 전달하고 결과를 소유한다', async () => {
  const f = fixture();
  const api = await createPictureReplacer(module, f);
  try {
    for (const [format, code] of [
      ['hwp5', 1],
      ['hwpx', 2],
    ]) {
      const result = api.replace(new Uint8Array([1, 2, 3]), { ...target(), format });
      assert.deepEqual([...result], [80, 75, 3]);
      assert.deepEqual(f.state.calls.at(-1), {
        code,
        section: 0,
        node: 31,
        document: [1, 2, 3],
        image: [9, 8],
      });
      new Uint8Array(f.memory.buffer, 128, 3).fill(0);
      assert.deepEqual([...result], [80, 75, 3]);
      new Uint8Array(f.memory.buffer, 128, 3).set([80, 75, 3]);
    }
    assert.equal(f.state.calls.length, 2);
    assert.equal(f.state.frees.length, 4);
  } finally {
    api.close();
  }
});

test('구형 ABI는 교체 호출 전에 명시적으로 거부한다', async () => {
  const f = fixture({ old: true });
  await assert.rejects(createPictureReplacer(module, f), /AbiUnavailable/);
  assert.equal(f.state.calls.length, 0);
});

test('잘못된 형식·노드·입력 예산은 Native 호출 없이 거부한다', async () => {
  const f = fixture();
  const api = await createPictureReplacer(module, f);
  try {
    for (const field of ['section', 'pictureNode'])
      for (const value of [-1, -0, NaN, Infinity, 1.5, '1', 0x100000000])
        assert.throws(() => api.replace(new Uint8Array([1]), { ...target(), [field]: value }));
    assert.throws(() => api.replace(new Uint8Array([1]), { ...target(), format: 'pdf' }));
    assert.throws(() => api.replace(new Uint8Array(), target()));
    assert.throws(() => api.replace(new Uint8Array([1]), { ...target(), bytes: new Uint8Array() }));
    assert.throws(() =>
      api.replace(new Uint8Array([1]), { ...target(), bytes: new Uint8Array(8 * 1024 * 1024 + 1) }),
    );
    assert.throws(() => api.replace(new Uint8Array(64 * 1024 * 1024 + 1), target()));
    assert.equal(f.state.calls.length, 0);
  } finally {
    api.close();
  }
});

test('실패 결과의 낡은 포인터를 읽지 않고 입력과 출력 자원을 반환한다', async () => {
  const f = fixture();
  const api = await createPictureReplacer(module, f);
  try {
    f.state.fail = true;
    assert.throws(() => api.replace(new Uint8Array([1]), target()), /ReplacementFailed/);
    assert.equal(f.state.pointers, 0);
    assert.equal(f.state.outputFrees, 1);
    assert.equal(f.state.frees.length, 2);
    f.state.fail = false;
    assert.deepEqual([...api.replace(new Uint8Array([1]), target())], [80, 75, 3]);
  } finally {
    api.close();
  }
});

test('출력 길이·메모리 범위를 검사하고 close는 멱등이다', async () => {
  const f = fixture();
  // 메모리 범위 오류와 독립적으로 64MiB 출력 예산 초과를 검증합니다.
  f.memory.grow(1025 - 4);
  const api = await createPictureReplacer(module, f);
  for (const [pointer, length] of [
    [128, 0],
    [128, 64 * 1024 * 1024 + 1],
    [-1, 3],
    [f.memory.buffer.byteLength, 1],
  ]) {
    f.state.pointer = pointer;
    f.state.length = length;
    assert.throws(() => api.replace(new Uint8Array([1]), target()));
  }
  api.close();
  const frees = f.state.outputFrees;
  api.close();
  assert.equal(f.state.outputFrees, frees);
  assert.throws(() => api.replace(new Uint8Array([1]), target()), /Closed/);
});

test('typed array subclass의 iterator·slice를 사용하지 않고 실제 부분뷰만 복사한다', async () => {
  const f = fixture();
  const api = await createPictureReplacer(module, f);
  class HostileBytes extends Uint8Array {
    [Symbol.iterator]() {
      throw new Error('사용자 iterator');
    }
    slice() {
      throw new Error('사용자 slice');
    }
  }
  try {
    const source = new HostileBytes([99, 1, 2, 99]);
    api.replace(source.subarray(1, 3), { ...target(), bytes: new HostileBytes([9, 8]) });
    assert.deepEqual(f.state.calls[0].document, [1, 2]);
    assert.deepEqual(f.state.calls[0].image, [9, 8]);
    assert.throws(() => api.replace(new Proxy(new Uint8Array([1]), {}), target()));
    assert.throws(() => api.replace(new Uint8Array(new SharedArrayBuffer(1)), target()));
    assert.throws(() =>
      api.replace(new Uint8Array([1]), {
        ...target(),
        bytes: new Uint8Array(new SharedArrayBuffer(1)),
      }),
    );
    assert.equal(f.state.calls.length, 1);
  } finally {
    api.close();
  }
});
