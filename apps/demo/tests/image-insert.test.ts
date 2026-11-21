import { resolveCommandSupport } from '../src/command-support.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '../../../packages/core/src/state/editor-state.ts';
import { createCommand } from '../../../packages/core/src/commands/commands.ts';
import { createImageInsertPort } from '../src/image-insert-port.ts';
import { createImageInsertTool } from '../src/image-insert-tool.ts';
import {
  checkedInsertImageBytes,
  fittedInsertImageSize,
  insertImageSize,
  decodeInsertImageSize,
  imageInsertLimit,
} from '../src/image-insert-input.ts';
import { pictureUnits } from '../src/object-properties-input.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const png = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 2,
  viewRevision: 3,
};
function fixture(format = 'hwp5', text = 'abc') {
  const target = {
    ...token,
    coordinateSpace: 'display',
    format,
    owner: 'section:0:body',
    section: 0,
    paragraph: 0,
    startUnit: 1,
    endUnit: 1,
    affinity: 'forward',
  };
  const makeState = (extra: any = {}) =>
    new EditorState({
      ...token,
      status: 'ready',
      stateVersion: 8,
      nativeHistoryRevision: 4,
      nativeHistoryStats: { protocolVersion: 2 } as any,
      content: {
        format,
        imageInsertionAvailable: true,
        inlineObjectPlacementVersion: 1,
        paragraphs: [
          {
            section: 0,
            paragraph: 0,
            text,
            selectionOwner: 'section:0:body',
            editable: true,
            plainEditable: true,
            currentReference: { kind: 'original' },
          },
        ],
      },
      selection: target,
      ...extra,
    });
  let state = makeState(),
    settled = true,
    queries = 0;
  const listeners = new Set<() => void>(),
    writes: any[] = [],
    statuses: string[] = [];
  let response: any = { status: 'committed-with-snapshot' },
    query: any;
  const observed = {
    ...token,
    coordinateSpace: 'inline-object',
    format: 'hwpx',
    address: {
      section: 0,
      paragraph: 1,
      unit: text.length,
      expected_text: text,
      owner: { kind: 'body', binding: { session: 's7', revision: 4, serial: '8' } },
    },
  };
  const editor: any = {
    getEditorState: () => state,
    registerStateListener: (f: () => void) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    getInlineObjectInsertTarget: async () => {
      queries++;
      return query ? await query : observed;
    },
    dispatchCommand: async (command: any, payload: any) => {
      writes.push({ command, payload });
      return await response;
    },
  };
  const core = { INSERT_IMAGE_COMMAND: createCommand<any>('insert-image') };
  const caret = () =>
    settled
      ? {
          state,
          selector: { section: 0, paragraph: 1 },
          unit: text.length,
          expected_text: text,
          current: () => settled,
        }
      : null;
  const port = createImageInsertPort(editor, core, caret);
  return {
    editor,
    core,
    caret,
    port,
    writes,
    statuses,
    observed,
    makeState,
    setState(next: EditorState) {
      state = next;
      for (const f of listeners) f();
    },
    setSettled(v: boolean) {
      settled = v;
    },
    setResponse(v: any) {
      response = v;
    },
    setQuery(v: any) {
      query = v;
    },
    queries: () => queries,
  };
}
const payload = () => ({ imageBytes: png(), width: 7200, height: 3600 });
const tick = () => new Promise((r) => setTimeout(r, 0));
function ui(format = 'hwp5', decode: any = async () => ({ width: 96, height: 48 })) {
  const h = fixture(format),
    dom = documentFixture();
  let closed = 0;
  const tool = createImageInsertTool({
    root: dom.root as any,
    editor: h.editor,
    core: h.core,
    captureCaret: h.caret as any,
    decode,
    onStatus: (t) => h.statuses.push(t),
    onPresentationChange() {},
    onClose() {
      closed++;
    },
  });
  return {
    ...h,
    ...dom,
    tool,
    closed: () => closed,
    async select(read: any = async () => png().buffer, size = 9) {
      const f = dom.role('image-insert-file') as any;
      f.files = [{ size, arrayBuffer: read }];
      fire(f, 'change');
      await tick();
    },
  };
}

