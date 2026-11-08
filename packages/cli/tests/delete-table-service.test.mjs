import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deleteDocumentTable } from '../src/delete-table.ts';
import { buildObjectReference } from '../src/object-reference.ts';

// 형식 판별만 위한 합성 헤더입니다. 실제 문서/Native 변환 증거가 아닙니다.
const bytes = (format = 'hwp5') =>
  format === 'hwp5'
    ? new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    : new Uint8Array([80, 75, 3, 4]);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const ref = (format = 'hwp5', changes = {}) =>
  buildObjectReference({
    format,
    sourceSha256: sha(bytes(format)),
    section: 0,
    kind: 'table',
    node: 20,
    ...changes,
  });
function table(format = 'hwp5', node = 20) {
  return {
    id: `논리ID-${node + 900}`,
    type: 'table',
    reference: ref(format, { node }),
    source: { section: 0, tableNode: node },
    rows: 1,
    columns: 1,
    cells: [],
  };
}
function model(format = 'hwp5') {
  return {
    version: 1,
    format,
    sourceSha256: sha(bytes(format)),
    sections: [
      {
        id: 's0',
        source: { section: 0 },
        header: { definitions: [] },
        body: [table(format)],
        footer: { definitions: [] },
      },
    ],
    unplaced: [],
  };
}
function fixture(format = 'hwp5', options = {}) {
  const state = { opens: [], observations: [], creates: [], deletes: [], closed: [] };
  const close = (name) => {
    state.closed.push(name);
    if (options.closeErrors?.[name]) throw options.closeErrors[name];
    return options.closeHook?.(name);
  };
  const document = {
    format: options.documentFormat ?? format,
    sourceSha256: options.documentSha ?? sha(bytes(format)),
    sectionCount: 1,
    sdk: {
      save() {
        throw new Error('읽기 SDK writer 사용 금지');
      },
    },
    close: () => close('document'),
  };
  return {
    state,
    model: options.model ?? model(format),
    input: { bytes: bytes(format), wasm: new Uint8Array([0, 97]), reference: ref(format) },
    deps: {
      async openDocument(input) {
        state.opens.push(input);
        if (options.openGate) await options.openGate;
        if (options.openError) throw options.openError;
        return document;
      },
      async readDocumentModel(input) {
        state.observations.push(input);
        if (options.modelError) throw options.modelError;
        return options.model ?? model(format);
      },
      async createDeleter(wasm) {
        state.creates.push(wasm);
        if (options.createError) throw options.createError;
        return {
          delete(input, target) {
            state.deletes.push({ input: new Uint8Array(input), target });
            if (Object.hasOwn(options, 'deleteError')) throw options.deleteError;
            return options.output ?? bytes(format);
          },
          close: () => close('deleter'),
        };
      },
    },
  };
}

test('두 형식의 현재 모델에서 실제 TABLE 원값을 선택하고 새 파일 상태를 반환한다', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const f = fixture(format);
    const result = await deleteDocumentTable(f.input, f.deps);
    assert.deepEqual(f.state.deletes, [
      { input: bytes(format), target: { format, section: 0, tableNodes: [20] } },
    ]);
    assert.deepEqual(result, {
      format,
      sourceSha256: sha(bytes(format)),
      bytes: bytes(format),
      layoutRequiresReflow: true,
      previewStale: true,
    });
    assert.deepEqual(f.input.bytes, bytes(format));
    assert.deepEqual(f.state.closed, ['deleter', 'document']);
  }
});

test('낡은 SHA·다른 kind·서명 형식 불일치는 열기 전에 거부한다', async () => {
  for (const reference of [
    ref('hwp5', { sourceSha256: '0'.repeat(64) }),
    ref('hwp5', { kind: 'image' }),
    ref('hwpx'),
  ]) {
    const f = fixture();
    f.input.reference = reference;
    await assert.rejects(deleteDocumentTable(f.input, f.deps));
    assert.equal(f.state.opens.length, 0);
    assert.equal(f.state.creates.length, 0);
  }
});

test('Native 형식·SHA·선택 구역 불일치 시 읽기 문서만 닫는다', async () => {
  for (const options of [{ documentFormat: 'hwpx' }, { documentSha: '0'.repeat(64) }]) {
    const f = fixture('hwp5', options);
    await assert.rejects(deleteDocumentTable(f.input, f.deps));
    assert.equal(f.state.observations.length, 0);
    assert.deepEqual(f.state.closed, ['document']);
  }
  const f = fixture();
  f.input.reference = ref('hwp5', { section: 1 });
  await assert.rejects(deleteDocumentTable(f.input, f.deps));
  assert.equal(f.state.creates.length, 0);
});

test('모델 SHA·membership·TABLE source 불일치와 논리 ID 사칭을 거부한다', async () => {
  const changes = [
    (m) => {
      m.sourceSha256 = '0'.repeat(64);
    },
    (m) => {
      m.sections[0].body = [];
    },
    (m) => {
      m.sections[0].body[0].reference = ref('hwp5', { node: 19 });
    },
    (m) => {
      m.sections[0].body[0].source.tableNode = 19;
    },
    (m) => {
      delete m.sections[0].body[0].source;
    },
    (m) => {
      m.sections[0].body[0].type = 'image';
    },
  ];
  for (const change of changes) {
    const m = model();
    change(m);
    const f = fixture('hwp5', { model: m });
    await assert.rejects(deleteDocumentTable(f.input, f.deps));
    assert.equal(f.state.creates.length, 0);
    assert.equal(f.state.deletes.length, 0);
    assert.deepEqual(f.state.closed, ['document']);
  }
});

