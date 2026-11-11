import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { checkedBulletDefinitionEdit } from '../../js/paragraph-bullet-definition-write.mjs';
assert(process.env.HWPJS_TEST_WASM);
assert(process.env.HWPJS_TEST_OLD_WASM);
assert(process.env.HWPJS_TEST_EVIDENCE);
const wasm = await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_WASM));
const fixture = async (n) =>
  new Uint8Array(
    await readFile(new URL('../../apps/docs/docs/public/editor/fixtures/' + n, import.meta.url)),
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
};
const evidence = process.env.HWPJS_TEST_EVIDENCE;
await mkdir(evidence, { recursive: true });
async function save(e, n) {
  const bytes = e.save();
  await writeFile(evidence + '/' + n + '.hwpx', bytes);
  return bytes;
}
async function oracle(name, before, after, mode, id, expected, apply = false, paragraph = 1) {
  const inputPath = evidence + '/' + name + '-before.hwpx';
  const outputPath = evidence + '/' + name + '-after.hwpx';
  const planPath = evidence + '/' + name + '-plan.json';
  const invalidPath = evidence + '/' + name + '-invalid-plan.json';
  await writeFile(inputPath, before);
  await writeFile(outputPath, after);
  const plan = {
    before: inputPath,
    after: outputPath,
    mode,
    id,
    definition: expected,
    apply,
    paragraph,
  };
  await writeFile(planPath, JSON.stringify(plan));
  await writeFile(
    invalidPath,
    JSON.stringify({ ...plan, definition: { ...expected, marker: 0x2606 } }),
  );
  const script = new URL('../hwpx/paragraph-bullet-definition-oracle.py', import.meta.url).pathname;
  for (const flags of [[], ['-O']]) {
    const result = JSON.parse(
      execFileSync('python3', [...flags, script, planPath], { encoding: 'utf8' }),
    );
    assert.equal(result.verified, true);
    assert.throws(
      () =>
        execFileSync('python3', [...flags, script, invalidPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      (error) => error.status === 1 && String(error.stderr).includes('Wrong marker'),
    );
  }
}

test('create and apply one Native history entry; update global resource, save/reopen/no-op/undo/redo', async () => {
  const e = await createHwpxEditor(wasm);
  try {
    const input = await fixture('page.hwpx');
    e.open(input);
    e.enableHistoryV2();
    const before = e.historyRevision();
    assert.equal(
      e.writeParagraphBulletDefinition({ mode: 'create', definition, apply: true }, 0, 2),
      true,
    );
    assert.equal(e.historyRevision(), before + 1);
    assert.deepEqual(e.paragraphBulletDefinitions().declarations[0].definition, definition);
    const created = await save(e, 'native-created');
    await oracle('create', input, created, 'create', 1, definition, true);
    const stableRevision = e.historyRevision();
    assert.equal(
      e.writeParagraphBulletDefinition({ mode: 'update', id: 1, definition, apply: true }, 0, 2),
      false,
    );
    assert.equal(e.historyRevision(), stableRevision);
    assert.deepEqual(e.save(), created);
    assert.equal(e.undo(), true);
    assert.deepEqual(e.save(), input);
    assert.equal(e.redo(), true);
    assert.deepEqual(e.save(), created);
    const changed = {
      ...definition,
      marker: 0x26,
      widthAdjust: 30,
      alignment: 'CENTER',
      textOffsetType: 'PERCENT',
      textOffset: 65,
    };
    const rev = e.historyRevision();
    assert.equal(
      e.writeParagraphBulletDefinition({
        mode: 'update',
        id: 1,
        definition: changed,
        apply: false,
      }),
      true,
    );
    assert.equal(e.historyRevision(), rev + 1);
    const updated = await save(e, 'native-updated');
    await oracle('update', created, updated, 'update', 1, changed);
    assert.equal(e.undo(), true);
    assert.deepEqual(e.save(), created);
    assert.equal(
      e.writeParagraphBulletDefinition({ mode: 'update', id: 1, definition, apply: false }),
      false,
    );
    assert.equal(e.redo(), true);
    assert.deepEqual(e.save(), updated);
    const reopened = await createHwpxEditor(wasm);
    try {
      reopened.open(updated);
      assert.deepEqual(reopened.paragraphBulletDefinitions().declarations[0].definition, changed);
    } finally {
      reopened.close();
    }
  } finally {
    e.close();
  }
});
test('new definitions preserve every existing declaration and pending paragraph resource intent', async () => {
  const e = await createHwpxEditor(wasm);
  try {
    e.open(await fixture('lists-bullet.hwpx'));
    e.enableHistoryV2();
    e.setParagraphAlignment({ section: 0, paragraph: 5, alignment: 'CENTER' });
    const before = e.save(),
      old = e.paragraphBulletDefinitions();
    assert.equal(
      e.writeParagraphBulletDefinition({ mode: 'create', definition, apply: false }),
      true,
    );
    const next = e.paragraphBulletDefinitions();
    assert.equal(next.declarations.length, old.declarations.length + 1);
    assert.deepEqual(next.declarations.slice(0, -1), old.declarations);
    await writeFile(evidence + '/native-intent-before.hwpx', before);
    const intentAfter = await save(e, 'native-intent-after');
    await oracle('intent', before, intentAfter, 'create', 23, definition);
    assert.equal(e.undo(), true);
    assert.deepEqual(e.save(), before);
    assert.equal(e.redo(), true);
    const sharedBefore = await save(e, 'native-shared-before');
    assert.equal(
      e.writeParagraphBulletDefinition({
        mode: 'update',
        id: 7,
        definition: { ...definition, marker: 0x25c6 },
        apply: false,
      }),
      true,
    );
    const sharedAfter = await save(e, 'native-shared-after');
    await oracle('shared', sharedBefore, sharedAfter, 'update', 7, {
      ...definition,
      marker: 0x25c6,
    });
    const snapshot = e.save(),
      revision = e.historyRevision();
    for (const edit of [
      { mode: 'update', id: 0xffffffff, definition, apply: false },
      { mode: 'create', definition: { ...definition, charShapeId: 0xfffffffe }, apply: false },
      { mode: 'create', definition: { ...definition, marker: 0xd800 }, apply: false },
    ]) {
      assert.throws(() => e.writeParagraphBulletDefinition(edit));
      assert.deepEqual(e.save(), snapshot);
      assert.equal(e.historyRevision(), revision);
    }
  } finally {
    e.close();
  }
});
test('old inventory engine withholds writer ABI; DTO input rejects invalid geometry and forged keys', async () => {
  const old = await createHwpxEditor(
    await WebAssembly.compile(await readFile(process.env.HWPJS_TEST_OLD_WASM)),
  );
  try {
    const input = await fixture('page.hwpx');
    old.open(input);
    old.enableHistoryV2();
    assert.throws(
      () => old.writeParagraphBulletDefinition({ mode: 'create', definition, apply: false }),
      /AbiUnavailable/,
    );
    assert.deepEqual(old.save(), input);
  } finally {
    old.close();
  }
  for (const edit of [
    { mode: 'create', definition, apply: false, id: 8 },
    { mode: 'create', definition: { ...definition, widthAdjust: 1.5 }, apply: false },
    { mode: 'update', definition, id: 1, apply: false, extra: true },
  ])
    assert.throws(() => checkedBulletDefinitionEdit(edit), /Invalid/);
});
