import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
  type HeadlessEditor,
  type ParagraphBullet,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { validateFormattingPatch } from '../../packages/core/src/commands/atomic-formatting.ts';

assert(process.env.HWPJS_TEST_WASM, 'Set HWPJS_TEST_WASM to the candidate WASM');
assert(process.env.HWPJS_TEST_OLD_WASM, 'Set HWPJS_TEST_OLD_WASM to a pre-bullet-writer WASM');
assert(
  process.env.HWPJS_BULLET_EVIDENCE_DIR,
  'Set HWPJS_BULLET_EVIDENCE_DIR to a fresh evidence directory',
);
const module = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM));
const evidence = resolve(process.env.HWPJS_BULLET_EVIDENCE_DIR);
await mkdir(evidence, { recursive: true });
const fixture = (name = 'lists-bullet') =>
  new URL(`../../apps/docs/docs/public/editor/fixtures/${name}.hwpx`, import.meta.url);
const original = new Uint8Array(await readFile(fixture()));
const target = (editor: HeadlessEditor, paragraph = 4) =>
  createParagraphSelection(editor.getEditorState(), {
    section: 0,
    paragraph,
    startUnit: 0,
  });
async function loaded(bytes = original) {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  await editor.load(bytes, { format: 'hwpx', editable: true });
  return editor;
}
const apply = (editor: HeadlessEditor, bullet: ParagraphBullet, paragraph = 4) =>
  editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
    target: target(editor, paragraph),
    patch: { paragraph: { bullet } },
  });
async function bullet(editor: HeadlessEditor, paragraph = 4) {
  return JSON.parse(
    JSON.stringify(
      (await editor.queryFormatting(target(editor, paragraph), { fields: ['paragraph.bullet'] }))
        .observations.aggregate['paragraph.bullet'],
    ),
  );
}
type Variant = { bullet: number | null; alignment?: string };
async function oracle(
  editor: HeadlessEditor,
  name: string,
  expected: Variant,
  variants: Variant[],
  paragraph = 4,
) {
  const saved = (await editor.save()).bytes;
  const before = join(evidence, `${name}-before.hwpx`);
  const after = join(evidence, `${name}-after.hwpx`);
  const plan = join(evidence, `${name}-oracle.json`);
  await writeFile(before, original);
  await writeFile(after, saved);
  await writeFile(
    plan,
    JSON.stringify({
      before,
      after,
      variants,
      sections: { 'Contents/section0.xml': { [paragraph]: expected } },
    }),
  );
  const result = execFileSync(
    'python3',
    [new URL('./paragraph-bullet-oracle.py', import.meta.url).pathname, plan],
    { encoding: 'utf8' },
  );
  await writeFile(join(evidence, `${name}-oracle-result.json`), result);
  return saved;
}

test('applies and removes an existing HWPX bullet through public typed commands, save, undo and redo', async () => {
  const editor = await loaded();
  try {
    assert.deepEqual((await bullet(editor)).value, { kind: 'none' });
    const initialText = (editor.getEditorState().content as any).paragraphs.map((p: any) => p.text);
    assert.equal(
      (await apply(editor, { kind: 'existing', id: 7 })).status,
      'committed-with-snapshot',
    );
    assert.deepEqual((await bullet(editor)).value, { kind: 'existing', id: 7 });
    const applied = await oracle(editor, 'applied', { bullet: 7 }, [{ bullet: 7 }]);
    const reopened = await loaded(applied);
    try {
      assert.deepEqual((await bullet(reopened)).value, { kind: 'existing', id: 7 });
    } finally {
      await reopened.dispose();
    }
    await editor.undo();
    const undone = (await editor.save()).bytes;
    assert.deepEqual(undone, original);
    await writeFile(join(evidence, 'undo-applied.hwpx'), undone);
    await editor.redo();
    const redone = (await editor.save()).bytes;
    assert.deepEqual(redone, applied);
    await writeFile(join(evidence, 'redo-applied.hwpx'), redone);
    assert.equal((await apply(editor, { kind: 'none' })).status, 'committed-with-snapshot');
    assert.deepEqual((await bullet(editor)).value, { kind: 'none' });
    const cleared = await oracle(editor, 'cleared', { bullet: null }, [
      { bullet: 7 },
      { bullet: null },
    ]);
    const reopenedClear = await loaded(cleared);
    try {
      assert.deepEqual((await bullet(reopenedClear)).value, { kind: 'none' });
    } finally {
      await reopenedClear.dispose();
    }
    await editor.undo();
    const undoClear = (await editor.save()).bytes;
    assert.deepEqual(undoClear, applied);
    await writeFile(join(evidence, 'undo-cleared.hwpx'), undoClear);
    await editor.redo();
    const redoClear = (await editor.save()).bytes;
    assert.deepEqual(redoClear, cleared);
    await writeFile(join(evidence, 'redo-cleared.hwpx'), redoClear);
    assert.deepEqual(
      (editor.getEditorState().content as any).paragraphs.map((p: any) => p.text),
      initialText,
    );
  } finally {
    await editor.dispose();
  }
});

