import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createNewDocumentBytes } from '../../js/new-document.mjs';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import {
  SPLICE_TEXT_COMMAND,
  APPLY_FORMATTING_PATCH_COMMAND,
} from '../../packages/core/src/commands/commands.ts';

// Only these four Git-tracked independent oracle dependencies are admitted.
// HEAD text-record intentionally differs from ROOT WIP (no linebreak module).
const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
const oracleRoot = resolve(process.env.HWPJS_TEST_ORACLE_ROOT ?? sourceRoot);
assert.equal(process.cwd(), oracleRoot, 'Run from oracle root: CFB oracle uses cwd');
const oracleFiles = [
  'legacy/cfb.js',
  'tests/hwp5/style-preservation/text-record-oracle.mjs',
  'tests/hwp5/style-preservation/character-property-oracle.mjs',
  'tools/hwp5-distribution-oracle.mjs',
];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', ['-C', sourceRoot, ...args]);
const oracleManifest = oracleFiles.map((path) => {
  const tree = git('ls-tree', '--full-tree', 'HEAD', '--', path).toString().trim();
  assert(tree.endsWith(`\t${path}`), `Untracked oracle: ${path}`);
  const head = git('show', `HEAD:${path}`);
  const actual = readFileSync(resolve(oracleRoot, path));
  assert.equal(sha(actual), sha(head), `Oracle must equal Git HEAD: ${path}`);
  return { path, tree, sha256: sha(actual) };
});
const { inspect, records, paragraphRecords } = await import(
  pathToFileURL(resolve(oracleRoot, oracleFiles[1]))
);
const { verifyCharacterProperties } = await import(
  pathToFileURL(resolve(oracleRoot, oracleFiles[2]))
);
const evidenceRoot = process.env.HWPJS_TEST_EVIDENCE_DIR;
if (evidenceRoot) {
  assert(isAbsolute(evidenceRoot));
  assert(evidenceRoot.includes('/zig-out/verification/hwp5-generated-atomic-r1/sdk-contract/'));
}
function evidence(name, value) {
  if (evidenceRoot) writeFileSync(resolve(evidenceRoot, name), value, { flag: 'wx' });
}
let compiled;
async function wasmModule() {
  if (!compiled) {
    const path = process.env.HWPJS_TEST_WASM;
    const exact = process.env.HWPJS_TEST_WASM_SHA256;
    assert(path && isAbsolute(path), 'Absolute HWPJS_TEST_WASM required');
    assert.match(exact ?? '', /^[a-f0-9]{64}$/, 'Exact HWPJS_TEST_WASM_SHA256 required');
    const bytes = readFileSync(path);
    assert.equal(sha(bytes), exact, 'WASM hash mismatch; never substitute another artifact');
    evidence(
      'inputs.json',
      JSON.stringify(
        {
          wasm: { path, sha256: exact },
          sourceRoot,
          oracleRoot,
          oracleManifest,
          testSha256: sha(readFileSync(fileURLToPath(import.meta.url))),
          provenance: 'constructor-only synthetic HWP5; no external fixture',
        },
        null,
        2,
      ),
    );
    compiled = WebAssembly.compile(bytes);
  }
  return compiled;
}
function target(editor, paragraph = 3, startUnit = 0, endUnit = 2) {
  return {
    ...editor.getEditorState().token,
    coordinateSpace: 'display',
    format: 'hwp5',
    owner: 'section:0:body',
    section: 0,
    paragraph,
    startUnit,
    endUnit,
    affinity: 'forward',
  };
}
function committed(reply) {
  assert.equal(reply.status, 'committed-with-snapshot', reply.error);
  assert.equal(reply.changed, true);
}
async function session() {
  const module = await wasmModule();
  const factory = createReaderRuntimeFactory({ wasmModule: module });
  let real;
  const editor = createEditor({
    runtimeFactory: async () => {
      real = await factory();
      // Keep the canonical runtime object: admission authority is bound by identity.
      return real;
    },
  });
  const save = async () => Buffer.from((await editor.save({ allowStaleLayout: true })).bytes);
  const structure = async (kind, paragraph, atUnit) => {
    const reply = await editor.requestExperimental(
      {
        kind,
        section: 0,
        paragraph,
        ...(kind === 'split' ? { atUnit, endUnit: atUnit } : {}),
      },
      { mutation: true, token: editor.getEditorState().token },
    );
    committed(reply);
  };
  try {
    await editor.load(await createNewDocumentBytes(module, 'hwp5'), { format: 'hwp5' });
    const constructor = await save();
    committed(
      await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: target(editor, 0, 2, 2),
        text: 'HEADER',
      }),
    );
    await structure('split', 0, 22);
    committed(
      await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
        target: target(editor, 1, 0, 0),
        text: 'BODY😀AB',
      }),
    );
    await structure('split', 1, 4);
    await structure('split', 1, 2);
    const row = editor.getEditorState().content.paragraphs.find((p) => p.paragraph === 3);
    assert.equal(row.text, '😀AB');
    assert.equal(row.currentReference.kind, 'generated');
    assert.notEqual(row.paragraph, Number(row.currentReference.id));
    return {
      editor,
      save,
      structure,
      constructor,
      raw: (message) => real.request(message),
      row: (paragraph = 3) =>
        editor
          .getEditorState()
          .content.paragraphs.find((p) => p.section === 0 && p.paragraph === paragraph),
      patch: (patch, paragraph = 3) =>
        editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: target(editor, paragraph),
          patch,
        }),
    };
  } catch (error) {
    await editor.dispose();
    throw error;
  }
}
const combined = {
  character: { size: 1900, bold: true, italic: true, textColor: 0x123456 },
  paragraph: { alignment: 'CENTER' },
};
function documentView(bytes) {
  const parsed = inspect(bytes);
  const info = records(parsed.decode(parsed.streams.get('DocInfo')));
  return {
    ...parsed,
    info,
    chars: info.filter((r) => r.tag === 21),
    paras: info.filter((r) => r.tag === 25),
  };
}
function paragraphView(view, paragraph) {
  const group = paragraphRecords(view.sections[0].bytes, paragraph);
  const own = group.direct.filter((r) => r.level === group.head.level + 1);
  const text = own.find((r) => r.tag === 67).payload;
  const runs = own.find((r) => r.tag === 68).payload;
  const spans = Array.from({ length: runs.length / 8 }, (_, i) => ({
    at: runs.readUInt32LE(8 * i),
    id: runs.readUInt32LE(8 * i + 4),
  }));
  const units = Array.from({ length: text.length / 2 }, (_, i) => {
    const id = spans.findLast((r) => r.at <= i).id;
    assert(view.chars[id], 'character resource reference in range');
    return view.chars[id].payload;
  });
  const para = view.paras[group.head.payload.readUInt16LE(8)].payload;
  return { ...group, own, text, runs, spans, units, para };
}
// Independent expectation uses tracked raw record readers only, never Native
// snapshots or edited values as the expected resource. HWP5 spec rev1.2:
// CHAR_SHAPE size/flags/color offsets42/46/52; PARA_SHAPE alignment bits2..4.
function characterExpected(payload) {
  const out = Buffer.from(payload);
  out.writeInt32LE(1900, 42);
  out.writeUInt32LE((out.readUInt32LE(46) | 3) >>> 0, 46);
  out.writeUInt32LE(0x563412, 52);
  return out;
}
function paragraphExpected(payload) {
  const out = Buffer.from(payload);
  out.writeUInt32LE(((out.readUInt32LE(0) & ~(7 << 2)) | (3 << 2)) >>> 0, 0);
  return out;
}
function styleBasis(view, group) {
  const styles = view.info.filter((r) => r.tag === 26);
  const style = styles[group.head.payload[10]].payload;
  // Two UTF-16 names, then type,next-style,language,para-shape,char-shape.
  let at = 0;
  for (let i = 0; i < 2; i++) at += 2 + style.readUInt16LE(at) * 2;
  const paraId = style.readUInt16LE(at + 4),
    charId = style.readUInt16LE(at + 6);
  assert(view.paras[paraId] && view.chars[charId], 'style basis references exist');
  return { character: view.chars[charId].payload, paragraph: view.paras[paraId].payload };
}
function independent(beforeBytes, afterBytes, paragraph, patch, startUnit = 0, endUnit = 2) {
  const a = documentView(beforeBytes),
    b = documentView(afterBytes);
  const old = paragraphView(a, paragraph),
    now = paragraphView(b, paragraph);
  const basis = styleBasis(a, old);
  const resetChar = patch.reset && patch.reset.scope !== 'paragraph';
  const resetPara = patch.reset && patch.reset.scope !== 'character';
  const expectedUnits = old.units.map((payload, i) =>
    i >= startUnit && i < endUnit
      ? resetChar
        ? basis.character
        : patch.character
          ? characterExpected(payload)
          : payload
      : payload,
  );
  const expectedPara = resetPara
    ? basis.paragraph
    : patch.paragraph
      ? paragraphExpected(old.para)
      : old.para;
  assert.deepEqual(now.units, expectedUnits, 'all UTF16 units incl unselected suffix/CR');
  assert.deepEqual(now.para, expectedPara, 'complete target paragraph resource');
  assert.deepEqual(now.text, old.text);
  assert.deepEqual(a.metadata, b.metadata, 'full CFB metadata');
  assert.deepEqual([...a.streams.keys()].sort(), [...b.streams.keys()].sort());
  for (const [path, bytes] of a.streams)
    if (!['DocInfo', 'BodyText/Section0'].includes(path))
      assert.deepEqual(b.streams.get(path), bytes, `complete unrelated stream ${path}`);
  // Existing DocInfo records, including opaque records, retain full bytes and order.
  // Only counts and appended exact requested char/para resources may differ.
  const addedChar = b.chars.slice(a.chars.length),
    addedPara = b.paras.slice(a.paras.length);
  assert(b.chars.length >= a.chars.length && b.paras.length >= a.paras.length);
  a.chars.forEach((r, i) => assert.deepEqual(b.chars[i].raw, r.raw));
  a.paras.forEach((r, i) => assert.deepEqual(b.paras[i].raw, r.raw));
  assert(addedChar.length <= 1 && addedPara.length <= 1, 'no unused resource proliferation');
  for (const row of addedChar) assert.deepEqual(row.payload, expectedUnits[startUnit]);
  for (const row of addedPara) assert.deepEqual(row.payload, expectedPara);
  const added = new Set([...addedChar, ...addedPara]);
  const surviving = b.info.filter((r) => !added.has(r));
  assert.equal(surviving.length, a.info.length);
  a.info.forEach((r, i) => {
    if (r.tag !== 17) return assert.deepEqual(surviving[i].raw, r.raw, `DocInfo record ${i}`);
    const expected = Buffer.from(r.payload);
    expected.writeInt32LE(b.chars.length, 36);
    expected.writeInt32LE(b.paras.length, 52);
    assert.equal(surviving[i].tag, r.tag);
    assert.equal(surviving[i].level, r.level);
    assert.deepEqual(surviving[i].payload, expected, 'only char/para ID counts change');
  });
  const oldRows = old.all,
    newRows = now.all;
  assert.deepEqual(
    newRows.slice(0, now.at).map((r) => r.raw),
    oldRows.slice(0, old.at).map((r) => r.raw),
    'all earlier non-target source paragraphs',
  );
  assert.deepEqual(
    newRows.slice(now.end).map((r) => r.raw),
    oldRows.slice(old.end).map((r) => r.raw),
    'all later non-target source paragraphs',
  );
  const expectedHeader = Buffer.from(old.head.payload);
  expectedHeader.writeUInt16LE(now.head.payload.readUInt16LE(8), 8);
  expectedHeader.writeUInt16LE(now.spans.length, 12);
  expectedHeader.writeUInt16LE(0, 16);
  assert.deepEqual(now.head.payload, expectedHeader, 'only owned header references/cache count');
  const retained = (p) =>
    p.direct
      .filter((r) => !(r.level === p.head.level + 1 && [68, 69].includes(r.tag)))
      .map((r) => r.raw);
  assert.deepEqual(retained(now), retained(old), 'all target non-run/non-cache records');
  assert(!now.own.some((r) => r.tag === 69), 'geometry change invalidates local line cache');
  return { independentCFB: true, nativeSelfReaderUsedAsOracle: false };
}
async function assertHistory(s, before, after, patch, paragraph = 3) {
  const noop = await s.patch(patch, paragraph);
  assert.equal(noop.error, undefined);
  assert.equal(noop.changed, false);
  assert.deepEqual(await s.save(), after, 'no-op exact save bytes');
  assert.equal((await s.editor.undo()).changed, true);
  assert.deepEqual(await s.save(), before, 'one undo restores entire combined operation');
  assert.equal((await s.editor.redo()).changed, true);
  assert.deepEqual(await s.save(), after, 'one redo restores entire combined operation');
}
const fields = [
  'character.bold',
  'character.italic',
  'character.size',
  'character.textColor',
  'paragraph.alignment',
];
function known(query, name, value) {
  const observation = query.observations.aggregate[name];
  assert(observation, `missing observation ${name}`);
  assert.equal(observation.state, 'known', `${name}: ${JSON.stringify(observation)}`);
  assert.deepEqual(observation.value, value);
  assert.equal(observation.writable, true);
}

