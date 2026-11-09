import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentOperations,
  validateDocumentOperations,
  DOCUMENT_OPERATION_SPECS,
} from '../src/document-operations.ts';

const SHA = 'a'.repeat(64);
const op = (kind, value = {}) => ({ kind, coordinates: 'current-transaction', ...value });
const splice = (value) =>
  op('splice', {
    section: 0,
    paragraph: 0,
    startUnit: 0,
    endUnit: 1,
    expectedRangeText: '가',
    text: '나',
    ...value,
  });
function session(format = 'hwp5', { sdk: extra = {}, close, save, beforeOpen } = {}) {
  const calls = [];
  let opened = 0,
    closed = 0,
    saved = 0;
  const texts = new Map([
    [0, '가나다\r'],
    [1, format === 'hwp5' ? '오른쪽\r' : '가나다'],
  ]);
  const sdk = {
    validateTextSourcePolicy: (section) => calls.push(['policy', section]),
    text: (section, paragraph) => {
      calls.push(['text', section, paragraph]);
      return texts.get(paragraph);
    },
    anchorText: (section, paragraph) => {
      calls.push(['text', section, paragraph]);
      return texts.get(paragraph);
    },
    ...Object.fromEntries(
      [
        'splice',
        'replaceParagraphRanges',
        'splitParagraph',
        'mergeParagraph',
        'setCharacterProperties',
        'setCharacterFormat',
        'setParagraphFormat',
        'setParagraphAlignment',
        'setParagraphMargins',
        'setParagraphSpacing',
        'setCellSizes',
        'setCellStyles',
        'resizePicture',
      ].map((method) => [method, (...args) => calls.push([method, ...args])]),
    ),
    insertTable: (...args) => {
      calls.push(['insertTable', ...args]);
      return '99';
    },
    ...extra,
  };
  const document = {
    format,
    sourceSha256: SHA,
    sectionCount: 1,
    sdk,
    save: async (options) => {
      saved++;
      calls.push(['save', options]);
      if (save) return save(options);
      const bytes = new Uint8Array([4, 5]);
      return format === 'hwp5' ? { bytes, layoutRequiresReflow: true } : bytes;
    },
    close: async () => {
      await close?.();
      closed++;
    },
  };
  const dependencies = {
    openDocument: async (input) => {
      opened++;
      assert.equal(input.expectedSha256, SHA);
      await beforeOpen?.(input);
      return document;
    },
  };
  const apply = (operations, options = {}) =>
    applyDocumentOperations(
      {
        bytes: new Uint8Array([1, 2]),
        wasm: new Uint8Array([3]),
        expectedSha256: SHA,
        operations,
        ...options,
      },
      dependencies,
    );
  return {
    apply,
    sdk,
    texts,
    calls,
    document,
    dependencies,
    opened: () => opened,
    closed: () => closed,
    saved: () => saved,
  };
}

test('작업 스키마는 좌표공간과 엄격한 종류별 키 및 전체 배열을 열기 전에 검증한다', async () => {
  const state = session();
  for (const input of [
    undefined,
    {},
    Array.from({ length: 257 }, () => splice()),
    [splice(), op('지원하지않음')],
    [{ ...splice(), coordinates: undefined }],
    [{ ...splice(), extra: 1 }],
    [splice({ startUnit: -0 })],
    [splice({ expectedRangeText: '' })],
  ]) {
    await assert.rejects(state.apply(input));
  }
  assert.equal(state.opened(), 0);
});

test('요청 getter와 순환과 숨은 키 및 희소 배열은 실행 전에 거부한다', () => {
  const getter = splice();
  Object.defineProperty(getter, 'text', {
    enumerable: true,
    get: () => {
      throw new Error('getter 실행 금지');
    },
  });
  const cyclic = splice();
  cyclic.cycle = cyclic;
  const symbol = splice();
  symbol[Symbol('추가')] = 1;
  const sparse = [];
  sparse.length = 1;
  for (const rows of [[getter], [cyclic], [symbol], sparse])
    assert.throws(() => validateDocumentOperations(rows), /InvalidOperationData/);
});

