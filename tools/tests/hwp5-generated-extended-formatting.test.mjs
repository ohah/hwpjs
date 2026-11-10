import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createNewDocumentBytes } from '../../js/new-document.mjs';
import { createReaderRuntime } from '../../web/preview/reader-runtime.mjs';
import { validateHwp5CurrentBodyReference } from '../../web/preview/hwp5-current-body-reference.mjs';
import { createEditor } from '../../packages/core/src/editor/create-editor.ts';
import { createReaderRuntimeFactory } from '../../packages/core/src/runtime.ts';
import {
  SPLICE_TEXT_COMMAND,
  SET_CHARACTER_UNDERLINE_COMMAND,
  SET_CHARACTER_STRIKE_COMMAND,
  SET_CHARACTER_TEXT_COLOR_COMMAND,
  SET_CHARACTER_FONT_NAME_COMMAND,
} from '../../packages/core/src/commands/commands.ts';
// A verification checkout can borrow only the explicitly approved independent oracle root.
const oracleRoot = process.env.HWPJS_TEST_ORACLE_ROOT
  ? pathToFileURL(resolve(process.env.HWPJS_TEST_ORACLE_ROOT) + '/')
  : new URL('../../', import.meta.url);
const { verifyCharacterProperties } = await import(
  new URL('tests/hwp5/style-preservation/character-property-oracle.mjs', oracleRoot)
);
const { inspect, records } = await import(
  new URL('tests/hwp5/style-preservation/text-record-oracle.mjs', oracleRoot)
);

