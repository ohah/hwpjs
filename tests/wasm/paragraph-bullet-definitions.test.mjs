import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { checkedParagraphBulletDefinitions } from '../../js/paragraph-bullet-definitions.mjs';
assert(process.env.HWPJS_TEST_WASM, 'HWPJS_TEST_WASM required');
assert(process.env.HWPJS_TEST_OLD_WASM, 'HWPJS_TEST_OLD_WASM required');
assert(process.env.HWPJS_TEST_UNUSED_BULLETS, 'HWPJS_TEST_UNUSED_BULLETS required');
const wasm = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM));
const input = new Uint8Array(await readFile(process.env.HWPJS_TEST_UNUSED_BULLETS));
const fixture = (name) =>
  readFile(new URL('../../apps/docs/docs/public/editor/fixtures/' + name, import.meta.url));

test('returns all current header declarations with unused and unsupported IDs and no paragraph references', async () => {
  const editor = await createHwpxEditor(wasm);
  try {
    editor.open(input);
    editor.enableHistoryV2();
    const revision = editor.historyRevision(),
      before = editor.save();
    const inventory = editor.paragraphBulletDefinitions();
    assert.equal(inventory.coverage, 'complete');
    assert.equal(inventory.declarations.length, 24);
    assert.equal(inventory.declarations.find((d) => d.id === 99).marker, 0x2605);
    assert.equal(inventory.declarations.find((d) => d.id === 99).canApply, true);
    assert.equal(inventory.declarations.find((d) => d.id === 100).canApply, false);
    assert.equal(
      inventory.declarations.find((d) => d.id === 100).reason,
      'UnsupportedBulletDeclaration',
    );
    assert.equal(editor.historyRevision(), revision);
    assert.deepEqual(editor.save(), before);
    editor.setParagraphAlignment({ section: 0, paragraph: 5, alignment: 'CENTER' });
    const edited = editor.save();
    assert.deepEqual(editor.paragraphBulletDefinitions(), inventory);
    editor.undo();
    assert.deepEqual(editor.save(), before);
    assert.deepEqual(editor.paragraphBulletDefinitions(), inventory);
    editor.redo();
    assert.deepEqual(editor.save(), edited);
    assert.deepEqual(editor.paragraphBulletDefinitions(), inventory);
  } finally {
    editor.close();
  }
});

test('distinguishes an actual empty header from unavailable older ABI', async () => {
  const editor = await createHwpxEditor(wasm);
  try {
    editor.open(await fixture('page.hwpx'));
    assert.deepEqual(editor.paragraphBulletDefinitions(), {
      schemaVersion: 1,
      state: 'available',
      scope: 'current-header',
      coverage: 'complete',
      declarations: [],
    });
  } finally {
    editor.close();
  }
  const old = await createHwpxEditor(
    await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_OLD_WASM)),
  );
  try {
    old.open(input);
    assert.deepEqual(old.paragraphBulletDefinitions(), {
      state: 'unavailable',
      reason: 'ParagraphBulletDefinitionsAbiUnavailable',
    });
    assert.deepEqual(old.save(), input);
  } finally {
    old.close();
  }
});

test('rejects partial, malformed, duplicate-applicable and inconsistent Native DTOs', () => {
  const good = {
    schemaVersion: 1,
    state: 'available',
    scope: 'current-header',
    coverage: 'complete',
    declarations: [{ ordinal: 0, id: 7, marker: 0x25b6, canApply: true, reason: null }],
  };
  assert.equal(checkedParagraphBulletDefinitions(good), good);
  for (const bad of [
    { ...good, coverage: 'partial' },
    { ...good, scope: 'paragraphs' },
    { ...good, declarations: [{ ...good.declarations[0], id: null }] },
    { ...good, declarations: [{ ...good.declarations[0], marker: 0xd800 }] },
    { ...good, declarations: [good.declarations[0], { ...good.declarations[0], ordinal: 1 }] },
    { ...good, declarations: [{ ...good.declarations[0], canApply: false }] },
  ])
    assert.throws(() => checkedParagraphBulletDefinitions(bad), /Malformed/);
});