test('removes an original bullet without changing its shared declaration or sibling paragraphs', async () => {
  const editor = await loaded();
  try {
    assert.deepEqual((await bullet(editor, 1)).value, { kind: 'existing', id: 1 });
    assert.equal((await apply(editor, { kind: 'none' }, 1)).status, 'committed-with-snapshot');
    await oracle(editor, 'clear-original', { bullet: null }, [{ bullet: null }], 1);
    assert.deepEqual((await bullet(editor, 2)).value, { kind: 'existing', id: 1 });
    await editor.undo();
    assert.deepEqual((await editor.save()).bytes, original);
  } finally {
    await editor.dispose();
  }
});

test('older WASM with atomic formatting withholds the new field and refuses the new writer', async () => {
  const oldModule = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_OLD_WASM!));
  const native = await createHwpxEditor(oldModule);
  try {
    native.open(original);
    native.enableHistoryV2();
    const caps = native.atomicFormattingCapabilities();
    assert.equal(caps.fields['paragraph.bullet'], undefined);
    const query = native.queryFormatting({
      schemaVersion: 1,
      binding: caps.binding,
      selectors: [{ kind: 'original-paragraph', section: 0, paragraph: 5 }],
      fields: [],
    });
    const answer = native.applyFormattingPatch({
      schemaVersion: 1,
      binding: query.binding,
      targets: query.targets,
      patch: { paragraph: { bullet: { kind: 'existing', id: 7 } } },
    });
    assert.equal(answer.nativeCode, 0);
    assert.equal(answer.application, 'unapplied');
    assert.match(answer.error, /UnknownFormattingField/);
    assert.deepEqual(native.save(), original);
  } finally {
    native.close();
  }
});

test('retains bullet and unrelated paragraph properties across combined and subsequent edits', async () => {
  const editor = await loaded();
  try {
    assert.equal(
      (
        await editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: target(editor),
          patch: { paragraph: { bullet: { kind: 'existing', id: 7 }, alignment: 'CENTER' } },
        })
      ).status,
      'committed-with-snapshot',
    );
    const saved = await oracle(editor, 'combined', { bullet: 7, alignment: 'CENTER' }, [
      { bullet: 7 },
      { bullet: 7, alignment: 'CENTER' },
    ]);
    await editor.undo();
    assert.deepEqual((await editor.save()).bytes, original);
    await editor.redo();
    assert.deepEqual((await editor.save()).bytes, saved);
    await apply(editor, { kind: 'none' });
    await oracle(editor, 'clear-after-alignment', { bullet: null, alignment: 'CENTER' }, [
      { bullet: 7 },
      { bullet: 7, alignment: 'CENTER' },
      { bullet: null, alignment: 'CENTER' },
    ]);
  } finally {
    await editor.dispose();
  }
});

test('no-op and invalid declarations retain saved bytes and an existing redo branch', async () => {
  const editor = await loaded();
  try {
    await apply(editor, { kind: 'existing', id: 7 });
    const saved = (await editor.save()).bytes;
    const revision = editor.getEditorState().nativeHistoryRevision;
    assert.equal((await apply(editor, { kind: 'existing', id: 7 })).status, 'known-no-op');
    assert.equal(editor.getEditorState().nativeHistoryRevision, revision);
    assert.deepEqual((await editor.save()).bytes, saved);
    await editor.undo();
    assert.equal((await apply(editor, { kind: 'none' })).status, 'known-no-op');
    const rejected = await apply(editor, { kind: 'existing', id: 999 });
    assert.equal(rejected.status, 'rejected-unapplied');
    assert.deepEqual((await editor.save()).bytes, original);
    await editor.redo();
    assert.deepEqual((await editor.save()).bytes, saved);
  } finally {
    await editor.dispose();
  }
});

