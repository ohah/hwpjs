// 실제 Canvas/Surface와 통제 Core/renderer를 사용한다. Native 입력·실제 UI 증거가 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
async function run(body) {
  const f = formattingFixture();
  for (const key of [
    'characterPropertyTextAvailable',
    'namedFontTextAvailable',
    'namedFontPropertyTextAvailable',
  ])
    f.renderer[key] = () => true;
  f.install({
    content: { ...f.state().content, paragraphAlignmentAvailable: true },
    capabilities: { ...f.state().capabilities, structureAvailable: true, mergeAvailable: true },
  });
  const s = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (m) => {
      f.reports.push(m);
      f.statusHook?.(m);
    },
  });
  const caret = async (p = 0, u = 1) => {
    f.pointer('pointerdown', p, u);
    f.pointer('pointerup', p, u);
    await tick();
  };
  try {
    await caret();
    await body(f, s, caret);
  } finally {
    while (f.waits.length) f.reject();
    await s.dispose();
  }
}
test('정본 collapsed Canvas와 Core target을 관측하고 Native 요청 없이 typing 속성을 설정한다', () =>
  run(async (f, s) => {
    const c = s.captureCaretFormatting();
    assert(c);
    assert.equal(c.mode, 'typing');
    assert.equal(c.observation.bold, false);
    assert.equal(c.observation.size, 1200);
    assert.equal(c.state.selection.startUnit, c.state.selection.endUnit);
    assert.equal(
      c.request({ kind: 'character-properties', properties: { size: 2200, bold: true } }),
      true,
    );
    assert.equal(c.appliedCurrent(), true);
    assert.equal(c.request({ kind: 'character-properties', properties: { italic: false } }), false);
    assert.equal(f.messages.length, 0);
    const next = s.captureCaretFormatting();
    assert.equal(next.observation.bold, true);
    assert.equal(next.observation.size, 2200);
    assert.equal(next.request({ kind: 'font-name', language: 'latin', name: '새 글꼴' }), true);
    assert.equal(next.appliedCurrent(), true);
    assert.equal(s.captureCaretFormatting().observation.fontNames.latin.name, '새 글꼴');
    assert.equal(f.messages.length, 0);
  }));
test('소유 모달의 proxy 범위 변동은 Native 범위 writer로 흐르지 않는다', () =>
  run(async (f, s) => {
    const c = s.captureCaretFormatting(),
      dialog = f.dialog();
    f.setDialogs([dialog]);
    f.input().setSelectionRange(0, 3);
    assert.equal(c.bindDialog(dialog), true);
    assert.equal(c.current(), true);
    assert.equal(c.request({ kind: 'font-name', language: 'latin', name: '모달 글꼴' }), true);
    assert.equal(f.messages.length, 0);
    dialog.open = false;
    f.setDialogs([]);
    assert.equal(c.appliedCurrent(), true);
    assert.equal(s.focus(), true);
  }));
test('같은 Core 상태의 Canvas caret 이동과 metadata·문서 교체는 과거 의도를 거부한다', () =>
  run(async (f, s, caret) => {
    const c = s.captureCaretFormatting();
    await caret(0, 2);
    assert.equal(c.current(), false);
    assert.equal(c.request({ kind: 'character-properties', properties: { bold: true } }), false);
    for (const patch of [
      { selection: { ...f.state().selection } },
      { documentId: '새 문서', generation: 2 },
    ]) {
      const n = s.captureCaretFormatting();
      assert(n);
      f.install(patch);
      assert.equal(n.current(), false);
      assert.equal(n.appliedCurrent(), false);
    }
    assert.equal(f.messages.length, 0);
  }));
test('커서 이동·undo는 입력 의도를 남기지 않고 현재 Native 표시값을 다시 읽는다', () =>
  run(async (f, s, caret) => {
    s.captureCaretFormatting().request({
      kind: 'character-properties',
      properties: { bold: true },
    });
    await caret(0, 2);
    assert.equal(s.captureCaretFormatting().observation.bold, false);
    const n = s.captureCaretFormatting();
    n.request({ kind: 'font-name', language: 'latin', name: '임시 글꼴' });
    f.install({ nativeHistoryRevision: 2 });
    assert.equal(n.appliedCurrent(), false);
    // 기존 history 응답의 typing reset 분기는 별도 원회귀와 연결한다.
  }));
