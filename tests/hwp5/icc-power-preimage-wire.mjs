import assert from 'node:assert/strict';
import {boundary} from './icc-power-clip-wire.mjs';
import {readWide} from './icc-wide-fraction-wire.mjs';
export function decode(out,rootWidth=32){
  assert.ok(rootWidth===32||rootWidth===128);const stride=16+2*rootWidth;
  const status=out.readUInt32LE(),count=out.readUInt32LE(4),points=out.readUInt32LE(8);
  assert.ok(status<=2&&count<=6&&points<=2);
  if(status!==2){assert.equal(count+points,0);assert.equal(out.length,12);return {status};}
  assert.equal(out.length,68+count*68+points*stride);assert.equal(out.readUInt32LE(12),1);assert.equal(out.readUInt32LE(48),3);
  const start=[out.readBigUInt64LE(16),out.readBigUInt64LE(24)],end=[out.readBigUInt64LE(32),out.readBigUInt64LE(40)];
  assert.ok(start[1]>0n&&end[1]>0n&&start[0]<=start[1]&&end[0]<=end[1]);
  const [a,b,g,offset]=[52,56,60,64].map(at=>BigInt(out.readInt32LE(at)));
  const intervals=[];for(let i=0;i<count;i++){const at=68+i*68,flags=out.readUInt32LE(at+64);assert.ok(flags<=3);intervals.push({start:boundary(out,at),end:boundary(out,at+32),flags});}
  const roots=[];for(let i=0;i<points;i++){
    const at=68+count*68+i*stride,location=out.readUInt32LE(at),s=out.readInt32LE(at+4),n=readWide(out,at+8,rootWidth),d=readWide(out,at+8+rootWidth,rootWidth),p=out.readInt32LE(at+8+2*rootWidth),q=out.readUInt32LE(at+12+2*rootWidth);
    assert.ok([1,2,3,4].includes(location)&&[-1,0,1].includes(s));
    if(s===0)assert.deepEqual(out.subarray(at+4,at+stride),Buffer.alloc(stride-4));else assert.ok(n>0n&&d>0n&&Math.abs(p)===65536&&q>0&&q<=2147483648);
    roots.push({location,s,n,d,p,q});
  }
  return {status,source:{start,end,a,b,g,offset},intervals,roots};
}