test('G02 public Core generated BODY query + combined atomic patch + no-op/single undo/redo', async () => {
  const s = await session();
  try {
    const before = await s.save();
    const query = await s.editor.queryFormatting(target(s.editor), { fields });
    assert.equal(query.targets.length, 1);
    assert.equal(typeof query.targets[0].ref, 'string');
    assert.deepEqual(await s.save(), before, 'query is read-only');
    committed(await s.patch(combined));
    const after = await s.save();
    independent(before, after, 3, combined);
    const changed = await s.editor.queryFormatting(target(s.editor), { fields });
    for (const [name, value] of Object.entries({
      'character.bold': true,
      'character.italic': true,
      'character.size': 1900,
      'character.textColor': 0x123456,
      'paragraph.alignment': 'CENTER',
    }))
      known(changed, name, value);
    await assertHistory(s, before, after, combined);
    evidence('combined-before.hwp', before);
    evidence('combined-after.hwp', after);
  } finally {
    await s.editor.dispose();
  }
});

for (const scope of ['character', 'paragraph', 'all'])
  test(`G02 generated BODY paragraph-style reset ${scope} with independent scope preservation`, async () => {
    const s = await session();
    try {
      committed(await s.patch(combined));
      const before = await s.save();
      const patch = { reset: { basis: 'paragraph-style', scope } };
      committed(await s.patch(patch));
      const after = await s.save();
      independent(before, after, 3, patch);
      await assertHistory(s, before, after, patch);
      evidence(`reset-${scope}-before.hwp`, before);
      evidence(`reset-${scope}-after.hwp`, after);
    } finally {
      await s.editor.dispose();
    }
  });

