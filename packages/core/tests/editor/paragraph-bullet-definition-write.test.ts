import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createEditor,
  createParagraphSelection,
  EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime.ts';
assert(process.env.HWPJS_TEST_WASM, 'ExplicitNativeInputRequired');
const module = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM!));
const input = new Uint8Array(
  await readFile(
    new URL('../../../../apps/docs/docs/public/editor/fixtures/page.hwpx', import.meta.url),
  ),
);
const definition = {
  marker: 0x2605,
  alignment: 'RIGHT',
  useInstanceWidth: false,
  autoIndent: true,
  widthAdjust: -50,
  textOffsetType: 'HWPUNIT',
  textOffset: 750,
  charShapeId: 0xffffffff,
} as const;
const make = async () => {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  await e.load(input, { format: 'hwpx', editable: true });
  return e;
};
test('public typed definition command creates with one history entry; inventory and saved resource survive history', async () => {
  const e = await make();
  try {
    const before = e.getEditorState();
    const target = createParagraphSelection(before, { section: 0, paragraph: 1, startUnit: 0 });
    const edit = { mode: 'create', definition, apply: true } as const;
    const result = await e.dispatchCommand(EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, {
      target,
      selectionVersion: before.stateVersion,
      edit,
    });
    assert.equal(result.status, 'committed-with-snapshot');
    const current = e.getEditorState();
    assert.equal(current.nativeHistoryRevision, before.nativeHistoryRevision! + 1);
    const list = await e.listParagraphBulletDefinitions();
    assert.equal(list.state, 'available');
    if (list.state !== 'available') throw Error('inventory');
    assert.deepEqual(JSON.parse(JSON.stringify(list.declarations[0].definition)), definition);
    assert(Object.isFrozen(list.declarations[0].definition));
    const saved = (await e.save()).bytes;
    const stale = await e.dispatchCommand(EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, {
      target,
      selectionVersion: before.stateVersion,
      edit,
    });
    assert.equal(stale.status, 'rejected-unapplied');
    await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save()).bytes, input);
    await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token });
    assert.deepEqual((await e.save()).bytes, saved);
    await assert.rejects(
      async () =>
        e.requestExperimental({ kind: 'edit-paragraph-bullet-definition' }, { mutation: true }),
      /UseTyped/,
    );
  } finally {
    await e.dispose();
  }
});
test('public command rejects malformed/stale/unsupported target without changing document or accepting experimental bypass', async () => {
  const e = await make();
  try {
    const state = e.getEditorState();
    const target = createParagraphSelection(state, { section: 0, paragraph: 1, startUnit: 0 });
    for (const payload of [
      {
        target,
        selectionVersion: state.stateVersion + 1,
        edit: { mode: 'create', definition, apply: false },
      },
      {
        target,
        selectionVersion: state.stateVersion,
        edit: { mode: 'create', definition: { ...definition, marker: 0xd800 }, apply: false },
      },
      {
        target: { ...target, format: 'hwp5' },
        selectionVersion: state.stateVersion,
        edit: { mode: 'create', definition, apply: false },
      },
    ]) {
      const result = await e.dispatchCommand(
        EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
        payload as any,
      );
      assert.equal(result.status, 'rejected-unapplied');
      assert.deepEqual((await e.save()).bytes, input);
    }
  } finally {
    await e.dispose();
  }
});

test('Core preserves the older complete inventory while withholding definition writes', async () => {
  assert(process.env.HWPJS_TEST_OLD_WASM, 'ExplicitOlderEngineRequired');
  const oldModule = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_OLD_WASM));
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: oldModule }) });
  try {
    await e.load(input, { format: 'hwpx', editable: true });
    const state = e.getEditorState();
    const inventory = await e.listParagraphBulletDefinitions();
    assert.equal(inventory.state, 'available');
    if (inventory.state !== 'available') throw Error('ExpectedOldInventory');
    assert.equal(inventory.definitionWriter, undefined);
    const target = createParagraphSelection(state, { section: 0, paragraph: 1, startUnit: 0 });
    const result = await e.dispatchCommand(EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND, {
      target,
      selectionVersion: state.stateVersion,
      edit: { mode: 'create', definition, apply: true },
    });
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(e.getEditorState().nativeHistoryRevision, 0);
    assert.deepEqual((await e.save()).bytes, input);
  } finally {
    await e.dispose();
  }
});
