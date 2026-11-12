import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  createReaderRuntimeFactory,
  wasmModule,
  NativeSHA256,
  inputBytes,
  caseDirectory,
  verifyInputs,
} from './shape-copy-native-fixture.mjs';
import { createShapeCopyPort } from '../src/shape-copy-port.ts';
import { SHAPE_COPY_FIELDS } from '../src/shape-copy-fields.ts';
const outputs = await caseDirectory('native');
const char = [
  'character.size',
  'character.bold',
  'character.italic',
  'character.textColor',
  'character.fonts.hangul.name',
];
const para = ['paragraph.alignment', 'paragraph.margins.before', 'paragraph.spacing'];
const saved = async (e) => Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
async function fixture(format, editable = true) {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
  const original = await inputBytes(format);
  await e.load(original, { format, editable });
  const rows = e
    .getEditorState()
    .content.paragraphs.filter(
      (p) => !p.tableCell && !p.drawingText && !p.drawingCaption && p.text.length >= 4,
    );
  const select = async (row, startUnit, endUnit) =>
    await e.setSelection(
      createParagraphSelection(e.getEditorState(), {
        section: row.section,
        paragraph: row.paragraph,
        startUnit,
        endUnit,
      }),
    );
  return { e, rows, select, original };
}
for (const format of ['hwp5', 'hwpx'])
  for (const mode of ['character', 'paragraph', 'both']) {
    test(
      'normal SDK Native/' +
        format +
        '/' +
        mode +
        ': actual source caret -> selected fields -> target atomic history/save/undo',
      async () => {
        const { e, rows, select } = await fixture(format);
        const port = createShapeCopyPort(e);
        try {
          await select(rows[0], 0, 1);
          assert.equal(
            (
              await e.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
                target: e.getEditorState().selection,
                selectionVersion: e.getEditorState().stateVersion,
                patch: {
                  character: { size: 1800, bold: true, italic: true, textColor: 0x113355 },
                  paragraph: {
                    alignment: 'LEFT',
                    margins: { before: 200 },
                    spacing: { kind: 'percent', value: 175 },
                  },
                },
              })
            ).status,
            'committed-with-snapshot',
          );
          const before = await saved(e),
            history = e.getEditorState().nativeHistoryRevision;
          await select(rows[0], 1, 1);
          const sourceState = e.getEditorState();
          const capture = await port.readSource(() => true);
          assert.equal(
            e.getEditorState(),
            sourceState,
            'read/capture must not replace caret/state',
          );
          const ids =
            mode === 'character' ? char : mode === 'paragraph' ? para : [...char, ...para];
          for (const id of ids)
            assert.equal(capture.options.find((d) => d.id === id)?.enabled, true, id);
          port.remember(capture, ids, () => true);
          assert.deepEqual(await saved(e), before, 'copy must not mutate source');
          assert.equal(e.getEditorState().nativeHistoryRevision, history);
          await select(rows[1], 0, 2);
          const untouchedFields = [
            'character.size',
            'character.bold',
            'character.italic',
            'character.textColor',
            'character.underline.kind',
            'character.strike.enabled',
            'paragraph.alignment',
            'paragraph.margins.before',
            'paragraph.margins.right',
            'paragraph.spacing.kind',
            'paragraph.spacing.value',
          ].filter(
            (key) =>
              !ids.flatMap((id) => SHAPE_COPY_FIELDS.find((d) => d.id === id).fields).includes(key),
          );
          const untouched = await e.queryFormatting(e.getEditorState().selection, {
            fields: untouchedFields,
          });
          const reply = await port.apply(() => true);
          assert.equal(reply.status, 'committed-with-snapshot', JSON.stringify(reply));
          assert.equal(e.getEditorState().nativeHistoryRevision, history + 1, 'one Native commit');
          const fields = ids.flatMap((id) => SHAPE_COPY_FIELDS.find((d) => d.id === id).fields);
          const actual = await e.queryFormatting(e.getEditorState().selection, { fields });
          for (const id of ids) {
            const o = capture.options.find((d) => d.id === id);
            o.fields.forEach((key, i) => {
              assert.equal(actual.observations.aggregate[key].state, 'known', key);
              assert.deepEqual(actual.observations.aggregate[key].value, o.values[i], key);
            });
          }
          const unselectedAfter = await e.queryFormatting(e.getEditorState().selection, {
            fields: untouchedFields,
          });
          for (const key of untouchedFields) {
            assert.equal(
              unselectedAfter.observations.aggregate[key].state,
              untouched.observations.aggregate[key].state,
              key,
            );
            assert.deepEqual(
              structuredClone(unselectedAfter.observations.aggregate[key].value),
              structuredClone(untouched.observations.aggregate[key].value),
              key,
            );
          }
          const after = await saved(e);
          assert.notDeepEqual(after, before);
          assert.equal(
            (await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token })).status,
            'committed-with-snapshot',
          );
          assert.deepEqual(await saved(e), before);
          assert.equal(
            (await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token })).status,
            'committed-with-snapshot',
          );
          assert.deepEqual(await saved(e), after);
          await e.load(after, { format, editable: true });
          assert.deepEqual(await saved(e), after);
          await writeFile(
            new URL(
              format + '-' + mode + '-before.' + (format === 'hwp5' ? 'hwp' : 'hwpx'),
              outputs,
            ),
            before,
          );
          await writeFile(
            new URL(
              format + '-' + mode + '-after.' + (format === 'hwp5' ? 'hwp' : 'hwpx'),
              outputs,
            ),
            after,
          );
          await writeFile(
            new URL(format + '-' + mode + '.json', outputs),
            JSON.stringify(
              {
                format,
                mode,
                NativeSHA256,
                beforeSHA256: createHash('sha256').update(before).digest('hex'),
                afterSHA256: createHash('sha256').update(after).digest('hex'),
                oneHistory: true,
                undoRedoExact: true,
                reopenExact: true,
                sourceCaretReadUnchanged: true,
                fields,
              },
              null,
              2,
            ) + '\n',
          );
        } finally {
          port.dispose();
          await e.dispose();
        }
      },
    );
  }
