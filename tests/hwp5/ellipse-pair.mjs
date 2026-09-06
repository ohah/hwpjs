import assert from "node:assert/strict";
import { existsSync,readFileSync } from "node:fs";
import { sectionXml } from "./fixture-xml.mjs";
import { documentRecords } from "./documents.mjs";
import { ellipseActual } from "./shape-ellipse.mjs";
export function ellipsePair(call,cfb){
  const base=new URL('../../reference/rhwp/samples/',import.meta.url),files=[],skipped=[];
  for(const [name,count] of [['hwp3-sample16-hwp5',3],['복학원서',1]]){
    const hwp=new URL(`${name}.hwp`,base),hwpx=new URL(`${name}.hwpx`,base);
    if(!existsSync(hwp)||!existsSync(hwpx)){skipped.push(name);continue;}
    cfb.parse(readFileSync(hwp),{strict:true});
    const h=Buffer.from(cfb.findExact('/FileHeader').content);
    const b=call(3,Buffer.concat([h,Buffer.from(cfb.findExact('/BodyText/Section0').content)]));
    const records=documentRecords(b).filter(r=>r.tag===80),xml=sectionXml(readFileSync(hwpx));
    const elements=[...xml.matchAll(/<hp:ellipse\b[^>]*>[\s\S]*?<\/hp:ellipse>/g)].map(m=>m[0]);
    assert.equal(records.length,count);assert.equal(elements.length,count);
    let inactiveNonzeroPoints=0;
    for(let i=0;i<count;i++){
      const raw=b.subarray(records[i].start,records[i].end);ellipseActual(call,raw);
      const native=call(60,raw),header=elements[i].slice(0,elements[i].indexOf('>'));
      assert.equal(native.readUInt32LE(60),Number(header.match(/\bintervalDirty="([01])"/)[1]));
      assert.equal(native.readUInt32LE(64),Number(header.match(/\bhasArcPr="([01])"/)[1]));
      for(const [index,field] of ['center','ax1','ax2','start1','end1','start2','end2'].entries()){
        const matches=[...elements[i].matchAll(new RegExp(`<hc:${field}\\b([^>]*)/>`,'g'))];assert.equal(matches.length,1);
        const point=['x','y'].map(key=>Number(matches[0][1].match(new RegExp(`\\b${key}="(-?\\d+)"`))[1]));
        assert.deepEqual([native.readInt32LE(4+index*8),native.readInt32LE(8+index*8)],point);
        if(index>=3&&native.readUInt32LE(64)===0&&point.some(v=>v!==0))inactiveNonzeroPoints++;
      }
    }
    files.push({name,ellipses:count,inactiveNonzeroPoints});
  }
  return {files,skipped};
}
