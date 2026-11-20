import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDocumentOperations,
  validateDocumentOperations,
  DOCUMENT_OPERATION_SPECS,
} from '../src/document-operations.ts';
import { isInlineObjectOperation } from '../src/mutations/inline-object-create.ts';
import { applyCreatedCellSpliceOperation } from '../src/mutations/created-cell-splice.ts';
const sha = 'a'.repeat(64);
const table = () => ({
  kind: 'table-insert',
  coordinates: 'current-transaction',
  section: 0,
  paragraph: 1,
  unit: 0,
  rows: 1,
  columns: 1,
  width: 2000,
  rowHeight: 1000,
  resources: { paragraph: 0, character: 0, style: 0, border_fill: 1 },
});
const splice = (extra: any = {}) => ({
  kind: 'created-cell-splice',
  coordinates: 'current-transaction',
  selector: { section: 0, created_cell: { operation: 0, row: 0, column: 0 } },
  startUnit: 0,
  endUnit: 0,
  expectedText: '',
  text: '앞😀\n뒤',
  ...extra,
});
function host(format: 'hwp5' | 'hwpx' = 'hwpx', options: any = {}) {
  const events: string[] = [],
    requests: any[] = [];
  let revision = 0,
    text = '',
    opened = 0,
    historyEnabled = false,
    liveBeforeEnable = 0;
  const id = '9007199254740993';
  const reference = { kind: 'cell', section: 0, id, row: 0, column: 0, scope: 123 };
  const cap = () => {
    if (!historyEnabled) {
      liveBeforeEnable++;
      throw Error('HistoryNotEnabled');
    }
    return {
      schemaVersion: options.oldSchema ? 0 : 1,
      atomic: true,
      format,
      coordinateSpace: 'created-cell-utf16',
      requiresHistoryProtocol: options.oldProtocol ? 1 : 2,
      binding: {
        session: 'own',
        revision:
          options.staleBinding || (options.staleAfterTable && revision > 0)
            ? revision + 1
            : revision,
      },
      limits: {},
    };
  };
  const sdk: any = {
    historyV2Available: () => !options.oldHistory,
    enableHistoryV2() {
      events.push('history');
      historyEnabled = true;
    },
    historyRevision: () => {
      if (!historyEnabled) {
        liveBeforeEnable++;
        throw Error('HistoryNotEnabled');
      }
      return revision;
    },
    supportsCreatedCellTypingAbi: () => !options.oldAbi,
    createdCellTypingCapabilities: cap,
    insertTable() {
      events.push('table');
      revision++;
      return options.receipt === undefined ? id : options.receipt;
    },
    createdTables(section: number) {
      assert.equal(section, 0);
      events.push('query');
      if (options.queryReentry) revision++;
      const cell = {
        row: 0,
        column: 0,
        paragraph_id: 4,
        text: options.changedText ? 'foreign' : text,
        character_runs: [{ start_unit: 0, char_shape_id: 0 }],
      };
      const value = {
        identity: options.foreignIdentity ? '999' : id,
        cells: options.missingCell ? [] : [cell],
      };
      return format === 'hwp5' ? [{ table: value }] : [value];
    },
    currentReferences(section: number, page: any) {
      assert.equal(section, 0);
      return {
        first: page.first,
        total: 1,
        references: options.foreignReference ? [{ ...reference, id: '9' }] : [reference],
      };
    },
    currentText(ref: any) {
      assert.equal(ref, reference);
      return options.wrongReferenceText ? 'wrong\r' : text + '\r';
    },
    spliceCreatedCell(request: any) {
      events.push('splice');
      requests.push(structuredClone(request));
      if (options.reject)
        return { nativeCode: 0, application: 'unapplied', changed: false, error: 'NativeRejected' };
      if (options.unknown) return { nativeCode: 3, application: 'unknown', changed: null };
      text = text.slice(0, request.startUnit) + request.text + text.slice(request.endUnit);
      revision++;
      return { nativeCode: 1, application: 'applied', changed: true };
    },
  };
  const document: any = {
    format,
    sourceSha256: sha,
    sectionCount: 1,
    sdk,
    save() {
      events.push('save');
      return format === 'hwp5'
        ? { bytes: new Uint8Array([2]), layoutRequiresReflow: true }
        : new Uint8Array([2]);
    },
    close() {
      events.push('close');
    },
  };
  return {
    events,
    requests,
    document,
    get text() {
      return text;
    },
    get liveBeforeEnable() {
      return liveBeforeEnable;
    },
    get opened() {
      return opened;
    },
    dependencies: {
      async openDocument() {
        opened++;
        return document;
      },
    },
  };
}
const input = (operations: any[]) => ({
  bytes: new Uint8Array([1]),
  wasm: new Uint8Array([0]),
  expectedSha256: sha,
  operations,
});
for (const format of ['hwpx', 'hwp5'] as const)
  test(`${format}: 기존 셀 조회 SSOT와 정식 splice 호출로 LF 및 rich 서식을 전달한다`, async () => {
    const h = host(format);
    const insertion = {
      character: {
        bold: true,
        underline: { kind: 'bottom' },
        fonts: Object.fromEntries(
          ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'].map((k) => [
            k,
            { name: 'Own Font' },
          ]),
        ),
      },
    };
    const result = await applyDocumentOperations(
      input([
        table(),
        splice({ insertion }),
        splice({ startUnit: 1, endUnit: 3, expectedText: '앞😀\n뒤', text: 'X' }),
      ]),
      h.dependencies,
    );
    assert.equal(h.text, '앞X\n뒤');
    assert.equal(result.appliedOperations, 3);
    assert.equal(result.layoutRequiresReflow, true);
    assert.deepEqual(h.requests[0], {
      section: 0,
      identity: '9007199254740993',
      row: 0,
      column: 0,
      startUnit: 0,
      endUnit: 0,
      text: '앞😀\n뒤',
      insertion,
    });
    assert.equal(h.events[0], 'history');
    assert.deepEqual(h.events.slice(-2), ['save', 'close']);
  });
