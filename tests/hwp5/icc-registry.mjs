import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const source=JSON.parse(readFileSync(new URL('../../src/image/icc/registry/source.json',import.meta.url),'utf8'));
const cmm=new Set(source.sources[0].entries.map(e=>e[0])),manufacturers=new Set(source.sources[1].entries.map(e=>e[0])),devices=new Set(source.sources[2].entries.map(e=>e.join(':')));
function status(key,set,complete){return key===0?0:set.has(key)?1:complete?2:3;}
export function registryWire(c,parent,model,creator){
  const modelStatus=model===0?0:parent===0?3:devices.has(`${parent}:${model}`)?1:source.sources[2].complete&&source.missingDeviceManufacturers.length===0?2:3;
  const fields=[status(c,cmm,source.sources[0].complete),status(parent,manufacturers,source.sources[1].complete),modelStatus,status(creator,manufacturers,source.sources[1].complete)],out=Buffer.alloc(16);
  fields.forEach((v,i)=>out.writeUInt32LE(v,i*4));return out;
}
export function iccRegistryEdges(call){
  let comparisons=0,rejected=0;
  function check(c=0,parent=0,model=0,creator=0,major=4){const b=Buffer.alloc(128);b[8]=major;b.write('acsp',36);[c,parent,model,creator].forEach((v,i)=>b.writeUInt32BE(v,[4,48,52,80][i]));assert.deepEqual(call(149,b,128),registryWire(c,parent,model,creator));comparisons++;return b;}
  for(const [key] of source.sources[0].entries)for(const delta of [-1,0,1])check((key+delta)>>>0);
  for(const [key] of source.sources[1].entries)for(const delta of [-1,0,1]){check(0,(key+delta)>>>0);check(0,0,0,(key+delta)>>>0);}
  for(const [parent,model] of source.sources[2].entries){check(0,parent,model);check(0,0,model);check(0,(parent+1)>>>0,model);check(0,parent,(model+1)>>>0);}
  for(const major of [2,4])for(const key of [0,1,0x7fffffff,0x80000000,0xffffffff,0x4c4e5600,0x46502a2a,0x444e502e])check(key,key,key,key,major);
  const base=check(0x41444245,0x41434552,0x41444132,0x4150504c);
  for(let size=0;size<128;size++){assert.throws(()=>call(149,base.subarray(0,size),128),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;}
  for(const [b,limit] of [[base,127],[Buffer.concat([base,Buffer.from([0])]),129]]){assert.throws(()=>call(149,b,limit),e=>!(e instanceof WebAssembly.RuntimeError));rejected++;}
  check();return {comparisons,rejected,cmmEntries:cmm.size,manufacturerEntries:manufacturers.size,devicePairs:devices.size};
}
