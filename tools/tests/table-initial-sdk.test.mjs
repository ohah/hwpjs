import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  captureTableInitialTexts,
  captureTableTextRequest,
  encodeTableTextRequest,
  TABLE_TEXT_REQUEST_LIMIT,
} from '../../js/table-initial-texts.mjs';
import { createHwp5TableCreationApi } from '../../js/hwp5-table-creation.mjs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { ABI_VERSION, REQUIRED_FUNCTIONS } from '../../js/abi-schema.mjs';

const decode = (bytes) => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
const grid = () => [
  ['누리😀', '<&'],
  ['', '끝'],
];
const request = () => ({ rows: 2, columns: 2, cell_texts: grid() });
const options = () => ({
  rows: 2,
  columns: 2,
  width: 100,
  rowHeight: 20,
  resources: { paragraph: 1, character: 1, style: 0, border_fill: 1 },
});

function sparse(length) {
  const array = [];
  array.length = length;
  return array;
}

function hwp5(modern = true) {
  const calls = [];
  const state = { transfers: 0, fail: false };
  let pending;
  const wasm = {
    hwp5_edit_insert_table: () => calls.push({ kind: '빈표', value: decode(pending) }),
  };
  if (modern)
    wasm.hwp5_edit_insert_table_with_texts = () =>
      calls.push({ kind: '초기본문', value: decode(pending) });
  const api = createHwp5TableCreationApi({
    wasm,
    check() {},
    u32: (value) => value,
    memory: {
      withBytes(bytes, action) {
        state.transfers++;
        pending = bytes;
        return action(1, bytes.length);
      },
    },
    output(action) {
      action();
      if (state.fail) throw new Error('합성 ABI 실패');
      return { bytes: new TextEncoder().encode('{"identity":"1"}') };
    },
  });
  return { api, calls, state };
}

async function hwpx(modern = true) {
  const calls = [];
  const state = { allocations: 0, frees: 0, outputFrees: 0, fail: false };
  const memory = new WebAssembly.Memory({ initial: 80 });
  const response = new TextEncoder().encode('"1"');
  new Uint8Array(memory.buffer, 16, response.length).set(response);
  const wasm = Object.fromEntries(REQUIRED_FUNCTIONS.map((name) => [name, () => 0]));
  Object.assign(wasm, {
    memory,
    hwpjs_abi_version: () => ABI_VERSION,
    cfb_alloc() {
      state.allocations++;
      return 1024;
    },
    cfb_free() {
      state.frees++;
    },
    hwpx_edit_open() {},
    hwpx_edit_close() {},
    hwpx_edit_section_count() {},
    hwpx_edit_can_edit() {},
    hwpx_edit_splice() {},
    hwpx_edit_save() {},
    hwpx_edit_output_ptr: () => 16,
    hwpx_edit_output_len: () => response.length,
    hwpx_edit_output_free() {
      state.outputFrees++;
    },
    hwpx_edit_insert_table(...args) {
      calls.push({ kind: '빈표', args });
      return 1;
    },
  });
  if (modern)
    wasm.hwpx_edit_insert_table_with_texts = (ptr, length) => {
      calls.push({ kind: '초기본문', value: decode(new Uint8Array(memory.buffer, ptr, length)) });
      if (state.fail) throw new Error('합성 ABI 실패');
      return 1;
    };
  // 실제 WASM/원본문서는 사용하지 않고 SDK의 ABI 분기와 요청 바이트만 검증합니다.
  const instantiate = mock.method(WebAssembly, 'instantiate', async () => ({ exports: wasm }));
  try {
    const module = new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
    return { api: await createHwpxEditor(module), calls, state };
  } finally {
    instantiate.mock.restore();
  }
}

test('초기 본문 캡처는 행 별칭을 복제하고 원본 변경과 분리한다', () => {
  const row = ['누리😀', ''];
  const source = [row, row];
  const captured = captureTableInitialTexts(2, 2, source);
  assert.deepEqual(captured, [row, row]);
  assert.notEqual(captured, source);
  assert.notEqual(captured[0], captured[1]);
  row[0] = '변경';
  assert.equal(captured[0][0], '누리😀');
});

