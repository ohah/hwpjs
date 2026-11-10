import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApiPlayground, apiSelectionTarget, apiSampleCode } from '../src/api-playground.mjs';
import { findTextMatch, createParagraphSelection } from '@hwpjs/core';
import { getTableInsertAvailability } from '../../../packages/core/src/commands/table-insert.ts';
import {
  validateSelection,
  selectionMessage,
} from '../../../packages/core/src/commands/selection.ts';
function setup(rows, query = getTableInsertAvailability) {
  let state = {
    editorId: 'test',
    documentId: 'doc',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
    stateVersion: 0,
    status: 'ready',
    nativeHistoryRevision: 0,
    content: {
      format: 'hwp5',
      paragraphs: rows,
      tableCreationAvailable: true,
      tableCreationResources: { paragraph: [0], character: [0], style: [0], border_fill: [0] },
    },
    selection: null,
  };
  Object.defineProperty(state, 'token', {
    get() {
      return {
        editorId: this.editorId,
        documentId: this.documentId,
        generation: this.generation,
        operationRevision: this.operationRevision,
        viewRevision: this.viewRevision,
      };
    },
    enumerable: true,
  });
  const calls = [];
  const editor = {
    getEditorState: () => state,
    read: (f) => f(state),
    setSelection: async (target) => {
      validateSelection(target, state);
      calls.push({ kind: 'selection', target });
      state.selection = target;
      return state;
    },
    dispatchCommand: async (_command, payload) => {
      const message = selectionMessage(payload.target, state);
      calls.push({ kind: 'splice', target: payload.target, message });
      return { status: 'committed', error: null };
    },
  };
  return {
    state,
    calls,
    api: createApiPlayground({
      editor,
      spliceCommand: {},
      loadFixture: async () => new Uint8Array(),
      getHistoryAvailability: () => ({ canUndo: false, canRedo: false }),
      createParagraphSelection,
      getTableInsertAvailability: query,
    }),
  };
}
const body = (paragraph, text = '본문값') => ({
  section: 0,
  paragraph,
  text,
  editable: true,
  selectionOwner: 'section:0:body',
  currentReference: { epoch: '1', scope: '1', kind: 'original', section: 0, id: String(paragraph) },
});
const cell = (paragraph, text = '셀문자') => ({
  section: 0,
  paragraph,
  text,
  editable: true,
  selectionOwner: null,
  tableCell: { tableNode: 10 + paragraph, listNode: 20 + paragraph },
  currentReference: { epoch: 'unit', id: paragraph },
});
test('기존 body 임의범위와 중복본문·빈본문 경로를 보존한다', async () => {
  const f = setup([body(0), body(1), body(2, '')]);
  assert.equal((await f.api.execute('select', { paragraph: 1, start: 1, end: 2 })).ok, true);
  assert.equal(f.calls[0].target.paragraph, 1);
  assert.equal((await f.api.execute('select', { paragraph: 2, start: 0, end: 0 })).ok, true);
  assert.equal(f.calls[1].target.endUnit, 0);
});
test('표 셀 null owner는 공식 find target으로 select·splice하고 Native참조를 바꾸지 않는다', async () => {
  const row = cell(0),
    f = setup([row]);
  assert.equal((await f.api.execute('select', { paragraph: 0, start: 1, end: 2 })).ok, true);
  assert.equal(
    f.calls[0].target.owner,
    findTextMatch(f.state, row.text, { origin: 'document' })?.owner,
  );
  assert.equal(
    (await f.api.execute('splice', { paragraph: 0, start: 0, end: 1, text: 'X' })).ok,
    true,
  );
  assert.equal(f.calls[1].message.reference, row.currentReference);
  assert.equal(f.calls[1].message.startUnit, 0);
  assert.equal(f.calls[1].message.endUnit, 1);
});
test('동일문자열의 다른 셀도 위치 기반 공식 issuer로 정확히 선택한다', async () => {
  const f = setup([cell(0), cell(1)]);
  const result = await f.api.execute('select', { paragraph: 1, start: 1, end: 2 });
  assert.equal(result.ok, true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].target.paragraph, 1);
  assert.equal(f.calls[0].target.owner, 'section:0:table:11:list:21');
});
test('미지 owner·상충 소유권은 공식 issuer가 거부하며 쓰기0이다', async () => {
  for (const row of [
    { ...body(0), selectionOwner: null },
    { ...cell(0), drawingText: { drawingNode: 1, listNode: 2 } },
  ]) {
    const f = setup([row]);
    const result = await f.api.execute('splice', { paragraph: 0, start: 0, end: 0, text: 'X' });
    assert.equal(result.ok, false);
    assert.equal(f.calls.length, 0);
  }
});
test('분수·음수·행끝 초과와 half-surrogate 거부를 우회하지 않는다', async () => {
  for (const args of [
    { start: -1, end: 0 },
    { start: 0.5, end: 1 },
    { start: 0, end: 99 },
    { start: 2, end: 3 },
  ]) {
    const f = setup([cell(0, 'A😀B')]);
    const result = await f.api.execute('select', { paragraph: 0, ...args });
    assert.equal(result.ok, false);
    assert.equal(f.calls.length, 0);
  }
});
test('공식 target의 snapshot 세대는 재작성하지 않아 stale token이 거부된다', async () => {
  const f = setup([cell(0)]);
  const issuer = (state) => {
    const match = createParagraphSelection(state, {
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 1,
      affinity: 'forward',
    });
    state.generation++;
    return match;
  };
  const api = createApiPlayground({
    editor: {
      getEditorState: () => f.state,
      read: (fn) => fn(f.state),
      setSelection: async (target) => validateSelection(target, f.state),
    },
    spliceCommand: {},
    getHistoryAvailability: () => ({}),
    createParagraphSelection: issuer,
  });
  const result = await api.execute('select', { paragraph: 0, start: 0, end: 1 });
  assert.equal(result.error, 'StaleTarget');
  assert.equal(f.calls.length, 0);
});

