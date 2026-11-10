import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { editDocumentTableGrid } from '../src/edit-table-grid.ts';
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
  const state = { opens: [], observations: [], creates: [], edits: [], closed: [] };
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
    input: {
      bytes: bytes(format),
      wasm: new Uint8Array([0, 97]),
      reference: ref(format),
      action: 'insert-row',
      index: 1,
      expectedRows: 1,
      expectedColumns: 1,
    },
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
      async createGridApi(wasm) {
        state.creates.push(wasm);
        if (options.createError) throw options.createError;
        return {
          edit(input, target) {
            state.edits.push({ input: new Uint8Array(input), target });
            if (Object.hasOwn(options, 'editError')) throw options.editError;
            return options.output ?? bytes(format);
          },
          close: () => close('editor'),
        };
      },
    },
  };
}

test('두 형식의 현재 모델에서 실제 TABLE 원값을 선택하고 새 파일 상태를 반환한다', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const f = fixture(format);
    const result = await editDocumentTableGrid(f.input, f.deps);
    assert.deepEqual(f.state.edits, [
      {
        input: bytes(format),
        target: {
          format,
          section: 0,
          tableNode: 20,
          expectedRows: 1,
          expectedColumns: 1,
          action: 'insert-row',
          index: 1,
        },
      },
    ]);
    assert.deepEqual(result, {
      format,
      sourceSha256: sha(bytes(format)),
      bytes: bytes(format),
      layoutRequiresReflow: true,
      previewStale: true,
    });
    assert.deepEqual(f.input.bytes, bytes(format));
    assert.deepEqual(f.state.closed, ['editor', 'document']);
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
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.equal(f.state.opens.length, 0);
    assert.equal(f.state.creates.length, 0);
  }
});

test('Native 형식·SHA·선택 구역 불일치 시 읽기 문서만 닫는다', async () => {
  for (const options of [{ documentFormat: 'hwpx' }, { documentSha: '0'.repeat(64) }]) {
    const f = fixture('hwp5', options);
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.equal(f.state.observations.length, 0);
    assert.deepEqual(f.state.closed, ['document']);
  }
  const f = fixture();
  f.input.reference = ref('hwp5', { section: 1 });
  await assert.rejects(editDocumentTableGrid(f.input, f.deps));
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
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.equal(f.state.creates.length, 0);
    assert.equal(f.state.edits.length, 0);
    assert.deepEqual(f.state.closed, ['document']);
  }
});

test('중첩·머리말·미배치 표도 관측한 블록만 순회하고 기하를 확장하지 않는다', async () => {
  for (const placement of ['nested', 'header', 'unplaced']) {
    const m = model(),
      selected = m.sections[0].body.pop();

    if (placement === 'nested') {
      const outer = table('hwp5', 99);
      outer.cells.push({ blocks: [selected] });
      m.sections[0].body.push(outer);
    } else if (placement === 'header')
      m.sections[0].header.definitions.push({ blocks: [selected] });
    else m.unplaced.push({ block: selected });
    const f = fixture('hwp5', { model: m });
    await editDocumentTableGrid(f.input, f.deps);
    assert.deepEqual(f.state.edits[0].target.tableNode, 20);
  }
});

