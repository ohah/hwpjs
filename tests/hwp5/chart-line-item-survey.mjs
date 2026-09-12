import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {nullableTitleOracle} from './chart-nullable-title-oracle.mjs';
import {observeLineItem as observe} from './chart-line-item-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,typeRejects=0,duplicates=0,rawChanges=0;
const err=name=>e=>e.constructor===Error&&e.message===name;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
 const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const axis=nullableTitleOracle(b),word=b.readUInt16LE(axis.end),items=[];let offset=axis.end+2,types=axis.r.types,objects=axis.seen;
 // Two selected candidates in this corpus, not a product count rule derived
 // from the preceding word or a scan until a matching marker is found.
 for(let i=0;i<2;i++){
  const beforeTypes=new Map(types),beforeObjects=new Set(objects),r=observe(b,offset,types,objects);
  if(verify){
   for(let cut=offset;cut<r.end;cut++){assert.throws(()=>observe(b.subarray(0,cut),offset,types,objects),err('IncompleteLineItemObservation'));cuts++;}
   for(const d of r.declarations)for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>observe(bad,offset,types,objects),err('UnsupportedLineItemObservationType'));typeRejects++;}
   for(const id of [r.typeId,r.baseTypeId])if(types.has(id)){const wrong=new Map(types);wrong.set(id,{...types.get(id),version:99});assert.throws(()=>observe(b,offset,wrong,objects),err('UnsupportedLineItemObservationType'));typeRejects++;}
   for(const id of [0xffffffff,objects.values().next().value]){const bad=Buffer.from(b);bad.writeUInt32LE(id,offset);assert.throws(()=>observe(bad,offset,types,objects),err('UnsupportedLineItemObservationObject'));duplicates++;}
   assert.deepEqual(observe(b.subarray(0,r.end),offset,types,objects),r);
   const after=Buffer.from(b);after.fill(0xff,r.end);assert.deepEqual(observe(after,offset,types,objects),r);
   const changed=Buffer.from(b);changed.fill(0xff,r.rawStart,r.baseOffset);assert.deepEqual(observe(changed,offset,types,objects),{...r,raw52:'ff'.repeat(52)});rawChanges++;
   assert.deepEqual(types,beforeTypes);assert.deepEqual(objects,beforeObjects);assert.deepEqual(observe(b,offset,types,objects),r);
  }
  const {types:nextTypes,objects:nextObjects,...view}=r;items.push(view);types=nextTypes;objects=nextObjects;offset=r.end;
 }
 rows.push({sha256:digest(b),prefixOffset:axis.end,word,items,end:offset,nextBytes:b.subarray(offset,offset+64).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:rows.length,items:rows.reduce((n,r)=>n+r.items.length,0),words:[...new Set(rows.map(r=>r.word))],rawVariants:new Set(rows.flatMap(r=>r.items.map(i=>i.raw52))).size,verification:verify?{cuts,typeRejects,duplicates,rawChanges}:null,rows},null,2));}finally{cfb.close();}
