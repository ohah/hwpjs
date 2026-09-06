import assert from "node:assert/strict";
import { inflateRawSync, deflateRawSync } from "node:zlib";
import { documentRecords, documentActual, decodedDocumentInput } from "./documents.mjs";
import { containerActual } from "./containers.mjs";
import { shapeActual, shapeRun } from "./shape-validation.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function shapeDocument(call,cfb,file,h,b) {
  const flags=h.readUInt32LE(36),v=h.readUInt32LE(32),raw=Buffer.from(cfb.findExact('/DocInfo').content),doc=flags&1?inflateRawSync(raw):raw;
  const sections=[{index:0,bytes:b}],stats=shapeActual(call,v,b);
  const document=documentActual(call,h,doc,sections),container=containerActual(call,file,cfb,h,doc,sections);
  const nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.name==='BodyText'&&n.parent===0),section=nodes.findIndex(n=>n.name==='Section0'&&n.parent===body);assert.ok(section>=0);
  const full=plain=>{const copy=nodes.map(n=>({...n}));copy[section].content=flags&1?deflateRawSync(plain):plain;return call(25,Buffer.concat([w(67108864),Buffer.from(cfb.write({nodes:copy}))]));};
  const rows=documentRecords(b),r=rows.find(r=>r.tag===76),index=rows.indexOf(r),level=b.readUInt32LE(r.offset)>>>10&1023;
  assert.equal(rows[index-1].tag,71);assert.equal(b.readUInt32LE(rows[index-1].start),0x67736f20);
  let end=r.end;for(const n of rows.slice(index+1)){if((b.readUInt32LE(n.offset)>>>10&1023)<=level)break;end=n.end;}
  const missing=Buffer.concat([b.subarray(0,r.offset),b.subarray(end)]);
  const duplicate=Buffer.concat([b.subarray(0,r.end),b.subarray(r.offset,r.end),b.subarray(r.end)]);
  const required=100+b.readUInt16LE(r.start+50)*96,length=required-1;
  const short=Buffer.concat([b.subarray(0,r.start+length),b.subarray(r.end)]);
  short.writeUInt32LE(((b.readUInt32LE(r.offset)&0xfffff)|(length<<20))>>>0,r.offset);
  let rejected=0;const baseline=call(24,decodedDocumentInput(h,doc,sections));
  for(const [bad,error] of [[missing,/MissingShapeComponent/],[duplicate,/DuplicateShapeComponent/],[short,/UnexpectedEnd/]]){
    for(const invoke of [()=>shapeRun(call,v,bad),()=>call(24,decodedDocumentInput(h,doc,[{index:0,bytes:bad}])),()=>full(bad)]){assert.throws(invoke,error);rejected++;}
    assert.deepEqual(call(24,decodedDocumentInput(h,doc,sections)),baseline);
  }
  const changed=Buffer.from(b);changed.writeUInt32LE((changed.readUInt32LE(r.start+36)^0x80000000)>>>0,r.start+36);
  const info=Buffer.from(doc),properties=documentRecords(doc).find(r=>r.tag===16);info.writeUInt16LE(2,properties.start);
  documentActual(call,h,info,[{index:0,bytes:b},{index:1,bytes:changed}]);
  return {stats,document,container,rejected};
}
