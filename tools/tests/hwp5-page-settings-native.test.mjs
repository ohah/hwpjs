import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import {
  createEditor,
  EDIT_PAGE_SETTINGS_COMMAND as EDIT,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../packages/core/src/index.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
const source = fileURLToPath(new URL('../../', import.meta.url));
const evidence = process.env.HWPJS_TEST_EVIDENCE_DIR,
  wasm = process.env.HWPJS_TEST_WASM;
for (const p of [evidence, wasm])
  assert(
    typeof p === 'string' &&
      isAbsolute(p) &&
      !p.split('/').includes('..') &&
      !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/.test(p),
  );
const bytes = readFileSync(wasm);
assert.equal(createHash('sha256').update(bytes).digest('hex'), process.env.HWPJS_TEST_WASM_SHA256);
mkdirSync(evidence);
const module = await WebAssembly.compile(bytes);
const input = new Uint8Array(
  readFileSync(source + 'apps/docs/docs/public/editor/fixtures/page.hwp'),
);
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
const saved = (e) => e.save({ allowStaleLayout: true }).bytes;
async function sdk(t) {
  const e = await createExperimentalHwp5Editor(module, input);
  e.enableHistoryV2();
  t.after(() => e.close());
  return e;
}
function request(e, scope = 'section', section = 0) {
  const cap = e.pageSettingsCapabilities();
  assert.equal(cap.format, 'hwp5');
  return {
    binding: cap.binding,
    scope,
    targets: cap.sections
      .filter((r) => scope === 'document' || r.section === section)
      .map((r) => r.target),
    values,
  };
}
function oracle(name, before, after, v = values, sections = [0]) {
  const first = evidence + '/' + name + '-before.hwp',
    last = evidence + '/' + name + '-after.hwp',
    plan = evidence + '/' + name + '-plan.json',
    bad = evidence + '/' + name + '-bad-plan.json';
  writeFileSync(first, before);
  writeFileSync(last, after);
  const p = { before: first, after: last, sections, values: v };
  writeFileSync(plan, JSON.stringify(p));
  writeFileSync(bad, JSON.stringify({ ...p, values: { ...v, width: v.width + 1 } }));
  // A well-framed CFB with the wrong root CLSID must fail independently.
  const forged = Buffer.from(after);
  const sector = forged.readUInt32LE(48),
    size = 1 << forged.readUInt16LE(30);
  forged[(sector + 1) * size + 80] ^= 1;
  const wrong = evidence + '/' + name + '-wrong-root.hwp',
    wrongPlan = evidence + '/' + name + '-wrong-root-plan.json';
  writeFileSync(wrong, forged);
  writeFileSync(wrongPlan, JSON.stringify({ ...p, after: wrong }));
  for (const flags of [[], ['-O']]) {
    const run = (p) =>
      execFileSync('python3', [...flags, source + 'tools/hwp5-page-settings-edit-oracle.py', p], {
        stdio: 'pipe',
        encoding: 'utf8',
      });
    assert.equal(JSON.parse(run(plan)).verified, true);
    assert.throws(
      () => run(bad),
      (e) => e.status === 1 && e.stderr.includes('Wrong page dimensions'),
    );
    assert.throws(
      () => run(wrongPlan),
      (e) => e.status === 1 && e.stderr.includes('CFB metadata changed'),
    );
  }
}
test('HWP5 source page write uses canonical stored axes, one history, no-op, independent CFB and reopen', async (t) => {
  const e = await sdk(t),
    before = saved(e),
    r = request(e);
  assert.equal(e.writePageSettings(r).nativeCode, 1);
  assert.equal(e.historyRevision(), 1);
  const raw = e.pageSettings(0);
  assert.equal(raw.orientation, 'widely');
  assert.equal(raw.flags & 7, 5);
  assert.equal(raw.width, values.width);
  assert.equal(raw.height, values.height);
  const after = saved(e);
  oracle('single', before, after);
  assert.equal(e.writePageSettings(request(e)).nativeCode, 2);
  assert.equal(e.historyRevision(), 1);
  assert.equal(e.writePageSettings(r).error, 'StalePageSettingsBinding');
  assert(e.undo());
  assert.deepEqual(saved(e), before);
  assert(e.redo());
  assert.deepEqual(saved(e), after);
  const reopened = await createExperimentalHwp5Editor(module, after);
  t.after(() => reopened.close());
  assert.equal(reopened.pageSettings(0).height, values.height);
  assert.deepEqual(saved(reopened), after);
});
test('HWP5 forged snapshot and owner, invalid geometry, foreign lifetime and undo ABA refuse without losing redo', async (t) => {
  const e = await sdk(t),
    other = await sdk(t),
    before = saved(e);
  const r = request(e);
  assert.equal(other.writePageSettings(r).nativeCode, 0);
  for (const field of ['source_node', 'flags', 'extra_bytes']) {
    const q = request(e);
    q.targets[0].expected[field] += field === 'flags' ? 8 : 1;
    assert.equal(e.writePageSettings(q).nativeCode, 0);
    assert.deepEqual(saved(e), before);
  }
  assert.equal(e.writePageSettings(request(e)).nativeCode, 1);
  assert(e.undo());
  const q = request(e);
  q.targets[0].expected.width++;
  assert.equal(e.writePageSettings(q).nativeCode, 0);
  assert.equal(e.historyStats().redoCount, 1);
  assert.deepEqual(saved(e), before);
  assert(e.redo());
});
test('HWP5 bullet definition and page settings preserve pending resources and shared history in both directions', async (t) => {
  const e = await sdk(t),
    before = saved(e);
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
  assert(e.writeParagraphBulletDefinition({ mode: 'create', definition, apply: true }, 0, 4));
  const bullet = saved(e);
  assert.equal(e.writePageSettings(request(e)).nativeCode, 1);
  const page = saved(e);
  oracle('pending-bullet', bullet, page);
  assert(
    e.writeParagraphBulletDefinition(
      { mode: 'update', id: 1, definition: { ...definition, marker: 0x2606 }, apply: false },
      0,
      4,
    ),
  );
  const updated = saved(e);
  for (const expected of [page, bullet, before]) {
    assert(e.undo());
    assert.deepEqual(saved(e), expected);
  }
  for (const expected of [bullet, page, updated]) {
    assert(e.redo());
    assert.deepEqual(saved(e), expected);
  }
  assert.equal(e.paragraphBulletDefinitions().declarations[0].marker, 0x2606);
});
async function core(t, editable = true) {
  const e = createEditor({ runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }) });
  t.after(() => e.dispose());
  await e.load(input, { format: 'hwp5', editable });
  return e;
}
test('HWP5 typed Core shares opaque page target, normalized presentation and command with read-only and bypass refusal', async (t) => {
  const e = await core(t),
    foreign = await core(t),
    readOnly = await core(t, false);
  const before = (await e.save({ allowStaleLayout: true })).bytes;
  const read = await e.getPageSettings({ section: 0 });
  assert.equal(read.state, 'available');
  assert.equal(read.sections[0].source.orientation, 'widely');
  assert.equal(read.sections[0].source.margin.left, 8504);
  const payload = { target: read.target, scope: 'section', values };
  assert.equal((await foreign.dispatchCommand(EDIT, payload)).error, 'ForeignPageSettingsTarget');
  assert.equal(
    (await e.dispatchCommand(EDIT, { ...payload, target: { ...read.target } })).error,
    'ForeignPageSettingsTarget',
  );
  assert.throws(
    () => e.requestExperimental({ kind: 'write-page-settings' }, { mutation: true }),
    /UseTyped/,
  );
  assert.equal((await readOnly.getPageSettings({ section: 0 })).state, 'unavailable');
  const result = await e.dispatchCommand(EDIT, payload);
  assert.equal(result.status, 'committed-with-snapshot', result.error);
  assert.equal(e.getEditorState().nativeHistoryRevision, 1);
  const after = (await e.save({ allowStaleLayout: true })).bytes;
  oracle('core', before, after);
  assert.equal((await e.dispatchCommand(EDIT, payload)).error, 'StalePageSettingsTarget');
  for (const [cmd, expected] of [
    [UNDO_COMMAND, before],
    [REDO_COMMAND, after],
  ]) {
    assert.equal(
      (await e.dispatchCommand(cmd, { token: e.getEditorState().token })).status,
      'committed-with-snapshot',
    );
    assert.deepEqual((await e.save({ allowStaleLayout: true })).bytes, expected);
  }
});

