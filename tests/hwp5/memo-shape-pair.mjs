import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {documentRecords} from "./documents.mjs";
import {headerXml} from "./fixture-xml.mjs";
export function memoShapePair(call,cfb){
  const root=new URL('../../reference/rhwp/samples/',import.meta.url),files=[];let parsed=0;const unknownValues={};
  const attr=(tag,name)=>{const m=tag.match(new RegExp(`\\b${name}="([^"]*)"`));assert.ok(m);return m[1];};
  const color=s=>{assert.match(s,/^#[0-9a-f]{6}$/i);const rgb=Number.parseInt(s.slice(1),16);return ((rgb&255)<<16)|(rgb&0xff00)|(rgb>>>16);};
  for(const [name,count] of [['hwpx_sample2',1],['rowbreak-problem-pages',2],['[2027] 온새미로 1 본교재',4]]){
    const file=new URL(name+'.hwp',root);if(!existsSync(file)){files.push({name,skipped:true});continue;}
    cfb.parse(readFileSync(file),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content),doc=call(3,Buffer.concat([h,Buffer.from(cfb.findExact('/DocInfo').content)]));
    const records=documentRecords(doc).filter(r=>r.tag===92),xml=headerXml(readFileSync(new URL(name+'.hwpx',root))),items=[...xml.matchAll(/<hh:memoPr\b[^>]*>/g)].map(m=>m[0]);
    assert.equal(records.length,count);assert.equal(items.length,count);
    for(const [i,r] of records.entries()){
      const p=call(87,doc.subarray(r.start,r.end)),item=items[i];
      assert.equal(Number(attr(item,'id')),i+1);
      assert.equal(p.readUInt32LE(),Number(attr(item,'width')));
      assert.equal(p[5],Number(attr(item,'lineWidth')));
      assert.equal(p[4],1);assert.equal(attr(item,'lineType'),'SOLID');
      for(const [field,at] of [['lineColor',6],['fillColor',10],['activeColor',14]])assert.equal(p.readUInt32LE(at),color(attr(item,field)));
      const key=p.readUInt32LE(18)+'/'+attr(item,'memoType');unknownValues[key]=(unknownValues[key]??0)+1;
      parsed++;
    }
    files.push({name,count});
  }
  return {files,parsed,unknownValues};
}
