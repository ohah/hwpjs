import assert from 'node:assert/strict';
import {jpegFrameFixture} from './jpeg-headers.mjs';
import {jpegStoreInput,jpegStoreOracle} from './jpeg-store.mjs';
import {jpegTablesOracle,quantizationFixture,huffmanFixture} from './jpeg-tables.mjs';
const words=ns=>{const b=Buffer.alloc(ns.length*4);ns.forEach((n,i)=>b.writeUInt32LE(n,i*4));return b;};
export function jpegProgressiveInput(frame,events,maximum=65536){return Buffer.concat([words([maximum]),jpegStoreInput(194,frame,events)]);}
export function jpegProgressiveOracle(frame,events){
  jpegStoreOracle(194,frame,events);
  const components=Array.from({length:frame[5]},(_,i)=>({id:frame[6+3*i],q:frame[8+3*i],levels:new Map()}));
  const definitions=new Map(),altered=new Set();let scans=0;
  for(const [kind,payload] of events){
    if(kind===0){
      const wire=jpegTablesOracle(0,payload);
      for(let at=4;at<wire.length;at+=140){
        const id=wire.readUInt32LE(at),definition=wire.subarray(at,at+140),old=definitions.get(id);
        if(old&&!old.equals(definition))for(const c of components)if(c.q===id&&c.levels.has(0))altered.add(c.id);
        definitions.set(id,definition);
      }
    }else if(kind===2){
      const start=payload.at(-3),end=payload.at(-2),high=payload.at(-1)>>4,low=payload.at(-1)&15;
      for(let i=0;i<payload[0];i++){
        const c=components.find(c=>c.id===payload[1+2*i]);assert.ok(c&&!altered.has(c.id));
        if(start)assert.ok(c.levels.has(0));
        for(let k=start;k<=end;k++){
          if(high===0)assert.ok(!c.levels.has(k));else assert.equal(c.levels.get(k),high);
          c.levels.set(k,low);
        }
      }
      scans++;
    }
  }
  const levels=Buffer.from(components.flatMap(c=>Array.from({length:64},(_,k)=>c.levels.get(k)??255)));
  const unseen=levels.filter(n=>n===255).length,full=levels.filter(n=>n===0).length;
  const mask=components.reduce((n,c,i)=>n+(altered.has(c.id)?2**i:0),0);
  return Buffer.concat([words([scans,unseen,levels.length-unseen-full,full,components.length,mask]),levels]);
}
export function jpegProgressiveActual(call,frame,events){assert.deepEqual(call(249,jpegProgressiveInput(frame,events)),jpegProgressiveOracle(frame,events));}
export function jpegProgressiveEdges(call){
  let comparisons=0,rejected=0;
  const frame=jpegFrameFixture(),q=quantizationFixture(),h=Buffer.concat([huffmanFixture(),huffmanFixture(undefined,16)]);
  const tables=[[0,q],[1,h]],scan=(id,ss,se,ah=0,al=0)=>[2,Buffer.from([1,id,0,ss,se,ah*16+al])];
  const check=(events,f=frame,max=65536)=>{assert.deepEqual(call(249,jpegProgressiveInput(f,events,max)),jpegProgressiveOracle(f,events));comparisons++;};
  const reject=(events,error,f=frame,max=65536)=>{assert.throws(()=>call(249,jpegProgressiveInput(f,events,max)),error);rejected++;check([...tables,scan(9,0,0)]);};
  check([]);check(tables);
  for(let initial=0;initial<14;initial++)for(let coefficient=0;coefficient<64;coefficient++){
    const base=[...tables,scan(9,0,0,0,initial)];if(coefficient)base.push(scan(9,coefficient,coefficient,0,initial));
    for(let high=1;high<14;high++){
      const events=[...base,scan(9,coefficient,coefficient,high,high-1)];
      if(high===initial)check(events);else reject(events,/InvalidJpegProgression/);
    }
  }
  reject([...tables,scan(9,1,63)],/MissingJpegInitialDcScan/);
  reject([...tables,scan(9,0,0,1,0)],/InvalidJpegProgression/);
  const bands=[...tables,scan(9,0,0),scan(9,11,63,0,1),scan(9,1,10,0,2)];
  reject([...bands,scan(9,1,63,2,1)],/InvalidJpegProgression/);
  reject([...bands,scan(9,1,63)],/DuplicateJpegInitialBand/);
  check([...bands,scan(9,1,5,2,1),scan(9,6,10,2,1),scan(9,1,63,1,0)]);
  const changed=Buffer.from(q);changed[64]=77;
  const first=[...tables,scan(9,0,0,0,1)];
  check([...first,[0,q],scan(9,0,0,1,0)]);
  check([...first,[0,changed]]); // No later scan for this component yet.
  reject([...first,[0,changed],scan(9,0,0,1,0)],/AlteredJpegProgressiveQuantization/);
  reject([...first,[0,Buffer.concat([changed,q])],scan(9,0,0,1,0)],/AlteredJpegProgressiveQuantization/);
  check([...tables,scan(9,0,0)],frame,1);
  reject([...tables,scan(9,0,0)],/LimitExceeded/,frame,0);
  const multi=Buffer.from([8,0,1,0,1,2,9,17,0,4,17,0]);
  const shared=[...tables,scan(9,0,0,0,1),[0,changed],scan(4,0,0,0,1),scan(4,0,0,1,0)];
  check(shared,multi);
  reject([...shared,scan(9,0,0,1,0)],/AlteredJpegProgressiveQuantization/,multi);
  reject([...tables,scan(4,0,0,0,1),[2,Buffer.from([2,9,0,4,0,0,0,1])]],/DuplicateJpegInitialBand/,multi);
  return {comparisons,rejected};
}