test('그리드 경계와 음수 영·희소 배열·부정확한 행 폭을 거부한다', () => {
  for (const n of [-0, 0, -1, 1.5, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => captureTableInitialTexts(n, 1, [['본문']]));
    assert.throws(() => captureTableInitialTexts(1, n, [['본문']]));
  }
  assert.throws(() => captureTableInitialTexts(65, 65, []));
  assert.throws(() => captureTableInitialTexts(1, 1, sparse(1)));
  assert.throws(() => captureTableInitialTexts(1, 1, [sparse(1)]));
  assert.throws(() => captureTableInitialTexts(1, 1, [['하나', '둘']]));
  assert.equal(
    captureTableInitialTexts(
      64,
      64,
      Array.from({ length: 64 }, () => Array(64).fill('')),
    ).length,
    64,
  );
});

test('잘못된 UTF16·제어문자·문자열 아닌 셀을 거부한다', () => {
  for (const value of [
    '\ud800',
    '\udfff',
    '\0',
    '\n',
    '\r',
    '\t',
    '\u007f',
    null,
    1,
    {},
    undefined,
  ])
    assert.throws(() => captureTableInitialTexts(1, 1, [[value]]));
  assert.deepEqual(captureTableInitialTexts(1, 1, [['한글😀<&']]), [['한글😀<&']]);
});

test('셀 합계와 JSON 요청의 UTF8 예산을 각각 적용한다', () => {
  assert.throws(
    () => captureTableInitialTexts(1, 2, [['가'.repeat(700000), '가'.repeat(700000)]]),
    /LimitExceeded/,
  );
  assert.throws(
    () => encodeTableTextRequest({ cell_texts: [['"'.repeat(TABLE_TEXT_REQUEST_LIMIT / 2)]] }),
    /LimitExceeded/,
  );
  const value = { cell_texts: [['누리😀']] };
  assert.deepEqual(decode(encodeTableTextRequest(value)), value);
});

test('원본 iterator를 사용하지 않고 accessor 셀을 실행 전에 거부한다', () => {
  const ordinary = [['한글']];
  ordinary[Symbol.iterator] = ordinary[0][Symbol.iterator] = () => {
    throw new Error('원본 iterator 사용 금지');
  };
  assert.deepEqual(captureTableInitialTexts(1, 1, ordinary), [['한글']]);
  let reads = 0;
  const row = [''];
  Object.defineProperty(row, 0, {
    get() {
      reads++;
      return '한글';
    },
  });
  row[Symbol.iterator] = () => {
    throw new Error('원본 iterator 사용 금지');
  };
  const input = [row];
  input[Symbol.iterator] = row[Symbol.iterator];
  assert.throws(() => captureTableInitialTexts(1, 1, input), /InvalidTableCellTexts/);
  assert.equal(reads, 0);
});

test('상속된 행·셀을 희소 그리드의 빈값으로 취급하지 않는다', () => {
  const inheritedRow = sparse(1);
  Object.setPrototypeOf(inheritedRow, { 0: '상속' });
  assert.throws(() => captureTableInitialTexts(1, 1, [inheritedRow]));
  const inheritedGrid = sparse(1);
  Object.setPrototypeOf(inheritedGrid, { 0: ['상속'] });
  assert.throws(() => captureTableInitialTexts(1, 1, inheritedGrid));
});

test('HWP5 구형 ABI는 초기 본문을 빈표로 대체하지 않는다', () => {
  const { api, calls } = hwp5(false);
  assert.equal(api.supportsTableInitialTexts(), false);
  assert.throws(() => api.insertTable(request()), /Hwp5TableInitialTextsAbiUnavailable/);
  assert.deepEqual(calls, []);
  assert.equal(api.insertTable({ rows: 2, columns: 2 }), '1');
  assert.equal(calls[0].kind, '빈표');
});

test('HWP5 초기 본문은 한 번의 새 ABI 요청으로 전달한다', () => {
  const { api, calls } = hwp5();
  assert.equal(api.supportsTableInitialTexts(), true);
  assert.equal(api.insertTable(request()), '1');
  assert.deepEqual(calls, [{ kind: '초기본문', value: request() }]);
  assert.throws(() => api.insertTable({ ...request(), cell_texts: undefined }));
  assert.equal(calls.length, 1);
});

test('HWPX 구형 ABI와 초기 본문 생략의 기존 빈표 경로를 구분한다', async () => {
  const { api, calls } = await hwpx(false);
  try {
    assert.equal(api.supportsTableInitialTexts(), false);
    assert.throws(
      () => api.insertTable(0, 1, 0, { ...options(), cellTexts: grid() }),
      /HwpxTableInitialTextsAbiUnavailable/,
    );
    assert.deepEqual(calls, []);
    assert.equal(api.insertTable(0, 1, 0, options()), '1');
    assert.equal(calls[0].kind, '빈표');
  } finally {
    api.close();
  }
});

