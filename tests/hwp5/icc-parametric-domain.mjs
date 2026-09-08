import assert from 'node:assert/strict';
import {paraInput} from './icc-analytic.mjs';
const counts=[1,3,4,5,7];
function fraction(n,d){return d<0n?[-n,-d]:[n,d];}
function compare(a,b){const x=a[0]*b[1]-b[0]*a[1];return x<0n?-1:x>0n?1:0;}
// Enumerate critical points (endpoints, branch boundary, base root) and apply
// the point-wise real-power domain rules. No endpoint sign-crossing predicate.
export function reference(kind,raw){
 const [g,ra,rb,,d]=raw.map(BigInt),a=kind===0?65536n:ra,b=kind===0?0n:rb;
 if((kind===1||kind===2)&&a===0n)throw Error('UndefinedIccCurveThreshold');
 const threshold=kind===0?[0n,1n]:kind<=2?fraction(-b,a):[d,65536n];
 const points=[[0n,1n],[1n,1n],threshold];if(a!==0n)points.push(fraction(-b,a));
 for(const x of points){
  if(compare(x,[0n,1n])<0||compare(x,[1n,1n])>0||compare(x,threshold)<0)continue;
  const base=a*x[0]+b*x[1];
  if((base<0n&&g%65536n!==0n)||(base===0n&&g<=0n))throw Error('UndefinedIccCurvePower');
 }
 if(compare(threshold,[1n,1n])>0)return null;
 return {start:compare(threshold,[0n,1n])<0?[0n,1n]:threshold,a,b,g};
}
export function parametricDomainEdges(call){
 let comparisons=0,rejected=0;
 function check(kind,raw){
  const values=raw.slice(0,counts[kind]),b=paraInput(kind,values,0).subarray(8);let expected;
  try{expected=reference(kind,raw);}catch(e){assert.throws(()=>call(179,b,b.length),new RegExp(e.message));rejected++;return;}
  const out=call(179,b,b.length);assert.equal(out.length,32);
  if(!expected)assert.deepEqual(out,Buffer.alloc(32));else{
   assert.equal(out.readUInt32LE(),1);const n=out.readBigUInt64LE(4),d=out.readBigUInt64LE(12);
   assert.ok(d>0n&&n<=d);assert.equal(n*expected.start[1],d*expected.start[0]);
   assert.equal(BigInt(out.readInt32LE(20)),expected.a);assert.equal(BigInt(out.readInt32LE(24)),expected.b);assert.equal(BigInt(out.readInt32LE(28)),expected.g);
  }comparisons++;
 }
 for(let kind=0;kind<5;kind++)for(const g of [-2147483648,-65537,-65536,-32768,-1,0,1,32768,65536,131072,2147483647])for(const a of [-2147483648,-65536,0,65536,2147483647])for(const b of [-2147483648,-65536,0,65536,2147483647])for(const d of [-65536,0,1,32768,65535,65536,65537])check(kind,[g,a,b,-65536,d,2147483647,-2147483648]);
 const good=paraInput(0,[65536],0).subarray(8);
 for(let i=0;i<good.length;i++){assert.throws(()=>call(179,good.subarray(0,i),good.length),/InvalidIcc/);rejected++;}
 assert.throws(()=>call(179,good,good.length-1),/LimitExceeded/);rejected++;
 check(4,[65536,65536,0,65536,0,0,0]);
 return {comparisons,rejected};
}
