import assert from 'node:assert/strict';
import {reference} from './icc-parametric-domain.mjs';
import {paraInput} from './icc-analytic.mjs';
export function segmentEdges(call){
 let comparisons=0,rejected=0;
 function check(kind,raw){
  const b=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8);let power;
  try{power=reference(kind,raw);}catch(e){assert.throws(()=>call(180,b,b.length),new RegExp(e.message));rejected++;return;}
  const out=call(180,b,b.length);assert.equal(out.length,112);
  function piece(offset,start,end,flags,coefficients){
   if(!start){assert.deepEqual(out.subarray(offset,offset+56),Buffer.alloc(56));return;}
   assert.equal(out.readUInt32LE(offset),1);
   for(const [at,expected] of [[4,start],[20,end]]){const n=out.readBigUInt64LE(offset+at),d=out.readBigUInt64LE(offset+at+8);assert.ok(d>0n&&n<=d);assert.equal(n*expected[1],d*expected[0]);}
   assert.equal(out.readUInt32LE(offset+36),flags);
   coefficients.forEach((c,i)=>assert.equal(out.readInt32LE(offset+40+i*4),c));
  }
  const lower=!power||power.start[0]!==0n;
  piece(0,lower?[0n,1n]:null,power?.start??[1n,1n],power?1:3,[kind>=3?raw[3]:0,kind===2?raw[3]:kind===4?raw[6]:0,0,0]);
  piece(56,power?.start??null,[1n,1n],3,power?[Number(power.a),Number(power.b),Number(power.g),kind===2?raw[3]:kind===4?raw[5]:0]:[]);
  comparisons++;
 }
 for(let kind=0;kind<5;kind++)for(const g of [-65536,0,32768,65536,131072])for(const a of [-2147483648,-49,0,49,2147483647])for(const b of [-2147483648,-1,0,1,2147483647])for(const d of [-1,0,1,32768,65535,65536,65537])check(kind,[g,a,b,-12345,d,23456,-34567]);
 const good=paraInput(0,[65536],0).subarray(8);
 for(let n=0;n<good.length;n++){assert.throws(()=>call(180,good.subarray(0,n),good.length),/InvalidIcc/);rejected++;}
 assert.throws(()=>call(180,good,good.length-1),/LimitExceeded/);rejected++;
 check(4,[65536,0,0,65536,32768,65536,0]);
 return {comparisons,rejected};
}
