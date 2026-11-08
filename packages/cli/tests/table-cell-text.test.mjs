import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentOperations,
  validateDocumentOperations,
  DOCUMENT_OPERATION_SPECS,
} from '../src/document-operations.ts';

const operation = (extra = {}) => ({
  kind: 'table-insert',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 1,
  unit: 0,
  rows: 2,
  columns: 2,
  width: 20000,
  rowHeight: 3000,
  resources: { paragraph: 0, character: 0, style: 0, border_fill: 1 },
  ...extra,
});
const SHA = 'a'.repeat(64);
function harness(format = 'hwpx', overrides = {}) {
  const calls = [];
  const document = {
    format,
    sourceSha256: SHA,
    sectionCount: 1,
    sdk: {
      insertTable: (...args) => {
        calls.push(['insert', ...args]);
        return '7';
      },
      supportsTableInitialTexts: () => true,
      setCreatedCellText: () => {
        throw new Error('단일 셀 반복 금지');
      },
      ...overrides,
    },
    save: () => {
      calls.push(['save']);
      const bytes = new Uint8Array([3]);
      return format === 'hwp5' ? { bytes, layoutRequiresReflow: true } : bytes;
    },
    close: () => calls.push(['close']),
  };
  return {
    calls,
    apply: (operations) =>
      applyDocumentOperations(
        {
          bytes: new Uint8Array([1]),
          wasm: new Uint8Array([2]),
          expectedSha256: SHA,
          operations,
        },
        { openDocument: async () => document },
      ),
  };
}

test('표 초기 본문은 기존 14종 계약의 선택 필드다', () => {
  assert.equal(Object.keys(DOCUMENT_OPERATION_SPECS).length, 14);
  assert.ok(DOCUMENT_OPERATION_SPECS['table-insert'].optional.includes('cellTexts'));
  assert.doesNotThrow(() => validateDocumentOperations([operation()]));
  const input = operation({
    cellTexts: [
      ['첫째😀', ''],
      ['셋째', '넷째'],
    ],
  });
  const [snapshot] = validateDocumentOperations([input]);
  input.cellTexts[0][0] = '변경';
  assert.equal(snapshot.cellTexts[0][0], '첫째😀');
  assert.ok(Object.isFrozen(snapshot.cellTexts[0]));
});

test('표 초기 본문의 null, 행열 불일치, 비문자열과 빈 슬롯을 거부한다', () => {
  const sparse = [];
  sparse.length = 2;
  for (const cellTexts of [
    null,
    [],
    [['하나']],
    [['a', 'b'], ['c']],
    [
      ['a', 1],
      ['', ''],
    ],
    [sparse, ['', '']],
  ])
    assert.throws(() => validateDocumentOperations([operation({ cellTexts })]));
});

test('표 초기 본문은 잘못된 UTF16과 문단 제어문자를 거부한다', () => {
  for (const text of ['\ud800', 'a\nb', 'a\rb', '\t', '\0', '\x7f'])
    assert.throws(() =>
      validateDocumentOperations([
        operation({
          cellTexts: [
            [text, ''],
            ['', ''],
          ],
        }),
      ]),
    );
});

test('표 초기 본문의 개수와 전체 문자열 예산을 완화하지 않는다', () => {
  assert.doesNotThrow(() =>
    validateDocumentOperations([
      operation({
        rows: 64,
        columns: 64,
        cellTexts: Array.from({ length: 64 }, () => Array(64).fill('')),
      }),
    ]),
  );
  assert.throws(
    () => validateDocumentOperations([operation({ rows: 65, columns: 64 })]),
    /InvalidOperationTableSize/,
  );
  assert.throws(
    () =>
      validateDocumentOperations([
        operation({
          cellTexts: [
            ['가'.repeat(1500000), ''],
            ['', ''],
          ],
        }),
      ]),
    /OperationInputLimitExceeded/,
  );
});

test('초기 본문은 양형식 삽입 요청 한 번으로 전달하고 단일 셀 setter를 호출하지 않는다', async () => {
  const cellTexts = [
    ['첫째😀', ''],
    ['셋째', '넷째'],
  ];
  for (const format of ['hwp5', 'hwpx']) {
    const h = harness(format);
    const result = await h.apply([operation({ cellTexts })]);
    const inserts = h.calls.filter(([kind]) => kind === 'insert');
    assert.equal(inserts.length, 1);
    assert.deepEqual(
      format === 'hwp5' ? inserts[0][1].cell_texts : inserts[0][4].cellTexts,
      cellTexts,
    );
    assert.equal(h.calls.filter(([kind]) => kind === 'save').length, 1);
    assert.equal(result.operationResults[0].identity, '7');
    assert.equal(h.calls.at(-1)[0], 'close');
  }
});

test('지원하지 않는 초기 본문은 삽입 전에 거부하고 기존 빈 표는 유지한다', async () => {
  for (const h of [
    harness('hwp5', { supportsTableInitialTexts: undefined }),
    harness('hwpx', { supportsTableInitialTexts: () => false }),
  ]) {
    await assert.rejects(
      h.apply([
        operation({
          cellTexts: [
            ['', ''],
            ['', ''],
          ],
        }),
      ]),
      /CreatedCellTextUnavailable/,
    );
    assert.deepEqual(h.calls, [['close']]);
  }
  const h = harness();
  await h.apply([operation()]);
  assert.equal(h.calls.filter(([kind]) => kind === 'insert').length, 1);
  assert.equal(h.calls.filter(([kind]) => kind === 'cell').length, 0);
});

test('Native 초기 본문 삽입 실패는 저장하지 않고 세션을 닫는다', async () => {
  const h = harness('hwpx', {
    insertTable: () => {
      throw new Error('초기 본문 준비 실패');
    },
  });
  await assert.rejects(
    h.apply([
      operation({
        cellTexts: [
          ['하나', '둘'],
          ['', ''],
        ],
      }),
    ]),
    /초기 본문 준비 실패/,
  );
  assert.equal(
    h.calls.some(([kind]) => kind === 'save'),
    false,
  );
  assert.equal(h.calls.at(-1)[0], 'close');
});

test('후행 표의 잘못된 초기 본문과 미지원 API는 앞선 작업 전에 거부한다', async () => {
  const malformed = harness();
  await assert.rejects(
    malformed.apply([operation(), operation({ cellTexts: null })]),
    /InvalidOperationCellTexts/,
  );
  assert.deepEqual(malformed.calls, []);
  const unavailable = harness('hwpx', { supportsTableInitialTexts: undefined });
  await assert.rejects(
    unavailable.apply([
      operation(),
      operation({
        cellTexts: [
          ['하나', ''],
          ['', ''],
        ],
      }),
    ]),
    /CreatedCellTextUnavailable/,
  );
  assert.deepEqual(unavailable.calls, [['close']]);
});

test('잘못된 생성 식별자로 셀 설정을 진행하지 않는다', async () => {
  for (const identity of ['0', '01', '18446744073709551616', 7]) {
    const h = harness('hwpx', { insertTable: () => identity });
    await assert.rejects(
      h.apply([
        operation({
          cellTexts: [
            ['a', ''],
            ['', ''],
          ],
        }),
      ]),
      /InvalidCreatedTableIdentity/,
    );
    assert.equal(
      h.calls.some(([kind]) => kind === 'cell' || kind === 'save'),
      false,
    );
    assert.equal(h.calls.at(-1)[0], 'close');
  }
});
