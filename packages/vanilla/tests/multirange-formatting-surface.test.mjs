// Core 응답 대역을 쓰는 실제 Surface/Canvas 접수·수명 회귀. Native 성공 증거가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
async function run(body, patch) {
  const f = formattingFixture();
  if (patch) f.install(patch);
  const surface = createCanvasSurface({ root: f.root, editor: f.editor });
  try {
    await f.selectA();
    await body(f, surface);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
test('혼합 크기·굵게와 원래 기울임·색·일곱 언어 이름을 가짜 단일 대상 없이 읽는다', async () => {
  await run(async (f, s) => {
    assert.equal(
      typeof s.captureSelectionFormatting,
      'function',
      '다문단 일반 포트가 제공되어야 한다',
    );
    const c = s.captureSelectionFormatting();
    assert.ok(c);
    assert.equal(c.current(), true);
    assert.equal(c.observation.size, 'mixed');
    assert.equal(c.observation.bold, 'mixed');
    assert.equal(c.observation.italic, true);
    assert.equal(c.observation.textColor, '#123456');
    assert.equal(c.observation.align, 'LEFT');
    for (const [language, value] of Object.entries(c.observation.fontNames))
      assert.deepEqual(value, { kind: 'single', name: '검증 글꼴 ' + language });
    assert.equal(c.reasons.characterAvailableReason, null);
    assert.equal(c.state.selection, null);
    assert.equal(f.requests.length, 0);
  });
});

const cases = [
  [
    { kind: 'character-properties', properties: { size: 1800, bold: true, italic: false } },
    'character-properties-ranges',
    'properties',
    { size: 1800, bold: true, italic: false },
  ],
  [
    { kind: 'underline', underlineKind: 'bottom' },
    'character-underline-ranges',
    'underlineKind',
    'bottom',
  ],
  [{ kind: 'strike', enabled: true }, 'character-strike-ranges', 'enabled', true],
  [{ kind: 'text-color', color: '#abcdef' }, 'character-text-color-ranges', 'color', '#abcdef'],
  [
    { kind: 'font-name', language: 'latin', name: '검증 새 글꼴' },
    'character-font-name-ranges',
    'name',
    '검증 새 글꼴',
  ],
  [{ kind: 'font-id', language: 'hangul', fontId: 2 }, 'character-font-ranges', 'fontId', 2],
  [{ kind: 'shade', color: null }, 'character-shade-ranges', 'color', null],
  [{ kind: 'outline', outlineKind: 'solid' }, 'character-outline-ranges', 'outlineKind', 'solid'],
  [
    { kind: 'effect', effect: 'emboss', enabled: true },
    'character-effect-ranges',
    'effect',
    'emboss',
  ],
];
for (const [intent, kind, key, value] of cases)
  test(intent.kind + '은 기존 전체 범위 묶음 한 요청으로 접수한다', async () => {
    await run(async (f, s) => {
      const c = s.captureSelectionFormatting();
      assert.equal(c.current(), true);
      assert.equal(c.request(intent), true);
      await tick();
      assert.equal(f.messages.length, 1);
      assert.equal(f.messages[0].kind, kind);
      assert.deepEqual(f.messages[0][key], value);
      assert.deepEqual(f.messages[0].ranges, [
        { section: 0, paragraph: 0, startUnit: 1, endUnit: 4 },
        { section: 0, paragraph: 1, startUnit: 0, endUnit: 2 },
      ]);
      assert.equal(c.request(intent), false);
      assert.equal(f.state().selection, null);
    });
  });
test('같은 코어 null 상태에서 선택만 바뀌어도 최초 포트는 무효다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const state = f.state();
    await f.selectB();
    assert.equal(f.state(), state);
    assert.equal(c.current(), false);
    assert.equal(c.request({ kind: 'character-properties', properties: { bold: true } }), false);
    assert.equal(f.messages.length, 0);
  });
});
test('범위 계산 중 재진입으로 선택이 바뀌면 대기 설정과 요청 전에 거부한다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const ranges = f.renderer.selectionRanges;
    let entered = false;
    f.renderer.selectionRanges = (...args) => {
      const value = ranges(...args);
      if (!entered) {
        entered = true;
        void f.selectB();
      }
      return value;
    };
    assert.equal(c.request({ kind: 'character-properties', properties: { size: 1800 } }), false);
    assert.equal(f.messages.length, 0);
  });
});
test('읽기 전용은 현재 원값을 유지하면서 쓰기만 거부한다', async () => {
  await run(
    async (f, s) => {
      const c = s.captureSelectionFormatting();
      assert.equal(c.observation.bold, 'mixed');
      assert.equal(c.observation.size, 'mixed');
      assert.equal(c.observation.textColor, '#123456');
      assert.equal(c.reasons.characterAvailableReason, 'ReadOnlyDocument');
      assert.equal(c.request({ kind: 'character-properties', properties: { bold: true } }), false);
      assert.equal(f.messages.length, 0);
    },
    { capabilities: { readOnly: true } },
  );
});
test('지원하지 않는 범위 기능은 단일 명령 반복으로 대체하지 않는다', async () => {
  await run(async (f, s) => {
    f.renderer.characterPropertyRangesAvailable = () => false;
    const c = s.captureSelectionFormatting();
    assert.equal(c.reasons.characterAvailableReason, 'RangeFormattingUnsupported');
    assert.equal(c.reasons.paragraphAvailableReason, 'AtomicCapabilitiesPending');
    assert.equal(c.request({ kind: 'alignment', alignment: 'LEFT' }), false);
    assert.equal(f.messages.length, 0);
  });
});
test('소유한 열린 색 대화상자의 정상 초점 이동만 허용한다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const dialog = f.dialog();
    f.setDialogs([dialog]);
    assert.equal(c.current(), false);
    assert.equal(c.bindDialog(dialog), true);
    f.doc.activeElement = { tagName: 'INPUT' };
    assert.equal(c.current(), true);
    assert.equal(c.bindDialog(dialog), false);
    assert.equal(c.request({ kind: 'text-color', color: '#123abc' }), true);
    await tick();
    assert.equal(f.messages.length, 1);
  });
});
test('다른 대화상자가 겹치거나 원래 대화상자가 닫히면 쓰지 않는다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const dialog = f.dialog();
    f.setDialogs([dialog]);
    assert.equal(c.bindDialog(dialog), true);
    f.setDialogs([dialog, f.dialog()]);
    assert.equal(c.current(), false);
    dialog.open = false;
    f.setDialogs([]);
    assert.equal(c.current(), false);
    assert.equal(c.request({ kind: 'font-name', language: 'hangul', name: '변경' }), false);
    assert.equal(f.messages.length, 0);
  });
});
test('실패한 대화상자 등록은 나중에 열려도 되살아나지 않는다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const dialog = f.dialog();
    dialog.open = false;
    assert.equal(c.bindDialog(dialog), false);
    dialog.open = true;
    f.setDialogs([dialog]);
    assert.equal(c.current(), false);
    assert.equal(c.request({ kind: 'text-color', color: '#123abc' }), false);
    assert.equal(f.messages.length, 0);
  });
});
test('대화상자 안에서도 다른 문서나 새 코어 관측은 최초 범위로 쓰지 않는다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    const dialog = f.dialog();
    f.setDialogs([dialog]);
    assert.equal(c.bindDialog(dialog), true);
    f.install({ documentId: 'new', generation: 2 });
    assert.equal(c.current(), false);
    assert.equal(c.request({ kind: 'font-name', language: 'hangul', name: '변경' }), false);
    assert.equal(f.messages.length, 0);
  });
});
test('누락된 리소스는 자동 색이나 기본 글꼴로 꾸미지 않는다', async () => {
  await run(async (f, s) => {
    f.install({
      content: { ...f.state().content, characterTextColors: [], characterFontReferences: [] },
    });
    const c = s.captureSelectionFormatting();
    assert.ok(c);
    assert.equal(c.observation.textColor, null);
    assert.equal(c.observation.fontNames.hangul.kind, 'unknown');
    assert.equal(c.reasons.textColorAvailableReason, 'UnknownCharacterTextColor');
    assert.equal(c.reasons.fontNameAvailableReasons.hangul, 'UnknownCharacterFontName');
    assert.equal(c.request({ kind: 'text-color', color: '#123456' }), false);
    assert.equal(f.messages.length, 0);
  });
});
test('잘못된 속성이나 언어 이름은 원본 요청 없이 거부한다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    assert.equal(
      c.request({ kind: 'character-properties', properties: { size: 1800, unknown: true } }),
      false,
    );
    assert.equal(f.messages.length, 0);
    const next = s.captureSelectionFormatting();
    assert.equal(
      next.request({ kind: 'font-name', language: 'not-language', name: '변경' }),
      false,
    );
    assert.equal(f.messages.length, 0);
  });
});