for (const format of ['hwp5', 'hwpx']) {
  test(
    'normal SDK Native/' +
      format +
      ': readonly source, stale capture, document replacement and inactive IME guard refuse without edit',
    async () => {
      const { e, rows, select, original } = await fixture(format);
      const port = createShapeCopyPort(e);
      try {
        await select(rows[0], 1, 1);
        const c = await port.readSource(() => true);
        await select(rows[1], 0, 2);
        assert.throws(() => port.remember(c, ['character.bold'], () => true), /Stale/);
        await select(rows[0], 1, 1);
        port.remember(await port.readSource(() => true), ['character.bold'], () => true);
        await select(rows[1], 0, 2);
        const before = await saved(e),
          rev = e.getEditorState().nativeHistoryRevision;
        await assert.rejects(
          port.apply(() => false),
          /Inactive/,
        );
        assert.deepEqual(await saved(e), before);
        assert.equal(e.getEditorState().nativeHistoryRevision, rev);
        await e.load(original, { format, editable: true });
        await select(rows[1], 0, 2);
        await assert.rejects(
          port.apply(() => true),
          /SourceUnavailable/,
        );
        await e.load(original, { format, editable: false });
        await select(rows[0], 1, 1);
        assert.equal(port.presentation().enabled, false);
        await assert.rejects(port.readSource(() => true));
      } finally {
        port.dispose();
        await e.dispose();
      }
    },
  );
}

