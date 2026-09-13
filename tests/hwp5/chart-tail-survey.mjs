import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';import {titleBodyOracle} from './chart-title-body-oracle.mjs';import {observeChartTail} from './chart-tail-evidence.mjs';import {incompleteChartTail} from './chart-tail-errors.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,ids=0,declarations=0,references=0,raws=0;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const c=titleBodyOracle(b).r,read=bytes=>observeChartTail(bytes,c.end,c.types,c.objects),r=read(b);assert.equal(r.end,b.length);
 if(verify){
  for(let cut=c.end;cut<r.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),incompleteChartTail);cuts++;}
  assert.deepEqual(read(Buffer.concat([b,Buffer.alloc(91,255)])),r);
  for(const id of [0xffffffff,c.blockId]){const bad=Buffer.from(b);bad.writeUInt32LE(id,r.start);assert.throws(()=>read(bad),e=>e.constructor===Error&&e.message==='UnsupportedListPrefixObservationObject');ids++;}
  for(const d of [...r.list.declarations,...r.window.declarations])for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>read(bad),e=>e.constructor===Error&&['UnsupportedListPrefixObservationType','UnsupportedWindowObservationType'].includes(e.message));declarations++;}
  const base=r.list.collection.baseTypeId,collection=r.list.collection.typeId;
  for(const at of [...r.list.references,...r.window.references]){const bad=Buffer.from(b);bad.writeUInt32LE(b.readUInt32LE(at)===base?collection:base,at);assert.throws(()=>read(bad),e=>e.constructor===Error&&['UnsupportedListPrefixObservationType','UnsupportedWindowObservationType'].includes(e.message));references++;}
  const raw=Buffer.from(b);raw.fill(255,r.list.end,r.window.start);raw.writeUInt16LE(65535,r.list.collection.wordOffset);raw.writeUInt16LE(0xa55a,r.window.wordOffset);assert.deepEqual(read(raw),{...r,raw26:'ff'.repeat(26),list:{...r.list,collection:{...r.list.collection,word:65535}},window:{...r.window,rawWord:0xa55a}});raws++;assert.deepEqual(read(b),r);
 }
 rows.push({sha256:digest(b),start:r.start,listBytes:r.list.end-r.start,windowBytes:r.window.end-r.window.start,end:r.end,remaining:b.length-r.end,listWord:r.list.collection.word,windowWord:r.window.rawWord,raw26:r.raw26,newTypes:r.types.size-c.types.size,registeredObjects:r.objects.size-c.objects.size,preWindowWord:b.readUInt32LE(r.window.start-4),preWindowWordAlreadyRegistered:r.list.objects.has(b.readUInt32LE(r.window.start-4))});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:43,verification:verify?{cuts,ids,declarations,references,raws}:null,rows},null,2));}finally{cfb.close();}