const cases = [
  {
    kind: 'character-underline',
    command: SET_CHARACTER_UNDERLINE_COMMAND,
    payload: { kind: 'bottom' },
    wire: { underlineKind: 'bottom' },
  },
  {
    kind: 'character-strike',
    command: SET_CHARACTER_STRIKE_COMMAND,
    payload: { enabled: true },
    wire: { enabled: true },
  },
  {
    kind: 'character-text-color',
    command: SET_CHARACTER_TEXT_COLOR_COMMAND,
    payload: { color: '#123456' },
    wire: { color: '#123456' },
  },
  {
    kind: 'character-font-name',
    command: SET_CHARACTER_FONT_NAME_COMMAND,
    payload: { language: 'hangul', name: 'Generated Font' },
    wire: { language: 'hangul', name: 'Generated Font' },
  },
];
let compiled;
async function wasmModule() {
  assert(process.env.HWPJS_TEST_WASM, 'Explicit HWPJS_TEST_WASM required');
  if (!compiled) {
    const bytes = readFileSync(process.env.HWPJS_TEST_WASM);
    if (process.env.HWPJS_TEST_WASM_SHA256)
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        process.env.HWPJS_TEST_WASM_SHA256,
      );
    compiled = WebAssembly.compile(bytes);
  }
  return compiled;
}
const range = { section: 0, paragraph: 3, startUnit: 0, endUnit: 2 };
function selected(editor, paragraph = 3, startUnit = 0, endUnit = 2) {
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
function independent(before, after, entry) {
  if (entry.kind === 'character-underline')
    return verifyCharacterProperties(before, after, {
      ...range,
      properties: { underlineKind: 'bottom' },
    });
  if (entry.kind === 'character-text-color')
    return verifyCharacterProperties(before, after, {
      ...range,
      properties: { textColor: 0x123456 },
    });
  if (entry.kind === 'character-font-name') {
    const source = inspect(before);
    const mapping = records(source.decode(source.streams.get('DocInfo'))).find(
      (record) => record.tag === 17,
    );
    const fontIds = [mapping.payload.readInt32LE(4), null, null, null, null, null, null];
    assert.deepEqual(source.metadata, inspect(after).metadata);
    return verifyCharacterProperties(before, after, {
      ...range,
      properties: { fontIds },
      fontResource: { language: 0, name: entry.wire.name },
    });
  }
  const a = inspect(before),
    b = inspect(after);
  const oldShapes = records(a.decode(a.streams.get('DocInfo'))).filter((r) => r.tag === 21);
  const shapes = records(b.decode(b.streams.get('DocInfo'))).filter((r) => r.tag === 21);
  assert.equal(shapes.length, oldShapes.length + 1);
  oldShapes.forEach((row, i) => assert.deepEqual(shapes[i].raw, row.raw));
  const sourceRuns = records(a.sections[0].bytes).filter((r) => r.tag === 68)[3].payload;
  const expected = Buffer.from(oldShapes[sourceRuns.readUInt32LE(4)].payload);
  expected.writeUInt32LE(((expected.readUInt32LE(46) & ~(7 << 18)) | (1 << 18)) >>> 0, 46);
  assert.deepEqual(shapes.at(-1).payload, expected);
  assert.deepEqual(a.metadata, b.metadata);
  assert.deepEqual([...a.streams.keys()].sort(), [...b.streams.keys()].sort());
  for (const [path, bytes] of a.streams)
    if (!['DocInfo', 'BodyText/Section0'].includes(path))
      assert.deepEqual(b.streams.get(path), bytes, path);
  assert.deepEqual(
    records(a.sections[0].bytes)
      .filter((r) => r.tag === 67)
      .map((r) => r.raw),
    records(b.sections[0].bytes)
      .filter((r) => r.tag === 67)
      .map((r) => r.raw),
  );
  const paragraphRuns = records(b.sections[0].bytes).filter((r) => r.tag === 68);
  assert.equal(paragraphRuns[3].payload.readUInt32LE(4), shapes.length - 1);
}
async function prepareCore(editor, bytes) {
  await editor.load(bytes, { format: 'hwp5' });
  const splice = async (paragraph, start, text) => {
    const reply = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, {
      target: selected(editor, paragraph, start, start),
      text,
    });
    assert.equal(reply.status, 'committed-with-snapshot', reply.error);
  };
  const split = async (paragraph, atUnit) => {
    const reply = await editor.requestExperimental(
      { kind: 'split', section: 0, paragraph, atUnit, endUnit: atUnit },
      { mutation: true, token: editor.getEditorState().token },
    );
    assert.equal(reply.status, 'committed-with-snapshot', reply.error);
  };
  await splice(0, 2, 'HEADER');
  await split(0, 22);
  await splice(1, 0, 'BODY😀AB');
  await split(1, 4);
  await split(1, 2);
}
for (const entry of cases)
  test(`G01 actual Core ${entry.kind} generated BODY binding save no-op undo redo`, async () => {
    const module = await wasmModule(),
      bytes = await createNewDocumentBytes(module, 'hwp5');
    const factory = createReaderRuntimeFactory({ wasmModule: module }),
      calls = [];
    const editor = createEditor({
      runtimeFactory: async () => {
        const runtime = await factory();
        return {
          dispose: runtime.dispose,
          request(message, context) {
            calls.push(message);
            return runtime.request(message, context);
          },
        };
      },
    });
    const save = async () => Buffer.from((await editor.save({ allowStaleLayout: true })).bytes);
    try {
      await prepareCore(editor, bytes);
      const row = editor.getEditorState().content.paragraphs.find((r) => r.paragraph === 3);
      assert.equal(row.text, '😀AB');
      assert.equal(row.currentReference.kind, 'generated');
      assert.equal(row.currentReference.id, '2');
      const target = selected(editor),
        before = await save();
      await editor.setSelection(target);
      const applied = await editor.dispatchCommand(entry.command, { target, ...entry.payload });
      assert.equal(applied.status, 'committed-with-snapshot', applied.error);
      assert.equal(applied.changed, true);
      const request = calls.find((m) => m.kind === entry.kind);
      assert.deepEqual(request.reference, { ...row.currentReference });
      assert.equal(request.paragraph, 3);
      assert.notEqual(request.paragraph, Number(request.reference.id));
      const after = await save();
      independent(before, after, entry);
      assert.deepEqual(
        { ...editor.getEditorState().selection },
        { ...target, ...editor.getEditorState().token },
      );
      const noop = await editor.dispatchCommand(entry.command, {
        target: selected(editor),
        ...entry.payload,
      });
      assert.equal(noop.changed, false);
      assert.deepEqual(await save(), after);
      assert.equal((await editor.undo()).changed, true);
      assert.deepEqual(await save(), before);
      const count = calls.length;
      const rejected = await editor.dispatchCommand(entry.command, {
        target: selected(editor, 3, 1, 2),
        ...entry.payload,
      });
      assert.equal(rejected.error, 'InvalidScalarBoundary');
      assert.equal(rejected.status, 'rejected-unapplied');
      assert.equal(calls.length, count);
      assert.equal((await editor.redo()).changed, true);
      assert.deepEqual(await save(), after);
    } finally {
      await editor.dispose();
    }
  });

