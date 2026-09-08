import assert from 'node:assert/strict';
import {paraInput} from './icc-analytic.mjs';
import {trendReference} from './icc-parametric-trend-reference.mjs';
function input(kind,raw,precision){const para=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8),bytes=Buffer.alloc(4+para.length);bytes.writeUInt32BE(precision);para.copy(bytes,4);return bytes;}
export function parametricTrendEdges(call){let comparisons=0,rejected=0;const trends=[0,0,0,0,0];
 function check(kind,raw,precision=256){const bytes=input(kind,raw,precision);let expected;try{expected=trendReference(kind,raw);}catch(e){assert.throws(()=>call(192,bytes),new RegExp(e.message));rejected++;return;}
  const out=call(192,bytes);assert.equal(out.length,4);assert.equal(out.readUInt32LE(),expected);trends[expected]++;comparisons++;
 }
 for(let kind=0;kind<5;kind++)for(const g of [-131072,-65536,-32768,0,32768,65536,131072,196608])for(const a of [-65536,0,65536])for(const b of [-65536,0,65536])for(const c of [-65536,0,65536])for(const d of [-1,0,32768,65536,65537])for(const e of [-65536,0,65536])for(const f of [-65536,0,65536])check(kind,[g,a,b,c,d,e,f]);
 const cases=[
  [131072,131072,-65536,0,0,0,0],[131072,131072,-65536,0,0,65536,0],[131072,131072,-65536,0,0,-65536,0],
  [65536,65536,0,131072,32768,0,0],[65536,0,0,0,32768,65536,0],[65536,0,0,65536,32768,65536,0],
  [65536,0,0,0,65536,65536,0],[65536,0,0,0,32768,0,65536],
  [131072,2147483647,-1,0,0,0,0],[131072,2147483647,-1,0,0,-65536,0],
  [0,0,65536,0,32768,-32768,32768],[65536,-65536,65536,0,0,0,0],
  [65536,2147483647,-2147483648,1,1,2147483647,0],[65536,-2147483648,2147483647,1,1,-2147483648,0],
 ];
 for(const precision of [128,256,512,1024])for(const raw of cases)check(4,raw,precision);
 // Avoid expanding billion-bit powers: (x/2)^positive is strictly increasing;
 // a terminal half-interval at 2^-32768 is a positive upward step from zero.
 for(const precision of [128,256,512,1024])for(const raw of [[2147483647,32768,0,0,0,0,0],[-2147483648,0,131072,0,32768,0,0]]){
  const out=call(192,input(4,raw,precision));assert.equal(out.length,4);assert.equal(out.readUInt32LE(),1);comparisons++;trends[1]++;
 }
 const good=input(4,cases[0],256);for(let n=0;n<good.length;n++){assert.throws(()=>call(192,good.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;}
 assert.throws(()=>call(192,good,good.length-1),/LimitExceeded/);rejected++;
 assert.throws(()=>call(192,Buffer.concat([good,Buffer.alloc(1)])),/InvalidIcc/);rejected++;
 assert.throws(()=>call(192,input(4,cases[0],129)),/InvalidIccComparisonPrecision/);rejected++;
 check(4,cases[0]);assert.ok(trends.slice(0,4).every(n=>n>0));return {comparisons,rejected,trends};
}