test('rejects stale public selections, original control hosts, numbered sources and missing definitions', async () => {
  const editor = await loaded();
  try {
    const stale = target(editor);
    await apply(editor, { kind: 'existing', id: 7 });
    const saved = (await editor.save()).bytes;
    assert.equal(
      (
        await editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: stale,
          patch: { paragraph: { bullet: { kind: 'none' } } },
        })
      ).status,
      'rejected-unapplied',
    );
    assert.equal(
      (await apply(editor, { kind: 'existing', id: 7 }, 0)).status,
      'rejected-unapplied',
    );
    assert.deepEqual((await editor.save()).bytes, saved);
  } finally {
    await editor.dispose();
  }
  const page = await loaded(new Uint8Array(await readFile(fixture('page'))));
  try {
    const before = (await page.save()).bytes;
    assert.equal((await apply(page, { kind: 'existing', id: 7 }, 1)).status, 'rejected-unapplied');
    assert.deepEqual((await page.save()).bytes, before);
  } finally {
    await page.dispose();
  }
  const lists = await loaded(new Uint8Array(await readFile(fixture('lists'))));
  try {
    const rows = (lists.getEditorState().content as any).paragraphs;
    const numbered = rows.find((p: any) =>
      ['outline', 'number'].includes(p.paragraphShape?.heading?.kind),
    );
    assert(numbered);
    const before = (await lists.save()).bytes;
    assert.equal(
      (await apply(lists, { kind: 'none' }, numbered.paragraph)).status,
      'rejected-unapplied',
    );
    assert.deepEqual((await lists.save()).bytes, before);
  } finally {
    await lists.dispose();
  }
});

test('Native rejects old bindings and invalid later targets before mutation', async () => {
  const native = await createHwpxEditor(module);
  try {
    native.open(original);
    native.enableHistoryV2();
    const caps = native.atomicFormattingCapabilities();
    const query = native.queryFormatting({
      schemaVersion: 1,
      binding: caps.binding,
      selectors: [{ kind: 'original-paragraph', section: 0, paragraph: 5 }],
      fields: [],
    });
    const request = {
      schemaVersion: 1,
      binding: query.binding,
      targets: query.targets,
      patch: { paragraph: { bullet: { kind: 'existing', id: 7 } } },
    };
    assert.equal(native.applyFormattingPatch(request).nativeCode, 1);
    const saved = native.save();
    assert.match(native.applyFormattingPatch(request).error, /StaleFormattingBinding/);
    assert.deepEqual(native.save(), saved);
    native.undo();
    const current = native.atomicFormattingCapabilities();
    const q = native.queryFormatting({
      schemaVersion: 1,
      binding: current.binding,
      selectors: [{ kind: 'original-paragraph', section: 0, paragraph: 5 }],
      fields: [],
    });
    assert.equal(
      native.applyFormattingPatch({
        ...request,
        binding: q.binding,
        targets: [...q.targets, { ref: 'p1:0:999999' }],
      }).nativeCode,
      0,
    );
    assert.deepEqual(native.save(), original);
    assert(native.redo());
    assert.deepEqual(native.save(), saved);
  } finally {
    native.close();
  }
});

test('typed intent validation rejects invented declarations, continuation, levels and malformed IDs', () => {
  for (const intent of [
    { kind: 'create' },
    { kind: 'continue' },
    { kind: 'existing', id: -1 },
    { kind: 'existing', id: 1.5 },
    { kind: 'existing', id: 0x100000000 },
    { kind: 'existing', id: 7, level: 1 },
    { kind: 'none', id: 7 },
    null,
  ]) {
    assert.throws(() => validateFormattingPatch({ paragraph: { bullet: intent } }));
  }
});

test('Native withholds nested cells and newly generated paragraphs from the writer', async () => {
  const native = await createHwpxEditor(module);
  try {
    native.open(await readFile(fixture('table')));
    native.enableHistoryV2();
    const before = native.save();
    const query = native.queryFormatting({
      schemaVersion: 1,
      binding: native.atomicFormattingCapabilities().binding,
      selectors: [{ kind: 'original-paragraph', section: 0, paragraph: 2 }],
      fields: ['paragraph.bullet'],
    });
    assert.equal(query.observations.aggregate['paragraph.bullet'].writable, false);
    assert.equal(
      native.applyFormattingPatch({
        schemaVersion: 1,
        binding: query.binding,
        targets: query.targets,
        patch: { paragraph: { bullet: { kind: 'none' } } },
      }).nativeCode,
      0,
    );
    assert.deepEqual(native.save(), before);
    native.open(original);
    native.enableHistoryV2();
    native.splitParagraph({ section: 0, paragraph: 5, atUnit: 1 });
    const split = native.save();
    const generated = native.queryFormatting({
      schemaVersion: 1,
      binding: native.atomicFormattingCapabilities().binding,
      selectors: [{ kind: 'original-paragraph', section: 0, paragraph: 6 }],
      fields: ['paragraph.bullet'],
    });
    assert.equal(generated.observations.aggregate['paragraph.bullet'].writable, false);
    assert.equal(
      native.applyFormattingPatch({
        schemaVersion: 1,
        binding: generated.binding,
        targets: generated.targets,
        patch: { paragraph: { bullet: { kind: 'existing', id: 7 } } },
      }).nativeCode,
      0,
    );
    assert.deepEqual(native.save(), split);
  } finally {
    native.close();
  }
});