test('중첩·머리말·미배치 표도 관측한 블록만 순회하고 큰 기하를 확장하지 않는다', async () => {
  for (const placement of ['nested', 'header', 'unplaced']) {
    const m = model(),
      selected = m.sections[0].body.pop();
    selected.rows = 0xffffffff;
    selected.columns = 0xffffffff;
    if (placement === 'nested') {
      const outer = table('hwp5', 99);
      outer.cells.push({ blocks: [selected] });
      m.sections[0].body.push(outer);
    } else if (placement === 'header')
      m.sections[0].header.definitions.push({ blocks: [selected] });
    else m.unplaced.push({ block: selected });
    const f = fixture('hwp5', { model: m });
    await deleteDocumentTable(f.input, f.deps);
    assert.deepEqual(f.state.deletes[0].target.tableNodes, [20]);
  }
});

test('중복 참조·블록·ID·순환을 삭제 인스턴스 생성 전에 거부한다', async () => {
  for (const kind of ['reference', 'block', 'id', 'cycle']) {
    const m = model(),
      first = m.sections[0].body[0];
    if (kind === 'reference') m.sections[0].body.push({ ...first, id: '다른ID' });
    if (kind === 'block') m.sections[0].body.push(first);
    if (kind === 'id') m.sections[0].body.push({ ...table('hwp5', 21), id: first.id });
    if (kind === 'cycle') first.cells.push({ blocks: [first] });
    const f = fixture('hwp5', { model: m });
    await assert.rejects(deleteDocumentTable(f.input, f.deps));
    assert.equal(f.state.creates.length, 0);
  }
});

test('첫 await 전 원문과 WASM을 캡처하고 관측 측 변조도 writer에 전달하지 않는다', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const f = fixture('hwp5', { openGate: gate });
  const open = f.deps.openDocument;
  f.deps.openDocument = async (input) => {
    const result = await open(input);
    input.bytes.fill(7);
    input.wasm.fill(7);
    return result;
  };
  const pending = deleteDocumentTable(f.input, f.deps);
  f.input.bytes.fill(9);
  f.input.wasm.fill(9);
  release();
  await pending;
  assert.deepEqual(f.state.deletes[0].input, bytes());
  assert.deepEqual(f.state.creates[0], new Uint8Array([0, 97]));
});

test('공유 버퍼·Proxy·accessor를 거부하고 subclass 복사 hook은 호출하지 않는다', async () => {
  for (const field of ['bytes', 'wasm'])
    for (const value of [new Uint8Array(new SharedArrayBuffer(1)), new Proxy(bytes(), {})]) {
      const f = fixture();
      f.input[field] = value;
      await assert.rejects(deleteDocumentTable(f.input, f.deps));
      assert.equal(f.state.opens.length, 0);
    }
  let reads = 0;
  const f = fixture();
  Object.defineProperty(f.input, 'reference', {
    get() {
      reads++;
      return ref();
    },
  });
  await assert.rejects(deleteDocumentTable(f.input, f.deps));
  assert.equal(reads, 0);
  class Hostile extends Uint8Array {
    [Symbol.iterator]() {
      throw Error('iterator');
    }
    slice() {
      throw Error('slice');
    }
  }
  const good = fixture();
  good.input.bytes = new Hostile(bytes());
  await deleteDocumentTable(good.input, good.deps);
  assert.equal(good.state.deletes.length, 1);
});

test('구형 ABI·모델 실패·변환 실패와 잘못된 출력에서 역순으로 정확히 한 번 닫는다', async () => {
  const failure = new Error('TableDeletionAbiUnavailable');
  for (const [options, closed] of [
    [{ openError: failure }, []],
    [{ modelError: failure }, ['document']],
    [{ createError: failure }, ['document']],
    [{ deleteError: failure }, ['deleter', 'document']],
  ]) {
    const f = fixture('hwp5', options);
    await assert.rejects(deleteDocumentTable(f.input, f.deps), (error) => error === failure);
    assert.deepEqual(f.state.closed, closed);
  }
  for (const output of [
    new Uint8Array(),
    bytes('hwpx'),
    new Uint8Array(new SharedArrayBuffer(8)),
  ]) {
    const f = fixture('hwp5', { output });
    await assert.rejects(deleteDocumentTable(f.input, f.deps));
    assert.deepEqual(f.state.closed, ['deleter', 'document']);
  }
});

test('주 실패와 모든 close 실패를 보존하고 비동기 close를 기다린다', async () => {
  const primary = new Error('변환 실패'),
    deleterError = new Error('변환기 정리 실패'),
    docError = new Error('문서 정리 실패');
  const f = fixture('hwp5', {
    deleteError: primary,
    closeErrors: { deleter: deleterError, document: docError },
  });
  await assert.rejects(deleteDocumentTable(f.input, f.deps), (error) => {
    assert(error instanceof AggregateError);
    assert.deepEqual(error.errors, [primary, deleterError, docError]);
    return true;
  });
  assert.deepEqual(f.state.closed, ['deleter', 'document']);
  let entered,
    release,
    finished = false;
  const enteredPromise = new Promise((resolve) => {
    entered = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const good = fixture('hwpx', {
    closeHook(name) {
      if (name === 'deleter') {
        entered();
        return gate;
      }
    },
  });
  const pending = deleteDocumentTable(good.input, good.deps).then(() => {
    finished = true;
  });
  await enteredPromise;
  assert.equal(finished, false);
  assert.deepEqual(good.state.closed, ['deleter']);
  release();
  await pending;
  assert.deepEqual(good.state.closed, ['deleter', 'document']);
});
