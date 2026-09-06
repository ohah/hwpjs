import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { documentRecords } from "./documents.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function storageEdges(call) {
  const raw=Buffer.from('0200010003004f004c00450009','hex');
  const run=(b,mode=1)=>call(48,Buffer.concat([Buffer.from([mode]),b]));
  assert.deepEqual(run(raw),Buffer.concat([Buffer.from('0101000103004f004c004500','hex'),w(1),Buffer.from([9])]));
  assert.deepEqual(run(raw,0),Buffer.concat([Buffer.from('01010000','hex'),w(9),raw.subarray(4)]));
  assert.deepEqual(run(raw.subarray(0,4)),Buffer.concat([Buffer.from('01010000','hex'),w(0)]));
  assert.deepEqual(run(Buffer.from('020001000000','hex')),Buffer.concat([Buffer.from('010100010000','hex'),w(0)]));
  for(let n=5;n<12;n++)assert.throws(()=>run(raw.subarray(0,n)),/UnexpectedEnd/);
  assert.throws(()=>run(raw,2),/InvalidMode/);
  assert.deepEqual(run(Buffer.from('0f00','hex')),Buffer.from([0]));
  return {rejected:8};
}
export function storageDocumentEdges(call,cfb,h,doc,file) {
  cfb.parse(file,{strict:true});
  const nodes=cfb.document().nodes,di=nodes.findIndex(n=>n.name==='DocInfo'&&n.parent===0),bi=nodes.findIndex(n=>n.name==='BIN0001.OLE');
  assert.ok(di>=0&&bi>=0);
  const record=documentRecords(doc).find(r=>r.tag===18),flags=h.readUInt32LE(36);
  const replace=payload=>{const x=Buffer.concat([doc.subarray(0,record.start),payload,doc.subarray(record.end)]);x.writeUInt32LE(((doc.readUInt32LE(record.offset)&0xfffff)|(payload.length<<20))>>>0,record.offset);return x;};
  const full=(plain,rename,mode=25)=>{const copy=nodes.map(n=>({...n}));copy[di].content=flags&1?deflateRawSync(plain):plain;if(rename!==undefined)copy[bi].name=rename;return call(mode,Buffer.concat([w(67108864),Buffer.from(cfb.write({nodes:copy}))]));};
  const payload=doc.subarray(record.start,record.end),baseline=full(doc);let rejected=0;
  for(let n=5;n<12;n++){assert.throws(()=>full(replace(payload.subarray(0,n))),/UnexpectedEnd/);rejected++;assert.deepEqual(full(doc),baseline);}
  for(const code of [0,47,0xd800]){const bad=Buffer.from(payload);bad.writeUInt16LE(code,6);assert.throws(()=>full(replace(bad)),/InvalidBinDataExtension/);rejected++;}
  const wrong=Buffer.from(payload);wrong.writeUInt16LE(88,6);
  assert.throws(()=>full(replace(wrong)),/MissingHwpEntry/);rejected++;
  assert.throws(()=>full(doc,'BIN0001'),/MissingHwpEntry/);rejected++;
  // Declared absence and explicit empty extension both target the extensionless stream.
  full(replace(payload.subarray(0,4)),'BIN0001');
  full(replace(Buffer.from('020001000000','hex')),'BIN0001');
  assert.throws(()=>full(doc,undefined,49),/MissingHwpEntry/);rejected++;
  assert.deepEqual(full(doc,'BIN0001',49),baseline);
  assert.deepEqual(full(doc),baseline);
  return {rejected};
}