test('중복 참조·블록·ID·순환을 grid 편집 인스턴스 생성 전에 거부한다', async () => {
  for (const kind of ['reference', 'block', 'id', 'cycle']) {
    const m = model(),
      first = m.sections[0].body[0];
    if (kind === 'reference') m.sections[0].body.push({ ...first, id: '다른ID' });
    if (kind === 'block') m.sections[0].body.push(first);
    if (kind === 'id') m.sections[0].body.push({ ...table('hwp5', 21), id: first.id });
    if (kind === 'cycle') first.cells.push({ blocks: [first] });
    const f = fixture('hwp5', { model: m });
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
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
  const pending = editDocumentTableGrid(f.input, f.deps);
  f.input.bytes.fill(9);
  f.input.wasm.fill(9);
  release();
  await pending;
  assert.deepEqual(f.state.edits[0].input, bytes());
  assert.deepEqual(f.state.creates[0], new Uint8Array([0, 97]));
});

test('공유 버퍼·Proxy·accessor를 거부하고 subclass 복사 hook은 호출하지 않는다', async () => {
  for (const field of ['bytes', 'wasm'])
    for (const value of [new Uint8Array(new SharedArrayBuffer(1)), new Proxy(bytes(), {})]) {
      const f = fixture();
      f.input[field] = value;
      await assert.rejects(editDocumentTableGrid(f.input, f.deps));
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
  await assert.rejects(editDocumentTableGrid(f.input, f.deps));
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
  await editDocumentTableGrid(good.input, good.deps);
  assert.equal(good.state.edits.length, 1);
});

test('구형 ABI·모델 실패·변환 실패와 잘못된 출력에서 역순으로 정확히 한 번 닫는다', async () => {
  const failure = new Error('TableFileGridAbiUnavailable');
  for (const [options, closed] of [
    [{ openError: failure }, []],
    [{ modelError: failure }, ['document']],
    [{ createError: failure }, ['document']],
    [{ editError: failure }, ['editor', 'document']],
  ]) {
    const f = fixture('hwp5', options);
    await assert.rejects(editDocumentTableGrid(f.input, f.deps), (error) => error === failure);
    assert.deepEqual(f.state.closed, closed);
  }
  for (const output of [
    new Uint8Array(),
    bytes('hwpx'),
    new Uint8Array(new SharedArrayBuffer(8)),
  ]) {
    const f = fixture('hwp5', { output });
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.deepEqual(f.state.closed, ['editor', 'document']);
  }
});

test('주 실패와 모든 close 실패를 보존하고 비동기 close를 기다린다', async () => {
  const primary = new Error('변환 실패'),
    editorError = new Error('변환기 정리 실패'),
    docError = new Error('문서 정리 실패');
  const f = fixture('hwp5', {
    editError: primary,
    closeErrors: { editor: editorError, document: docError },
  });
  await assert.rejects(editDocumentTableGrid(f.input, f.deps), (error) => {
    assert(error instanceof AggregateError);
    assert.deepEqual(error.errors, [primary, editorError, docError]);
    return true;
  });
  assert.deepEqual(f.state.closed, ['editor', 'document']);
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
      if (name === 'editor') {
        entered();
        return gate;
      }
    },
  });
  const pending = editDocumentTableGrid(good.input, good.deps).then(() => {
    finished = true;
  });
  await enteredPromise;
  assert.equal(finished, false);
  assert.deepEqual(good.state.closed, ['editor']);
  release();
  await pending;
  assert.deepEqual(good.state.closed, ['editor', 'document']);
});

test('모든 동작과 경계 index 및 layout을 그대로 전달한다', async () => {
  for (const format of ['hwp5', 'hwpx'])
    for (const action of ['insert-row', 'delete-row', 'insert-column', 'delete-column'])
      for (const index of [0, action.startsWith('insert-') ? 2 : 1])
        for (const layout of [undefined, 'spec6', ...(format === 'hwp5' ? ['observed8'] : [])]) {
          const m = model(format);
          Object.assign(m.sections[0].body[0], { rows: 2, columns: 2 });
          const f = fixture(format, { model: m });
          Object.assign(f.input, { action, index, expectedRows: 2, expectedColumns: 2 });
          if (layout !== undefined) f.input.layout = layout;
          await editDocumentTableGrid(f.input, f.deps);
          assert.deepEqual(f.state.edits[0].target, {
            format,
            section: 0,
            tableNode: 20,
            expectedRows: 2,
            expectedColumns: 2,
            action,
            index,
            ...(layout === undefined ? {} : { layout }),
          });
        }
});