test('파일 종류와 8 MiB 바이트 경계를 검증하고 독립 복사', () => {
  const bytes = png(),
    copy = checkedInsertImageBytes(bytes);
  bytes[0] = 0;
  assert.equal(copy[0], 137);
  assert.throws(() => checkedInsertImageBytes(bytes), /Unsupported/);
  assert.throws(() => checkedInsertImageBytes(new Uint8Array(imageInsertLimit + 1)), /Limit/);
  const max = new Uint8Array(imageInsertLimit);
  max.set(png());
  assert.equal(checkedInsertImageBytes(max).length, imageInsertLimit);
  assert.equal(checkedInsertImageBytes(new Uint8Array([255, 216, 255])).length, 3);
});
test('decoded 픽셀의 비율과 최대 제안 크기 및 직접 mm 입력', () => {
  assert.deepEqual(fittedInsertImageSize(96, 48), { width: 7200, height: 3600 });
  const fit = fittedInsertImageSize(4000, 2000);
  assert.equal(fit.width, pictureUnits('150'));
  assert(Math.abs(fit.width / fit.height - 2) < 0.001);
  assert.throws(() => fittedInsertImageSize(0, 1));
  assert.deepEqual(
    insertImageSize(
      {
        width: '50.8',
        height: '12.7',
        dirty: { width: true, height: false },
        aspectRatio: 'width',
      },
      { width: 7200, height: 3600 },
    ),
    { width: 14400, height: 7200 },
  );
  assert.throws(() =>
    insertImageSize({ width: '9999999999', height: '1' }, { width: 1, height: 1 }),
  );
});
test('기존 bitmap 자원은 크기 확인 성공과 오류 모두 close', async () => {
  let closed = 0;
  assert.deepEqual(
    await decodeInsertImageSize(png(), async () => ({
      width: 96,
      height: 48,
      close() {
        closed++;
      },
    })),
    { width: 96, height: 48 },
  );
  await assert.rejects(
    decodeInsertImageSize(png(), async () => ({
      width: 0,
      height: 48,
      close() {
        closed++;
      },
    })),
  );
  assert.equal(closed, 2);
});
test('HWP5 현재 SelectionTarget으로 명령을 한 번만 전달', async () => {
  const h = fixture(),
    capture = await h.port.capture(),
    options = payload();
  await h.port.insert(capture, options);
  options.imageBytes[0] = 0;
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].command, h.core.INSERT_IMAGE_COMMAND);
  assert.equal(h.writes[0].payload.target.coordinateSpace, 'display');
  assert.equal(h.writes[0].payload.selectionVersion, 8);
  assert.equal(h.writes[0].payload.options.imageBytes[0], 137);
  await assert.rejects(h.port.insert(capture, payload()), /Stale/);
  assert.equal(h.writes.length, 1);
});
test('빈 본문도 HWPX Native owner 조회 후 원본 단위와 문자열 유지', async () => {
  const h = fixture('hwpx', ''),
    capture = await h.port.capture();
  assert.equal(h.queries(), 1);
  await h.port.insert(capture, payload());
  assert.equal(h.writes[0].payload.target.address.unit, 0);
  assert.equal(h.writes[0].payload.target.address.expected_text, '');
});
test('HWPX 앵커 접두부를 제거하거나 새 target을 추측하지 않음', async () => {
  const h = fixture('hwpx', '\u0002\u0002TEXT'),
    capture = await h.port.capture();
  await h.port.insert(capture, payload());
  assert.equal(h.writes[0].payload.target.address.expected_text, '\u0002\u0002TEXT');
  assert.equal(h.writes[0].payload.target.address.unit, 6);
});
test('셀 owner는 새 그림 삽입 대상으로 거부', async () => {
  const h = fixture('hwpx');
  (h.observed.address.owner as any) = {
    kind: 'sourceCell',
    binding: { session: 's7', revision: 4, serial: '8' },
    table_node: 1,
    list_node: 2,
  };
  await assert.rejects(h.port.capture(), /UnsupportedPictureInsertionHost/);
  assert.equal(h.writes.length, 0);
});
for (const reason of ['document', 'selection', 'ime'])
  test('포트 제출 전 ' + reason + ' 변경 거부', async () => {
    const h = fixture(),
      capture = await h.port.capture();
    if (reason === 'ime') h.setSettled(false);
    else
      h.setState(h.makeState(reason === 'document' ? { documentId: 'new' } : { stateVersion: 9 }));
    await assert.rejects(h.port.insert(capture, payload()), /Stale/);
    assert.equal(h.writes.length, 0);
  });
