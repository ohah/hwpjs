import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const {
  createEditor,
  createParagraphSelection,
  EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
  APPLY_FORMATTING_PATCH_COMMAND,
  SPLICE_TEXT_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} = await import(
  process.env.HWPJS_TEST_PUBLIC_BUNDLE ? '../../dist/index.js' : '../../src/index.ts'
);
const { createReaderRuntimeFactory } = await import(
  process.env.HWPJS_TEST_PUBLIC_BUNDLE ? '../../dist/runtime.js' : '../../src/runtime.ts'
);
assert(process.env.HWPJS_TEST_WASM);
assert(process.env.HWPJS_TEST_EVIDENCE);
await mkdir(process.env.HWPJS_TEST_EVIDENCE, { recursive: true });
const module = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM!));
const d = {
  marker: 0x2605,
  alignment: 'RIGHT',
  useInstanceWidth: false,
  autoIndent: true,
  widthAdjust: -50,
  textOffsetType: 'HWPUNIT',
  textOffset: 750,
  charShapeId: 0xffffffff,
} as const;
const opened = async (name = 'page.hwp') => {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  await e.load(
    new Uint8Array(
      await readFile(
        new URL('../../../../apps/docs/docs/public/editor/fixtures/' + name, import.meta.url),
      ),
    ),
    { format: 'hwp5', editable: true },
  );
  return e;
};
const target = (e: any, p = 4) =>
  createParagraphSelection(e.getEditorState(), { section: 0, paragraph: p, startUnit: 0 });
const command = async (e: any, edit: any, p = 4) =>
  e.dispatchCommand(EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, {
    target: target(e, p),
    selectionVersion: e.getEditorState().stateVersion,
    edit,
  });
