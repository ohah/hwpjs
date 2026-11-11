import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { createNewDocumentBytes } from '../../../../js/new-document.mjs';
import { createHwpxEditor } from '../../../../js/hwpx-editor.mjs';
import {
  createEditor,
  createParagraphSelection,
  CREATE_NAMED_FIELD_COMMAND,
  SET_NAMED_FIELD_PARAMETERS_COMMAND,
  SET_NAMED_FIELD_VALUE_COMMAND,
  RENAME_NAMED_FIELD_COMMAND,
  SPLICE_TEXT_COMMAND,
} from '../../src/index.ts';
import type { HeadlessEditor, NamedFieldSelector, SelectionTarget } from '../../src/index.ts';
import { hasRuntimeAdmission } from '../../src/internal/runtime-admission.ts';
import { createReaderRuntimeFactory, createWorkerRuntimeFactory } from '../../src/runtime.ts';

const path = process.env.HWPJS_TEST_WASM;
assert(path, 'Explicit HWPJS_TEST_WASM required');
const wasmModule = await WebAssembly.compile(readFileSync(path));
const blank = await createNewDocumentBytes(wasmModule, 'hwpx');
const zip = `
import copy, io, sys, zipfile
body = sys.argv[1].replace('LONG_SENTINEL', 'Z' * 200001).encode()
mode = sys.argv[2]
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as src:
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w') as dst:
        for member in src.infolist():
            data = src.read(member)
            if member.filename == 'Contents/section0.xml':
                assert data.count(b'</hs:sec>') == 1
                data = data.replace(b'</hs:sec>', body + b'</hs:sec>')
            if mode == 'master' and member.filename == 'Contents/content.hpf':
                data = data.replace(b'</opf:manifest>',
                    b'<opf:item id="mp0" href="Contents/masterpage0.xml" media-type="application/xml"/></opf:manifest>')
            if mode == 'second' and member.filename == 'Contents/content.hpf':
                data = data.replace(b'</opf:manifest>',
                    b'<opf:item id="section1" href="Contents/section1.xml" media-type="application/xml"/></opf:manifest>')
                data = data.replace(b'</opf:spine>', b'<opf:itemref idref="section1"/></opf:spine>')
            if mode == 'second' and member.filename == 'Contents/header.xml':
                data = data.replace(b'secCnt="1"', b'secCnt="2"')
            dst.writestr(copy.copy(member), data)
        if mode == 'master':
            dst.writestr('Contents/masterpage0.xml', b'<masterPage id="mp0"/>')
        if mode == 'second':
            section0 = src.read('Contents/section0.xml')
            dst.writestr('Contents/section1.xml', section0[:section0.index(b'<hp:p ')] + body + b'</hs:sec>')
sys.stdout.buffer.write(result.getvalue())
`;
const paragraph = (id: number, body: string) =>
  `<hp:p id="${id}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0">${body}</hp:run></hp:p>`;
const text = (value: string) => `<hp:t>${value}</hp:t>`;
const begin = (id: number, name: string | null, kind = 'CLICK_HERE', editable = '') =>
  `<hp:ctrl><hp:fieldBegin id="${id}" type="${kind}"${name === null ? '' : ` name="${name}"`}${editable}/></hp:ctrl>`;
const end = (id: number) => `<hp:ctrl><hp:fieldEnd beginIDRef="${id}"/></hp:ctrl>`;
const field = (id: number, name: string | null, value: string, kind?: string, editable?: string) =>
  begin(id, name, kind, editable) + text(value) + end(id);
const zipWith = (body: string, mode = '') =>
  new Uint8Array(execFileSync('python3', ['-I', '-c', zip, body, mode], { input: blank }));
const bytes = zipWith(
  paragraph(
    1,
    text('A') + field(11, '금&amp;액', '😀') + text('B') + field(12, '금&amp;액', '') + text('C'),
  ) +
    paragraph(2, field(13, '보호', 'date', 'DATE', ' editable="0"')) +
    paragraph(3, field(14, '', '빈 이름') + field(15, null, '이름 없음')),
);

test('named fields HWPX SDK inventories real ZIP names and optional native location proof', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(bytes);
    const result = sdk.namedFields();
    assert.equal(result.coverage, 'complete');
    assert.deepEqual(
      result.rows.map((row) => row.name),
      ['금&액', '금&액', '보호', '', null],
    );
    assert.deepEqual(result.rows[0].value, { status: 'available', text: '😀' });
    assert.deepEqual(result.rows[1].value, { status: 'available', text: '' });
    assert.equal(result.rows[2].protection, 'protected');
    assert.equal(result.rows[2].location, null);
    assert.equal(result.rows[0].location.paragraph, 1);
    assert.equal(result.projectionViews[0].text, 'A😀BC');
    assert.deepEqual(sdk.save(), bytes);
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
  test(`named fields real HWPX file → ${label} → Core lists, resolves and navigates`, async () => {
    const editor = createEditor({ runtimeFactory: factory() });
    try {
      await editor.load(bytes, { format: 'hwpx', editable: false });
      const state = editor.getEditorState();
      const inventory = await editor.listNamedFields();
      assert.equal(inventory.coverage, 'complete');
      assert.deepEqual(
        inventory.rows.map((row) => row.name),
        ['금&액', '금&액', '보호', '', null],
      );
      assert.equal((await editor.readNamedField({ name: '금&액' })).status, 'ambiguous');
      assert.deepEqual(await editor.readNamedField({ name: 'absent' }), { status: 'missing' });
      const protectedResult = await editor.moveToNamedField({ name: '보호' });
      assert.equal(protectedResult.status, 'unavailable');
      assert.equal(editor.getEditorState(), state);
      const moved = await editor.moveToNamedField({ name: '금&액', occurrence: 0 });
      assert.equal(moved.status, 'moved');
      const selection = editor.getEditorState().selection as SelectionTarget;
      assert.deepEqual(
        [
          selection.owner,
          selection.section,
          selection.paragraph,
          selection.startUnit,
          selection.endUnit,
        ],
        ['section:0:body', 0, 1, 1, 3],
      );
      const empty = await editor.moveToNamedField({ name: '금&액', occurrence: 1 });
      assert.equal(empty.status, 'moved');
      if (empty.status === 'moved')
        assert.deepEqual(empty.field.value, { status: 'available', text: '' });
      const caret = editor.getEditorState().selection as SelectionTarget;
      assert.deepEqual([caret.startUnit, caret.endUnit], [4, 4]);
      assert.equal(editor.getEditorState().operationRevision, state.operationRevision);
      assert.equal(editor.getEditorState().nativeHistoryRevision, state.nativeHistoryRevision);
      assert.deepEqual((await editor.save()).bytes, bytes);
    } finally {
      await editor.dispose();
    }
  });
}

test('named fields reads the current label after an existing text edit and undo', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    await editor.load(bytes, { format: 'hwpx', editable: true });
    const first = await editor.moveToNamedField({ name: '금&액', occurrence: 0 });
    assert.equal(first.status, 'moved');
    if (first.status !== 'moved') return;
    const target = first.field.target!;
    const result = await editor.dispatchCommand(SPLICE_TEXT_COMMAND, { target, text: '바뀜😀' });
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    const changed = await editor.readNamedField({ name: '금&액', occurrence: 0 });
    assert.equal(changed.status, 'found');
    if (changed.status === 'found') {
      assert.deepEqual(changed.field.value, { status: 'available', text: '바뀜😀' });
      assert.equal(changed.field.target?.endUnit, 5);
    }
    await assert.rejects(editor.listNamedFields({ token: target }), /StaleTarget/);
    await editor.undo();
    const restored = await editor.readNamedField({ name: '금&액', occurrence: 0 });
    assert.equal(restored.status, 'found');
    if (restored.status === 'found')
      assert.deepEqual(restored.field.value, { status: 'available', text: '😀' });
    assert.deepEqual((await editor.save()).bytes, bytes);
    await editor.redo();
    const redone = await editor.readNamedField({ name: '금&액', occurrence: 0 });
    assert.equal(redone.status, 'found');
    if (redone.status === 'found')
      assert.deepEqual(redone.field.value, { status: 'available', text: '바뀜😀' });
  } finally {
    await editor.dispose();
  }
});