test('readonly·IME·draft·다른 modal·dispose는 typing writer와 초점 권한을 발급하지 않는다', () =>
  run(async (f, s) => {
    const c = s.captureCaretFormatting();
    const modal = f.dialog();
    f.setDialogs([modal]);
    assert.equal(c.current(), false);
    f.setDialogs([]);
    f.input().value += '미반영';
    assert.equal(c.current(), false);
    assert.equal(s.captureCaretFormatting(), null);
    f.input().value = f.state().content.paragraphs[0].text;
    f.input().dispatchEvent(new Event('compositionstart'));
    assert.equal(s.captureCaretFormatting(), null);
    f.input().dispatchEvent(new Event('compositionend'));
    await tick();
    await s.dispose();
    assert.equal(c.current(), false);
    assert.equal(c.appliedCurrent(), false);
  }));
test('지원하지 않는 색·대표7·밑줄·취소선은 명시 거부하고 현재성 검사의 조회수는 고정이다', () =>
  run(async (f, s) => {
    const c = s.captureCaretFormatting();
    for (const intent of [
      { kind: 'text-color', color: '#ff0000' },
      { kind: 'underline', underlineKind: 'bottom' },
      { kind: 'strike', enabled: true },
      { kind: 'font-names', names: {} },
    ])
      assert.equal(c.request(intent), false);
    assert(c.reasons.textColorAvailableReason);
    assert(c.reasons.fontNamesAvailableReason);
    let reads = 0;
    const layout = f.renderer.layout;
    f.renderer.layout = () => {
      reads++;
      return layout();
    };
    for (let i = 0; i < 3; i++) assert.equal(c.current(), true);
    assert.equal(reads, 6);
    assert.equal(f.messages.length, 0);
  }));

function key(input, key) {
  const e = new Event('keydown', { cancelable: true });
  Object.assign(e, {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
  });
  input.dispatchEvent(e);
}
async function typeOne(f, letter) {
  const input = f.input(),
    at = input.selectionStart,
    old = input.value;
  const before = new Event('beforeinput', { cancelable: true });
  Object.assign(before, { inputType: 'insertText', data: letter, isComposing: false });
  input.dispatchEvent(before);
  if (!before.defaultPrevented) {
    input.value = old.slice(0, at) + letter + old.slice(input.selectionEnd);
    input.setSelectionRange(at + letter.length, at + letter.length);
    const e = new Event('input');
    Object.assign(e, { inputType: 'insertText', data: letter, isComposing: false });
    input.dispatchEvent(e);
  }
  await tick();
  console.log(
    '입력진단',
    JSON.stringify({
      letter,
      messages: f.messages,
      waits: f.waits.length,
      reports: f.reports.slice(-4),
      value: f.input().value,
      selection: f.canvas().dataset.selection,
    }),
  );
  const message = f.messages.at(-1);
  assert.equal(message.kind, 'splice-font-name');
  assert.equal(message.name, '상속 글꼴');
  assert.equal(message.properties.bold, true);
  const oldContent = f.state().content,
    paragraphs = oldContent.paragraphs.map((p) =>
      p.paragraph === message.paragraph
        ? {
            ...p,
            text: p.text.slice(0, message.startUnit) + letter + p.text.slice(message.endUnit),
            characterRanges: [{ start: 0, end: p.text.length + letter.length, charShapeId: 0 }],
          }
        : p,
    );
  const nextRevision = f.state().nativeHistoryRevision + 1;
  const reachable = [...new Set([nextRevision, ...f.state().nativeHistoryRevisions])];
  console.log(
    '통제 ACK',
    JSON.stringify({
      kind: message.kind,
      revision: nextRevision,
      reachable,
      pending: f.waits.map((w) => w.kind),
    }),
  );
  f.ack({
    content: { ...oldContent, paragraphs },
    nativeHistoryRevision: nextRevision,
    nativeHistoryRevisions: reachable,
  });
  await tick();
  f.frame();
  await tick();
}
test('연속 ABC와 split 명시 이전 뒤 DEF는 기존 bold와 font 입력 상속을 유지한다', () =>
  run(async (f, s) => {
    assert.equal(
      s
        .captureCaretFormatting()
        .request({ kind: 'character-properties', properties: { bold: true } }),
      true,
    );
    assert.equal(
      s
        .captureCaretFormatting()
        .request({ kind: 'font-name', language: 'latin', name: '상속 글꼴' }),
      true,
    );
    for (const ch of 'ABC') await typeOne(f, ch);
    key(f.input(), 'Enter');
    await tick();
    const split = f.messages.at(-1);
    assert.equal(split.kind, 'split');
    const old = f.state().content,
      left = old.paragraphs.find((p) => p.paragraph === split.paragraph),
      cut = split.atUnit;
    const paragraphs = [
      {
        ...left,
        text: left.text.slice(0, cut),
        characterRanges: [{ start: 0, end: cut, charShapeId: 0 }],
      },
      {
        ...left,
        paragraph: split.paragraph + 1,
        text: left.text.slice(cut),
        characterRanges: [{ start: 0, end: left.text.length - cut, charShapeId: 0 }],
      },
      ...old.paragraphs
        .filter((p) => p !== left)
        .map((p) => ({ ...p, paragraph: p.paragraph + 1 })),
    ];
    f.ack(
      {
        content: { ...old, paragraphs },
        nativeHistoryRevision: f.state().nativeHistoryRevision + 1,
      },
      {
        reply: {
          historyRevision: f.state().nativeHistoryRevision + 1,
          historyRevisions: [f.state().nativeHistoryRevision + 1, 1],
          splitTarget: { section: 0, paragraph: split.paragraph + 1 },
        },
      },
    );
    await tick();
    f.frame();
    await tick();
    for (const ch of 'DEF') await typeOne(f, ch);
    assert.equal(f.messages.filter((x) => x.kind === 'split').length, 1);
  }));
