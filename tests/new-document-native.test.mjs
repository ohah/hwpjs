// Real constructor, ReaderCore and Native input; no browser/UI evidence implied.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNewDocumentBytes } from '../js/new-document.mjs';
import { createEditor } from '../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../packages/core/src/runtime/reader-runtime.ts';
import { createParagraphSelection } from '../packages/core/src/state/paragraph-selection.ts';
import { selectionMessage } from '../packages/core/src/commands/selection.ts';
import {
  SPLICE_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../packages/core/src/commands/commands.ts';
import { sourceTextChange } from '../web/preview/text-offsets.mjs';
import {
  module,
  fixture,
  openSDK,
  saveSDK,
  artifact,
  receipt,
  targets,
  owner,
} from '../tools/tests/table-appearance-native-context.mjs';
import { verifyNewDocument, records } from '../tools/tests/table-appearance-save-oracle.mjs';
import { readLegacyCfbStreams } from '../tools/cfb-stream-map.mjs';
const history = { mode: 'legacy-v1', maxEntries: 12, maxCheckpointBytes: 8 * 1024 * 1024 };
const saved = async (e) => Buffer.from((await e.save({ allowStaleLayout: true })).bytes);
// Public HWP5 rows retain nonprinting section/column placeholders. Independent
// CFB text parsing below, rather than this projection, proves their raw content.
const texts = (e) =>
  e.getEditorState().content.paragraphs.map((p) => p.text.replaceAll('\ufffc', ''));
function select(e, paragraph, unit) {
  const s = e.getEditorState(),
    p = s.content.paragraphs[paragraph];
  assert.ok(p && p.editable);
  return createParagraphSelection(s, {
    section: p.section,
    paragraph: p.paragraph,
    startUnit: unit,
    endUnit: unit,
  });
}
async function type(e, paragraph, unit, text) {
  const target = select(e, paragraph, unit);
  assert.equal(target.coordinateSpace, 'display');
  await e.setSelection(target, { stateVersion: e.getEditorState().stateVersion });
  const result = await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text });
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  assert.equal(result.changed, true);
  return result;
}
// The input surface owns caret publication after a committed input. Use the
// actual initial Core selection and canonical product mapping, never row length.
async function inputAtSelection(e, lease, text) {
  const before = e.getEditorState(),
    target = before.selection;
  assert.ok(target, 'product/input surface must provide an actual current selection');
  const position = selectionMessage(target, before);
  const result = await lease.request(
    { kind: 'splice', ...position, text },
    { coordinates: 'legacy-native', token: before.token },
  );
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  assert.equal(result.changed, true);
  const after = e.getEditorState(),
    end = target.startUnit + text.length;
  const caret = createParagraphSelection(after, {
    section: target.section,
    paragraph: target.paragraph,
    startUnit: end,
    endUnit: end,
  });
  await lease.publishSelection(caret);
  assert.deepEqual(
    { ...e.getEditorState().selection },
    caret,
    'accepted input caret published through Core input lease',
  );
  return result;
}
for (const format of ['hwp5', 'hwpx']) {
  test(
    `${format}-fresh-constructor-independent-defaults-and-SDK`,
    receipt(`${format}-new-document-constructor`, async () => {
      const previous = await openSDK(format, fixture(format));
      try {
        previous.setCellBackground({ ...owner(targets[format][0]), color: 0x2468ac });
        const before = saveSDK(format, previous);
        const bytes = Buffer.from(await createNewDocumentBytes(module, format));
        assert.deepEqual(
          Buffer.from(await createNewDocumentBytes(module, format)),
          bytes,
          'deterministic fresh instances, no clock/author',
        );
        const independent = verifyNewDocument({ format, bytes });
        if (format === 'hwpx')
          assert.deepEqual(verifyNewDocument({ format, bytes }, true), independent);
        assert.deepEqual(
          saveSDK(format, previous),
          before,
          'fresh instance must preserve the existing live SDK',
        );
        const sdk = await openSDK(format, bytes);
        try {
          assert.deepEqual(saveSDK(format, sdk), bytes);
        } finally {
          sdk.close();
        }
        await assert.rejects(createNewDocumentBytes(module, 'invalid'), /InvalidDocumentFormat/);
        assert.deepEqual(saveSDK(format, previous), before);
        return {
          independent,
          existingLiveSDKPreserved: true,
          output: artifact(`${format}-new-document.${format === 'hwp5' ? 'hwp' : 'hwpx'}`, bytes),
        };
      } finally {
        previous.close();
      }
    }),
  );
  test(
    `${format}-ReaderCore-create-product-initial-selection-input-Enter-history-save-reopen`,
    receipt(`${format}-new-document-core-input`, async () => {
      const factory = createReaderRuntimeFactory({ wasmModule: module }),
        e = createEditor({ runtimeFactory: factory });
      try {
        const state = await e.createDocument({ format, history });
        assert.equal(state.status, 'ready');
        assert.deepEqual(texts(e), ['']);
        assert.equal(state.nativeHistoryRevisions.length, 1);
        const initial = await saved(e);
        verifyNewDocument({ format, bytes: initial });
        const first = state.selection;
        assert.ok(
          first,
          'createDocument must publish its initial product selection in the ready state',
        );
        assert.equal(first.startUnit, format === 'hwp5' ? 2 : 0);
        assert.equal(first.endUnit, first.startUnit);
        assert.equal(first.coordinateSpace, 'display');
        assert.equal(first.owner, 'section:0:body');
        assert.equal(
          selectionMessage(first, e.getEditorState()).startUnit,
          format === 'hwp5' ? 16 : 0,
        );
        const initialRow = state.content.paragraphs[0];
        let firstKeySaved, splitSaved;
        const lease = e.acquireInputSurface({
          commitComposition() {
            return 'unchanged';
          },
          cancelComposition() {},
        });
        try {
          await inputAtSelection(e, lease, '첫A');
          assert.deepEqual(texts(e), ['첫A']);
          const firstCaret = e.getEditorState().selection;
          assert.equal(firstCaret.startUnit, first.startUnit + '첫A'.length);
          assert.equal(firstCaret.endUnit, firstCaret.startUnit);
          firstKeySaved = await saved(e);
          verifyNewDocument({ format, bytes: firstKeySaved, expectedTexts: ['첫A'] });
          artifact(`${format}-first-key.${format === 'hwp5' ? 'hwp' : 'hwpx'}`, firstKeySaved);
          const current = e.getEditorState(),
            row = current.content.paragraphs[0];
          assert.deepEqual(current.selection, firstCaret);
          const mapped = selectionMessage(current.selection, current);
          const enterMessage = {
            kind: 'split',
            section: mapped.section,
            paragraph: mapped.paragraph,
            atUnit: mapped.startUnit,
            endUnit: mapped.endUnit,
          };
          artifact(
            `${format}-first-key-mapping.json`,
            Buffer.from(
              JSON.stringify(
                {
                  initialDisplay: first,
                  initialText: initialRow.text,
                  initialSourceOffsets: initialRow.sourceOffsets,
                  currentText: row.text,
                  currentSourceOffsets: row.sourceOffsets,
                  firstCaret,
                  enterMessage,
                },
                null,
                2,
              ),
            ),
          );
          const enter = await lease.request(enterMessage, {
            coordinates: 'legacy-native',
            token: current.token,
          });
          if (enter.status === 'rejected-unapplied')
            assert.deepEqual(
              await saved(e),
              firstKeySaved,
              'failed Enter preserves first-key native state',
            );
          assert.equal(enter.status, 'committed-with-snapshot', enter.error);
          assert.equal(enter.changed, true);
          assert.deepEqual(texts(e), ['첫A', '']);
          const right = enter.reply?.splitTarget;
          assert.ok(
            right && Number.isInteger(right.section) && Number.isInteger(right.paragraph),
            'actual Native split identifies its right paragraph',
          );
          await lease.publishSelection(
            createParagraphSelection(e.getEditorState(), {
              section: right.section,
              paragraph: right.paragraph,
              startUnit: 0,
              endUnit: 0,
            }),
          );
          splitSaved = await saved(e);
          verifyNewDocument({ format, bytes: splitSaved, expectedTexts: ['첫A', ''] });
          await inputAtSelection(e, lease, '둘B');
          assert.deepEqual(texts(e), ['첫A', '둘B']);
        } finally {
          lease.release();
        }
        const edited = await saved(e),
          independent = verifyNewDocument({ format, bytes: edited, expectedTexts: ['첫A', '둘B'] });
        assert.equal(
          e.getEditorState().nativeHistoryRevisions.length,
          4,
          'first input + Enter + second input',
        );
        for (const [expected, prior] of [
          [['첫A', ''], splitSaved],
          [['첫A'], firstKeySaved],
          [[''], initial],
        ]) {
          const undo = await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
          assert.equal(undo.changed, true);
          assert.deepEqual(texts(e), expected);
          assert.deepEqual(await saved(e), prior);
        }
        const none = await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
        assert.equal(none.changed, false);
        for (let i = 0; i < 3; i++) {
          const redo = await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token });
          assert.equal(redo.changed, true);
        }
        assert.deepEqual(await saved(e), edited);
        const reopened = createEditor({ runtimeFactory: factory });
        try {
          await reopened.load(edited, { format });
          assert.deepEqual(texts(reopened), ['첫A', '둘B']);
          assert.deepEqual(await saved(reopened), edited);
        } finally {
          await reopened.dispose();
        }
        return {
          independent,
          initialDisplaySelection: first,
          initialSourceOffsets: initialRow.sourceOffsets,
          initialNativeDisplayText: initialRow.text,
          oneEventPerInput: true,
          output: artifact(
            `${format}-new-document-edited.${format === 'hwp5' ? 'hwp' : 'hwpx'}`,
            edited,
          ),
        };
      } finally {
        await e.dispose();
      }
    }),
  );
  test(
    `${format}-ReaderCore-constructor-producer-failure-preserves-actual-live-Native`,
    receipt(`${format}-new-document-failure`, async () => {
      const actual = createReaderRuntimeFactory({ wasmModule: module });
      let fail = false;
      const factory = Object.assign(() => actual(), {
        createDocumentBytes: async (f) => {
          if (fail) throw Error('InjectedConstructorProducerFailure');
          return actual.createDocumentBytes(f);
        },
      });
      const e = createEditor({ runtimeFactory: factory });
      try {
        const created = await e.createDocument({ format, history });
        assert.ok(created.selection);
        assert.equal(created.selection.startUnit, format === 'hwp5' ? 2 : 0);
        const inserted = await e.dispatchCommand(SPLICE_TEXT_COMMAND, {
          target: created.selection,
          text: '보존',
        });
        assert.equal(inserted.status, 'committed-with-snapshot', inserted.error);
        const selection = select(e, 0, created.selection.startUnit + '보존'.length);
        await e.setSelection(selection, { stateVersion: e.getEditorState().stateVersion });
        const bytes = await saved(e),
          before = e.getEditorState();
        fail = true;
        await assert.rejects(e.createDocument({ format }), /InjectedConstructorProducerFailure/);
        const after = e.getEditorState();
        for (const key of [
          'documentId',
          'generation',
          'content',
          'selection',
          'nativeHistoryRevision',
          'nativeHistoryRevisions',
          'operationRevision',
          'savedOperationRevision',
        ])
          assert.deepEqual(after[key], before[key], key);
        assert.equal(after.status, 'ready');
        assert.deepEqual(await saved(e), bytes);
        const undo = await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
        assert.equal(undo.changed, true);
        assert.deepEqual(texts(e), ['']);
        return {
          liveActualRuntimePreserved: true,
          failure: 'injected producer rejection; not Native allocator OOM',
        };
      } finally {
        await e.dispose();
      }
    }),
  );
}

