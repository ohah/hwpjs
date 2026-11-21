// Actual Surface/Canvas; controlled renderer and Core replies. No Native/save/UI proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
import { richTypingOwnerAllowed } from '../../../web/preview/caret-formatting-intent.mjs';
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';

async function run(format, owner, body) {
  const f = formattingFixture();
  const ownerFields =
    owner === 'cell'
      ? { tableCell: { tableNode: 5, listNode: 6 } }
      : owner === 'drawing'
        ? { drawingText: { drawingNode: 5, listNode: 6 } }
        : {};
  f.install({
    content: {
      ...f.state().content,
      format,
      richTypingScope: 9,
      paragraphs: f.state().content.paragraphs.map((p, i) => ({
        ...p,
        plainEditable: true,
        currentReference: { kind: owner === 'generated-body' ? 'generated' : 'original' },
        ...(i === 0 ? ownerFields : {}),
      })),
    },
  });
  f.renderer.richTypingScope = (p) =>
    richTypingOwnerAllowed(format, f.renderer.paragraph(p)) ? 9 : null;
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (m) => f.reports.push(m),
  });
  try {
    f.pointer('pointerdown', 0, 1);
    f.pointer('pointerup', 0, 1);
    await tick();
    await body(f, surface);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
function input(f, text, composition = false) {
  const box = f.input();
  const at = box.selectionStart;
  const before = new Event('beforeinput', { cancelable: true });
  Object.assign(before, {
    inputType: composition ? 'insertCompositionText' : 'insertText',
    data: text,
    isComposing: composition,
  });
  box.dispatchEvent(before);
  assert.equal(before.defaultPrevented, false);
  box.value = box.value.slice(0, at) + text + box.value.slice(box.selectionEnd);
  box.setSelectionRange(at + text.length, at + text.length);
  const event = new Event('input');
  Object.assign(event, { inputType: before.inputType, data: text, isComposing: composition });
  box.dispatchEvent(event);
}
function pending(f, s) {
  for (const intent of [
    { kind: 'underline', underlineKind: 'bottom' },
    { kind: 'strike', enabled: true },
    { kind: 'text-color', color: '#000000' },
    {
      kind: 'font-names',
      names: Object.fromEntries(FONT_LANGUAGES.map((l) => [l, `Typing ${l}`])),
    },
  ]) {
    const capture = s.captureCaretFormatting();
    assert(capture, f.reports.join('\n'));
    assert.equal(capture.request(intent), true);
  }
  const observation = s.captureCaretFormatting().observation;
  assert.equal(observation.underline, true);
  assert.equal(observation.strike, true);
  assert.equal(observation.textColor, '#000000');
  for (const l of FONT_LANGUAGES) assert.equal(observation.fontNames[l].name, `Typing ${l}`);
  assert.equal(f.messages.length, 0);
}
function ack(f) {
  const m = f.messages.at(-1);
  const content = f.state().content;
  const paragraphs = content.paragraphs.map((p) =>
    p.paragraph === m.paragraph
      ? { ...p, text: p.text.slice(0, m.startUnit) + m.text + p.text.slice(m.endUnit) }
      : p,
  );
  const revision = f.state().nativeHistoryRevision + 1;
  f.ack({
    content: { ...content, paragraphs },
    nativeHistoryRevision: revision,
    nativeHistoryRevisions: [...new Set([revision, ...f.state().nativeHistoryRevisions])],
  });
}
for (const format of ['hwp5', 'hwpx'])
  for (const owner of ['body', 'generated-body', 'cell', 'drawing']) {
    test(`${format} ${owner}: caret toolbar pending rich attributes are sent in one insertion`, () =>
      run(format, owner, async (f, s) => {
        pending(f, s);
        input(f, '한😀');
        await tick();
        const m = f.messages.at(-1);
        assert.equal(m.kind, 'splice-rich-character');
        assert.equal(m.text, '한😀');
        assert.equal(m.insertion.character.textColor, 0);
        assert.deepEqual(m.insertion.character.underline, { kind: 'bottom' });
        assert.deepEqual(m.insertion.character.strike, { enabled: true });
        assert.equal(Object.keys(m.insertion.character.fonts).length, 7);
        ack(f);
        await tick();
      }));
  }
test('rapid input retains each owned style across controlled ACKs without duplicate insertion', () =>
  run('hwpx', 'cell', async (f, s) => {
    pending(f, s);
    input(f, 'x');
    input(f, 'y');
    await tick();
    assert.equal(f.messages.length, 1);
    ack(f);
    await tick();
    assert.equal(f.messages.length, 2);
    assert.equal(f.messages[1].text, 'y');
    assert.deepEqual(f.messages[1].insertion, f.messages[0].insertion);
    ack(f);
    await tick();
    assert.equal(f.state().content.paragraphs[0].text, 'AxyBCD');
  }));
test('composition commits one styled input after compositionend', () =>
  run('hwpx', 'drawing', async (f, s) => {
    pending(f, s);
    f.input().dispatchEvent(new Event('compositionstart'));
    input(f, '한', true);
    await tick();
    assert.equal(f.messages.length, 0);
    const event = new Event('compositionend');
    Object.assign(event, { data: '한' });
    f.input().dispatchEvent(event);
    await tick();
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].text, '한');
    assert.equal(f.messages[0].kind, 'splice-rich-character');
    ack(f);
    await tick();
  }));
