import assert from 'node:assert/strict';
export function mlucInput(payload,name='desc',maxRecords=100000){const b=Buffer.alloc(8+payload.length);b.write(name);b.writeUInt32BE(maxRecords,4);payload.copy(b,8);return b;}
export function mlucFixture(count=2,stride=12,gap=0){const base=16+count*stride+gap,b=Buffer.alloc(base+8);b.write('mluc');b.writeUInt32BE(count,8);b.writeUInt32BE(stride,12);for(let i=0;i<count;i++){const o=16+i*stride;b.write(i%2?'koKR':'enUS',o);b.writeUInt32BE(4,o+4);b.writeUInt32BE(base+(i%2)*2,o+8);b.fill(0xa5,o+12,o+stride);}b.set([0,65,0xd8,0,0xdc,0,0,0],base);return b;}
export function mlucReference(payload,name='desc'){
  const count=payload.readUInt32BE(8),stride=payload.readUInt32BE(12),out=Buffer.alloc(20+16*count);out.writeUInt32LE(1);out.writeUInt32LE(name==='desc'?0:1,4);out.writeUInt32LE(count,8);out.writeUInt32LE(stride,12);out.writeUInt32LE(stride===12?3:7,16);
  for(let i=0;i<count;i++){const o=16+i*stride,p=20+i*16;payload.copy(out,p,o,o+4);out.writeUInt32LE(payload.readUInt32BE(o+4),p+4);out.writeUInt32LE(payload.readUInt32BE(o+8),p+8);out.writeUInt32LE(stride-12,p+12);}return out;
}
export function iccMlucEdges(call){let comparisons=0,rejected=0;
 function check(p,name='desc'){assert.deepEqual(call(164,mlucInput(p,name)),mlucReference(p,name));comparisons++;}
 function reject(b,pattern,limit=b.length){assert.throws(()=>call(164,b,limit),pattern);rejected++;}
 for(const n of [0,1,2,3,17,256])for(const stride of [12,13,16,32])for(const gap of [0,1,3])for(const name of ['desc','cprt'])check(mlucFixture(n,stride,gap),name);
 const emptyString=mlucFixture(1);emptyString.writeUInt32BE(0,20);emptyString.writeUInt32BE(emptyString.length,24);check(emptyString);
 const emptyFuture=mlucFixture(0);emptyFuture.writeUInt32BE(0xffffffff,12);check(emptyFuture);
 const p=mlucFixture(),good=mlucInput(p);
 // Last two storage bytes are unreferenced; only truncate through referenced end.
 for(let n=0;n<good.length-2;n++)reject(good.subarray(0,n),/InvalidProbeInput|InvalidIcc/);
 for(const stride of [0,1,11,0xffffffff]){const bad=Buffer.from(good);bad.writeUInt32BE(stride,20);reject(bad,/InvalidIccMlucRecordSize|InvalidIccMlucSize/);}
 for(const count of [100001,0xffffffff]){const bad=Buffer.from(good);bad.writeUInt32BE(count,16);reject(bad,/LimitExceeded/);}
 for(const offset of [0,16,39,p.length-1,p.length,0xffffffff]){const bad=Buffer.from(good);bad.writeUInt32BE(offset,32);reject(bad,/InvalidIccMlucString/);}
 for(const length of [1,3,0xfffffffe,0xffffffff]){const bad=Buffer.from(good);bad.writeUInt32BE(length,28);reject(bad,/InvalidIccMlucString/);}
 for(let pos=8;pos<16;pos++)for(let bit=0;bit<8;bit++){const bad=Buffer.from(good);bad[pos]^=1<<bit;reject(bad,pos<12?/InvalidIccMlucType/:/InvalidIccTagReserved/);}
 reject(mlucInput(p,'desc',1),/LimitExceeded/);reject(good,/LimitExceeded/,good.length-1);
 const largeOutput=mlucInput(mlucFixture(17));reject(largeOutput,/LimitExceeded/,largeOutput.length);
 assert.throws(()=>call(165,good),/UnsupportedIccLocalizedEdition/);rejected++;
 assert.deepEqual(call(164,mlucInput(Buffer.alloc(0),'zzzz')),Buffer.alloc(20));comparisons++;
 check(p);return {comparisons,rejected};
}
