import assert from 'node:assert/strict';
import {inverseInput} from './icc-inverse.mjs';
const maxDen=((1n<<64n)-1n)/65535n;
export function forwardInput(values,n,d){const b=Buffer.alloc(28+values.length*2);b.writeBigUInt64BE(n,0);b.writeBigUInt64BE(d,8);b.write('curv',16);b.writeUInt32BE(values.length,24);values.forEach((v,i)=>b.writeUInt16BE(v,28+i*2));return b;}
// Locate a segment by comparing rational coordinates, then use slope/intercept form.
export function forwardReference(values,n,d){
  assert.ok(values.length>=2&&d>0n&&n>=0n&&n<=d);
  const intervals=BigInt(values.length-1);
  for(let i=0;i<values.length-1;i++)if(BigInt(i)*d<=n*intervals&&n*intervals<=BigInt(i+1)*d){
    return [BigInt(values[i])*d+BigInt(values[i+1]-values[i])*(n*intervals-BigInt(i)*d),d*65535n];
  }
  throw Error('NoSegment');
}
export function iccForwardEdges(call){
  let comparisons=0,rejected=0,roundTrips=0;
  function check(values,n,d){const expected=forwardReference(values,n,d),b=forwardInput(values,n,d),out=call(158,b,b.length);assert.equal(out.length,16);const a=out.readBigUInt64LE(0),z=out.readBigUInt64LE(8);assert.ok(z>0n&&a<=z);assert.equal(a*expected[1],expected[0]*z);comparisons++;}
  for(let size=2;size<=6;size++)for(let code=0;code<3**size;code++){let digits=code;const values=Array.from({length:size},()=>{const v=[0,32768,65535][digits%3];digits=Math.floor(digits/3);return v;});for(const [n,d] of [[0n,1n],[1n,1n],[1n,2n],[1n,3n],[2n,3n],[1n,65535n],[65534n,65535n]])check(values,n,d);}
  for(const values of [[0,65535],[65535,0],[65535,65535],[0,65535,0],Array.from({length:65538},(_,i)=>i%65536)])for(const n of [0n,1n,maxDen/2n,maxDen-1n,maxDen])check(values,n,maxDen);
  for(const values of [[0,65535],[65535,0],[100,100,200,200],[200,200,100,100]])for(const y of [0,1,99,100,101,150,199,200,201,65535]){
    const inverse=call(157,inverseInput(values,y)),n=inverse.readBigUInt64LE(0),d=inverse.readBigUInt64LE(8);check(values,n,d);
    const result=call(158,forwardInput(values,n,d));const expected=Math.max(Math.min(...values),Math.min(Math.max(...values),y));assert.equal(result.readBigUInt64LE(0)*65535n,BigInt(expected)*result.readBigUInt64LE(8));roundTrips++;
  }
  function reject(b,pattern,limit=b.length){assert.throws(()=>call(158,b,limit),pattern);rejected++;}
  for(const [n,d,pattern] of [[0n,0n,/InvalidIccCurveCoordinate/],[2n,1n,/InvalidIccCurveCoordinate/],[1n,maxDen+1n,/IccFractionLimitExceeded/],[0n,(1n<<64n)-1n,/IccFractionLimitExceeded/]])reject(forwardInput([0,65535],n,d),pattern);
  for(const values of [[],[1]])reject(forwardInput(values,0n,1n),/InvalidIccCurveSamples/);
  const good=forwardInput([0,65535],1n,2n);for(let size=0;size<good.length;size++)reject(good.subarray(0,size),/InvalidProbeInput|InvalidIccTagDataSize|InvalidIccCurveSize/);
  reject(good,/LimitExceeded/,good.length-1);check([0,65535],1n,2n);
  return {comparisons,rejected,roundTrips};
}