test('named fields keeps unclosed HWPX identity unknown and switches to the HWP5 inventory', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const unclosed = zipWith(paragraph(1, begin(11, 'unclosed') + text('tail')));
    await editor.load(unclosed, { format: 'hwpx', editable: false });
    const result = await editor.readNamedField({ name: 'unclosed' });
    assert.equal(result.status, 'found');
    if (result.status === 'found') {
      assert.deepEqual(result.field.value, { status: 'unavailable' });
      assert.equal(result.field.target, null);
    }
    const hwp5 = await createNewDocumentBytes(wasmModule, 'hwp5');
    await editor.load(hwp5, { format: 'hwp5', editable: false });
    const otherFormat = await editor.listNamedFields();
    assert.equal(otherFormat.format, 'hwp5');
    assert.deepEqual(otherFormat.rows, []);
  } finally {
    await editor.dispose();
  }
});

test('named fields retains a native value when clipping removes its display target', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const input = zipWith(paragraph(1, text('LONG_SENTINEL') + field(11, 'clipped', 'tail')));
    await editor.load(input, { format: 'hwpx', editable: false });
    const found = await editor.readNamedField({ name: 'clipped' });
    assert.equal(found.status, 'found');
    if (found.status === 'found') {
      assert.deepEqual(found.field.value, { status: 'available', text: 'tail' });
      assert.equal(found.field.target, null);
    }
    assert.equal((await editor.moveToNamedField({ name: 'clipped' })).status, 'unavailable');
  } finally {
    await editor.dispose();
  }
});

test('named fields marks a package with an uninspected declared master page partial', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    const input = zipWith(paragraph(1, field(11, 'body', 'body value')), 'master');
    await editor.load(input, { format: 'hwpx', editable: false });
    const inventory = await editor.listNamedFields();
    assert.equal(inventory.coverage, 'partial');
    assert.equal(inventory.rows[0].name, 'body');
    assert.deepEqual(await editor.readNamedField({ name: 'body' }), { status: 'incomplete' });
    assert.deepEqual(await editor.moveToNamedField({ name: 'missing' }), { status: 'incomplete' });
  } finally {
    await editor.dispose();
  }
});

test('named fields carries global HWPX paragraph identity across section boundaries', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const input = zipWith(paragraph(1, field(11, 'both sections', '😀')), 'second');
    await editor.load(input, { format: 'hwpx', editable: false });
    const inventory = await editor.listNamedFields();
    assert.equal(inventory.coverage, 'complete');
    assert.deepEqual(
      inventory.rows.map((row) => [row.target?.section, row.target?.paragraph]),
      [
        [0, 1],
        [1, 2],
      ],
    );
    const move = await editor.moveToNamedField({ name: 'both sections', occurrence: 1 });
    assert.equal(move.status, 'moved');
    const target = editor.getEditorState().selection as SelectionTarget;
    assert.deepEqual(
      [target.owner, target.section, target.paragraph, target.endUnit],
      ['section:1:body', 1, 2, 2],
    );
  } finally {
    await editor.dispose();
  }
});

test('named fields leaves a multi-paragraph field value unknown instead of exposing its first fragment', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const input = zipWith(
      paragraph(1, begin(11, 'wide') + text('first')) + paragraph(2, text('second') + end(11)),
    );
    await editor.load(input, { format: 'hwpx', editable: false });
    const found = await editor.readNamedField({ name: 'wide' });
    assert.equal(found.status, 'found');
    if (found.status === 'found') {
      assert.deepEqual(found.field.value, { status: 'unavailable' });
      assert.equal(found.field.target, null);
    }
  } finally {
    await editor.dispose();
  }
});

const writeBody =
  paragraph(
    1,
    text('A') +
      field(11, 'amount', '😀', 'CLICK_HERE', ' editable="1"') +
      text('B') +
      field(12, 'amount', '', 'CLICK_HERE', ' editable="1"') +
      text('C'),
  ) +
  paragraph(2, field(13, 'locked', '고정', 'CLICK_HERE', ' editable="0"')) +
  paragraph(3, field(14, 'implicit', '미지정'));
const writeInput = zipWith(writeBody);
const setValue = (
  editor: HeadlessEditor,
  selector: NamedFieldSelector,
  expectedValue: string,
  text: string,
) => {
  const state = editor.getEditorState();
  return editor.dispatchCommand(SET_NAMED_FIELD_VALUE_COMMAND, {
    selector,
    token: state.token,
    selectionVersion: state.stateVersion,
    expectedValue,
    text,
  });
};
const inspectWrite = `
import base64, io, json, sys, xml.etree.ElementTree as ET, zipfile
p = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
with zipfile.ZipFile(io.BytesIO(base64.b64decode(sys.stdin.buffer.read()))) as z:
    section = ET.fromstring(z.read('Contents/section0.xml'))
    values = []
    active = None
    exterior = []
    for element in section.iter():
        if element.tag == p + 'fieldBegin':
            assert active is None
            active = [element.get('id'), element.get('name'), element.get('editable'), '']
        if element.tag == p + 't':
            value = element.text or ''
            if active is not None:
                active[3] += value
            else:
                exterior.append(value)
        if element.tag == p + 'fieldEnd':
            assert element.get('beginIDRef') == active[0]
            values.append(active)
            active = None
    assert active is None
    print(json.dumps([values, ''.join(exterior), {n: base64.b64encode(z.read(n)).decode()
        for n in z.namelist() if n != 'Contents/section0.xml'}]))
`;
const inspect = (bytes: Uint8Array) =>
  JSON.parse(
    execFileSync('python3', ['-I', '-c', inspectWrite], {
      input: Buffer.from(bytes).toString('base64'),
    }).toString(),
  );

for (const [label, factory] of [
  ['ReaderRuntime', reader],
  ['Worker', worker],
] as const) {
  test(`named field write R4 ${label} uses one history change and byte-exact undo and redo`, async () => {
    const editor = createEditor({ runtimeFactory: factory() });
    try {
      await editor.load(writeInput, { format: 'hwpx', editable: true });
      const inventory = await editor.listNamedFields();
      assert.deepEqual(
        inventory.rows.map((row) => row.canSetValue),
        [true, true, false, false],
      );
      const start = editor.getEditorState();
      const selector = { name: 'amount', occurrence: 1 };
      const command = await setValue(editor, selector, '', '새😀<&');
      assert.equal(command.status, 'committed-with-snapshot', command.error);
      assert.equal(editor.getEditorState().nativeHistoryRevision, start.nativeHistoryRevision! + 1);
      const found = await editor.readNamedField(selector);
      assert.equal(found.status, 'found');
      if (found.status === 'found')
        assert.deepEqual(found.field.value, { status: 'available', text: '새😀<&' });
      const saved = (await editor.save()).bytes;
      const [originalValues, originalExterior, originalOtherParts] = inspect(writeInput);
      const [savedValues, savedExterior, savedOtherParts] = inspect(saved);
      assert.deepEqual(
        savedValues,
        originalValues.map((row: string[]) =>
          row[0] === '12' ? [...row.slice(0, 3), '새😀<&'] : row,
        ),
      );
      assert.equal(savedExterior, originalExterior);
      assert.deepEqual(savedOtherParts, originalOtherParts);

      assert.equal((await editor.undo()).status, 'committed-with-snapshot');
      assert.deepEqual((await editor.save()).bytes, writeInput);
      const beforeNoop = editor.getEditorState();
      assert.equal((await setValue(editor, selector, '', '')).status, 'known-no-op');
      assert.equal(editor.getEditorState(), beforeNoop);
      assert.equal((await editor.redo()).status, 'committed-with-snapshot');
      assert.deepEqual((await editor.save()).bytes, saved);

      assert.equal(
        (await setValue(editor, selector, '새😀<&', '')).status,
        'committed-with-snapshot',
      );
      const erased = (await editor.save()).bytes;
      assert.deepEqual(inspect(erased)[0], originalValues);
      await editor.undo();
      assert.deepEqual((await editor.save()).bytes, saved);
      await editor.redo();
      assert.deepEqual((await editor.save()).bytes, erased);
    } finally {
      await editor.dispose();
    }
  });
}

