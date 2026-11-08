import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { replaceDocumentImage } from '../../packages/cli/src/replace-image.ts';
import { buildObjectReference } from '../../packages/cli/src/object-reference.ts';

const sha = (value) => createHash('sha256').update(value).digest('hex');
// 형식 선택용 합성 헤더이며 실제 문서나 Native 파싱 증거가 아닙니다.
const documentBytes = (format = 'hwp5') =>
  format === 'hwp5'
    ? new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    : new Uint8Array([0x50, 0x4b, 3, 4]);
const imageBytes = () => new Uint8Array([9, 8, 7]);
const reference = (format = 'hwp5', changes = {}) =>
  buildObjectReference({
    format,
    sourceSha256: sha(documentBytes(format)),
    section: 0,
    kind: 'image',
    node: 13,
    ...changes,
  });

function fixture(format = 'hwp5', options = {}) {
  const state = { opens: [], inventories: [], creates: [], replacements: [], closed: [] };
  const close = (name) => {
    state.closed.push(name);
    if (options.closeErrors?.[name]) throw options.closeErrors[name];
    return options.closeHook?.(name);
  };
  const inventory = {
    list() {
      if (options.listError) throw options.listError;
      return {
        version: 1,
        format,
        sourceSha256: sha(documentBytes(format)),
        images: options.images ?? [
          {
            id: `${format}:s0:i13`,
            source:
              format === 'hwp5'
                ? { section: 0, pictureNode: 13, recordNode: 37 }
                : { section: 0, pictureNode: 13 },
          },
        ],
      };
    },
    read() {
      throw new Error('원본 이미지 payload 읽기 금지');
    },
    close() {
      return close('inventory');
    },
  };
  const document = {
    format: options.documentFormat ?? format,
    sourceSha256: options.documentSha ?? sha(documentBytes(format)),
    sectionCount: 1,
    sdk: {},
    close() {
      return close('document');
    },
  };
  const replacer = {
    replace(bytes, target) {
      state.replacements.push({ bytes: new Uint8Array(bytes), target });
      if (options.replaceError) throw options.replaceError;
      return options.result ?? documentBytes(format);
    },
    close() {
      return close('replacer');
    },
  };
  const deps = {
    async openDocument(input) {
      state.opens.push(input);
      if (options.openGate) await options.openGate;
      if (options.openError) throw options.openError;
      return document;
    },
    createDocumentImages(input) {
      state.inventories.push(input);
      if (options.inventoryError) throw options.inventoryError;
      return inventory;
    },
    async createReplacer(wasm) {
      state.creates.push(wasm);
      if (options.createError) throw options.createError;
      return replacer;
    },
  };
  return {
    state,
    deps,
    input: {
      bytes: documentBytes(format),
      wasm: new Uint8Array([0, 97]),
      reference: reference(format),
      imageBytes: imageBytes(),
    },
  };
}

function assertClosed(state, names) {
  assert.deepEqual(state.closed, names);
  assert.equal(state.closed.length, names.length);
  for (const name of names) assert.equal(state.closed.filter((value) => value === name).length, 1);
}

test('HWP5 공개 component 참조를 실제 SHAPE_PICTURE recordNode로 변환한다', async () => {
  const f = fixture();
  const result = await replaceDocumentImage(f.input, f.deps);
  assert.equal(f.state.replacements.length, 1);
  assert.deepEqual(f.state.replacements[0].target, {
    format: 'hwp5',
    section: 0,
    pictureNode: 37,
    bytes: imageBytes(),
  });
  assert.deepEqual(result, {
    format: 'hwp5',
    sourceSha256: sha(documentBytes()),
    bytes: documentBytes(),
    imageSha256: sha(imageBytes()),
    previewStale: true,
  });
  assertClosed(f.state, ['replacer', 'inventory', 'document']);
});

test('HWPX는 inventory의 pictureNode를 전달하고 원본 입력을 변경하지 않는다', async () => {
  const f = fixture('hwpx');
  await replaceDocumentImage(f.input, f.deps);
  assert.equal(f.state.replacements[0].target.pictureNode, 13);
  assert.deepEqual(f.input.bytes, documentBytes('hwpx'));
  assert.deepEqual(f.input.imageBytes, imageBytes());
  assertClosed(f.state, ['replacer', 'inventory', 'document']);
});

test('오래된 SHA와 다른 kind 참조는 교체 인스턴스를 만들지 않는다', async () => {
  for (const changes of [{ sourceSha256: '0'.repeat(64) }, { kind: 'table' }]) {
    const f = fixture();
    f.input.reference = reference('hwp5', changes);
    await assert.rejects(replaceDocumentImage(f.input, f.deps));
    assert.equal(f.state.opens.length, 0);
    assert.equal(f.state.creates.length, 0);
    assert.equal(f.state.replacements.length, 0);
  }
});

