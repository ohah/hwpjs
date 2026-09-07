import assert from 'node:assert/strict';
export function iccTrcEdges(call) {
  let comparisons=0,rejected=0;
  const names=['rTRC','gTRC','bTRC','kTRC'];
  function reject(mode,b,pattern,limit=b.length){assert.throws(()=>call(mode,b,limit),pattern);rejected++;}
  for(const mode of [155,156]) for(const [channel,name] of names.entries()) {
    const cases=[['curv',0,[]],['curv',1,[563]],['curv',3,[65535,1,0]],... [1,3,4,5,7].map((n,i)=>['para',i,Array.from({length:n},(_,j)=>j*65536-1)])];
    for(const [kind,n,values] of cases){
      const width=kind==='curv'?2:4,b=Buffer.alloc(16+width*values.length);b.write(name);b.write(kind,4);
      if(kind==='curv')b.writeUInt32BE(n,12);else b.writeUInt16BE(n,12);
      values.forEach((v,i)=>kind==='curv'?b.writeUInt16BE(v,16+i*2):b.writeInt32BE(v,16+i*4));
      if(mode===155&&kind==='para'){reject(mode,b,/InvalidIccTrcType/);continue;}
      const expected=Buffer.alloc(20+width*values.length);[1,channel,1,kind==='curv'?0:1,kind==='curv'?Math.min(2,n):n].forEach((v,i)=>expected.writeUInt32LE(v,i*4));
      values.forEach((v,i)=>kind==='curv'?expected.writeUInt16LE(v,20+i*2):expected.writeInt32LE(v,20+i*4));
      assert.deepEqual(call(mode,b,b.length),expected);comparisons++;
      reject(mode,b,/LimitExceeded/,b.length-1);
      for(let size=0;size<b.length;size++)reject(mode,b.subarray(0,size),/InvalidProbeInput|InvalidIccTagDataSize|InvalidIccCurveSize|InvalidIccParametricSize/);
      const bad=Buffer.from(b);bad.write('XYZ ',4);reject(mode,bad,/InvalidIccTrcType/);
    }
  }
  for(const mode of [155,156])for(const name of ['RTRC','ktrc','abcd']){assert.deepEqual(call(mode,Buffer.from(name),4),Buffer.alloc(16));comparisons++;}
  return {comparisons,rejected};
}
