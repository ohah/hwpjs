import { nativeWasmExpectedSHA256 } from '../../../tools/tests/helpers/native-wasm-pin.mjs';
import { all, documentFixture, fire } from './formatting-dialog-test-dom.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createEditor } from '../../../packages/core/src/editor/create-editor.ts';
import { createParagraphSelection } from '../../../packages/core/src/state/paragraph-selection.ts';
import { getHistoryAvailability } from '../../../packages/core/src/state/history-state.ts';
import {
  EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
  SPLICE_TEXT_COMMAND,
} from '../../../packages/core/src/commands/commands.ts';
import { createReaderRuntimeFactory } from '../../../packages/core/src/runtime/reader-runtime.ts';
import { createApiPlayground, apiSampleCode, mountApiPlayground } from '../src/api-playground.mjs';

for (const key of [
  'HWPJS_TEST_WASM',
  'HWPJS_TEST_OLD_WASM',
  'HWPJS_TEST_HWPX',
  'HWPJS_TEST_HWP5',
  'HWPJS_TEST_EVIDENCE',
])
  assert(process.env[key], key);
assert(process.env.HWPJS_TEST_WASM_EXPECTED_SHA256, 'ExplicitNativeSHARequired');
const binary = await readFile(process.env.HWPJS_TEST_WASM);
assert.equal(createHash('sha256').update(binary).digest('hex'), nativeWasmExpectedSHA256());
const module = await WebAssembly.compile(binary);
const input = new Uint8Array(await readFile(process.env.HWPJS_TEST_HWPX));
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
const coordinates = { section: 0, paragraph: 1, start: 0, end: 0 };
const options = {
  getHistoryAvailability,
  createParagraphSelection,
  spliceCommand: SPLICE_TEXT_COMMAND,
  editParagraphBulletDefinitionCommand: EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND,
};
const args = (editor, edit = { mode: 'create', definition, apply: true }) => ({
  target: coordinates,
  selectionVersion: editor.getEditorState().stateVersion,
  edit,
});
async function harness(t, { native = module, editable = true, format = 'hwpx' } = {}) {
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: native }),
  });
  await editor.load(
    format === 'hwpx' ? input : new Uint8Array(await readFile(process.env.HWPJS_TEST_HWP5)),
    { format, editable },
  );
  const api = createApiPlayground({
    editor,
    ...options,
    listParagraphBulletDefinitions: (options) => editor.listParagraphBulletDefinitions(options),
  });
  t.after(async () => {
    api.dispose();
    await editor.dispose();
  });
  return { editor, api };
}
const bytes = async (editor) => (await editor.save()).bytes;
const plain = (v) => JSON.parse(JSON.stringify(v));
async function oracle(name, before, after, mode, expected, apply) {
  const dir = process.env.HWPJS_TEST_EVIDENCE;
  await mkdir(dir, { recursive: true });
  const beforePath = `${dir}/${name}-before.hwpx`,
    afterPath = `${dir}/${name}-after.hwpx`,
    planPath = `${dir}/${name}-plan.json`;
  await writeFile(beforePath, before);
  await writeFile(afterPath, after);
  const plan = {
    before: beforePath,
    after: afterPath,
    mode,
    id: 1,
    definition: expected,
    apply,
    paragraph: 1,
  };
  await writeFile(planPath, JSON.stringify(plan));
  const invalidPath = `${dir}/${name}-invalid.json`;
  await writeFile(
    invalidPath,
    JSON.stringify({ ...plan, definition: { ...expected, marker: 0x2607 } }),
  );
  const script = new URL(
    '../../../tests/hwpx/paragraph-bullet-definition-oracle.py',
    import.meta.url,
  ).pathname;
  for (const flags of [[], ['-O']]) {
    const valid = spawnSync('python3', ['-B', ...flags, script, planPath], { encoding: 'utf8' });
    assert.equal(valid.status, 0, valid.stderr);
    const invalid = spawnSync('python3', ['-B', ...flags, script, invalidPath], {
      encoding: 'utf8',
    });
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Wrong marker/);
  }
}

