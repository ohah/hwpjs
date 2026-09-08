import assert from 'node:assert/strict';
import {admissible} from './icc-power-level.mjs';
import {expected as order} from './icc-normalized-root-compare.mjs';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {paraInput} from './icc-analytic.mjs';
const Z=[0n,1n],O=[1n,1n],H=[1n,2n],max=(1n<<128n)-1n;
export function signs(g,offset,n,d){const N=65536n*n-BigInt(offset)*d;if(g===0)return N===65536n*d?null:[];const s=admissible(g,N);return s.includes(1)?[1,...s.filter(v=>v!==1)]:s;}
export function where(g,offset,n,d,s,a,b,start,end,flags){
  const N=65536n*n-BigInt(offset)*d;
  const at=x=>order(s,N<0n?-N:N,65536n*d,g<0?-65536:65536,Math.abs(g),BigInt(a)*x[0]+BigInt(b)*x[1],65536n*x[1]);
  if(a===0)return at(start)===0?5:0;
  const lo=at(start)*Math.sign(a),hi=at(end)*Math.sign(a);
  const inside=(lo>0||(lo===0&&(flags&1)))&&(hi<0||(hi===0&&(flags&2)));
  return !inside?0:lo===0&&hi===0?4:lo===0?1:hi===0?3:2;
}
function input(g,offset,n,d,index,a,b,start,end,flags,precision=512){
  const out=Buffer.alloc(92);out.writeUInt32BE(precision);out.writeInt32BE(g,4);out.writeInt32BE(offset,8);writeUnsigned(out,12,n,16);writeUnsigned(out,28,d,16);out.writeUInt32BE(index,44);out.writeInt32BE(a,48);out.writeInt32BE(b,52);out.writeUInt32BE(flags,56);[...start,...end].forEach((v,i)=>out.writeBigUInt64BE(v,60+8*i));return out;
}
export function normalizedLocationsEdges(call){
  let locations=0,curves=0,rejected=0,undecided=0;
  function point(g,offset,n,d,a,b,start,end,flags){
    const roots=signs(g,offset,n,d);
    if(!roots?.length){assert.throws(()=>call(197,input(g,offset,n,d,0,a,b,start,end,flags)),/NonIsolatedIccPowerRoot|InvalidIccPowerRootIndex/);rejected++;return;}
    roots.forEach((s,i)=>{const bytes=input(g,offset,n,d,i,a,b,start,end,flags);if(start[0]*end[1]===end[0]*start[1]&&flags!==3){assert.throws(()=>call(197,bytes),/EmptyIccInterval/);rejected++;return;}const out=call(197,bytes);assert.equal(out.length,4);assert.equal(out.readUInt32LE(),where(g,offset,n,d,s,a,b,start,end,flags));locations++;});
  }
  for(const g of [-131072,-65536,32768,65536,131072])for(const offset of [-65536,0,1,32768])for(const [n,d] of [[0n,1n],[1n,1n],[1n,3n],[max/2n,max]])for(const a of [-131072,0,131072])for(const b of [-65536,0,65536])for(const [start,end] of [[Z,O],[Z,H],[H,O],[H,H]])for(let flags=0;flags<4;flags++)point(g,offset,n,d,a,b,start,end,flags);
  function curve(kind,raw,n,d){
    const para=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8),bytes=Buffer.alloc(36+para.length);bytes.writeUInt32BE(512);writeUnsigned(bytes,4,n,16);writeUnsigned(bytes,20,d,16);para.copy(bytes,36);
    let active;try{active=domain(kind,raw);}catch(e){assert.throws(()=>call(198,bytes),new RegExp(e.message));rejected++;return;}
    let tag=0,entries=[];
    if(active){tag=2;const offset=kind===2?raw[3]:kind===4?raw[5]:0,roots=signs(raw[0],offset,n,d);if(roots===null)tag=1;else for(const s of roots){const loc=where(raw[0],offset,n,d,s,Number(active.a),Number(active.b),active.start,O,3);if(loc===5){tag=1;entries=[];break;}if(loc!==0)entries.push([loc,s]);}}
    const out=call(198,bytes);assert.equal(out.readUInt32LE(),tag);assert.equal(out.readUInt32LE(4),entries.length);assert.equal(out.length,8+8*entries.length);entries.forEach(([loc,s],i)=>{assert.equal(out.readUInt32LE(8+8*i),loc);assert.equal(out.readInt32LE(12+8*i),s);});curves++;
  }
  for(let kind=0;kind<5;kind++)for(const g of [-65536,0,32768,131072])for(const a of [0,65536,131072])for(const b of [-65536,0,65536])for(const threshold of [0,32768,65536,65537])for(const [n,d] of [[0n,1n],[1n,3n],[1n,1n],[max/2n,max]])curve(kind,[g,a,b,32768,threshold,0,0],n,d);
  const lo=[4866752642924153522n,6882627592338442563n],hi=[11749380235262596085n,16616132878186749607n];
  assert.equal(call(197,input(131072,0,1n,2n,0,65536,0,lo,hi,3,128)).readUInt32LE(),6);undecided++;
  point(131072,0,1n,2n,65536,0,lo,hi,3);
  const good=input(65536,0,1n,1n,0,65536,0,Z,O,3);
  for(let i=0;i<92;i++){assert.throws(()=>call(197,good.subarray(0,i)),/InvalidProbeInput/);rejected++;}
  for(const [bytes,limit,pattern] of [[good,91,/LimitExceeded/],[Buffer.concat([good,Buffer.alloc(1)]),93,/InvalidProbeInput/],[input(65536,0,1n,0n,0,65536,0,Z,O,3),92,/InvalidIccCurveCoordinate/],[input(65536,0,1n,1n,0,65536,0,O,Z,3),92,/InvalidIccIntervalOrder/],[input(65536,0,1n,1n,0,65536,0,Z,O,4),92,/InvalidProbeInput/]]){assert.throws(()=>call(197,bytes,limit),pattern);rejected++;}
  curve(4,[0,0,65536,0,0,-32768,0],1n,2n);
  const para=paraInput(0,[65536],0).subarray(8),whole=Buffer.alloc(36+para.length);
  whole.writeUInt32BE(512);writeUnsigned(whole,4,1n,16);writeUnsigned(whole,20,3n,16);para.copy(whole,36);
  for(let i=0;i<whole.length;i++){assert.throws(()=>call(198,whole.subarray(0,i)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  assert.throws(()=>call(198,whole,whole.length-1),/LimitExceeded/);rejected++;
  assert.throws(()=>call(198,Buffer.concat([whole,Buffer.alloc(1)])),/InvalidIcc/);rejected++;
  for(const [n,d] of [[1n,0n],[2n,1n]]){const bad=Buffer.from(whole);writeUnsigned(bad,4,n,16);writeUnsigned(bad,20,d,16);assert.throws(()=>call(198,bad),/InvalidIccCurveCoordinate/);rejected++;}
  for(const mode of [197,198]){const bad=Buffer.from(mode===197?good:whole);bad.writeUInt32BE(64);assert.throws(()=>call(mode,bad),/InvalidIccComparisonPrecision/);rejected++;}
  point(0,0,1n,1n,65536,0,Z,O,3);
  point(65536,0,1n,1n,0,65536,H,H,3);
  point(65536,0,1n,1n,65536,0,Z,O,3);
  return {locations,curves,rejected,undecided};
}