test('normal SDK Native actual cap response held across source stale and target A-B-A never authorizes a write', async () => {
  const { e, rows, select } = await fixture('hwp5');
  let hold = false,
    entered,
    release;
  let started, gate;
  const reset = () => {
    started = new Promise((r) => (entered = r));
    gate = new Promise((r) => (release = r));
  };
  reset();
  const editor = {
    getEditorState: () => e.getEditorState(),
    dispatchCommand: e.dispatchCommand.bind(e),
    queryFormatting: e.queryFormatting.bind(e),
    getFormattingCapabilities: async (o) => {
      const real = await e.getFormattingCapabilities(o);
      if (hold) {
        entered();
        await gate;
      }
      return real;
    },
  };
  const port = createShapeCopyPort(editor);
  try {
    await select(rows[0], 1, 1);
    hold = true;
    const source = port.readSource(() => true);
    await started;
    await select(rows[1], 0, 2);
    release();
    await assert.rejects(source, /StaleShapeCopy/);
    hold = false;
    await select(rows[0], 1, 1);
    const c = await port.readSource(() => true);
    assert.equal(c.options.find((d) => d.id === 'character.background').enabled, false);
    assert.throws(() => port.remember(c, ['character.background'], () => true), /FieldUnavailable/);
    port.remember(c, ['character.bold'], () => true);
    await select(rows[1], 0, 2);
    const before = await saved(e),
      rev = e.getEditorState().nativeHistoryRevision;
    reset();
    hold = true;
    const applying = port.apply(() => true);
    await started;
    await select(rows[1], 1, 3);
    await select(rows[1], 0, 2);
    release();
    await assert.rejects(applying, /StaleShapeCopy/);
    assert.equal(e.getEditorState().nativeHistoryRevision, rev);
    assert.deepEqual(await saved(e), before);
  } finally {
    release();
    port.dispose();
    await e.dispose();
  }
});

await verifyInputs();

for (const format of ['hwp5', 'hwpx'])
  test('normal SDK Native all-known selectable field mapping/' + format, async () => {
    const { e, rows, select } = await fixture(format);
    const port = createShapeCopyPort(e);
    try {
      await select(rows[0], 1, 1);
      const capture = await port.readSource(() => true);
      const ids = capture.options.filter((d) => d.enabled).map((d) => d.id);
      assert(ids.length > 20);
      if (format === 'hwp5') {
        assert.equal(
          capture.options.find((d) => d.id === 'character.underline.style').enabled,
          false,
        );
        assert.equal(capture.options.find((d) => d.id === 'character.strike.style').enabled, false);
      }
      port.remember(capture, ids, () => true);
      await select(rows[1], 0, 2);
      const before = await saved(e),
        rev = e.getEditorState().nativeHistoryRevision;
      const reply = await port.apply(() => true);
      assert.equal(reply.status, 'committed-with-snapshot', JSON.stringify(reply));
      assert.equal(e.getEditorState().nativeHistoryRevision, rev + 1);
      const fields = capture.options.filter((d) => d.enabled).flatMap((d) => d.fields);
      const q = await e.queryFormatting(e.getEditorState().selection, { fields });
      for (const d of capture.options.filter((d) => d.enabled))
        d.fields.forEach((key, i) =>
          assert.deepEqual(structuredClone(q.observations.aggregate[key].value), d.values[i], key),
        );
      const after = await saved(e);
      assert.equal(
        (await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token })).status,
        'committed-with-snapshot',
      );
      assert.deepEqual(await saved(e), before);
      assert.equal(
        (await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token })).status,
        'committed-with-snapshot',
      );
      assert.deepEqual(await saved(e), after);
      await writeFile(
        new URL(format + '-all-known.json', outputs),
        JSON.stringify(
          { format, NativeSHA256, ids, oneHistory: true, undoRedoExact: true },
          null,
          2,
        ) + '\n',
      );
    } finally {
      port.dispose();
      await e.dispose();
    }
  });

test('shape-copy field descriptors are immutable query/patch metadata, not a mutable permission model', () => {
  assert.equal(Object.isFrozen(SHAPE_COPY_FIELDS), true);
  for (const d of SHAPE_COPY_FIELDS) {
    assert.equal(Object.isFrozen(d), true);
    assert.equal(Object.isFrozen(d.fields), true, d.id);
  }
});
