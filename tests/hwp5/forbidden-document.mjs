import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {loadMemoDocument} from './memo-references.mjs';
import {documentRecords,decodedDocumentInput} from './documents.mjs';
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function forbiddenDocument(call,cfb){
  const x=loadMemoDocument(call,cfb,'issue5866/memo_field_hwp5.hwp'),r=documentRecords(x.doc).find(r=>r.tag===94);assert.ok(r);assert.equal(r.end-r.start,16);
  const input=doc=>decodedDocumentInput(x.h,doc,x.sections);
  let containerComparisons=0;
  const capture=fn=>{try{return {bytes:fn()};}catch(error){return {error:error.message};}};
  const run=(mode,doc)=>{
    const file=cfb.write({nodes:x.nodes.map(n=>n.parent===0&&n.name==='DocInfo'?{...n,content:x.h.readUInt32LE(36)&1?deflateRawSync(doc):doc}:n)});
    const decoded=capture(()=>call(96,Buffer.concat([Buffer.from([mode]),input(doc)])));
    const container=capture(()=>call(97,Buffer.concat([Buffer.from([mode]),w(64*1024*1024),Buffer.from(file)])));
    assert.deepEqual(container,decoded);containerComparisons++;
    if(decoded.error)throw Error(decoded.error);return decoded.bytes;
  };
  const expected=(mode,level,units=0,nonempty=0,extra=0)=>Buffer.concat([1,mode,1-mode,Number(level===0),Number(level===1),Number(level>1),units,nonempty,extra].map(w));
  assert.deepEqual(run(0,x.doc),expected(0,1));assert.deepEqual(run(1,x.doc),expected(1,1));
  for(const mode of [0,1])assert.deepEqual(call(97,Buffer.concat([Buffer.from([mode]),w(64*1024*1024),x.file])),expected(mode,1));
  const replace=(level,p)=>Buffer.concat([x.doc.subarray(0,r.offset),w(94|(level<<10)|(p.length<<20)),p,x.doc.subarray(r.end)]);
  let accepted=2,rejected=0;
  const recover=()=>assert.deepEqual(run(1,x.doc),expected(1,1));
  for(const level of [0,1]){
    const p=Buffer.concat([w(0),w(0),w(1),w(0),Buffer.from([32,0,255])]);
    assert.deepEqual(run(1,replace(level,p)),expected(1,level,1,1,1));accepted++;
    for(let cut=0;cut<16;cut++){
      const doc=replace(level,Buffer.alloc(cut));assert.deepEqual(run(0,doc),expected(0,level));call(24,input(doc));
      assert.throws(()=>run(1,doc),/UnexpectedEnd/);rejected++;recover();
    }
  }
  for(const level of [2,1023]){const doc=replace(level,Buffer.alloc(16));assert.deepEqual(run(0,doc),expected(0,level));assert.throws(()=>run(1,doc),/InvalidForbiddenCharLevel/);rejected++;recover();}
  const absent=Buffer.concat([x.doc.subarray(0,r.offset),x.doc.subarray(r.end)]);assert.deepEqual(run(1,absent),Buffer.alloc(36));accepted++;
  assert.throws(()=>run(2,x.doc),/InvalidMode/);rejected++;recover();
  return {accepted,rejected,containerComparisons};
}