test('named field write R4 rejects duplicate, protected, unproved, stale and malformed requests', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    await editor.load(writeInput, { format: 'hwpx', editable: true });
    const before = editor.getEditorState();
    const valid = { name: 'amount', occurrence: 0 };
    for (const [selector, expected, text, error] of [
      [{ name: 'amount' }, '😀', 'new', 'AmbiguousNamedField'],
      [{ name: 'amount', occurrence: 2 }, '', 'new', 'NamedFieldMissing'],
      [{ name: 'locked' }, '고정', 'new', 'NamedFieldProtected'],
      [{ name: 'implicit' }, '미지정', 'new', 'NamedFieldValueUnavailable'],
      [valid, 'not current', 'new', 'NamedFieldValueMismatch'],
      [valid, '😀', '\n', 'InvalidNamedFieldValueCommand'],
      [valid, '😀', '\u2028', 'InvalidNamedFieldValueCommand'],
      [valid, '😀', '\ud800', 'InvalidNamedFieldValueCommand'],
    ] as const) {
      const result = await setValue(editor, selector, expected, text);
      assert.equal(result.status, 'rejected-unapplied');
      assert.equal(result.error, error);
      assert.equal(editor.getEditorState(), before);
    }
    await editor.setSelection(null);
    const changed = editor.getEditorState();
    const stale = await editor.dispatchCommand(SET_NAMED_FIELD_VALUE_COMMAND, {
      selector: valid,
      token: before.token,
      selectionVersion: before.stateVersion,
      expectedValue: '😀',
      text: 'new',
    });
    assert.equal(stale.error, 'StaleNamedFieldSelection');
    assert.equal(editor.getEditorState(), changed);
    assert.throws(
      () =>
        editor.requestExperimental(
          {
            kind: 'set-named-field-value',
            id: 'hwpx:0:9999',
            name: 'amount',
            occurrence: 0,
            section: 0,
            paragraph: 1,
            startUnit: 1,
            endUnit: 3,
            expectedValue: '😀',
            text: 'new',
          },
          { token: changed.token, mutation: true },
        ),
      /UseTypedEditorOperation/,
    );
    assert.equal(editor.getEditorState(), changed);
    assert.deepEqual((await editor.save()).bytes, writeInput);

    await editor.load(writeInput, { format: 'hwpx', editable: true });
    const staleDocument = await editor.dispatchCommand(SET_NAMED_FIELD_VALUE_COMMAND, {
      selector: valid,
      token: changed.token,
      selectionVersion: changed.stateVersion,
      expectedValue: '😀',
      text: 'new',
    });
    assert.equal(staleDocument.error, 'StaleTarget');
    assert.deepEqual((await editor.save()).bytes, writeInput);
  } finally {
    await editor.dispose();
  }
});

test('named field write R4 rejects incomplete inventory and leaves read-only and HWP5 gates in force', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    const partial = zipWith(writeBody, 'master');
    await editor.load(partial, { format: 'hwpx', editable: true });
    const selector = { name: 'amount', occurrence: 0 };
    assert.equal(
      (await setValue(editor, selector, '😀', 'new')).error,
      'IncompleteNamedFieldInventory',
    );
    assert.deepEqual((await editor.save()).bytes, partial);
    await editor.load(writeInput, { format: 'hwpx', editable: false });
    assert.equal((await setValue(editor, selector, '😀', 'new')).error, 'ReadOnlyDocument');
    assert.deepEqual((await editor.save()).bytes, writeInput);
    const hwp5 = await createNewDocumentBytes(wasmModule, 'hwp5');
    await editor.load(hwp5, { format: 'hwp5', editable: true });
    assert.equal(
      (await setValue(editor, selector, '😀', 'new')).error,
      'NamedFieldValueUnavailable',
    );
    assert.deepEqual((await editor.save()).bytes, hwp5);
  } finally {
    await editor.dispose();
  }
});

test('named field write R4 rechecks identity and history inside the actual runtime', async () => {
  const runtime = await reader()();
  try {
    const loaded = await runtime.request({ kind: 'load', format: 'hwpx', bytes: writeInput });
    assert.equal(loaded.error, undefined);
    const request = {
      kind: 'set-named-field-value',
      id: 'hwpx:0:9999',
      name: 'amount',
      occurrence: 0,
      section: 0,
      paragraph: 1,
      startUnit: 1,
      endUnit: 3,
      expectedValue: '😀',
      text: 'new',
    };
    assert.equal((await runtime.request(request)).error, 'HistoryNotEnabled');
    assert.equal((await runtime.request({ kind: 'enable' })).error, undefined);
    const rejected = await runtime.request(request);
    assert.equal(rejected.error, 'StaleNamedFieldTarget');
    assert.equal(rejected.meta?.application, 'unapplied');
    assert.equal(
      (await runtime.request({ ...request, occurrence: undefined })).error,
      'AmbiguousNamedField',
    );
    assert.deepEqual((await runtime.request({ kind: 'save' })).bytes, writeInput);
  } finally {
    await runtime.dispose();
  }
});

test('named field write R4 rechecks the selection after composition settlement', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    await editor.load(writeInput, { format: 'hwpx', editable: true });
    const surface = editor.acquireInputSurface({
      async commitComposition() {
        await surface.publishSelection(null);
        return 'unchanged';
      },
      cancelComposition() {},
    });
    try {
      const stale = await setValue(editor, { name: 'amount', occurrence: 0 }, '😀', 'new');
      assert.equal(stale.status, 'rejected-unapplied');
      assert.equal(stale.error, 'StaleNamedFieldSelection');
    } finally {
      surface.release();
    }
    assert.deepEqual((await editor.save()).bytes, writeInput);
  } finally {
    await editor.dispose();
  }
});

test('named field write R4 keeps default worker fencing separate from native authority', async () => {
  const standard = await worker()();
  const custom = await createWorkerRuntimeFactory({
    wasmModule,
    workerURL: new URL('../../src/worker.js', import.meta.url),
  })();
  try {
    for (const runtime of [standard, custom]) {
      const loaded = await runtime.request({ kind: 'load', format: 'hwpx', bytes: writeInput });
      assert.equal(loaded.error, undefined);
      assert.equal(hasRuntimeAdmission(runtime), false);
      assert.equal(hasRuntimeAdmission(runtime, 'independent-text'), false);
    }
    assert.equal(hasRuntimeAdmission(standard, 'set-named-field-value'), true);
    assert.equal(hasRuntimeAdmission(custom, 'set-named-field-value'), false);
  } finally {
    await standard.dispose();
    await custom.dispose();
  }
});

const renameField = (editor: HeadlessEditor, selector: NamedFieldSelector, newName: string) => {
  const state = editor.getEditorState();
  return editor.dispatchCommand(RENAME_NAMED_FIELD_COMMAND, {
    selector,
    newName,
    token: state.token,
    selectionVersion: state.stateVersion,
  });
};

function verifyRenameXml(before: Uint8Array, after: Uint8Array, name: string) {
  const oracle = `
import base64, io, json, sys, zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
request = json.load(sys.stdin)
section = 'Contents/section0.xml'
def read(field):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(request[field]))) as z:
        return {name: z.read(name) for name in z.namelist()}
before, after = read('before'), read('after')
assert before.keys() == after.keys()
assert {k: v for k, v in before.items() if k != section} == {k: v for k, v in after.items() if k != section}
needle = b'<hp:fieldBegin id="12" type="CLICK_HERE" name="amount"'
assert before[section].count(needle) == 1
name = escape(request['name'], {chr(34): '&quot;', chr(9): '&#9;'}).encode()
assert after[section] == before[section].replace(needle, needle[:-len(b'amount"')] + name + b'"')
ns = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
root = ET.fromstring(after[section])
begins = {node.get('id'): node.get('name') for node in root.iter(ns + 'fieldBegin')}
assert begins == {'11': 'amount', '12': request['name'], '13': 'locked', '14': 'implicit'}
assert [node.get('beginIDRef') for node in root.iter(ns + 'fieldEnd')] == ['11', '12', '13', '14']
`;
  execFileSync('python3', ['-I', '-c', oracle], {
    input: JSON.stringify({
      before: Buffer.from(before).toString('base64'),
      after: Buffer.from(after).toString('base64'),
      name,
    }),
  });
}