test('MCP 필드 명세와 공통 검증은 같은 불변 필수 및 선택 키를 사용한다', () => {
  assert.equal(Object.keys(DOCUMENT_OPERATION_SPECS).length, 15);
  const valid = splice();
  for (const name of DOCUMENT_OPERATION_SPECS.splice.required) {
    const missing = { ...valid };
    delete missing[name];
    assert.throws(() => validateDocumentOperations([missing]));
  }
  assert.equal(Object.isFrozen(DOCUMENT_OPERATION_SPECS), true);
  assert.equal(Object.isFrozen(DOCUMENT_OPERATION_SPECS.splice.required), true);
  for (const kind of ['__proto__', 'constructor', 'toString'])
    assert.throws(() => validateDocumentOperations([op(kind)]), /UnsupportedDocumentOperation/);
});

test('검증 결과는 깊은 소유 복사이며 같은 입력 객체를 보관하지 않는다', () => {
  const input = [
    op('character-properties', {
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 1,
      expectedRangeText: '가',
      properties: { bold: true },
    }),
  ];
  const result = validateDocumentOperations(input);
  input[0].properties.bold = false;
  assert.equal(result[0].properties.bold, true);
  assert.equal(Object.isFrozen(result[0].properties), true);
});

test('양형식 splice 어댑터는 Native 좌표와 인수 형식을 유지하고 한 번만 저장한다', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const state = session(format);
    const paragraph = format === 'hwp5' ? 0 : 1;
    const result = await state.apply([splice({ paragraph })], { allowStaleLayout: true });
    const call = state.calls.find((row) => row[0] === 'splice');
    if (format === 'hwp5')
      assert.deepEqual(call[1], { section: 0, paragraph, startUnit: 0, endUnit: 1, text: '나' });
    else assert.deepEqual(call.slice(1), [0, 1, 0, 1, '나']);
    assert.equal(result.appliedOperations, 1);
    assert.equal(result.changed, true);
    assert.equal(result.layoutRequiresReflow, format === 'hwp5');
    assert.equal(state.saved(), 1);
    assert.equal(state.closed(), 1);
  }
});

test('예상본문 불일치는 텍스트 변경 전에 거부하고 실패 바이트를 반환하지 않는다', async () => {
  const state = session();
  await assert.rejects(
    state.apply([splice({ expectedRangeText: '틀' })]),
    /OperationRangePreconditionFailed/,
  );
  assert.equal(
    state.calls.some((row) => row[0] === 'splice'),
    false,
  );
  assert.equal(state.saved(), 0);
  assert.equal(state.closed(), 1);
});

test('split과 merge의 전체 Native 본문 조건은 H5 말미 CR까지 정확히 비교한다', async () => {
  for (const kind of ['split-paragraph', 'merge-paragraph']) {
    const state = session();
    const common = {
      section: 0,
      paragraph: 0,
      expectedText: '가나다',
      ...(kind === 'split-paragraph' ? { atUnit: 1 } : {}),
    };
    await assert.rejects(state.apply([op(kind, common)]), /OperationTextPreconditionFailed/);
    assert.equal(state.saved(), 0);
    assert.throws(() => validateDocumentOperations([op(kind, { section: 0, paragraph: 0 })]));
  }
});

test('순차 구조 편집 뒤의 조건은 원래 ordinal 재매핑 없이 현재 문서를 읽는다', async () => {
  const state = session();
  state.sdk.splitParagraph = (value) => {
    state.calls.push(['splitParagraph', value]);
    state.texts.set(0, '가\r');
    state.texts.set(1, '나다\r');
  };
  const result = await state.apply([
    op('split-paragraph', { section: 0, paragraph: 0, atUnit: 1, expectedText: '가나다\r' }),
    splice({ paragraph: 1, expectedRangeText: '나', text: '새' }),
  ]);
  assert.equal(result.appliedOperations, 2);
  assert.equal(state.calls.filter((row) => row[0] === 'policy').length, 1);
  assert.deepEqual(state.calls.find((row) => row[0] === 'splice')[1], {
    section: 0,
    paragraph: 1,
    startUnit: 0,
    endUnit: 1,
    text: '새',
  });
});

test('후행 Native 실패에서는 앞선 세션 변경도 저장하거나 게시하지 않는다', async () => {
  const error = new Error('Native 소유권 거부');
  const state = session('hwp5', {
    sdk: {
      mergeParagraph: () => {
        throw error;
      },
    },
  });
  await assert.rejects(
    state.apply([
      splice(),
      op('merge-paragraph', { section: 0, paragraph: 0, expectedText: '가나다\r' }),
    ]),
    (value) => value === error,
  );
  assert.equal(
    state.calls.some((row) => row[0] === 'splice'),
    true,
  );
  assert.equal(state.saved(), 0);
  assert.equal(state.closed(), 1);
});

