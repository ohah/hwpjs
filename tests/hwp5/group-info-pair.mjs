import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {documentRecords} from "./documents.mjs";
import {sectionXml} from "./fixture-xml.mjs";
export function groupInfoPair(call,cfb){
  const root=new URL('../../reference/rhwp/samples/',import.meta.url),name='2025 행정업무운영 편람(최종)';
  const file=new URL(name+'.hwp',root);if(!existsSync(file))return {skipped:true};
  cfb.parse(readFileSync(file),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content);
  const b=call(3,Buffer.concat([h,Buffer.from(cfb.findExact('/BodyText/Section0').content)])),stack=[],actual=[];
  for(const r of documentRecords(b)){
    const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;
    if(r.tag===76&&b.readUInt32LE(r.start)===0x24636f6e){
      const p=b.subarray(r.start,r.end),base=(stack[level-1]?.tag===71?8:4)+42,start=base+50+p.readUInt16LE(base)*96;
      const result=call(84,Buffer.concat([Buffer.from([1]),p.subarray(start)])),count=result.readUInt32LE();
      assert.equal(result.readUInt32LE(4+count*4),1);actual.push(result.readUInt32LE(8+count*4));
    }
    stack.push(r);
  }
  const xml=sectionXml(readFileSync(new URL(name+'.hwpx',root)));
  const expected=[...xml.matchAll(/<hp:container\b[^>]*\binstid="(\d+)"[^>]*>/g)].map(m=>Number(m[1]));
  assert.equal(actual.length,21);assert.deepEqual(actual,expected);
  return {groups:actual.length,nonzero:actual.filter(n=>n!==0).length};
}
