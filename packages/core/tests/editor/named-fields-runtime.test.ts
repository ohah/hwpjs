import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createNewDocumentBytes } from '../../../../js/new-document.mjs';
import { createHwpxEditor } from '../../../../js/hwpx-editor.mjs';
import {
  createEditor,
  SET_NAMED_FIELD_VALUE_COMMAND,
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