test('누락된 SDK 명령과 형식별 잘못된 target은 첫 명령 실행 전에 차단한다', async () => {
  const state = session('hwpx');
  delete state.sdk.resizePicture;
  await assert.rejects(
    state.apply([
      splice({ paragraph: 1 }),
      op('picture-resize', { section: 0, pictureNode: 9, width: 100, height: 100 }),
    ]),
    /DocumentOperationUnavailable/,
  );
  assert.equal(
    state.calls.some((row) => row[0] === 'splice'),
    false,
  );
  const bad = session('hwpx');
  await assert.rejects(bad.apply([splice()]), /InvalidOperationTarget/);
});

test('범위 다중줄 교체는 모든 조건을 먼저 대조한 뒤 기존 한 명령을 호출한다', async () => {
  const state = session();
  const operation = op('replace-paragraph-ranges', {
    ranges: [
      { section: 0, paragraph: 0, startUnit: 0, endUnit: 1, expectedRangeText: '가' },
      { section: 0, paragraph: 0, startUnit: 1, endUnit: 2, expectedRangeText: '나' },
    ],
    text: '첫째\r\n둘째',
    properties: { italic: true },
  });
  await state.apply([operation]);
  assert.equal(state.calls.filter((row) => row[0] === 'text').length, 1);
  const call = state.calls.find((row) => row[0] === 'replaceParagraphRanges')[1];
  assert.equal(call.text, '첫째\r\n둘째');
  assert.equal(Object.hasOwn(call.ranges[0], 'expectedRangeText'), false);
  operation.ranges[1].expectedRangeText = '틀';
  const fail = session();
  await assert.rejects(fail.apply([operation]), /OperationRangePreconditionFailed/);
  assert.equal(
    fail.calls.some((row) => row[0] === 'replaceParagraphRanges'),
    false,
  );
});

test('단순 splice의 줄바꿈은 structuralwriter 경로 사용을 요구한다', () => {
  assert.throws(
    () => validateDocumentOperations([splice({ text: '첫째\n둘째' })]),
    /UseParagraphRangeReplacementForNewlines/,
  );
});

test('서식과 셀 스타일은 기존 codec 검증을 재사용하고 잘못된 행은 거부한다', () => {
  for (const operation of [
    op('character-properties', {
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 1,
      expectedRangeText: '가',
      properties: { bold: 'true' },
    }),
    op('paragraph-margins', { section: 0, paragraph: 0, margins: { mystery: 1 } }),
    op('cell-sizes', {
      cells: [
        { section: 0, listNode: 1, width: 1, height: 2 },
        { section: 0, listNode: 1, width: 2, height: 3 },
      ],
    }),
    op('cell-styles', { styles: { borders: [], fills: [], extra: true } }),
  ])
    assert.throws(() => validateDocumentOperations([operation]));
});

test('기본 문단 서식과 그림 셀 명령은 검증한 선택 필드만 SDK에 전달한다', async () => {
  const state = session();
  const operations = [
    op('paragraph-alignment', { section: 0, paragraph: 0, alignment: 'CENTER' }),
    op('paragraph-margins', { section: 0, paragraph: 0, margins: { left: 100 } }),
    op('paragraph-spacing', { section: 0, paragraph: 0, type: 'PERCENT', value: 150 }),
    op('paragraph-format', { section: 0, paragraph: 0, paraShapeId: 1 }),
    op('picture-resize', { section: 0, pictureNode: 9, width: 100, height: 200 }),
    op('cell-sizes', { cells: [{ section: 0, listNode: 3, width: 100, height: 200 }] }),
    op('cell-styles', { styles: { borders: [], fills: [] } }),
  ];
  const result = await state.apply(operations);
  assert.equal(result.appliedOperations, operations.length);
  assert.deepEqual(state.calls.find((row) => row[0] === 'resizePicture')[1], {
    section: 0,
    pictureNode: 9,
    width: 100,
    height: 200,
  });
});

