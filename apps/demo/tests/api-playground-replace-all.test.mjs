import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  createEditor,
  createParagraphSelection,
  getHistoryAvailability,
  planReplaceAll,
  REPLACE_ALL_COMMAND,
  SPLICE_TEXT_COMMAND,
} from '@hwpjs/core';
import { bindRuntimeAdmission } from '../../../packages/core/src/internal/runtime-admission.ts';
import { createReaderRuntimeFactory } from '../../../packages/core/src/runtime/reader-runtime.ts';
import { apiSampleCode, createApiPlayground, mountApiPlayground } from '../src/api-playground.mjs';
import { mountHeadlessPanel } from '../src/headless-panel.ts';
import { all, documentFixture, fire } from './formatting-dialog-test-dom.ts';

const operations = ['getReplaceAllCapabilities', 'planReplaceAll', 'replaceAll'];
const literal = { query: 'ab', replacement: 'Z' };
const legacyOptions = {
  getHistoryAvailability,
  createParagraphSelection,
  spliceCommand: SPLICE_TEXT_COMMAND,
};
const options = { ...legacyOptions, planReplaceAll, replaceAllCommand: REPLACE_ALL_COMMAND };
const loadOptions = { format: 'hwpx' };
const seed = new Uint8Array([1]);

async function harness(t, { afterCommitError = false } = {}) {
  const calls = [];
  let loadGate;
  const editor = createEditor({
    runtimeFactory() {
      let closed = false;
      const content = (text) => ({
        format: 'hwpx',
        totalParagraphs: 1,
        limited: false,
        paragraphs: [
          { section: 0, paragraph: 0, text, editable: true, selectionOwner: 'section:0:body' },
        ],
      });
      const runtime = {
        async request(message, context) {
          calls.push(message);
          const base = {
            kind: message.kind,
            historyRevision: 0,
            meta: { context, application: 'unapplied', changed: false },
          };
          switch (message.kind) {
            case 'load':
              await loadGate;
              return { ...base, content: content('ab😀ab') };
            case 'text-transaction-capabilities':
              return {
                ...base,
                textTransactionCapabilities: { available: true, supportsNewlines: false },
              };
            case 'prepare-replace-all':
              return {
                ...base,
                textTransaction: {
                  schemaVersion: 1,
                  binding: { session: 'synthetic', revision: 0 },
                  scope: 'complete-current-paragraph-snapshot',
                  groups: [{ ref: 'synthetic' }],
                },
              };
            case 'independent-text':
              return {
                ...base,
                meta: undefined,
                applied: true,
                changed: true,
                formattingNativeCode: 1,
                historyRevision: 1,
                ...(afterCommitError
                  ? { error: 'ProjectionFailed' }
                  : { content: content('Z😀Z') }),
              };
            default:
              return { ...base, content: content('ab😀ab') };
          }
        },
        dispose() {
          closed = true;
        },
      };
      bindRuntimeAdmission(
        runtime,
        (message, context, admit) => {
          admit();
          return runtime.request(message, context);
        },
        () => !closed,
      );
      return runtime;
    },
  });
  t.after(() => editor.dispose());
  await editor.load(seed, loadOptions);
  const api = createApiPlayground({ editor, ...options });
  t.after(() => api.dispose());
  return {
    api,
    editor,
    calls,
    pauseNextLoad() {
      const { promise, resolve } = Promise.withResolvers();
      loadGate = promise;
      return resolve;
    },
  };
}

function controls(root) {
  const byLabel = (name) => all(root).find((node) => node.getAttribute('aria-label') === name);
  const operation = byLabel('실행할 API');
  const args = byLabel('JSON 인수');
  const output = byLabel('실행 결과');
  const execute = all(root).find((node) => node.textContent === 'API 실행');
  return {
    operations: operation.children.map((node) => node.value),
    async run(name, input) {
      operation.value = name;
      fire(operation, 'change');
      args.value = JSON.stringify(input);
      fire(args, 'input');
      const sequence = output.dataset.sequence;
      fire(execute, 'click');
      for (let attempts = 0; attempts < 50 && output.dataset.sequence === sequence; attempts++)
        await new Promise((resolve) => setImmediate(resolve));
      assert.notEqual(output.dataset.sequence, sequence, name);
      assert.equal(execute.disabled, false);
      return JSON.parse(output.textContent);
    },
  };
}

