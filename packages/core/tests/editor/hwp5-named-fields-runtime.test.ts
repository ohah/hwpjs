import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createCfbReader } from '../../../../js/cfb.mjs';
import { decodeHwp5NamedFields } from '../../../../js/hwp5-named-fields.mjs';
import { createExperimentalHwp5Editor } from '../../../../js/hwp5-editor.mjs';
import { createNewDocumentBytes } from '../../../../js/new-document.mjs';
import { createEditor, SPLICE_TEXT_COMMAND } from '../../src/index.ts';
import type { SelectionTarget } from '../../src/index.ts';
import { createReaderRuntimeFactory, createWorkerRuntimeFactory } from '../../src/runtime.ts';

const path = process.env.HWPJS_TEST_WASM;
assert(path, 'Explicit HWPJS_TEST_WASM required');
const wasmModule = await WebAssembly.compile(readFileSync(path));
const blank = await createNewDocumentBytes(wasmModule, 'hwp5');
const cfb = await createCfbReader(wasmModule);
cfb.parse(blank, { strict: true });
const original = cfb.document();

function record(tag: number, level: number, payload: Buffer) {
  const frame = Buffer.alloc(4);
  frame.writeUInt32LE(tag | (level << 10) | (payload.length << 20));
  return Buffer.concat([frame, payload]);
}
function id(value: string) {
  return Buffer.from(value, 'ascii').readUInt32BE();
}
function marker(code: 3 | 4, kind: string) {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt16LE(code, 0);
  bytes.writeUInt32LE(code === 3 ? id(kind) : id(kind) & 0x00ffffff, 2);
  bytes.writeUInt16LE(code, 14);
  return bytes;
}
function nameData(name: string) {
  const text = Buffer.from(name, 'utf16le');
  const params = Buffer.from([0x1b, 2, 1, 0, 0, 0, 0, 0x40, 1, 0, 0, 0]);
  params.writeUInt16LE(text.length / 2, 10);
  return record(87, 2, Buffer.concat([params, text]));
}
function fieldHeader(kind: string, instance: number, name: string | null, duplicate = false) {
  const properties = Buffer.alloc(15);
  properties.writeUInt32LE(id(kind));
  properties.writeUInt32LE(instance, 11);
  return Buffer.concat([
    record(71, 1, properties),
    ...(name === null ? [] : [nameData(name)]),
    ...(duplicate ? [nameData('wrong')] : []),
  ]);
}
function paragraph(text: Buffer, headers: Buffer[], last: boolean) {
  const para = Buffer.alloc(22);
  const raw = Buffer.concat([text, Buffer.from([13, 0])]);
  para.writeUInt32LE(raw.length / 2 + (last ? 0x80000000 : 0));
  para.writeUInt32LE(1 << 3, 4);
  para.writeUInt16LE(1, 12);
  return Buffer.concat([
    record(66, 0, para),
    record(67, 1, raw),
    record(68, 1, Buffer.alloc(8)),
    ...headers,
  ]);
}
const t = (text: string) => Buffer.from(text, 'utf16le');
const fieldText = (kind: string, value: string) =>
  Buffer.concat([marker(3, kind), t(value), marker(4, kind)]);
function fixture(paragraphs: Buffer[]) {
  const nodes = original.nodes.map((node: { name: string; content: Uint8Array }) => {
    if (node.name !== 'Section0') return node;
    const section = Buffer.from(node.content);
    section.writeUInt32LE(section.readUInt32LE(4) & 0x7fffffff, 4);
    return { ...node, content: Buffer.concat([section, ...paragraphs]) };
  });
  return cfb.write({ ...original, nodes });
}
const input = fixture([
  paragraph(
    Buffer.concat([t('A'), fieldText('%clk', '😀'), t('B'), fieldText('%clk', ''), t('C')]),
    [fieldHeader('%clk', 101, '금액'), fieldHeader('%clk', 102, '금액')],
    false,
  ),
  paragraph(fieldText('%bmk', '책갈피 값'), [fieldHeader('%bmk', 103, '책갈피')], false),
  paragraph(
    Buffer.concat([marker(3, '%clk'), t('미닫힌 값')]),
    [fieldHeader('%clk', 104, '미닫힘')],
    true,
  ),
]);

