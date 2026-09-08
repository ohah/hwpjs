import assert from 'node:assert/strict';
import {inverseInput,inverseReference} from './icc-inverse.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
function input(values,n,d){
  const out=Buffer.concat([Buffer.alloc(32),inverseInput(values,0).subarray(2)]);
  for(const [offset,value] of [[0,n],[16,d]]){
    out.writeBigUInt64BE(value>>64n,offset);
    out.writeBigUInt64BE(value&((1n<<64n)-1n),offset+8);
  }
  return out;
}
export function normalizedInverseEdges(call){
  let comparisons=0,rejected=0;
  function check(values,n,d){
    const b=input(values,n,d);let expected;
    try{expected=inverseReference(values,n*65535n,d);}catch(error){assert.throws(()=>call(177,b,b.length),new RegExp(error.message));rejected++;return;}
    const result=call(177,b,b.length);assert.equal(result.length,64);
    const rn=readWide(result,0),rd=readWide(result,32);
    assert.ok(rd>0n&&rn<=rd);assert.equal(rn*expected[1],rd*expected[0]);comparisons++;
  }
  const max=(1n<<128n)-1n;
  for(let size=2;size<=6;size++)for(let encoded=0;encoded<3**size;encoded++){
    let digits=encoded;const values=Array.from({length:size},()=>{const v=[0,32768,65535][digits%3];digits=Math.floor(digits/3);return v;});
    for(const [n,d] of [[0n,1n],[1n,max],[max/2n,max],[max-1n,max],[1n,1n],[1n,2n]])check(values,n,d);
  }
  for(const values of [[100,100,200,200],[200,200,100,100],[100,150,150,200],[200,150,150,100]])
    for(const y of [0n,99n,100n,101n,149n,150n,151n,199n,200n,201n,65535n])
      for(const delta of [-1n,0n,1n]){const n=y*100000n+delta,d=65535n*100000n;if(n>=0n&&n<=d)check(values,n,d);}
  for(const values of [[],[7]])check(values,0n,1n);
  const good=input([0,65535],1n,2n);
  for(let size=0;size<good.length;size++){
    assert.throws(()=>call(177,good.subarray(0,size),good.length),/InvalidProbeInput|InvalidIccTagDataSize|InvalidIccCurveSize/);rejected++;
  }
  for(const [n,d] of [[0n,0n],[2n,1n],[max,max-1n]]){
    const b=input([0,65535],n,d);assert.throws(()=>call(177,b,b.length),/InvalidIccCurveCoordinate/);rejected++;
  }
  assert.throws(()=>call(177,good,good.length-1),/LimitExceeded/);rejected++;
  check([0,65535],1n,max);
  return {comparisons,rejected};
}
