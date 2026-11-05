// 실제 Surface/Canvas와 통제 Core 응답의 접수 수명이다. Native 성공 증거가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
const languages = ['hangul', 'latin', 'hanja', 'japanese', 'other', 'symbol', 'user'];
async function run(body) {
  const f = formattingFixture();
  f.reads = [];
  f.editor.readResource = async (message) => {
    f.reads.push(message);
    const binding = { session: '통제세션', revision: f.state().nativeHistoryRevision };
    const fields = Object.fromEntries(
      ['paragraph.alignment', ...languages.map((l) => 'character.fonts.' + l + '.name')].map(
        (k) => [k, { writable: true }],
      ),
    );
    if (message.kind === 'formatting-capabilities')
      return {
        formattingBatchQueryAvailable: true,
        formattingCapabilities: {
          schemaVersion: 1,
          atomic: true,
          format: 'hwpx',
          coordinateSpace: 'native-source-utf16',
          requiresHistoryProtocol: 2,
          binding,
          fields,
          limits: {
            requestBytes: 65536,
            replyBytes: 2097152,
            targets: 4096,
            ranges: 4096,
            commands: 4096,
            fontNameBytes: 4096,
          },
        },
      };
    return {
      formatting: {
        schemaVersion: 1,
        binding,
        targets: message.selectors.map((s, i) => ({
          ref: '통제반환-' + i,
          ...(s.ranges ? { ranges: s.ranges } : {}),
        })),
      },
    };
  };
  const s = createCanvasSurface({ root: f.root, editor: f.editor });
  try {
    await f.selectA();
    await body(f, s);
  } finally {
    while (f.waits.length) f.reject();
    await s.dispose();
  }
}
for (const intent of [
  { kind: 'alignment', alignment: 'CENTER' },
  { kind: 'font-names', names: Object.fromEntries(languages.map((l) => [l, '검증 글꼴'])) },
])
  test(
    intent.kind + '은 선택 null에서도 실제 Canvas를 통해 한 lease 요청과 실제 결과를 연결한다',
    async () =>
      run(async (f, s) => {
        const c = s.captureSelectionFormatting();
        assert.ok(c);
        assert.equal(await c.prepare(), true);
        assert.equal(await c.prepare(intent), true);
        assert.equal(c.request(intent), true);
        await tick();
        assert.equal(f.state().selection, null);
        assert.equal(f.messages.length, 1);
        assert.equal(f.messages[0].kind, 'formatting-patch');
        assert.equal(f.reads.filter((m) => m.kind === 'query-formatting').length, 1);
        assert.equal(c.request(intent), false);
        f.ack();
        await tick();
        const settled = await c.settle();
        assert.equal(settled.result.status, 'committed-with-snapshot');
        assert.equal(settled.current, true);
      }),
  );
test('준비된 null 선택에서 A가 B로 바뀌면 이전 patch는 접수하지 않는다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const intent = { kind: 'alignment', alignment: 'CENTER' };
    assert.equal(await c.prepare(), true);
    assert.equal(await c.prepare(intent), true);
    const state = f.state();
    await f.selectB();
    assert.equal(f.state(), state);
    assert.equal(c.request(intent), false);
    assert.equal(f.messages.length, 0);
  }));

test('명시 미적용 거부 뒤 접수된 R과 undo가 같은 현재 범위에서 순서대로 이어진다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const intent = { kind: 'alignment', alignment: 'CENTER' };
    assert.equal(await c.prepare(), true);
    assert.equal(await c.prepare(intent), true);
    assert.equal(c.request(intent), true);
    await tick();
    for (const [inputType, data] of [
      ['insertText', 'R'],
      ['historyUndo', null],
    ]) {
      const event = new Event('beforeinput', { cancelable: true });
      Object.assign(event, { inputType, data, isComposing: false });
      f.input().dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
    }
    assert.equal(f.messages.length, 1);
    const original = f.state();
    f.waits.shift().resolve({
      status: 'rejected-unapplied',
      state: original,
      error: '권한 거부 대역',
      reply: { changed: false, applied: false },
    });
    await tick();
    assert.equal(f.state(), original);
    assert.equal(f.messages.length, 2, '명시 미적용 뒤 이미 접수한 R을 잃으면 안 된다');
    assert.equal(f.messages[1].kind, 'replace-paragraph-ranges');
    assert.equal(f.messages[1].text, 'R');
    f.ack({ operationRevision: 2, nativeHistoryRevision: 2, nativeHistoryRevisions: [2, 1, 0] });
    await tick();
    f.frame();
    await tick();
    assert.equal(f.messages[2]?.kind, 'undo', 'R 완료 뒤 undo 순서를 유지해야 한다');
  }));