test('초기 cellTexts LF 거부와 새 operation 독립 분류를 유지한다', () => {
  assert.throws(
    () => validateDocumentOperations([{ ...table(), cellTexts: [['앞😀\n뒤']] }]),
    /InvalidOperationCellTextControl/,
  );
  assert.equal(isInlineObjectOperation(splice()), false);
  assert.deepEqual(DOCUMENT_OPERATION_SPECS['created-cell-splice'].optional, ['insertion']);
});
for (const [label, change] of [
  ['NUL', { text: 'a\0b' }],
  ['CR', { text: 'a\rb' }],
  ['고립 서로게이트', { text: '\ud800' }],
  ['거대 uint', { startUnit: 2 ** 32 }],
  ['음수0', { endUnit: -0 }],
  ['서로게이트 중간', { expectedText: '😀', startUnit: 1, endUnit: 1 }],
  ['알 수 없는 서식', { insertion: { character: { invented: true } } }],
  ['외국어 폰트키', { insertion: { character: { fonts: { unknown: { name: 'x' } } } } }],
  [
    '폰트 ID와 이름 동시 지정',
    { insertion: { character: { fonts: { latin: { id: 1, name: 'x' } } } } },
  ],
  ['문단 서식 우회', { insertion: { paragraph: {} } }],
  ['source 주소 혼용', { selector: { section: 0, paragraph: 1 } }],
  [
    '직접 identity 위조',
    { selector: { section: 0, created_cell: { identity: '1', row: 0, column: 0 } } },
  ],
  [
    '앞선 operation 아님',
    { selector: { section: 0, created_cell: { operation: 1, row: 0, column: 0 } } },
  ],
  ['외부 section', { selector: { section: 1, created_cell: { operation: 0, row: 0, column: 0 } } }],
  ['열 경계', { selector: { section: 0, created_cell: { operation: 0, row: 0, column: 1 } } }],
] as const)
  test(`${label}: 열기와 첫 mutation 전에 거부한다`, async () => {
    const h = host();
    await assert.rejects(() =>
      applyDocumentOperations(input([table(), splice(change)]), h.dependencies),
    );
    assert.equal(h.opened, 0);
    assert.deepEqual(h.events, []);
  });
for (const options of [
  { oldAbi: true },
  { oldSchema: true },
  { oldProtocol: true },
  { oldHistory: true },
  { staleBinding: true },
])
  test(`구형 ABI·binding 선검사 ${JSON.stringify(options)}`, async () => {
    const h = host('hwpx', options);
    await assert.rejects(() => applyDocumentOperations(input([table(), splice()]), h.dependencies));
    assert.deepEqual(
      h.events,
      options.oldAbi || options.oldHistory ? ['close'] : ['history', 'close'],
    );
  });
for (const receipt of ['0', '01', '18446744073709551616', 0, undefined]) {
  if (receipt === undefined) continue;
  test(`실제 receipt ${String(receipt)} 거부 후 suffix·저장 없음`, async () => {
    const h = host('hwpx', { receipt });
    await assert.rejects(
      () => applyDocumentOperations(input([table(), splice()]), h.dependencies),
      /InvalidCreatedTableIdentity/,
    );
    assert.deepEqual(h.events, ['history', 'table', 'close']);
  });
}
test('receipt map 부재는 identity를 제조하지 않는다', () => {
  const h = host();
  h.document.sdk.enableHistoryV2();
  assert.throws(
    () => applyCreatedCellSpliceOperation(h.document, splice() as any, new Map()),
    /MissingCreatedTableOperationResult/,
  );
  assert.equal(h.events.includes('splice'), false);
});
for (const options of [
  { changedText: true },
  { foreignIdentity: true },
  { missingCell: true },
  { reject: true },
  { unknown: true },
])
  test(`현재 조회·commit 거부 뒤 suffix·출력 없음 ${JSON.stringify(options)}`, async () => {
    const h = host('hwpx', options);
    await assert.rejects(() =>
      applyDocumentOperations(
        input([table(), splice(), splice({ text: 'suffix' })]),
        h.dependencies,
      ),
    );
    assert.equal(h.events.includes('save'), false);
    assert.ok(h.requests.length <= 1);
    assert.equal(h.events.at(-1), 'close');
  });
