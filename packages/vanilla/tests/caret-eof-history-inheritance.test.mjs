// Actual Surface/Canvas, controlled source replies. Saved Native runs are
// verified by the separate engine probe; these tests never synthesize a patch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';

for (const owner of ['cell', 'drawing', 'body'])
  test(`H5 ${owner} redo and cursor re-selection observe EOF runs without retaining typing intents`, async () => {
    const f = formattingFixture();
    const original = {
      ...f.state().content,
      format: 'hwp5',
      richTypingScope: 9,
      paragraphs: f.state().content.paragraphs.map((p, i) =>
        i
          ? p
          : {
              ...p,
              text: '',
              plainEditable: true,
              ...(owner === 'cell'
                ? { tableCell: { tableNode: 13, listNode: 14, row: 0, column: 0 } }
                : {}),
              ...(owner === 'drawing' ? { drawingText: { drawingNode: 13, listNode: 14 } } : {}),
              characterRanges: [{ start: 0, end: 0, charShapeId: 0 }],
            },
      ),
      characterUnderlines: [
        { id: 0, kind: 'none' },
        { id: 1, kind: 'bottom' },
      ],
      characterStrikes: [
        { id: 0, enabled: false },
        { id: 1, enabled: true },
      ],
    };
    // Visible display excludes the physical CR and its different shape. The
    // observation must come from the restored preceding visible source range.
    const redone = {
      ...original,
      paragraphs: original.paragraphs.map((p, i) =>
        i
          ? p
          : {
              ...p,
              text: 'ABC',
              characterRanges: [{ start: 0, end: 3, charShapeId: 1 }],
            },
      ),
    };
    f.install({ content: original });
    f.renderer.richTypingScope = () => 9;
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
    const insert = async (text, value, unit) => {
      const input = f.input();
      const before = new Event('beforeinput', { cancelable: true });
      Object.assign(before, { inputType: 'insertText', data: text, isComposing: false });
      input.dispatchEvent(before);
      assert.equal(before.defaultPrevented, false);
      input.value = value;
      input.setSelectionRange(unit, unit);
      const event = new Event('input');
      Object.assign(event, { inputType: 'insertText', data: text, isComposing: false });
      input.dispatchEvent(event);
      await tick();
    };
    try {
      await click(0);
      for (const intent of [
        { kind: 'underline', underlineKind: 'bottom' },
        { kind: 'strike', enabled: true },
      ])
        assert.equal(surface.captureCaretFormatting().request(intent), true);
      await insert('ABC', 'ABC', 3);
      assert.equal(f.messages.at(-1).kind, 'splice-rich-character');
      f.ack({ content: redone, nativeHistoryRevision: 2, nativeHistoryRevisions: [2, 1, 0] });
      await tick();
      for (const [kind, content, revision] of [
        ['undo', original, 1],
        ['redo', redone, 2],
      ]) {
        assert.equal(surface.requestHistory(kind), true, f.reports.join('\n'));
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
      }
      await click(3);
      let capture = surface.captureCaretFormatting();
      assert(capture, f.reports.join('\n'));
      assert.equal(capture.observation.underline, true);
      assert.equal(capture.observation.strike, true);
      await click(0);
      await click(3);
      capture = surface.captureCaretFormatting();
      assert.equal(capture.observation.underline, true);
      assert.equal(capture.observation.strike, true);
      f.input().setSelectionRange(3, 3);
      await insert('D', 'ABCD', 4);
      const message = f.messages.at(-1);
      assert.equal(message.kind, 'splice');
      assert.equal(message.startUnit, 3);
      assert.equal(message.endUnit, 3);
      assert.equal(message.text, 'D');
      assert.equal(Object.hasOwn(message, 'insertion'), false);
      assert.equal(Object.hasOwn(message, 'properties'), false);
    } finally {
      while (f.waits.length) f.reject();
      await surface.dispose();
    }
  });
