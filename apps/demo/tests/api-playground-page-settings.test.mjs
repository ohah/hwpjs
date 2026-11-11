import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, join } from 'node:path';
import { createEditor, getHistoryAvailability } from '../../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../../packages/core/src/runtime.ts';
import {
  apiPageSettingsOptions,
  apiSampleCode,
  createApiPlayground,
} from '../src/api-playground.mjs';
const path = process.env.HWPJS_TEST_WASM;
assert(
  typeof path === 'string' &&
    isAbsolute(path) &&
    !path.split('/').includes('..') &&
    !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/.test(path),
);
const bytes = readFileSync(path);
assert.equal(createHash('sha256').update(bytes).digest('hex'), process.env.HWPJS_TEST_WASM_SHA256);
const module = await WebAssembly.compile(bytes);
const fixtureRoot = process.env.HWPJS_TEST_PAGE_FIXTURE_DIR;
assert(
  typeof fixtureRoot === 'string' &&
    isAbsolute(fixtureRoot) &&
    !fixtureRoot.split('/').includes('..') &&
    !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/.test(fixtureRoot),
  'ExplicitSafePageFixtureRootRequired',
);
const fixtureHashes = {
  hwp5: '9e032ef8ee0619628c69171794fce56b799cf4d62a0a7c8c2fd86c655c0fb6f8',
  hwpx: '31dcfdacf9962097dc769b424bce4fcf7af3e6967608bd88b1d32af1d073033b',
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (const format of ['hwp5', 'hwpx'])
  test(
    format +
      ' playground invokes actual public Core query and executable snippet without writes or cloned authority',
    async (t) => {
      const ext = format === 'hwp5' ? 'hwp' : 'hwpx';
      const input = readFileSync(join(fixtureRoot, 'empty-page.' + ext));
      assert.equal(createHash('sha256').update(input).digest('hex'), fixtureHashes[format]);
      const editor = createEditor({
        runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
      });
      t.after(() => editor.dispose());
      await editor.load(input, { format, editable: true });
      let count = 0;
      const observed = {
        ...editor,
        getPageSettings(options) {
          count++;
          return editor.getPageSettings(options);
        },
      };
      const api = createApiPlayground({
        editor: observed,
        getHistoryAvailability,
        operations: ['getPageSettings'],
      });
      t.after(() => api.dispose());
      const before = (await editor.save({ allowStaleLayout: true })).bytes;
      assert.deepEqual(api.operations, ['getPageSettings']);
      const record = await api.execute('getPageSettings', { section: 0 });
      assert.equal(count, 1);
      assert.equal(record.ok, true, record.error);
      assert.equal(record.result.state, 'available');
      assert.equal(record.result.currentSection, 0);
      assert.equal(record.result.sections[0].source.width, 36000);
      assert.equal(record.result.sections[0].source.height, 7200);
      assert.equal(Object.hasOwn(record.result, 'binding'), false);
      assert.deepEqual(record.before, record.after);
      assert.equal(record.after.nativeHistoryRevision, 0);
      const snippet = apiSampleCode('getPageSettings', { section: 0 });
      assert.match(snippet, /editor\.getPageSettings\(/);
      assert.match(snippet, /7200=25\.4mm/);
      const queried = await new AsyncFunction('editor', snippet + '\nreturn settings;')(observed);
      assert.equal(count, 2);
      assert.equal(queried.state, 'available');
      assert.equal(queried.currentSection, 0);
      assert.notEqual(queried.target, record.result.target);
      const noSelection = await api.execute('getPageSettings', {});
      assert.equal(noSelection.ok, true);
      assert.equal(noSelection.result.currentSection, null);
      assert.equal(count, 3);
      for (const args of [
        { section: -1 },
        { section: '0' },
        { section: 0, token: {} },
        { binding: {} },
        { section: 0, targets: [] },
      ]) {
        const r = await api.execute('getPageSettings', args);
        assert.equal(r.ok, false);
        assert.match(r.error, /InvalidArgument/);
      }
      assert.equal(count, 3);
      assert.deepEqual((await editor.save({ allowStaleLayout: true })).bytes, before);
      assert.equal(editor.getEditorState().nativeHistoryRevision, 0);
      await editor.load(input, { format, editable: false });
      const unavailable = await api.execute('getPageSettings', { section: 0 });
      assert.equal(unavailable.ok, false);
      assert.equal(unavailable.result.state, 'unavailable');
      assert.equal(unavailable.error, 'ReadOnlyDocument');
      const evidence = process.env.HWPJS_API_EVIDENCE_DIR;
      if (evidence)
        writeFileSync(
          evidence + '/' + format + '-query.json',
          JSON.stringify({ record, snippet, unavailable }, null, 2) + '\n',
        );
    },
  );
test('playground exact optional integer and no accessor/serialized authority; older editor omits unavailable operation', async () => {
  assert.deepEqual(apiPageSettingsOptions({}), {});
  assert.deepEqual(apiPageSettingsOptions({ section: 0 }), { section: 0 });
  let invoked = false;
  const accessor = Object.defineProperty({}, 'section', {
    get() {
      invoked = true;
      throw Error('GetterExecuted');
    },
  });
  assert.throws(() => apiPageSettingsOptions(accessor), /InvalidArgument/);
  assert.equal(invoked, false);
  for (const section of [-0, -1, 1.1, NaN, Infinity, '0', null])
    assert.throws(() => apiPageSettingsOptions({ section }));
  const state = { status: 'ready', content: { format: 'hwpx', paragraphs: [] } };
  const api = createApiPlayground({
    editor: {
      read(fn) {
        return fn(state);
      },
      getEditorState() {
        return state;
      },
    },
    getHistoryAvailability() {
      return {};
    },
  });
  try {
    assert.equal(api.operations.includes('getPageSettings'), false);
    assert.equal((await api.execute('getPageSettings')).error, 'UnknownApiSample');
  } finally {
    api.dispose();
  }
});
