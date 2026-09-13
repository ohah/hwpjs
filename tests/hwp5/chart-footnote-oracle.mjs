import assert from 'node:assert/strict';
import {chartTextBlockOracle} from './chart-text-block-oracle.mjs';
import {readChartSectionFields} from './chart-section-fields-evidence.mjs';
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
export function chartFootnoteOracle(b){
 const block=chartTextBlockOracle(b),types=block.types;let p=block.end;
 const declarations=[...block.declarations],objectOffsets=[block.footnoteStart,...block.objectOffsets],rawOffsets=[...block.rawOffsets],references=[],bases=[];
 const take=n=>{assert.ok(n<=b.length-p);const r=b.subarray(p,p+n);p+=n;return r;};
 const long=()=>take(4).readUInt32LE(),word=()=>take(2).readUInt16LE();
 const type=name=>{
  const idOffset=p,id=long();
  if(!types.has(id)){
   const length=word(),nameOffset=p,actual=take(length).toString('latin1'),versionOffset=p;
   assert.equal(word(),1);assert.equal(actual,name+'\0');types.set(id,actual);declarations.push({idOffset,nameOffset,versionOffset});
  }
  assert.equal(types.get(id),name+'\0');
 };
 let picture,suffixOffset,data;
 const fields=readChartSectionFields({type,object:()=>{objectOffsets.push(p);const id=long();references.push(p);return id;},raw:n=>{rawOffsets.push([p,n]);return take(n);},long:()=>{picture=p;data=long();return data;},word:()=>{suffixOffset=p;return take(2);},base:()=>{bases.push(p);type('VtObject');},reject:()=>assert.equal(data,0xffffffff)});
 const {raw26:section,ids,suffix}=fields,raw=[fields.raw50,fields.raw34,fields.raw4];
 return {start:block.footnoteStart,end:p,block,declarations,objectOffsets,rawOffsets,references,bases,picture,suffixOffset,
  wire:Buffer.concat([u32(p),u32(block.footnoteId),...ids.map(u32),suffix,section,...raw,block.wire])};
}
