import assert from 'node:assert/strict';
export function boundary(out,at){
 const type=out.readUInt32LE(at);
 if(type===0){assert.deepEqual(out.subarray(at+20,at+32),Buffer.alloc(12));const x=[out.readBigUInt64LE(at+4),out.readBigUInt64LE(at+12)];assert.ok(x[1]>0n&&x[0]<=x[1]);return {x};}
 assert.equal(type,1);const level=out.readUInt32LE(at+4),s=out.readInt32LE(at+8),n=out.readBigUInt64LE(at+12),p=out.readInt32LE(at+20),q=out.readUInt32LE(at+24);assert.ok(level<=1&&[-1,0,1].includes(s));assert.deepEqual(out.subarray(at+28,at+32),Buffer.alloc(4));return {level,s,n,p,q};
}
export function decode(out){
 const status=out.readUInt32LE(),count=out.readUInt32LE(4);assert.ok(status<=2);
 if(status!==2){assert.equal(count,0);assert.equal(out.length,8);return {status};}
 assert.ok(count>0&&count<=6);assert.equal(out.length,64+76*count);assert.equal(out.readUInt32LE(8),1);assert.equal(out.readUInt32LE(44),3);
 const start=[out.readBigUInt64LE(12),out.readBigUInt64LE(20)],end=[out.readBigUInt64LE(28),out.readBigUInt64LE(36)];
 const [a,b,g,offset]=[48,52,56,60].map(at=>BigInt(out.readInt32LE(at)));
 const pieces=[];for(let i=0;i<count;i++){const at=64+76*i,start=boundary(out,at),end=boundary(out,at+32),flags=out.readUInt32LE(at+64),kind=out.readUInt32LE(at+68),direction=out.readUInt32LE(at+72);assert.ok(flags<=3&&kind<=2&&direction<=2);pieces.push({start,end,flags,kind,direction});}
 return {status,source:{start,end,a,b,g,offset},pieces};
}
