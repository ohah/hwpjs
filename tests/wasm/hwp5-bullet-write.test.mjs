import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
assert(process.env.HWPJS_TEST_WASM);
assert(process.env.HWPJS_TEST_OLD_WASM);
assert(process.env.HWPJS_TEST_EVIDENCE);
await mkdir(process.env.HWPJS_TEST_EVIDENCE, { recursive: true });
const module = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM));
const fixture = (n) =>
  readFile(new URL('../../apps/docs/docs/public/editor/fixtures/' + n, import.meta.url));
const definition = {
  marker: 0x2605,
  alignment: 'RIGHT',
  useInstanceWidth: false,
  autoIndent: true,
  widthAdjust: -50,
  textOffsetType: 'HWPUNIT',
  textOffset: 750,
  charShapeId: 0xffffffff,
};
const opened = async (n = 'page.hwp', m = module) => {
  const e = await createExperimentalHwp5Editor(m, await fixture(n));
  e.enableHistoryV2();
  return e;
};
const saved = (e) => e.save({ allowStaleLayout: true }).bytes;
const artifact = async (e, n) => {
  const bytes = saved(e);
  await writeFile(process.env.HWPJS_TEST_EVIDENCE + '/' + n + '.hwp', bytes);
  return bytes;
};
test('HWP5 entire DocInfo inventory includes all 22 definitions and query does not change history or saved document', async () => {
  const e = await opened('lists-bullet.hwp');
  try {
    const revision = e.historyRevision();
    const before = saved(e);
    const list = e.paragraphBulletDefinitions();
    assert.equal(list.declarations.length, 22);
    assert.deepEqual(
      list.declarations.map((d) => d.id),
      Array.from({ length: 22 }, (_, i) => i + 1),
    );
    assert.equal(list.declarations[6].marker, 0x25b6);
    assert.equal(e.historyRevision(), revision);
    assert.deepEqual(saved(e), before);
    await writeFile(
      process.env.HWPJS_TEST_EVIDENCE + '/original-inventory.json',
      JSON.stringify(list, null, 2),
    );
  } finally {
    e.close();
  }
});
test('HWP5 create/apply/update one history, current-resource query, exact undo/redo and new Native reopen', async () => {
  const e = await opened();
  try {
    const original = saved(e),
      rev = e.historyRevision();
    assert.equal(e.paragraphBulletDefinitions().declarations.length, 0);
    assert(e.writeParagraphBulletDefinition({ mode: 'create', definition, apply: true }, 0, 4));
    assert.equal(e.historyRevision(), rev + 1);
    const created = await artifact(e, 'created');
    assert.deepEqual(e.paragraphBulletDefinitions().declarations[0].definition, definition);
    const updatedDefinition = {
      ...definition,
      marker: 0x25c6,
      alignment: 'CENTER',
      widthAdjust: 30,
      textOffsetType: 'PERCENT',
      textOffset: 65,
    };
    assert(
      e.writeParagraphBulletDefinition({
        mode: 'update',
        id: 1,
        definition: updatedDefinition,
        apply: false,
      }),
    );
    const updated = await artifact(e, 'updated');
    e.undo();
    assert.deepEqual(saved(e), created);
    assert.equal(
      e.writeParagraphBulletDefinition({ mode: 'update', id: 1, definition, apply: true }, 0, 4),
      false,
    );
    e.redo();
    assert.deepEqual(saved(e), updated);
    assert.notDeepEqual(updated, created);
    const again = await createExperimentalHwp5Editor(module, updated);
    try {
      assert.deepEqual(
        again.paragraphBulletDefinitions().declarations[0].definition,
        updatedDefinition,
      );
    } finally {
      again.close();
    }
    e.undo();
    e.undo();
    assert.deepEqual(saved(e), original);
    await artifact(e, 'creation-undo');
    e.redo();
    assert.deepEqual(saved(e), created);
    await artifact(e, 'creation-redo');
  } finally {
    e.close();
  }
});
test('HWP5 generated continuation and preexisting paragraph intent retain their identities through resource writes', async () => {
  const e = await opened();
  try {
    e.setParagraphAlignment({ section: 0, paragraph: 4, alignment: 'CENTER' });
    e.splitParagraph({ section: 0, paragraph: 4, atUnit: 0 });
    const before = await artifact(e, 'generated-before');
    assert(e.writeParagraphBulletDefinition({ mode: 'create', definition, apply: true }, 0, 5));
    const after = await artifact(e, 'generated-after');
    assert.equal(e.paragraphShapeId(0, 4) === e.paragraphShapeId(0, 5), false);
    e.undo();
    assert.deepEqual(saved(e), before);
    e.redo();
    assert.deepEqual(saved(e), after);
    const reopened = await createExperimentalHwp5Editor(module, after);
    try {
      assert.deepEqual(
        reopened.paragraphBulletDefinitions().declarations[0].definition,
        definition,
      );
    } finally {
      reopened.close();
    }
  } finally {
    e.close();
  }
});
test('HWP5 original shared definition update preserves other declarations; incompatible input rejects without losing redo', async () => {
  const e = await opened('lists-bullet.hwp');
  try {
    const before = await artifact(e, 'shared-before');
    const inventory = e.paragraphBulletDefinitions();
    e.writeParagraphBulletDefinition({ mode: 'update', id: 7, definition, apply: false });
    const changed = await artifact(e, 'shared-after');
    assert.notDeepEqual(changed, before);
    const next = e.paragraphBulletDefinitions();
    assert.deepEqual(
      next.declarations.filter((r) => r.id !== 7),
      inventory.declarations.filter((r) => r.id !== 7),
    );
    e.undo();
    assert.deepEqual(saved(e), before);
    for (const edit of [
      { mode: 'update', id: 0, definition, apply: false },
      { mode: 'create', definition: { ...definition, marker: 0x1f600 }, apply: false },
      { mode: 'create', definition: { ...definition, textOffset: 32768 }, apply: false },
      { mode: 'create', definition: { ...definition, charShapeId: 0xfffffffe }, apply: false },
    ]) {
      assert.throws(() => e.writeParagraphBulletDefinition(edit));
      assert.deepEqual(saved(e), before);
    }
    e.redo();
    assert.deepEqual(saved(e), changed);
  } finally {
    e.close();
  }
});
test('HWP5 older optional ABI is unavailable rather than an invented empty inventory', async () => {
  const old = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_OLD_WASM));
  const e = await opened('page.hwp', old);
  try {
    assert.deepEqual(e.paragraphBulletDefinitions(), {
      state: 'unavailable',
      reason: 'ParagraphBulletDefinitionsAbiUnavailable',
    });
    assert.throws(
      () => e.writeParagraphBulletDefinition({ mode: 'create', definition, apply: false }),
      /AbiUnavailable/,
    );
  } finally {
    e.close();
  }
});