test('표 삽입은 기존 H5 작성 정책 또는 HX 원본 서명으로 공통 명시 리소스를 전달한다', async () => {
  for (const format of ['hwp5', 'hwpx']) {
    const state = session(format);
    const resources = { paragraph: 0, character: 0, style: 0, border_fill: 1 };
    const result = await state.apply([
      op('table-insert', {
        section: 0,
        paragraph: format === 'hwp5' ? 0 : 1,
        unit: 1,
        rows: 2,
        columns: 3,
        width: 600,
        rowHeight: 100,
        resources,
      }),
    ]);
    const call = state.calls.find((row) => row[0] === 'insertTable');
    if (format === 'hwp5') {
      assert.equal(call[1].version, 1);
      assert.equal(call[1].row_height, 100);
      assert.equal(call[1].options.common.description, '표');
    } else assert.deepEqual(call.slice(1, 4), [0, 1, 1]);
    assert.deepEqual(result.operationResults, [
      { operation: 0, kind: 'table-insert', identity: '99' },
    ]);
  }
});

test('빈 배열은 원본 바이트 그대로 반환하고 저장하지 않으며 노출 버퍼를 분리한다', async () => {
  const state = session();
  const input = new Uint8Array([1, 2]);
  const result = await state.apply([], { bytes: input });
  assert.equal(result.changed, false);
  assert.equal(result.layoutRequiresReflow, false);
  assert.equal(state.saved(), 0);
  assert.equal(state.closed(), 1);
  result.bytes[0] = 99;
  assert.deepEqual(input, new Uint8Array([1, 2]));
});

test('비동기 열기 뒤 요청 수정이 캡처한 작업과 입력 바이트를 바꾸지 않는다', async () => {
  const operation = splice();
  const bytes = new Uint8Array([1, 2]);
  const wasm = new Uint8Array([3]);
  const state = session('hwp5', {
    beforeOpen: async (input) => {
      operation.text = '변조';
      bytes[0] = 9;
      wasm[0] = 9;
      assert.deepEqual(input.bytes, new Uint8Array([1, 2]));
      assert.deepEqual(input.wasm, new Uint8Array([3]));
    },
  });
  await state.apply([operation], { bytes, wasm });
  assert.equal(state.calls.find((row) => row[0] === 'splice')[1].text, '나');
});

test('저장 거부와 종료 실패에서도 본래 오류와 종료 오류를 모두 보존한다', async () => {
  const primary = new Error('조판 저장 거부'),
    cleanup = new Error('종료 실패');
  const state = session('hwp5', {
    save: () => {
      throw primary;
    },
    close: async () => {
      throw cleanup;
    },
  });
  await assert.rejects(
    state.apply([splice()]),
    (error) =>
      error instanceof AggregateError && error.cause === primary && error.errors[1] === cleanup,
  );
  const closeOnly = session('hwp5', {
    close: async () => {
      throw cleanup;
    },
  });
  await assert.rejects(
    closeOnly.apply([]),
    (error) => error.message === 'DocumentOperationsCloseFailed' && error.cause === cleanup,
  );
});

test('SHA와 출력 상태가 잘못되면 결과 게시 없이 종료한다', async () => {
  const stale = session();
  stale.document.sourceSha256 = 'b'.repeat(64);
  await assert.rejects(stale.apply([]), /SourceSha256Mismatch/);
  assert.equal(stale.closed(), 1);
  const badOutput = session('hwp5', {
    save: () => ({ bytes: new Uint8Array([1]), layoutRequiresReflow: null }),
  });
  await assert.rejects(badOutput.apply([splice()]), /InvalidOperationLayoutState/);
  assert.equal(badOutput.closed(), 1);
});

test('다중 범위 예상본문 관측도 작업별 누적 예산을 넘으면 Native 변경 전에 거부한다', async () => {
  const state = session('hwpx', { sdk: { anchorText: () => 'x'.repeat(2 * 1024 * 1024) } });
  const operation = op('replace-paragraph-ranges', {
    ranges: [1, 2, 3].map((paragraph) => ({
      section: 0,
      paragraph,
      startUnit: 0,
      endUnit: 0,
      expectedRangeText: '',
    })),
    text: '검사',
  });
  await assert.rejects(state.apply([operation]), /OperationObservationLimitExceeded/);
  assert.equal(
    state.calls.some((row) => row[0] === 'replaceParagraphRanges'),
    false,
  );
  assert.equal(state.saved(), 0);
  assert.equal(state.closed(), 1);
});
