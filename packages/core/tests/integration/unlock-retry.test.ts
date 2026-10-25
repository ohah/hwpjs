import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEditor} from '../../src/editor/create-editor.ts';
import {PasswordAttemptError} from '../../src/editor/unlock-policy.ts';
import {createReaderRuntimeFactory} from '../../src/runtime.ts';
const module=await WebAssembly.compile(readFileSync('packages/core/dist/hwpjs.wasm'));
for(const format of ['hwp5','hwpx'] as const)test(`${format} actual encrypted fixture unlock retry keeps candidate and old active`,async()=>{
 const factory=createReaderRuntimeFactory({wasmModule:module});let created=0,closed=0;
 const e=createEditor({runtimeFactory:async()=>{created++;const runtime=await factory();return {request:runtime.request,async dispose(){closed++;await runtime.dispose();}};}});
 try{
 const ext=format==='hwp5'?'hwp':'hwpx';
 await e.load(readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/charshape.${ext}`),{format});const old=e.getEditorState();
 await assert.rejects(e.load(readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/password-12345.${ext}`),{format}),/EncryptedDocument|UnsupportedEncryption/);
 for(let i=0;i<2;i++){
  await assert.rejects(e.unlock('wrong'),error=>error instanceof PasswordAttemptError&&error.message==='WrongPasswordOrCorruptPayload');
  assert.equal(e.getEditorState().documentId,old.documentId);assert.deepEqual(e.getEditorState().content,old.content);assert.equal(created,2);assert.equal(closed,0);
 }
 await e.unlock('12345');assert.equal(created,2);assert.equal(closed,1);assert.notEqual(e.getEditorState().documentId,old.documentId);
 assert.equal((e.getEditorState().content as any).passwordProtectionRemoved,true);
 await assert.rejects(e.save(),/PasswordProtectionRemovalNotAcknowledged/);
 const saved=await e.save({allowUnprotectedOutput:true,allowStaleLayout:true});assert(saved.bytes.length>0);
 }finally{await e.dispose();}assert.equal(closed,2);
});