test('HWP5 two-section SDK scope and document single history preserve the unchanged part independently', async (t) => {
  const path = process.env.HWPJS_TEST_HWP5_MULTI;
  assert(
    typeof path === 'string' &&
      isAbsolute(path) &&
      !path.split('/').includes('..') &&
      !/title-column-roundtrip|hwpers_test4_complex_table|legacy\/hwpers/.test(path),
  );
  const input = readFileSync(path);
  assert.equal(
    createHash('sha256').update(input).digest('hex'),
    process.env.HWPJS_TEST_HWP5_MULTI_SHA256,
  );
  const e = await createExperimentalHwp5Editor(module, input);
  e.enableHistoryV2();
  t.after(() => e.close());
  assert.equal(e.pageSettingsCapabilities().sections.length, 2);
  const before = saved(e);
  assert.equal(e.writePageSettings(request(e, 'section', 1)).nativeCode, 1);
  const one = saved(e);
  oracle('multi-single', before, one, values, [1]);
  assert.equal(e.writePageSettings(request(e, 'document')).nativeCode, 1);
  const all = saved(e);
  oracle('multi-all', one, all, values, [0]);
  for (const expected of [one, before]) {
    assert(e.undo());
    assert.deepEqual(saved(e), expected);
  }
  for (const expected of [one, all]) {
    assert(e.redo());
    assert.deepEqual(saved(e), expected);
  }
});

test('HWP5 original table split and page rebases keep one history, current node identities and no-op redo', async (t) => {
  const { createHwp5CellWidthFixture } =
    await import('../../tests/helpers/hwp5-cell-width-fixture.mjs');
  const fixture = await createHwp5CellWidthFixture(module);
  const e = await createExperimentalHwp5Editor(module, fixture);
  e.enableHistoryV2();
  t.after(() => e.close());
  const before = saved(e);
  assert.equal(e.writePageSettings(request(e)).nativeCode, 1);
  const page = saved(e);
  oracle('table-page', before, page);
  const cell = e.tableBindings(0)[0];
  const split = e.splitSourceTableCells({
    binding: e.sourceTableCellSplitBinding(),
    section: 0,
    tableNode: cell.tableNode,
    expectedRows: 2,
    expectedColumns: 2,
    top: 0,
    left: 0,
    bottom: 1,
    right: 1,
    selectedCells: 1,
    splitRows: 2,
    splitColumns: 2,
    mode: 'each',
    equalizeRows: true,
  });
  assert.equal(split.nativeCode, 1, split.error);
  const table = saved(e);
  assert(e.undo());
  assert.deepEqual(saved(e), page);
  assert.equal(e.writePageSettings(request(e)).nativeCode, 2);
  assert.equal(e.historyStats().redoCount, 1);
  assert(e.redo());
  assert.deepEqual(saved(e), table);
  assert(e.undo());
  assert(e.undo());
  assert.deepEqual(saved(e), before);
  assert(e.redo());
  assert(e.redo());
  assert.deepEqual(saved(e), table);
});
