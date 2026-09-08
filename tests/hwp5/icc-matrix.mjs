import assert from 'node:assert/strict';
import {forwardReference,inverseReference,checkVector} from './icc-matrix-reference.mjs';
export function matrixInput(matrix,xyz){const b=Buffer.alloc(48);[...matrix,...xyz].forEach((v,i)=>b.writeInt32BE(v,i*4));return b;}
export function matrixEdges(call){
  let comparisons=0,rejected=0;
  function check(matrix,xyz){const b=matrixInput(matrix,xyz);checkVector(call(173,b),forwardReference(matrix,xyz));comparisons++;
    const inverse=inverseReference(matrix,xyz);if(inverse){checkVector(call(174,b),inverse);comparisons++;}else{assert.throws(()=>call(174,b),/InvalidIccAdaptationSingular/);rejected++;}
  }
  for(let variant=0;variant<3**9;variant++){let v=variant;const matrix=Array.from({length:9},()=>{const x=v%3-1;v=Math.floor(v/3);return x;});check(matrix,[2,-3,5]);}
  let seed=0x58495a;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed|0;};
  for(let i=0;i<2048;i++)check(Array.from({length:9},next),Array.from({length:3},next));
  for(let variant=0;variant<512;variant++)check(Array.from({length:9},(_,i)=>variant&(1<<i)?2147483647:-2147483648),[-2147483648,2147483647,-1]);
  check([2147483647,2147483646,0,2147483646,2147483645,0,0,0,1],[1,0,0]);
  const identity=[65536,0,0,0,65536,0,0,0,65536],good=matrixInput(identity,[65536,-32768,131072]);
  for(const mode of [173,174]){
    for(let n=0;n<48;n++){assert.throws(()=>call(mode,good.subarray(0,n)),/InvalidProbeInput/);rejected++;}
    assert.throws(()=>call(mode,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
    assert.throws(()=>call(mode,good,47),/LimitExceeded/);rejected++;
  }
  check(identity,[65536,-32768,131072]);return {comparisons,rejected};
}