const renamed = '새😀&<"\'\t';
for (const [label, factory] of [
  ['ReaderRuntime', reader],
  ['Worker', worker],
] as const) {
  test(`named field rename ${label} uses one history entry and changes only the selected XML attribute`, async () => {
    const editor = createEditor({ runtimeFactory: factory() });
    try {
      await editor.load(writeInput, { format: 'hwpx', editable: true });
      const before = editor.getEditorState();
      const source = { name: 'amount', occurrence: 1 };
      const result = await renameField(editor, source, renamed);
      assert.equal(result.status, 'committed-with-snapshot', result.error);
      assert.equal(
        editor.getEditorState().nativeHistoryRevision,
        before.nativeHistoryRevision! + 1,
      );
      assert.deepEqual(
        (await editor.listNamedFields()).rows.map((r) => r.name),
        ['amount', renamed, 'locked', 'implicit'],
      );
      const found = await editor.readNamedField({ name: renamed });
      assert.equal(found.status, 'found');
      if (found.status === 'found')
        assert.deepEqual(found.field.value, { status: 'available', text: '' });
      assert.equal((await editor.moveToNamedField({ name: renamed })).status, 'moved');
      const saved = (await editor.save()).bytes;
      verifyRenameXml(writeInput, saved, renamed);

      assert.equal((await editor.undo()).status, 'committed-with-snapshot');
      assert.deepEqual((await editor.save()).bytes, writeInput);
      const restored = editor.getEditorState();
      assert.equal((await renameField(editor, source, 'amount')).status, 'known-no-op');
      assert.equal(editor.getEditorState(), restored);
      assert.equal((await editor.redo()).status, 'committed-with-snapshot');
      assert.deepEqual((await editor.save()).bytes, saved);
      await editor.load(saved, { format: 'hwpx', editable: true });
      assert.equal((await editor.readNamedField({ name: renamed })).status, 'found');
    } finally {
      await editor.dispose();
    }
  });
}

test('named field rename preserves unsaved value and dirty metadata in the same source section', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    await editor.load(writeInput, { format: 'hwpx', editable: true });
    const source = { name: 'amount', occurrence: 1 };
    assert.equal((await setValue(editor, source, '', '기존😀')).status, 'committed-with-snapshot');
    const before = (await editor.save()).bytes;
    assert.equal((await renameField(editor, source, renamed)).status, 'committed-with-snapshot');
    const found = await editor.readNamedField({ name: renamed });
    assert.equal(found.status, 'found');
    if (found.status === 'found')
      assert.deepEqual(found.field.value, { status: 'available', text: '기존😀' });
    verifyRenameXml(before, (await editor.save()).bytes, renamed);
    await editor.undo();
    assert.deepEqual((await editor.save()).bytes, before);
    await editor.undo();
    assert.deepEqual((await editor.save()).bytes, writeInput);
  } finally {
    await editor.dispose();
  }
});

test('named field rename rejects ambiguous, protected, duplicate destination and stale requests', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    await editor.load(writeInput, { format: 'hwpx', editable: true });
    const state = editor.getEditorState();
    const source = { name: 'amount', occurrence: 1 };
    for (const [selector, newName, error] of [
      [{ name: 'amount' }, 'valid', 'AmbiguousNamedField'],
      [source, 'locked', 'DuplicateNamedFieldName'],
      [{ name: 'locked' }, 'valid', 'NamedFieldProtected'],
      [{ name: 'implicit' }, 'valid', 'NamedFieldRenameUnavailable'],
      [{ name: 'absent' }, 'valid', 'NamedFieldMissing'],
      [source, '', 'InvalidNamedFieldName'],
      [source, '\u0000', 'InvalidXmlCharacter'],
    ] as const) {
      const rejected = await renameField(editor, selector, newName);
      assert.equal(rejected.status, 'rejected-unapplied', rejected.error);
      assert.equal(rejected.error, error);
      assert.equal(editor.getEditorState(), state);
    }
    await editor.setSelection(null);
    const stale = await editor.dispatchCommand(RENAME_NAMED_FIELD_COMMAND, {
      selector: source,
      newName: 'valid',
      token: state.token,
      selectionVersion: state.stateVersion,
    });
    assert.equal(stale.error, 'StaleNamedFieldSelection');
    assert.deepEqual((await editor.save()).bytes, writeInput);
    await editor.load(writeInput, { format: 'hwpx', editable: true });
    const staleDocument = await editor.dispatchCommand(RENAME_NAMED_FIELD_COMMAND, {
      selector: source,
      newName: 'valid',
      token: state.token,
      selectionVersion: state.stateVersion,
    });
    assert.equal(staleDocument.error, 'StaleTarget');
    const partial = zipWith(writeBody, 'master');
    await editor.load(partial, { format: 'hwpx', editable: true });
    assert.equal(
      (await renameField(editor, source, 'valid')).error,
      'IncompleteNamedFieldInventory',
    );
    assert.deepEqual((await editor.save()).bytes, partial);
    await editor.load(writeInput, { format: 'hwpx', editable: false });
    assert.equal((await renameField(editor, source, 'valid')).error, 'ReadOnlyDocument');
  } finally {
    await editor.dispose();
  }
});

test('named field rename SDK checks history, current source spelling and destination independently', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(writeInput);
    const target = sdk.namedFields().rows[1].location;
    const rename = (oldName: string, name: string) =>
      sdk.renameNamedField(
        target.section,
        target.paragraph + 1,
        target.beginElement,
        oldName,
        name,
      );
    assert.throws(() => rename('amount', 'valid'), /HistoryNotEnabled/);
    sdk.enableHistoryDefault();
    assert.throws(() => rename('stale', 'valid'), /StaleNamedFieldTarget/);
    assert.throws(() => rename('amount', 'locked'), /DuplicateNamedFieldName/);
    assert.equal(rename('amount', 'amount'), false);
    assert.deepEqual(sdk.save(), writeInput);
  } finally {
    sdk.close();
  }
});

test('named field rename retains byte-exact undo and redo through explicit legacy history', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(writeInput);
    sdk.enableHistory();
    assert.equal(sdk.historyStats().protocolVersion, 1);
    const location = sdk.namedFields().rows[1].location;
    assert.equal(
      sdk.renameNamedField(
        location.section,
        location.paragraph + 1,
        location.beginElement,
        'amount',
        renamed,
      ),
      true,
    );
    const saved = sdk.save();
    verifyRenameXml(writeInput, saved, renamed);
    assert.equal(sdk.undo(), true);
    assert.deepEqual(sdk.save(), writeInput);
    assert.equal(sdk.redo(), true);
    assert.deepEqual(sdk.save(), saved);
  } finally {
    sdk.close();
  }
});

test('named field rename resolves duplicate occurrence across sections with global paragraph coordinates', async () => {
  const editor = createEditor({ runtimeFactory: reader() });
  try {
    const input = zipWith(
      paragraph(1, field(11, 'both', 'value', 'CLICK_HERE', ' editable="1"')),
      'second',
    );
    await editor.load(input, { format: 'hwpx', editable: true });
    assert.deepEqual(
      (await editor.listNamedFields()).rows.map((row) => [
        row.name,
        row.target?.section,
        row.target?.paragraph,
      ]),
      [
        ['both', 0, 1],
        ['both', 1, 2],
      ],
    );
    const renamed = await renameField(editor, { name: 'both', occurrence: 1 }, 'second');
    assert.equal(renamed.status, 'committed-with-snapshot', renamed.error);
    assert.deepEqual(
      (await editor.listNamedFields()).rows.map((row) => [
        row.name,
        row.target?.section,
        row.target?.paragraph,
      ]),
      [
        ['both', 0, 1],
        ['second', 1, 2],
      ],
    );
    await editor.undo();
    assert.deepEqual((await editor.save()).bytes, input);
  } finally {
    await editor.dispose();
  }
});