test('G02 Native current refs across repeated split, ordinal movement, merge; foreign/stale rejection', async () => {
  const s = await session(),
    foreign = await session();
  try {
    for (let cycle = 0; cycle < 3; cycle++) {
      const retired = structuredClone(s.row().currentReference);
      // Splitting an earlier generated paragraph moves target ordinal3 ->4.
      await s.structure('split', 1, 1);
      assert.equal(s.row(4).text, '😀AB');
      assert.equal(s.row(4).currentReference.kind, 'generated');
      assert.equal(s.row(4).currentReference.id, retired.id);
      const before = await s.save();
      const fresh = structuredClone(s.row(4).currentReference);
      const forged = [
        retired,
        foreign.row().currentReference,
        { ...fresh, epoch: '0' },
        { ...fresh, scope: 'foreign' },
        { ...fresh, kind: 'original' },
        { ...fresh, section: 1 },
        { ...fresh, id: '999999' },
        { ...fresh, row: 1 },
        { ...fresh, column: 1 },
        s.row(3).currentReference,
        null,
        {},
        { ...fresh, extra: true },
      ];
      for (const key of Object.keys(fresh)) {
        const missing = { ...fresh };
        delete missing[key];
        forged.push(missing);
      }
      for (const reference of forged) {
        const reply = await s.raw({
          kind: 'query-formatting',
          fields: [],
          selector: {
            kind: 'original-paragraph',
            section: 0,
            paragraph: 4,
            ranges: [{ startUnit: 0, endUnit: 2 }],
            reference,
          },
        });
        assert.equal(reply.error, 'InvalidCurrentFormattingReference', JSON.stringify(reference));
        assert.deepEqual(await s.save(), before);
      }
      await s.editor.queryFormatting(target(s.editor, 4), { fields: [] });
      const patch = cycle % 2 ? { reset: { basis: 'paragraph-style', scope: 'all' } } : combined;
      committed(await s.patch(patch, 4));
      independent(before, await s.save(), 4, patch);
      await s.structure('merge', 1);
      assert.equal(s.row().text, '😀AB');
      await s.editor.queryFormatting(target(s.editor), { fields: [] });
      const stale = await s.raw({
        kind: 'query-formatting',
        fields: [],
        selector: {
          kind: 'original-paragraph',
          section: 0,
          paragraph: 3,
          reference: fresh,
          ranges: [{ startUnit: 0, endUnit: 2 }],
        },
      });
      assert.equal(stale.error, 'InvalidCurrentFormattingReference');
    }
  } finally {
    await s.editor.dispose();
    await foreign.editor.dispose();
  }
});

