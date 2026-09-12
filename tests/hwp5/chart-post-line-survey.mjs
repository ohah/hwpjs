import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {lineItemsOracle} from './chart-line-items-oracle.mjs';
import {observePostLine as observe} from './chart-post-line-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,typeRejects=0,ids=0,variants=0;
const err=name=>e=>e.constructor===Error&&e.message===name;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
 const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const e=lineItemsOracle(b),prior=e.rows.at(-1),r=observe(b,e.end,prior.types,prior.objects);
 if(verify){
  for(let cut=e.end;cut<r.end;cut++){assert.throws(()=>observe(b.subarray(0,cut),e.end,prior.types,prior.objects),err('IncompletePostLineObservation'));cuts++;}
  for(const id of new Set(r.references.map(at=>b.readUInt32LE(at))))for(const replacement of [null,{...prior.types.get(id),name:'VtOther\0'},{...prior.types.get(id),version:99}]){const wrong=new Map(prior.types);if(replacement)wrong.set(id,replacement);else wrong.delete(id);assert.throws(()=>observe(b,e.end,wrong,prior.objects),err('UnsupportedPostLineObservationType'));typeRejects++;}
  for(const id of [0xffffffff,prior.objects.values().next().value]){const bad=Buffer.from(b);bad.writeUInt32LE(id,r.array.start);assert.throws(()=>observe(bad,e.end,prior.types,prior.objects),err('UnsupportedPostLineObservationObject'));ids++;}
  assert.deepEqual(observe(b.subarray(0,r.end),e.end,prior.types,prior.objects),r);const after=Buffer.from(b);after.fill(0xff,r.end);assert.deepEqual(observe(after,e.end,prior.types,prior.objects),r);
  const raw=Buffer.from(b);raw.fill(0xff,e.end,r.baseOffset);assert.deepEqual(observe(raw,e.end,prior.types,prior.objects),{...r,raw194:'ff'.repeat(194)});variants++;
  const words=Buffer.from(b);words.writeUInt16LE(65535,r.array.firstOffset);words.writeUInt16LE(0,r.array.secondOffset);assert.deepEqual(observe(words,e.end,prior.types,prior.objects),{...r,array:{...r.array,first:65535,second:0}});variants++;
  assert.deepEqual(observe(b,e.end,prior.types,prior.objects),r);
 }
 const {types,objects,...view}=r;
 rows.push({sha256:digest(b),...view,nextBytes:b.subarray(r.end,r.end+32).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:rows.length,lengths:[...new Set(rows.map(r=>r.end-r.start))],words:[...new Set(rows.map(r=>r.array.first+'/'+r.array.second))],rawVariants:new Set(rows.map(r=>r.raw194)).size,verification:verify?{cuts,typeRejects,ids,variants}:null,rows},null,2));}finally{cfb.close();}
