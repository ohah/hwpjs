import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectDocumentObject } from '../src/document-objects.ts';
import { buildObjectReference } from '../src/object-reference.ts';

const hash = 'a'.repeat(64);
const ref = (kind, node = 10, format = 'hwpx') =>
  buildObjectReference({ sourceSha256: hash, format, section: 0, kind, node });
function setup(kind = 'equation', { sdk = {}, block: extra = {}, format = 'hwpx', close } = {}) {
  let closed = 0,
    opened = 0;
  const reference = ref(kind, 10, format);
  const block = {
    id: 's0:o10',
    type: ['table', 'image'].includes(kind) ? kind : 'unknown',
    kind,
    reference,
    source: { section: 0, node: 10, tableNode: 10 },
    sourceInfo: { section: 0, pictureNode: 10 },
    ...extra,
  };
  const model = {
    version: 1,
    format,
    sourceSha256: hash,
    sections: [{ body: [block], header: { definitions: [] }, footer: { definitions: [] } }],
    unplaced: [],
  };
  const document = {
    format,
    sourceSha256: hash,
    sectionCount: 1,
    sdk,
    close: async () => {
      await close?.();
      closed++;
    },
  };
  const dependencies = {
    openDocument: async (options) => {
      opened++;
      assert.equal(options.expectedSha256, hash);
      return document;
    },
    readDocumentModel: async (options) => {
      assert.equal(options.sdk, sdk);
      return model;
    },
  };
  const inspect = (options) =>
    inspectDocumentObject(
      { bytes: new Uint8Array([1]), wasm: new Uint8Array([2]), reference, ...options },
      dependencies,
    );
  return {
    inspect,
    model,
    block,
    document,
    dependencies,
    closed: () => closed,
    opened: () => opened,
  };
}

test('상세 수식은 선택한 원본 노드만 조회하고 정확한 결과 키를 반환한다', async () => {
  const calls = [];
  const state = setup('equation', {
    sdk: {
      equationScript: (...args) => {
        calls.push(args);
        return 'x^2';
      },
    },
  });
  const result = await state.inspect();
  assert.deepEqual(calls, [[0, 10]]);
  assert.deepEqual(
    Object.keys(result).sort(),
    ['schemaVersion', 'format', 'sourceSha256', 'reference', 'kind', 'status', 'text'].sort(),
  );
  assert.equal(result.status, 'available');
  assert.match(result.text, /x\^2/);
  assert.equal(state.closed(), 1);
});

test('문법 오류는 열기 전에 거부하고 재고 없는 유효 참조는 상세 조회 전에 거부한다', async () => {
  const state = setup();
  await assert.rejects(state.inspect({ reference: '임의 참조' }), /InvalidObjectReference/);
  assert.equal(state.opened(), 0);
  await assert.rejects(
    state.inspect({ reference: ref('equation', 11) }),
    /ObjectReferenceNotFound/,
  );
  assert.equal(state.closed(), 1);
});

test('문서 SHA 형식과 소유 원본 노드 불일치는 조회하지 않고 거부한다', async () => {
  for (const change of [
    (s) => {
      s.document.sourceSha256 = 'b'.repeat(64);
    },
    (s) => {
      s.document.format = 'hwp5';
    },
    (s) => {
      s.block.source.node = 99;
    },
    (s) => {
      s.block.kind = 'ole';
    },
  ]) {
    const state = setup();
    change(state);
    await assert.rejects(
      state.inspect(),
      /StaleObjectReference|ObjectReferenceFormatMismatch|InvalidObjectModel/,
    );
    assert.equal(state.closed(), 1);
  }
});

test('이미지 상세는 추출 참조와 한국어 안내만 제공하고 바이트를 읽지 않는다', async () => {
  const fail = () => {
    throw new Error('바이트 접근 금지');
  };
  const state = setup('image', {
    sdk: { binaryResource: fail, pictureBytes: fail },
    block: { width: 123, alt: null },
  });
  const result = await state.inspect();
  assert.equal(result.status, 'available');
  assert.match(result.text, /hwpx:s0:i10/);
  assert.ok(result.text.includes(`extract-images 입력파일 --ref ${ref('image')} --output`));
});

test('희소 표 상세는 원본 셀 순서와 병합 기하 및 빈 내용을 유지한다', async () => {
  const state = setup('table', {
    block: {
      rows: 1000000000,
      columns: 1000000000,
      cells: [
        {
          source: { listNode: 91 },
          row: 50,
          column: 900,
          rowSpan: 2,
          columnSpan: 4,
          blocks: [
            { id: 's0:p1', type: 'paragraph', displayText: '첫째' },
            { id: 's0:p2', type: 'paragraph', displayText: '' },
          ],
        },
        {
          source: { listNode: 92 },
          blocks: [{ id: 's0:p3', type: 'paragraph', displayText: '둘째' }],
        },
      ],
    },
  });
  const result = await state.inspect();
  assert.ok(result.text.indexOf('첫째') < result.text.indexOf('둘째'));
  assert.match(result.text, /rowSpan: 2/);
  assert.match(result.text, /columnSpan: 4/);
});