test('잘못된 sourceOffsets의 caret permission은 예외 대신 지원 거부로 끝난다', () =>
  run(async (f, s) => {
    const c = f.state().content;
    f.install({
      content: {
        ...c,
        paragraphs: c.paragraphs.map((p, i) =>
          i === 0 ? { ...p, editable: false, selectable: true, sourceOffsets: [] } : p,
        ),
      },
    });
    await tick();
    assert.doesNotThrow(() => s.captureCaretFormatting());
    assert.equal(f.messages.length, 0);
  }));

test('같은 caret의 동시 capture와 후속 의도는 이전 current와 적용 확인을 무효화한다', () =>
  run(async (f, s) => {
    const a = s.captureCaretFormatting(),
      b = s.captureCaretFormatting();
    assert(a.current());
    assert(b.current());
    assert.equal(a.request({ kind: 'character-properties', properties: { bold: true } }), true);
    assert.equal(b.current(), false);
    assert.equal(b.request({ kind: 'character-properties', properties: { bold: false } }), false);
    assert.equal(a.appliedCurrent(), true);
    const c = s.captureCaretFormatting();
    assert.equal(c.request({ kind: 'character-properties', properties: { italic: false } }), true);
    assert.equal(a.appliedCurrent(), false);
    assert.equal(c.appliedCurrent(), true);
    assert.equal(f.messages.length, 0);
  }));
test('report 재진입의 다른 의도는 이전 적용으로 승계하지 않는다', () =>
  run(async (f, s) => {
    const a = s.captureCaretFormatting();
    let changed = false;
    f.statusHook = () => {
      f.statusHook = null;
      const b = s.captureCaretFormatting();
      assert(b);
      changed = b.request({ kind: 'character-properties', properties: { bold: false } });
    };
    assert.equal(a.request({ kind: 'character-properties', properties: { bold: true } }), true);
    assert.equal(changed, true);
    assert.equal(a.appliedCurrent(), false);
    assert.equal(s.captureCaretFormatting().observation.bold, false);
    assert.equal(f.messages.length, 0);
  }));
test('accessor intent는 읽지 않고 거부하며 Proxy trap 뒤 현재성이 바뀌면 적용하지 않는다', () =>
  run(async (f, s) => {
    const a = s.captureCaretFormatting();
    let reads = 0;
    const intent = {
      kind: 'font-name',
      language: 'latin',
      get name() {
        reads++;
        return '다른 글꼴';
      },
    };
    assert.equal(a.request(intent), false);
    assert.equal(reads, 0);
    assert.equal(a.current(), true);
    const b = s.captureCaretFormatting();
    let traps = 0;
    const proxy = new Proxy(
      { kind: 'font-name', language: 'latin', name: '검증 글꼴' },
      {
        ownKeys(target) {
          traps++;
          f.install({ selection: { ...f.state().selection } });
          return Reflect.ownKeys(target);
        },
      },
    );
    assert.equal(b.request(proxy), false);
    assert.equal(traps, 1);
    assert.equal(b.appliedCurrent(), false);
    assert.equal(f.messages.length, 0);
  }));

