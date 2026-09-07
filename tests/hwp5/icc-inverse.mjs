import assert from 'node:assert/strict';
// Independent preimage construction: intersect every line segment with the target ordinate.
export function inverseReference(values,y) {
  if(values.length<2)throw Error('InvalidIccInverseSamples');
  const sorted=[...values].sort((a,b)=>a-b);
  if(sorted[0]===sorted.at(-1))throw Error('ConstantIccCurve');
  if(!values.every((v,i)=>v===sorted[i])&&!values.every((v,i)=>v===sorted[sorted.length-1-i]))throw Error('NonMonotonicIccCurve');
  const target=Math.max(sorted[0],Math.min(sorted.at(-1),y)),candidates=[];
  for(let i=0;i<values.length-1;i++){
    const a=values[i],b=values[i+1];
    if(a===b){if(target===a)candidates.push([BigInt(i),1n],[BigInt(i+1),1n]);continue;}
    const delta=BigInt(b-a),distance=BigInt(target-a);
    if(target>=Math.min(a,b)&&target<=Math.max(a,b)){
      const sign=delta<0n?-1n:1n;candidates.push([(BigInt(i)*delta+distance)*sign,delta*sign]);
    }
  }
  assert.ok(candidates.length);
  candidates.sort((a,b)=>a[0]*b[1]<b[0]*a[1]?-1:a[0]*b[1]>b[0]*a[1]?1:0);
  const last=candidates.at(-1),end=BigInt(values.length-1),choice=last[0]===end*last[1]?candidates[0]:last;
  return [choice[0],choice[1]*end];
}
export function inverseInput(values,y){const b=Buffer.alloc(14+values.length*2);b.writeUInt16BE(y);b.write('curv',2);b.writeUInt32BE(values.length,10);values.forEach((v,i)=>b.writeUInt16BE(v,14+i*2));return b;}
export function iccInverseEdges(call){
  let comparisons=0,rejected=0;
  function check(values,y){const b=inverseInput(values,y);let expected;try{expected=inverseReference(values,y);}catch(error){assert.throws(()=>call(157,b,b.length),new RegExp(error.message));rejected++;return;}
    const result=call(157,b,b.length);assert.equal(result.length,16);const n=result.readBigUInt64LE(0),d=result.readBigUInt64LE(8);assert.ok(d>0n&&n<=d);assert.equal(n*expected[1],expected[0]*d);comparisons++;}
  for(let size=2;size<=6;size++)for(let encoded=0;encoded<3**size;encoded++){let digits=encoded;const values=Array.from({length:size},()=>{const v=[0,32768,65535][digits%3];digits=Math.floor(digits/3);return v;});for(const y of [0,1,32767,32768,32769,65534,65535])check(values,y);}
  for(const values of [[100,100,200,200],[200,200,100,100],[100,150,150,200],[200,150,150,100]])for(const y of [0,99,100,101,149,150,151,199,200,201,65535])check(values,y);
  for(const values of [[],[1]])check(values,0);
  const long=Array.from({length:65536},(_,i)=>i);for(const y of [0,1,32768,65534,65535]){check(long,y);check([...long].reverse(),y);}
  const good=inverseInput([0,65535],32768);
  for(let size=0;size<good.length;size++){assert.throws(()=>call(157,good.subarray(0,size),good.length),/InvalidProbeInput|InvalidIccTagDataSize|InvalidIccCurveSize/);rejected++;}
  assert.throws(()=>call(157,good,good.length-1),/LimitExceeded/);rejected++;check([0,65535],32768);
  return {comparisons,rejected};
}
