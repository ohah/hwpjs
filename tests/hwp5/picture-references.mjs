import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { documentRecords,decodedDocumentInput } from "./documents.mjs";
import { pictureReferenceRun,pictureOwnerActual } from "./picture-validation.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
import { sectionXml } from "./fixture-xml.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function pictureReferenceEdges(call){
  const b=Buffer.alloc(85);b.writeUInt32LE(76|4<<20);b.writeUInt32LE(0x24706963,4);b.writeUInt32LE(85|1<<10|73<<20,8);
  let accepted=0,rejected=0;
  for(const count of [0,1,2,65534,65535])for(const id of [0,1,2,3,65535]){
    b.writeUInt16LE(id,83);
    if(id>count){assert.throws(()=>pictureReferenceRun(call,0x05010001,b,count),/InvalidPictureImageReference/);rejected++;}
    else {const r=pictureOwnerActual(call,0x05010001,b,0,count);assert.equal(r[2],0);assert.equal(r[7],Number(id>0));assert.equal(r[8],Number(id===0));accepted++;}
  }
  return {accepted,rejected};
}
export function pictureReferenceDocuments(call,cfb){
  const root=new URL('../../reference/rhwp/samples/',import.meta.url),files=[];let rejected=0;
  for(const name of ['pic-crop-01','task1749/saved_bounds_cumulative_page_break']){
    const path=new URL(name+'.hwp',root);if(!existsSync(path)){files.push({name,skipped:true});continue;}
    const file=readFileSync(path);cfb.parse(file,{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content),v=h.readUInt32LE(32);
    const decode=path=>call(3,Buffer.concat([h,Buffer.from(cfb.findExact(path).content)]));
    const doc=decode('/DocInfo'),b=decode('/BodyText/Section0'),bins=documentRecords(doc).filter(r=>r.tag===18),pictures=documentRecords(b).filter(r=>r.tag===85);
    assert.equal(bins.length,1);assert.equal(pictures.length,2);
    const nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
    const input=bytes=>decodedDocumentInput(h,doc,[{index:0,bytes}]);
    const full=bytes=>call(25,Buffer.concat([w(64*1024*1024),Buffer.from(cfb.write({nodes:nodes.map(n=>n.parent===body&&n.name==='Section0'?{...n,content:h.readUInt32LE(36)&1?deflateRawSync(bytes):bytes}:n)}))]));
    const original=call(24,input(b)),container=full(b),stats=pictureOwnerActual(call,v,b,0,1);
    assert.deepEqual(container.subarray(0,original.length),original);
    stats.forEach((n,i)=>assert.equal(original.readUInt32LE(sectionFieldOffset(0,'pictures',i)),n));
    if(name==='pic-crop-01'){
      assert.deepEqual(pictures.map(r=>b.readUInt16LE(r.start+71)),[1,1]);assert.equal(doc.readUInt16LE(bins[0].start+2),3);
      assert.ok(cfb.findExact('/BinData/BIN0003.jpg'));assert.ok(cfb.findExact('/BinData/BIN0001.jpg'));
      const moved=cfb.write({nodes:nodes.map(n=>n.name==='BIN0003.jpg'?{...n,name:'BIN0004.jpg'}:n)});
      assert.throws(()=>call(25,Buffer.concat([w(64*1024*1024),Buffer.from(moved)])),/MissingHwpEntry/);rejected++;
      assert.deepEqual(full(b),container);
    }else{
      assert.deepEqual(pictures.map(r=>b.readUInt16LE(r.start+71)),[0,1]);assert.equal(stats[8],1);
      const xml=sectionXml(readFileSync(new URL(name+'.hwpx',root)));
      assert.deepEqual([...xml.matchAll(/<hc:img\b[^>]*binaryItemIDRef="([^"]*)"[^>]*>/g)].map(m=>m[1]),['','image1']);
    }
    for(const r of pictures)for(const id of [2,65535]){
      const bad=Buffer.from(b);bad.writeUInt16LE(id,r.start+71);
      assert.throws(()=>pictureReferenceRun(call,v,bad,1),/InvalidPictureImageReference/);rejected++;
      assert.throws(()=>call(24,input(bad)),/InvalidPictureImageReference/);rejected++;
      assert.throws(()=>full(bad),/InvalidPictureImageReference/);rejected++;
      assert.deepEqual(call(24,input(b)),original);assert.deepEqual(full(b),container);
    }
    files.push({name,pictures:2,ordinals:stats[7],absent:stats[8]});
  }
  return {files,rejected};
}