test('embedded API mount observes and applies one D336 Native transaction with undo/redo', async (t) => {
  const fixture = (path) =>
    readFile(new URL('../../../apps/docs/docs/public/editor/' + path, import.meta.url));
  const wasm = await fixture('hwpjs/hwpjs.wasm');
  const bytes = await fixture('fixtures/noori.hwpx');
  const digest = (data) => createHash('sha256').update(data).digest('hex');
  assert.equal(digest(wasm), 'd3369b3b66d9b40d1ec7ea59c29f1e2cca6046adac0d2057b1e5c4517814e8e6');
  assert.equal(digest(bytes), '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab');
  const wasmModule = await WebAssembly.compile(wasm);
  const editor = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule }) });
  t.after(() => editor.dispose());
  const { root } = documentFixture();
  const panel = mountApiPlayground(root, { editor, ...options, loadFixture: () => bytes });
  t.after(() => panel.dispose());
  const ui = controls(root);
  assert(operations.every((op) => ui.operations.includes(op)));
  assert.equal((await ui.run('load', loadOptions)).ok, true);
  const input = { query: '누리', replacement: '우리' };
  const capability = await ui.run('getReplaceAllCapabilities', {});
  assert.equal(capability.result.available, true);
  assert.deepEqual(capability.before, capability.after);
  const plan = await ui.run('planReplaceAll', input);
  assert.equal(plan.result.matchCount, 7);
  assert.equal(plan.result.executionAuthority, false);
  assert.equal(plan.result.coverage.nativeVerified, false);
  assert.deepEqual(plan.before, plan.after);
  const replace = await ui.run('replaceAll', input);
  assert.equal(replace.result.status, 'committed-with-snapshot');
  assert.equal(replace.after.nativeHistoryRevision, replace.before.nativeHistoryRevision + 1);
  assert.deepEqual(
    replace.after.paragraphs.map((row) => row.text),
    replace.before.paragraphs.map((row) => row.text.replaceAll(input.query, input.replacement)),
  );
  const undo = await ui.run('undo', {});
  assert.equal(undo.result.status, 'committed-with-snapshot');
  assert.deepEqual(undo.after.paragraphs, replace.before.paragraphs);
  const redo = await ui.run('redo', {});
  assert.equal(redo.result.status, 'committed-with-snapshot');
  assert.deepEqual(redo.after.paragraphs, replace.after.paragraphs);
  const noOp = await ui.run('replaceAll', { ...input, query: 'absent-98c6' });
  assert.equal(noOp.result.status, 'known-no-op');
  assert.equal(noOp.before.nativeHistoryRevision, noOp.after.nativeHistoryRevision);

  assert.equal((await ui.run('load', { ...loadOptions, editable: false })).ok, true);
  const readOnly = await ui.run('getReplaceAllCapabilities', {});
  assert.equal(readOnly.result.available, false);
  assert.equal(readOnly.result.reason, 'ReadOnlyDocument');
  assert.deepEqual(readOnly.before, readOnly.after);
  for (const op of ['planReplaceAll', 'replaceAll']) {
    const denied = await ui.run(op, input);
    assert.equal(denied.error, 'ReadOnlyDocument');
    assert.deepEqual(denied.before, denied.after);
  }
});