test('HWPX 초기 본문 JSON ABI는 위치·자원·본문을 함께 전달한다', async () => {
  const { api, calls } = await hwpx();
  try {
    assert.equal(api.supportsTableInitialTexts(), true);
    assert.equal(api.insertTable(0, 1, 0, { ...options(), cellTexts: grid() }), '1');
    assert.deepEqual(calls, [
      {
        kind: '초기본문',
        value: {
          version: 1,
          section: 0,
          paragraph: 1,
          unit: 0,
          rows: 2,
          columns: 2,
          width: 100,
          row_height: 20,
          resources: options().resources,
          cell_texts: grid(),
        },
      },
    ]);
    assert.throws(() => api.insertTable(0, 1, 0, { ...options(), cellTexts: [['\ud800']] }));
    assert.equal(calls.length, 1);
  } finally {
    api.close();
  }
});

test('두 SDK는 잘못된 초기 본문을 메모리 전달과 ABI 호출 이전에 거부한다', async () => {
  const h5 = hwp5();
  const hx = await hwpx();
  const inherited = sparse(2);
  Object.setPrototypeOf(inherited, { 0: ['가', '나'], 1: ['다', '라'] });
  try {
    for (const invalid of [
      undefined,
      null,
      [],
      sparse(2),
      inherited,
      [
        ['\ud800', ''],
        ['', ''],
      ],
      [
        ['\n', ''],
        ['', ''],
      ],
      [
        ['가', 1],
        ['', ''],
      ],
    ]) {
      assert.throws(() => h5.api.insertTable({ ...request(), cell_texts: invalid }));
      assert.throws(() => hx.api.insertTable(0, 1, 0, { ...options(), cellTexts: invalid }));
      assert.equal(h5.calls.length, 0);
      assert.equal(hx.calls.length, 0);
      assert.equal(h5.state.transfers, 0);
      assert.equal(hx.state.allocations, 0);
    }
  } finally {
    hx.api.close();
  }
});

test('HWP5 요청의 cell_texts getter를 실행하지 않고 거부한다', () => {
  const { api, calls } = hwp5();
  let reads = 0;
  const value = {
    rows: 1,
    columns: 1,
    get cell_texts() {
      reads++;
      return [['본문']];
    },
  };
  assert.throws(() => api.insertTable(value));
  assert.equal(reads, 0);
  assert.equal(calls.length, 0);
});

test('HWP5 요청 toJSON이 검증된 초기 본문을 없애거나 바꾸지 못한다', () => {
  const { api, calls } = hwp5();
  const value = {
    ...request(),
    toJSON() {
      return { rows: 2, columns: 2 };
    },
  };
  try {
    api.insertTable(value);
  } catch {
    assert.equal(calls.length, 0);
    return;
  }
  assert.deepEqual(calls[0].value.cell_texts, grid());
});

test('HWP5 행수 getter 재읽기로 검증 그리드와 전송 기하가 달라지지 않는다', () => {
  const { api, calls } = hwp5();
  let reads = 0;
  const value = {
    get rows() {
      return ++reads === 1 ? 1 : 2;
    },
    columns: 1,
    cell_texts: [['하나'], ['둘']],
  };
  try {
    api.insertTable(value);
  } catch {
    assert.equal(calls.length, 0);
    return;
  }
  assert.equal(calls[0].value.rows, calls[0].value.cell_texts.length);
});

test('HWPX 자원 getter 재읽기로 검증 이후 다른 값이 전송되지 않는다', async () => {
  const { api, calls } = await hwpx();
  let reads = 0;
  const value = {
    ...options(),
    resources: {
      ...options().resources,
      get paragraph() {
        return ++reads === 1 ? 1 : -1;
      },
    },
    cellTexts: grid(),
  };
  try {
    try {
      api.insertTable(0, 1, 0, value);
    } catch {
      assert.equal(calls.length, 0);
      return;
    }
    assert.equal(calls[0].value.resources.paragraph, 1);
    assert.equal(reads, 1);
  } finally {
    api.close();
  }
});