test('범위 서식 응답 전의 다음 입력은 기존 의도 큐에서 응답 뒤에만 실행된다', async () => {
  await run(async (f, s) => {
    const c = s.captureSelectionFormatting();
    assert.equal(c.request({ kind: 'text-color', color: '#abcdef' }), true);
    await tick();
    const event = new Event('beforeinput', { cancelable: true });
    Object.assign(event, { inputType: 'insertText', data: 'Z', isComposing: false });
    f.input().dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.messages.length, 1, '서식 응답 전에는 후속 삭제를 접수하지 않는다');
    f.ack(
      { operationRevision: 2, nativeHistoryRevision: 2, nativeHistoryRevisions: [2, 1, 0] },
      { reply: { historyRevision: 2, historyRevisions: [2, 1, 0], changed: true } },
    );
    await tick();
    assert.equal(f.messages.length, 2);
    assert.equal(f.messages[1].kind, 'replace-paragraph-ranges');
    assert.equal(f.messages[1].text, 'Z');
  });
});
test('서식 실패 응답 뒤에는 대기 입력을 다른 위치에 적용하지 않는다', async () => {
  await run(async (f, s) => {
    assert.equal(
      s
        .captureSelectionFormatting()
        .request({ kind: 'font-name', language: 'hangul', name: '변경' }),
      true,
    );
    await tick();
    const event = new Event('beforeinput', { cancelable: true });
    Object.assign(event, { inputType: 'insertText', data: 'Z', isComposing: false });
    f.input().dispatchEvent(event);
    f.waits.shift().resolve({
      status: 'rejected-unapplied',
      state: f.state(),
      error: 'ReadOnlyDocument',
      reply: { changed: false, applied: false },
    });
    await tick();
    assert.equal(f.messages.length, 1);
  });
});
