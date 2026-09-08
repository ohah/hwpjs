import assert from 'node:assert/strict';
import {paraInput} from './icc-analytic.mjs';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
import {reference as domain} from './icc-parametric-domain.mjs';
import {decode} from './icc-power-preimage-wire.mjs';
import {verify} from './icc-power-preimage-reference.mjs';
export function preimageInput(kind,raw,n,d,precision=512,bits=128){const width=bits/8,prefix=4+2*width;assert.ok(bits===128||bits===512);const para=paraInput(kind,raw.slice(0,[1,3,4,5,7][kind]),0).subarray(8),out=Buffer.alloc(prefix+para.length);out.writeUInt32BE(precision);writeUnsigned(out,4,n,width);writeUnsigned(out,4+width,d,width);para.copy(out,prefix);return out;}
export function powerPreimageEdges(call,bits=128){
  assert.ok(bits===128||bits===512);
  const mode=bits===128?199:225,defaultPrecision=bits===128?512:1024;
  const inputFor=(kind,raw,n,d,precision=defaultPrecision)=>preimageInput(kind,raw,n,d,precision,bits);
  const decodeFor=out=>decode(out,bits===128?32:128);
  let comparisons=0,rejected=0,undecided=0,membershipChecks=0;
  function check(kind,raw,n,d,precision=defaultPrecision){
    const input=inputFor(kind,raw,n,d,precision);let active;
    try{active=domain(kind,raw);}catch(e){assert.throws(()=>call(mode,input),new RegExp(e.message));rejected++;return;}
    const result=decodeFor(call(mode,input));if(!active)assert.equal(result.status,0);else membershipChecks+=verify(result,active,kind===2?raw[3]:kind===4?raw[5]:0,n,d);comparisons++;
  }
  for(let kind=0;kind<5;kind++)for(const g of [-65536,0,32768,65536,131072,196608])for(const a of [-262144,0,262144])for(const b of [-131072,0,131072])for(const offset of [-65536,0,32768])for(const threshold of [0,32768,65536,65537])for(const [n,d] of [[0n,1n],[1n,1n],[1n,3n]])check(kind,[g,a,b,offset,threshold,offset,0],n,d);
  const max=(1n<<BigInt(bits))-1n;
  for(const precision of [128,256,512,1024]){
    check(4,[131072,131072,-65536,0,0,0,0],0n,1n,precision);
    check(4,[131072,262144,-131072,0,0,0,0],1n,1n,precision);
    check(4,[65536,65536,0,0,0,1,0],max/2n,max,precision);
  }
  const raw=[131072,65537,0,0,1],n=65537n*65537n<<BigInt(bits-64);
  assert.deepEqual(decodeFor(call(mode,inputFor(3,raw,n,max,128))),{status:1});undecided++;
  check(3,raw,n,max,defaultPrecision);
  if(bits===512)for(const g of [65536,131072])for(const n of [0n,1n,max-1n,max])check(0,[g],n,max);
  const good=inputFor(0,[65536],1n,3n);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(mode,good.subarray(0,len)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  assert.throws(()=>call(mode,good,good.length-1),/LimitExceeded/);rejected++;
  assert.throws(()=>call(mode,Buffer.concat([good,Buffer.alloc(1)])),/InvalidIcc/);rejected++;
  assert.throws(()=>call(mode,inputFor(0,[65536],1n,3n,64)),/InvalidIccComparisonPrecision/);rejected++;
  for(const [n,d] of [[1n,0n],[2n,1n]]){assert.throws(()=>call(mode,inputFor(0,[65536],n,d)),/InvalidIccCurveCoordinate/);rejected++;}
  check(0,[65536],1n,3n);
  return {comparisons,rejected,undecided,membershipChecks};
}