test('HWP5 named fields SDK reads directly owned CFB names and current source ranges', async () => {
  const sdk = await createExperimentalHwp5Editor(wasmModule, input);
  try {
    const result = sdk.namedFields();
    assert.equal(result.coverage, 'complete');
    assert.deepEqual(
      result.rows.map((row) => [row.name, row.kind]),
      [
        ['금액', 'CLICK_HERE'],
        ['금액', 'CLICK_HERE'],
        ['책갈피', 'BOOKMARK'],
        ['미닫힘', 'CLICK_HERE'],
      ],
    );
    assert.deepEqual(
      result.rows.map((row) => row.value),
      [
        { status: 'available', text: '😀' },
        { status: 'available', text: '' },
        { status: 'available', text: '책갈피 값' },
        { status: 'unavailable' },
      ],
    );
    const first = result.rows[0].sourceLocation;
    assert.deepEqual([first.paragraph, first.startUnit, first.endUnit], [1, 9, 11]);
    assert.equal(result.rows[3].sourceLocation, null);
    assert.deepEqual(sdk.save().bytes, input);
  } finally {
    sdk.close();
  }
});

const reader = () => createReaderRuntimeFactory({ wasmModule });
const worker = () => createWorkerRuntimeFactory({ wasmModule });
for (const [label, factory] of [
  ['ReaderRuntime', reader],
  ['Worker', worker],
] as const) {
  test(`HWP5 named fields real CFB through ${label} lists, resolves and moves read-only`, async () => {
    const editor = createEditor({ runtimeFactory: factory() });
    try {
      await editor.load(input, { format: 'hwp5', editable: false });
      const initial = editor.getEditorState();
      const inventory = await editor.listNamedFields();
      assert.equal(inventory.format, 'hwp5');
      assert.equal(inventory.coverage, 'complete');
      assert.equal(inventory.rows.length, 4);
      assert.equal((await editor.readNamedField({ name: '금액' })).status, 'ambiguous');
      assert.deepEqual(await editor.readNamedField({ name: '금 액' }), { status: 'missing' });
      assert.equal((await editor.moveToNamedField({ name: '미닫힘' })).status, 'unavailable');
      assert.equal(editor.getEditorState(), initial);
      const first = await editor.moveToNamedField({ name: '금액', occurrence: 0 });
      assert.equal(first.status, 'moved');
      const range = editor.getEditorState().selection as SelectionTarget;
      assert.deepEqual(
        [range.owner, range.section, range.paragraph, range.startUnit, range.endUnit],
        ['section:0:body', 0, 1, 2, 4],
      );
      const empty = await editor.moveToNamedField({ name: '금액', occurrence: 1 });
      assert.equal(empty.status, 'moved');
      const caret = editor.getEditorState().selection as SelectionTarget;
      assert.deepEqual([caret.startUnit, caret.endUnit], [7, 7]);
      const bookmark = await editor.readNamedField({ name: '책갈피' });
      assert.equal(bookmark.status, 'found');
      if (bookmark.status === 'found')
        assert.deepEqual(bookmark.field.value, { status: 'available', text: '책갈피 값' });
      assert.equal(editor.getEditorState().operationRevision, initial.operationRevision);
      assert.equal(editor.getEditorState().nativeHistoryRevision, initial.nativeHistoryRevision);
      await assert.rejects(editor.save(), /EditorNotOpen/);
      await editor.load(input, { format: 'hwp5', editable: true });
      const before = editor.getEditorState();
      assert.equal(
        (await editor.moveToNamedField({ name: '금액', occurrence: 0 })).status,
        'moved',
      );
      assert.equal(editor.getEditorState().operationRevision, before.operationRevision);
      assert.equal(editor.getEditorState().nativeHistoryRevision, before.nativeHistoryRevision);
      assert.deepEqual((await editor.save()).bytes, input);
    } finally {
      await editor.dispose();
    }
  });
}

test('HWP5 named fields rejects duplicate CTRL_DATA owners without hiding partial coverage', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const malformed = fixture([
      paragraph(fieldText('%clk', 'good'), [fieldHeader('%clk', 201, 'good')], false),
      paragraph(fieldText('%clk', 'ambiguous'), [fieldHeader('%clk', 202, 'bad', true)], true),
    ]);
    await editor.load(malformed, { format: 'hwp5', editable: false });
    const inventory = await editor.listNamedFields();
    assert.equal(inventory.coverage, 'partial');
    assert.deepEqual(
      inventory.rows.map((row) => row.name),
      ['good'],
    );
    assert.deepEqual(await editor.readNamedField({ name: 'good' }), { status: 'incomplete' });
    assert.deepEqual(await editor.moveToNamedField({ name: 'bad' }), { status: 'incomplete' });
    await assert.rejects(editor.save(), /EditorNotOpen/);
  } finally {
    await editor.dispose();
  }
});

