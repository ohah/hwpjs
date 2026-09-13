import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';import {seriesSuffixOracle} from './chart-series-suffix-oracle.mjs';import {observeSeriesPicture} from './chart-series-picture-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,ids=0,types=0,data=0,raws=0;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const c=seriesSuffixOracle(b),read=bytes=>observeSeriesPicture(bytes,c.end,c.r.types,c.r.objects),r=read(b);
 if(verify){
  for(let cut=c.end;cut<r.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),e=>e.constructor===Error&&e.message==='IncompleteSeriesPictureObservation');cuts++;}
  assert.deepEqual(read(b.subarray(0,r.end)),r);const after=Buffer.from(b);after.fill(255,r.end);assert.deepEqual(read(after),r);
  for(const id of [0xffffffff,c.r.blockId]){const bad=Buffer.from(b);bad.writeUInt32LE(id,r.pictureStart);assert.throws(()=>read(bad),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPictureObservationObject');ids++;}
  for(const id of new Set(r.references.map(at=>b.readUInt32LE(at)))){const wrong=new Map(c.r.types);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observeSeriesPicture(b,c.end,wrong,c.r.objects),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPictureObservationType');types++;}
  for(const id of [0,1,c.r.blockId,0xfffffffe]){const bad=Buffer.from(b);bad.writeUInt32LE(id,r.pictureEnd-8);assert.throws(()=>read(bad),e=>e.constructor===Error&&e.message==='UnsupportedSeriesPictureObservationData');data++;}
  const raw=Buffer.from(b);for(const f of r.rawFields)raw.fill(255,f.start,f.start+f.n);assert.deepEqual(read(raw),{...r,raw40:'ff'.repeat(40),picture:{...r.picture,raw4:'ff'.repeat(4)},rawFields:r.rawFields.map(f=>({...f,hex:'ff'.repeat(f.n)}))});raws++;
  assert.deepEqual(read(b),r);
 }
 rows.push({sha256:digest(b),start:r.start,pictureStart:r.pictureStart,pictureEnd:r.pictureEnd,raw40:r.raw40,pictureRaw4:r.picture.raw4,end:r.end,next:b.subarray(r.end,r.end+40).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:43,verification:verify?{cuts,ids,types,data,raws}:null,rows},null,2));}finally{cfb.close();}