test('필수 own 필드·추가 필드·숫자·layout·삭제 마지막 축을 열기 전에 검증한다', async () => {
  const mutations = [
    (x) => {
      x.extra = true;
    },
    (x) => {
      x[Symbol('extra')] = true;
    },
    (x) => {
      x.layout = undefined;
    },
    (x) => {
      x.layout = 'guess';
    },
    (x) => {
      x.action = 'insert';
    },
    (x) => {
      x.index = -0;
    },
    (x) => {
      x.index = -1;
    },
    (x) => {
      x.index = 2;
    },
    (x) => {
      x.index = 0.5;
    },
    (x) => {
      x.index = NaN;
    },
    (x) => {
      x.expectedRows = 0;
    },
    (x) => {
      x.expectedColumns = '1';
    },
    (x) => {
      x.expectedColumns = 0x100000000;
    },
    (x) => {
      x.action = 'delete-row';
      x.index = 0;
    },
    (x) => {
      x.action = 'delete-column';
      x.index = 0;
    },
    (x) => {
      x.expectedRows = 0xffffffff;
      x.index = 0;
    },
  ];
  for (const key of [
    'bytes',
    'wasm',
    'reference',
    'action',
    'index',
    'expectedRows',
    'expectedColumns',
  ]) {
    mutations.push((x) => {
      delete x[key];
    });
    mutations.push((x) => {
      const value = x[key];
      delete x[key];
      Object.setPrototypeOf(x, { [key]: value });
    });
    mutations.push((x) => {
      Object.defineProperty(x, key, {
        get() {
          return assert.fail('getter 실행');
        },
      });
    });
  }
  mutations.push((x) => {
    Object.defineProperty(x, 'layout', {
      get() {
        return assert.fail('layout getter');
      },
    });
  });
  for (const mutate of mutations) {
    const f = fixture();
    mutate(f.input);
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.equal(f.state.opens.length, 0);
  }
  const f = fixture('hwpx');
  f.input.layout = 'observed8';
  await assert.rejects(editDocumentTableGrid(f.input, f.deps), /InvalidTableGridLayout/);
  assert.equal(f.state.opens.length, 0);
});

test('관측 행·열 불일치·부재·accessor는 factory 생성 전에 거부한다', async () => {
  for (const key of ['rows', 'columns'])
    for (const value of [undefined, null, 0, -0, 2, '1', NaN, Infinity, 0.5]) {
      const m = model();
      m.sections[0].body[0][key] = value;
      const f = fixture('hwp5', { model: m });
      await assert.rejects(editDocumentTableGrid(f.input, f.deps), /TableGridDimensionsMismatch/);
      assert.equal(f.state.creates.length, 0);
      assert.deepEqual(f.state.closed, ['document']);
    }
  for (const key of ['rows', 'columns']) {
    const m = model();
    Object.defineProperty(m.sections[0].body[0], key, {
      get() {
        return assert.fail('관측 getter');
      },
    });
    const f = fixture('hwp5', { model: m });
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.equal(f.state.creates.length, 0);
  }
});

test('잘못된 관측 배열·중복 구역·다른 구역·잘못된 비선택 블록도 거부한다', async () => {
  const mutations = [
    (m) => {
      m.sections[0].body = [];
      m.sections[0].body.length = 1;
    },
    (m) => {
      Object.defineProperty(m.sections[0].body, '0', {
        get() {
          return assert.fail('array getter');
        },
      });
    },
    (m) => {
      m.sections.push({ ...m.sections[0], body: [] });
    },
    (m) => {
      m.sections[0].body.push({ id: 'bad', type: 'unsupported' });
    },
    (m) => {
      m.sections[0].body[0].reference = ref('hwp5', { section: 1 });
    },
    (m) => {
      Object.defineProperty(m.sections[0].body[0], 'source', {
        get() {
          return assert.fail('source getter');
        },
      });
    },
  ];
  for (const mutate of mutations) {
    const m = model();
    mutate(m);
    const f = fixture('hwp5', { model: m });
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.equal(f.state.creates.length, 0);
    assert.deepEqual(f.state.closed, ['document']);
  }
});