test('HWP5 named fields uses the matching format endpoint and keeps HWPX support', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    const hwpx = await createNewDocumentBytes(wasmModule, 'hwpx');
    await assert.rejects(createExperimentalHwp5Editor(wasmModule, hwpx));
    await editor.load(hwpx, { format: 'hwpx', editable: false });
    const inventory = await editor.listNamedFields();
    assert.equal(inventory.format, 'hwpx');
    assert.deepEqual(inventory.rows, []);
    await editor.load(blank, { format: 'hwp5', editable: false });
    assert.equal((await editor.listNamedFields()).format, 'hwp5');
    assert.deepEqual(await editor.readNamedField({ name: 'absent' }), { status: 'missing' });
  } finally {
    await editor.dispose();
  }
});

test('HWP5 named fields reports a current value after an existing text edit and undo', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const closed = fixture([
      paragraph(fieldText('%clk', '😀'), [fieldHeader('%clk', 501, 'current')], true),
    ]);
    await editor.load(closed, { format: 'hwp5', editable: true });
    const before = await editor.moveToNamedField({ name: 'current' });
    assert.equal(before.status, 'moved');
    if (before.status !== 'moved') return;
    const target = before.field.target!;
    const changed = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '갱신😀' });
    assert.equal(changed.status, 'committed-with-snapshot', changed.error);
    await assert.rejects(editor.listNamedFields({ token: target }), /StaleTarget/);
    const current = await editor.readNamedField({ name: 'current' });
    assert.equal(current.status, 'found');
    if (current.status === 'found')
      assert.deepEqual(current.field.value, { status: 'available', text: '갱신😀' });
    await editor.undo();
    assert.deepEqual((await editor.save()).bytes, closed);
    const restored = await editor.readNamedField({ name: 'current' });
    assert.equal(restored.status, 'found');
    if (restored.status === 'found')
      assert.deepEqual(restored.field.value, { status: 'available', text: '😀' });
  } finally {
    await editor.dispose();
  }
});

test('HWP5 named fields keeps cross-paragraph values unknown', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const wide = fixture([
      paragraph(
        Buffer.concat([marker(3, '%clk'), t('first')]),
        [fieldHeader('%clk', 601, 'wide')],
        false,
      ),
      paragraph(Buffer.concat([t('second'), marker(4, '%clk')]), [], true),
    ]);
    await editor.load(wide, { format: 'hwp5', editable: false });
    const result = await editor.readNamedField({ name: 'wide' });
    assert.equal(result.status, 'found');
    if (result.status === 'found') {
      assert.deepEqual(result.field.value, { status: 'unavailable' });
      assert.equal(result.field.target, null);
    }
  } finally {
    await editor.dispose();
  }
});

test('HWP5 named fields returns partial with an unsupported field kind in the same CFB', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    const mixed = fixture([
      paragraph(fieldText('%clk', 'known'), [fieldHeader('%clk', 701, 'known')], false),
      paragraph(fieldText('%dte', 'date'), [fieldHeader('%dte', 702, null)], true),
    ]);
    await editor.load(mixed, { format: 'hwp5', editable: false });
    const inventory = await editor.listNamedFields();
    assert.equal(inventory.coverage, 'partial');
    assert.deepEqual(
      inventory.rows.map((row) => row.name),
      ['known'],
    );
    assert.deepEqual(await editor.readNamedField({ name: 'known' }), { status: 'incomplete' });
  } finally {
    await editor.dispose();
  }
});

test('HWP5 named fields decoder rejects foreign format and malformed source coordinates', () => {
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const source = { format: 'hwp5', coverage: 'complete', rows: [] };
  assert.throws(
    () => decodeHwp5NamedFields(encode({ ...source, format: 'hwpx' })),
    /InvalidHwp5NamedFields/,
  );
  const row = { section: 0, node: 1, kind: 'CLICK_HERE', name: 'a', text: '😀' };
  for (const sourceLocation of [
    undefined,
    { paragraph: 1, sourceNode: 0, startUnit: 8, endUnit: 9 },
  ]) {
    assert.throws(
      () => decodeHwp5NamedFields(encode({ ...source, rows: [{ ...row, sourceLocation }] })),
      /InvalidHwp5NamedFields/,
    );
  }
});