// Diagnostic comparison only: choosing DISPLAY2 here is not a product change.
test(
  'hwp5-diagnostic-display-zero-versus-two-prefix-order-and-Enter',
  receipt('hwp5-caret-prefix-diagnostic', async () => {
    const observations = [];
    const binary = (bytes) => {
      const streams = readLegacyCfbStreams(bytes);
      assert.equal(streams.get('FileHeader').readUInt32LE(36), 0);
      const record = records(streams.get('BodyText/Section0')).find((r) => r.tag === 67);
      const raw = record.payload;
      const controls = [];
      for (let at = 0; at < raw.length;) {
        if (raw.readUInt16LE(at) === 2) {
          assert.equal(raw.readUInt16LE(at + 14), 2);
          controls.push({
            unit: at / 2,
            idRawAscii: raw.subarray(at + 2, at + 6).toString('ascii'),
          });
          at += 16;
        } else at += 2;
      }
      return {
        controls,
        hex: raw.toString('hex'),
        codeUnits: Array.from({ length: raw.length / 2 }, (_, i) => raw.readUInt16LE(i * 2)),
      };
    };
    for (const initialDisplay of [0, 2]) {
      const e = createEditor({
        runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
      });
      try {
        await e.createDocument({ format: 'hwp5', history });
        const initial = e.getEditorState().content.paragraphs[0];
        const before = binary(await saved(e));
        const inputMap = sourceTextChange(
          { startUnit: initialDisplay, endUnit: initialDisplay, text: '첫A' },
          initial.sourceOffsets,
        );
        assert.equal(inputMap.startUnit, initialDisplay === 0 ? 0 : 16);
        await type(e, 0, initialDisplay, '첫A');
        const firstKey = await saved(e),
          after = binary(firstKey);
        verifyNewDocument({ format: 'hwp5', bytes: firstKey, expectedTexts: ['첫A'] });
        assert.deepEqual(
          before.controls.map((c) => c.unit),
          [0, 8],
        );
        assert.deepEqual(
          after.controls.map((c) => c.unit),
          initialDisplay === 0 ? [2, 10] : [0, 8],
        );
        const state = e.getEditorState(),
          row = state.content.paragraphs[0],
          end = row.text.length;
        const mapped = sourceTextChange(
          { startUnit: end, endUnit: end, text: '' },
          row.sourceOffsets,
        );
        const enterMessage = {
          kind: 'split',
          section: row.section,
          paragraph: row.paragraph,
          atUnit: mapped.startUnit,
          endUnit: mapped.endUnit,
        };
        const lease = e.acquireInputSurface({
          commitComposition() {
            return 'unchanged';
          },
          cancelComposition() {},
        });
        let enter;
        try {
          enter = await lease.request(enterMessage, {
            coordinates: 'legacy-native',
            token: state.token,
          });
        } finally {
          lease.release();
        }
        if (initialDisplay === 0) {
          assert.equal(enter.status, 'rejected-unapplied');
          assert.equal(enter.error, 'UnsupportedStructuralControl');
          assert.deepEqual(await saved(e), firstKey);
        } else {
          assert.equal(enter.status, 'committed-with-snapshot', enter.error);
          assert.deepEqual(texts(e), ['첫A', '']);
          verifyNewDocument({ format: 'hwp5', bytes: await saved(e), expectedTexts: ['첫A', ''] });
        }
        const observation = {
          label: 'diagnostic only; not product initialization',
          initialDisplay,
          initialSourceOffsets: initial.sourceOffsets,
          inputMap,
          before,
          after,
          enterMessage,
          enter: { status: enter.status, changed: enter.changed, error: enter.error },
        };
        observations.push(observation);
        artifact(`hwp5-display-${initialDisplay}-first-key.hwp`, firstKey);
        artifact(
          `hwp5-display-${initialDisplay}-prefix-order.json`,
          Buffer.from(JSON.stringify(observation, null, 2)),
        );
      } finally {
        await e.dispose();
      }
    }
    return observations;
  }),
);
