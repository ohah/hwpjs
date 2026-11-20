// 실제 Surface·Canvas·bridge와 통제 Core 응답을 사용합니다. Native 실행 증거가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipboardBridge } from '../../../apps/demo/src/clipboard-bridge.ts';
import { getSelectionClipboard } from '@hwpjs/core';
import { createCanvasSurface } from '../src/surface.ts';
import { multiblockFixture, tick } from './multiblock-clipboard-fixture.mjs';
async function setup(t, readOnly = true, capabilityOnly = false) {
  const f = multiblockFixture();
  const paragraphs = f.state().content.paragraphs.map((p, n) => ({
    ...p,
    text: n === 0 ? '앞😀\n뒤' : p.text,
    editable: false,
    selectable: true,
    tableCell: { tableNode: 1, listNode: n + 2 },
  }));
  f.install({
    content: { ...f.state().content, paragraphs, readOnly: !capabilityOnly && readOnly },
    capabilities: { ...f.state().capabilities, readOnly: capabilityOnly && readOnly },
  });
  f.editor.update = async (fn) => fn();
  f.editor.dispatchCommand = async () => {
    throw Error('읽기 전용 변경 명령 금지');
  };
  const writes = [];
  const clipboard = {
    writeText: async (text) => {
      writes.push(text);
    },
  };
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    environment: { clipboard },
  });
  t.after(async () => {
    while (f.waits.length) f.reject();
    await tick();
    await surface.dispose();
  });
  f.pointer('pointerdown', 0, 1);
  f.pointer('pointerup', 0, 1);
  await tick();
  // 초기 포인터 권한 응답을 마친 상태에서 Home 뒤의 새 조회만 분리합니다.
  while (f.waits.length) {
    f.reject();
    await tick();
  }
  const key = (key, shiftKey = false) => {
    const e = new Event('keydown', { cancelable: true });
    Object.assign(e, { key, shiftKey });
    f.input().dispatchEvent(e);
    return e;
  };
  return { f, surface, clipboard, writes, key };
}
for (const capabilityOnly of [false, true])
  test(
    'readonly ' +
      (capabilityOnly ? 'capabilities' : 'content') +
      ' 셀의 빠른 Home/Right/ShiftRight는 UTF16 선택과 복사만 허용한다',
    async (t) => {
      const { f, surface, clipboard, writes, key } = await setup(t, true, capabilityOnly);
      const count = f.requests.length;
      key('Home');
      key('ArrowRight');
      key('ArrowRight', true);
      assert.deepEqual([f.input().selectionStart, f.input().selectionEnd], [1, 3]);
      assert.equal(f.input().value, '앞😀\n뒤');
      assert.equal(f.input().readOnly, true);
      assert.equal(f.requests.length, count, 'readonly 선택에 새 편집권한 조회가 없어야 합니다');
      await tick();
      assert.equal(getSelectionClipboard(f.state()).copyReason, null);
      const bridge = createClipboardBridge({
        editor: f.editor,
        clipboard,
        getSurface: () => surface,
        onStatus() {},
      });
      t.after(() => bridge.dispose());
      assert.equal(bridge.getPresentation().actions.copy.enabled, true);
      assert.equal(bridge.getPresentation().actions.cut.enabled, false);
      assert.equal(await bridge.action({ command: 'copy' }), true);
      assert.deepEqual(writes, ['😀']);
      assert.equal(await bridge.action({ command: 'cut' }), true);
      assert.deepEqual(writes, ['😀']);
      assert.equal(f.requests.length, count);
    },
  );
