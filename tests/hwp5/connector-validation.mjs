import assert from "node:assert/strict";
import {lineOwnerActual,lineOwnerRun} from "./line-validation.mjs";
import {documentRecords} from "./documents.mjs";
import {ownedShapeDocument} from "./owned-shape-document.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function connectorOwnerEdges(call){
  const v=0x05010001,frame=(tag,level,p=Buffer.alloc(0))=>Buffer.concat([w(tag|level<<10|p.length<<20),p]);
  const owner=(id=0x24636f6c,level=0)=>frame(76,level,w(id)),p=Buffer.alloc(64);p.writeUInt32LE(2,36);p.writeUInt32LE(9,16);
  const good=Buffer.concat([owner(),frame(78,1,p)]);let accepted=0,rejected=0;
  const check=b=>{accepted++;return lineOwnerActual(call,v,b);};
  const reject=(b,error)=>{assert.throws(()=>lineOwnerRun(call,v,b),error);rejected++;check(good);};
  assert.deepEqual(check(good),[0,1,0,4,2,1,2]);
  reject(owner(),/MissingConnector/);
  reject(Buffer.concat([good,frame(900,1),frame(78,1,p)]),/DuplicateConnector/);
  reject(frame(78,0,p),/OrphanLine/);
  reject(Buffer.concat([owner(0x24726563),frame(78,1,p)]),/OrphanLine/);
  reject(Buffer.concat([owner(),owner(0x246c696e,1),frame(78,2,Buffer.alloc(18))]),/MissingConnector/);
  reject(Buffer.concat([good,owner()]),/MissingConnector/);
  for(let cut=0;cut<60;cut++)reject(Buffer.concat([owner(),frame(78,1,p.subarray(0,cut))]),/UnexpectedEnd/);
  for(const count of [3,65535,0x80000000,0xffffffff]){
    const bad=Buffer.from(p);bad.writeUInt32LE(count,36);reject(Buffer.concat([owner(),frame(78,1,bad)]),/UnexpectedEnd/);
  }
  for(const kind of [0,8,9,0xffffffff]){const b=Buffer.from(p);b.writeUInt32LE(kind,16);const stats=check(Buffer.concat([owner(),frame(78,1,b)]));assert.equal(stats[5],Number(kind>8));}
  const line=Buffer.concat([owner(0x246c696e),frame(78,1,Buffer.alloc(18))]);
  assert.deepEqual(check(Buffer.concat([good,line])),check(Buffer.concat([line,good])));
  for(let tail=0;tail<=4;tail++)assert.equal(check(Buffer.concat([owner(),frame(78,1,p.subarray(0,60+tail))]))[3],tail);
  return {accepted,rejected};
}
function connectors(bytes){
  const stack=[],result=[];
  for(const r of documentRecords(bytes)){
    const level=bytes.readUInt32LE(r.offset)>>>10&1023;stack.length=level;const parent=stack[level-1];
    if(r.tag===78&&parent?.tag===76&&bytes.readUInt32LE(parent.start)===0x24636f6c)result.push(r);
    stack.push(r);
  }
  return result;
}
export function connectorDocumentReference(call,cfb){
  return ownedShapeDocument(call,cfb,{
    file:'issue4491/30213_1.혼합단지등 제도개선 방안.hwp',tag:78,count:12,countField:1,group:'lines',field:5,
    selectRecords:connectors,minimum:(b,r)=>40+b.readUInt32LE(r.start+36)*10,
    actual:lineOwnerActual,run:lineOwnerRun,missing:/MissingConnector/,duplicate:/DuplicateConnector/,orphan:/OrphanLine/,
    mutate:(b,at)=>b.writeUInt32LE(9,at+16),
    invalidMutations:(b,r)=>[3,65535,0x80000000,0xffffffff].filter(n=>n>b.readUInt32LE(r.start+36)).map(n=>{const bytes=Buffer.from(b);bytes.writeUInt32LE(n,r.start+36);return {bytes,error:/UnexpectedEnd/};}),
  });
}
