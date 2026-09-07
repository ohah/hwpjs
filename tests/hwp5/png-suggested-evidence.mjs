import assert from 'node:assert/strict';
import {keywordPrefixEvidence} from './png-text-evidence.mjs';
export function suggestedEvidence({chunks}){
  const entries=[],names=new Set(),fields=Array(8).fill(0),idat=chunks.findIndex(c=>c.name==='IDAT');
  chunks.forEach(({name,payload},index)=>{
    if(name!=='sPLT')return;assert.ok(index<idat);
    const {key,remaining:r}=keywordPrefixEvidence(payload);assert.ok(r.length>=1);const depth=r[0];assert.ok(depth===8||depth===16);
    const identity=key.toString('hex');assert.ok(!names.has(identity));names.add(identity);
    const width=depth===8?6:10,raw=r.subarray(1);assert.equal(raw.length%width,0);
    const samples=[];let previous=65535,zeros=0;
    for(let i=0;i<raw.length;i+=width){const e=[];for(let j=0;j<4;j++)e.push(depth===8?raw[i+j]:raw.readUInt16BE(i+2*j));const f=raw.readUInt16BE(i+width-2);assert.ok(f<=previous);previous=f;zeros+=f===0?1:0;e.push(f);samples.push(e);}
    fields[0]++;fields[1]+=key.length;fields[2]+=samples.length;fields[depth===8?3:4]+=samples.length;fields[5]+=zeros;fields[6]+=samples.length===0?1:0;fields[7]+=payload.length;
    entries.push({name:key,depth,samples});
  });return {fields,entries};
}
export function suggestedWire(t){
  const s=t.suggestedPalettes,head=Buffer.alloc(40);[...s.fields,t.deferredChunks,t.deferredBytes].forEach((v,i)=>head.writeUInt32LE(v,i*4));
  const parts=[head];for(const v of s.entries){const h=Buffer.alloc(12);[v.depth,v.name.length,v.samples.length].forEach((n,i)=>h.writeUInt32LE(n,i*4));const data=Buffer.alloc(v.samples.length*10);v.samples.forEach((e,i)=>e.forEach((n,j)=>data.writeUInt16LE(n,i*10+j*2)));parts.push(h,v.name,data);}return Buffer.concat(parts);
}