for (const [name, status, change] of [
  ['알 수 없는 결과', 'unknown', null],
  ['커밋 후 갱신 실패', 'committed-refresh-required', null],
  [
    '다른 현재 상태',
    'rejected-unapplied',
    (f) => f.install({ stateVersion: f.state().stateVersion + 1 }),
  ],
  ['문서 교체', 'rejected-unapplied', (f) => f.install({ documentId: '다른문서', generation: 2 })],
  [
    '원본문 변경',
    'rejected-unapplied',
    (f) =>
      f.install({
        content: {
          ...f.state().content,
          paragraphs: f
            .state()
            .content.paragraphs.map((p, i) => (i === 0 ? { ...p, text: '다른본문' } : p)),
        },
      }),
  ],
  [
    '현재 Core 선택 변경',
    'rejected-unapplied',
    (f) => f.install({ selection: { kind: 'paragraph', section: 0, paragraph: 2 } }),
  ],
])
  test(name + '은 옛 범위에 접수 입력을 재생하지 않는다', async () =>
    run(async (f, s) => {
      const c = s.captureSelectionFormatting();
      const intent = { kind: 'alignment', alignment: 'CENTER' };
      assert.equal(await c.prepare(), true);
      assert.equal(await c.prepare(intent), true);
      assert.equal(c.request(intent), true);
      await tick();
      const event = new Event('beforeinput', { cancelable: true });
      Object.assign(event, { inputType: 'insertText', data: 'R', isComposing: false });
      f.input().dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
      const original = f.state();
      if (change) change(f);
      f.waits.shift().resolve({
        status,
        state: original,
        error: '결과 경계 대역',
        reply: { changed: null, applied: status === 'committed-refresh-required' },
      });
      await tick();
      f.frame();
      await tick();
      assert.equal(f.messages.length, 1);
    }),
  );

test('ACK 뒤 현재 geometry 관측 예외에도 실제 Core 결과를 잃지 않는다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const intent = { kind: 'alignment', alignment: 'CENTER' };
    assert.equal(await c.prepare(), true);
    assert.equal(await c.prepare(intent), true);
    assert.equal(c.request(intent), true);
    await tick();
    let checks = 0;
    f.renderer.historyModelMatches = () => {
      if (++checks === 3) throw Error('완료 관측 예외');
      return true;
    };
    const observed = c.settle().then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    f.ack();
    await tick();
    const answer = await observed;
    assert.equal(checks >= 3, true);
    assert.equal(answer.error, undefined, '화면 관측 실패가 Core 결과를 지우면 안 된다');
    assert.equal(answer.value.result.status, 'committed-with-snapshot');
    assert.equal(answer.value.current, false);
  }));

test('같은 소유 모달의 정상 focus 이동은 허용하고 다른 모달은 거부한다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const dialog = f.dialog();
    f.setDialogs([dialog]);
    assert.equal(c.bindDialog(dialog), true);
    assert.equal(await c.prepare(), true);
    assert.equal(await c.prepare({ kind: 'alignment', alignment: 'CENTER' }), true);
    const other = f.dialog();
    f.setDialogs([other]);
    assert.equal(c.current(), false);
    assert.equal(c.request({ kind: 'alignment', alignment: 'CENTER' }), false);
    assert.equal(f.messages.length, 0);
  }));
test('소유 모달 닫기는 준비된 요청을 무효화한다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const dialog = f.dialog();
    f.setDialogs([dialog]);
    assert.equal(c.bindDialog(dialog), true);
    assert.equal(await c.prepare({ kind: 'alignment', alignment: 'CENTER' }), true);
    dialog.open = false;
    f.setDialogs([]);
    assert.equal(c.current(), false);
    assert.equal(c.request({ kind: 'alignment', alignment: 'CENTER' }), false);
    assert.equal(f.messages.length, 0);
  }));