test('actual Core query and typed create/update from playground, one undo/redo, save/reopen and XML oracle', async (t) => {
  const { editor, api } = await harness(t);
  const before = editor.getEditorState();
  const list = await api.execute('listParagraphBulletDefinitions');
  assert.equal(list.ok, true);
  assert.equal(list.result.scope, 'current-header');
  assert.equal(list.result.coverage, 'complete');
  assert.equal(list.result.definitionWriter, 'character-definitions-v1');
  assert.deepEqual(list.result.declarations, []);
  assert.equal(editor.getEditorState(), before);
  const request = args(editor);
  const createdResult = await api.execute('editParagraphBulletDefinition', request);
  assert.equal(createdResult.ok, true, JSON.stringify(createdResult));
  assert.equal(createdResult.result.status, 'committed-with-snapshot');
  assert.equal(editor.getEditorState().nativeHistoryRevision, before.nativeHistoryRevision + 1);
  const created = await bytes(editor);
  await oracle('api-create', input, created, 'create', definition, true);
  const stale = await api.execute('editParagraphBulletDefinition', request);
  assert.equal(stale.ok, false);
  assert.match(stale.error, /Stale/);
  assert.deepEqual(await bytes(editor), created);
  assert.equal((await api.execute('undo')).ok, true);
  assert.deepEqual(await bytes(editor), input);
  assert.equal((await api.execute('redo')).ok, true);
  assert.deepEqual(await bytes(editor), created);
  const changed = { ...definition, marker: 0x26, widthAdjust: 30 };
  const update = await api.execute(
    'editParagraphBulletDefinition',
    args(editor, { mode: 'update', id: 1, definition: changed, apply: false }),
  );
  assert.equal(update.ok, true, JSON.stringify(update));
  const updated = await bytes(editor);
  await oracle('api-update', created, updated, 'update', changed, false);
  assert.equal((await api.execute('save')).ok, true);
  assert.equal((await api.execute('reopen')).ok, true);
  const after = await api.execute('listParagraphBulletDefinitions');
  assert.deepEqual(plain(after.result.declarations[0].definition), changed);
  assert.deepEqual(await bytes(editor), updated);
});

test('playground rejects missing explicit coordinates/version, invalid edit, readonly, unsupported owner and HWP5', async (t) => {
  const { editor, api } = await harness(t);
  const request = args(editor);
  for (const invalid of [
    { edit: request.edit },
    { ...request, target: {} },
    { ...request, selectionVersion: -1 },
    { ...request, target: { ...coordinates, section: 99 } },
    { ...request, target: { ...coordinates, paragraph: 99999 } },
    { ...request, target: { ...coordinates, owner: 'fake' } },
    { ...request, edit: { ...request.edit, definition: { ...definition, marker: 0xd800 } } },
  ]) {
    const result = await api.execute('editParagraphBulletDefinition', invalid);
    assert.equal(result.ok, false, JSON.stringify(result));
    assert.deepEqual(await bytes(editor), input);
  }
  const readonly = await harness(t, { editable: false });
  const readList = await readonly.api.execute('listParagraphBulletDefinitions');
  assert.equal(readList.ok, true);
  const denied = await readonly.api.execute('editParagraphBulletDefinition', args(readonly.editor));
  assert.equal(denied.ok, false);
  assert.deepEqual(await bytes(readonly.editor), input);
  // Page fixture's row 0 is the section-definition host, outside the ordinary source-body writer.
  const owner = await api.execute('editParagraphBulletDefinition', {
    ...args(editor),
    target: { ...coordinates, paragraph: 0 },
  });
  assert.equal(owner.ok, false, JSON.stringify(owner));
  assert.deepEqual(await bytes(editor), input);
  const hwp5 = await harness(t, { format: 'hwp5' });
  const unsupported = await hwp5.api.execute('listParagraphBulletDefinitions');
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, 'Hwp5BulletDefinitionsUnavailable');
  const deniedHwp5 = await hwp5.api.execute('editParagraphBulletDefinition', args(hwp5.editor));
  assert.equal(deniedHwp5.ok, false);
});

test('old inventory remains complete; writer missing and disposed/reloaded document requests cannot edit', async (t) => {
  const oldModule = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_OLD_WASM));
  const { editor, api } = await harness(t, { native: oldModule });
  const list = await api.execute('listParagraphBulletDefinitions');
  assert.equal(list.ok, true);
  assert.equal(list.result.coverage, 'complete');
  assert.equal(list.result.definitionWriter, undefined);
  const denied = await api.execute('editParagraphBulletDefinition', args(editor));
  assert.equal(denied.ok, false);
  assert.match(denied.error, /AbiUnavailable/);
  assert.deepEqual(await bytes(editor), input);
  const current = await harness(t);
  const stale = args(current.editor);
  await current.editor.load(input, { format: 'hwpx', editable: true });
  const reloaded = await current.api.execute('editParagraphBulletDefinition', stale);
  assert.equal(reloaded.ok, false);
  assert.deepEqual(await bytes(current.editor), input);
  current.api.dispose();
  await assert.rejects(current.api.execute('listParagraphBulletDefinitions'), /Disposed/);
});

