// 실제 Surface/Canvas/제품 clipboard bridge의 통제 회귀입니다. Native·GUI 증거가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipboardBridge } from '../../../apps/demo/src/clipboard-bridge.ts';
import { runCreatedClipboard, tick } from './created-cell-clipboard-fixture.mjs';
async function select(f, start = 1, end = 3) {
  f.pointer('pointerdown', 0, start);
  await tick();
  f.pointer('pointermove', 0, end);
  f.pointer('pointerup', 0, end);
  await tick();
}
for (const format of ['hwp5', 'hwpx'])
  test(format + ' 실제 단일 생성셀 선택은 공용 copy로 현재 본문만 전송한다', async () => {
    await runCreatedClipboard(format, async (f, s, click, { clipboard, writes }) => {
      await select(f);
      assert.equal(f.input().value, 'ABCD');
      assert.equal(f.state().selection, null);
      assert.equal(s.canTransferSelection(false, clipboard), true);
      const bridge = createClipboardBridge({
        editor: f.editor,
        clipboard,
        getSurface: () => s,
        onStatus: (m) => f.reports.push(m),
      });
      try {
        assert.equal(bridge.getPresentation().actions.copy.enabled, true);
        await bridge.action({ command: 'copy' });
        assert.deepEqual(writes, ['BC']);
        assert.equal(f.requests.length, 0);
      } finally {
        bridge.dispose();
      }
    });
  });
test('현재 Native owner·본문·geometry가 없으면 생성셀 clipboard를 거부한다', async () => {
  await runCreatedClipboard('hwpx', async (f, s, click, { clipboard, writes }) => {
    await select(f);
    const original = f.renderer.createdCellClipboardSource;
    f.renderer.createdCellClipboardSource = () => null;
    assert.equal(s.canTransferSelection(false, clipboard), false);
    assert.equal(s.captureTransferSelection({ clipboard }), null);
    f.renderer.createdCellClipboardSource = original;
    const transfer = s.captureTransferSelection({ clipboard });
    assert.equal(typeof transfer, 'function');
    f.renderer.createdCellClipboardSource = (p) => {
      const r = original(p);
      return r ? { ...r, paragraphId: r.paragraphId + 1 } : null;
    };
    assert.equal(await transfer(), false);
    assert.deepEqual(writes, []);
  });
});
for (const which of ['modal', 'foreign-focus', 'lease', 'state', 'document', 'layout'])
  test('선택 캡처 뒤 ' + which + ' 변경은 쓰기 전 거부한다', async () => {
    await runCreatedClipboard('hwpx', async (f, s, click, { clipboard, writes }) => {
      await select(f);
      const transfer = s.captureTransferSelection({ clipboard });
      assert.equal(typeof transfer, 'function');
      if (which === 'modal') f.setDialogs([f.dialog()]);
      if (which === 'foreign-focus') f.doc.activeElement = {};
      if (which === 'lease') f.revoke();
      if (which === 'state') f.install({ operationRevision: f.state().operationRevision + 1 });
      if (which === 'document') f.install({ documentId: 'foreign' });
      if (which === 'layout') f.renderer.layout = () => ({ rows: [], width: 800, height: 600 });
      assert.equal(await transfer(), false);
      assert.deepEqual(writes, []);
      assert.equal(f.requests.length, 0);
    });
  });