test('unbundled legacy playground needs no imports and retains its original menu', async (t) => {
  const moduleSource = await readFile(
    new URL('../src/api-playground.mjs', import.meta.url),
    'utf8',
  );
  assert.deepEqual(new Bun.Transpiler({ loader: 'js' }).scanImports(moduleSource), []);
  const { editor } = await harness(t);
  const { root } = documentFixture();
  const panel = mountApiPlayground(root, { ...legacyOptions, editor, loadFixture: () => seed });
  t.after(() => panel.dispose());
  const ui = controls(root);
  assert.deepEqual(ui.operations, [
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
  assert.equal((await ui.run('load', loadOptions)).ok, true);
  assert.equal((await ui.run('read', {})).result.paragraphs[0].text, 'ab😀ab');
  assert.equal((await ui.run('select', { start: 0, end: 1 })).after.selection.endUnit, 1);
});

test('partial Core support cannot expose or execute any replace-all sample', async (t) => {
  const { editor, calls } = await harness(t);
  const start = calls.length;
  for (const overrides of [
    { planReplaceAll: undefined },
    { replaceAllCommand: undefined },
    { editor: { ...editor, getReplaceAllCapabilities: undefined } },
  ]) {
    const api = createApiPlayground({
      ...options,
      editor,
      operations: ['read', ...operations],
      ...overrides,
    });
    assert.deepEqual(api.operations, ['read']);
    for (const operation of operations) {
      assert.equal((await api.execute(operation)).error, 'UnknownApiSample');
    }
    api.dispose();
  }
  assert.equal(calls.length, start);
});

test('headless panel exposes all three samples and preserves its allowlist and disposal', async (t) => {
  const { editor, calls } = await harness(t);
  const { root } = documentFixture();
  const panel = mountHeadlessPanel(root, editor, () => {});
  t.after(() => panel.dispose());
  const ui = controls(root);
  assert(operations.every((op) => ui.operations.includes(op)));
  assert(!ui.operations.includes('load'));
  assert(!ui.operations.includes('getTableInsertAvailability'));
  assert.equal((await ui.run('load', loadOptions)).error, 'UnknownApiSample');
  assert.equal((await ui.run('getReplaceAllCapabilities', {})).result.available, true);
  assert.equal((await ui.run('planReplaceAll', literal)).result.matchCount, 2);
  assert.equal((await ui.run('replaceAll', literal)).result.status, 'committed-with-snapshot');
  assert.equal(calls.filter(({ kind }) => kind === 'independent-text').length, 1);
  panel.dispose();
  assert.equal(root.children.length, 0);
});

test('rejects JSON authority fields, invalid arguments and unlisted operations before RPC', async (t) => {
  const { api, calls } = await harness(t);
  const start = calls.length;
  for (const [key, value] of [
    ['token', {}],
    ['layoutToken', {}],
    ['stateVersion', 0],
    ['schemaVersion', 1],
    ['limits', {}],
    ['__proto__', {}],
  ]) {
    for (const op of operations) {
      const input = { ...(op === operations[0] ? {} : literal), [key]: value };
      const denied = await api.execute(op, input);
      assert.equal(denied.error, 'InvalidArgument:' + key);
      assert.deepEqual(denied.before, denied.after);
      assert.throws(() => apiSampleCode(op, input), /InvalidArgument/);
    }
  }
  for (const op of ['planReplaceAll', 'replaceAll']) {
    assert.equal((await api.execute(op, { query: 'ab' })).error, 'InvalidArgument:replacement');
    assert.equal((await api.execute(op, { ...literal, query: 3 })).error, 'InvalidArgument:query');
  }
  assert.equal(
    (await api.execute('getReplaceAllCapabilities', { query: 'ab' })).error,
    'InvalidArgument:query',
  );
  assert.equal((await api.execute('replaceAll', [])).error, 'InvalidArguments');
  for (const op of ['constructor', 'toString', 'eval']) {
    assert.equal((await api.execute(op, literal)).error, 'UnknownApiSample');
  }
  assert.equal(calls.length, start);
  assert.match(apiSampleCode('getReplaceAllCapabilities'), /editor\.getReplaceAllCapabilities/);
  assert.match(apiSampleCode('planReplaceAll', literal), /planReplaceAll\(state, request\)/);
  assert.match(
    apiSampleCode('replaceAll', literal),
    /dispatchCommand\(REPLACE_ALL_COMMAND, request\)/,
  );
});

test('queued input updates the state version; a concurrent sample is rejected as busy', async (t) => {
  const { api, editor, calls } = await harness(t);
  const previous = (await api.execute('planReplaceAll', literal)).result;
  const selection = editor.setSelection(
    createParagraphSelection(editor.getEditorState(), {
      section: 0,
      paragraph: 0,
      startUnit: 0,
      endUnit: 1,
      affinity: 'forward',
    }),
  );
  const replace = api.execute('replaceAll', literal);
  await assert.rejects(api.execute('getReplaceAllCapabilities'), /ApiPlaygroundBusy/);
  const current = await selection;
  assert.equal((await replace).result.status, 'committed-with-snapshot');
  const prepares = calls.filter(({ kind }) => kind === 'prepare-replace-all');
  assert.equal(prepares.length, 1);
  const { plan } = prepares[0];
  assert.notEqual(plan.stateVersion, previous.stateVersion);
  assert.deepEqual({ ...plan.layoutToken }, { ...current.token });
  assert.equal(plan.stateVersion, current.stateVersion);
  assert.equal(calls.filter(({ kind }) => kind === 'independent-text').length, 1);
});

test('a document switch during the barrier does not move the pending replacement to the new document', async (t) => {
  const { api, editor, calls } = await harness(t);
  const previous = editor.getEditorState();
  const load = editor.load(seed, loadOptions);
  const replace = api.execute('replaceAll', literal);
  assert.notEqual((await load).generation, previous.generation);
  assert.equal((await replace).error, 'StaleTarget');
  assert(!calls.some(({ kind }) => ['prepare-replace-all', 'independent-text'].includes(kind)));
});

test('disposal during the input barrier stops dispatch and closed wins over busy', async (t) => {
  const { api, editor, calls, pauseNextLoad } = await harness(t);
  const release = pauseNextLoad();
  const load = editor.load(seed, loadOptions);
  const replace = api.execute('replaceAll', literal);
  api.dispose();
  try {
    await assert.rejects(api.execute('replaceAll', literal), /ApiPlaygroundDisposed/);
  } finally {
    release();
  }
  await load;
  assert.equal((await replace).error, 'ApiPlaygroundDisposed');
  assert(!calls.some(({ kind }) => ['prepare-replace-all', 'independent-text'].includes(kind)));
});

test('post-commit projection failure remains refresh-required with exactly one mutation', async (t) => {
  const { api, calls } = await harness(t, { afterCommitError: true });
  const result = await api.execute('replaceAll', literal);
  assert.equal(result.error, 'ProjectionFailed');
  assert.equal(result.result.status, 'committed-refresh-required');
  assert.equal(result.after.status, 'refresh-required');
  assert.equal(calls.filter(({ kind }) => kind === 'independent-text').length, 1);
  assert.equal(calls.filter(({ kind }) => kind === 'prepare-replace-all').length, 1);
});
