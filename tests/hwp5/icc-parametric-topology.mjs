import assert from 'node:assert/strict';
import {paraInput} from './icc-analytic.mjs';
// Evidence fixtures, not a classifier or an inverse implementation.
export function parametricTopologyEdges(call){
 let comparisons=0,domains=0;
 const xs=[0,.25,.5-2**-54,.5,.75,1];
 const cases=[
  [[131072,131072,-65536,0,0,0,0],[1,.25,2**-106,0,.25,1]],
  [[131072,131072,-65536,0,0,65536,0],[1,1,1,1,1,1]],
  [[131072,131072,-65536,0,0,-65536,0],[0,0,0,0,0,0]],
  [[65536,65536,0,131072,32768,0,0],[0,.5,1-2**-53,.5,.75,1]],
  [[65536,0,0,0,32768,65536,0],[0,0,0,1,1,1]],
  [[65536,0,0,65536,32768,65536,0],[0,.25,.5-2**-54,1,1,1]],
 ];
 for(const [raw,expected] of cases){
  assert.equal(call(179,paraInput(4,raw,0).subarray(8)).length,32);domains++;
  xs.forEach((x,i)=>{const out=call(160,paraInput(4,raw,x));assert.equal(out.length,8);assert.equal(out.readDoubleLE(),expected[i]);comparisons++;});
 }
 // Observed system-profile coefficients, interpreted with ICC.1:2022 Table 68.
 // These are not normative colour-space constants or profile validity verdicts.
 const observed=[
  [[157286,62119,3417,5072,2651],8.492809088738593e-7],
  [[145636,59616,5920,14564,5308],2.734386123070731e-7],
  [[145636,59632,5904,14564,5308],-5.439968220691808e-5],
  [[117965,65536,0,4096,128],-1.087870179742783e-4],
 ];
 for(const [raw,jump] of observed){
  assert.equal(call(179,paraInput(3,raw,0).subarray(8)).length,32);domains++;
  const d=raw[4]/65536,bits=Buffer.alloc(8);bits.writeDoubleBE(d);bits.writeBigUInt64BE(bits.readBigUInt64BE()-1n);
  const left=call(160,paraInput(3,raw,bits.readDoubleBE())).readDoubleLE(),right=call(160,paraInput(3,raw,d)).readDoubleLE();
  assert.ok(Number.isFinite(left)&&Number.isFinite(right));assert.equal(Math.sign(right-left),Math.sign(jump));
  assert.ok(Math.abs(right-left-jump)<1e-12);comparisons+=2;
 }
 return {cases:cases.length+observed.length,comparisons,domains};
}