test('readonly 생성셀 copy와 cut 쓰기 권한은 다르다', async () => {
  await runCreatedClipboard('hwpx', async (f, s, click, { clipboard, writes }) => {
    f.install({
      nativeHistoryRevision: undefined,
      nativeHistoryRevisions: [],
      capabilities: { readOnly: true },
      content: { ...f.state().content, createdCellTypingScope: undefined },
    });
    await select(f);
    assert.equal(s.canTransferSelection(false, clipboard), true);
    assert.equal(s.canTransferSelection(true, clipboard), false);
    assert.equal(await s.transferSelection({ clipboard }), true);
    assert.deepEqual(writes, ['BC']);
  });
});
test('공용 cut은 실제 Core 발급 target을 단일 splice 거래에 전달한다', async () => {
  await runCreatedClipboard('hwpx', async (f, s, click, { clipboard, writes }) => {
    await select(f);
    const target = Object.freeze({ text: 'ABCD', startUnit: 1, endUnit: 3 });
    const calls = [];
    f.editor.getCreatedCellTextTarget = async (sel, range, opts) => {
      calls.push(['query', sel, range, opts]);
      return target;
    };
    f.editor.dispatchCommand = async (cmd, payload) => {
      calls.push(['dispatch', cmd, payload]);
      return { status: 'committed-with-snapshot', state: f.state() };
    };
    const bridge = createClipboardBridge({
      editor: f.editor,
      clipboard,
      getSurface: () => s,
      onStatus: (m) => f.reports.push(m),
    });
    try {
      assert.equal(bridge.getPresentation().actions.cut.enabled, true);
      await bridge.action({ command: 'cut' });
      assert.deepEqual(writes, ['BC']);
      assert.equal(calls.length, 2);
      assert.equal(calls[1][2].target, target);
      assert.equal(calls[1][2].text, '');
      assert.equal(f.requests.length, 0);
    } finally {
      bridge.dispose();
    }
  });
});
test('Core 갱신 대기 중 같은 상태의 셀 선택 변경은 원 캡처를 폐기한다', async () => {
  await runCreatedClipboard('hwpx', async (f, s, click, { clipboard, writes }) => {
    await select(f);
    let release;
    f.editor.update = () => new Promise((r) => (release = r));
    const bridge = createClipboardBridge({
      editor: f.editor,
      clipboard,
      getSurface: () => s,
      onStatus: () => {},
    });
    try {
      const task = bridge.action({ command: 'copy' });
      const before = f.state();
      await select(f, 2, 4);
      assert.equal(f.state(), before);
      release();
      await task;
      assert.deepEqual(writes, []);
    } finally {
      bridge.dispose();
    }
  });
});
test('Native canonical 본문이 화면 축과 다르면 기존 캡처로 복사하지 않는다', async () => {
  await runCreatedClipboard('hwp5', async (f, s, click, { clipboard, writes }) => {
    await select(f);
    const transfer = s.captureTransferSelection({ clipboard });
    assert.equal(typeof transfer, 'function');
    f.state().content.createdTables[0].cells[0].text = 'WXYZ';
    assert.equal(await transfer(), false);
    assert.deepEqual(writes, []);
  });
});
test('이력 상태 교체 뒤 이전 캡처는 거부하고 새 셀 재선택만 복사한다', async () => {
  await runCreatedClipboard('hwpx', async (f, s, click, { clipboard, writes }) => {
    await select(f);
    const old = s.captureTransferSelection({ clipboard });
    f.install({
      operationRevision: f.state().operationRevision + 1,
      nativeHistoryRevision: 0,
      nativeHistoryRevisions: [1, 0],
    });
    assert.equal(await old(), false);
    assert.deepEqual(writes, []);
    await select(f, 0, 2);
    assert.equal(await s.transferSelection({ clipboard }), true);
    assert.deepEqual(writes, ['AB']);
    const input = f.input();
    const before = new Event('beforeinput', { cancelable: true });
    Object.assign(before, { inputType: 'insertText', data: 'X' });
    input.dispatchEvent(before);
    assert.equal(before.defaultPrevented, false);
    input.value = 'XCD';
    input.setSelectionRange(1, 1);
    const event = new Event('input');
    Object.assign(event, { inputType: 'insertText', data: 'X' });
    input.dispatchEvent(event);
    await tick();
    const request = f.messages.at(-1);
    assert.equal(request.kind, 'created-cell-splice');
    assert.equal(request.startUnit, 0);
    assert.equal(request.endUnit, 2);
    assert.equal(request.text, 'X');
    assert.equal(request.expectedHistoryRevision, 0);
    assert.equal(Object.hasOwn(request, 'paragraph'), false);
  });
});
for (const condition of [
  'cell-noneditable',
  'missing-typing-scope',
  'history-disabled',
  'history-missing',
  'history-recovery',
])
  test('copy는 유지하고 cut은 사전 비활성: ' + condition, async () => {
    await runCreatedClipboard('hwpx', async (f, s, click, { clipboard, writes }) => {
      let queries = 0,
        commands = 0;
      f.editor.getCreatedCellTextTarget = async () => {
        queries++;
        throw Error('가용성 거부 뒤 조회금지');
      };
      f.editor.dispatchCommand = async () => {
        commands++;
        throw Error('가용성 거부 뒤 변경금지');
      };
      if (condition === 'cell-noneditable')
        f.renderer.paragraph({
          section: 0,
          createdCell: { identity: '9007199254740993', row: 0, column: 0 },
        }).editable = false;
      if (condition === 'missing-typing-scope')
        f.install({ content: { ...f.state().content, createdCellTypingScope: undefined } });
      if (condition === 'history-disabled')
        f.install({ capabilities: { ...f.state().capabilities, historyAvailable: false } });
      if (condition === 'history-missing')
        f.install({ nativeHistoryRevision: undefined, nativeHistoryRevisions: [] });
      if (condition === 'history-recovery') f.install({ historyRecoveryRequired: true });
      await select(f);
      assert.equal(s.canTransferSelection(false, clipboard), true, '복사 읽기 허용은 그대로');
      assert.equal(
        s.canTransferSelection(true, clipboard),
        false,
        '오려두기 toolbar는 실제 쓰기 가용성만',
      );
      const bridge = createClipboardBridge({
        editor: f.editor,
        clipboard,
        getSurface: () => s,
        onStatus: (m) => f.reports.push(m),
      });
      try {
        assert.equal(bridge.getPresentation().actions.copy.enabled, true);
        assert.equal(bridge.getPresentation().actions.cut.enabled, false);
        assert.equal(s.captureTransferSelection({ cut: true, clipboard }), null);
        assert.equal(await s.transferSelection({ cut: true, clipboard }), false);
        assert.equal(queries, 0);
        assert.equal(commands, 0);
        assert.deepEqual(writes, []);
        assert.equal(await s.transferSelection({ clipboard }), true);
        assert.deepEqual(writes, ['BC']);
      } finally {
        bridge.dispose();
      }
    });
  });
