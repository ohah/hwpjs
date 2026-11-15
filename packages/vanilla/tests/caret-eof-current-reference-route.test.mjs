// Actual source facade/engine and Surface/Canvas; renderer/Core replies are
// controlled. This is an input-route bridge, not a browser or full Core SDK run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCanvasSurface } from '../src/surface.ts';
import { formattingFixture, tick } from './multirange-formatting-fixture.mjs';
import { createExperimentalHwp5Editor } from '../../../js/hwp5-editor.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('caret EOF actual native current reference survives Canvas caret re-selection without a style patch', async () => {
  assert(
    process.env.HWPJS_TEST_WASM && /^[a-f0-9]{64}$/.test(process.env.HWPJS_TEST_WASM_SHA256 ?? ''),
    'ExplicitPinnedEngineRequired',
  );
  const bytes = readFileSync(process.env.HWPJS_TEST_WASM);
  assert.equal(sha(bytes), process.env.HWPJS_TEST_WASM_SHA256);
  const oldDefect = process.env.HWPJS_EXPECT_CR_EOF_DEFECT === '1';
  if (oldDefect)
    assert.equal(
      sha(bytes),
      '390a8d870420e270e6d37a4199d7a4277e25d8eccfe5a0448073bb1b6e74db7c',
      'BaselineDefectFlagRequiresExact390a',
    );
  const input = readFileSync(new URL('../../../src/caret_eof_fixtures/table.hwp', import.meta.url));
  assert.equal(sha(input), 'df4746b82eea954a2aba36eb7dc51acf8cd975dced5e3331a1838932eaf123f9');
  const native = await createExperimentalHwp5Editor(bytes, input);
  const f = formattingFixture();
  let surface, reopened;
  try {
    native.enableHistoryDefault();
    for (let i = 0; i < 3; i++)
      assert.equal(
        native.spliceWithRichCharacter({
          section: 0,
          paragraph: 1,
          startUnit: i,
          endUnit: i,
          text: 'ABC'[i],
          insertion: { character: { underline: { kind: 'bottom' }, strike: { enabled: true } } },
        }).application,
        'applied',
      );
    for (let i = 0; i < 3; i++) assert(native.undo());
    for (let i = 0; i < 3; i++) assert(native.redo());
    const reference = native.currentSourceReferences(0, { first: 1, count: 1 }).references[0];
    const binding = native.tableBindings(0).find((row) => row.paragraph === 1);
    assert(binding && binding.row === 0 && binding.column === 0);
    assert.equal(native.paragraphFlow(0)[1].host, 'table_cell');
    const text = native.currentText(reference).replace(/\r$/, '');
    assert.equal(text, 'ABC');
    const ranges = native
      .characterRanges(0, 1)
      .filter((r) => r.start < text.length)
      .map((r) => ({ ...r, end: Math.min(r.end, text.length) }));
    const p = {
      ...f.state().content.paragraphs[0],
      section: 0,
      paragraph: 1,
      text,
      plainEditable: true,
      currentReference: reference,
      tableCell: {
        tableNode: binding.tableNode,
        listNode: binding.listNode,
        row: binding.row,
        column: binding.column,
      },
      characterRanges: ranges,
    };
    f.install({
      nativeHistoryRevision: native.historyRevision(),
      nativeHistoryRevisions: native.historyRevisions(),
      content: {
        ...f.state().content,
        format: 'hwp5',
        richTypingScope: 9,
        paragraphs: [p],
        characterShapes: native.characterShapes(),
        characterUnderlines: native.characterUnderlines(),
        characterStrikes: native.characterStrikes(),
      },
    });
    f.renderer.richTypingScope = () => 9;
    surface = createCanvasSurface({
      root: f.root,
      editor: f.editor,
      onStatus: (m) => f.reports.push(m),
    });
    for (const unit of [3, 0, 3]) {
      f.pointer('pointerdown', 0, unit);
      f.pointer('pointerup', 0, unit);
      await tick();
    }
    const capture = surface.captureCaretFormatting();
    assert(
      capture,
      JSON.stringify({ reports: f.reports, selection: f.state().selection, reference, binding }),
    );
    assert.equal(capture.observation.underline, true);
    assert.equal(capture.observation.strike, true);
    const box = f.input();
    box.setSelectionRange(3, 3);
    const before = new Event('beforeinput', { cancelable: true });
    Object.assign(before, { inputType: 'insertText', data: 'D', isComposing: false });
    box.dispatchEvent(before);
    assert(!before.defaultPrevented);
    box.value = 'ABCD';
    box.setSelectionRange(4, 4);
    const event = new Event('input');
    Object.assign(event, { inputType: 'insertText', data: 'D', isComposing: false });
    box.dispatchEvent(event);
    await tick();
    const message = f.messages.at(-1);
    assert.equal(message.kind, 'splice');
    assert.deepEqual(message.reference, reference);
    assert.equal(message.section, 0);
    assert.equal(message.paragraph, 1);
    assert.equal(message.startUnit, 3);
    assert.equal(message.endUnit, 3);
    assert.equal(message.text, 'D');
    assert(!Object.hasOwn(message, 'insertion') && !Object.hasOwn(message, 'properties'));
    // Same ordinary current-reference mutation invoked by reader-runtime's
    // production splice branch. No patch, replay, or fake source identity.
    native.spliceCurrent(message);
    const saved = native.save({ allowStaleLayout: true }).bytes;
    reopened = await createExperimentalHwp5Editor(bytes, saved);
    const after = reopened.characterRanges(0, 1);
    const c = after.find((r) => r.start <= 2 && r.end > 2).charShapeId;
    const d = after.find((r) => r.start <= 3 && r.end > 3).charShapeId;
    if (oldDefect) assert.notEqual(d, c);
    else assert.equal(d, c);
    console.log(
      JSON.stringify({
        receipt: 'EOF_CURRENT_REFERENCE_ROUTE',
        engineSha256: sha(bytes),
        rendererAndCore: 'controlled',
        native: 'actual existing or explicitly pinned successor WASM',
        reference,
        cell: { row: binding.row, column: binding.column },
        messageKind: message.kind,
        pendingPatch: false,
        savedCShape: c,
        savedDShape: d,
        expectedOldDefect: oldDefect,
      }),
    );
  } finally {
    while (f.waits.length) f.reject();
    await surface?.dispose();
    reopened?.close();
    native.close();
  }
});
