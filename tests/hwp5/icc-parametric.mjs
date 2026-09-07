import assert from 'node:assert/strict';
const counts = [1,3,4,5,7];
export function iccParametricEdges(call) {
  let comparisons=0,rejected=0;
  function input(kind,values){const b=Buffer.alloc(12+values.length*4);b.write('para');b.writeUInt16BE(kind,8);values.forEach((v,i)=>b.writeInt32BE(v,12+i*4));return b;}
  function reject(b,pattern,limit=b.length){assert.throws(()=>call(154,b,limit),pattern);rejected++;}
  function check(kind,values){const b=input(kind,values),expected=Buffer.alloc(4+values.length*4);expected.writeUInt32LE(kind);values.forEach((v,i)=>expected.writeInt32LE(v,4+i*4));assert.deepEqual(call(154,b,b.length),expected);comparisons++;return b;}
  for(let kind=0;kind<5;kind++){
    const count=counts[kind];
    for(let position=0;position<count;position++)for(const value of [-2147483648,-65536,-1,0,1,65536,2147483647]){const values=Array.from({length:count},(_,i)=>i*731-100);values[position]=value;check(kind,values);}
    const b=input(kind,Array(count).fill(0));
    for(let size=0;size<=41;size++){if(size===b.length)continue;const bad=Buffer.alloc(41);b.copy(bad);reject(bad.subarray(0,size),/InvalidIccTagDataSize|InvalidIccParametricSize/);}
    for(const i of [0,1,2,3,4,5,6,7,10,11])for(let bit=0;bit<8;bit++){const bad=Buffer.from(b);bad[i]^=1<<bit;reject(bad,i<4?/InvalidIccParametricType/:i<8?/InvalidIccTagReserved/:/InvalidIccParametricReserved/);}
    reject(b,/LimitExceeded/,b.length-1);
  }
  for(let kind=5;kind<65536;kind++)reject(input(kind,[0]),/UnsupportedIccParametricFunction/);
  check(4,[0,1,-1,65536,-65536,2147483647,-2147483648]);
  return {comparisons,rejected};
}