const createInput = zipWith(
  paragraph(21, text('앞😀&amp;뒤 tail')) +
    paragraph(22, text('next')) +
    paragraph(
      23,
      text('A') + field(41, 'locked-create', 'LOCK', 'CLICK_HERE', ' editable="0"') + text('B'),
    ) +
    paragraph(24, text('')),
);
const createdName = '신규😀&<"';
function fieldCreation(
  editor: HeadlessEditor,
  paragraph: number,
  startUnit: number,
  endUnit: number,
  expectedText: string,
  name: string,
) {
  const state = editor.getEditorState();
  return {
    target: createParagraphSelection(state, { section: 0, paragraph, startUnit, endUnit }),
    selectionVersion: state.stateVersion,
    expectedText,
    name,
  };
}
function verifyCreateXml(before: Uint8Array, first: Uint8Array, second: Uint8Array) {
  const oracle = `
import base64, io, json, sys, zipfile
from xml.etree import ElementTree as ET
request = json.load(sys.stdin)
section = 'Contents/section0.xml'
ns = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def read(field):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(request[field]))) as z:
        return {n: z.read(n) for n in z.namelist()}
def tag(name):
    return ns + name
def row(parts, ident):
    return next(p for p in ET.fromstring(parts[section]).findall(tag('p')) if p.get('id') == ident)
def value(node):
    return node.text or ''
def markers(run):
    return [child[0] if child.tag == tag('ctrl') else child for child in run]
original, first, second = (read(key) for key in ('before','first','second'))
for changed in (first, second):
    assert original.keys() == changed.keys()
    assert all(changed[k] == original[k] for k in original if k != section)
    assert ET.tostring(row(changed, '23')) == ET.tostring(row(original, '23'))
    old_run = row(original, '21').find(tag('run'))
    run = row(changed, '21').find(tag('run'))
    assert run.attrib == old_run.attrib
    assert ''.join(value(t) for t in run.findall(tag('t'))) == value(old_run[0])
    nodes = markers(run)
    assert value(nodes[0]) == '앞'
    assert nodes[1].tag == tag('fieldBegin') and nodes[1].get('name') == request['name']
    assert nodes[1].get('type') == 'CLICK_HERE'
    assert nodes[1].get('editable') == '1' and nodes[1].get('dirty') == '1'
    assert nodes[1].get('zorder') == '-1'
    assert value(nodes[2]) == '😀&'
    assert nodes[3].tag == tag('fieldEnd') and nodes[3].get('beginIDRef') == nodes[1].get('id')
    assert int(nodes[1].get('id')) == 42
    assert int(nodes[1].get('fieldid')) == int.from_bytes(b'%clk', 'big')
    assert nodes[3].get('fieldid') == nodes[1].get('fieldid')
    def units(text):
        return len(text.encode('utf-16-le')) // 2
    for begin in run.iter(tag('fieldBegin')):
        params, = list(begin)
        assert params.tag == tag('parameters') and params.get('name') == ''
        assert int(params.get('cnt')) == len(params) == 4
        assert [p.get('name') for p in params] == ['Prop','Command','Direction','HelpState']
        assert params[0].tag == tag('integerParam') and value(params[0]) == '9'
        assert all(p.tag == tag('stringParam') for p in params[1:])
        direction, memo = ('안내 😀&<', '도움말 <&' + chr(13)) if begin is nodes[1] else ('','')
        assert (value(params[2]), value(params[3])) == (direction, memo)
        payload = f'Direction:wstring:{units(direction)}:{direction} HelpState:wstring:{units(memo)}:{memo} '
        assert value(params[1]) == f'Clickhere:set:{units(payload)}:{payload} '
        assert params[1].get('{http://www.w3.org/XML/1998/namespace}space') == 'preserve'
nodes = markers(row(second, '21').find(tag('run')))
assert [n.tag for n in nodes] == list(map(tag, ['t','fieldBegin','t','fieldEnd','t','fieldBegin','t','fieldEnd','t']))
assert value(nodes[4]) == '뒤 ' and value(nodes[6]) == '' and value(nodes[8]) == 'tail'
assert nodes[5].get('name') == 'empty-create' and nodes[5].get('dirty') == '0'
assert nodes[5].get('id') == nodes[7].get('beginIDRef') == '43'
assert nodes[5].get('fieldid') == nodes[7].get('fieldid') == nodes[1].get('fieldid')
`;
  execFileSync('python3', ['-I', '-c', oracle], {
    input: JSON.stringify({
      before: Buffer.from(before).toString('base64'),
      first: Buffer.from(first).toString('base64'),
      second: Buffer.from(second).toString('base64'),
      name: createdName,
    }),
  });
}

for (const [label, factory] of [
  ['ReaderRuntime', reader],
  ['Worker', worker],
] as const) {
  test(`named field create ${label} wraps exact styled text and repeats at a caret under HistoryV2`, async () => {
    const editor = createEditor({ runtimeFactory: factory() });
    try {
      await editor.load(createInput, { format: 'hwpx', editable: true });
      const before = editor.getEditorState();
      const first = {
        ...fieldCreation(editor, 1, 1, 4, '😀&', createdName),
        direction: '안내 😀&<',
        memo: '도움말 <&\r',
      };
      const result = await editor.dispatchCommand(CREATE_NAMED_FIELD_COMMAND, first);
      assert.equal(result.status, 'committed-with-snapshot', result.error);
      assert.equal(
        editor.getEditorState().nativeHistoryRevision,
        before.nativeHistoryRevision! + 1,
      );
      const firstBytes = (await editor.save()).bytes;
      const stale = await editor.dispatchCommand(CREATE_NAMED_FIELD_COMMAND, {
        ...first,
        name: 'stale',
      });
      assert.equal(stale.status, 'rejected-unapplied');
      assert.match(stale.error!, /Stale/);
      const second = await editor.dispatchCommand(
        CREATE_NAMED_FIELD_COMMAND,
        fieldCreation(editor, 1, 6, 6, '', 'empty-create'),
      );
      assert.equal(second.status, 'committed-with-snapshot', second.error);
      assert.equal(
        editor.getEditorState().nativeHistoryRevision,
        before.nativeHistoryRevision! + 2,
      );
      assert.equal((await editor.moveToNamedField({ name: 'empty-create' })).status, 'moved');
      const rows = (await editor.listNamedFields()).rows;
      assert.deepEqual(
        rows.map((r) => [r.name, r.canSetValue, r.value]),
        [
          [createdName, true, { status: 'available', text: '😀&' }],
          ['empty-create', true, { status: 'available', text: '' }],
          ['locked-create', false, { status: 'available', text: 'LOCK' }],
        ],
      );
      const secondBytes = (await editor.save()).bytes;
      verifyCreateXml(createInput, firstBytes, secondBytes);
      const artifacts = { input: createInput, first: firstBytes, second: secondBytes };
      const history: Record<string, Uint8Array> = {};
      assert.equal((await editor.undo()).status, 'committed-with-snapshot');
      history['undo-first'] = (await editor.save()).bytes;
      assert.deepEqual(history['undo-first'], firstBytes);
      assert.equal((await editor.undo()).status, 'committed-with-snapshot');
      history['undo-input'] = (await editor.save()).bytes;
      assert.deepEqual(history['undo-input'], createInput);
      assert.equal((await editor.redo()).status, 'committed-with-snapshot');
      history['redo-first'] = (await editor.save()).bytes;
      assert.deepEqual(history['redo-first'], firstBytes);
      assert.equal((await editor.redo()).status, 'committed-with-snapshot');
      history['redo-second'] = (await editor.save()).bytes;
      assert.deepEqual(history['redo-second'], secondBytes);
      if (label === 'Worker' && process.env.HWPJS_CREATE_EVIDENCE) {
        for (const [name, bytes] of Object.entries({ ...artifacts, ...history }))
          writeFileSync(`${process.env.HWPJS_CREATE_EVIDENCE}/${name}.hwpx`, bytes);
      }
      await editor.load(secondBytes, { format: 'hwpx', editable: true });
      const filled = await setValue(editor, { name: 'empty-create' }, '', 'filled');
      assert.equal(filled.status, 'committed-with-snapshot', filled.error);
      const found = await editor.readNamedField({ name: 'empty-create' });
      assert.equal(found.status, 'found');
      if (found.status === 'found')
        assert.deepEqual(found.field.value, { status: 'available', text: 'filled' });
      assert.equal((await editor.undo()).status, 'committed-with-snapshot');
      assert.deepEqual((await editor.save()).bytes, secondBytes);
    } finally {
      await editor.dispose();
    }
  });
}

