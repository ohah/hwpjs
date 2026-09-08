import assert from 'node:assert/strict';
import {cmp,exponent,integerPower} from './icc-power-reference.mjs';
function input(precision,g,a,b,n,d){
 const out=Buffer.alloc(72);out.writeUInt32BE(precision);out.writeInt32BE(g,4);
 for(const [i,v] of [a,b,n,d].entries()){
  const u=BigInt.asUintN(128,BigInt(v));out.writeBigUInt64BE(u>>64n,8+i*16);out.writeBigUInt64BE(u&((1n<<64n)-1n),16+i*16);
 }return out;
}
export function rationalPowerEdges(call){let comparisons=0,rejected=0,undecided=0;
 const check=(precision,g,a,b,n,d,expected)=>{assert.equal(call(190,input(precision,g,a,b,n,d)).readInt32LE(),expected);comparisons++;};
 for(const g of [-196608,-131072,-65536,-32768,0,16384,32768,65536,98304,131072,196608])
 for(const a of [-4n,-1n,0n,1n,3n,4n])for(const b of [1n,3n,7n])for(const n of [-4n,-1n,0n,1n,3n,4n])for(const d of [1n,3n,7n]){
  const [p,q]=exponent(g),bytes=input(256,g,a,b,n,d);
  if((a===0n&&g<=0)||(a<0n&&q>1n)){assert.throws(()=>call(190,bytes),/UndefinedIccCurvePower/);rejected++;continue;}
  const expected=p===0n?cmp([1n,1n],[n,d]):q>1n&&n<0n?1:cmp(integerPower([a,b],p),integerPower([n,d],q));
  assert.equal(call(190,bytes).readInt32LE(),expected);comparisons++;
 }
 for(const precision of [128,256,512,1024]){
  check(precision,32768,9n,49n,3n,7n,0);check(precision,-32768,9n,49n,7n,3n,0);
  const a=(1n<<64n)-1n,k=a/2n;
  check(precision,32768,k*k,a*a,k,a,0);
  check(precision,65536,-(1n<<127n),1n<<127n,-1n,1n,0);
  check(precision,-2147483648,2n,1n,1n,1n,-1);
  check(precision,2147483647,2n,1n,1n,1n,1);
  check(precision,65536,1n,(1n<<128n)-1n,1n,1n,-1);
  const lo=[66992092050551637663438906713182313772n,94741125149636933417873079920900017937n];
  const result=call(190,input(precision,32768,1n,2n,...lo)).readInt32LE();
  if(precision===128){assert.equal(result,2);undecided++;}else{assert.equal(result,1);comparisons++;}
 }
 const good=input(256,65536,1n,1n,1n,1n);
 for(let size=0;size<good.length;size++){assert.throws(()=>call(190,good.subarray(0,size)),/InvalidProbeInput/);rejected++;}
 assert.throws(()=>call(190,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
 assert.throws(()=>call(190,good,71),/LimitExceeded/);rejected++;
 for(const bytes of [input(256,1,1n,0n,0n,1n),input(256,0,1n,1n,1n,0n)]){assert.throws(()=>call(190,bytes),/InvalidIccPowerCoordinate/);rejected++;}
 assert.throws(()=>call(190,input(129,1,1n,1n,1n,1n)),/InvalidIccComparisonPrecision/);rejected++;
 assert.equal(call(190,good).readInt32LE(),0);comparisons++;
 return {comparisons,rejected,undecided};
}