for (const failure of ['write-denied', 'target-mismatch', 'command-rejected'])
  test('실제 Surface 보고 경로: ' + failure, async () => {
    await runCreatedClipboard(
      failure === 'target-mismatch' ? 'hwp5' : 'hwpx',
      async (f, s, click, { clipboard }) => {
        await select(f);
        let queries = 0,
          writes = 0,
          commands = 0;
        const statuses = [],
          results = [];
        const target = { text: 'ABCD', startUnit: 1, endUnit: 3 };
        const result = {
          status: 'rejected-unapplied',
          error: 'NativeExpectedTextMismatch',
          state: f.state(),
        };
        f.editor.getCreatedCellTextTarget = async () => {
          queries++;
          return failure === 'target-mismatch' ? { ...target, text: '다른본문' } : target;
        };
        f.editor.dispatchCommand = async () => {
          commands++;
          return result;
        };
        clipboard.writeText = async () => {
          writes++;
          if (failure === 'write-denied')
            throw new DOMException('실제통제쓰기거부', 'NotAllowedError');
        };
        const bridge = createClipboardBridge({
          editor: f.editor,
          clipboard,
          getSurface: () => s,
          onStatus: (m) => statuses.push(m),
          onResult: (r) => results.push(r),
        });
        try {
          await bridge.action({ command: 'cut' });
          assert.equal(queries, 1);
          if (failure === 'write-denied') {
            assert.equal(writes, 1);
            assert.equal(commands, 0);
            assert.deepEqual(statuses, ['ClipboardWritePermissionDenied']);
            assert.deepEqual(results, []);
          }
          if (failure === 'target-mismatch') {
            assert.equal(writes, 0);
            assert.equal(commands, 0);
            assert.deepEqual(statuses, ['CreatedCellClipboardTargetMismatch']);
            assert.deepEqual(results, []);
          }
          if (failure === 'command-rejected') {
            assert.equal(writes, 1);
            assert.equal(commands, 1);
            assert.deepEqual(statuses, ['rejected-unapplied: NativeExpectedTextMismatch']);
            assert.equal(results.length, 1);
            assert.equal(results[0], result);
          }
          assert.equal(f.input().value, 'ABCD');
          assert.equal(f.input().selectionStart, 1);
          assert.equal(f.input().selectionEnd, 3);
        } finally {
          bridge.dispose();
        }
      },
    );
  });