test('G02 Native rejects late second target surrogate range and preserves pre-existing redo', async () => {
  const s = await session();
  try {
    const before = await s.save();
    committed(await s.patch(combined));
    const after = await s.save();
    independent(before, after, 3, combined);
    assert.equal((await s.editor.undo()).changed, true);
    assert.deepEqual(await s.save(), before);
    // Both refs originate from real Native queries in this exact current session.
    // First target is valid; second scalar range fails Native batch preflight.
    const first = await s.editor.queryFormatting(target(s.editor, 2), { fields: [] });
    const second = await s.editor.queryFormatting(target(s.editor), { fields: [] });
    const rejected = await s.editor.requestExperimental(
      {
        kind: 'formatting-patch',
        request: {
          schemaVersion: 1,
          binding: second.binding,
          targets: [
            first.targets[0],
            { ...second.targets[0], ranges: [{ startUnit: 1, endUnit: 2 }] },
          ],
          patch: combined,
        },
      },
      { mutation: true, token: s.editor.getEditorState().token },
    );
    assert.equal(rejected.status, 'rejected-unapplied', JSON.stringify(rejected));
    assert.match(
      rejected.error ?? '',
      /Surrogate|Scalar|InvalidFormattingRange/,
      'failure must identify the invalid scalar range, not generic unsupported ownership',
    );
    assert.equal(rejected.changed, false);
    assert.deepEqual(await s.save(), before, 'late failure rolls back both target/resources');
    assert.equal((await s.editor.redo()).changed, true, 'existing redo survives late failure');
    assert.deepEqual(await s.save(), after);
    // Query refs and state tokens captured before undo cannot mutate after redo.
    const old = await s.editor.requestExperimental(
      {
        kind: 'formatting-patch',
        request: {
          schemaVersion: 1,
          binding: second.binding,
          targets: second.targets,
          patch: { character: { bold: false } },
        },
      },
      { mutation: true, token: s.editor.getEditorState().token },
    );
    assert.equal(old.status, 'rejected-unapplied', JSON.stringify(old));
    assert.deepEqual(await s.save(), after);
    evidence('late-failure.json', JSON.stringify({ rejected, stale: old }, null, 2));
  } finally {
    await s.editor.dispose();
  }
});

