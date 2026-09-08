import assert from 'node:assert/strict';
import {parametricReference} from './icc-analytic.mjs';
import {modelProfile} from './icc-model.mjs';
import {pointEntries,pointInput} from './icc-model-forward.mjs';
const coefficients=[65536,-32768,16384,8192,131072,-65536,-65536,0,196608];
function profile(fn,values,channel,matrix=coefficients){
  const entries=pointEntries(matrix,[0,0,0]),b=Buffer.alloc(12+values.length*4);b.write('para');b.writeUInt16BE(fn,8);values.forEach((v,i)=>b.writeInt32BE(v,12+i*4));entries[3+channel][1]=b;return modelProfile(entries);
}
export function modelParametricEdges(call){let comparisons=0,rejected=0;
  const curves=[[65536],[131072,65536,-32768],[131072,65536,-32768,16384],[157286,69140,3604,5072,2651],[131072,65536,-16384,32768,32768,8192,-4096]];
  function check(fn,values,channel,n,d,p){
    const input=[[1n,3n],[2n,3n],[4n,7n]];input[channel]=[BigInt(n),BigInt(d)];const out=call(176,pointInput(p,input));
    assert.equal(out.length,140);assert.equal(out.readUInt32LE(),1);assert.equal(out.readUInt32LE(4),1);assert.equal(out.readUInt32LE(8),1);
    const linear=input.map(([a,b])=>Number(a)/Number(b));linear[channel]=parametricReference(fn,values,Number(n)/Number(d));
    for(let row=0;row<3;row++){const expected=coefficients.slice(row*3,row*3+3).reduce((sum,c,i)=>sum+c/65536*linear[i],0),actual=out.readDoubleLE(12+8*row);assert.ok(Number.isFinite(actual));assert.ok(Math.abs(actual-expected)<=2e-12*(1+Math.abs(expected)));}assert.ok(out.subarray(36).every(b=>b===0));comparisons++;
  }
  curves.forEach((values,fn)=>{for(let channel=0;channel<3;channel++){
    const p=profile(fn,values,channel);for(let n=0;n<=1024;n++)check(fn,values,channel,n,1024,p);
    if(fn>0){const threshold=fn<=2?32768:values[4];for(const delta of [-1,0,1])check(fn,values,channel,threshold+delta,65536,p);}
  }});
  for(let channel=0;channel<3;channel++)for(const [fn,values,n,d,error] of [[0,[0],0n,1n,/UndefinedIccCurvePower/],[1,[65536,0,0],1n,2n,/UndefinedIccCurveThreshold/],[3,[32768,65536,-65536,65536,32768],1n,2n,/UndefinedIccCurvePower/]]){
    const input=[[1n,2n],[1n,2n],[1n,2n]];input[channel]=[n,d];assert.throws(()=>call(176,pointInput(profile(fn,values,channel),input)),error);rejected++;
    assert.throws(()=>call(176,pointInput(profile(fn,values,channel,Array(9).fill(0)),input)),error);rejected++;
  }
  check(0,curves[0],0,1,2,profile(0,curves[0],0));return {comparisons,rejected};
}