test('G01 actual Core composes all four generated setters without losing prior formatting fields', async () => {
  const module = await wasmModule();
  const editor = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  const save = async () => Buffer.from((await editor.save({ allowStaleLayout: true })).bytes);
  try {
    await prepareCore(editor, await createNewDocumentBytes(module, 'hwp5'));
    for (const entry of cases) {
      const before = await save();
      const reply = await editor.dispatchCommand(entry.command, {
        target: selected(editor),
        ...entry.payload,
      });
      assert.equal(reply.status, 'committed-with-snapshot', reply.error);
      independent(before, await save(), entry);
    }
    const saved = inspect(await save());
    const runs = records(saved.sections[0].bytes).filter((r) => r.tag === 68)[3].payload;
    const shapes = records(saved.decode(saved.streams.get('DocInfo'))).filter((r) => r.tag === 21);
    const payload = shapes[runs.readUInt32LE(4)].payload;
    const flags = payload.readUInt32LE(46);
    assert.equal((flags >>> 2) & 3, 1);
    assert.equal((flags >>> 18) & 7, 1);
    assert.equal(payload.readUInt32LE(52), 0x563412);
    assert.equal(payload.readUInt16LE(0), 1);
  } finally {
    await editor.dispose();
  }
});

async function rawSession(module) {
  const runtime = createReaderRuntime({ wasmModule: module });
  let content;
  const request = async (message) => {
    const reply = await runtime.request(message);
    if (reply.content) content = reply.content;
    return reply;
  };
  const ok = async (message) => {
    const reply = await request(message);
    assert.equal(reply.error, undefined, message.kind);
    return reply;
  };
  await ok({ kind: 'load', format: 'hwp5', bytes: await createNewDocumentBytes(module, 'hwp5') });
  await ok({ kind: 'enable' });
  for (const message of [
    { kind: 'splice', paragraph: 0, startUnit: 16, endUnit: 16, text: 'HEADER' },
    { kind: 'split', paragraph: 0, atUnit: 22, endUnit: 22 },
    { kind: 'splice', paragraph: 1, startUnit: 0, endUnit: 0, text: 'BODY😀AB' },
    { kind: 'split', paragraph: 1, atUnit: 4, endUnit: 4 },
    { kind: 'split', paragraph: 1, atUnit: 2, endUnit: 2 },
  ])
    await ok({ section: 0, ...message });
  return {
    runtime,
    request,
    ok,
    content: () => content,
    reference: () => content.paragraphs.find((r) => r.paragraph === 3).currentReference,
    save: async () => Buffer.from((await ok({ kind: 'save', allowStaleLayout: true })).bytes),
  };
}
for (const entry of cases)
  test(`G01 Native runtime ${entry.kind} rejects supplied stale foreign and malformed references before mutation`, async () => {
    const module = await wasmModule(),
      session = await rawSession(module),
      foreign = await rawSession(module);
    try {
      const before = await session.save(),
        originalReference = structuredClone(session.reference());
      await session.ok({ kind: entry.kind, ...range, ...entry.wire, reference: originalReference });
      const after = await session.save();
      independent(before, after, entry);
      await session.ok({ kind: 'undo' });
      assert.deepEqual(await session.save(), before);
      const fresh = structuredClone(session.reference());
      const failures = [
        originalReference,
        foreign.reference(),
        undefined,
        null,
        {},
        { ...fresh, epoch: '0' },
        { ...fresh, scope: 'other' },
        { ...fresh, kind: 'original' },
        { ...fresh, id: '999999' },
        { ...fresh, section: 1 },
        { ...fresh, row: 1 },
        { ...fresh, column: 1 },
        { ...fresh, extra: true },
        session.content().paragraphs.find((r) => r.paragraph === 2).currentReference,
      ];
      for (const key of Object.keys(fresh)) {
        const missing = { ...fresh };
        delete missing[key];
        failures.push(missing);
      }
      for (const reference of failures) {
        const reply = await session.request({
          kind: entry.kind,
          ...range,
          ...entry.wire,
          reference,
        });
        assert.equal(reply.error, 'InvalidCurrentFormattingReference', JSON.stringify(reference));
        assert.equal(session.runtime.outcome(reply).application, 'unapplied');
        assert.equal(session.runtime.outcome(reply).changed, false);
        assert.deepEqual(await session.save(), before);
      }
      const invalidRange = await session.request({
        kind: entry.kind,
        ...range,
        ...entry.wire,
        reference: fresh,
        startUnit: 1,
      });
      assert.equal(invalidRange.error, 'SplitSurrogatePair');
      assert.deepEqual(await session.save(), before);
      await session.ok({ kind: 'redo' });
      assert.deepEqual(await session.save(), after);
      const staleAfterRedo = await session.request({
        kind: entry.kind,
        ...range,
        ...entry.wire,
        reference: fresh,
      });
      assert.equal(staleAfterRedo.error, 'InvalidCurrentFormattingReference');
      assert.deepEqual(await session.save(), after);
      // Original unreferenced ordinal compatibility remains explicit.
      await session.ok({
        kind: entry.kind,
        ...range,
        paragraph: 0,
        startUnit: 16,
        endUnit: 22,
        ...entry.wire,
      });
      // A structural split also retires the supplied generated epoch.
      const preSplit = structuredClone(session.reference());
      await session.ok({ kind: 'split', section: 0, paragraph: 3, atUnit: 2, endUnit: 2 });
      const splitBytes = await session.save();
      assert.equal(
        (await session.request({ kind: entry.kind, ...range, ...entry.wire, reference: preSplit }))
          .error,
        'InvalidCurrentFormattingReference',
      );
      assert.deepEqual(await session.save(), splitBytes);
      const preSplice = structuredClone(session.reference());
      await session.ok({
        kind: 'splice',
        section: 0,
        paragraph: 3,
        startUnit: 0,
        endUnit: 0,
        text: 'Z',
      });
      const spliceBytes = await session.save();
      assert.equal(
        (await session.request({ kind: entry.kind, ...range, ...entry.wire, reference: preSplice }))
          .error,
        'InvalidCurrentFormattingReference',
      );
      assert.deepEqual(await session.save(), spliceBytes);
    } finally {
      session.runtime.dispose();
      foreign.runtime.dispose();
    }
  });