test('G02 character-only atomic patch also satisfies existing tracked full-record oracle', async () => {
  const s = await session();
  try {
    const before = await s.save();
    committed(await s.patch({ character: combined.character }));
    const after = await s.save();
    verifyCharacterProperties(before, after, {
      section: 0,
      paragraph: 3,
      startUnit: 0,
      endUnit: 2,
      properties: combined.character,
    });
    assert.deepEqual(inspect(before).metadata, inspect(after).metadata);
  } finally {
    await s.editor.dispose();
  }
});

test('Oracle calibration on constructor ORIGINAL BODY (not generated atomic support)', async () => {
  const s = await session();
  try {
    const before = await s.save();
    const selected = target(s.editor, 0, 2, 4);
    const query = await s.editor.queryFormatting(selected, { fields });
    assert.equal(query.targets.length, 1);
    committed(
      await s.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
        target: selected,
        patch: combined,
      }),
    );
    const after = await s.save();
    independent(before, after, 0, combined, 16, 18);
    const changed = await s.editor.queryFormatting(target(s.editor, 0, 2, 4), { fields });
    for (const [name, value] of Object.entries({
      'character.bold': true,
      'character.italic': true,
      'character.size': 1900,
      'character.textColor': 0x123456,
      'paragraph.alignment': 'CENTER',
    }))
      known(changed, name, value);
    evidence('oracle-calibration-original-before.hwp', before);
    evidence('oracle-calibration-original-after.hwp', after);
    for (const scope of ['character', 'paragraph', 'all']) {
      const patch = { reset: { basis: 'paragraph-style', scope } };
      const dispatch = () =>
        s.editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
          target: target(s.editor, 0, 2, 4),
          patch,
        });
      committed(await dispatch());
      const reset = await s.save();
      independent(after, reset, 0, patch, 16, 18);
      const noop = await dispatch();
      assert.equal(noop.error, undefined);
      assert.equal(noop.changed, false);
      assert.deepEqual(await s.save(), reset);
      assert.equal((await s.editor.undo()).changed, true);
      assert.deepEqual(await s.save(), after);
      assert.equal((await s.editor.redo()).changed, true);
      assert.deepEqual(await s.save(), reset);
      assert.equal((await s.editor.undo()).changed, true);
      assert.deepEqual(await s.save(), after);
      evidence(`oracle-calibration-original-reset-${scope}.hwp`, reset);
    }
  } finally {
    await s.editor.dispose();
  }
});
