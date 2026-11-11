import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import {
  createEditor,
  EDIT_PAGE_SETTINGS_COMMAND as EDIT,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const evidence = process.env.HWPJS_TEST_EVIDENCE_DIR,
  wasm = process.env.HWPJS_TEST_WASM,
  pin = process.env.HWPJS_TEST_WASM_SHA256;
for (const p of [evidence, wasm])
  assert(
    typeof p === 'string' &&
      isAbsolute(p) &&
      !p.split('/').includes('..') &&
      !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/.test(p),
    'ExplicitSafeInputRequired',
  );
const bytes = readFileSync(wasm);
assert.equal(createHash('sha256').update(bytes).digest('hex'), pin, 'ExactWasmSHA256Required');
mkdirSync(evidence);
const root = evidence + '/';
const module = await WebAssembly.compile(bytes);
const { createNewDocumentBytes } = await import('../../js/new-document.mjs');
writeFileSync(root + 'authored-blank.hwpx', await createNewDocumentBytes(module, 'hwpx'));
execFileSync(
  'python3',
  [
    sourceRoot + 'tests/helpers/page-settings-edit-fixture.py',
    '--input',
    root + 'authored-blank.hwpx',
    '--output',
    root + 'fixtures',
  ],
  { stdio: 'inherit' },
);
const seed = (n) => new Uint8Array(readFileSync(root + 'fixtures/' + n + '.hwpx'));
const values = {
  orientation: 'narrowly',
  width: 64800,
  height: 86400,
  gutter_type: 'top_bottom',
  margin: {
    header: 1800,
    footer: 1800,
    gutter: 720,
    left: 7200,
    right: 3600,
    top: 3600,
    bottom: 5400,
  },
};
mkdirSync(root + 'native-evidence', { recursive: true });
function oracle(name, before, after, parts, expected = values) {
  const dir = root + 'native-evidence/';
  writeFileSync(dir + name + '-before.hwpx', before);
  writeFileSync(dir + name + '-after.hwpx', after);
  const plan = {
    before: dir + name + '-before.hwpx',
    after: dir + name + '-after.hwpx',
    parts,
    values: expected,
  };
  writeFileSync(dir + name + '-plan.json', JSON.stringify(plan));
  const invalid = { ...plan, values: { ...expected, width: expected.width + 1 } };
  writeFileSync(dir + name + '-invalid.json', JSON.stringify(invalid));
  for (const flags of [[], ['-O']]) {
    const r = JSON.parse(
      execFileSync(
        'python3',
        [
          ...flags,
          sourceRoot + 'tools/hwpx-page-settings-edit-oracle.py',
          dir + name + '-plan.json',
        ],
        { encoding: 'utf8' },
      ),
    );
    assert(r.verified);
    assert.throws(
      () =>
        execFileSync(
          'python3',
          [
            ...flags,
            sourceRoot + 'tools/hwpx-page-settings-edit-oracle.py',
            dir + name + '-invalid.json',
          ],
          { stdio: 'pipe' },
        ),
      (e) => e.status === 1,
    );
  }
}
async function sdk(t, n = 'plain') {
  const e = await createHwpxEditor(module);
  e.open(seed(n));
  e.enableHistoryV2();
  t.after(() => e.close());
  return e;
}
const request = (e, scope = 'section', section = 0) => {
  const c = e.pageSettingsCapabilities();
  return {
    binding: c.binding,
    scope,
    targets: c.sections
      .filter((r) => scope === 'document' || r.section === section)
      .map((r) => r.target),
    values,
  };
};
test('SDK source owner snapshot write; orientation axes and opaque XML; no-op, history, reopen', async (t) => {
  const e = await sdk(t);
  const before = e.save();
  const r = request(e);
  assert.equal(r.targets[0].expected.orientation, 'widely');
  const result = e.writePageSettings(r);
  assert.equal(result.nativeCode, 1, result.error);
  assert.equal(e.historyRevision(), 1);
  const after = e.save();
  oracle('single', before, after, ['Contents/section0.xml']);
  assert.equal(e.writePageSettings(r).error, 'StalePageSettingsBinding');
  const next = request(e);
  assert.equal(e.writePageSettings(next).nativeCode, 2);
  assert.equal(e.historyRevision(), 1);
  assert.equal(e.undo(), true);
  assert.deepEqual(e.save(), before);
  assert.equal(e.writePageSettings(r).nativeCode, 0);
  assert.equal(e.redo(), true);
  assert.deepEqual(e.save(), after);
  const reopened = await createHwpxEditor(module);
  t.after(() => reopened.close());
  reopened.open(after);
  assert.deepEqual(reopened.save(), after);
  assert.equal(reopened.pageSettings()[0].orientation, 'narrowly');
});
test('multi-section explicit section/document scope is atomic and preserves other part', async (t) => {
  const e = await sdk(t, 'two-sections');
  const before = e.save();
  const r = request(e, 'section', 1);
  assert.equal(r.targets[0].section, 1);
  assert.equal(e.writePageSettings(r).nativeCode, 1);
  const after = e.save();
  oracle('section-one', before, after, ['Contents/section1.xml']);
  assert.equal(e.undo(), true);
  assert.deepEqual(e.save(), before);
  const all = request(e, 'document');
  assert.equal(e.writePageSettings(all).nativeCode, 1);
  const both = e.save();
  oracle('whole-document', before, both, ['Contents/section0.xml', 'Contents/section1.xml']);
  assert(e.historyRevision() > all.binding.revision);
  assert.equal(e.undo(), true);
  assert.deepEqual(e.save(), before);
  assert.equal(e.redo(), true);
  assert.deepEqual(e.save(), both);
});
test('explicit missing attributes and margin become authored values without losing unknown XML', async (t) => {
  const e = await sdk(t, 'missing-attributes'),
    before = e.save(),
    r = request(e);
  assert.equal(r.targets[0].expected.width, null);
  assert.equal(r.targets[0].expected.margin, null);
  assert.equal(e.writePageSettings(r).nativeCode, 1);
  oracle('missing', before, e.save(), ['Contents/section0.xml']);
});
test('Native current snapshot rejects forged owner, stale expected values, incomplete all-section request, missing/duplicate owner', async (t) => {
  const e = await sdk(t, 'two-sections');
  const before = e.save();
  for (const mutate of [
    (r) => {
      r.targets[0].owner_node++;
    },
    (r) => {
      r.targets[0].expected.width++;
    },
    (r) => {
      r.targets = [];
    },
    (r) => {
      r.scope = 'document';
    },
    (r) => {
      r.targets.push(r.targets[0]);
    },
  ]) {
    const r = request(e);
    mutate(r);
    let x;
    try {
      x = e.writePageSettings(r);
    } catch (error) {
      assert.match(error.message, /InvalidPageSettingsTargets/);
      x = { nativeCode: 0 };
    }
    assert.equal(x.nativeCode, 0, x.error);
    assert.deepEqual(e.save(), before);
    assert.equal(e.historyRevision(), 0);
  }
  for (const n of ['missing-page', 'duplicate', 'conditional']) {
    const s = await sdk(t, n);
    const c = s.pageSettingsCapabilities();
    assert.equal(c.sections[0].target, null);
    assert.equal(
      c.sections[0].reason,
      n === 'missing-page'
        ? 'MissingPageSettings'
        : n === 'duplicate'
          ? 'AmbiguousPageSettings'
          : 'UnsupportedPageSettingsOwner',
    );
  }
});
async function core(t, n = 'plain', hooks = {}) {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  t.after(() => e.dispose());
  await e.load(seed(n), { format: 'hwpx', editable: true });
  e.acquireInputSurface({ commitComposition: () => 'unchanged', cancelComposition() {}, ...hooks });
  return e;
}
test('typed Core exact private target, one history, stale/foreign/copy and experimental bypass rejection', async (t) => {
  const e = await core(t),
    other = await core(t);
  const before = (await e.save()).bytes;
  const cap = await e.getPageSettings({ section: 0 });
  assert.equal(cap.state, 'available');
  const p = { target: cap.target, scope: 'section', values };
  for (const target of [{}, Object.freeze({ ...cap.target })])
    assert.equal(
      (await e.dispatchCommand(EDIT, { ...p, target })).error,
      'ForeignPageSettingsTarget',
    );
  assert.equal((await other.dispatchCommand(EDIT, p)).error, 'ForeignPageSettingsTarget');
  assert.throws(
    () => e.requestExperimental({ kind: 'write-page-settings' }, { mutation: true }),
    /UseTyped/,
  );
  const result = await e.dispatchCommand(EDIT, p);
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  assert.equal(e.getEditorState().nativeHistoryRevision, 1);
  const after = (await e.save()).bytes;
  assert.equal((await e.dispatchCommand(EDIT, p)).error, 'StalePageSettingsTarget');
  await e.dispatchCommand(UNDO_COMMAND, { token: e.getEditorState().token });
  assert.deepEqual((await e.save()).bytes, before);
  await e.dispatchCommand(REDO_COMMAND, { token: e.getEditorState().token });
  assert.deepEqual((await e.save()).bytes, after);
});
test('typed page target expires after real queued IME input without an extra page mutation', async (t) => {
  const gate = Promise.withResolvers(),
    entered = Promise.withResolvers();
  let first = true;
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  t.after(() => e.dispose());
  await e.load(seed('plain'), { format: 'hwpx', editable: true });
  const lease = e.acquireInputSurface({
    commitComposition() {
      if (!first) return 'unchanged';
      first = false;
      entered.resolve();
      return gate.promise;
    },
    cancelComposition() {},
  });
  await assert.rejects(
    () =>
      lease.request(
        { kind: 'write-page-settings', request: {} },
        { token: e.getEditorState().token, coordinates: 'legacy-native' },
      ),
    /UnsupportedSurfaceOperation/,
  );
  const cap = await e.getPageSettings({ section: 0 });
  const work = e.dispatchCommand(EDIT, { target: cap.target, scope: 'section', values });
  await entered.promise;
  const input = await lease.request(
    { kind: 'splice', section: 0, paragraph: 1, startUnit: 0, endUnit: 0, text: 'IME' },
    { token: e.getEditorState().token, coordinates: 'legacy-native' },
  );
  assert.equal(input.status, 'committed-with-snapshot');
  const revision = e.getEditorState().nativeHistoryRevision;
  gate.resolve('committed');
  const result = await work;
  assert.equal(result.status, 'rejected-unapplied');
  assert.equal(result.error, 'StaleTarget');
  assert.equal(e.getEditorState().nativeHistoryRevision, revision);
  assert.equal(e.getEditorState().content.pageSettings[0].width, 60000);
});

test('page geometry drops known target-section line caches and rejects opaque cache data unchanged', async (t) => {
  const e = await sdk(t, 'cached'),
    before = e.save();
  assert(Buffer.from(before).length > 0);
  const r = request(e);
  const result = e.writePageSettings(r);
  assert.equal(result.nativeCode, 1, result.error);
  oracle('cache', before, e.save(), ['Contents/section0.xml']);
  assert.equal(e.undo(), true);
  assert.deepEqual(e.save(), before);
  const opaque = await sdk(t, 'opaque-cache'),
    source = opaque.save(),
    rev = opaque.historyRevision();
  const rejected = opaque.writePageSettings(request(opaque));
  assert.equal(rejected.nativeCode, 0);
  assert.equal(rejected.error, 'UnsupportedPageLayoutCache');
  assert.deepEqual(opaque.save(), source);
  assert.equal(opaque.historyRevision(), rev);
});

test('page settings and definition writer share parked history without losing pending resource intent', async (t) => {
  const e = await createHwpxEditor(module);
  t.after(() => e.close());
  e.open(
    new Uint8Array(readFileSync(sourceRoot + 'apps/docs/docs/public/editor/fixtures/page.hwpx')),
  );
  e.enableHistoryV2();
  const before = e.save();
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
  assert.equal(
    e.writeParagraphBulletDefinition({ mode: 'create', definition, apply: true }, 0, 2),
    true,
  );
  const bullet = e.save();
  assert.equal(e.writePageSettings(request(e)).nativeCode, 1);
  const page = e.save();
  const id = e.paragraphBulletDefinitions().declarations.at(-1).id;
  assert.equal(
    e.writeParagraphBulletDefinition(
      { mode: 'update', id, definition: { ...definition, marker: 0x2606 }, apply: false },
      0,
      2,
    ),
    true,
  );
  const updated = e.save();
  for (const expected of [page, bullet, before]) {
    assert.equal(e.undo(), true);
    assert.deepEqual(e.save(), expected);
  }
  for (const expected of [bullet, page, updated]) {
    assert.equal(e.redo(), true);
    assert.deepEqual(e.save(), expected);
  }
  const reopened = await createHwpxEditor(module);
  t.after(() => reopened.close());
  reopened.open(updated);
  assert.deepEqual(reopened.save(), updated);
  assert.equal(reopened.pageSettings()[0].width, values.width);
});
