import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  createEditor,
  createParagraphSelection,
  CREATE_NAMED_FIELD_COMMAND,
  SET_NAMED_FIELD_PARAMETERS_COMMAND,
  APPLY_FORMATTING_PATCH_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
} from '../../src/index.ts';
import { createReaderRuntimeFactory } from '../../src/runtime.ts';

const wasm = process.env.HWPJS_TEST_WASM;
assert(wasm, 'Explicit HWPJS_TEST_WASM required');
const module = await WebAssembly.compile(readFileSync(wasm));
const blank = await (async () => {
  const builder = createEditor({
    runtimeFactory: createReaderRuntimeFactory({ wasmModule: module }),
  });
  try {
    await builder.createDocument({ format: 'hwpx' });
    return (await builder.save()).bytes;
  } finally {
    await builder.dispose();
  }
})();
const original = new Uint8Array(
  execFileSync(
    'python3',
    [
      '-I',
      '-c',
      `
import io,sys,zipfile,copy
source=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
out=io.BytesIO()
with zipfile.ZipFile(out,'w') as target:
 for member in source.infolist():
  data=source.read(member)
  if member.filename=='Contents/header.xml':
   assert b'<hh:bullets' not in data
   data=data.replace(b'</hh:refList>',b'<hh:bullets itemCnt="1"><hh:bullet id="7" useImage="0" char="&#x25B6;"><hh:paraHead checkable="0"/></hh:bullet></hh:bullets></hh:refList>')
  if member.filename=='Contents/section0.xml':
   for identifier,text in [(101,'bullet body'),(102,'field body')]:
    paragraph=f'<hp:p id="{identifier}" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0"><hp:run charPrIDRef="0"><hp:t>{text}</hp:t></hp:run></hp:p>'
    data=data.replace(b'</hs:sec>',paragraph.encode()+b'</hs:sec>')
  target.writestr(copy.copy(member),data)
sys.stdout.buffer.write(out.getvalue())
`,
    ],
    { input: blank },
  ),
);
const factory = () => createReaderRuntimeFactory({ wasmModule: module });

test('field parameter source rebasing preserves a pending bullet resource and independent history', async (t) => {
  const constructor = createEditor({ runtimeFactory: factory() });
  t.after(() => constructor.dispose());
  await constructor.load(original, { format: 'hwpx', editable: true });
  const fieldTarget = createParagraphSelection(constructor.getEditorState(), {
    section: 0,
    paragraph: 2,
    startUnit: 0,
    endUnit: 5,
  });
  assert(fieldTarget);
  await constructor.setSelection(fieldTarget);
  const created = await constructor.dispatchCommand(CREATE_NAMED_FIELD_COMMAND, {
    target: fieldTarget,
    selectionVersion: constructor.getEditorState().stateVersion,
    expectedText: 'field',
    name: 'cross-feature',
    direction: 'old',
    memo: 'help',
  });
  assert.equal(created.status, 'committed-with-snapshot', created.error);
  const initial = (await constructor.save()).bytes;
  if (process.env.HWPJS_CROSS_FIXTURE) writeFileSync(process.env.HWPJS_CROSS_FIXTURE, initial);
  const editor = createEditor({ runtimeFactory: factory() });
  t.after(() => editor.dispose());
  await editor.load(initial, { format: 'hwpx', editable: true });
  const target = createParagraphSelection(editor.getEditorState(), {
    section: 0,
    paragraph: 1,
    startUnit: 0,
  });
  assert(target);
  const applied = await editor.dispatchCommand(APPLY_FORMATTING_PATCH_COMMAND, {
    target,
    patch: { paragraph: { bullet: { kind: 'existing', id: 7 } } },
  });
  assert.equal(applied.status, 'committed-with-snapshot', applied.error);
  const bulletBytes = (await editor.save()).bytes;
  const read = await editor.readNamedFieldParameters({ name: 'cross-feature' });
  assert.equal(read.status, 'found');
  if (read.status !== 'found') throw Error('ExpectedFieldParameters');
  assert.equal(read.canEdit, true);
  const changed = await editor.dispatchCommand(SET_NAMED_FIELD_PARAMETERS_COMMAND, {
    selector: { name: 'cross-feature' },
    token: read.token,
    selectionVersion: read.selectionVersion,
    expected: read.parameters,
    direction: 'new 😀',
    memo: 'new help',
  });
  assert.equal(changed.status, 'committed-with-snapshot', changed.error);
  const final = (await editor.save()).bytes;
  execFileSync(
    'python3',
    [
      '-I',
      '-c',
      `
import io,sys,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
h='{http://www.hancom.co.kr/hwpml/2011/head}'
p='{http://www.hancom.co.kr/hwpml/2011/paragraph}'
body=E.fromstring(z.read('Contents/section0.xml'))
header=E.fromstring(z.read('Contents/header.xml'))
reference=body[1].attrib['paraPrIDRef']
shape=next(n for n in header.iter(h+'paraPr') if n.attrib['id']==reference)
assert shape.find(h+'heading').attrib['type']=='BULLET'
assert shape.find(h+'heading').attrib['idRef']=='7'
assert ''.join(body[1].itertext())=='bullet body'
fields=[n for n in body.iter(p+'fieldBegin') if n.attrib.get('name')=='cross-feature']
assert len(fields)==1
params={n.attrib.get('name'):''.join(n.itertext()) for n in fields[0].iter(p+'stringParam')}
assert params['Direction']=='new 😀' and params['HelpState']=='new help'
`,
    ],
    { input: final },
  );
  for (const expected of [bulletBytes, initial]) {
    const result = await editor.dispatchCommand(UNDO_COMMAND, {
      token: editor.getEditorState().token,
    });
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.deepEqual((await editor.save()).bytes, expected);
  }
  for (const expected of [bulletBytes, final]) {
    const result = await editor.dispatchCommand(REDO_COMMAND, {
      token: editor.getEditorState().token,
    });
    assert.equal(result.status, 'committed-with-snapshot', result.error);
    assert.deepEqual((await editor.save()).bytes, expected);
  }
  const reopened = createEditor({ runtimeFactory: factory() });
  t.after(() => reopened.dispose());
  await reopened.load(final, { format: 'hwpx', editable: true });
  assert.deepEqual((await reopened.save()).bytes, final);
  const parameters = await reopened.readNamedFieldParameters({ name: 'cross-feature' });
  assert.equal(parameters.status, 'found');
  if (parameters.status !== 'found') throw Error('ExpectedReopenedField');
  assert.deepEqual(parameters.parameters, { direction: 'new 😀', memo: 'new help' });
});
