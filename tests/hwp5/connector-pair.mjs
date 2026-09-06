import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {documentRecords} from "./documents.mjs";
import {sectionXml} from "./fixture-xml.mjs";
import {connectorActual} from "./shape-connector.mjs";
export function connectorPair(call,cfb){
  const root=new URL('../../reference/rhwp/samples/',import.meta.url),name='2025 행정업무운영 편람(최종)';
  const path=new URL(name+'.hwp',root);if(!existsSync(path))return {skipped:true};
  cfb.parse(readFileSync(path),{strict:true});const h=Buffer.from(cfb.findExact('/FileHeader').content);
  const xmlFile=readFileSync(new URL(name+'.hwpx',root));let parsed=0,points=0;
  const attr=(xml,name)=>{const match=xml.match(new RegExp(`\\b${name}="([^"]*)"`));assert.ok(match);return match[1];};
  for(const section of [2,7]){
    const b=call(3,Buffer.concat([h,Buffer.from(cfb.findExact('/BodyText/Section'+section).content)])),stack=[],payloads=[];
    for(const r of documentRecords(b)){
      const level=b.readUInt32LE(r.offset)>>>10&1023;stack.length=level;const parent=stack[level-1];
      if(r.tag===78&&parent?.tag===76&&b.readUInt32LE(parent.start)===0x24636f6c)payloads.push(b.subarray(r.start,r.end));
      stack.push(r);
    }
    const xml=sectionXml(xmlFile,section),items=[...xml.matchAll(/<hp:connectLine\b[\s\S]*?<\/hp:connectLine>/g)].map(m=>m[0]);
    assert.equal(items.length,section===2?4:16);assert.equal(payloads.length,items.length);
    for(const [i,p] of payloads.entries()){
      connectorActual(call,p,false);const result=call(83,p),item=items[i];
      const start=item.match(/<hp:startPt\b[^>]*>/)[0],end=item.match(/<hp:endPt\b[^>]*>/)[0];
      for(const [node,at,idAt] of [[start,0,20],[end,8,28]]){
        assert.equal(result.readInt32LE(at),Number(attr(node,'x'))|0);
        assert.equal(result.readInt32LE(at+4),Number(attr(node,'y'))|0);
        assert.equal(result.readUInt32LE(idAt),Number(attr(node,'subjectIDRef')));
        assert.equal(result.readUInt32LE(idAt+4),Number(attr(node,'subjectIdx')));
      }
      assert.equal(attr(item.match(/^<hp:connectLine\b[^>]*>/)[0],'type'),({1:'STRAIGHT_ONEWAY',4:'STROKE_ONEWAY'})[result.readUInt32LE(16)]);
      const cp=[...item.matchAll(/<hp:point\b[^>]*>/g)].map(m=>m[0]);assert.equal(cp.length,result.readUInt32LE(36));
      for(const [j,node] of cp.entries()){
        assert.equal(result.readInt32LE(40+j*10),Number(attr(node,'x'))|0);
        assert.equal(result.readInt32LE(44+j*10),Number(attr(node,'y'))|0);
        assert.equal(result.readUInt16LE(48+j*10),Number(attr(node,'type')));
      }
      parsed++;points+=cp.length;
    }
  }
  return {parsed,points};
}
