import assert from 'node:assert/strict';
import {signs,where} from './icc-normalized-locations.mjs';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {paraInput} from './icc-analytic.mjs';
const Z=[0n,1n],O=[1n,1n],H=[1n,2n];
export function extendedLocationInput(g,offset,n,d,index,a,b,start,end,flags,precision=1024){
  const out=Buffer.alloc(188);out.writeUInt32BE(precision);out.writeInt32BE(g,4);out.writeInt32BE(offset,8);
  writeUnsigned(out,12,n,64);writeUnsigned(out,76,d,64);out.writeUInt32BE(index,140);out.writeInt32BE(a,144);out.writeInt32BE(b,148);out.writeUInt32BE(flags,152);
  [...start,...end].forEach((v,i)=>out.writeBigUInt64BE(v,156+8*i));return out;
}
export function extendedActiveInput(kind,raw,n,d,precision=1024){
  const para=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8),out=Buffer.alloc(132+para.length);
  out.writeUInt32BE(precision);writeUnsigned(out,4,n,64);writeUnsigned(out,68,d,64);para.copy(out,132);return out;
}
export function extendedLocationsEdges(call){
  let locations=0,curves=0,rejected=0,undecided=0;
  function point(g,offset,n,d,a,b,start,end,flags){
    const roots=signs(g,offset,n,d);
    if(!roots?.length){assert.throws(()=>call(223,extendedLocationInput(g,offset,n,d,0,a,b,start,end,flags)),/NonIsolatedIccPowerRoot|InvalidIccPowerRootIndex/);rejected++;return;}
    for(const [i,s] of roots.entries()){
      const input=extendedLocationInput(g,offset,n,d,i,a,b,start,end,flags);
      if(start[0]*end[1]===end[0]*start[1]&&flags!==3){assert.throws(()=>call(223,input),/EmptyIccInterval/);rejected++;continue;}
      const out=call(223,input);assert.equal(out.length,4);assert.equal(out.readUInt32LE(),where(g,offset,n,d,s,a,b,start,end,flags));locations++;
    }
  }
  const max=(1n<<512n)-1n,targets=[[0n,max],[1n,max],[max/2n,max],[max-1n,max],[max,max]];
  for(const g of [-65536,32768,65536,131072])for(const offset of [0,1,32768])for(const [n,d] of targets)for(const a of [-131072,0,131072])for(const b of [-65536,65536])for(const [start,end] of [[Z,O],[H,H]])for(let flags=0;flags<4;flags++)point(g,offset,n,d,a,b,start,end,flags);
  function curve(kind,raw,n,d){
    const bytes=extendedActiveInput(kind,raw,n,d);let active;
    try{active=domain(kind,raw);}catch(e){assert.throws(()=>call(224,bytes),new RegExp(e.message));rejected++;return;}
    let tag=0,entries=[];
    if(active){tag=2;const offset=kind===2?raw[3]:kind===4?raw[5]:0,roots=signs(raw[0],offset,n,d);
      if(roots===null)tag=1;else for(const s of roots){const loc=where(raw[0],offset,n,d,s,Number(active.a),Number(active.b),active.start,O,3);if(loc===5){tag=1;entries=[];break;}if(loc!==0)entries.push([loc,s]);}}
    const out=call(224,bytes);assert.equal(out.readUInt32LE(),tag);assert.equal(out.readUInt32LE(4),entries.length);assert.equal(out.length,8+8*entries.length);
    entries.forEach(([loc,s],i)=>{assert.equal(out.readUInt32LE(8+8*i),loc);assert.equal(out.readInt32LE(12+8*i),s);});curves++;
  }
  for(let kind=0;kind<5;kind++)for(const g of [-65536,0,32768,131072])for(const a of [0,131072])for(const b of [-65536,65536])for(const threshold of [0,65536,65537])for(const [n,d] of targets)curve(kind,[g,a,b,32768,threshold,0,0],n,d);
  const even=max-1n;for(const n of [even/2n-1n,even/2n,even/2n+1n])curve(4,[0,0,65536,0,0,-32768,0],n,even);
  const lo=[4866752642924153522n,6882627592338442563n],hi=[11749380235262596085n,16616132878186749607n];
  assert.equal(call(223,extendedLocationInput(131072,0,1n,2n,0,65536,0,lo,hi,3,128)).readUInt32LE(),6);undecided++;
  point(131072,0,1n,2n,65536,0,lo,hi,3);
  const good=extendedLocationInput(65536,0,max,max,0,65536,0,Z,O,3),whole=extendedActiveInput(0,[65536],1n,max);
  for(const [mode,input] of [[223,good],[224,whole]]){
    for(let len=0;len<input.length;len++){assert.throws(()=>call(mode,input.subarray(0,len)),/InvalidProbeInput|InvalidIcc/);rejected++;}
    assert.throws(()=>call(mode,input,input.length-1),/LimitExceeded/);rejected++;
    assert.throws(()=>call(mode,Buffer.concat([input,Buffer.alloc(1)])),/InvalidProbeInput|InvalidIcc/);rejected++;
    const bad=Buffer.from(input);bad.writeUInt32BE(64);assert.throws(()=>call(mode,bad),/InvalidIccComparisonPrecision/);rejected++;
  }
  for(const target of [[0n,0n],[2n,1n]]){assert.throws(()=>call(224,extendedActiveInput(4,[65536,65536,0,0,65537,0,0],...target)),/InvalidIccCurveCoordinate/);rejected++;}
  for(const [offset,value] of [[140,2],[152,4]]){const bad=Buffer.from(good);bad.writeUInt32BE(value,offset);assert.throws(()=>call(223,bad),/InvalidIccPowerRootIndex|InvalidProbeInput/);rejected++;}
  assert.throws(()=>call(223,extendedLocationInput(65536,0,1n,1n,0,65536,0,O,Z,3)),/InvalidIccIntervalOrder/);rejected++;
  point(65536,0,max,max,65536,0,Z,O,3);curve(0,[65536],1n,max);
  return {locations,curves,rejected,undecided};
}