for (const options of [{ foreignReference: true }, { wrongReferenceText: true }])
  test(`H5 실제 Native 참조 불일치 ${JSON.stringify(options)}`, async () => {
    const h = host('hwp5', options);
    await assert.rejects(() => applyDocumentOperations(input([table(), splice()]), h.dependencies));
    assert.equal(h.requests.length, 0);
    assert.equal(h.events.includes('save'), false);
  });
test('나중 expectedText 불일치는 앞 명령 이후에도 저장·후행 명령을 막는다', async () => {
  const h = host();
  await assert.rejects(
    () =>
      applyDocumentOperations(
        input([table(), splice(), splice({ expectedText: 'old' }), splice({ text: 'suffix' })]),
        h.dependencies,
      ),
    /OperationTextPreconditionFailed/,
  );
  assert.equal(h.requests.length, 1);
  assert.equal(h.events.includes('save'), false);
});
test('비동기 열기 이전 캡처가 selector와 rich payload 원본 변경을 차단한다', async () => {
  const h = host();
  const operation = splice({ insertion: { character: { bold: true } } });
  const result = applyDocumentOperations(input([table(), operation]), {
    openDocument: async () => {
      operation.selector.created_cell.operation = 9;
      operation.insertion.character.bold = false;
      return h.document;
    },
  });
  await result;
  assert.equal(h.requests[0].insertion.character.bold, true);
  assert.equal(h.requests[0].identity, '9007199254740993');
});

test('조회 중 재진입 revision 변경은 splice 전에 거부한다', async () => {
  const h = host('hwpx', { queryReentry: true });
  await assert.rejects(
    () => applyDocumentOperations(input([table(), splice()]), h.dependencies),
    /StaleCreatedCellTypingBinding/,
  );
  assert.equal(h.requests.length, 0);
  assert.equal(h.events.includes('save'), false);
});
test('표가 아닌 앞선 작업 참조도 열기 전에 거부한다', async () => {
  const h = host();
  const prior = {
    kind: 'created-table-grid',
    coordinates: 'current-transaction',
    section: 0,
    identity: '1',
    action: 'insert-row',
    index: 0,
  };
  await assert.rejects(
    () => applyDocumentOperations(input([prior, splice()]), h.dependencies),
    /InvalidCreatedTableOperationReference/,
  );
  assert.equal(h.opened, 0);
});
test('표 생성 receipt가 없으면 이후 조회·저장 없이 종료한다', async () => {
  const h = host('hwpx', { receipt: null });
  await assert.rejects(
    () => applyDocumentOperations(input([table(), splice()]), h.dependencies),
    /MissingCreatedTableOperationResult/,
  );
  assert.deepEqual(h.events, ['history', 'table', 'close']);
});

test('History 단계: 비활성 live 조회가 금지된 호스트도 정식 초기화 후 성공한다', async () => {
  const h = host();
  await applyDocumentOperations(input([table(), splice()]), h.dependencies);
  assert.equal(h.liveBeforeEnable, 0);
  assert.equal(h.requests.length, 1);
  assert.deepEqual(h.events.slice(0, 2), ['history', 'table']);
});
test('History 단계: 뒤쪽 operation 정적 ABI가 없으면 활성화와 live 조회 모두 금지한다', async () => {
  const h = host();
  h.document.sdk.editCreatedTableGrid = () => {
    throw Error('MustNotMutate');
  };
  h.document.sdk.supportsCreatedTableGrid = () => false;
  const tail = {
    kind: 'created-table-grid',
    coordinates: 'current-transaction',
    section: 0,
    identity: '1',
    action: 'insert-row',
    index: 0,
  };
  await assert.rejects(
    () => applyDocumentOperations(input([table(), splice(), tail]), h.dependencies),
    /HwpxCreatedTableGridAbiUnavailable/,
  );
  assert.deepEqual(h.events, ['close']);
  assert.equal(h.liveBeforeEnable, 0);
});
test('History 단계: 활성화 후 stale binding은 첫 표 변경 전에 거부한다', async () => {
  const h = host('hwpx', { staleBinding: true });
  await assert.rejects(
    () => applyDocumentOperations(input([table(), splice()]), h.dependencies),
    /StaleCreatedCellTypingBinding/,
  );
  assert.deepEqual(h.events, ['history', 'close']);
  assert.equal(h.liveBeforeEnable, 0);
});
test('History 단계: 표 생성 뒤 재검사의 stale binding도 splice·저장 전에 거부한다', async () => {
  const h = host('hwpx', { staleAfterTable: true });
  await assert.rejects(
    () => applyDocumentOperations(input([table(), splice()]), h.dependencies),
    /StaleCreatedCellTypingBinding/,
  );
  assert.deepEqual(h.events, ['history', 'table', 'close']);
  assert.equal(h.requests.length, 0);
});
