import assert from 'node:assert/strict';
import {preimageInput} from './icc-power-preimage.mjs';
import {endpoint} from './icc-preimage-bounds.mjs';
import {linearPreimageReference,choiceReference} from './icc-linear-preimage-reference.mjs';
export function attainedInverseEdges(call){
  let selected=0,missing=0,rejected=0,undecided=0;
  function check(kind,raw,n,d,x,precision=512){const out=call(202,preimageInput(kind,raw,n,d,precision));if(x===null){assert.deepEqual(out,Buffer.alloc(4));missing++;}else{assert.equal(out.length,96);assert.equal(out.readUInt32LE(),2);endpoint(out.subarray(4),x,true);selected++;}}
  function reject(kind,raw,n,d,error,precision=512){assert.throws(()=>call(202,preimageInput(kind,raw,n,d,precision)),new RegExp(error));rejected++;}
  const clamp=n=>Math.max(0,Math.min(65536,n));
  for(const precision of [128,256,512,1024]){
    for(const a of [-262144,-131072,-65536,-32768,0,32768,65536,131072,262144])for(const b of [-131072,-98304,-65536,-32768,0,32768,65536,98304,131072])for(const [n,d] of [[0n,1n],[1n,1n],[1n,2n],[1n,3n]]){
      const raw=[65536,a,b,0,0];
      if(clamp(b)===clamp(a+b)){reject(3,raw,n,d,'ConstantIccCurve',precision);continue;}
      const interval=linearPreimageReference({start:[0n,1n],end:[1n,1n],flags:3,a,b},[n,d]);
      check(3,raw,n,d,interval?choiceReference(interval):null,precision);
    }
    reject(4,[65536,0,0,0,32768,65536,0],0n,1n,'UnattainedIccPreimageMaximum',precision);
    check(4,[65536,0,0,0,32768,65536,0],1n,1n,[1n,2n],precision);
    check(4,[65536,0,0,0,32768,65536,0],1n,2n,null,precision);
    check(4,[65536,0,0,65536,32768,65536,0],3n,5n,null,precision);
    check(4,[65536,0,0,0,65536,65536,0],1n,1n,[1n,1n],precision);
    reject(3,[131072,131072,-65536,0,0],0n,1n,'NonMonotonicIccCurve',precision);
    reject(4,[131072,131072,-65536,0,0,65536,0],1n,1n,'ConstantIccCurve',precision);
    check(0,[131072],1n,4n,[1n,2n],precision);
    check(1,[65536,65536,-32768],0n,1n,[1n,2n],precision);
    check(1,[65536,65536,-32768],1n,1n,null,precision);
    check(2,[65536,65536,-32768,16384],1n,4n,[1n,2n],precision);
    check(2,[65536,65536,-32768,16384],1n,2n,[3n,4n],precision);
    check(2,[65536,65536,-32768,16384],3n,4n,[1n,1n],precision);
    check(2,[65536,-65536,32768,32768],1n,2n,[1n,2n],precision);
  }
  const max=(1n<<128n)-1n,n=65537n*65537n<<64n;
  assert.deepEqual(call(202,preimageInput(3,[131072,65537,0,0,1],n,max,128)),Buffer.from([1,0,0,0]));undecided++;
  check(3,[65536,65536,0,65537,65537],max/2n,max,[65536n*(max/2n),65537n*max]);
  const good=preimageInput(0,[65536],1n,3n);
  for(let len=0;len<good.length;len++){assert.throws(()=>call(202,good.subarray(0,len)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  for(const [b,l,e] of [[good,good.length-1,/LimitExceeded/],[Buffer.concat([good,Buffer.alloc(1)]),undefined,/InvalidIcc/],[preimageInput(0,[65536],1n,3n,64),undefined,/InvalidIccComparisonPrecision/]]){assert.throws(()=>call(202,b,l),e);rejected++;}
  reject(0,[0],1n,0n,'InvalidIccCurveCoordinate');reject(0,[0],2n,1n,'InvalidIccCurveCoordinate');reject(0,[0],1n,1n,'UndefinedIccCurvePower');
  check(0,[65536],1n,3n,[1n,3n]);return {selected,missing,rejected,undecided};
}