test('named field create rejects duplicate, stale expected, protected, malformed and partial before writes', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(createInput);
    assert.throws(() => sdk.createNamedField(0, 2, 1, 4, '😀&', 'fresh'), /HistoryNotEnabled/);
    sdk.enableHistory();
    assert.throws(
      () => sdk.createNamedField(0, 2, 1, 4, '😀&', 'fresh'),
      /HistoryProtocol2Required/,
    );
    sdk.open(createInput);
    sdk.enableHistoryDefault();
    assert.throws(
      () => sdk.createNamedField(0, 2, 1, 4, '😀&', 'locked-create'),
      /DuplicateNamedFieldName/,
    );
    assert.throws(
      () => sdk.createNamedField(0, 2, 1, 4, 'bad', 'fresh'),
      /NamedFieldValueMismatch/,
    );
    assert.throws(() => sdk.createNamedField(0, 2, 2, 4, 'bad', 'fresh'), /SplitSurrogatePair/);
    assert.throws(() => sdk.createNamedField(0, 4, 1, 5, 'LOCK', 'fresh'), /ProtectedFieldRange/);
    assert.throws(() => sdk.createNamedField(0, 4, 1, 1, '', 'fresh'), /ProtectedFieldRange/);
    assert.throws(() => sdk.createNamedField(0, 2, 1, 4, '😀&', '\u0000'), /InvalidXml/);
    assert.deepEqual(sdk.save(), createInput);
    const partial = zipWith(paragraph(21, text('body')), 'master');
    sdk.open(partial);
    sdk.enableHistoryDefault();
    assert.throws(
      () => sdk.createNamedField(0, 2, 0, 4, 'body', 'fresh'),
      /IncompleteNamedFieldInventory/,
    );
    assert.deepEqual(sdk.save(), partial);
  } finally {
    sdk.close();
  }
});

test('named field create on constructor caret preserves section and column metadata', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    await editor.createDocument({ format: 'hwpx' });
    const result = await editor.dispatchCommand(
      CREATE_NAMED_FIELD_COMMAND,
      fieldCreation(editor, 0, 0, 0, '', 'blank-caret'),
    );
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    const found = await editor.readNamedField({ name: 'blank-caret' });
    assert.equal(found.status, 'found');
    if (found.status === 'found') {
      assert.equal(found.field.canSetValue, true);
      assert.deepEqual(found.field.value, { status: 'available', text: '' });
    }
    const saved = (await editor.save()).bytes;
    assert.equal((await editor.undo()).status, 'committed-with-snapshot');
    assert.deepEqual((await editor.save()).bytes, blank);
    assert.equal((await editor.redo()).status, 'committed-with-snapshot');
    assert.deepEqual((await editor.save()).bytes, saved);
    if (process.env.HWPJS_CREATE_EVIDENCE) {
      writeFileSync(`${process.env.HWPJS_CREATE_EVIDENCE}/blank.hwpx`, blank);
      writeFileSync(`${process.env.HWPJS_CREATE_EVIDENCE}/blank-created.hwpx`, saved);
    }
  } finally {
    await editor.dispose();
  }
});

test('named field create folds current dirty values and repeats without save or reopen', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(createInput);
    sdk.enableHistoryDefault();
    sdk.splice(0, 2, 8, 0, '!');
    assert(sdk.createNamedField(0, 2, 5, 5, '', 'one'));
    const one = sdk.namedFields().rows.find((r) => r.name === 'one')!;
    sdk.spliceFieldLabel(0, 2, one.location!.beginElement, 5, 0, 'X');
    assert(sdk.createNamedField(0, 2, 8, 8, '', 'two'));
    assert.deepEqual(
      sdk
        .namedFields()
        .rows.slice(0, 2)
        .map((r) => r.value),
      [
        { status: 'available', text: 'X' },
        { status: 'available', text: '' },
      ],
    );
    const bytes = sdk.save();
    execFileSync(
      'python3',
      [
        '-I',
        '-c',
        `
import io, sys, zipfile
from xml.etree import ElementTree as ET
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
    section = ET.fromstring(z.read('Contents/section0.xml'))
ns = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
p = next(p for p in section.findall(ns+'p') if p.get('id') == '21')
first, second = p.iter(ns+'fieldBegin')
assert first.get('dirty') == '1' and second.get('dirty') == '0'
assert ''.join(t.text or '' for t in p.iter(ns+'t')) == '앞😀&뒤X ta!il'
`,
      ],
      { input: bytes },
    );
  } finally {
    sdk.close();
  }
});

test('named field create refuses ambiguous site and preserves redo after rejection', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  const input = zipWith(
    paragraph(21, text('ab') + text('cd')) +
      paragraph(22, '<hp:t>q<hp:tab width="4000" leader="0" type="1"/>r</hp:t>') +
      paragraph(23, '<hp:t>z</hp:t>'),
  );
  try {
    sdk.open(input);
    sdk.enableHistoryDefault();
    assert(sdk.createNamedField(0, 4, 0, 1, 'z', 'first'));
    const changed = sdk.save();
    sdk.undo();
    assert.throws(
      () => sdk.createNamedField(0, 2, 2, 2, '', 'ambiguous'),
      /UnsupportedNamedFieldCreateSite/,
    );
    assert.throws(
      () => sdk.createNamedField(0, 2, 1, 3, 'bc', 'cross-site'),
      /UnsupportedNamedFieldCreateSite/,
    );
    assert.throws(
      () => sdk.createNamedField(0, 3, 0, 3, 'q\tr', 'inline'),
      /ProtectedInlineControl/,
    );
    assert.deepEqual(sdk.save(), input);
    sdk.redo();
    assert.deepEqual(sdk.save(), changed);
  } finally {
    sdk.close();
  }
});

test('named field create rejects a nested source owner and exhausted begin ID without writes', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  try {
    const nested = zipWith(
      paragraph(
        21,
        '<hp:tbl id="2"><hp:tr><hp:tc><hp:subList>' +
          paragraph(22, text('nested')) +
          '</hp:subList></hp:tc></hp:tr></hp:tbl>',
      ),
    );
    sdk.open(nested);
    sdk.enableHistoryDefault();
    assert.throws(
      () => sdk.createNamedField(0, 3, 0, 6, 'nested', 'bad-owner'),
      /UnsupportedNamedFieldCreateOwner/,
    );
    assert.deepEqual(sdk.save(), nested);
    const exhausted = zipWith(
      paragraph(21, text('body')) + paragraph(22, field(0xffffffff, 'max-id', 'old')),
    );
    sdk.open(exhausted);
    sdk.enableHistoryDefault();
    assert.throws(() => sdk.createNamedField(0, 2, 0, 4, 'body', 'new'), /NamedFieldIdExhausted/);
    assert.deepEqual(sdk.save(), exhausted);
  } finally {
    sdk.close();
  }
});

const clickCommand = (direction: string, memo: string) => {
  const payload = `Direction:wstring:${direction.length}:${direction} HelpState:wstring:${memo.length}:${memo} `;
  return `Clickhere:set:${payload.length}:${payload} `;
};
const xmlText = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\r', '&#13;');
const propertyBegin = (id: number, name: string, parameters: string, editable = '1') =>
  `<hp:ctrl><hp:fieldBegin id="${id}" type="CLICK_HERE" name="${name}" editable="${editable}" dirty="1" zorder="-1" fieldid="627272811" opaque="keep">${parameters}<hp:metaTag>{"keep":"meta"}</hp:metaTag></hp:fieldBegin></hp:ctrl>`;
const oldDirection = 'old 😀: guide';
const oldMemo = 'help & data';
const propertyParameters =
  '<hp:parameters cnt="5" name="opaque" keep="list">' +
  '<hp:integerParam name="Prop" keep="prop">7</hp:integerParam>' +
  '<hp:stringParam name="Command" xml:space="preserve" keep="cmd">' +
  xmlText(clickCommand(oldDirection, oldMemo)) +
  '</hp:stringParam>' +
  '<hp:stringParam name="Direction" keep="dir">' +
  xmlText(oldDirection) +
  '</hp:stringParam>' +
  '<hp:stringParam name="HelpState" keep="memo">' +
  xmlText(oldMemo) +
  '</hp:stringParam>' +
  '<hp:stringParam name="Opaque" keep="untouched"><![CDATA[unknown <&>]]></hp:stringParam>' +
  '</hp:parameters>';
const parametersInput = zipWith(
  paragraph(
    21,
    text('A') +
      propertyBegin(81, 'props', propertyParameters) +
      text('value😀') +
      end(81) +
      text('B'),
  ) +
    paragraph(
      22,
      propertyBegin(82, 'locked-params', propertyParameters, '0') + text('LOCK') + end(82),
    ) +
    paragraph(23, field(83, 'absent-params', 'empty', 'CLICK_HERE', ' editable="1"')) +
    paragraph(24, propertyBegin(84, 'props', propertyParameters) + text('duplicate') + end(84)),
);

