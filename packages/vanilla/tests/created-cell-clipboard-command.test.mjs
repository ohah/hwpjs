// 실제 clipboard 조정 helper와 통제 Core 응답 검사입니다. Native 실행 증거가 아닙니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { captureCreatedCellClipboard } from '../src/created-cell-clipboard.ts';
const spliceCommand = Symbol('정규명령통제값');
function fixture({ cut = false, readonly = false } = {}) {
  let active = true,
    native = true,
    queries = 0;
  const writes = [],
    commands = [],
    reports = [];
  const target = Object.freeze({ text: '앞😀\n뒤', startUnit: 1, endUnit: 4 });
  const selection = Object.freeze({
    selector: Object.freeze({ section: 0, identity: '9007199254740993', row: 0, column: 0 }),
    range: Object.freeze({ startUnit: 1, endUnit: 4 }),
    expectedText: target.text,
    text: '😀\n',
    current: () => native,
  });
  const editor = {
    getCreatedCellTextTarget: async (...args) => {
      queries++;
      assert.deepEqual(args, [
        selection.selector,
        selection.range,
        { token: { operationRevision: 1 } },
      ]);
      return target;
    },
    dispatchCommand: async (command, payload) => {
      commands.push({ command, payload });
      return { status: 'committed-with-snapshot' };
    },
  };
  const options = {
    editor,
    selection,
    token: { token: { operationRevision: 1 } },
    clipboard: { writeText: async (text) => writes.push(text) },
    spliceCommand,
    cut,
    writable: !readonly,
    current: () => active,
    report: (m) => reports.push(m),
  };
  return {
    editor,
    options,
    target,
    writes,
    commands,
    reports,
    revoke: () => (active = false),
    foreignOwner: () => (native = false),
    queries: () => queries,
    capture: () => captureCreatedCellClipboard(options),
  };
}
test('읽기 복사는 readonly에서도 target조회·편집 없이 동일 UTF16 선택만 쓴다', async () => {
  const f = fixture({ readonly: true });
  const run = f.capture();
  assert.equal(await run(), true);
  assert.deepEqual(f.writes, ['😀\n']);
  assert.equal(f.queries(), 0);
  assert.equal(f.commands.length, 0);
  assert.equal(await run(), false);
});
test('cut은 branded발급 응답을 정규 명령에 그대로 넘기는 단일 거래다', async () => {
  const f = fixture({ cut: true });
  assert.equal(await f.capture()(), true);
  assert.equal(f.queries(), 1);
  assert.deepEqual(f.writes, ['😀\n']);
  assert.equal(f.commands.length, 1);
  assert.equal(f.commands[0].command, spliceCommand);
  assert.equal(f.commands[0].payload.target, f.target);
  assert.equal(f.commands[0].payload.text, '');
  assert.deepEqual(Object.keys(f.commands[0].payload).sort(), ['target', 'text']);
});
test('readonly cut은 target조회·clipboard쓰기·거래 모두 거부한다', () => {
  const f = fixture({ cut: true, readonly: true });
  assert.equal(f.capture(), null);
  assert.equal(f.queries(), 0);
  assert.deepEqual(f.writes, []);
});
test('Native 조회중 현재성이 바뀌면 clipboard와 삭제 모두 없다', async () => {
  const f = fixture({ cut: true });
  f.editor.getCreatedCellTextTarget = async () => {
    f.revoke();
    return f.target;
  };
  assert.equal(await f.capture()(), false);
  assert.deepEqual(f.writes, []);
  assert.deepEqual(f.commands, []);
});
test('Native target의 전체 본문 또는 범위 불일치를 복사 전에 거부한다', async () => {
  for (const patch of [{ text: '다른본문' }, { startUnit: 0 }, { endUnit: 5 }]) {
    const f = fixture({ cut: true });
    f.editor.getCreatedCellTextTarget = async () => ({ ...f.target, ...patch });
    assert.equal(await f.capture()(), false);
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.commands, []);
  }
});
test('clipboard 거부나 쓰기 중 foreign선택은 삭제를 시작하지 않는다', async () => {
  for (const rejected of [true, false]) {
    const f = fixture({ cut: true });
    f.options.clipboard.writeText = async () => {
      if (rejected) throw Error('권한거부');
      f.foreignOwner();
    };
    assert.equal(await f.capture()(), false);
    assert.deepEqual(f.commands, []);
  }
});
test('Native query거부·불확실한 commit은 자동 재시도하지 않는다', async () => {
  const f = fixture({ cut: true });
  let count = 0;
  f.editor.dispatchCommand = async () => {
    count++;
    return { status: 'committed-refresh-required', error: '재관측필요' };
  };
  const run = f.capture();
  assert.equal(await run(), false);
  assert.equal(await run(), false);
  assert.equal(count, 1);
  assert.deepEqual(f.reports, ['재관측필요']);
  const g = fixture({ cut: true });
  g.editor.getCreatedCellTextTarget = async () => {
    throw Error('구형ABI');
  };
  assert.equal(await g.capture()(), false);
  assert.deepEqual(g.writes, []);
  assert.deepEqual(g.commands, []);
});
