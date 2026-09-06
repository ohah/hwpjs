import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { documentRecords,decodedDocumentInput } from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
import { lineOwnerActual,lineOwnerRun } from "./line-validation.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function lineDocumentReference(call,cfb){
  const path=new URL('../../reference/rhwp/samples/group-drawing-02.hwp',import.meta.url);
  if(!existsSync(path))return {skipped:true};
  const file=readFileSync(path);cfb.parse(file,{strict:true});
  const h=Buffer.from(cfb.findExact('/FileHeader').content),v=h.readUInt32LE(32),flags=h.readUInt32LE(36);
  const decode=raw=>call(3,Buffer.concat([h,Buffer.from(raw)]));
  const doc=decode(cfb.findExact('/DocInfo').content),b=decode(cfb.findExact('/BodyText/Section0').content);
  const nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const input=bytes=>decodedDocumentInput(h,doc,[{index:0,bytes}]);
  const original=call(24,input(b));
  const expected=lineOwnerActual(call,v,b);assert.equal(expected[0],4);
  expected.forEach((n,i)=>assert.equal(original.readUInt32LE(sectionFieldOffset(0,'lines',i)),n));
  const cap=w(64*1024*1024),container=call(25,Buffer.concat([cap,file]));
  assert.deepEqual(container.subarray(0,original.length),original);
  const lines=documentRecords(b).filter(r=>r.tag===78);assert.equal(lines.length,4);
  let rejected=0;
  const reject=(changed,error)=>{
    assert.throws(()=>lineOwnerRun(call,v,changed),error);rejected++;
    assert.throws(()=>call(24,input(changed)),error);rejected++;
    const altered=nodes.map(n=>n.parent===body&&n.name==='Section0'?{...n,content:flags&1?deflateRawSync(changed):changed}:n);
    const rewritten=cfb.write({nodes:altered});
    assert.throws(()=>call(25,Buffer.concat([cap,Buffer.from(rewritten)])),error);rejected++;
    assert.deepEqual(call(24,input(b)),original);
    assert.deepEqual(call(25,Buffer.concat([cap,file])),container);
  };
  for(const r of lines){
    const before=b.subarray(0,r.offset),after=b.subarray(r.end),record=b.subarray(r.offset,r.end);
    reject(Buffer.concat([before,after]),/MissingLine/);
    reject(Buffer.concat([before,record,record,after]),/DuplicateLine/);
    const header=w((b.readUInt32LE(r.offset)&0xfffff)|(17<<20));
    reject(Buffer.concat([before,header,b.subarray(r.start,r.start+17),after]),/UnexpectedEnd/);
  }
  const orphan=b.subarray(lines[0].start,lines[0].end);
  reject(Buffer.concat([b,w(78|(orphan.length<<20)),orphan]),/OrphanLine/);
  const changed=Buffer.from(b);changed.writeUInt16LE(2,lines[0].start+16);
  const info=Buffer.from(doc),properties=documentRecords(info).find(r=>r.tag===16);info.writeUInt16LE(2,properties.start);
  const pair=[{index:0,bytes:b},{index:1,bytes:changed}];
  const check=sections=>call(24,decodedDocumentInput(h,info,sections));
  const canonical=check(pair);assert.deepEqual(check([...pair].reverse()),canonical);
  assert.equal(canonical.readUInt32LE(sectionFieldOffset(0,'lines',2)),0);
  assert.equal(canonical.readUInt32LE(sectionFieldOffset(1,'lines',2)),1);
  return {lines:4,rejected,ordering:1};
}