test('split ACK 직후 다음 문단의 입력 의도 이전은 font와 bold를 보존한다', () =>
  run(async (f, s) => {
    s.captureCaretFormatting().request({
      kind: 'character-properties',
      properties: { bold: true },
    });
    s.captureCaretFormatting().request({ kind: 'font-name', language: 'latin', name: '상속 글꼴' });
    key(f.input(), 'Enter');
    await tick();
    const message = f.messages.at(-1);
    assert.equal(message.kind, 'split');
    assert.equal(f.waits.length, 1);
    const c = f.state().content,
      left = c.paragraphs[0],
      at = message.atUnit;
    const paragraphs = [
      {
        ...left,
        text: left.text.slice(0, at),
        characterRanges: [{ start: 0, end: at, charShapeId: 0 }],
      },
      {
        ...left,
        paragraph: 1,
        text: left.text.slice(at),
        characterRanges: [{ start: 0, end: left.text.length - at, charShapeId: 0 }],
      },
      ...c.paragraphs.slice(1).map((p) => ({ ...p, paragraph: p.paragraph + 1 })),
    ];
    const revision = f.state().nativeHistoryRevision + 1,
      reachable = [...new Set([revision, ...f.state().nativeHistoryRevisions])];
    console.log(
      '분할 ACK',
      JSON.stringify({
        request: message,
        pending: f.waits.map((w) => w.kind),
        revision,
        reachable,
      }),
    );
    f.ack(
      {
        content: { ...c, paragraphs },
        nativeHistoryRevision: revision,
        nativeHistoryRevisions: reachable,
      },
      {
        reply: {
          historyRevision: revision,
          historyRevisions: reachable,
          splitTarget: { section: 0, paragraph: 1 },
        },
      },
    );
    await tick();
    f.frame();
    await tick();
    await typeOne(f, 'D');
    assert.equal(f.messages.at(-1).paragraph, 1);
  }));

test('typing 입력의 undo 뒤 재입력은 과거 pending attrs 대신 복원된 Native run을 따른다', () =>
  run(async (f, s) => {
    const original = f.state().content;
    const properties = s.captureCaretFormatting();
    properties.request({ kind: 'character-properties', properties: { bold: true } });
    const font = s.captureCaretFormatting();
    font.request({ kind: 'font-name', language: 'latin', name: '상속 글꼴' });
    await typeOne(f, 'R');
    assert.equal(properties.appliedCurrent(), false);
    assert.equal(font.appliedCurrent(), false);
    assert.equal(s.requestHistory('undo'), true);
    await tick();
    assert.equal(f.messages.at(-1).kind, 'undo');
    assert.equal(f.waits.length, 1);
    const reachable = f.state().nativeHistoryRevisions;
    f.ack(
      { content: original, nativeHistoryRevision: 1, nativeHistoryRevisions: reachable },
      { reply: { changed: true, historyRevision: 1, historyRevisions: reachable } },
    );
    await tick();
    f.frame();
    await tick();
    f.frame();
    await tick();
    const current = s.captureCaretFormatting();
    assert(current);
    assert.equal(current.observation.bold, false);
    assert.equal(current.observation.fontNames.latin.name, '검증 글꼴 latin');
    const input = f.input(),
      at = input.selectionStart,
      prior = input.value;
    const before = new Event('beforeinput', { cancelable: true });
    Object.assign(before, { inputType: 'insertText', data: 'S', isComposing: false });
    input.dispatchEvent(before);
    if (!before.defaultPrevented) {
      input.value = prior.slice(0, at) + 'S' + prior.slice(input.selectionEnd);
      input.setSelectionRange(at + 1, at + 1);
      const e = new Event('input');
      Object.assign(e, { inputType: 'insertText', data: 'S', isComposing: false });
      input.dispatchEvent(e);
    }
    await tick();
    assert.equal(f.messages.at(-1).kind, 'splice');
    assert.equal(f.messages.at(-1).properties, undefined);
    assert.equal(f.messages.at(-1).name, undefined);
  }));
