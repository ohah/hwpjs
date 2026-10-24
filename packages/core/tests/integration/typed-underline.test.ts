import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createEditor, SET_CHARACTER_UNDERLINE_COMMAND, UNDO_COMMAND, REDO_COMMAND} from '../../src/index.ts';
import type {SelectionTarget, CharacterUnderlineKind} from '../../src/index.ts';
import {createReaderRuntimeFactory} from '../../src/runtime.ts';
import {verifyCharacterProperties} from '../../../../tests/hwp5/style-preservation/character-property-oracle.mjs';
import {paragraphSelectionOwner} from '../../../../web/preview/paragraph-selection.mjs';
import {sourceTextChange} from '../../../../web/preview/text-offsets.mjs';
import {execFileSync} from '../../../../tools/oracle-process.mjs';

const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/verification/hwp5-object-extra-u16/bin/hwpjs.wasm');
if (!process.env.HWPJS_TEST_WASM) assert.equal(createHash('sha256').update(wasm).digest('hex'),
 'fdbb6a476a16811d0136f484e9e03a327947bc5c9e361bc756a8a06b1dde1c51');

for (const format of ['hwp5', 'hwpx'] as const) for (const owner of ['body','drawingText','drawingCaption','tableCell'] as const) {
 const fixture=owner==='body'?'charshape':owner==='tableCell'?'noori':'textbox';
 test(`${format} ${fixture} ${owner} public underline bottom/none save/history/reopen`, async t => {
  const factory = createReaderRuntimeFactory({wasmModule:await WebAssembly.compile(wasm)});
  const calls:string[] = [];
  const editor = createEditor({runtimeFactory:async () => {
   const runtime = await factory();
   return {dispose:runtime.dispose, request(message:any, context:any) {
    calls.push(message.kind);
    return runtime.request(message, context);
   }};
  }});
  const reopened = createEditor({runtimeFactory:factory});
  t.after(async () => {await editor.dispose(); await reopened.dispose();});
  const before = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${fixture}.${format === 'hwp5' ? 'hwp' : 'hwpx'}`);
  await editor.load(before, {format});
  const rows = (editor.getEditorState().content as any).paragraphs;
  const row = rows.find((p:any) => p.editable && !p.clipped && p.text.length > 0
   && (format !== 'hwp5' || p.currentReference?.kind === 'original')
   && (owner==='body' ? p.section===0 && p.paragraph===1 && !p.drawingText && !p.drawingCaption && !p.tableCell : Boolean(p[owner])));
  assert(row, 'fixture must expose the intended original paragraph');
  assert(row.text.length > 0 && !/[\uD800-\uDFFF\uFFFC\t]/.test(row.text[0]));
  const target = (e = editor, p = row):SelectionTarget => ({...e.getEditorState().token,
   format, coordinateSpace:'display', owner:paragraphSelectionOwner(p), section:p.section,
   paragraph:p.paragraph, startUnit:0, endUnit:1, affinity:'forward'});
  const dispatch = (selection:SelectionTarget, kind:CharacterUnderlineKind) =>
   editor.dispatchCommand(SET_CHARACTER_UNDERLINE_COMMAND, {target:selection, kind});
  await editor.setSelection(target());
  const rejectCleanly = async (selection:SelectionTarget, kind:CharacterUnderlineKind, error?:string) => {
   const state = editor.getEditorState(), count = calls.length;
   const result = await dispatch(selection, kind);
   assert.equal(result.status, 'rejected-unapplied');
   if (error) assert.equal(result.error, error);
   else assert(result.error);
   assert.equal(editor.getEditorState(), state);
   assert.equal(calls.length, count, 'invalid input must not call Native');
  };
  await rejectCleanly({...target(), viewRevision:target().viewRevision + 1}, 'bottom', 'StaleTarget');
  await rejectCleanly({...target(), endUnit:0}, 'bottom', 'EmptyCharacterSelection');
  await rejectCleanly(target(), 'invalid' as CharacterUnderlineKind, 'InvalidCharacterUnderlineKind');

  const verify = (original:Buffer, saved:Buffer, kind:'bottom'|'none') => {
   const properties = {underlineKind:kind};
   const wrong = {underlineKind:kind === 'bottom' ? 'top' : 'bottom'};
   if (format === 'hwp5') {
    const mapped = sourceTextChange({startUnit:0, endUnit:1, text:''}, row.sourceOffsets);
    const position = {section:row.section, paragraph:row.paragraph,
     startUnit:mapped.startUnit, endUnit:mapped.endUnit};
    // Compares all decoded DocInfo/Section bytes and all unrelated CFB streams.
    assert.equal(verifyCharacterProperties(original, saved, {...position, properties}), true);
    assert.throws(() => verifyCharacterProperties(original, saved, {...position, properties:wrong}));
   } else {
    const localParagraph = rows.filter((p:any) => p.section === row.section)
     .findIndex((p:any) => p.paragraph === row.paragraph);
    assert(localParagraph >= 0);
    const request = {before:original.toString('base64'), after:saved.toString('base64'),
     section:row.section, localParagraph, startUnit:0, endUnit:1, properties,
     preserveUnselectedMetadata:true,mode:owner==='drawingCaption'?'anchor-properties':undefined};
    for (const flags of [[], ['-O']]) {
     const oracle = (input:object) => execFileSync('python3',
      [...flags, 'tools/hwpx-character-property-oracle.py'], {input:JSON.stringify(input), timeout:30000});
     oracle(request);
     assert.throws(() => oracle({...request, properties:wrong}), 'wrong expected underline must be rejected');
    }
   }
  };
  const selected = target();
  const on = await dispatch(selected, 'bottom');
  assert.equal(on.status, 'committed-with-snapshot', on.error);
  assert.equal(on.changed, true);
  assert.deepEqual({...on.state.selection as object}, target());
  const bottom = Buffer.from((await editor.save({allowStaleLayout:true})).bytes);
  assert.notDeepEqual(bottom, before);
  verify(before, bottom, 'bottom');
  await rejectCleanly(selected, 'bottom', 'StaleTarget');
  const history = async (command:typeof UNDO_COMMAND) => {
   const result = await editor.dispatchCommand(command, {token:editor.getEditorState().token});
   assert.equal(result.status, 'committed-with-snapshot', result.error);
  };
  await history(UNDO_COMMAND);
  assert.deepEqual(Buffer.from((await editor.save()).bytes), before);
  if(format==='hwp5'){
   const prior=editor.getEditorState(),count=calls.length;
   const unsupported=await dispatch(target(),'center');
   assert.equal(unsupported.status,'rejected-unapplied');
   assert.equal(unsupported.error,'UnsupportedCharacterUnderlineKind');
   assert.equal(editor.getEditorState(),prior);
   assert.equal(calls.length,count+1,'native format policy must reject without mutating history');
   assert.deepEqual(Buffer.from((await editor.save()).bytes),before);
  }
  await history(REDO_COMMAND);
  assert.deepEqual(Buffer.from((await editor.save({allowStaleLayout:true})).bytes), bottom);
  await reopened.load(bottom, {format});
  const reopenedRow = (reopened.getEditorState().content as any).paragraphs
   .find((p:any) => p.section === row.section && p.paragraph === row.paragraph);
  assert.equal(reopenedRow.text, row.text);
  for(const kind of ['drawingText','drawingCaption','tableCell'])assert.equal(Boolean(reopenedRow[kind]),owner===kind);
  assert.deepEqual(Buffer.from((await reopened.save({allowStaleLayout:true})).bytes), bottom);
  // Fresh token and rediscovered owner: node IDs are local to the reopened session.
  await reopened.setSelection(target(reopened, reopenedRow));
  const off = await reopened.dispatchCommand(SET_CHARACTER_UNDERLINE_COMMAND,
   {target:target(reopened, reopenedRow), kind:'none'});
  assert.equal(off.status, 'committed-with-snapshot', off.error);
  assert.equal(off.changed, true);
  assert.deepEqual({...off.state.selection as object}, target(reopened, reopenedRow));
  const none = Buffer.from((await reopened.save({allowStaleLayout:true})).bytes);
  assert.notDeepEqual(none, bottom);
  // Independent transition expectation; do not assume removal returns original bytes
  // or that Native necessarily reuses the original resource.
  verify(bottom, none, 'none');
  const undone = await reopened.dispatchCommand(UNDO_COMMAND, {token:reopened.getEditorState().token});
  assert.equal(undone.status, 'committed-with-snapshot', undone.error);
  assert.deepEqual(Buffer.from((await reopened.save({allowStaleLayout:true})).bytes), bottom);
  const redone = await reopened.dispatchCommand(REDO_COMMAND, {token:reopened.getEditorState().token});
  assert.equal(redone.status, 'committed-with-snapshot', redone.error);
  assert.deepEqual(Buffer.from((await reopened.save({allowStaleLayout:true})).bytes), none);
  await editor.load(none, {format});
  assert.deepEqual(Buffer.from((await editor.save({allowStaleLayout:true})).bytes), none);
 });
}