async function setParameters(
  editor: HeadlessEditor,
  selector: NamedFieldSelector,
  expected: { direction: string | null; memo: string | null },
  direction: string,
  memo: string,
) {
  const state = editor.getEditorState();
  return editor.dispatchCommand(SET_NAMED_FIELD_PARAMETERS_COMMAND, {
    selector,
    token: state.token,
    selectionVersion: state.stateVersion,
    expected,
    direction,
    memo,
  });
}

function verifyParameterXml(
  before: Uint8Array,
  after: Uint8Array,
  direction: string,
  memo: string,
) {
  execFileSync(
    'python3',
    [
      '-I',
      '-c',
      `
import base64, io, json, sys, zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape
r = json.load(sys.stdin)
def read(key):
    with zipfile.ZipFile(io.BytesIO(base64.b64decode(r[key]))) as z:
        return {n:z.read(n) for n in z.namelist()}
old, new = read('before'), read('after')
part = 'Contents/section0.xml'
assert old.keys() == new.keys()
assert all(old[k] == new[k] for k in old if k != part)
ns = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
def begin(parts):
    return next(n for n in ET.fromstring(parts[part]).iter(ns+'fieldBegin') if n.get('id') == '81')
a, b = begin(old), begin(new)
assert a.attrib == b.attrib and ET.tostring(a[1]) == ET.tostring(b[1])
assert a[0].attrib == b[0].attrib
assert [p.attrib for p in a[0]] == [p.attrib for p in b[0]]
def units(s): return len(s.encode('utf-16-le'))//2
d, m = r['direction'], r['memo']
payload = f'Direction:wstring:{units(d)}:{d} HelpState:wstring:{units(m)}:{m} '
command = f'Clickhere:set:{units(payload)}:{payload} '
replacements = {}
for oldnode, newnode in zip(a[0], b[0]):
    key = oldnode.get('name')
    if key in ('Direction','HelpState','Command'):
        value = {'Direction':d,'HelpState':m,'Command':command}[key]
        assert newnode.text == value
        replacements[key] = value
    else:
        assert ET.tostring(oldnode) == ET.tostring(newnode)
# Exact XML only differs inside the three selected scalar contents.
original = old[part]
marker = b'<hp:fieldBegin id="81"'
start = original.index(marker)
finish = original.index(b'</hp:fieldBegin>', start) + len(b'</hp:fieldBegin>')
field = original[start:finish]
for key, value in replacements.items():
    element = next(p for p in a[0] if p.get('name') == key)
    left = ('<hp:stringParam name="'+key+'"').encode()
    i = field.index(left)
    body = field.index(b'>', i)+1
    end = field.index(b'</hp:stringParam>',body)
    escaped = escape(value).replace('\\r','&#13;').encode()
    field = field[:body] + escaped + field[end:]
assert new[part] == original[:start] + field + original[finish:]
`,
    ],
    {
      input: JSON.stringify({
        before: Buffer.from(before).toString('base64'),
        after: Buffer.from(after).toString('base64'),
        direction,
        memo,
      }),
    },
  );
}

for (const [label, factory] of [
  ['ReaderRuntime', reader],
  ['Worker', worker],
] as const) {
  test(`named field parameters ${label} edits only selected metadata with one revision exact undo redo and reopen`, async () => {
    const editor = createEditor({ runtimeFactory: factory() });
    try {
      await editor.load(parametersInput, { format: 'hwpx', editable: true });
      const selector = { name: 'props', occurrence: 0 };
      const read = await editor.readNamedFieldParameters(selector);
      assert.equal(read.status, 'found');
      if (read.status !== 'found') throw Error('ExpectedParameters');
      assert.deepEqual(read.parameters, { direction: oldDirection, memo: oldMemo });
      assert.equal(read.canEdit, true);
      const before = editor.getEditorState();
      const direction = '새 😀:<&\r안내';
      const memo = 'help é 한글: memo';
      const result = await setParameters(editor, selector, read.parameters, direction, memo);
      assert.equal(result.status, 'committed-with-snapshot', result.error);
      assert.equal(
        editor.getEditorState().nativeHistoryRevision,
        before.nativeHistoryRevision! + 1,
      );
      const saved = (await editor.save()).bytes;
      verifyParameterXml(parametersInput, saved, direction, memo);
      const value = await editor.readNamedField(selector);
      assert.equal(value.status, 'found');
      if (value.status === 'found')
        assert.deepEqual(value.field.value, { status: 'available', text: 'value😀' });
      const protectedRead = await editor.readNamedFieldParameters({ name: 'locked-params' });
      assert.equal(protectedRead.status, 'found');
      if (protectedRead.status === 'found') {
        assert.equal(protectedRead.canEdit, false);
        assert.deepEqual(protectedRead.parameters, { direction: oldDirection, memo: oldMemo });
      }
      assert.equal((await editor.undo()).status, 'committed-with-snapshot');
      const undoBytes = (await editor.save()).bytes;
      assert.deepEqual(undoBytes, parametersInput);
      const noop = await setParameters(editor, selector, read.parameters, oldDirection, oldMemo);
      assert.equal(noop.status, 'known-no-op', noop.error);
      assert.equal((await editor.redo()).status, 'committed-with-snapshot');
      const redoBytes = (await editor.save()).bytes;
      assert.deepEqual(redoBytes, saved);
      await editor.load(saved, { format: 'hwpx', editable: true });
      const reopened = await editor.readNamedFieldParameters(selector);
      assert.equal(reopened.status, 'found');
      if (reopened.status === 'found') assert.deepEqual(reopened.parameters, { direction, memo });
      if (process.env.HWPJS_PARAMETERS_EVIDENCE && label === 'Worker') {
        writeFileSync(process.env.HWPJS_PARAMETERS_EVIDENCE + '/before.hwpx', parametersInput);
        writeFileSync(process.env.HWPJS_PARAMETERS_EVIDENCE + '/edited.hwpx', saved);
        writeFileSync(process.env.HWPJS_PARAMETERS_EVIDENCE + '/undo.hwpx', undoBytes);
        writeFileSync(process.env.HWPJS_PARAMETERS_EVIDENCE + '/redo.hwpx', redoBytes);
        writeFileSync(
          process.env.HWPJS_PARAMETERS_EVIDENCE + '/reopened.hwpx',
          (await editor.save()).bytes,
        );
      }
    } finally {
      await editor.dispose();
    }
  });
}

test('named field parameters absent strings are null and adding explicit empty parameters preserves source text', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    await editor.load(parametersInput, { format: 'hwpx', editable: true });
    const selector = { name: 'absent-params' };
    const read = await editor.readNamedFieldParameters(selector);
    assert.equal(read.status, 'found');
    if (read.status !== 'found') throw Error('ExpectedParameters');
    assert.deepEqual(read.parameters, { direction: null, memo: null });
    const result = await setParameters(editor, selector, read.parameters, '', '');
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    const current = await editor.readNamedFieldParameters(selector);
    assert.equal(current.status, 'found');
    if (current.status === 'found')
      assert.deepEqual(current.parameters, { direction: '', memo: '' });
    const value = await editor.readNamedField(selector);
    if (value.status === 'found')
      assert.deepEqual(value.field.value, { status: 'available', text: 'empty' });
    assert.equal((await editor.undo()).status, 'committed-with-snapshot');
    assert.deepEqual((await editor.save()).bytes, parametersInput);
  } finally {
    await editor.dispose();
  }
});

