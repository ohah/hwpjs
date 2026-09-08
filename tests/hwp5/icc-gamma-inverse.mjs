import assert from 'node:assert/strict';
import {gammaInput} from './icc-analytic.mjs';
export function gammaInverseEdges(call){
  let comparisons=0,rejected=0;
  function check(g,y,expected=y**(256/g),exact=false){
    const out=call(178,gammaInput(g,y));assert.equal(out.length,8);
    const actual=out.readDoubleLE();assert.ok(Number.isFinite(actual)&&actual>=0&&actual<=1);
    if(exact)assert.equal(actual,expected);
    else assert.ok(Math.abs(actual-expected)<=Math.abs(expected)*2e-12+8*Number.MIN_VALUE,`g=${g}, y=${y}: ${actual} != ${expected}`);
    comparisons++;return actual;
  }
  function reject(b,pattern,limit=b.length){assert.throws(()=>call(178,b,limit),pattern);rejected++;}
  for(let g=1;g<=65535;g++)for(const y of [0,Number.MIN_VALUE,2**-1022,2**-1000,0.25,0.5,1-2**-53,1])check(g,y);
  for(const y of [0,Number.MIN_VALUE,2**-1022,0.5,1-2**-53,1])check(256,y,y,true);
  // Binary powers have an algebraic expectation, independent of Math.pow's roots.
  for(const g of [1,2,4,8,16,32,64,128,256,512,1024,2048,32768])for(let k=1;k<=1074;k++){
    const exponent=k*256/g;if(!Number.isInteger(exponent))continue;
    check(g,2**-k,exponent<=1074?2**-exponent:0);
  }
  for(const y of [0,Number.MIN_VALUE,0.5,1])reject(gammaInput(0,y),/NonInvertibleIccGamma/);
  for(const g of [0,1,256,65535])for(const y of [NaN,Infinity,-Infinity,-Number.MIN_VALUE,1+2**-52])reject(gammaInput(g,y),/InvalidIccCurveCoordinate/);
  const good=gammaInput(512,0.25);
  for(let n=0;n<good.length;n++)reject(good.subarray(0,n),/InvalidProbeInput|InvalidIcc/);
  reject(good,/LimitExceeded/,good.length-1);
  for(const count of [0,2]){
    const b=Buffer.alloc(20+2*count);b.writeDoubleBE(0.5);b.write('curv',8);b.writeUInt32BE(count,16);
    reject(b,/InvalidIccGammaCurve/);
  }
  check(512,0.25,0.5,true);
  return {comparisons,rejected};
}
