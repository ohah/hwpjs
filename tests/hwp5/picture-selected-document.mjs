import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { documentRecords,decodedDocumentInput } from "./documents.mjs";
import { sectionFieldOffset } from "./document-report-wire.mjs";
import { pictureOwnerActual,pictureOwnerRun } from "./picture-validation.mjs";
const w=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;};
export function pictureSelectedDocument(call,cfb){
  const path=new URL('../../reference/rhwp/samples/투명도0-50.hwp',import.meta.url);if(!existsSync(path))return {skipped:true};
  const file=readFileSync(path);cfb.parse(file,{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content),v=h.readUInt32LE(32);
  const decode=path=>call(3,Buffer.concat([h,Buffer.from(cfb.findExact(path).content)]));
  const doc=decode('/DocInfo'),b=decode('/BodyText/Section0'),nodes=cfb.document().nodes,body=nodes.findIndex(n=>n.parent===0&&n.name==='BodyText');
  const records=documentRecords(b).filter(r=>r.tag===85);assert.equal(records.length,2);
  const input=bytes=>decodedDocumentInput(h,doc,[{index:0,bytes}]);
  const replace=(r,p)=>Buffer.concat([b.subarray(0,r.offset),w((b.readUInt32LE(r.offset)&0xfffff)|p.length<<20),p,b.subarray(r.end)]);
  let rejected=0,ordering=0,unselectedPreserved=0;
  for(let mode=0;mode<6;mode++){
    const run=bytes=>call(80,Buffer.concat([Buffer.from([mode]),input(bytes)]));
    const full=bytes=>call(81,Buffer.concat([Buffer.from([mode]),w(64*1024*1024),Buffer.from(cfb.write({nodes:nodes.map(n=>n.parent===body&&n.name==='Section0'?{...n,content:h.readUInt32LE(36)&1?deflateRawSync(bytes):bytes}:n)}))]));
    const report=run(b),container=full(b),expected=pictureOwnerActual(call,v,b,mode,documentRecords(doc).filter(r=>r.tag===18).length);
    assert.deepEqual(expected,[2,0,0,mode>=3?2:0,mode>=4?2:0,mode===5?2:0,2*(91-[73,74,78,82,90,91][mode]),2,0]);
    expected.forEach((n,i)=>assert.equal(report.readUInt32LE(sectionFieldOffset(0,'pictures',i)),n));
    assert.deepEqual(container.subarray(0,report.length),report);
    if(mode===0){assert.deepEqual(call(24,input(b)),report);assert.deepEqual(call(25,Buffer.concat([w(64*1024*1024),file])),container);}
    const reject=(bytes,error)=>{
      assert.throws(()=>pictureOwnerRun(call,v,bytes,mode),error);rejected++;
      assert.throws(()=>run(bytes),error);rejected++;
      assert.throws(()=>full(bytes),error);rejected++;
      assert.deepEqual(run(b),report);assert.deepEqual(full(b),container);
    };
    for(const r of records){
      const short=replace(r,b.subarray(r.start,r.start+[73,74,78,82,90,91][mode]-1));reject(short,/UnexpectedEnd/);
      if(mode>0){call(24,input(short));unselectedPreserved++;}
      if(mode>=3){
        const bad=Buffer.from(b);bad.writeUInt32LE(16,r.start+78);reject(bad,/UnsupportedPictureEffects/);
        call(24,input(bad));unselectedPreserved++;
        const color=Buffer.concat([b.subarray(r.start,r.start+78),w(1),Buffer.alloc(44),w(1),w(0),w(0)]);
        reject(replace(r,color),/UnsupportedPictureColorType/);
      }
    }
    const changed=Buffer.from(b);changed[records[0].start+70]=255;
    const info=Buffer.from(doc),properties=documentRecords(info).find(r=>r.tag===16);info.writeUInt16LE(2,properties.start);
    const parts=[{index:0,bytes:b},{index:1,bytes:changed}];
    const ordered=sections=>call(80,Buffer.concat([Buffer.from([mode]),decodedDocumentInput(h,info,sections)]));
    const canonical=ordered(parts);assert.deepEqual(ordered([...parts].reverse()),canonical);
    assert.equal(canonical.readUInt32LE(sectionFieldOffset(0,'pictures',1)),0);assert.equal(canonical.readUInt32LE(sectionFieldOffset(1,'pictures',1)),1);ordering++;
  }
  for(const probe of [80,81])for(const mode of [12,255]){assert.throws(()=>call(probe,Buffer.from([mode])),/InvalidMode/);rejected++;}
  return {pictures:2,stages:6,rejected,ordering,unselectedPreserved};
}