async function bullet(e: any, value: any) {
  const t = target(e);
  return e.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
    target: t,
    selectionVersion: e.getEditorState().stateVersion,
    patch: { paragraph: { bullet: value } },
  });
}
const save = async (e: any, name: string) => {
  const bytes = (await e.save({ allowStaleLayout: true })).bytes;
  await writeFile(process.env.HWPJS_TEST_EVIDENCE + '/' + name + '.hwp', bytes);
  return bytes;
};
async function oracle(
  name: string,
  before: Uint8Array,
  after: Uint8Array,
  expected: Record<string, unknown>,
) {
  const directory = process.env.HWPJS_TEST_EVIDENCE!;
  const beforePath = directory + '/' + name + '-before.hwp',
    afterPath = directory + '/' + name + '-after.hwp',
    planPath = directory + '/' + name + '-oracle.json';
  await writeFile(beforePath, before);
  await writeFile(afterPath, after);
  const plan = { before: beforePath, after: afterPath, ...expected };
  await writeFile(planPath, JSON.stringify(plan));
  const invalid = {
    ...plan,
    ...(expected.definition
      ? { definition: { ...(expected.definition as object), marker: 0x2620 } }
      : { shapeAdd: Number(expected.shapeAdd) + 1 }),
  };
  const invalidPath = directory + '/' + name + '-wrong.json';
  await writeFile(invalidPath, JSON.stringify(invalid));
  const corrupted = new Uint8Array(after),
    view = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength);
  const metadataOffset = (view.getUint32(48, true) + 1) * 2 ** view.getUint16(30, true) + 80;
  corrupted[metadataOffset] ^= 1;
  const metadataPath = directory + '/' + name + '-metadata.hwp',
    metadataPlan = directory + '/' + name + '-metadata.json';
  await writeFile(metadataPath, corrupted);
  await writeFile(metadataPlan, JSON.stringify({ ...plan, after: metadataPath }));
  const script = new URL(
    '../../../../tests/hwp5/paragraph-bullet-definition-oracle.py',
    import.meta.url,
  ).pathname;
  for (const flags of [[], ['-O']]) {
    const ok = spawnSync('python3', [...flags, script, planPath], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(JSON.parse(ok.stdout).verified, true);
    for (const wrong of [invalidPath, metadataPlan]) {
      const bad = spawnSync('python3', [...flags, script, wrong], { encoding: 'utf8' });
      assert.equal(bad.status, 1, bad.stderr);
    }
  }
}
test('same public command/API supports HWP5 resource creation and existing declaration apply/remove with atomic history', async () => {
  const e = await opened();
  try {
    const original = await save(e, 'core-before');
    const state = e.getEditorState();
    const list = await e.listParagraphBulletDefinitions();
    assert.equal(list.state, 'available');
    assert.equal(e.getEditorState(), state);
    assert.equal(
      (await command(e, { mode: 'create', definition: d, apply: false })).status,
      'committed-with-snapshot',
    );
    assert.equal(e.getEditorState().nativeHistoryRevision, 1);
    const unused = await save(e, 'core-unused-definition');
    await oracle('create-unused', original, unused, {
      mode: 'resource-add',
      bulletAdd: 1,
      shapeAdd: 0,
      id: 1,
      definition: d,
    });
    const t = target(e);
    const q = await e.queryFormatting(t, { fields: ['paragraph.bullet'] });
    assert.equal(q.observations.aggregate['paragraph.bullet'].state, 'known');
    assert.equal((await bullet(e, { kind: 'existing', id: 1 })).status, 'committed-with-snapshot');
    const applied = await save(e, 'core-applied');
    await oracle('apply-existing', unused, applied, {
      mode: 'resource-add',
      bulletAdd: 0,
      shapeAdd: 1,
      paragraph: 4,
      id: 1,
    });
    assert.equal(e.getEditorState().nativeHistoryRevision, 2);
    const noop = await bullet(e, { kind: 'existing', id: 1 });
    assert.equal(noop.status, 'known-no-op');
    assert.equal(e.getEditorState().nativeHistoryRevision, 2);
    assert.equal((await bullet(e, { kind: 'none' })).status, 'committed-with-snapshot');
    const removed = await save(e, 'core-removed');
    await oracle('remove-existing', applied, removed, {
      mode: 'resource-add',
      bulletAdd: 0,
      shapeAdd: 1,
      paragraph: 4,
      id: null,
    });
    await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, applied);
    await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, removed);
    for (let i = 0; i < 3; i++)
      await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, original);
  } finally {
    await e.dispose();
  }
});
test('same public HWP5 definition update changes current source and rejects stale selection without touching saved document', async () => {
  const e = await opened('lists-bullet.hwp');
  try {
    const original = (await e.save({ allowStaleLayout: true })).bytes;
    const before = e.getEditorState();
    const staleTarget = target(e);
    const result = await command(e, { mode: 'update', id: 7, definition: d, apply: false });
    assert.equal(result.status, 'committed-with-snapshot');
    const inventory = await e.listParagraphBulletDefinitions();
    if (inventory.state !== 'available') throw Error('Expected inventory');
    assert.equal(inventory.declarations[6].definition?.marker, 0x2605);
    assert(Object.isFrozen(inventory.declarations[6].definition));
    const saved = (await e.save({ allowStaleLayout: true })).bytes;
    await oracle('shared-update', original, saved, {
      mode: 'definition-update',
      id: 7,
      definition: d,
    });
    const stale = await e.dispatchCommand(EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, {
      target: staleTarget,
      selectionVersion: before.stateVersion,
      edit: { mode: 'create', definition: d, apply: true },
    });
    assert.equal(stale.status, 'rejected-unapplied');
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, saved);
  } finally {
    await e.dispose();
  }
});
test('HWP5 original declaration application/removal and original bullet clearing use existing public formatting command', async () => {
  const e = await opened('lists-bullet.hwp');
  try {
    const before = await save(e, 'core-source-before');
    assert.equal((await bullet(e, { kind: 'existing', id: 7 })).status, 'committed-with-snapshot');
    await save(e, 'core-source-applied');
    assert.equal((await bullet(e, { kind: 'none' })).status, 'committed-with-snapshot');
    await save(e, 'core-source-removed');
    await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
    await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, before);
    const originalTarget = target(e, 25);
    assert.equal(
      (
        await e.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: originalTarget,
          selectionVersion: e.getEditorState().stateVersion,
          patch: { paragraph: { bullet: { kind: 'none' } } },
        })
      ).status,
      'committed-with-snapshot',
    );
    await save(e, 'core-original-cleared');
  } finally {
    await e.dispose();
  }
});

test('typing after HWP5 bullet creation preserves inherited formatting and independent undo edges', async () => {
  const e = await opened();
  try {
    const original = await save(e, 'text-original');
    assert.equal(
      (await command(e, { mode: 'create', definition: d, apply: true })).status,
      'committed-with-snapshot',
    );
    const created = await save(e, 'text-bullet-before');
    assert.equal(
      (await e.dispatchCommand(SPLICE_TEXT_COMMAND, { target: target(e), text: 'x' })).status,
      'committed-with-snapshot',
    );
    const typed = await save(e, 'text-bullet-after');
    const script = new URL(
      '../../../../tests/hwp5/paragraph-single-insert-oracle.py',
      import.meta.url,
    ).pathname;
    const directory = process.env.HWPJS_TEST_EVIDENCE!;
    for (const flags of [[], ['-O']]) {
      const args = [
        ...flags,
        script,
        directory + '/text-bullet-before.hwp',
        directory + '/text-bullet-after.hwp',
        '4',
        '0',
      ];
      const result = spawnSync('python3', [...args, 'x'], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(JSON.parse(result.stdout).verified, true);
      const wrong = spawnSync('python3', [...args, 'y'], { encoding: 'utf8' });
      assert.equal(wrong.status, 1, wrong.stderr);
    }
    await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, created);
    await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, original);
    await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token });
    await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, typed);
  } finally {
    await e.dispose();
  }
});