test('표시 예제는 실행 target 함수 원문과 같은 공개 find 의존성을 사용한다', () => {
  for (const operation of ['select', 'splice', 'getTableInsertAvailability']) {
    const code = apiSampleCode(operation, {
      section: 0,
      paragraph: 1,
      start: 0,
      end: 1,
      text: 'X',
    });
    assert.ok(code.includes(apiSelectionTarget.toString()));
    assert.ok(code.includes('createParagraphSelection'));
    assert.ok(code.includes('createTarget(editor, args, createParagraphSelection)'));
    if (operation === 'splice') assert.ok(code.includes('const text = args.text'));
  }
});

test('빈 원본 셀은 검색 문자열 없이 canonical 좌표로 선택·수정 대상을 발급한다', async () => {
  const f = setup([cell(0, '')]);
  assert.equal((await f.api.execute('select', {})).ok, true);
  assert.equal((await f.api.execute('splice', { text: 'X' })).ok, true);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].target.owner, 'section:0:table:10:list:20');
});

test('표 삽입 조회는 실제 Core 검증을 호출하며 선택·문서를 바꾸지 않는다', async () => {
  const f = setup([body(0)]);
  const result = await f.api.execute('getTableInsertAvailability', {});
  assert.equal(result.ok, true);
  assert.equal(result.result.allowed, true);
  assert.equal(result.result.reason, null);
  assert.deepEqual(result.result.resources, {
    paragraph: 0,
    character: 0,
    style: 0,
    border_fill: 0,
  });
  assert.deepEqual(result.before, result.after);
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.selection, null);
});

test('새 HWP5 문단의 미지원 참조도 정상 조회 결과로 반환하며 쓰기0이다', async () => {
  const row = {
    ...body(0),
    currentReference: { epoch: '1', scope: '1', kind: 'generated', section: 0, id: '17' },
  };
  const f = setup([row]);
  const result = await f.api.execute('getTableInsertAvailability', {});
  assert.equal(result.ok, true);
  assert.equal(result.result.allowed, false);
  assert.equal(result.result.reason, 'UnsupportedTableInsertReference');
  assert.equal(result.result.resources, null);
  assert.deepEqual(result.before, result.after);
  assert.equal(f.calls.length, 0);
});

test('없는 조회 API나 잘못된 좌표는 쓰기 없이 명시적으로 거부한다', async () => {
  const absent = setup([body(0)], null);
  assert.equal(
    (await absent.api.execute('getTableInsertAvailability', {})).error,
    'ApiTableInsertAvailabilityUnavailable',
  );
  const invalid = setup([body(0)]);
  assert.equal((await invalid.api.execute('getTableInsertAvailability', { start: -1 })).ok, false);
  assert.equal(absent.calls.length + invalid.calls.length, 0);
});