test('same paragraph switching to a different native list retires the pending style', async () => {
  for (const format of ['hwp5', 'hwpx'])
    for (const owner of ['cell', 'drawing'])
      for (const phase of ['direct', 'composition', 'queued', 'reselect'])
        await run(format, owner, async (f, s) => {
          const label = `${format}/${owner}/${phase}`;
          pending(f, s);
          const read = f.renderer.paragraph;
          const newOwner = (row) => ({
            ...row,
            ...(owner === 'cell'
              ? { tableCell: { tableNode: 99, listNode: 100 } }
              : { drawingText: { drawingNode: 99, listNode: 100 } }),
          });
          const transfer = () => {
            f.renderer.paragraph = (p) => (p.paragraph === 0 ? newOwner(read(p)) : read(p));
          };
          let applied = 0;
          if (phase === 'reselect') {
            transfer();
            const content = f.state().content;
            f.install({
              content: {
                ...content,
                paragraphs: content.paragraphs.map((p) => (p.paragraph === 0 ? newOwner(p) : p)),
              },
            });
            await tick();
            f.pointer('pointerdown', 0, 1);
            f.pointer('pointerup', 0, 1);
            await tick();
            const fresh = s.captureCaretFormatting();
            assert(fresh, label);
            assert.equal(fresh.observation.underline, false, label);
            assert.equal(fresh.observation.strike, false, label);
            input(f, 'x');
            await tick();
            assert.equal(f.messages.length, 1, label);
            assert.equal(f.messages[0].kind, 'splice', label);
            ack(f);
            await tick();
            const freshStyle = s.captureCaretFormatting();
            assert(freshStyle, label);
            assert.equal(freshStyle.request({ kind: 'text-color', color: '#ffffff' }), true, label);
            input(f, 'y');
            await tick();
            assert.equal(f.messages.length, 2, label);
            assert.equal(f.messages[1].kind, 'splice-rich-character', label);
            assert.deepEqual(f.messages[1].insertion.character, { textColor: 0xffffff }, label);
            ack(f);
            await tick();
            return;
          }
          if (phase === 'queued') {
            input(f, 'x');
            await tick();
            assert.equal(f.messages.length, 1, label);
            assert.equal(f.messages[0].kind, 'splice-rich-character', label);
            transfer();
            input(f, 'y');
            await tick();
            assert.equal(f.messages.length, 1, label);
            ack(f);
            applied = 1;
          } else if (phase === 'composition') {
            f.input().dispatchEvent(new Event('compositionstart'));
            input(f, '한', true);
            await tick();
            assert.equal(f.messages.length, 0, label);
            transfer();
            const event = new Event('compositionend');
            Object.assign(event, { data: '한' });
            f.input().dispatchEvent(event);
          } else {
            transfer();
            input(f, 'x');
          }
          await tick();
          assert.equal(f.messages.length, applied, label);
          assert.equal(f.input().value, applied ? 'AxBCD' : 'ABCD', label);
          // Returning to the prior owner cannot resurrect the retired style.
          f.renderer.paragraph = read;
          const restoredUnit = applied ? 2 : 1;
          f.pointer('pointerdown', 0, restoredUnit);
          f.pointer('pointerup', 0, restoredUnit);
          await tick();
          const restored = s.captureCaretFormatting();
          assert(restored, label);
          assert.equal(restored.observation.underline, false, label);
          assert.equal(restored.observation.strike, false, label);
          assert.equal(restored.observation.textColor, '#123456', label);
          for (const language of FONT_LANGUAGES)
            assert.equal(
              restored.observation.fontNames[language].name,
              `검증 글꼴 ${language}`,
              label,
            );
          input(f, 'z');
          await tick();
          assert.equal(f.messages.length, applied + 1, label);
          assert.equal(f.messages.at(-1).kind, 'splice', label);
          assert.equal(f.messages.at(-1).text, 'z', label);
          ack(f);
          await tick();
        });
});

test('revoking the input lease invalidates pending captures without a native request', () =>
  run('hwpx', 'cell', async (f, s) => {
    pending(f, s);
    const capture = s.captureCaretFormatting();
    assert(capture.current());
    f.revoke();
    assert.equal(capture.current(), false);
    assert.equal(capture.request({ kind: 'text-color', color: '#ffffff' }), false);
    assert.equal(s.captureCaretFormatting(), null);
    assert.equal(f.messages.length, 0);
  }));
test('undo and redo clear pending rich attributes and re-read the restored source observation', () =>
  run('hwpx', 'body', async (f, s) => {
    const original = f.state().content;
    pending(f, s);
    input(f, 'x');
    await tick();
    ack(f);
    await tick();
    const edited = f.state().content;
    for (const [kind, content, revision] of [
      ['undo', original, 1],
      ['redo', edited, 2],
    ]) {
      assert.equal(
        s.requestHistory(kind),
        true,
        JSON.stringify({
          kind,
          messages: f.messages,
          reports: f.reports,
          revision: f.state().nativeHistoryRevision,
        }),
      );
      await tick();
      // Native's list starts with the current revision even after history travel.
      const reachable = [
        revision,
        ...f.state().nativeHistoryRevisions.filter((r) => r !== revision),
      ];
      f.ack(
        { content, nativeHistoryRevision: revision, nativeHistoryRevisions: reachable },
        { reply: { changed: true, historyRevision: revision, historyRevisions: reachable } },
      );
      await tick();
      f.frame();
      await tick();
      f.frame();
      await tick();
      const current = s.captureCaretFormatting();
      assert(current);
      assert.equal(current.observation.underline, false);
      assert.equal(current.observation.strike, false);
      assert.equal(current.observation.textColor, '#123456');
      assert.equal(current.observation.fontNames.latin.name, '검증 글꼴 latin');
    }
  }));