test('G01 runtime binding denies nested original hosts and missing reference-query ABI', () => {
  const reference = {
    epoch: '7',
    scope: 'native',
    kind: 'original',
    section: 0,
    id: '9',
    row: 0,
    column: 0,
  };
  const message = { section: 0, paragraph: 0, reference };
  const editor = {
    supportsCurrentSourceReferences: () => true,
    currentSourceReferences: () => ({ version: 1, first: 0, total: 1, references: [reference] }),
    paragraphFlow: () => [{ paragraph: 0, host: 'cell', top_level: false }],
  };
  const check = (e) =>
    validateHwp5CurrentBodyReference(
      e,
      message,
      'InvalidCurrentFormattingReference',
      'UnsupportedFormattingOwner',
    );
  assert.throws(() => check(editor), /UnsupportedFormattingOwner/);
  assert.throws(
    () => check({ ...editor, supportsCurrentSourceReferences: () => false }),
    /Hwp5CurrentSourceReferenceAbiUnavailable/,
  );
  assert.doesNotThrow(() =>
    validateHwp5CurrentBodyReference(
      {},
      { section: 0, paragraph: 0 },
      'InvalidCurrentFormattingReference',
      'UnsupportedFormattingOwner',
    ),
  );
});

test('G01 all four existing runtime branches validate the binding before the native setter', () => {
  const source = readFileSync(
    new URL('../../web/preview/reader-runtime.mjs', import.meta.url),
    'utf8',
  );
  for (const entry of cases) {
    const start = source.indexOf(`} else if (message.kind === '${entry.kind}') {`);
    assert(start >= 0);
    const end = source.indexOf('} else if (', start + 20),
      branch = source.slice(start, end);
    const guard = branch.indexOf('validateHwp5CurrentBodyReference(');
    assert(guard > branch.indexOf("throw new Error('EditorNotOpen')"));
    assert(guard < branch.indexOf('editor.setCharacter'));
    assert(branch.includes("if (format === 'hwp5')"));
    assert(branch.includes("'InvalidCurrentFormattingReference'"));
    assert(branch.includes("'UnsupportedFormattingOwner'"));
  }
});
