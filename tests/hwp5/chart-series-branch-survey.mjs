import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';import {oleContainerSurvey} from './ole-container-survey.mjs';import {streamBytes,digest} from './hwp-corpus-evidence.mjs';import {seriesPrefixOracle} from './chart-series-prefix-oracle.mjs';import {observeSeriesBranch as observe} from './chart-series-branch-evidence.mjs';
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,typeRejects=0,ids=0,variants=0;
const err=name=>e=>e.constructor===Error&&e.message===name;
try{const corpus=await oleContainerSurvey((envelope,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const q=seriesPrefixOracle(b),words=[q.r.array.first,q.r.array.second];assert([[0,0],[1,1],[4,4]].some(w=>w[0]===words[0]&&w[1]===words[1]));
 // Explicit selected corpus branches, not a product element-count decoder.
 const branch=words[0]===0?'tail':'point',read=bytes=>observe(bytes,q.end,branch,q.r.types,q.r.objects,q.strings),r=read(b);
 if(verify){
  for(let cut=q.end;cut<r.end;cut++){assert.throws(()=>read(b.subarray(0,cut)),err('IncompleteSeriesBranchObservation'));cuts++;}
  for(const d of r.declarations)for(const at of [d.nameOffset,d.versionOffset]){const bad=Buffer.from(b);bad[at]^=1;assert.throws(()=>read(bad),err('UnsupportedSeriesBranchObservationType'));typeRejects++;}
  for(const id of new Set(r.references.map(at=>b.readUInt32LE(at))))if(q.r.types.has(id)){const wrong=new Map(q.r.types);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observe(b,q.end,branch,wrong,q.r.objects,q.strings),err('UnsupportedSeriesBranchObservationType'));typeRejects++;}
  for(const at of r.objectOffsets){const bad=Buffer.from(b);bad.writeUInt32LE(0xffffffff,at);assert.throws(()=>read(bad),err('UnsupportedSeriesBranchObservationObject'));ids++;}
  const duplicate=Buffer.from(b);duplicate.writeUInt32LE(branch==='tail'?r.text.id:r.point.id,r.label.start);assert.throws(()=>read(duplicate),err('UnsupportedSeriesBranchObservationObject'));ids++;
  assert.deepEqual(read(b.subarray(0,r.end)),r);const after=Buffer.from(b);after.fill(0xff,r.end);assert.deepEqual(read(after),r);
  if(branch==='tail'){
   const raw=Buffer.from(b);raw.fill(0xff,q.end,q.end+66);assert.deepEqual(read(raw),{...r,raw66:'ff'.repeat(66)});variants++;
   const aliasId=q.strings.keys().next().value,alias=Buffer.alloc(4);alias.writeUInt32LE(aliasId);const changed=Buffer.concat([b.subarray(0,r.text.start),alias,b.subarray(r.text.end)]),x=read(changed);
   assert.equal(x.text.id,aliasId);assert.equal(x.text.hex,q.strings.get(aliasId).hex);assert.equal(x.text.introduced,false);assert.equal(x.end,r.end-(r.text.end-r.text.start)+4);assert.equal(x.objects.size,r.objects.size-1);variants++;
  }
  assert.deepEqual(read(b),r);
 }
 const {types,objects,strings,...view}=r;rows.push({sha256:digest(b),words,...view,nextBytes:b.subarray(r.end,r.end+40).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,charts:rows.length,branches:rows.reduce((a,r)=>(a[r.branch]=(a[r.branch]||0)+1,a),{}),verification:verify?{cuts,typeRejects,ids,variants}:null,rows},null,2));}finally{cfb.close();}
