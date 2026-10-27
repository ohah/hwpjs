import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  createEditor,
  createParagraphSelection,
  getSelectionFormatting,
  SET_CHARACTER_FONT_NAME_COMMAND,
} from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime.ts';
const required = (key: string) => {
  const p = process.env[key];
  if (!p || !p.startsWith('/')) throw Error('ExplicitInputRequired:' + key);
  return p;
};
const wasmPath = process.env.HWPJS_TEST_WASM;
const wasm = wasmPath ? readFileSync(required('HWPJS_TEST_WASM')) : null;
const module = wasm ? await WebAssembly.compile(wasm) : null;
const exports = new Set(module ? WebAssembly.Module.exports(module).map((x) => x.name) : []);
const sha = (x: Uint8Array) => createHash('sha256').update(x).digest('hex');
const fixed = () => createReaderRuntimeFactory({ wasmModule: module! });
const cases = [
  {
    format: 'hwp5',
    path: new URL('../../../../apps/docs/docs/public/editor/fixtures/noori.hwp', import.meta.url)
      .pathname,
    paragraph: 15,
    prefix: 'hwp5',
  },
  {
    format: 'hwpx',
    path: new URL('../../../../apps/docs/docs/public/editor/fixtures/noori.hwpx', import.meta.url)
      .pathname,
    paragraph: 15,
    prefix: 'hwpx',
  },
] as const;
for (const c of cases) {
  test(c.format + ' 명시WASM export/capability 경계를 검증한다', { skip: !module }, async () => {
    const e = createEditor({ runtimeFactory: fixed() });
    try {
      await e.load(new Uint8Array(readFileSync(c.path)), { format: c.format });
      const s = e.getEditorState();
      assert.equal(
        s.content.characterFontNameAvailable,
        exports.has(c.prefix + '_edit_set_character_font_name'),
      );
      assert.equal(s.content.characterFontNameAvailable, true);
    } finally {
      await e.dispose();
    }
  });
  test(
    c.format + ' 실제 이름 변경/언어·문단보존/혼합/undo/redo/save/reopen',
    { skip: !module },
    async () => {
      const bytes = new Uint8Array(readFileSync(c.path)),
        e = createEditor({ runtimeFactory: fixed() });
      const at = (start = 0, end = 1) =>
        createParagraphSelection(e.getEditorState(), {
          section: 0,
          paragraph: c.paragraph,
          startUnit: start,
          endUnit: end,
        });
      const row = () =>
        e
          .getEditorState()
          .content.paragraphs.find((x) => x.paragraph === c.paragraph && x.section === 0);
      const observe = () => getSelectionFormatting(e.getEditorState());
      try {
        await e.load(bytes, { format: c.format });
        assert.ok(row().text.length >= 2);
        const beforeText = e.getEditorState().content.paragraphs.map((x) => x.text);
        await e.setSelection(at());
        const before = observe();
        assert.equal(before.fontNameAvailableReasons.latin, null);
        const oldContent = e.getEditorState().content;
        const oldFaces = oldContent.fontFaces,
          oldRefs = oldContent.characterFontReferences;
        const idAt = (content, paragraph, unit) =>
          content.paragraphs
            .find((x) => x.section === 0 && x.paragraph === paragraph)
            .characterRanges.find((x) => x.start <= unit && unit < x.end)?.charShapeId;
        const nonTargetIds = oldContent.paragraphs
          .flatMap((p) =>
            Array.from({ length: p.text.length }, (_, unit) => ({
              paragraph: p.paragraph,
              unit,
              id: idAt(oldContent, p.paragraph, unit),
            })),
          )
          .filter((x) => !(x.paragraph === c.paragraph && x.unit === 0));
        const originalLatin = before.fontNames.latin;
        const old = at();
        const name = 'Hwpjs Typed Latin 😀';
        const result = await e.dispatchCommand(SET_CHARACTER_FONT_NAME_COMMAND, {
          target: old,
          language: 'latin',
          name,
        });
        assert.equal(result.error, undefined);
        assert.equal(result.status, 'committed-with-snapshot');
        await e.setSelection(at());
        const after = observe();
        assert.deepEqual(after.fontNames.latin, { kind: 'single', name });
        const afterContent = e.getEditorState().content;
        for (const face of oldFaces)
          assert.deepEqual(
            afterContent.fontFaces.find((x) => x.language === face.language && x.id === face.id),
            face,
          );
        for (const ref of oldRefs)
          assert.deepEqual(
            afterContent.characterFontReferences.find((x) => x.id === ref.id),
            ref,
          );
        for (const unit of nonTargetIds)
          assert.equal(
            idAt(afterContent, unit.paragraph, unit.unit),
            unit.id,
            'NonTargetCharShapeChanged',
          );
        for (const lang of ['hangul', 'hanja', 'japanese', 'other', 'symbol', 'user'])
          assert.deepEqual(after.fontNames[lang], before.fontNames[lang]);
        assert.deepEqual(
          e.getEditorState().content.paragraphs.map((x) => x.text),
          beforeText,
        );
        await e.setSelection(at(0, 2));
        assert.deepEqual(observe().fontNames.latin, { kind: 'mixed' });
        const stale = await e.dispatchCommand(SET_CHARACTER_FONT_NAME_COMMAND, {
          target: old,
          language: 'latin',
          name: 'Rejected',
        });
        assert.equal(stale.error, 'StaleTarget');
        assert.equal(stale.status, 'rejected-unapplied');
        await e.undo();
        await e.setSelection(at());
        assert.deepEqual(observe().fontNames.latin, originalLatin);
        assert.equal(sha((await e.save({ allowStaleLayout: true })).bytes), sha(bytes));
        await e.redo();
        await e.setSelection(at());
        assert.deepEqual(observe().fontNames.latin, { kind: 'single', name });
        const saved = await e.save({ allowStaleLayout: true });
        await e.load(saved.bytes, { format: c.format });
        await e.setSelection(at());
        assert.deepEqual(observe().fontNames.latin, { kind: 'single', name });
        assert.deepEqual(
          e.getEditorState().content.paragraphs.map((x) => x.text),
          beforeText,
        );
        // Re-select the pre-existing name: Native performs its normal resource/ID reuse.
        const noop = await e.dispatchCommand(SET_CHARACTER_FONT_NAME_COMMAND, {
          target: at(),
          language: 'latin',
          name,
        });
        assert.equal(noop.error, undefined);
        await e.setSelection(at());
        assert.deepEqual(observe().fontNames.latin, { kind: 'single', name });
      } finally {
        await e.dispose();
      }
    },
  );
  test(
    c.format + ' readonly 및 다른 owner는 Native mutation 전에 거부한다',
    { skip: !module },
    async () => {
      const e = createEditor({ runtimeFactory: fixed() });
      try {
        await e.load(new Uint8Array(readFileSync(c.path)), { format: c.format, editable: false });
        const target = createParagraphSelection(e.getEditorState(), {
          section: 0,
          paragraph: c.paragraph,
          startUnit: 0,
          endUnit: 1,
        });
        const r = await e.dispatchCommand(SET_CHARACTER_FONT_NAME_COMMAND, {
          target,
          language: 'hangul',
          name: 'Rejected',
        });
        assert.equal(r.status, 'rejected-unapplied');
        assert.match(r.error!, /ReadOnly/);
      } finally {
        await e.dispose();
      }
    },
  );
}
console.log(
  JSON.stringify({
    scope: '명시WASM/ReaderRuntime same-process',
    wasmSHA: wasm ? sha(wasm) : null,
    nativeWasmProvided: Boolean(module),
    nativeSkipCount: module ? 0 : 6,
    fontExports: [...exports].filter((n) => n.endsWith('_edit_set_character_font_name')),
    nativeCompiled: false,
    workerTransport: false,
  }),
);
