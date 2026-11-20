// 실제 공용 bridge와 통제 Surface 응답 검사입니다. 실제 Native/clipboard 증거가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipboardBridge } from '../src/clipboard-bridge.ts';
function fixture(run) {
  const statuses = [],
    results = [];
  let transfers = 0,
    updates = 0;
  const state = { status: 'ready', documentId: 'owned', selection: null, stateVersion: 1 };
  const editor = {
    getEditorState: () => state,
    update: async () => {
      updates++;
    },
    dispatchCommand: async () => {
      throw Error('예상치못한편집');
    },
  };
  const surface = {
    canTransferSelection: () => true,
    captureTransferSelection: (options) => async () => {
      transfers++;
      return run(options);
    },
  };
  const bridge = createClipboardBridge({
    editor,
    clipboard: { writeText: async () => {} },
    getSurface: () => surface,
    onStatus: (m) => statuses.push(m),
    onResult: (r) => results.push(r),
  });
  return { bridge, statuses, results, surface, transfers: () => transfers, updates: () => updates };
}
test('Surface 상세 쓰기 거부를 generic 상태로 덮지 않고 한 번 전달한다', async () => {
  const f = fixture((o) => {
    o.onStatus?.('ClipboardWritePermissionDenied');
    return false;
  });
  await f.bridge.action({ command: 'cut' });
  assert.deepEqual(f.statuses, ['ClipboardWritePermissionDenied']);
  assert.deepEqual(f.results, []);
  assert.equal(f.transfers(), 1);
  f.bridge.dispose();
});
test('target 선행거부는 실제 쓰기 거부와 구분한다', async () => {
  const f = fixture((o) => {
    o.onStatus?.('CreatedCellClipboardTargetMismatch');
    return false;
  });
  await f.bridge.action({ command: 'cut' });
  assert.deepEqual(f.statuses, ['CreatedCellClipboardTargetMismatch']);
  assert.deepEqual(f.results, []);
  f.bridge.dispose();
});
test('상세 보고가 없는 기존 Surface false는 기존 fallback 한 번이다', async () => {
  const f = fixture(() => false);
  await f.bridge.action({ command: 'copy' });
  assert.deepEqual(f.statuses, ['SurfaceClipboardNotApplied']);
  f.bridge.dispose();
});
test('중복 보고는 최초 실패를 보존하며 공개 Core result는 원 객체다', async () => {
  const result = {
    status: 'rejected-unapplied',
    error: 'StaleCreatedCellTextTarget',
    state: { status: 'ready' },
  };
  const f = fixture((o) => {
    o.onStatus?.('StaleCreatedCellTextTarget');
    o.onStatus?.('후행메시지');
    o.onResult?.(result);
    return false;
  });
  await f.bridge.action({ command: 'cut' });
  assert.deepEqual(f.statuses, ['rejected-unapplied: StaleCreatedCellTextTarget']);
  assert.equal(f.results.length, 1);
  assert.equal(f.results[0], result);
  assert.equal(f.transfers(), 1);
  f.bridge.dispose();
});
test('불확실한 반영 결과와 오류도 재시도 없이 한 번 반환한다', async () => {
  const result = {
    status: 'committed-refresh-required',
    error: 'HistoryReloadRequired',
    state: { status: 'refresh-required' },
  };
  const f = fixture((o) => {
    o.onResult?.(result);
    o.onStatus?.(result.error);
    return false;
  });
  await f.bridge.action({ command: 'cut' });
  assert.deepEqual(f.statuses, ['committed-refresh-required: HistoryReloadRequired']);
  assert.equal(f.results[0], result);
  assert.equal(f.transfers(), 1);
  f.bridge.dispose();
});
test('capture가 무효화되면 실행 전에 stale report 한 번만 전달한다', async () => {
  const f = fixture(() => {
    throw Error('실행금지');
  });
  f.surface.captureTransferSelection = () => null;
  await f.bridge.action({ command: 'cut' });
  assert.deepEqual(f.statuses, ['SurfaceClipboardSelectionStale']);
  assert.equal(f.transfers(), 0);
  assert.equal(f.updates(), 0);
  f.bridge.dispose();
});
test('관찰 콜백 오류가 원 Core 오류를 두 번째 메시지로 덮지 않는다', async () => {
  const statuses = [];
  const result = {
    status: 'rejected-unapplied',
    error: 'NativeRejected',
    state: { status: 'ready' },
  };
  const state = { status: 'ready', documentId: 'owned', selection: null, stateVersion: 1 };
  const surface = {
    canTransferSelection: () => true,
    captureTransferSelection: (o) => async () => {
      o.onResult?.(result);
      return false;
    },
  };
  const bridge = createClipboardBridge({
    editor: { getEditorState: () => state, update: async () => {} },
    clipboard: { writeText: async () => {} },
    getSurface: () => surface,
    onStatus: (m) => statuses.push(m),
    onResult: () => {
      throw Error('관찰실패');
    },
  });
  await bridge.action({ command: 'cut' });
  assert.deepEqual(statuses, ['rejected-unapplied: NativeRejected']);
  bridge.dispose();
});
