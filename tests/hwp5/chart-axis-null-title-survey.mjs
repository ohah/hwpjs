import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCfbReader} from '../../js/cfb.mjs';
import {oleContainerSurvey} from './ole-container-survey.mjs';
import {streamBytes,digest} from './hwp-corpus-evidence.mjs';
import {axesOracle} from './chart-axes-oracle.mjs';
import {observeSurfacePrefix} from './chart-surface-evidence.mjs';
import {observeAxis,observeAxisNullableTitle as observe} from './chart-axis-evidence.mjs';
const int=(n,size=4)=>{const b=Buffer.alloc(size);b.writeUIntLE(n,0,size);return b;};
const cfb=await createCfbReader(readFileSync('zig-out/bin/hwpjs.wasm')),rows=[],verify=process.argv.includes('--verify');let cuts=0,versions=0,variants=0;
try{const corpus=await oleContainerSurvey((env,payload)=>{
 cfb.parse(Buffer.from(payload),{strict:true});const entry=cfb.findExact('/Contents');if(!entry)return;
 const b=Buffer.from(streamBytes(entry));if(b.indexOf(Buffer.from('VtChart\0'))<0)return;
 const a=axesOracle(b),prior=a.rows.at(-1).result,s=observeSurfacePrefix(b,a.end,prior.types),types=new Map(prior.types);
 for(const d of s.declarations)types.set(d.id,{name:d.name,version:d.version});
 const r=observe(b,s.end,types,prior.strings,prior.numbers);
 assert.equal(r.axis.text,null);assert.equal(r.value,null);
 assert.throws(()=>observeAxis(b,s.end,types,prior.strings,prior.numbers),e=>e.constructor===Error&&e.message==='UnsupportedAxisObservationObject');
 if(verify){
  for(let cut=s.end;cut<r.end;cut++){assert.throws(()=>observe(b.subarray(0,cut),s.end,types,prior.strings,prior.numbers),e=>e.constructor===Error&&['IncompleteAxisObservation','IncompleteAxisTail'].includes(e.message));cuts++;}
  const ids=new Set(r.axis.references.map(at=>b.readUInt32LE(at)));ids.add(r.tail.baseTypeId);
  for(const id of ids){const wrong=new Map(types);wrong.set(id,{...wrong.get(id),version:99});assert.throws(()=>observe(b,s.end,wrong,prior.strings,prior.numbers),e=>e.constructor===Error&&['UnsupportedAxisObservationType','UnsupportedAxisTailType'].includes(e.message));versions++;}
  assert.deepEqual(observe(b.subarray(0,r.end),s.end,types,prior.strings,prior.numbers),r);
  const after=Buffer.from(b);after.fill(0xff,r.end);assert.deepEqual(observe(after,s.end,types,prior.strings,prior.numbers),r);
  // Text follows the copied 24-byte middle, not a byte-pattern search.
  const middle=r.axis.rawFields.find(f=>f.n===24),at=middle.start+middle.n;
  const alias=Buffer.from(b);alias.writeUInt32LE(r.axis.fontName.id,at);
  const aliasResult=observe(alias,s.end,types,prior.strings,prior.numbers);assert.equal(aliasResult.axis.text.hex,r.axis.fontName.hex);assert.equal(aliasResult.axis.text.introduced,false);assert.equal(aliasResult.end,r.end);variants++;
  const type=name=>[...types].find(([,v])=>v.name===name+'\0')[0];
  const empty=Buffer.concat([int(0xfffffffe),int(type('VtString')),int(0,2),int(255,1),int(type('VtValue')),int(type('VtObject'))]);
  const changed=Buffer.concat([b.subarray(0,at),empty,b.subarray(at+4)]),emptyResult=observe(changed,s.end,types,prior.strings,prior.numbers);
  assert.equal(emptyResult.axis.text.hex,'');assert.equal(emptyResult.axis.text.introduced,true);assert.equal(emptyResult.end,r.end+empty.length-4);variants++;
  assert.deepEqual(observe(b,s.end,types,prior.strings,prior.numbers),r);
 }
 rows.push({sha256:digest(b),start:s.end,end:r.end,fontName:r.axis.fontName,text:r.axis.text,scale:r.value,tail:r.tail,nextBytes:b.subarray(r.end,r.end+32).toString('hex')});
});assert.equal(rows.length,43);console.log(JSON.stringify({corpus,observations:rows.length,verification:verify?{cuts,versions,variants}:null,rows},null,2));}finally{cfb.close();}
