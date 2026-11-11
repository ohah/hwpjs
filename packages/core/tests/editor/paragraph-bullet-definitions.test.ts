import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createEditor,
  createParagraphSelection,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime.ts';
assert(
  process.env.HWPJS_TEST_WASM &&
    process.env.HWPJS_TEST_OLD_WASM &&
    process.env.HWPJS_TEST_UNUSED_BULLETS,
  'ExplicitBulletInputsRequired',
);
const wasm = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM!));
const old = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_OLD_WASM!));
const input = new Uint8Array(await readFile(process.env.HWPJS_TEST_UNUSED_BULLETS!));
const available = {
  schemaVersion: 1,
  state: 'available',
  scope: 'current-header',
  coverage: 'complete',
  declarations: [],
};
async function opened(module = wasm, bytes = input, format: 'hwpx' | 'hwp5' = 'hwpx') {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  await editor.load(bytes, { format, editable: true });
  return editor;
}
test('public Core returns an owned complete inventory without changing editor state, selection or history', async () => {
  const editor = await opened();
  try {
    const before = editor.getEditorState();
    const result = await editor.listParagraphBulletDefinitions({ token: before.token });
    assert.equal(editor.getEditorState(), before);
    assert.equal(result.state, 'available');
    if (result.state !== 'available') throw Error('Expected inventory');
    assert.equal(result.declarations.length, 24);
    assert(result.declarations.some((d) => d.id === 99 && d.canApply));
    assert(
      Object.isFrozen(result) &&
        Object.isFrozen(result.declarations) &&
        Object.isFrozen(result.declarations[0]),
    );
    const target = createParagraphSelection(before, { section: 0, paragraph: 4, startUnit: 0 });
    await editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
      target,
      patch: { paragraph: { bullet: { kind: 'existing', id: 99 } } },
    });
    assert.equal((await editor.listParagraphBulletDefinitions()).state, 'available');
    await assert.rejects(editor.listParagraphBulletDefinitions({ token: before.token }), /Stale/);
  } finally {
    await editor.dispose();
  }
});
test('public Core exposes unavailable ABI separately from empty and HWP5 inventories', async () => {
  for (const [module, bytes, format, expected] of [
    [old, input, 'hwpx', 'ParagraphBulletDefinitionsAbiUnavailable'],
    [
      wasm,
      new Uint8Array(
        await readFile(
          new URL('../../../../apps/docs/docs/public/editor/fixtures/lists.hwp', import.meta.url),
        ),
      ),
      'hwp5',
      'Hwp5BulletDefinitionsUnavailable',
    ],
  ] as const) {
    const editor = await opened(module, bytes, format);
    try {
      assert.deepEqual(JSON.parse(JSON.stringify(await editor.listParagraphBulletDefinitions())), {
        state: 'unavailable',
        reason: expected,
      });
    } finally {
      await editor.dispose();
    }
  }
  const editor = await opened(
    wasm,
    new Uint8Array(
      await readFile(
        new URL('../../../../apps/docs/docs/public/editor/fixtures/page.hwpx', import.meta.url),
      ),
    ),
  );
  try {
    assert.deepEqual(
      JSON.parse(JSON.stringify(await editor.listParagraphBulletDefinitions())),
      available,
    );
  } finally {
    await editor.dispose();
  }
});
test('Core rejects stale in-flight inventory after disposal and malformed runtime replies', async () => {
  let release!: () => void, started!: () => void;
  const waiting = new Promise<void>((r) => (release = r)),
    entered = new Promise<void>((r) => (started = r));
  const editor = createEditor({
    runtimeFactory: () => ({
      async request(message, context) {
        if (message.kind === 'paragraph-bullet-definitions') {
          started();
          await waiting;
          return {
            kind: message.kind,
            bulletDefinitions: available,
            meta: { context, application: 'unapplied', changed: false },
          };
        }
        return {
          kind: message.kind,
          content: { format: 'hwpx', paragraphs: [] },
          meta: { context, application: 'unapplied', changed: false },
        };
      },
      dispose() {},
    }),
  });
  await editor.load(new Uint8Array([1]), { format: 'hwpx', editable: false });
  const pending = editor.listParagraphBulletDefinitions();
  await entered;
  const disposed = editor.dispose();
  release();
  await assert.rejects(pending, /Disposed|Stale|Ready/);
  await disposed;
  const malformed = createEditor({
    runtimeFactory: () => ({
      async request(message, context) {
        return {
          kind: message.kind,
          content: { format: 'hwpx', paragraphs: [] },
          bulletDefinitions: { ...available, coverage: 'partial' },
          meta: { context, application: 'unapplied', changed: false },
        };
      },
      dispose() {},
    }),
  });
  await malformed.load(new Uint8Array([1]), { format: 'hwpx', editable: false });
  try {
    await assert.rejects(malformed.listParagraphBulletDefinitions(), /Malformed/);
  } finally {
    await malformed.dispose();
  }
});
