import assert from 'node:assert/strict';
export function fixedArray(values) {
  const b=Buffer.alloc(8+4*values.length);b.write('sf32');values.forEach((v,i)=>b.writeInt32BE(v,8+4*i));return b;
}
export function adaptationInput(values,edition=0,name='chad') {return Buffer.concat([Buffer.from([edition]),Buffer.from(name),fixedArray(values)]);}
// Leibniz permutation sum, independent of the product's cofactor expansion.
export function determinant(values) {
  let sum=0n;
  for(let a=0;a<3;a++)for(let b=0;b<3;b++)for(let c=0;c<3;c++){
    if(a===b||a===c||b===c)continue;
    const inversions=Number(a>b)+Number(a>c)+Number(b>c);
    const product=BigInt(values[a])*BigInt(values[3+b])*BigInt(values[6+c]);
    sum+=inversions%2?-product:product;
  }
  return sum;
}
export function adaptationReference(values) {
  const out=Buffer.alloc(60);out.writeUInt32LE(1);values.forEach((v,i)=>out.writeInt32LE(v,4+4*i));out.writeUInt32LE(1,40);
  let bits=BigInt.asUintN(128,determinant(values));for(let i=44;i<60;i++){out[i]=Number(bits&255n);bits>>=8n;}return out;
}
export function adaptationEdges(call) {
  let comparisons=0,rejected=0;
  function check(values){
    const raw=Buffer.alloc(values.length*4);values.forEach((v,i)=>raw.writeInt32LE(v,i*4));assert.deepEqual(call(171,fixedArray(values)),raw);comparisons++;
    if(values.length!==9)return;
    if(determinant(values)===0n){assert.throws(()=>call(172,adaptationInput(values)),/InvalidIccAdaptationSingular/);rejected++;}
    else{assert.deepEqual(call(172,adaptationInput(values)),adaptationReference(values));comparisons++;}
  }
  for(let variant=0;variant<3**9;variant++){
    let v=variant;check(Array.from({length:9},()=>{const n=v%3-1;v=Math.floor(v/3);return n;}));
  }
  let seed=0x43484144;
  // Large products cancel to -1; a floating determinant can lose this residue.
  check([2147483647,2147483646,0,2147483646,2147483645,0,0,0,1]);
  for(let n=0;n<2048;n++)check(Array.from({length:9},()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed|0;}));
  for(const value of [-2147483648,-1,0,1,2147483647])for(let index=0;index<9;index++){
    const values=[65536,0,0,0,65536,0,0,0,65536];values[index]=value;check(values);
  }
  for(let n=0;n<=12;n++){check(Array(n).fill(0));if(n!==9){assert.throws(()=>call(172,adaptationInput(Array(n).fill(0))),/InvalidIccAdaptationCount/);rejected++;}}
  const identity=[65536,0,0,0,65536,0,0,0,65536],good=adaptationInput(identity);
  for(let n=0;n<good.length;n++){assert.throws(()=>call(172,good.subarray(0,n)),/InvalidProbeInput|InvalidIcc/);rejected++;}
  for(let i=0;i<8;i++){const bad=Buffer.from(good);bad[5+i]^=1;assert.throws(()=>call(172,bad),/InvalidIcc/);rejected++;}
  assert.throws(()=>call(172,adaptationInput(identity,1)),/UnsupportedIccAdaptationEdition/);rejected++;
  assert.throws(()=>call(172,adaptationInput(identity,2)),/InvalidProbeInput/);rejected++;
  assert.throws(()=>call(172,good,good.length-1),/LimitExceeded/);rejected++;
  assert.deepEqual(call(172,Buffer.from([1,122,122,122,122])),Buffer.alloc(60));comparisons++;
  check(identity);return {comparisons,rejected};
}
