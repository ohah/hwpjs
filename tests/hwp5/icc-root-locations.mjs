import assert from 'node:assert/strict';
import {rootOrderReference as order,orderedRootSigns as signs} from './icc-root-compare.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {paraInput} from './icc-analytic.mjs';
const Z=[0n,1n],O=[1n,1n],H=[1n,2n];
const compare=(a,b)=>a[0]*b[1]<b[0]*a[1]?-1:a[0]*b[1]>b[0]*a[1]?1:0;
function location(g,offset,target,s,a,b,start,end,flags) {
  const at=x=>order(g,offset,target,s,BigInt(a)*x[0]+BigInt(b)*x[1],65536n*x[1]);
  if(a===0)return at(start)===0?5:0;
  const lo=at(start)*Math.sign(a),hi=at(end)*Math.sign(a);
  const inside=(lo>0||(lo===0&&(flags&1)))&&(hi<0||(hi===0&&(flags&2)));
  return !inside?0:lo===0&&hi===0?4:lo===0?1:hi===0?3:2;
}
function input(g,offset,target,index,a,b,start,end,flags,precision=256) {
  const out=Buffer.alloc(64);out.writeUInt32BE(precision);[g,offset,target].forEach((v,i)=>out.writeInt32BE(v,4+4*i));out.writeUInt32BE(index,16);out.writeInt32BE(a,20);out.writeInt32BE(b,24);out.writeUInt32BE(flags,28);
  [start[0],start[1],end[0],end[1]].forEach((v,i)=>out.writeBigUInt64BE(v,32+8*i));return out;
}
export function rootLocationsEdges(call) {
  let locations=0,curves=0,rejected=0,undecided=0;
  const intervals=[[Z,O],[[1n,4n],[3n,4n]],[H,H],[Z,H],[H,O]];
  function checkLocation(g,offset,target,a,b,start,end,flags) {
    const roots=signs(g,offset,target);
    if(!roots.length){assert.throws(()=>call(185,input(g,offset,target,0,a,b,start,end,flags)),/InvalidIccPowerRootIndex/);rejected++;return;}
    for(const [index,s] of roots.entries()){
      const bytes=input(g,offset,target,index,a,b,start,end,flags);
      if(compare(start,end)===0&&flags!==3){assert.throws(()=>call(185,bytes),/EmptyIccInterval/);rejected++;continue;}
      const out=call(185,bytes);assert.equal(out.length,4);assert.equal(out.readUInt32LE(),location(g,offset,target,s,a,b,start,end,flags));locations++;
    }
  }
  for(const g of [-131072,-65536,-32768,32768,65536,131072,196608])for(const offset of [-65536,0,32768,65536])for(const target of [0,65536])for(const a of [-131072,-65536,0,65536,131072])for(const b of [-65536,0,65536])for(const [start,end] of intervals)for(let flags=0;flags<4;flags++)checkLocation(g,offset,target,a,b,start,end,flags);
  const near=[2147483647n,2147483648n];
  for(const a of [-2147483648,2147483647])for(const b of [-2147483648,2147483647])for(const target of [0,65536])for(const [start,end] of [[Z,O],[near,near],[Z,near],[near,O]])for(let flags=0;flags<4;flags++)checkLocation(65536,0,target,a,b,start,end,flags);
  function checkCurve(kind,raw,target) {
    const para=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8),bytes=Buffer.alloc(8+para.length);bytes.writeUInt32BE(256);bytes.writeInt32BE(target,4);para.copy(bytes,8);
    let active;try{active=domain(kind,raw);}catch(error){assert.throws(()=>call(186,bytes),new RegExp(error.message));rejected++;return;}
    let expectedKind=0,entries=[];
    if(active){const g=raw[0],offset=kind===2?raw[3]:kind===4?raw[5]:0,roots=signs(g,offset,target);expectedKind=2;
      if(roots===null)expectedKind=1;
      else for(const s of roots){const where=location(g,offset,target,s,Number(active.a),Number(active.b),active.start,O,3);if(where===5){expectedKind=1;entries=[];break;}if(where!==0)entries.push({s,where,offset});}
    }
    const out=call(186,bytes);assert.equal(out.readUInt32LE(),expectedKind);assert.equal(out.readUInt32LE(4),entries.length);assert.equal(out.length,8+24*entries.length);
    entries.forEach(({s,where,offset},i)=>{const at=8+24*i;assert.equal(out.readUInt32LE(at),where);assert.equal(out.readInt32LE(at+4),s);if(s===0)assert.deepEqual(out.subarray(at+4,at+24),Buffer.alloc(20));else{const ordinate=BigInt(target)-BigInt(offset);assert.equal(out.readBigUInt64LE(at+8),ordinate<0n?-ordinate:ordinate);assert.ok(out.readUInt32LE(at+20)>0);assert.equal(BigInt(out.readInt32LE(at+16))*BigInt(raw[0]),65536n*BigInt(out.readUInt32LE(at+20)));}});curves++;
  }
  for(let kind=0;kind<5;kind++)for(const g of [-131072,-65536,-32768,0,32768,65536,131072])for(const a of [-131072,0,65536,131072])for(const b of [-65536,0,65536])for(const d of [0,32768,65536,65537])for(const target of [0,65536])checkCurve(kind,[g,a,b,32768,d,32768,0],target);
  checkCurve(4,[0,0,65536,0,0,32768,0],98304);
  checkCurve(4,[131072,0,32768,0,0,0,0],16384);
  const lo=[4866752642924153522n,6882627592338442563n],hi=[11749380235262596085n,16616132878186749607n];
  for(const precision of [256,512,1024]){assert.equal(call(185,input(131072,32768,65536,0,65536,0,lo,hi,3,precision)).readUInt32LE(),2);locations++;}
  const uncertain=call(185,input(131072,32768,65536,0,65536,0,lo,hi,3,128)).readUInt32LE();assert.equal(uncertain,6);undecided++;
  assert.equal(call(185,input(131072,32768,65536,0,65536,0,hi,hi,3,128)).readUInt32LE(),6);undecided++;
  assert.equal(call(185,input(131072,32768,65536,0,65536,0,hi,hi,3,512)).readUInt32LE(),0);locations++;
  const good=input(65536,0,65536,0,65536,0,Z,O,3);
  for(let n=0;n<64;n++){assert.throws(()=>call(185,good.subarray(0,n)),/InvalidProbeInput/);rejected++;}
  for(const [bytes,pattern,limit] of [[Buffer.concat([good,Buffer.alloc(1)]),/InvalidProbeInput/,65],[good,/LimitExceeded/,63],[input(65536,0,65536,0,65536,0,O,Z,3),/InvalidIccIntervalOrder/,64],[input(65536,0,65536,0,65536,0,Z,O,4),/InvalidProbeInput/,64],[input(65536,0,65536,0,65536,0,[0n,0n],O,3),/InvalidIccCurveCoordinate/,64]]){assert.throws(()=>call(185,bytes,limit),pattern);rejected++;}
  const para=paraInput(0,[65536],0).subarray(8),whole=Buffer.alloc(8+para.length);whole.writeUInt32BE(256);whole.writeInt32BE(65536,4);para.copy(whole,8);
  for(let n=0;n<whole.length;n++){assert.throws(()=>call(186,whole.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  assert.throws(()=>call(186,whole,whole.length-1),/LimitExceeded/);rejected++;
  checkCurve(0,[65536],65536);
  return {locations,curves,rejected,undecided};
}
