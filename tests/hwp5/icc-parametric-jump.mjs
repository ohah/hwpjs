import assert from 'node:assert/strict';
import {paraInput} from './icc-analytic.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {cmp,base,rationalPowerOrder} from './icc-power-reference.mjs';
const counts=[1,3,4,5,7];
function input(kind,raw,precision){const para=paraInput(kind,raw.slice(0,counts[kind]),0).subarray(8),bytes=Buffer.alloc(4+para.length);bytes.writeUInt32BE(precision);para.copy(bytes,4);return bytes;}
function reference(kind,raw){
 const active=domain(kind,raw);if(!active||active.start[0]===0n)return null;
 const x=active.start,slope=BigInt(kind>=3?raw[3]:0),offset=BigInt(kind===2?raw[3]:kind===4?raw[6]:0),upperOffset=BigInt(kind===2?raw[3]:kind===4?raw[5]:0);
 let left=[slope*x[0]+offset*x[1],65536n*x[1]];
 if(cmp(left,[0n,1n])<=0)left=[0n,1n];else if(cmp(left,[1n,1n])>=0)left=[1n,1n];
 const target=[65536n*left[0]-upperOffset*left[1],65536n*left[1]];
 const rawOrder=rationalPowerOrder(base(active,x),active.g,target);
 return {x,order:left[0]===0n?Math.max(0,rawOrder):left[0]===left[1]?Math.min(0,rawOrder):rawOrder};
}
export function parametricJumpEdges(call){let comparisons=0,rejected=0,absent=0;
 function check(kind,raw,precision=256){const bytes=input(kind,raw,precision);let expected;try{expected=reference(kind,raw);}catch(e){assert.throws(()=>call(191,bytes),new RegExp(e.message));rejected++;return;}
  const out=call(191,bytes);assert.equal(out.length,24);if(!expected){assert.deepEqual(out,Buffer.alloc(24));absent++;return;}
  assert.equal(out.readUInt32LE(),1);assert.equal(out.readInt32LE(4),expected.order);const n=out.readBigUInt64LE(8),d=out.readBigUInt64LE(16);assert.ok(n>0n&&n<=d);assert.equal(n*expected.x[1],d*expected.x[0]);comparisons++;
 }
 for(let kind=0;kind<5;kind++)for(const g of [-131072,-65536,-32768,0,32768,65536,98304,131072,196608])for(const a of [-65536,0,65536])for(const b of [-65536,0,65536])for(const c of [-65536,0,65536])for(const d of [-1,0,32768,65536,65537])for(const e of [-65536,65536])for(const f of [-65536,65536])check(kind,[g,a,b,c,d,e,f]);
 const cases=[
  [65536,1,0,1,1,0,0],[65536,2,0,1,1,0,0],[65536,0,0,1,1,0,0],
  [65536,65536,0,131072,32768,0,0],[65536,65536,0,65536,32768,32768,32768],
  [65536,0,0,0,65536,65536,0],
  [65536,2147483647,-2147483648,1,1,2147483647,0],
  [65536,-2147483648,2147483647,1,1,-2147483648,0],
  [65536,1,0,-2147483648,1,0,2147483647],
  [-65536,0,-2147483648,2147483647,1,2147483647,-2147483648],
 ];
 for(const precision of [128,256,512,1024])for(const raw of cases)check(4,raw,precision);
 const good=input(4,cases[0],256);for(let n=0;n<good.length;n++){assert.throws(()=>call(191,good.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;}
 assert.throws(()=>call(191,good,good.length-1),/LimitExceeded/);rejected++;
 assert.throws(()=>call(191,Buffer.concat([good,Buffer.alloc(1)])),/InvalidIcc/);rejected++;
 assert.throws(()=>call(191,input(4,cases[0],129)),/InvalidIccComparisonPrecision/);rejected++;
 check(4,cases[0]);return {comparisons,rejected,absent};
}
