// Core의 실제 본문/revision 변경과 선택 초기화를 재현하는 통제 Surface 회귀입니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClipboardBridge } from '../../../apps/demo/src/clipboard-bridge.ts';
import { runCreatedClipboard, tick } from './created-cell-clipboard-fixture.mjs';
async function selected(f, text, start, end) {
  const old = f.state(),
    table = old.content.createdTables[0],
    cell = table.cells[0];
  f.install({
    operationRevision: old.operationRevision + 1,
    viewRevision: old.viewRevision + 1,
    content: { ...old.content, createdTables: [{ ...table, cells: [{ ...cell, text }] }] },
  });
  f.pointer('pointerdown', 0, start);
  await tick();
  f.pointer('pointermove', 0, end);
  f.pointer('pointerup', 0, end);
  await tick();
}
async function cutCase(format, text, start, end, failure, check) {
  await runCreatedClipboard(format, async (f, s, click, { clipboard, writes }) => {
    await selected(f, text, start, end);
    const before = f.state();
    const status = [],
      results = [];
    let calls = 0;
    let paintReads = 0;
    f.renderer.isPaintedFrameCurrent = () =>
      failure !== 'deferred-paint' && !(failure === 'late-paint' && ++paintReads > 1);
    const expected = text.slice(0, start) + text.slice(end);
    f.editor.getCreatedCellTextTarget = async () => ({ text, startUnit: start, endUnit: end });
    f.editor.dispatchCommand = async (_cmd, payload) => {
      calls++;
      assert.equal(payload.text, '');
      if (failure === 'unapplied')
        return { status: 'rejected-unapplied', state: f.state(), error: 'NativeRejected' };
      const table = before.content.createdTables[0];
      const cell = { ...table.cells[0], text: expected };
      if (failure === 'owner') cell.paragraph_id++;
      const next = f.install({
        operationRevision: before.operationRevision + 1,
        viewRevision: before.viewRevision + 1,
        nativeHistoryRevision: before.nativeHistoryRevision + 1,
        nativeHistoryRevisions: [before.nativeHistoryRevision + 1, before.nativeHistoryRevision],
        selection: undefined,
        content: { ...before.content, createdTables: [{ ...table, cells: [cell] }] },
        ...(failure === 'document' ? { documentId: 'foreign' } : {}),
        ...(failure === 'uncertain' ? { status: 'refresh-required' } : {}),
      });
      if (failure === 'uncertain') assert.equal(f.input().readOnly, true);
      else
        assert.equal(
          f.input().disabled,
          true,
          '실제 Core 상태 갱신은 기존 Canvas를 초기화해야 합니다.',
        );
      if (failure === 'history')
        f.install({ capabilities: { ...next.capabilities, historyAvailable: false } });
      if (failure === 'restore-throws')
        f.renderer.createdCellTypingOwner = () => {
          throw Error('통제된복구실패');
        };
      if (failure === 'lease') f.revoke();
      if (failure === 'modal') f.setDialogs([f.dialog()]);
      if (failure === 'selection') {
        f.pointer('pointerdown', 0, 0);
        f.pointer('pointerup', 0, 0);
      }
      if (failure === 'reentry') f.doc.dispatchEvent(new Event('keydown'));
      if (failure === 'foreign-focus') f.doc.dispatchEvent(new Event('focusin'));
      if (failure === 'window-blur') f.doc.defaultView.dispatchEvent(new Event('blur'));
      if (failure === 'state') f.install({ operationRevision: next.operationRevision + 1 });
      if (failure === 'geometry') f.renderer.layout = () => ({ rows: [], width: 800, height: 600 });
      return {
        status: failure === 'uncertain' ? 'committed-refresh-required' : 'committed-with-snapshot',
        state: next,
        ...(failure === 'uncertain' ? { error: 'NativeUncertain' } : {}),
      };
    };
    const bridge = createClipboardBridge({
      editor: f.editor,
      clipboard,
      getSurface: () => s,
      onStatus: (m) => status.push(m),
      onResult: (r) => results.push(r),
    });
    try {
      const action = bridge.action({ command: 'cut' });
      await tick();
      f.frame();
      await tick();
      await action;
      assert.equal(
        calls,
        1,
        JSON.stringify({
          status,
          reports: f.reports,
          text: f.input().value,
          selection: [f.input().selectionStart, f.input().selectionEnd],
          caps: f.state().capabilities,
        }),
      );
      assert.deepEqual(writes, [text.slice(start, end)]);
      assert.equal(results.length, 1);
      await check({ f, s, before, expected, status, results });
    } finally {
      bridge.dispose();
    }
  });
}
for (const format of ['hwp5', 'hwpx'])
  for (const row of [
    { name: 'surrogate', text: '앞😀뒤', start: 1, end: 3 },
    { name: 'LF', text: '앞\n😀뒤', start: 2, end: 4 },
  ])
    test(
      format + ' ' + row.name + ' cut은 새 Core snapshot에서 시작점 caret과 입력을 복원한다',
      () =>
        cutCase(format, row.text, row.start, row.end, null, ({ f, expected, status, results }) => {
          assert.equal(
            f.input().value,
            expected,
            JSON.stringify({ status, reports: f.reports, selection: f.state().selection }),
          );
          assert.equal(f.input().disabled, false);
          assert.equal(f.input().readOnly, false);
          assert.equal(f.input().selectionStart, row.start);
          assert.equal(f.input().selectionEnd, row.start);
          assert.equal(f.doc.activeElement, f.input());
          assert.equal(f.state().selection, undefined);
          assert.deepEqual(status, ['선택 텍스트 오려두기 완료']);
          assert.equal(results[0].state, f.state());
        }),
    );
for (const failure of [
  'unapplied',
  'uncertain',
  'document',
  'owner',
  'lease',
  'modal',
  'selection',
  'reentry',
  'foreign-focus',
  'window-blur',
  'state',
  'geometry',
  'deferred-paint',
  'late-paint',
  'history',
  'restore-throws',
])
  test('cut 뒤 ' + failure + '는 옛 선택을 복구하거나 재전송하지 않는다', () =>
    cutCase('hwpx', '앞😀뒤', 1, 3, failure, ({ f, status, results }) => {
      if (failure === 'unapplied') assert.deepEqual(status, ['rejected-unapplied: NativeRejected']);
      else if (failure === 'uncertain')
        assert.deepEqual(status, ['committed-refresh-required: NativeUncertain']);
      else assert.deepEqual(status, ['CreatedCellClipboardCaretUnavailable']);
      if (!['unapplied', 'selection', 'uncertain'].includes(failure))
        assert.equal(f.input().disabled, true);
      assert.notEqual(status[0], '선택 텍스트 오려두기 완료');
      assert.equal(results.length, 1);
    }),
  );
