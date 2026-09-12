import assert from 'node:assert/strict';
import {chartTextBlockOracle} from './chart-text-block-oracle.mjs';
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
 type('VtChartSection');rawOffsets.push([p,26]);const section=take(26),ids=[],raw=[];
 for(const [name,length] of [['VtBackdrop',50],['VtFill',34],['VtPicture',4]]){
  objectOffsets.push(p);ids.push(long());references.push(p);type(name);rawOffsets.push([p,length]);raw.push(take(length));
 }
 const picture=p;assert.equal(long(),0xffffffff);
 const base=()=>{bases.push(p);type('VtObject');};
 base();const suffixOffset=p,suffix=take(2);base();base();base();
 return {start:block.footnoteStart,end:p,block,declarations,objectOffsets,rawOffsets,references,bases,picture,suffixOffset,
  wire:Buffer.concat([u32(p),u32(block.footnoteId),...ids.map(u32),suffix,section,...raw,block.wire])};
}
