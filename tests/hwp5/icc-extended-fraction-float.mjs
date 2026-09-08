import assert from 'node:assert/strict';
import {writeUnsigned} from './icc-wide-fraction-wire.mjs';
function input(bits,n,d){const w=bits/8,b=Buffer.alloc(4+2*w);b.writeUInt32BE(bits);writeUnsigned(b,4,n,w);writeUnsigned(b,4+w,d,w);return b;}
export function extendedFractionFloatEdges(call){
  let comparisons=0,rejected=0;
  function check(bits,n,d){
    const out=call(227,input(bits,n,d));assert.equal(out.length,8);const v=out.readDoubleLE();assert.ok(Number.isFinite(v)&&v>=0&&v<=1);
    if(n===0n)assert.equal(v,0);else{
      assert.ok(v>0);const raw=out.readBigUInt64LE(),e=Number((raw>>52n)&2047n),mantissa=(raw&((1n<<52n)-1n))+(e?1n<<52n:0n),shift=(e||1)-1023-52;
      const vn=shift>=0?mantissa<<BigInt(shift):mantissa,vd=shift<0?1n<<BigInt(-shift):1n;
      const delta=vn*d-n*vd;assert.ok((delta<0n?-delta:delta)*(1n<<48n)<=n*vd,'lossy conversion relative error');
    }comparisons++;
  }
  let seed=0x464c4f41;
  for(const bits of [256,512,1024]){
    const max=(1n<<BigInt(bits))-1n;
    for(const [n,d] of [[0n,max],[1n,max],[max/2n,max],[max-1n,max],[max,max],[1n,3n]])check(bits,n,d);
    const wide=()=>{let n=0n;for(let i=0;i<bits/32;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;n=(n<<32n)|BigInt(seed);}return n;};
    for(let i=0;i<64;i++){const d=wide()||1n;check(bits,wide()%(d+1n),d);}
    const good=input(bits,1n,max);
    for(let len=0;len<good.length;len++){assert.throws(()=>call(227,good.subarray(0,len)),/InvalidProbeInput/);rejected++;}
    assert.throws(()=>call(227,good,good.length-1),/LimitExceeded/);rejected++;
    assert.throws(()=>call(227,Buffer.concat([good,Buffer.alloc(1)])),/InvalidProbeInput/);rejected++;
    for(const [n,d] of [[0n,0n],[2n,1n]]){assert.throws(()=>call(227,input(bits,n,d)),/InvalidIccCurveCoordinate/);rejected++;}
  }
  const badWidth=Buffer.alloc(4);badWidth.writeUInt32BE(64);assert.throws(()=>call(227,badWidth),/InvalidProbeInput/);rejected++;
  check(1024,1n,3n);
  return {comparisons,rejected};
}
