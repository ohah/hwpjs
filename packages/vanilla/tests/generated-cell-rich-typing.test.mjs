// Actual Surface/Canvas; renderer/Core/native replies controlled. No engine/save claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
import {
  createdCellTypingOwner,
  createdCellTypingObservation,
} from '../../../web/preview/created-cell-typing-observation.mjs';
import { createdCellCharacterRanges } from '../../../js/created-cell-character-runs.mjs';
import { FONT_LANGUAGES } from '../../../js/font-face-identity.mjs';
async function run(format, body) {
  const f = formattingFixture();
  const address = { identity: '9007199254740993', row: 0, column: 0 };
  f.install({
    content: {
      ...f.state().content,
      format,
      createdCellTypingScope: 9,
      createdTables: [
        {
          section: 0,
          identity: address.identity,
          cells: [
            {
              paragraph_id: 1,
              row: 0,
              column: 0,
              text: 'ABCD',
              character_runs: [{ start_unit: 0, char_shape_id: 0 }],
            },
          ],
        },
      ],
    },
  });
  const sourceParagraph = f.renderer.paragraph;
  const generated = () => {
    const cell = f.state().content.createdTables[0].cells[0];
    return {
      section: 0,
      createdCell: { ...address },
      text: cell.text,
      editable: true,
      selectable: true,
      softLineBreakAvailable: true,
      hasCanonicalCharacterRuns: Object.hasOwn(cell, 'character_runs'),
      characterRanges: createdCellCharacterRanges(cell, 0),
      ...(format === 'hwp5'
        ? {
            currentReference: {
              epoch: '1',
              scope: 'native',
              kind: 'cell',
              section: 0,
              id: address.identity,
              row: 0,
              column: 0,
            },
          }
        : {}),
    };
  };
  f.renderer.paragraph = (p) => (p?.createdCell ? generated() : sourceParagraph(p));
  f.renderer.layout = () => ({
    width: 800,
    height: 600,
    rows: [generated(), f.state().content.paragraphs[0]].map((p, i) => ({
      ...p,
      startUnit: 0,
      endUnit: p.text.length,
      width: p.text.length * 8,
      height: 28,
      x: 20,
      y: i * 32,
      boundaries: Array.from({ length: p.text.length + 1 }, (_, unit) => ({ unit, x: unit * 8 })),
    })),
  });
  f.renderer.createdCellTypingOwner = (p) =>
    createdCellTypingOwner(f.state().content, f.renderer.paragraph(p), p);
  f.renderer.createdCellTypingObservation = (p) =>
    createdCellTypingObservation(f.state().content, f.renderer.paragraph(p), p);
  f.renderer.createdCellCanonicalRuns = (p) =>
    f.renderer.paragraph(p)?.hasCanonicalCharacterRuns === true;
  f.renderer.richTypingScope = (p) => f.renderer.createdCellTypingOwner(p)?.scope ?? null;
  const surface = createCanvasSurface({
    root: f.root,
    editor: f.editor,
    onStatus: (m) => f.reports.push(m),
  });
  const click = async (unit) => {
    f.pointer('pointerdown', 0, unit);
    f.pointer('pointerup', 0, unit);
    await tick();
  };
  try {
    await click(4);
    await body(f, surface, click);
  } finally {
    while (f.waits.length) f.reject();
    await surface.dispose();
  }
}
function insert(f, text, composing = false) {
  const box = f.input(),
    at = box.selectionStart;
  const before = new Event('beforeinput', { cancelable: true });
  Object.assign(before, {
    inputType: composing ? 'insertCompositionText' : 'insertText',
    data: text,
    isComposing: composing,
  });
  box.dispatchEvent(before);
  assert(!before.defaultPrevented);
  box.value = box.value.slice(0, at) + text + box.value.slice(box.selectionEnd);
  box.setSelectionRange(at + text.length, at + text.length);
  const event = new Event('input');
  Object.assign(event, { inputType: before.inputType, data: text, isComposing: composing });
  box.dispatchEvent(event);
}
function styles(f, s) {
  for (const intent of [
    { kind: 'underline', underlineKind: 'bottom' },
    { kind: 'strike', enabled: true },
    { kind: 'text-color', color: '#000000' },
    {
      kind: 'font-names',
      names: Object.fromEntries(FONT_LANGUAGES.map((l) => [l, 'Generated ' + l])),
    },
  ]) {
    const capture = s.captureCaretFormatting();
    assert(capture, f.reports.join('\n'));
    assert.equal(capture.request(intent), true);
  }
  assert.equal(f.state().selection, null);
  assert.equal(f.messages.length, 0);
}
function ack(f) {
  const content = f.state().content,
    table = content.createdTables[0],
    cell = table.cells[0];
  const revision = f.state().nativeHistoryRevision + 1;
  // One explicit controlled Native reply, not a JS implementation of run edits.
  f.ack({
    content: {
      ...content,
      createdTables: [
        {
          ...table,
          cells: [
            {
              ...cell,
              text: 'ABCDX',
              character_runs: [
                { start_unit: 0, char_shape_id: 0 },
                { start_unit: 4, char_shape_id: 1 },
                { start_unit: 5, char_shape_id: 0 },
              ],
            },
          ],
        },
      ],
      characterUnderlines: [
        { id: 0, kind: 'none' },
        { id: 1, kind: 'bottom' },
      ],
      characterStrikes: [
        { id: 0, enabled: false },
        { id: 1, enabled: true },
      ],
    },
    nativeHistoryRevision: revision,
    nativeHistoryRevisions: [revision, ...f.state().nativeHistoryRevisions],
  });
}
for (const format of ['hwp5', 'hwpx']) {
  test(`${format} generated caret sends complete pending style in one exact logical splice`, () =>
    run(format, async (f, s) => {
      styles(f, s);
      insert(f, '한😀');
      await tick();
      const m = f.messages.at(-1);
      assert.equal(m.kind, 'created-cell-splice');
      assert.equal(m.identity, '9007199254740993');
      assert.equal(m.startUnit, 4);
      assert.equal(m.endUnit, 4);
      assert.equal(m.text, '한😀');
      assert(!Object.hasOwn(m, 'paragraph'));
      assert.equal(m.insertion.character.textColor, 0);
      assert.deepEqual(m.insertion.character.underline, { kind: 'bottom' });
      assert.deepEqual(m.insertion.character.strike, { enabled: true });
      assert.equal(Object.keys(m.insertion.character.fonts).length, 7);
      assert.equal(m.expectedHistoryRevision, 1);
      assert.equal(m.createdCellTypingScope, 9);
    }));
  test(`${format} canonical cell ordinary input is an exact splice and never a whole-cell overwrite`, () =>
    run(format, async (f, s) => {
      const c = s.captureCaretFormatting();
      assert(c);
      insert(f, 'X');
      await tick();
      const m = f.messages.at(-1);
      assert.equal(m.kind, 'created-cell-splice');
      assert.equal(m.text, 'X');
      assert.equal(m.startUnit, 4);
      assert.equal(m.endUnit, 4);
      assert.deepEqual(m.insertion, { character: {} });
    }));
}
test('generated rapid input waits for the canonical ACK and keeps one logical owner', () =>
  run('hwp5', async (f, s) => {
    styles(f, s);
    insert(f, 'X');
    await tick();
    assert.equal(f.messages.length, 1);
    insert(f, 'Y');
    await tick();
    assert.equal(f.messages.length, 1);
    ack(f);
    await tick();
    assert.equal(f.messages.length, 2);
    const m = f.messages[1];
    assert.equal(m.kind, 'created-cell-splice');
    assert.equal(m.startUnit, 5);
    assert.equal(m.endUnit, 5);
    assert.equal(m.text, 'Y');
    assert.equal(m.expectedHistoryRevision, 2);
    assert.equal(m.identity, f.messages[0].identity);
  }));
