import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {postLineOracle} from './chart-post-line-oracle.mjs';import {observeSeriesPrefix as observe} from './chart-series-prefix-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,typeRejects=0,ids=0,variants=0;
const err=name=>e=>e.constructor===Error&&e.message===name;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const prior=postLineOracle(b),r=observe(b,prior.end,prior.r.types,prior.r.objects);
 if(verify){
  for(let cut=prior.end;cut<r.end;cut++){assert.throws(()=>observe(b.subarray(0,cut),prior.end,prior.r.types,prior.r.objects),err('IncompleteSeriesPrefixObservation'));cuts++;}
  for(const d of r.declarations)for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>observe(bad,prior.end,prior.r.types,prior.r.objects),err('UnsupportedSeriesPrefixObservationType'));typeRejects++;}
  for(const id of new Set(r.references.map(at=>b.readUInt32LE(at))))if(prior.r.types.has(id)){const wrong=new Map(prior.r.types);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observe(b,prior.end,wrong,prior.r.objects),err('UnsupportedSeriesPrefixObservationType'));typeRejects++;}
  for(const at of [r.start,r.array.start])for(const id of [0xffffffff,prior.r.objects.values().next().value]){const bad=Buffer.from(b);bad.writeUInt32LE(id,at);assert.throws(()=>observe(bad,prior.end,prior.r.types,prior.r.objects),err('UnsupportedSeriesPrefixObservationObject'));ids++;}
  const repeat=Buffer.from(b);repeat.writeUInt32LE(r.objectId,r.array.start);assert.throws(()=>observe(repeat,prior.end,prior.r.types,prior.r.objects),err('UnsupportedSeriesPrefixObservationObject'));ids++;
  assert.deepEqual(observe(b.subarray(0,r.end),prior.end,prior.r.types,prior.r.objects),r);const after=Buffer.from(b);after.fill(0xff,r.end);assert.deepEqual(observe(after,prior.end,prior.r.types,prior.r.objects),r);
  const raw=Buffer.from(b);raw.fill(0xff,r.rawStart,r.array.start);assert.deepEqual(observe(raw,prior.end,prior.r.types,prior.r.objects),{...r,raw66:'ff'.repeat(66)});variants++;
  const words=Buffer.from(b);words.writeUInt16LE(65535,r.array.firstOffset);words.writeUInt16LE(0,r.array.secondOffset);assert.deepEqual(observe(words,prior.end,prior.r.types,prior.r.objects),{...r,array:{...r.array,first:65535,second:0}});variants++;
 }
 const {types,objects,...view}=r;rows.push({sha256:digest(b),...view,nextBytes:b.subarray(r.end,r.end+32).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:rows.length,lengths:[...new Set(rows.map(r=>r.end-r.start))],words:[...new Set(rows.map(r=>r.array.first+'/'+r.array.second))],rawVariants:new Set(rows.map(r=>r.raw66)).size,verification:verify?{cuts,typeRejects,ids,variants}:null,rows},null,2));}finally{cfb.close();}