test('public builder keeps named-field callbacks and binds typed bullet command; snippets import public package', async () => {
  const builder = await readFile(
    new URL('../../../tools/build-public-demo.mjs', import.meta.url),
    'utf8',
  );
  for (const code of [
    'editParagraphBulletDefinitionCommand: core.EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND',
    'setNamedFieldValueCommand: core.SET_NAMED_FIELD_VALUE_COMMAND',
    'setNamedFieldParametersCommand: core.SET_NAMED_FIELD_PARAMETERS_COMMAND',
    'readNamedFieldParameters: (selector, options) => editor.readNamedFieldParameters(selector, options)',
    'createSurface: createCanvasSurface',
    'planReplaceAll: core.planReplaceAll',
  ])
    assert(builder.includes(code), code);
  const code = apiSampleCode('editParagraphBulletDefinition', {
    target: coordinates,
    selectionVersion: 1,
    edit: { mode: 'create', definition, apply: true },
  });
  assert.match(code, /from '@ohah\/hwpjs'/);
  assert.match(code, /createParagraphSelection/);
  assert.match(code, /EDIT_PARAGRAPH_BULLET_DEFINITION_COMMAND/);
  assert.match(
    apiSampleCode('listParagraphBulletDefinitions'),
    /editor\.listParagraphBulletDefinitions/,
  );
});

test('Core FIFO completes the query on its original document before a queued reload; disposal invalidates pending reads', async (t) => {
  const { editor, api } = await harness(t);
  const reading = api.execute('listParagraphBulletDefinitions');
  const reload = editor.load(input, { format: 'hwpx', editable: true });
  const result = await reading;
  await reload;
  assert.equal(result.ok, true);
  assert.equal(result.after.documentId, result.before.documentId);
  assert.notEqual(editor.getEditorState().documentId, result.after.documentId);
  assert.deepEqual(await bytes(editor), input);
  const pending = api.execute('listParagraphBulletDefinitions');
  await editor.dispose();
  const disposed = await pending;
  assert.equal(disposed.ok, false);
});

test('mounted JSON panel fills the current version and executes the real query/typed command; legacy injection retains its menu', async (t) => {
  const { editor } = await harness(t);
  const legacy = createApiPlayground({
    editor,
    getHistoryAvailability,
    createParagraphSelection,
    spliceCommand: SPLICE_TEXT_COMMAND,
  });
  assert.deepEqual(legacy.operations, [
    'load',
    'invalidLoad',
    'read',
    'select',
    'getTableInsertAvailability',
    'splice',
    'undo',
    'redo',
    'save',
    'reopen',
  ]);
  legacy.dispose();
  const { root } = documentFixture();
  const panel = mountApiPlayground(root, {
    editor,
    ...options,
    listParagraphBulletDefinitions: (options) => editor.listParagraphBulletDefinitions(options),
  });
  t.after(() => panel.dispose());
  const byLabel = (name) => all(root).find((node) => node.getAttribute('aria-label') === name);
  const operation = byLabel('실행할 API'),
    input = byLabel('JSON 인수'),
    output = byLabel('실행 결과');
  const execute = all(root).find((node) => node.textContent === 'API 실행');
  const run = async (name) => {
    operation.value = name;
    fire(operation, 'change');
    const request = JSON.parse(input.value);
    const sequence = output.dataset.sequence;
    fire(execute, 'click');
    for (let attempt = 0; attempt < 100 && output.dataset.sequence === sequence; attempt++)
      await new Promise((resolve) => setImmediate(resolve));
    assert.notEqual(output.dataset.sequence, sequence);
    return { result: JSON.parse(output.textContent), request };
  };
  const listed = await run('listParagraphBulletDefinitions');
  assert.equal(listed.result.ok, true);
  const version = editor.getEditorState().stateVersion;
  const created = await run('editParagraphBulletDefinition');
  assert.equal(created.request.selectionVersion, version);
  assert.equal(created.result.ok, true, created.result.error);
  assert.equal(created.result.result.status, 'committed-with-snapshot');
  const queried = await run('listParagraphBulletDefinitions');
  assert.equal(queried.result.result.declarations.length, 1);
});
