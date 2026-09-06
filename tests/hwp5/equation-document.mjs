import assert from "node:assert/strict";
import { inflateRawSync, deflateRawSync } from "node:zlib";
import { documentRecords, documentActual, decodedDocumentInput } from "./documents.mjs";
import { containerActual } from "./containers.mjs";
import { equationActual, equationRun } from "./equation-validation.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function equationDocument(call,cfb,file,h,b) {
  const flags=h.readUInt32LE(36),v=h.readUInt32LE(32);
  const raw=Buffer.from(cfb.findExact('/DocInfo').content),doc=flags&1?inflateRawSync(raw):raw;
  const sections=[{index:0,bytes:b}], stats=equationActual(call,v,b);
  const document=documentActual(call,h,doc,sections),container=containerActual(call,file,cfb,h,doc,sections);
  const nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.name==='BodyText'&&n.parent===0),section=nodes.findIndex(n=>n.name==='Section0'&&n.parent===body);
  assert.ok(section>=0);
  const full=plain=>{const copy=nodes.map(n=>({...n}));copy[section].content=flags&1?deflateRawSync(plain):plain;return call(25,Buffer.concat([w(67108864),Buffer.from(cfb.write({nodes:copy}))]));};
  const record=documentRecords(b).find(r=>r.tag===88);assert.ok(record);
  const missing=Buffer.concat([b.subarray(0,record.offset),b.subarray(record.end)]);
  const duplicate=Buffer.concat([b.subarray(0,record.end),b.subarray(record.offset,record.end),b.subarray(record.end)]);
  const orphan=Buffer.from(b);orphan.writeUInt32LE(((b.readUInt32LE(record.offset)&~0xffc00))>>>0,record.offset);
  // Remove the final required version code unit under the default version-only layout.
  const scriptUnits=b.readUInt16LE(record.start+4),versionCount=record.start+18+scriptUnits*2;
  const required=versionCount+2+b.readUInt16LE(versionCount)*2;
  const length=required-record.start-1;
  const short=Buffer.concat([b.subarray(0,record.start+length),b.subarray(record.end)]);
  short.writeUInt32LE(((b.readUInt32LE(record.offset)&0xfffff)|(length<<20))>>>0,record.offset);
  let rejected=0;
  const baseline=call(24,decodedDocumentInput(h,doc,sections));
  for(const [bad,error] of [[missing,/MissingEquation/],[duplicate,/DuplicateEquation/],[short,/UnexpectedEnd/]]) {
    for(const invoke of [()=>equationRun(call,v,bad),()=>call(24,decodedDocumentInput(h,doc,[{index:0,bytes:bad}])),()=>full(bad)]) {assert.throws(invoke,error);rejected++;}
    assert.deepEqual(call(24,decodedDocumentInput(h,doc,sections)),baseline);
  }
  // A standalone root EQEDIT isolates ownership from later hierarchy constraints.
  assert.throws(()=>equationRun(call,v,orphan.subarray(record.offset,record.end)),/OrphanEquation/);rejected++;
  const changed=Buffer.from(b);changed.writeUInt32LE((changed.readUInt32LE(record.start)^1)>>>0,record.start);
  const info=Buffer.from(doc),properties=documentRecords(doc).find(r=>r.tag===16);info.writeUInt16LE(2,properties.start);
  documentActual(call,h,info,[{index:0,bytes:b},{index:1,bytes:changed}]);
  return {stats,document,container,rejected};
}