test('쓰기 문서의 부분 편집 범위 조회와 pending 탐색 가드는 그대로 유지한다', async (t) => {
  const { f, key } = await setup(t, false);
  const count = f.requests.length;
  key('Home');
  await tick();
  assert.equal(f.requests.length, count + 1);
  assert.equal(f.requests.at(-1).kind, 'query-edit-range');
  key('ArrowRight');
  assert.deepEqual([f.input().selectionStart, f.input().selectionEnd], [0, 0]);
});
test('readonly 복사의 실제 플랫폼 쓰기 실패는 선택·본문·명령을 바꾸지 않는다', async (t) => {
  const { f, surface, key } = await setup(t);
  key('Home');
  key('ArrowRight');
  key('ArrowRight', true);
  await tick();
  const before = f.state(),
    range = [f.input().selectionStart, f.input().selectionEnd],
    count = f.requests.length,
    status = [];
  const clipboard = {
    writeText: async () => {
      const e = new Error('거부');
      e.name = 'NotAllowedError';
      throw e;
    },
  };
  const bridge = createClipboardBridge({
    editor: f.editor,
    clipboard,
    getSurface: () => surface,
    onStatus: (m) => status.push(m),
  });
  t.after(() => bridge.dispose());
  await bridge.action({ command: 'copy' });
  assert.deepEqual(status, ['ClipboardWritePermissionDenied']);
  assert.equal(f.state(), before);
  assert.deepEqual([f.input().selectionStart, f.input().selectionEnd], range);
  assert.equal(f.input().value, '앞😀\n뒤');
  assert.equal(f.requests.length, count);
});
test('readonly에서도 폐기된 lease는 키 탐색의 ready/busy 가드를 통과하지 않는다', async (t) => {
  const { f, key } = await setup(t);
  f.revoke();
  key('Home');
  key('ArrowRight');
  assert.deepEqual([f.input().selectionStart, f.input().selectionEnd], [1, 1]);
  assert.equal(f.requests.length, 0);
});
test('readonly로 새 load가 되면 이전 쓰기 문서 범위 허가를 재사용하지 않는다', async (t) => {
  const { f, key } = await setup(t, false);
  f.install({
    content: { ...f.state().content, readOnly: true },
    operationRevision: f.state().operationRevision + 1,
    selection: null,
  });
  f.pointer('pointerdown', 0, 1);
  f.pointer('pointerup', 0, 1);
  await tick();
  const count = f.requests.length;
  key('Home');
  key('ArrowRight');
  key('ArrowRight', true);
  assert.deepEqual([f.input().selectionStart, f.input().selectionEnd], [1, 3]);
  assert.equal(f.requests.length, count);
  assert.equal(f.input().readOnly, true);
});
for (const readOnly of [true, false])
  test(
    '이미 선택된 sourceCell mount는 ' +
      (readOnly ? 'readonly 조회를 발행하지 않는다' : '부분 편집 조회를 유지한다'),
    async (t) => {
      const f = multiblockFixture();
      const content = {
        ...f.state().content,
        readOnly,
        paragraphs: f.state().content.paragraphs.map((p, n) => ({
          ...p,
          text: n === 0 ? '앞😀뒤' : p.text,
          editable: false,
          selectable: true,
          tableCell: { tableNode: 1, listNode: n + 2 },
        })),
      };
      f.install({ content, capabilities: { ...f.state().capabilities, readOnly } });
      f.install({
        selection: {
          ...f.state().token,
          format: 'hwpx',
          coordinateSpace: 'display',
          owner: 'section:0:table:1:list:2',
          section: 0,
          paragraph: 0,
          startUnit: 1,
          endUnit: 3,
          affinity: 'forward',
        },
      });
      let surface;
      t.after(async () => {
        while (f.waits.length) f.reject();
        await tick();
        await surface?.dispose();
      });
      surface = createCanvasSurface({ root: f.root, editor: f.editor });
      await tick();
      assert.equal(f.input().value, '앞😀뒤');
      assert.deepEqual([f.input().selectionStart, f.input().selectionEnd], [1, 3]);
      assert.equal(f.input().readOnly, true);
      if (readOnly) assert.equal(f.requests.length, 0);
      else assert.equal(f.requests[0]?.kind, 'query-edit-range');
    },
  );
test('쓰기 문서에서 새 문서·generation의 readonly로 reload하면 이전 선택과 쓰기 관측을 폐기한다', async (t) => {
  const { f, key } = await setup(t, false);
  key('Home');
  await tick();
  assert.equal(f.requests.at(-1).kind, 'query-edit-range');
  while (f.waits.length) {
    f.reject();
    await tick();
  }
  const before = f.state();
  f.install({
    documentId: 'readonly-reloaded',
    generation: before.generation + 1,
    operationRevision: 0,
    viewRevision: 0,
    selection: null,
    content: { ...before.content, readOnly: true },
    capabilities: { ...before.capabilities, readOnly: true },
  });
  const count = f.requests.length;
  assert.equal(f.input().disabled, true);
  f.pointer('pointerdown', 0, 1);
  f.pointer('pointerup', 0, 1);
  await tick();
  key('Home');
  key('ArrowRight');
  key('ArrowRight', true);
  await tick();
  assert.equal(f.state().documentId, 'readonly-reloaded');
  assert.deepEqual([f.input().selectionStart, f.input().selectionEnd], [1, 3]);
  assert.equal(f.requests.length, count);
  assert.equal(f.input().readOnly, true);
  assert.equal(getSelectionClipboard(f.state()).copyReason, null);
  assert.notEqual(getSelectionClipboard(f.state()).editReason, null);
});
