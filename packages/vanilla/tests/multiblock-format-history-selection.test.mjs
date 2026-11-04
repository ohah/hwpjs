// 실제 Canvas/Surface와 통제 응답의 서식 이력 선택 수명이다. Native·브라우저 증거는 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { multiblockFixture, tick } from './multiblock-clipboard-fixture.mjs';
test('다문단 밑줄 적용 뒤 재선택 없이 undo와 redo에서 현재 범위를 보존한다', async () => {
  const f = multiblockFixture();
  let underlined = false;
  f.renderer.characterUnderlineRangesAvailable = () => true;
  f.renderer.selectionCharacterState = () => underlined;
  f.renderer.isSelectionPainted = () => true;
  f.renderer.historyModelMatches = () => true;
  const clipboard = { writeText: async () => {} };
  let surface;
  const displayed = [];
  surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    environment: { clipboard },
    onStatus: () => {
      if (surface) displayed.push(surface.captureRangeFormatting('underline')?.value ?? null);
    },
  });
  const content = f.state().content;
  const ack = async (revision, value) => {
    underlined = value;
    f.ack(
      {
        operationRevision: f.state().operationRevision + 1,
        viewRevision: f.state().viewRevision + 1,
        nativeHistoryRevision: revision,
        nativeHistoryRevisions: [revision, ...[2, 1, 0].filter((r) => r !== revision)],
        selection: null,
        content: { ...content, paragraphs: content.paragraphs.map((p) => ({ ...p })) },
      },
      {
        reply: {
          historyRevision: revision,
          historyRevisions: [revision, ...[2, 1, 0].filter((r) => r !== revision)],
          changed: true,
        },
      },
    );
    await tick();
  };
  try {
    await f.selectA();
    const initial = surface.captureRangeFormatting('underline');
    assert.equal(initial?.value, false);
    assert.equal(initial?.reason, null);
    assert.equal(initial.request(), true);
    await tick();
    assert.equal(f.requests.at(-1).kind, 'character-underline-ranges');
    await ack(2, true);
    assert.equal(surface.captureRangeFormatting('underline')?.value, true, '적용 뒤 범위 유지');
    assert.equal(surface.requestHistory('undo'), true);
    await tick();
    await ack(1, false);
    assert.equal(
      surface.captureRangeFormatting('underline')?.value,
      false,
      '재선택 없이 undo 뒤 범위와 가용성 유지',
    );
    assert.equal(
      displayed.at(-1),
      false,
      '마지막 표시 알림도 현재 범위의 밑줄 해제를 관측해야 한다',
    );
    assert.equal(surface.requestHistory('redo'), true);
    await tick();
    await ack(2, true);
    assert.equal(
      surface.captureRangeFormatting('underline')?.value,
      true,
      '재선택 없이 redo 뒤 범위와 가용성 유지',
    );
    assert.equal(
      displayed.at(-1),
      true,
      '마지막 표시 알림도 현재 범위의 밑줄 재적용을 관측해야 한다',
    );
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
});

async function prepared() {
  const f = multiblockFixture();
  let underlined = false,
    painted = true,
    geometry;
  const reports = [];
  f.renderer.characterUnderlineRangesAvailable = () => true;
  f.renderer.selectionCharacterState = () => underlined;
  f.renderer.isSelectionPainted = () => painted;
  f.renderer.historyModelMatches = () => true;
  f.renderer.onGeometry = (fn) => {
    geometry = fn;
  };
  let surface;
  surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (message) => {
      reports.push({ message, value: surface?.captureRangeFormatting('underline')?.value ?? null });
    },
  });
  const ack = async (revision, value, content = f.state().content) => {
    underlined = value;
    const revisions = [revision, ...[2, 1, 0].filter((r) => r !== revision)];
    f.ack(
      {
        operationRevision: f.state().operationRevision + 1,
        viewRevision: f.state().viewRevision + 1,
        nativeHistoryRevision: revision,
        nativeHistoryRevisions: revisions,
        selection: null,
        content,
      },
      { reply: { historyRevision: revision, historyRevisions: revisions, changed: true } },
    );
    await tick();
  };
  await f.selectA();
  assert.equal(surface.captureRangeFormatting('underline')?.request(), true);
  await tick();
  await ack(2, true);
  return {
    f,
    surface,
    reports,
    ack,
    setPainted: (value) => {
      painted = value;
    },
    paint: () => geometry?.(),
    close: async () => {
      while (f.waits.length) f.reject();
      await surface.dispose();
    },
  };
}
const completions = (reports) =>
  reports.filter((x) => x.message === '실행 취소/다시 실행 적용 · 화면 반영 완료');
test('화면 확인 전에는 활성 알림을 발행하지 않고 확인 뒤에만 발행한다', async () => {
  const c = await prepared();
  try {
    c.setPainted(false);
    assert.equal(c.surface.requestHistory('undo'), true);
    await tick();
    await c.ack(1, false);
    assert.equal(c.surface.captureRangeFormatting('underline'), null);
    assert.equal(completions(c.reports).length, 0);
    c.setPainted(true);
    c.paint();
    await tick();
    assert.equal(c.surface.captureRangeFormatting('underline')?.value, false);
    assert.equal(completions(c.reports).length, 1);
    assert.equal(completions(c.reports)[0].value, false);
  } finally {
    await c.close();
  }
});
for (const kind of ['다른 소유자', '문단 제거'])
  test(kind + '인 복원 문서는 옛 범위를 활성 알림으로 되살리지 않는다', async () => {
    const c = await prepared();
    try {
      assert.equal(c.surface.requestHistory('undo'), true);
      await tick();
      const content = c.f.state().content;
      const paragraphs =
        kind === '문단 제거'
          ? content.paragraphs.slice(1)
          : content.paragraphs.map((p, i) => ({
              ...p,
              tableCell: { tableNode: 7, listNode: i + 1 },
            }));
      await c.ack(1, false, { ...content, paragraphs });
      assert.equal(c.surface.captureRangeFormatting('underline'), null);
      assert.equal(completions(c.reports).length, 0);
    } finally {
      await c.close();
    }
  });
test('명시적 미적용 거부에는 성공 화면 알림을 발행하지 않는다', async () => {
  const c = await prepared();
  try {
    assert.equal(c.surface.requestHistory('undo'), true);
    await tick();
    c.f.waits.shift().resolve({
      status: 'rejected-unapplied',
      state: c.f.state(),
      error: 'ReadOnlyDocument',
      reply: { changed: false, applied: false },
    });
    await tick();
    assert.equal(completions(c.reports).length, 0);
    assert.equal(c.f.requests.at(-1).kind, 'undo');
  } finally {
    await c.close();
  }
});
test('화면 대기 중 폐기하면 완료 알림과 이전 범위 재발행이 없다', async () => {
  const c = await prepared();
  c.setPainted(false);
  assert.equal(c.surface.requestHistory('undo'), true);
  await tick();
  await c.ack(1, false);
  await c.close();
  const count = c.reports.length;
  c.setPainted(true);
  c.paint();
  await tick();
  assert.equal(c.reports.length, count);
  assert.equal(completions(c.reports).length, 0);
});