test('Native 형식·SHA·구역·inventory 회원 불일치를 교체 전에 거부한다', async () => {
  for (const options of [
    { documentFormat: 'hwpx' },
    { documentSha: '0'.repeat(64) },
    { images: [] },
    { images: [{ id: 'hwp5:s0:i13', source: { section: 0, pictureNode: 13 } }] },
    { images: [{ id: 'hwp5:s0:i13', source: { section: 1, pictureNode: 13, recordNode: 37 } }] },
  ]) {
    const f = fixture('hwp5', options);
    await assert.rejects(replaceDocumentImage(f.input, f.deps));
    assert.equal(f.state.replacements.length, 0);
    assert.equal(f.state.creates.length, 0);
    assert.equal(f.state.closed.filter((name) => name === 'document').length, 1);
  }
  const f = fixture();
  f.input.reference = reference('hwp5', { section: 1 });
  await assert.rejects(replaceDocumentImage(f.input, f.deps));
  assert.equal(f.state.creates.length, 0);
});

test('첫 await 전에 문서·이미지·WASM의 소유 스냅샷을 만든다', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture('hwp5', { openGate: gate });
  const result = replaceDocumentImage(f.input, f.deps);
  f.input.bytes.fill(99);
  f.input.imageBytes.fill(99);
  f.input.wasm.fill(99);
  release();
  await result;
  assert.deepEqual(f.state.opens[0].bytes, documentBytes());
  assert.deepEqual(f.state.creates[0], new Uint8Array([0, 97]));
  assert.deepEqual(f.state.replacements[0].bytes, documentBytes());
  assert.deepEqual(f.state.replacements[0].target.bytes, imageBytes());
});

test('공유 버퍼·Proxy 바이트를 거부하고 subclass iterator를 실행하지 않는다', async () => {
  for (const field of ['bytes', 'imageBytes', 'wasm']) {
    for (const invalid of [
      new Uint8Array(new SharedArrayBuffer(1)),
      new Proxy(new Uint8Array([1]), {}),
    ]) {
      const f = fixture();
      f.input[field] = invalid;
      await assert.rejects(replaceDocumentImage(f.input, f.deps));
      assert.equal(f.state.opens.length, 0);
      assert.equal(f.state.replacements.length, 0);
    }
  }
  class HostileBytes extends Uint8Array {
    [Symbol.iterator]() {
      throw new Error('사용자 iterator');
    }
    slice() {
      throw new Error('사용자 slice');
    }
  }
  const f = fixture();
  f.input.bytes = new HostileBytes(documentBytes());
  f.input.imageBytes = new HostileBytes(imageBytes());
  await replaceDocumentImage(f.input, f.deps);
  assert.equal(f.state.replacements.length, 1);
});

test('중간 실패마다 생성된 자원만 정확히 한 번 닫는다', async () => {
  const failure = new Error('합성 실패');
  for (const [field, closed] of [
    ['openError', []],
    ['inventoryError', ['document']],
    ['listError', ['inventory', 'document']],
    ['createError', ['inventory', 'document']],
    ['replaceError', ['replacer', 'inventory', 'document']],
  ]) {
    const f = fixture('hwp5', { [field]: failure });
    await assert.rejects(replaceDocumentImage(f.input, f.deps), (error) => error === failure);
    assertClosed(f.state, closed);
  }
});

test('교체와 정리의 동시 실패를 모두 보존하고 나머지 자원도 닫는다', async () => {
  const primary = new Error('교체 실패');
  const closeErrors = {
    replacer: new Error('교체기 정리 실패'),
    inventory: new Error('목록 정리 실패'),
    document: new Error('문서 정리 실패'),
  };
  const f = fixture('hwp5', { replaceError: primary, closeErrors });
  await assert.rejects(replaceDocumentImage(f.input, f.deps), (error) => {
    assert(error instanceof AggregateError);
    assert.deepEqual(error.errors, [
      primary,
      closeErrors.replacer,
      closeErrors.inventory,
      closeErrors.document,
    ]);
    return true;
  });
  assertClosed(f.state, ['replacer', 'inventory', 'document']);
});

test('비동기 close가 끝나기 전에 성공을 반환하지 않는다', async () => {
  let entered, release;
  const closing = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture('hwp5', {
    closeHook(name) {
      if (name === 'replacer') {
        entered();
        return gate;
      }
    },
  });
  let finished = false;
  const pending = replaceDocumentImage(f.input, f.deps).then((result) => {
    finished = true;
    return result;
  });
  await closing;
  assert.equal(finished, false);
  assert.deepEqual(f.state.closed, ['replacer']);
  release();
  await pending;
  assertClosed(f.state, ['replacer', 'inventory', 'document']);
});

test('서비스 입력 accessor와 상속 필드는 실행하지 않고 거부한다', async () => {
  for (const field of ['bytes', 'wasm', 'reference', 'imageBytes']) {
    const f = fixture();
    let reads = 0;
    Object.defineProperty(f.input, field, {
      get() {
        reads++;
        return '사용자 getter';
      },
    });
    await assert.rejects(replaceDocumentImage(f.input, f.deps));
    assert.equal(reads, 0);
    assert.equal(f.state.opens.length, 0);
  }
  const f = fixture();
  const inherited = Object.create(f.input);
  await assert.rejects(replaceDocumentImage(inherited, f.deps));
  assert.equal(f.state.opens.length, 0);
});