test('generated IME commits after compositionend through the same canonical owner', () =>
  run('hwpx', async (f, s) => {
    styles(f, s);
    f.input().dispatchEvent(new Event('compositionstart'));
    insert(f, '한', true);
    await tick();
    assert.equal(f.messages.length, 0);
    f.input().dispatchEvent(new Event('compositionend'));
    await tick();
    assert.equal(f.messages.length, 1);
    assert.equal(f.messages[0].kind, 'created-cell-splice');
    assert.equal(f.messages[0].text, '한');
  }));
test('generated soft line break uses the same rich paragraph run model without paragraph splitting', () =>
  run('hwp5', async (f, s) => {
    styles(f, s);
    const event = new Event('beforeinput', { cancelable: true });
    Object.assign(event, { inputType: 'insertLineBreak', data: null, isComposing: false });
    f.input().dispatchEvent(event);
    assert(event.defaultPrevented);
    await tick();
    const m = f.messages.at(-1);
    assert.equal(m.kind, 'created-cell-splice');
    assert.equal(m.startUnit, 4);
    assert.equal(m.endUnit, 4);
    assert.equal(m.text, '\n');
    assert.deepEqual(m.insertion.character.strike, { enabled: true });
  }));
test('generated captures retire with source scope or lease and cannot acquire styles from a stale display', () =>
  run('hwpx', async (f, s) => {
    const c = s.captureCaretFormatting();
    assert(c);
    f.install({ content: { ...f.state().content, createdCellTypingScope: null } });
    await tick();
    assert.equal(c.current(), false);
    assert.equal(s.captureCaretFormatting(), null);
    assert.equal(f.messages.length, 0);
    f.revoke();
    assert.equal(c.request({ kind: 'strike', enabled: true }), false);
  }));
test('generated undo redo re-reads canonical EOF style and retires pending intent before the next plain splice', () =>
  run('hwp5', async (f, s, click) => {
    const original = f.state().content;
    styles(f, s);
    insert(f, 'X');
    await tick();
    ack(f);
    await tick();
    const redone = f.state().content;
    for (const [kind, content, revision, expected] of [
      ['undo', original, 1, false],
      ['redo', redone, 2, true],
    ]) {
      assert.equal(s.requestHistory(kind), true, f.reports.join('\n'));
      await tick();
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
      await click(expected ? 5 : 4);
      const c = s.captureCaretFormatting();
      assert(c, f.reports.join('\n'));
      assert.equal(c.observation.underline, expected);
      assert.equal(c.observation.strike, expected);
    }
    insert(f, 'D');
    await tick();
    const m = f.messages.at(-1);
    assert.equal(m.kind, 'created-cell-splice');
    assert.equal(m.startUnit, 5);
    assert.equal(m.endUnit, 5);
    assert.equal(m.text, 'D');
    assert.deepEqual(m.insertion, { character: {} });
  }));

test('a fresh canonical paragraph at the same cell coordinates cannot inherit retired pending style', () =>
  run('hwp5', async (f, s, click) => {
    styles(f, s);
    const content = f.state().content,
      table = content.createdTables[0],
      cell = table.cells[0];
    f.install({
      content: { ...content, createdTables: [{ ...table, cells: [{ ...cell, paragraph_id: 2 }] }] },
    });
    await tick();
    await click(4);
    const capture = s.captureCaretFormatting();
    assert(capture);
    assert.equal(capture.observation.underline, false);
    assert.equal(capture.observation.strike, false);
    insert(f, 'D');
    await tick();
    assert.deepEqual(f.messages.at(-1).insertion, { character: {} });
  }));