test('비동기 Native owner 조회 도중 문서 변경 거부', async () => {
  const h = fixture('hwpx');
  let finish: any;
  h.setQuery(new Promise((r) => (finish = r)));
  const pending = h.port.capture();
  h.setState(h.makeState({ documentId: 'new' }));
  finish(h.observed);
  await assert.rejects(pending, /Stale/);
  assert.equal(h.writes.length, 0);
});
for (const extra of [
  { content: { format: 'hwp5', imageInsertionAvailable: false } },
  { content: { format: 'hwp5', imageInsertionAvailable: true, readOnly: true } },
  { historyRecoveryRequired: true },
  { nativeHistoryStats: { protocolVersion: 1 } },
  { content: { format: 'hwp5', imageInsertionAvailable: true, limited: true } },
])
  test('구형 엔진 또는 보호 상태의 포트 거부 ' + JSON.stringify(extra), async () => {
    const h = fixture();
    h.setState(h.makeState(extra));
    assert.equal(h.port.presentation().enabled, false);
    await assert.rejects(h.port.capture());
    assert.equal(h.writes.length, 0);
  });
test('실제 파일 선택 초안과 크기 입력에서 단일 명령까지', async () => {
  const h = ui();
  await h.tool.open();
  assert.equal((h.role('image-insert-file') as any).type, 'file');
  assert.match((h.role('image-insert-file') as any).accept, /image\/png/);
  await h.select();
  assert.equal(h.role('image-insert-width').value, '25.4');
  assert.equal(h.role('image-insert-height').value, '12.7');
  h.role('image-insert-width').value = '50.8';
  fire(h.role('image-insert-width'), 'input');
  assert.equal(h.role('image-insert-height').value, '25.4');
  fire(h.role('image-insert-confirm'), 'click');
  fire(h.role('image-insert-confirm'), 'click');
  await tick();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].payload.options.width, 14400);
  assert.equal(h.writes[0].payload.options.height, 7200);
  assert.deepEqual(h.statuses, ['그림을 삽입했습니다.']);
  h.tool.dispose();
});
test('UI decode 대기 중 문서가 바뀌면 제출과 옛 문서 상태 메시지 거부', async () => {
  let finish: any;
  const h = ui('hwp5', () => new Promise((r) => (finish = r)));
  await h.tool.open();
  await h.select();
  h.setState(h.makeState({ documentId: 'new' }));
  finish({ width: 96, height: 48 });
  await tick();
  assert.equal(h.role('image-insert-confirm').disabled, true);
  fire(h.role('image-insert-confirm'), 'click');
  assert.equal(h.writes.length, 0);
  assert.deepEqual(h.statuses, []);
  h.tool.dispose();
});
test('파일 교체의 늦은 decode 결과가 최신 초안을 덮지 않음', async () => {
  let finish: any,
    calls = 0;
  const h = ui('hwp5', () =>
    ++calls === 1 ? new Promise((r) => (finish = r)) : Promise.resolve({ width: 192, height: 96 }),
  );
  await h.tool.open();
  await h.select();
  await h.select();
  finish({ width: 96, height: 48 });
  await tick();
  assert.equal(h.role('image-insert-width').value, '50.8');
  h.tool.dispose();
});
test('IME 조합과 key229 중 확인 클릭으로 명령이 나가지 않음', async () => {
  const h = ui();
  await h.tool.open();
  await h.select();
  fire(h.role('image-insert-dialog'), 'compositionstart');
  fire(h.role('image-insert-confirm'), 'click');
  assert.equal(h.writes.length, 0);
  fire(h.role('image-insert-dialog'), 'compositionend');
  fire(h.role('image-insert-dialog'), 'keydown', { keyCode: 229 });
  fire(h.role('image-insert-confirm'), 'click');
  assert.equal(h.writes.length, 0);
  fire(h.role('image-insert-dialog'), 'keyup', { keyCode: 13 });
  fire(h.role('image-insert-confirm'), 'click');
  await tick();
  assert.equal(h.writes.length, 1);
  h.tool.dispose();
});
test('취소 뒤 파일 읽기가 끝나도 새 창이나 명령을 만들지 않음', async () => {
  let finish: any;
  const h = ui();
  await h.tool.open();
  await h.select(() => new Promise((r) => (finish = r)));
  fire(h.role('image-insert-cancel'), 'click');
  finish(png().buffer);
  await tick();
  assert.equal(h.root.children.length, 0);
  assert.equal(h.writes.length, 0);
  h.tool.dispose();
});
test('초과 파일은 읽기나 decode 전에 거부', async () => {
  const h = ui();
  let reads = 0;
  await h.tool.open();
  await h.select(async () => {
    reads++;
    return png().buffer;
  }, imageInsertLimit + 1);
  assert.equal(reads, 0);
  assert.match(h.role('image-insert-status').textContent, /8 MiB/);
  assert.equal(h.role('image-insert-confirm').disabled, true);
  h.tool.dispose();
});
test('refresh-required는 재시도 없이 결과 확인 안내', async () => {
  const h = ui();
  h.setResponse({ status: 'committed-refresh-required' });
  await h.tool.open();
  await h.select();
  fire(h.role('image-insert-confirm'), 'click');
  await tick();
  assert.equal(h.writes.length, 1);
  assert.match(h.statuses[0], /다시 삽입하지 마세요/);
  assert.equal(h.root.children.length, 0);
  h.tool.dispose();
});
test('알 수 없는 dispatch 실패도 capture를 소진하고 한 번만 호출', async () => {
  const h = ui();
  h.setResponse({
    then(_resolve: any, reject: any) {
      reject(Error('lost transport'));
    },
  });
  await h.tool.open();
  await h.select();
  fire(h.role('image-insert-confirm'), 'click');
  await tick();
  assert.equal(h.writes.length, 1);
  assert.match(h.statuses[0], /결과를 확인할 수 없습니다/);
  assert.equal(h.root.children.length, 0);
  h.tool.dispose();
});