test('관측 오류 행과 없는 상세 API는 상태와 출력에 조회 불가를 명시한다', async () => {
  for (const block of [
    {},
    { detailUnavailable: true, diagnostic: { code: 'UnsupportedSource' } },
  ]) {
    const state = setup('equation', { block });
    const result = await state.inspect();
    assert.equal(result.status, 'unavailable');
    assert.match(result.text, /상세 조회 불가:/);
    assert.match(result.text, /상태: unavailable/);
    assert.equal(state.closed(), 1);
  }
});

test('차트 상세는 실제 decoder 형태의 제목 계열 값만 표시하고 원본 짝을 검증한다', async () => {
  const detail = {
    kind: 'chart_display',
    pair: {
      wrapper_node: 10,
      section_ordinal: 0,
      chart_path: 'Chart/chart1.xml',
      declared_external: true,
    },
    rich_text: [{ owner_role: 'chart_title', text: '제목' }],
    series_text: [{ series_node: 1, text: '계열' }],
    points: [{ kind: 'numeric_cache', index: 0, value: '4.3' }],
  };
  const state = setup('chart', { sdk: { chartDisplay: () => detail } });
  const result = await state.inspect();
  assert.equal(result.status, 'available');
  for (const text of ['제목', '계열', '4.3', 'declared_external: true'])
    assert.ok(result.text.includes(text));
  detail.pair.wrapper_node = 11;
  await assert.rejects(state.inspect(), /InvalidObjectDetail/);
  assert.equal(state.closed(), 2);
});

test('OLE 상세 필드가 모두 미관측이면 빈 available 응답을 만들지 않는다', async () => {
  const state = setup('ole', {
    sdk: {
      oleSource: () => ({
        binary_item_id: null,
        object_type: null,
        draw_aspect: null,
        has_moniker: null,
      }),
    },
  });
  assert.equal((await state.inspect()).status, 'unavailable');
});

test('차트 값은 원본 계열 역할 결합을 유지하며 잘못된 결합은 거부한다', async () => {
  const detail = {
    kind: 'chart_display',
    pair: { wrapper_node: 10, section_ordinal: 0 },
    rich_text: [{ owner_role: 'axis_title', owner_node: 83, text: '축 제목' }],
    series_text: [],
    points: [
      { kind: 'numeric_cache', index: 0, value: '8' },
      { kind: 'numeric_cache', index: 0, value: '9' },
    ],
    bindings: [
      { point: 0, series_node: 20, plot_node: 11, role_node: 30, role: 'x_value' },
      { point: 1, series_node: 21, plot_node: 11, role_node: 31, role: 'y_value' },
    ],
  };
  const state = setup('chart', { sdk: { chartDisplay: () => detail } });
  const result = await state.inspect();
  for (const text of [
    'owner_node: 83',
    'series_node: 20',
    'series_node: 21',
    'role: x_value',
    'role: y_value',
  ])
    assert.ok(result.text.includes(text));
  detail.bindings.push({ point: 0 });
  await assert.rejects(state.inspect(), /InvalidObjectDetail/);
  assert.equal(state.closed(), 2);
});

test('상세 API 오류와 출력 예산 초과에서도 비동기 종료를 기다린다', async () => {
  let ended = false;
  const state = setup('equation', {
    sdk: { equationScript: () => 'x'.repeat(65536) },
    close: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      ended = true;
    },
  });
  await assert.rejects(state.inspect(), /ObjectDetailLimitExceeded/);
  assert.equal(ended, true);
  assert.equal(state.closed(), 1);
  const failed = setup('equation', {
    sdk: {
      equationScript: () => {
        throw new Error('지원 범위 밖');
      },
    },
  });
  assert.equal((await failed.inspect()).status, 'unavailable');
  assert.equal(failed.closed(), 1);
});

test('Markdown과 제어문자 상세 출력은 공통 표시 이스케이프를 사용한다', async () => {
  const state = setup('equation', { sdk: { equationScript: () => '<img>&\u202e' } });
  const result = await state.inspect({ format: 'markdown' });
  assert.ok(result.text.includes('\\<img\\>&amp;'));
  assert.ok(result.text.includes('\\\\u202e'));
});

test('상세 수집과 비동기 종료가 동시에 실패해도 양쪽 오류를 보존한다', async () => {
  const primary = new Error('수집 실패'),
    closing = new Error('종료 실패');
  const state = setup('equation', {
    close: async () => {
      throw closing;
    },
  });
  state.dependencies.readDocumentModel = async () => {
    throw primary;
  };
  await assert.rejects(state.inspect(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.message, 'DocumentObjectInspectionAndCloseFailed');
    assert.equal(error.cause, primary);
    assert.deepEqual(error.errors, [primary, closing]);
    return true;
  });
  const onlyClosing = setup('equation', {
    close: async () => {
      throw closing;
    },
  });
  await assert.rejects(
    onlyClosing.inspect(),
    (error) => error.message === 'DocumentObjectInspectionCloseFailed' && error.cause === closing,
  );
});