test('조회 중 다음 텍스트 입력은 기존 경로로 접수되고 오래된 서식만 거부한다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    await c.prepare();
    const read = f.editor.readResource;
    let release;
    f.editor.readResource = (message) =>
      message.kind === 'query-formatting'
        ? new Promise((resolve) => {
            release = async () => resolve(await read(message));
          })
        : read(message);
    const prepared = c.prepare({ kind: 'alignment', alignment: 'CENTER' }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await tick();
    assert.equal(typeof release, 'function');
    const event = new Event('beforeinput', { cancelable: true });
    Object.assign(event, { inputType: 'insertText', data: 'R', isComposing: false });
    f.input().dispatchEvent(event);
    await tick();
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].kind, 'replace-paragraph-ranges');
    await release();
    const result = await prepared;
    assert.equal(result.value === true, false);
    assert.equal(c.request({ kind: 'alignment', alignment: 'CENTER' }), false);
  }));
test('진행 중 조회는 dispose에서 drain하고 닫힌 뒤 쓰기나 UI를 게시하지 않는다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    await c.prepare();
    const read = f.editor.readResource;
    let release;
    f.editor.readResource = (message) =>
      message.kind === 'query-formatting'
        ? new Promise((resolve) => {
            release = async () => resolve(await read(message));
          })
        : read(message);
    const prepared = c.prepare({ kind: 'alignment', alignment: 'CENTER' }).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await tick();
    let done = false;
    const closing = s.dispose().then(() => {
      done = true;
    });
    await tick();
    assert.equal(done, false);
    await release();
    await prepared;
    await closing;
    assert.equal(done, true);
    assert.equal(f.messages.length, 0);
  }));
test('이미 접수한 요청은 dispose에서도 완료까지 소유하며 늦은 UI 결과를 사용하지 않는다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    await c.prepare();
    assert.equal(await c.prepare({ kind: 'alignment', alignment: 'CENTER' }), true);
    assert.equal(c.request({ kind: 'alignment', alignment: 'CENTER' }), true);
    await tick();
    let done = false;
    const closing = s.dispose().then(() => {
      done = true;
    });
    await tick();
    assert.equal(done, false);
    const reports = f.reports.length;
    f.ack();
    await closing;
    await tick();
    assert.equal(f.reports.length, reports);
    assert.equal((await c.settle()).current, false);
    assert.equal(f.messages.length, 1);
  }));
test('atomic ACK 전의 입력은 화면 범위 확인 뒤 기존 큐로 이어진다', async () =>
  run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    await c.prepare();
    assert.equal(await c.prepare({ kind: 'alignment', alignment: 'CENTER' }), true);
    assert.equal(c.request({ kind: 'alignment', alignment: 'CENTER' }), true);
    await tick();
    const event = new Event('beforeinput', { cancelable: true });
    Object.assign(event, { inputType: 'insertText', data: 'R', isComposing: false });
    f.input().dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.messages.length, 1);
    f.ack({ operationRevision: 2, nativeHistoryRevision: 2, nativeHistoryRevisions: [2, 1, 0] });
    await tick();
    f.frame();
    await tick();
    assert.equal(f.messages.length, 2);
    assert.equal(f.messages[1].kind, 'replace-paragraph-ranges');
    assert.equal(f.messages[1].text, 'R');
  }));
test('동시에 준비한 다른 capture는 단일 준비 작업을 우회하지 않는다', async () =>
  run(async (f, s) => {
    const a = s.captureSelectionFormatting(),
      b = s.captureSelectionFormatting();
    await a.prepare();
    const read = f.editor.readResource;
    let release;
    f.editor.readResource = (message) =>
      message.kind === 'query-formatting'
        ? new Promise((resolve) => {
            release = async () => resolve(await read(message));
          })
        : read(message);
    const first = a.prepare({ kind: 'alignment', alignment: 'CENTER' });
    await tick();
    assert.equal(await b.prepare({ kind: 'alignment', alignment: 'CENTER' }), false);
    await release();
    assert.equal(await first, true);
    assert.equal(f.messages.length, 0);
  }));
