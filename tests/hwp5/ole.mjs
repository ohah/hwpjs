import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { documentRecords, documentActual, decodedDocumentInput } from "./documents.mjs";
import { oleActual, oleRun } from "./ole-validation.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const run=(call,b,mode)=>call(46,Buffer.concat([Buffer.from([mode]),b]));
function check(call,b,mode) {
  const width=mode?26:24;
  assert.deepEqual(run(call,b,mode),Buffer.concat([b.subarray(0,width),w(b.length-width),b.subarray(width)]));
}
export function oleEdges(call) {
  let accepted=0,rejected=0;
  for(const mode of [0,1]) {
    const width=mode?26:24;
    for(let pos=0;pos<width;pos++)for(const value of [1,0x80,255]) {
      const raw=Buffer.alloc(width+3);raw[pos]=value;raw.set([7,8,9],width);check(call,raw,mode);accepted++;
    }
    const raw=Buffer.alloc(width,255);
    for(let n=0;n<width;n++) {
      assert.throws(()=>run(call,raw.subarray(0,n),mode),/UnexpectedEnd/);rejected++;
      check(call,raw,mode);
    }
  }
  assert.throws(()=>run(call,Buffer.alloc(26),2),/InvalidMode/);rejected++;
  return {accepted,rejected};
}
export function oleReference(call,cfb) {
  const files=[],skipped=[];let rejected=0;
  for(const name of ["한셀OLE.hwp","issue5724/2689441_wmf_contents_ole.hwp"]) {
    const path=new URL(`../../reference/rhwp/samples/${name}`,import.meta.url);
    if(!existsSync(path)){skipped.push(name);continue;}
    cfb.parse(readFileSync(path),{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content),flags=h.readUInt32LE(36);
    assert.equal(h.readUInt32LE(32),0x05010001);assert.equal(flags&(2|4|16|256|1024),0);
    const raw=Buffer.from(cfb.findExact('/BodyText/Section0').content),b=flags&1?inflateRawSync(raw):raw;
    assert.deepEqual(call(3,Buffer.concat([h,raw]),b.length),b);
    const rows=documentRecords(b).filter(r=>r.tag===84);assert.equal(rows.length,1);
    const ownership=oleActual(call,h.readUInt32LE(32),b);
    const rawDoc=Buffer.from(cfb.findExact('/DocInfo').content),doc=flags&1?inflateRawSync(rawDoc):rawDoc;
    const sections=[{index:0,bytes:b}];
    const document=documentActual(call,h,doc,sections);
    const bin=documentRecords(doc).find(r=>r.tag===18);
    assert.deepEqual(doc.subarray(bin.start,bin.end),Buffer.from('0200010003004f004c004500','hex'));
    assert.equal(cfb.findExact('/BinData/BIN0001'),null);
    assert.ok(cfb.findExact('/BinData/BIN0001.OLE'));
    assert.throws(()=>call(25,Buffer.concat([w(67108864),readFileSync(path)])),/MissingHwpEntry/);
    const container={pending:'storage extension OLE: MissingHwpEntry'};
    const record=rows[0],missing=Buffer.concat([b.subarray(0,record.offset),b.subarray(record.end)]),duplicate=Buffer.concat([b.subarray(0,record.end),b.subarray(record.offset,record.end),b.subarray(record.end)]);
    for(const [bad,error] of [[missing,/MissingOle/],[duplicate,/DuplicateOle/]]) {
      assert.throws(()=>oleRun(call,h.readUInt32LE(32),bad),error);
      assert.throws(()=>call(24,decodedDocumentInput(h,doc,[{index:0,bytes:bad}])),error);
      oleActual(call,h.readUInt32LE(32),b);
    }
    const p=b.subarray(rows[0].start,rows[0].end);assert.equal(p.length,30);
    const changedSection=Buffer.from(b);changedSection.writeUInt32LE((changedSection.readUInt32LE(record.start)^256)>>>0,record.start);
    const info=Buffer.from(doc),properties=documentRecords(doc).find(r=>r.tag===16);info.writeUInt16LE(2,properties.start);
    documentActual(call,h,info,[{index:0,bytes:b},{index:1,bytes:changedSection}]);
    assert.equal(p.readUInt16LE(12),1);check(call,p,1);
    for(let n=0;n<26;n++){assert.throws(()=>run(call,p.subarray(0,n),1),/UnexpectedEnd/);rejected++;check(call,p,1);}
    // Border color must not leak into the adjacent BinData ID.
    const changed=Buffer.from(p);changed.writeUInt32LE(0xaabbccdd,14);check(call,changed,1);
    assert.equal(run(call,changed,1).readUInt16LE(12),1);
    assert.equal(changed.readUInt32LE(12),0xccdd0001);
    // Truncating unknown tail bytes is not a required-field error.
    for(let n=26;n<30;n++)check(call,p.subarray(0,n),1);
    files.push({name,attributes:p.readUInt32LE(0),extentX:p.readInt32LE(4),extentY:p.readInt32LE(8),binDataId:p.readUInt16LE(12),extraBytes:4,ownership,document,container});
  }
  return {files,rejected,skipped};
}
