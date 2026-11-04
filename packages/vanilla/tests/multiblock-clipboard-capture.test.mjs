// 클립보드와 Core 대기를 통제하는 실제 Canvas/Surface 선택 수명 회귀이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { createClipboardBridge } from '../../../apps/demo/src/clipboard-bridge.ts';
import { multiblockFixture, tick } from './multiblock-clipboard-fixture.mjs';
test('코어 상태가 같은 다문단 선택 변경은 처음 선택을 다른 범위로 오려두지 않는다', async () => {
  const f = multiblockFixture();
  let releaseUpdate, releaseWrite;
  const writes = [];
  const clipboard = {
    writeText: (text) => {
      writes.push(text);
      return new Promise((resolve) => {
        releaseWrite = resolve;
      });
    },
  };
  f.editor.update = () =>
    new Promise((resolve) => {
      releaseUpdate = resolve;
    });
  f.editor.dispatchCommand = () => {
    throw Error('단일 대상 위조 금지');
  };
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    environment: { clipboard },
  });
  const bridge = createClipboardBridge({
    editor: f.editor,
    clipboard,
    getSurface: () => surface,
    onStatus: () => {},
  });
  try {
    await f.selectA();
    assert.equal(
      surface.canTransferSelection(true, clipboard),
      true,
      '첫 다문단 선택이 실제 전송 가능해야 한다',
    );
    const before = f.state();
    assert.equal(before.selection, null);
    const task = bridge.action({ command: 'cut' });
    assert.equal(typeof releaseUpdate, 'function', '기존 코어 갱신 장벽 유지');
    await f.selectB();
    assert.equal(f.state(), before, '선택만 바뀌고 코어 관측은 동일한 반례 전제');
    releaseUpdate();
    await tick();
    releaseWrite?.();
    await task;
    await tick();
    assert.deepEqual(writes, [], '최초 선택이 변경되면 쓰기 전 거부해야 한다');
    assert.equal(f.requests.length, 0, '다른 범위 삭제 요청 없음');
  } finally {
    bridge.dispose();
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
});