test('JSON 캡처는 null prototype 복제이며 별칭을 허용하되 순환은 거부한다', () => {
  const shared = { text: '누리' };
  const result = captureTableTextRequest({ left: shared, right: shared });
  assert.equal(Object.getPrototypeOf(result), null);
  assert.equal(Object.getPrototypeOf(result.left), null);
  assert.notEqual(result.left, shared);
  assert.notEqual(result.left, result.right);
  assert.deepEqual(decode(encodeTableTextRequest(result)), { left: shared, right: shared });
  const cycle = {};
  cycle.next = cycle;
  assert.throws(() => captureTableTextRequest(cycle));
});

test('중첩 getter·toJSON·심볼 필드·희소 추가 필드를 실행 없이 거부한다', () => {
  const { api, calls, state } = hwp5();
  let hooks = 0;
  const nested = {
    get text() {
      hooks++;
      return '본문';
    },
  };
  const hook = {
    toJSON() {
      hooks++;
      return {};
    },
  };
  for (const extra of [nested, hook, { [Symbol('추가')]: '숨김' }, sparse(1)]) {
    assert.throws(() => api.insertTable({ ...request(), extra }));
    assert.equal(hooks, 0);
    assert.equal(calls.length, 0);
    assert.equal(state.transfers, 0);
  }
});

test('요청 캡처 깊이32·노드100000 경계에서 한도를 적용한다', () => {
  const chain = (count) => {
    let value = '';
    for (let i = 0; i < count; i++) value = { next: value };
    return value;
  };
  assert.doesNotThrow(() => captureTableTextRequest(chain(32)));
  assert.throws(() => captureTableTextRequest(chain(33)), /LimitExceeded/);
  assert.equal(captureTableTextRequest(Array(99999).fill(0)).length, 99999);
  assert.throws(() => captureTableTextRequest(Array(100000).fill(0)), /LimitExceeded/);
  assert.throws(() => captureTableTextRequest(sparse(0xffffffff)), /LimitExceeded/);
});

test('추가 키와 문자열 값도 총 문자열 예산을 소모한다', () => {
  assert.throws(
    () => captureTableTextRequest({ text: 'x'.repeat(TABLE_TEXT_REQUEST_LIMIT) }),
    /LimitExceeded/,
  );
  assert.throws(
    () => captureTableTextRequest({ ['x'.repeat(TABLE_TEXT_REQUEST_LIMIT + 1)]: '' }),
    /LimitExceeded/,
  );
});

test('잘못된 요청 뒤에도 기존 빈표 생성 경로를 사용할 수 있다', async () => {
  const h5 = hwp5();
  const hx = await hwpx();
  try {
    assert.throws(() => h5.api.insertTable({ ...request(), cell_texts: [] }));
    assert.throws(() => hx.api.insertTable(0, 1, 0, { ...options(), cellTexts: [] }));
    assert.equal(h5.calls.length, 0);
    assert.equal(hx.calls.length, 0);
    assert.equal(h5.api.insertTable({ rows: 2, columns: 2 }), '1');
    assert.equal(hx.api.insertTable(0, 1, 0, options()), '1');
    assert.equal(h5.calls[0].kind, '빈표');
    assert.equal(hx.calls[0].kind, '빈표');
  } finally {
    hx.api.close();
  }
});

test('ABI 호출 실패 뒤 자원을 반환하고 다음 초기 본문 요청을 전달한다', async () => {
  const h5 = hwp5();
  const hx = await hwpx();
  try {
    h5.state.fail = hx.state.fail = true;
    assert.throws(() => h5.api.insertTable(request()), /합성 ABI 실패/);
    assert.throws(
      () => hx.api.insertTable(0, 1, 0, { ...options(), cellTexts: grid() }),
      /합성 ABI 실패/,
    );
    assert.equal(hx.state.allocations, 1);
    assert.equal(hx.state.frees, 1);
    assert.equal(hx.state.outputFrees, 1);
    h5.state.fail = hx.state.fail = false;
    assert.equal(h5.api.insertTable(request()), '1');
    assert.equal(hx.api.insertTable(0, 1, 0, { ...options(), cellTexts: grid() }), '1');
    assert.equal(h5.calls.length, 2);
    assert.equal(hx.calls.length, 2);
    assert.equal(hx.state.allocations, 2);
    assert.equal(hx.state.frees, 2);
    assert.equal(hx.state.outputFrees, 2);
  } finally {
    hx.api.close();
  }
});