test('named field parameters ambiguous protected expected mismatch and stale selections reject without partial writes', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    await editor.load(parametersInput, { format: 'hwpx', editable: true });
    assert.equal((await editor.readNamedFieldParameters({ name: 'props' })).status, 'ambiguous');
    const expected = { direction: oldDirection, memo: oldMemo };
    for (const [selector, before, error] of [
      [{ name: 'props' }, expected, 'AmbiguousNamedField'],
      [{ name: 'locked-params' }, expected, 'NamedFieldProtected'],
      [
        { name: 'props', occurrence: 1 },
        { ...expected, memo: 'stale' },
        'NamedFieldParametersMismatch',
      ],
    ] as const) {
      const result = await setParameters(editor, selector, before, 'new', 'new');
      assert.equal(result.status, 'rejected-unapplied');
      assert.equal(result.error, error);
      assert.deepEqual((await editor.save()).bytes, parametersInput);
    }
    const state = editor.getEditorState();
    const payload = {
      selector: { name: 'props', occurrence: 0 },
      token: state.token,
      selectionVersion: state.stateVersion,
      expected,
      direction: 'new',
      memo: 'new',
    };
    await editor.setSelection(
      createParagraphSelection(state, { section: 0, paragraph: 1, startUnit: 0 }),
    );
    const stale = await editor.dispatchCommand(SET_NAMED_FIELD_PARAMETERS_COMMAND, payload);
    assert.equal(stale.status, 'rejected-unapplied');
    assert.match(stale.error!, /Stale/);
    assert.deepEqual((await editor.save()).bytes, parametersInput);
  } finally {
    await editor.dispose();
  }
});

test('named field parameters rejects duplicate parameter IDs malformed Command and count without mutation', async () => {
  const variants = [
    propertyParameters
      .replace('cnt="5"', 'cnt="6"')
      .replace(
        '</hp:parameters>',
        '<hp:stringParam name="Direction">second</hp:stringParam></hp:parameters>',
      ),
    propertyParameters.replace('Clickhere:set:', 'Unknown:set:'),
    propertyParameters.replace('cnt="5"', 'cnt="9"'),
    propertyParameters.replace(
      xmlText(oldDirection) + '</hp:stringParam>',
      'contradiction</hp:stringParam>',
    ),
  ];
  for (const parameters of variants) {
    const input = zipWith(
      paragraph(21, propertyBegin(81, 'bad', parameters) + text('value') + end(81)),
    );
    const sdk = await createHwpxEditor(wasmModule);
    try {
      sdk.open(input);
      sdk.enableHistoryDefault();
      const element = sdk.namedFields().rows[0].location!.beginElement;
      assert.throws(
        () => sdk.namedFieldParameters(0, 2, element, 'bad'),
        /UnsupportedNamedFieldParameters/,
      );
      assert.throws(
        () =>
          sdk.setNamedFieldParameters(
            0,
            2,
            element,
            'bad',
            { direction: oldDirection, memo: oldMemo },
            'new',
            'help',
          ),
        /UnsupportedNamedFieldParameters/,
      );
      assert.deepEqual(sdk.save(), input);
    } finally {
      sdk.close();
    }
  }
});

test('named field parameters keeps pending text and dirty flags when adding parameters to self-closing begin', async () => {
  const input = zipWith(
    paragraph(11, '') + paragraph(21, field(85, 'pending', '', 'CLICK_HERE', ' editable="1"')),
  );
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(input);
    sdk.enableHistoryDefault();
    sdk.splice(0, 2, 0, 0, 'prefix😀');
    let row = sdk.namedFields().rows[0];
    sdk.spliceFieldLabel(0, 3, row.location!.beginElement, 0, 0, 'content');
    row = sdk.namedFields().rows[0];
    const read = sdk.namedFieldParameters(0, 3, row.location!.beginElement, 'pending');
    assert.deepEqual(read.parameters, { direction: null, memo: null });
    const before = sdk.save();
    assert(
      sdk.setNamedFieldParameters(
        0,
        3,
        row.location!.beginElement,
        'pending',
        read.parameters,
        'guide',
        'memo',
      ),
    );
    const after = sdk.save();
    row = sdk.namedFields().rows[0];
    assert.deepEqual(row.value, { status: 'available', text: 'content' });
    execFileSync(
      'python3',
      [
        '-I',
        '-c',
        `
import io, sys, zipfile
from xml.etree import ElementTree as ET
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
    root = ET.fromstring(z.read('Contents/section0.xml'))
n = '{http://www.hancom.co.kr/hwpml/2011/paragraph}'
assert ''.join(t.text or '' for t in root.iter(n+'t')) == 'prefix😀content'
begin, = root.iter(n+'fieldBegin')
assert begin.get('dirty') == '1' and begin.get('name') == 'pending'
assert begin[0].get('cnt') == '2'
`,
      ],
      { input: after },
    );
    sdk.undo();
    assert.deepEqual(sdk.save(), before);
    sdk.redo();
    assert.deepEqual(sdk.save(), after);
  } finally {
    sdk.close();
  }
});

test('named field parameters preserves absent scalar backed by Command and keeps unknown payload unsupported', async () => {
  const command = clickCommand('guide😀', 'memo');
  const parameters =
    '<hp:parameters cnt="2" name="">' +
    '<hp:integerParam name="Prop">7</hp:integerParam>' +
    '<hp:stringParam name="Command" xml:space="preserve">' +
    xmlText(command) +
    '</hp:stringParam></hp:parameters>';
  const input = zipWith(
    paragraph(21, propertyBegin(86, 'command-only', parameters) + text('body') + end(86)),
  );
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(input);
    sdk.enableHistoryDefault();
    const row = sdk.namedFields().rows[0];
    const element = row.location!.beginElement;
    const before = sdk.namedFieldParameters(0, 2, element, 'command-only');
    assert.deepEqual(before.parameters, { direction: 'guide😀', memo: 'memo' });
    assert.equal(
      sdk.setNamedFieldParameters(
        0,
        2,
        element,
        'command-only',
        before.parameters,
        'guide😀',
        'memo',
      ),
      false,
    );
    assert.deepEqual(sdk.save(), input);
    assert.equal(
      sdk.setNamedFieldParameters(
        0,
        2,
        element,
        'command-only',
        before.parameters,
        'new😀',
        'memo',
      ),
      true,
    );
    const current = sdk.namedFields().rows[0];
    assert.deepEqual(
      sdk.namedFieldParameters(0, 2, current.location!.beginElement, 'command-only').parameters,
      { direction: 'new😀', memo: 'memo' },
    );
    execFileSync(
      'python3',
      [
        '-I',
        '-c',
        `
import io, sys, zipfile
from xml.etree import ElementTree as ET
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
    root=ET.fromstring(z.read('Contents/section0.xml'))
n='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
begin,=root.iter(n+'fieldBegin')
assert begin[0].get('cnt') == '3'
assert [p.get('name') for p in begin[0]] == ['Prop','Command','Direction']
assert begin[0][0].text == '7'
`,
      ],
      { input: sdk.save() },
    );
  } finally {
    sdk.close();
  }
});

test('named field parameters read-only permits metadata read and rejects typed writes', async () => {
  const editor = createEditor({ runtimeFactory: worker() });
  try {
    await editor.load(parametersInput, { format: 'hwpx', editable: false });
    const read = await editor.readNamedFieldParameters({ name: 'props', occurrence: 0 });
    assert.equal(read.status, 'found');
    if (read.status !== 'found') throw Error('ExpectedParameters');
    assert.equal(read.canEdit, false);
    const result = await setParameters(
      editor,
      { name: 'props', occurrence: 0 },
      read.parameters,
      'new',
      'new',
    );
    assert.equal(result.status, 'rejected-unapplied');
    assert.equal(result.error, 'ReadOnlyDocument');
    assert.deepEqual((await editor.save()).bytes, parametersInput);
  } finally {
    await editor.dispose();
  }
});

test('named field parameters optional ABI and managed-history gates preserve bytes', async () => {
  const sdk = await createHwpxEditor(wasmModule);
  try {
    sdk.open(parametersInput);
    const row = sdk.namedFields().rows[0];
    const element = row.location!.beginElement;
    const expected = { direction: oldDirection, memo: oldMemo };
    const observation = sdk.namedFieldParameters(0, 2, element, 'props');
    assert.deepEqual(observation.parameters, expected);
    assert.equal(observation.canEdit, false);
    assert.throws(
      () => sdk.setNamedFieldParameters(0, 2, element, 'props', expected, 'new', 'memo'),
      /HistoryNotEnabled/,
    );
    sdk.enableHistory();
    assert.equal(sdk.namedFieldParameters(0, 2, element, 'props').canEdit, false);
    assert.throws(
      () => sdk.setNamedFieldParameters(0, 2, element, 'props', expected, 'new', 'memo'),
      /HistoryProtocol2Required/,
    );
    assert.deepEqual(sdk.save(), parametersInput);
  } finally {
    sdk.close();
  }
});
