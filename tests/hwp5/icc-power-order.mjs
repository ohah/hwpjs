import assert from 'node:assert/strict';
import {paraInput} from './icc-analytic.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {orderedRootSigns} from './icc-root-compare.mjs';
import {levelOrder,cmp,exponent,integerPower} from './icc-power-reference.mjs';
export function powerOrderEdges(call){let values=0,roots=0,rejected=0;
 for(let kind=0;kind<5;kind++)for(const g of [-196608,-131072,-65536,-32768,0,32768,65536,98304,131072,196608])for(const a of [-131072,0,65536])for(const b of [-65536,0,65536])for(const d of [0,32768,65536,65537])for(const target of [-65536,0,65536]){
  const raw=[g,a,b,32768,d,32768,0],para=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8);let active,error;
  try{active=domain(kind,raw);}catch(e){error=e.message;}
  for(const x of [[0n,1n],[1n,2n],[1n,1n]]){const bytes=Buffer.alloc(24+para.length);bytes.writeUInt32BE(256);bytes.writeInt32BE(target,4);bytes.writeBigUInt64BE(x[0],8);bytes.writeBigUInt64BE(x[1],16);para.copy(bytes,24);
   const invalid=error??(!active?'InactiveIccPowerBranch':cmp(x,active.start)<0?'OutsideIccPowerInterval':null);if(invalid){assert.throws(()=>call(187,bytes),new RegExp(invalid));rejected++;continue;}
   const source={...active,offset:BigInt(kind===2?raw[3]:kind===4?raw[5]:0)};assert.equal(call(187,bytes).readInt32LE(),levelOrder(source,x,target));values++;
  }
 }
 for(const g of [-196608,-131072,-65536,-32768,32768,65536,98304,131072,196608])for(const offset of [-65536,0,32768,65536])for(const t1 of [0,65536])for(const t2 of [0,65536])for(const slope of [-2147483648,-65536,65536,2147483647]){
  const first=orderedRootSigns(g,offset,t1),second=orderedRootSigns(g,offset,t2);if(!first.length||!second.length)continue;
  for(const [i,s1] of first.entries())for(const [j,s2] of second.entries()){
   const bytes=Buffer.alloc(28);[g,offset,t1,t2].forEach((v,k)=>bytes.writeInt32BE(v,k*4));bytes.writeUInt32BE(i,16);bytes.writeUInt32BE(j,20);bytes.writeInt32BE(slope,24);
   let expected=s1<s2?-1:s1>s2?1:0;if(!expected&&s1!==0){const [p,q]=exponent(g),a=BigInt(t1-offset),b=BigInt(t2-offset);expected=cmp(integerPower([a<0n?-a:a,65536n],p<0n?-q:q),integerPower([b<0n?-b:b,65536n],p<0n?-q:q))*s1;}
   expected=expected===0?0:expected*Math.sign(slope);assert.equal(call(188,bytes).readInt32LE(),expected);roots++;
  }
 }
 const good=Buffer.alloc(28);good.writeInt32BE(65536);good.writeInt32BE(65536,8);good.writeInt32BE(65536,12);good.writeInt32BE(65536,24);
 for(let n=0;n<28;n++){assert.throws(()=>call(188,good.subarray(0,n)),/InvalidProbeInput/);rejected++;}
 assert.throws(()=>call(188,good,27),/LimitExceeded/);rejected++;good.writeInt32BE(0,24);assert.throws(()=>call(188,good),/NonIsolatedIccAffineRoot/);rejected++;
 good.writeInt32BE(65536,24);assert.throws(()=>call(188,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
 good.writeUInt32BE(2,16);assert.throws(()=>call(188,good),/InvalidIccPowerRootIndex/);rejected++;
 const para=paraInput(0,[65536],0).subarray(8),point=Buffer.alloc(24+para.length);point.writeUInt32BE(256);point.writeBigUInt64BE(1n,8);point.writeBigUInt64BE(2n,16);para.copy(point,24);
 for(let n=0;n<point.length;n++){assert.throws(()=>call(187,point.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;}
 assert.throws(()=>call(187,point,point.length-1),/LimitExceeded/);rejected++;
 point.writeBigUInt64BE(0n,16);assert.throws(()=>call(187,point),/InvalidIccCurveCoordinate/);rejected++;
 point.writeBigUInt64BE(2n,16);point.writeUInt32BE(129);assert.throws(()=>call(187,point),/InvalidIccComparisonPrecision/);rejected++;
 return {values,roots,rejected};
}
