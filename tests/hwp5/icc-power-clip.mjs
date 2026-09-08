import assert from 'node:assert/strict';
import {paraInput} from './icc-analytic.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {decode} from './icc-power-clip-wire.mjs';
import {verify} from './icc-power-clip-reference.mjs';
export function clipInput(kind,raw,precision=256){const para=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8),bytes=Buffer.alloc(4+para.length);bytes.writeUInt32BE(precision);para.copy(bytes,4);return bytes;}
export function powerClipEdges(call){let comparisons=0,rejected=0,pieces=0;
 function check(kind,raw,precision=256){const bytes=clipInput(kind,raw,precision);let active;try{active=domain(kind,raw);}catch(error){assert.throws(()=>call(189,bytes),new RegExp(error.message));rejected++;return;}
  const plan=decode(call(189,bytes));if(!active)assert.equal(plan.status,0);else pieces+=verify(plan,active,kind===2?raw[3]:kind===4?raw[5]:0);comparisons++;
 }
 for(let kind=0;kind<5;kind++)for(const g of [-131072,-65536,-32768,0,32768,65536,98304,131072,196608])for(const a of [-262144,0,65536,262144])for(const b of [-131072,0,65536,131072])for(const d of [0,32768,65536,65537])for(const offset of [-65536,0,32768,65536])check(kind,[g,a,b,offset,d,offset,0]);
 for(const precision of [128,512,1024])for(const a of [-262144,262144])check(4,[131072,a,a<0?131072:-131072,0,0,-32768,0],precision);
 check(4,[65536,2147483647,-2147483648,0,0,2147483647,0]);
 check(4,[65536,-2147483648,2147483647,0,0,-2147483648,0]);
 check(4,[0,0,-2147483648,0,0,2147483647,0]);
 check(4,[0,0,2147483647,0,0,-2147483648,0]);
 // Huge exponents: retain the real nonzero power instead of inheriting f64 underflow.
 for(const [g,a,b,kind] of [[-2147483648,65536,65536,1],[2147483647,65536,65536,2],[-2147483648,0,-2147483648,1]]){
  const plan=decode(call(189,clipInput(4,[g,a,b,0,0,0,0])));assert.equal(plan.status,2);assert.equal(plan.pieces.length,1);assert.equal(plan.pieces[0].kind,kind);assert.equal(plan.pieces[0].direction,a===0?0:kind===1?2:0);comparisons++;pieces++;
 }
 const good=clipInput(0,[65536]);for(let n=0;n<good.length;n++){assert.throws(()=>call(189,good.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;}
 assert.throws(()=>call(189,good,good.length-1),/LimitExceeded/);rejected++;
 assert.throws(()=>call(189,clipInput(0,[65536],129)),/InvalidIccComparisonPrecision/);rejected++;
 check(0,[65536]);return {comparisons,rejected,pieces};
}