test('문서·factory·edit accessor를 실행하지 않고 획득한 자원만 정리한다', async () => {
  for (const key of ['format', 'sourceSha256', 'sectionCount', 'sdk']) {
    const f = fixture();
    const open = f.deps.openDocument;
    f.deps.openDocument = async (input) => {
      const doc = await open(input);
      Object.defineProperty(doc, key, {
        get() {
          return assert.fail('document getter');
        },
      });
      return doc;
    };
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.deepEqual(f.state.closed, ['document']);
  }
  for (const key of ['edit', 'close']) {
    const f = fixture();
    const create = f.deps.createGridApi;
    f.deps.createGridApi = async (wasm) => {
      const editor = await create(wasm);
      Object.defineProperty(editor, key, {
        get() {
          return assert.fail('editor getter');
        },
      });
      return editor;
    };
    await assert.rejects(editDocumentTableGrid(f.input, f.deps));
    assert.deepEqual(f.state.closed, key === 'edit' ? ['editor', 'document'] : ['document']);
  }
});

test('실제 grid factory는 구형 ABI를 거부하고 관측 문서를 닫는다', async () => {
  const { createSourceTableGridFileApi } = await import('../../../js/table-file-grid.mjs');
  const f = fixture();
  f.deps.createGridApi = () =>
    createSourceTableGridFileApi(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), {
      instantiate: async () => ({ exports: {} }),
    });
  await assert.rejects(editDocumentTableGrid(f.input, f.deps), /TableFileGridAbiUnavailable/);
  assert.deepEqual(f.state.closed, ['document']);
});

test('편집 중 재진입과 호출자 필드 변조가 다른 호출의 좌표·수명에 섞이지 않는다', async () => {
  const first = fixture(),
    second = fixture('hwpx');
  let nested;
  const create = first.deps.createGridApi;
  first.deps.createGridApi = async (wasm) => {
    const editor = await create(wasm),
      edit = editor.edit;
    editor.edit = function (source, target) {
      nested = editDocumentTableGrid(second.input, second.deps);
      return edit.call(this, source, target);
    };
    return editor;
  };
  const pending = editDocumentTableGrid(first.input, first.deps);
  Object.assign(first.input, {
    reference: ref('hwp5', { node: 500 }),
    index: 99,
    expectedRows: 99,
    layout: 'guess',
    action: 'delete-column',
  });
  const result = await pending;
  await nested;
  assert.equal(result.format, 'hwp5');
  assert.equal(first.state.edits[0].target.tableNode, 20);
  assert.equal(first.state.edits[0].target.index, 1);
  assert.equal(first.state.edits[0].target.action, 'insert-row');
  assert.deepEqual(first.state.closed, ['editor', 'document']);
  assert.deepEqual(second.state.closed, ['editor', 'document']);
});

test('출력은 close의 변조와 별개로 소유하고 성공 뒤 정리 실패도 전달한다', async () => {
  const output = bytes(),
    failure = new Error('정리 실패');
  const f = fixture('hwp5', {
    output,
    closeHook() {
      output.fill(7);
    },
  });
  const result = await editDocumentTableGrid(f.input, f.deps);
  assert.deepEqual(result.bytes, bytes());
  assert.notEqual(result.bytes, output);
  const bad = fixture('hwp5', { closeErrors: { editor: failure } });
  await assert.rejects(editDocumentTableGrid(bad.input, bad.deps), (error) => {
    assert(error instanceof AggregateError);
    assert.deepEqual(error.errors, [failure]);
    return true;
  });
  assert.deepEqual(bad.state.closed, ['editor', 'document']);
  const primitive = fixture('hwp5', { editError: undefined, closeErrors: { document: failure } });
  await assert.rejects(editDocumentTableGrid(primitive.input, primitive.deps), (error) => {
    assert.deepEqual(error.errors, [undefined, failure]);
    return true;
  });
});

test('현재 Document의 구역 수·SDK가 잘못되면 관측 전에 닫는다', async () => {
  for (const patch of [
    { sectionCount: 0 },
    { sectionCount: -0 },
    { sectionCount: 1.5 },
    { sectionCount: 4097 },
    { sdk: null },
    { sdk: [] },
  ]) {
    const f = fixture();
    const open = f.deps.openDocument;
    f.deps.openDocument = async (input) => Object.assign(await open(input), patch);
    await assert.rejects(editDocumentTableGrid(f.input, f.deps), /InvalidTableGridDocument/);
    assert.equal(f.state.observations.length, 0);
    assert.equal(f.state.creates.length, 0);
    assert.deepEqual(f.state.closed, ['document']);
  }
});