test('파일 decode 실패는 명령 없이 한국어 안내', async () => {
  const h = ui('hwp5', async () => {
    throw Error('decode');
  });
  await h.tool.open();
  await h.select();
  assert.equal(h.writes.length, 0);
  assert.equal(h.role('image-insert-confirm').disabled, true);
  assert.match(h.role('image-insert-status').textContent, /그림/);
  h.tool.dispose();
});
test('도구 종료 뒤 늦은 decode 결과는 무효', async () => {
  let finish: any;
  const h = ui('hwp5', () => new Promise((r) => (finish = r)));
  await h.tool.open();
  await h.select();
  h.tool.dispose();
  finish({ width: 96, height: 48 });
  await tick();
  assert.equal(h.root.children.length, 0);
  assert.equal(h.writes.length, 0);
});
test('dispatch 중 새 문서를 열면 옛 결과 메시지나 focus를 전달하지 않음', async () => {
  let finish: any;
  const h = ui();
  h.setResponse(new Promise((r) => (finish = r)));
  await h.tool.open();
  await h.select();
  fire(h.role('image-insert-confirm'), 'click');
  h.setState(h.makeState({ documentId: 'new' }));
  finish({ status: 'committed-with-snapshot' });
  await tick();
  assert.deepEqual(h.statuses, []);
  assert.equal(h.closed(), 0);
  assert.equal(h.writes.length, 1);
  h.tool.dispose();
});
test('정상 commit의 새 state에도 같은 문서 focus 복원', async () => {
  let finish: any;
  const h = ui();
  h.setResponse(new Promise((r) => (finish = r)));
  await h.tool.open();
  await h.select();
  fire(h.role('image-insert-confirm'), 'click');
  h.setState(h.makeState({ stateVersion: 9, operationRevision: 3 }));
  finish({ status: 'committed-with-snapshot' });
  await tick();
  assert.equal(h.closed(), 1);
  assert.equal(h.writes.length, 1);
  h.tool.dispose();
});

test('빈 HWPX 본문의 Native 대상 준비 상태는 기존 shell 위치 검사와 연결', async () => {
  const h = fixture('hwpx', '');
  h.setState(h.makeState({ selection: undefined }));
  const availability = h.port.presentation();
  assert.equal(availability.enabled, true);
  assert.equal(
    resolveCommandSupport('insert-image', {
      connected: true,
      document: 'ready',
      hasSelection: false,
      availability,
    }).enabled,
    true,
  );
  const capture = await h.port.capture();
  await h.port.insert(capture, payload());
  assert.equal(h.writes.length, 1);
});
test('그림 surface 위치 증명이 없으면 일반 위치 거부를 우회하지 않음', () => {
  assert.equal(
    resolveCommandSupport('insert-image', {
      connected: true,
      document: 'ready',
      hasSelection: false,
      availability: { enabled: true },
    }).kind,
    'missing-selection',
  );
});
